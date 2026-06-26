import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordTtsPlay } from '@/lib/usage-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ---- Neural TTS (the default for Kuku Yalanji) -------------------------------
// For these languages we synthesize with the local MMS-TTS Pitjantjatjara service
// (a real Aboriginal Pama-Nyungan voice + a Patz-grounded orthography bridge),
// STORE every generation (box FS + tts_generations provenance row), and serve it.
// Anything not neural-supported, or any service error, falls back to the Google
// donor below — so pronunciation never breaks.
const NEURAL_LANGS = new Set(['kuku_yalanji', 'zku']);
const NEURAL_MODEL = 'facebook/mms-tts-pjt';
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://127.0.0.1:7820';
const TTS_DIR = process.env.MOBTRANSLATE_TTS_DIR || '/mnt/donto-data/mobtranslate-storage/tts';

async function neuralTts(text: string, lang: string): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    // Already generated? Serve the stored copy (synthesize once, serve forever).
    const found: any = await db.execute(
      sql`select storage_path, format from public.tts_generations
          where language_code = ${lang} and text = ${text} and model = ${NEURAL_MODEL} limit 1`,
    );
    const row = (Array.isArray(found) ? found : found?.rows ?? [])[0];
    if (row?.storage_path) {
      const buf = await fs.readFile(path.join(TTS_DIR, row.storage_path)).catch(() => null);
      if (buf) return { buf, contentType: row.format === 'wav' ? 'audio/wav' : 'audio/mpeg' };
    }

    // Synthesize via the local service.
    const res = await fetch(`${TTS_SERVICE_URL}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, lang, format: 'mp3' }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'audio/mpeg';
    const fmt = contentType.includes('mpeg') ? 'mp3' : 'wav';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;

    // Persist: box FS + provenance row (idempotent).
    const sha = createHash('sha256').update(`${NEURAL_MODEL}|${text}`).digest('hex');
    const rel = `${lang}/${sha}.${fmt}`;
    const abs = path.join(TTS_DIR, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
    const mapped = res.headers.get('x-tts-mapped');
    const durationMs = parseInt(res.headers.get('x-tts-duration-ms') || '', 10) || null;
    await db.execute(sql`
      insert into public.tts_generations
        (language_code, text, normalized_input, model, engine, storage_path, format, duration_ms, sample_rate, seed, byte_size)
      values (${lang}, ${text}, ${mapped}, ${NEURAL_MODEL}, 'mms-tts', ${rel}, ${fmt}, ${durationMs}, 16000, 1234, ${buf.length})
      on conflict (language_code, text, model) do nothing
    `);
    return { buf, contentType };
  } catch (err) {
    console.error('neural TTS error (falling back to donor):', err);
    return null;
  }
}

/**
 * Per-language DONOR voice. We don't have native models; instead we read the
 * Indigenous spelling with a phonetically-close language's voice. Kuku Yalanji
 * uses Indonesian (shared 5-vowel system, unaspirated stops, syllable-timed
 * rhythm, ny/ng/j/y digraphs) — a far better approximation than English.
 *
 * This is a PHONETIC APPROXIMATION, never a recording of a speaker — the UI must
 * always flag synthesized audio as needing community verification. Other
 * languages fall back to Indonesian and need their own donor evaluation.
 *
 * `tl` is the Google TTS language code for the donor voice.
 */
const DONOR_TL: Record<string, string> = {
  kuku_yalanji: 'id',
  zku: 'id',
  wbv: 'id',
  wajarri: 'id',
  anindilyakwa: 'id',
  aoi: 'id',
  migmaq: 'id',
  mic: 'id',
};
const DEFAULT_TL = 'id';

const MAX_TEXT_LENGTH = 600;
const CHUNK_LIMIT = 180; // Google translate_tts caps each request near ~200 chars.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function resolveTl(lang: string | null): string {
  if (!lang) return DEFAULT_TL;
  return DONOR_TL[lang.toLowerCase()] ?? DEFAULT_TL;
}

/** Split text into <=CHUNK_LIMIT pieces, preferring word boundaries. */
function chunk(text: string): string[] {
  if (text.length <= CHUNK_LIMIT) return [text];
  const out: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if ((current + ' ' + word).trim().length > CHUNK_LIMIT) {
      if (current) out.push(current.trim());
      // A single oversized token: hard-split it.
      if (word.length > CHUNK_LIMIT) {
        for (let i = 0; i < word.length; i += CHUNK_LIMIT) out.push(word.slice(i, i + CHUNK_LIMIT));
        current = '';
      } else {
        current = word;
      }
    } else {
      current = (current ? current + ' ' : '') + word;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

async function fetchChunkOnce(text: string, tl: string, idx: number, total: number): Promise<Buffer> {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob' +
    `&tl=${encodeURIComponent(tl)}` +
    `&total=${total}&idx=${idx}` +
    `&textlen=${text.length}` +
    `&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://translate.google.com/' },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`TTS upstream ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('audio')) throw new Error(`TTS upstream returned ${ct || 'non-audio'}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Retry transient network blips (e.g. undici "fetch failed") a couple of times. */
async function fetchChunk(text: string, tl: string, idx: number, total: number): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchChunkOnce(text, tl, idx, total);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function synthesize(text: string, tl: string): Promise<Buffer> {
  const parts = chunk(text);
  const buffers: Buffer[] = [];
  // Sequential to respect the per-IP rate of the endpoint and keep idx ordering.
  for (let i = 0; i < parts.length; i++) {
    buffers.push(await fetchChunk(parts[i], tl, i, parts.length));
  }
  return Buffer.concat(buffers); // MP3 frames concatenate cleanly for playback.
}

async function handle(text: string | null, lang: string | null) {
  const clean = (text ?? '').trim();
  if (!clean) return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  if (clean.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text too long (max ${MAX_TEXT_LENGTH} characters)` },
      { status: 413 },
    );
  }

  // Neural voice for supported languages (Kuku Yalanji); donor fallback otherwise.
  if (lang && NEURAL_LANGS.has(lang.toLowerCase())) {
    const neural = await neuralTts(clean, lang.toLowerCase());
    if (neural) {
      // Count this as a play of the stored clip (admin "Explore" voice metrics).
      void recordTtsPlay(lang.toLowerCase(), clean, NEURAL_MODEL);
      return new NextResponse(neural.buf as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': neural.contentType,
          'Content-Length': String(neural.buf.length),
          'X-TTS-Engine': 'mms-tts-pjt',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
    // else: fall through to the donor voice below.
  }

  try {
    const audio = await synthesize(clean, resolveTl(lang));
    if (!audio.length) {
      return NextResponse.json({ error: 'Synthesis returned no audio' }, { status: 502 });
    }
    return new NextResponse(audio as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'X-TTS-Engine': 'google-donor',
        // Deterministic per (text, donor) → cache hard at the browser/CDN.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('TTS error:', err);
    return NextResponse.json(
      { error: 'Pronunciation audio is unavailable right now. Please try again.' },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return handle(searchParams.get('text'), searchParams.get('lang'));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return handle(body?.text ?? null, body?.lang ?? null);
}

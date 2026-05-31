import { NextRequest, NextResponse } from 'next/server';

// Plain HTTPS fetch (no WebSocket) so it runs reliably on Vercel serverless.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

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

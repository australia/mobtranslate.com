import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordTtsPlay } from '@/lib/usage-log';
import { discordTts } from '@/lib/discord';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  ApiBudgetUnavailableError,
  ApiRateLimitError,
  apiGuardResponse,
  enforceTtsProviderBudget,
  enforceTtsRequestLimit,
} from '@/lib/api-rate-limit.server';
import { ttsInputFingerprint } from '@/lib/tts-cache.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ---- Neural TTS (the default for Kuku Yalanji) -------------------------------
// For these languages we synthesize with an experimental local MMS-TTS
// Pitjantjatjara donor model plus an orthographic bridge. This is synthetic and
// is not a Kuku Yalanji speaker recording. We persist each generated clip so a
// cache hit never spends another provider call.
// Anything not neural-supported, or any service error, falls back to the Google
// donor below — so pronunciation never breaks.
const NEURAL_LANGS = new Set(['kuku_yalanji', 'zku', 'anindilyakwa', 'aoi']);
const NEURAL_MODEL = 'facebook/mms-tts-pjt';
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://127.0.0.1:7820';
const TTS_DIR = process.env.MOBTRANSLATE_TTS_DIR || '/mnt/donto-data/mobtranslate-storage/tts';

type CacheState = 'hit' | 'miss' | 'coalesced';

interface StoredAudio {
  buf: Buffer;
  contentType: string;
  format: 'mp3' | 'wav';
  cache: CacheState;
}

interface GeneratedAudio {
  buf: Buffer;
  contentType: string;
  format: 'mp3' | 'wav';
  normalizedInput?: string | null;
  durationMs?: number | null;
  sampleRate?: number | null;
  seed?: number | null;
}

const generationInFlight = new Map<string, Promise<StoredAudio | null>>();

function isApiGuardError(error: unknown): boolean {
  return (
    error instanceof ApiRateLimitError ||
    error instanceof ApiBudgetUnavailableError
  );
}

async function loadStoredAudio(
  languageCode: string,
  text: string,
  model: string,
): Promise<StoredAudio | null> {
  const inputFingerprint = ttsInputFingerprint(languageCode, text, model);
  const found: any = await db.execute(sql`
    select storage_path, format, input_fingerprint
      from public.tts_generations
     where language_code = ${languageCode}
       and model = ${model}
       and (
         input_fingerprint = ${inputFingerprint}
         or (input_fingerprint is null and text = ${text})
       )
     order by (input_fingerprint = ${inputFingerprint}) desc
     limit 1
  `);
  const row = (Array.isArray(found) ? found : found?.rows ?? [])[0];
  if (!row?.storage_path) return null;

  const root = path.resolve(/*turbopackIgnore: true*/ TTS_DIR);
  const absolute = path.resolve(
    /*turbopackIgnore: true*/ root,
    String(row.storage_path),
  );
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    console.error('Refusing TTS cache path outside the configured storage root.');
    return null;
  }

  const buf = await fs.readFile(/*turbopackIgnore: true*/ absolute).catch(() => null);
  if (!buf?.length) return null;
  if (!row.input_fingerprint) {
    void db
      .execute(sql`
        update public.tts_generations
           set input_fingerprint = ${inputFingerprint}
         where language_code = ${languageCode}
           and text = ${text}
           and model = ${model}
           and input_fingerprint is null
      `)
      .catch((error) => console.error('Could not upgrade legacy TTS cache key:', error));
  }
  const format = row.format === 'wav' ? 'wav' : 'mp3';
  return {
    buf,
    format,
    contentType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
    cache: 'hit',
  };
}

async function persistAudio(
  languageCode: string,
  text: string,
  model: string,
  engine: string,
  audio: GeneratedAudio,
): Promise<void> {
  const inputFingerprint = ttsInputFingerprint(languageCode, text, model);
  const relative = `${languageCode}/${inputFingerprint}.${audio.format}`;
  const absolute = path.join(/*turbopackIgnore: true*/ TTS_DIR, relative);
  const temporary = `${absolute}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(absolute), {
    recursive: true,
  });
  await fs.writeFile(/*turbopackIgnore: true*/ temporary, audio.buf);
  await fs.rename(/*turbopackIgnore: true*/ temporary, absolute);

  await db.execute(sql`
    insert into public.tts_generations
      (language_code, text, normalized_input, input_fingerprint, model, engine,
       storage_path, format, duration_ms, sample_rate, seed, byte_size)
    values (
      ${languageCode}, ${text}, ${audio.normalizedInput ?? null},
      ${inputFingerprint}, ${model}, ${engine}, ${relative}, ${audio.format},
      ${audio.durationMs ?? null}, ${audio.sampleRate ?? null},
      ${audio.seed ?? null}, ${audio.buf.length}
    )
    on conflict do nothing
  `);
  await db.execute(sql`
    update public.tts_generations
       set input_fingerprint = ${inputFingerprint},
           normalized_input = ${audio.normalizedInput ?? null},
           engine = ${engine},
           storage_path = ${relative},
           format = ${audio.format},
           duration_ms = ${audio.durationMs ?? null},
           sample_rate = ${audio.sampleRate ?? null},
           seed = ${audio.seed ?? null},
           byte_size = ${audio.buf.length}
     where language_code = ${languageCode}
       and model = ${model}
       and (
         input_fingerprint = ${inputFingerprint}
         or (input_fingerprint is null and text = ${text})
       )
  `);
}

async function cachedSynthesis(
  languageCode: string,
  text: string,
  model: string,
  engine: string,
  beforeSynthesize: () => Promise<void>,
  generate: () => Promise<GeneratedAudio | null>,
): Promise<StoredAudio | null> {
  const cached = await loadStoredAudio(languageCode, text, model);
  if (cached) return cached;

  const key = ttsInputFingerprint(languageCode, text, model);
  const running = generationInFlight.get(key);
  if (running) {
    const result = await running;
    return result ? { ...result, cache: 'coalesced' } : null;
  }

  const task = (async () => {
    const secondLook = await loadStoredAudio(languageCode, text, model);
    if (secondLook) return secondLook;
    await beforeSynthesize();
    const generated = await generate();
    if (!generated?.buf.length) return null;
    try {
      await persistAudio(languageCode, text, model, engine, generated);
    } catch (error) {
      console.error('Could not persist TTS cache entry:', error);
    }
    return {
      buf: generated.buf,
      contentType: generated.contentType,
      format: generated.format,
      cache: 'miss' as const,
    };
  })();
  generationInFlight.set(key, task);
  try {
    return await task;
  } finally {
    generationInFlight.delete(key);
  }
}

async function neuralTts(
  text: string,
  lang: string,
  beforeSynthesize: () => Promise<void>,
): Promise<StoredAudio | null> {
  try {
    return await cachedSynthesis(
      lang,
      text,
      NEURAL_MODEL,
      'mms-tts',
      beforeSynthesize,
      async () => {
        const res = await fetch(`${TTS_SERVICE_URL}/tts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, lang, format: 'mp3' }),
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || 'audio/mpeg';
        const format = contentType.includes('mpeg') ? 'mp3' : 'wav';
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return null;
        return {
          buf,
          contentType,
          format,
          normalizedInput: res.headers.get('x-tts-mapped'),
          durationMs:
            parseInt(res.headers.get('x-tts-duration-ms') || '', 10) || null,
          sampleRate: 16000,
          seed: 1234,
        };
      },
    );
  } catch (err) {
    if (isApiGuardError(err)) throw err;
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
const MAX_BODY_BYTES = 4096;
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

async function handle(
  text: string | null,
  lang: string | null,
  englishText: string | null,
  beforeSynthesize: () => Promise<void>,
) {
  const clean = (text ?? '').trim();
  const cleanEnglish = (englishText ?? '').trim().slice(0, MAX_TEXT_LENGTH);
  if (!clean) return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  if (clean.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text too long (max ${MAX_TEXT_LENGTH} characters)` },
      { status: 413 },
    );
  }

  // Neural voice for supported languages (Kuku Yalanji); donor fallback otherwise.
  if (lang && NEURAL_LANGS.has(lang.toLowerCase())) {
    const neural = await neuralTts(
      clean,
      lang.toLowerCase(),
      beforeSynthesize,
    );
    if (neural) {
      // Count this as a play of the stored clip (admin "Explore" voice metrics).
      void recordTtsPlay(lang.toLowerCase(), clean, NEURAL_MODEL);
      void discordTts({
        language: lang,
        englishText: cleanEnglish,
        indigenousText: clean,
        engine: 'mms-tts-pjt',
      });
      return new NextResponse(neural.buf as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': neural.contentType,
          'Content-Length': String(neural.buf.length),
          'X-TTS-Engine': 'mms-tts-pjt',
          'X-TTS-Cache': neural.cache,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
    // else: fall through to the donor voice below.
  }

  try {
    const languageCode = lang?.toLowerCase() || 'und';
    const donorLanguage = resolveTl(lang);
    const donorModel = `google-translate-tts:${donorLanguage}`;
    const donor = await cachedSynthesis(
      languageCode,
      clean,
      donorModel,
      'google-donor',
      beforeSynthesize,
      async () => {
        const buf = await synthesize(clean, donorLanguage);
        return buf.length
          ? {
              buf,
              contentType: 'audio/mpeg',
              format: 'mp3',
            }
          : null;
      },
    );
    if (!donor) {
      return NextResponse.json({ error: 'Synthesis returned no audio' }, { status: 502 });
    }
    void recordTtsPlay(languageCode, clean, donorModel);
    void discordTts({
      language: lang,
      englishText: cleanEnglish,
      indigenousText: clean,
      engine: 'google-donor',
    });
    return new NextResponse(donor.buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': donor.contentType,
        'Content-Length': String(donor.buf.length),
        'X-TTS-Engine': 'google-donor',
        'X-TTS-Cache': donor.cache,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    if (isApiGuardError(err)) throw err;
    console.error('TTS error:', err);
    return NextResponse.json(
      { error: 'Pronunciation audio is unavailable right now. Please try again.' },
      { status: 502 },
    );
  }
}

async function guarded(
  request: NextRequest,
  run: (_userId: string | null) => Promise<NextResponse>,
): Promise<NextResponse> {
  const sessionUser = await getSessionUser().catch(() => null);
  const userId = sessionUser?.id ?? null;
  try {
    await enforceTtsRequestLimit(request, userId);
    return await run(userId);
  } catch (error) {
    const guardedResponse = apiGuardResponse(error);
    if (guardedResponse) return guardedResponse as NextResponse;
    console.error('TTS route error:', error);
    return NextResponse.json(
      { error: 'Pronunciation audio is unavailable right now. Please try again.' },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  return guarded(request, async (userId) => {
    const { searchParams } = new URL(request.url);
    return handle(
      searchParams.get('text'),
      searchParams.get('lang'),
      searchParams.get('english'),
      () => enforceTtsProviderBudget(request, userId),
    );
  });
}

export async function POST(request: NextRequest) {
  return guarded(request, async (userId) => {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    let body: { text?: unknown; lang?: unknown; english?: unknown };
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    return handle(
      typeof body.text === 'string' ? body.text : null,
      typeof body.lang === 'string' ? body.lang : null,
      typeof body.english === 'string' ? body.english : null,
      () => enforceTtsProviderBudget(request, userId),
    );
  });
}

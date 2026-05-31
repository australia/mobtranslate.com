import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// msedge-tts opens a WebSocket to Microsoft's speech endpoint, so this must run
// on the Node.js runtime (not edge) and cannot be statically prerendered.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-language donor-voice map. See experiments/.../tts/README.md.
 *
 * Kuku Yalanji uses an Indonesian donor voice: it shares the 5-vowel system,
 * unaspirated stops, syllable-timed rhythm, and ny/ng/j/y digraph conventions,
 * so it approximates the phonology far better than an English voice. This is a
 * PHONETIC APPROXIMATION, never a recording of a Kuku Yalanji speaker — the UI
 * must always flag synthesized audio as needing community verification.
 *
 * Other languages fall back to the Indonesian donor for now and are flagged as
 * needing their own donor evaluation (Wajarri, Anindilyakwa, Mi'gmaq differ).
 */
type VoiceConfig = { voice: string; rate: string; pitch: string };

const DONOR_VOICES: Record<string, VoiceConfig> = {
  kuku_yalanji: { voice: 'id-ID-ArdiNeural', rate: '-30%', pitch: '-5Hz' },
  zku: { voice: 'id-ID-ArdiNeural', rate: '-30%', pitch: '-5Hz' },
};

const DEFAULT_VOICE: VoiceConfig = { voice: 'id-ID-ArdiNeural', rate: '-25%', pitch: '-3Hz' };

const MAX_TEXT_LENGTH = 600;

function resolveVoice(lang: string | null): VoiceConfig {
  if (!lang) return DEFAULT_VOICE;
  return DONOR_VOICES[lang.toLowerCase()] ?? DEFAULT_VOICE;
}

async function synthesize(text: string, cfg: VoiceConfig): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(cfg.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { rate: cfg.rate, pitch: cfg.pitch });

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => reject(new Error('TTS synthesis timed out')), 20000);
    audioStream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    audioStream.on('end', () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks));
    });
    audioStream.on('error', (e: Error) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

async function handle(text: string | null, lang: string | null) {
  const clean = (text ?? '').trim();
  if (!clean) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  }
  if (clean.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text too long (max ${MAX_TEXT_LENGTH} characters)` },
      { status: 413 },
    );
  }

  try {
    const audio = await synthesize(clean, resolveVoice(lang));
    if (!audio.length) {
      return NextResponse.json({ error: 'Synthesis returned no audio' }, { status: 502 });
    }
    return new NextResponse(audio as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        // Deterministic for (text, voice) → cache hard at the browser/CDN.
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

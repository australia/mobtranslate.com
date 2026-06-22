import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BUCKET, requireUser, uploadAudio } from '@/lib/recording/server';
import { compressedAudioMeta } from '@/lib/recording/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const metaSchema = z.object({
  clientId: z.string().min(8),
  languageId: z.string().uuid(),
  kind: z.enum(['word', 'phrase', 'sentence']).default('word'),
  label: z.string().min(1).max(2000),
  gloss: z.string().max(2000).nullable().optional(),
  wordId: z.string().uuid().nullable().optional(),
  exampleId: z.string().uuid().nullable().optional(),
  targetId: z.string().uuid().nullable().optional(),
  sampleRate: z.number().int().positive().optional(),
  bitDepth: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  peakAmplitude: z.number().optional(),
  clipped: z.boolean().optional(),
});

// ---- GET: my recordings for a language ----
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const languageId = new URL(request.url).searchParams.get('languageId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });
  const { data, error } = await auth.supabase.rpc('auth_my_recordings', { p_language_id: languageId, p_limit: 100 });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

// ---- POST: upload a recording as the signed-in (invited) user ----
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const db = auth.supabase;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const rawMeta = form.get('meta');
  if (typeof rawMeta !== 'string') return NextResponse.json({ error: 'Missing meta' }, { status: 400 });
  let meta: z.infer<typeof metaSchema>;
  try {
    meta = metaSchema.parse(JSON.parse(rawMeta));
  } catch (err) {
    return NextResponse.json({ error: 'Invalid meta', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  const master = form.get('master');
  if (!(master instanceof Blob)) return NextResponse.json({ error: 'Missing master audio' }, { status: 400 });
  const opus = form.get('opus');

  const base = `users/${auth.user.id}/${meta.clientId}`;
  let storagePath: string;
  let masterUrl: string;
  let opusPath: string | null = null;
  let opusUrl: string | null = null;
  try {
    const up = await uploadAudio(db, `${base}.wav`, await master.arrayBuffer(), 'audio/wav');
    storagePath = up.path;
    masterUrl = up.url;
  } catch (err) {
    return NextResponse.json({ error: `Could not save the recording: ${(err as Error).message}` }, { status: 502 });
  }
  if (opus instanceof Blob && opus.size > 0) {
    try {
      const { ext, contentType } = compressedAudioMeta(opus.type);
      const upo = await uploadAudio(db, `${base}.${ext}`, await opus.arrayBuffer(), contentType);
      opusPath = upo.path;
      opusUrl = upo.url;
    } catch {
      opusPath = null;
      opusUrl = null;
    }
  }

  const fileSize = master.size + (opus instanceof Blob ? opus.size : 0);
  const { data, error } = await db.rpc('auth_create_recording', {
    p_language_id: meta.languageId,
    p_client_id: meta.clientId,
    p_kind: meta.kind,
    p_label: meta.label,
    p_gloss: meta.gloss ?? null,
    p_word_id: meta.wordId ?? null,
    p_example_id: meta.exampleId ?? null,
    p_target_id: meta.targetId ?? null,
    p_storage_path: storagePath,
    p_master_url: masterUrl,
    p_opus_path: opusPath,
    p_opus_url: opusUrl,
    p_mime: 'audio/wav',
    p_sample_rate: meta.sampleRate ?? null,
    p_bit_depth: meta.bitDepth ?? 16,
    p_channels: meta.channels ?? 1,
    p_duration_ms: meta.durationMs ?? null,
    p_file_size: fileSize,
    p_peak: meta.peakAmplitude ?? null,
    p_clipped: meta.clipped ?? false,
  });
  if (error) {
    const orphans = [storagePath, opusPath].filter(Boolean) as string[];
    if (orphans.length) await db.storage.from(BUCKET).remove(orphans).catch(() => undefined);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}

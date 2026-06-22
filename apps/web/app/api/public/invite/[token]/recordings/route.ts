import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { publicClient, RECORDINGS_BUCKET, resolveInvite } from '@/lib/recording/public';
import { compressedAudioMeta } from '@/lib/recording/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const metaSchema = z.object({
  clientId: z.string().min(8),
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

// ---- GET: the speaker's own recent recordings --------------------------
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const db = publicClient();
  const { data, error } = await db.rpc('invite_my_recordings', { p_token: params.token, p_limit: 100 });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

// ---- POST: upload a recording (multipart) ------------------------------
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const ctx = await resolveInvite(params.token);
  if (!ctx) return NextResponse.json({ error: 'This recording link is not valid.' }, { status: 404 });

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

  const db = publicClient();
  const base = `invites/${ctx.language_id}/${meta.clientId}`;

  // Upload the lossless master (fatal). Opus is best-effort.
  let storagePath: string;
  let masterUrl: string;
  let opusPath: string | null = null;
  let opusUrl: string | null = null;
  try {
    const buf = Buffer.from(await master.arrayBuffer());
    const { error } = await db.storage.from(RECORDINGS_BUCKET).upload(`${base}.wav`, buf, { contentType: 'audio/wav', upsert: true, cacheControl: '31536000' });
    if (error) throw new Error(error.message);
    storagePath = `${base}.wav`;
    masterUrl = db.storage.from(RECORDINGS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  } catch (err) {
    return NextResponse.json({ error: `Could not save the recording: ${(err as Error).message}` }, { status: 502 });
  }

  if (opus instanceof Blob && opus.size > 0) {
    try {
      const { ext, contentType } = compressedAudioMeta(opus.type);
      const buf = Buffer.from(await opus.arrayBuffer());
      const { error } = await db.storage.from(RECORDINGS_BUCKET).upload(`${base}.${ext}`, buf, { contentType, upsert: true, cacheControl: '31536000' });
      if (!error) {
        opusPath = `${base}.${ext}`;
        opusUrl = db.storage.from(RECORDINGS_BUCKET).getPublicUrl(opusPath).data.publicUrl;
      }
    } catch {
      /* best-effort */
    }
  }

  const fileSize = master.size + (opus instanceof Blob ? opus.size : 0);
  const { data, error } = await db.rpc('invite_create_recording', {
    p_token: params.token,
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
    // Avoid orphaned audio if the row couldn't be created.
    const orphans = [storagePath, opusPath].filter(Boolean) as string[];
    if (orphans.length) await db.storage.from(RECORDINGS_BUCKET).remove(orphans).catch(() => undefined);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}

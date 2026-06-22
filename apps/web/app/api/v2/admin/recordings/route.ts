import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BUCKET, requireAdmin, uploadAudio } from '@/lib/recording/server';
import { compressedAudioMeta } from '@/lib/recording/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const metaSchema = z.object({
  clientId: z.string().min(8),
  languageId: z.string().uuid(),
  wordId: z.string().uuid().nullable().optional(),
  targetId: z.string().uuid().nullable().optional(),
  exampleId: z.string().uuid().nullable().optional(),
  kind: z.enum(['word', 'phrase', 'sentence']).default('word'),
  label: z.string().min(1).max(500),
  gloss: z.string().max(1000).nullable().optional(),
  speakerId: z.string().uuid().nullable().optional(),
  isCorrection: z.boolean().optional(),
  correctionNote: z.string().max(1000).nullable().optional(),
  supersedesId: z.string().uuid().nullable().optional(),
  sampleRate: z.number().int().positive().optional(),
  bitDepth: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  peakAmplitude: z.number().optional(),
  clipped: z.boolean().optional(),
});

// ---- POST: upload a recording (multipart) ------------------------------
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const rawMeta = form.get('meta');
  if (typeof rawMeta !== 'string') {
    return NextResponse.json({ error: 'Missing meta' }, { status: 400 });
  }
  let meta: z.infer<typeof metaSchema>;
  try {
    meta = metaSchema.parse(JSON.parse(rawMeta));
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid meta', details: err instanceof z.ZodError ? err.issues : String(err) },
      { status: 400 },
    );
  }

  const master = form.get('master');
  if (!(master instanceof Blob)) {
    return NextResponse.json({ error: 'Missing master audio' }, { status: 400 });
  }
  const opus = form.get('opus');

  const db = auth.supabase;

  // Idempotency: a retried upload with the same clientId returns the existing row.
  const { data: existing } = await db
    .from('recordings')
    .select('*')
    .eq('client_id', meta.clientId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  // --- Store audio objects ---
  const base = `${meta.languageId}/${meta.clientId}`;
  let storagePath: string;
  let masterUrl: string;
  let opusPath: string | null = null;
  let opusUrl: string | null = null;
  // The WAV master is the irreplaceable archival copy — if it can't be stored,
  // fail the whole request so the client keeps the take and retries.
  try {
    const masterBuf = await master.arrayBuffer();
    const up = await uploadAudio(db, `${base}.wav`, masterBuf, 'audio/wav');
    storagePath = up.path;
    masterUrl = up.url;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  // The Opus copy is a best-effort streaming convenience. Never fail the save
  // (and lose the master) over it. Normalize the content type to the base MIME
  // — the storage allowlist matches exactly, so "audio/webm;codecs=opus" is
  // rejected; "audio/webm" is the correct, accepted type for the container.
  if (opus instanceof Blob && opus.size > 0) {
    try {
      const { ext, contentType } = compressedAudioMeta(opus.type);
      const opusBuf = await opus.arrayBuffer();
      const upo = await uploadAudio(db, `${base}.${ext}`, opusBuf, contentType);
      opusPath = upo.path;
      opusUrl = upo.url;
    } catch {
      opusPath = null;
      opusUrl = null;
    }
  }

  // --- Versioning / primary selection ---
  // Many recordings can coexist per word AND per speaker — a new take does NOT
  // supersede earlier ones. We only retire a specific recording when this take
  // is an explicit correction of it (supersedesId). The first active recording
  // for a word/target becomes its primary; later takes are kept as alternates.
  let version = 1;
  let isPrimary = true;
  const groupCol = meta.wordId
    ? ('word_id' as const)
    : meta.exampleId
      ? ('example_id' as const)
      : meta.targetId
        ? ('target_id' as const)
        : null;
  const groupVal = meta.wordId ?? meta.exampleId ?? meta.targetId ?? null;

  if (groupCol && groupVal) {
    const { data: siblings } = await db
      .from('recordings')
      .select('id, version, status, is_primary')
      .eq(groupCol, groupVal);
    const all = siblings ?? [];
    version = all.length + 1; // simple per-word/target sequence label
    // Keep the existing primary; only claim primary if none is set yet.
    isPrimary = !all.some((s) => s.status === 'active' && s.is_primary);
  }

  // Explicit correction: retire exactly the one recording being replaced, and
  // inherit its primary flag so the corrected take takes its place.
  if (meta.supersedesId) {
    const { data: prior } = await db
      .from('recordings')
      .select('is_primary')
      .eq('id', meta.supersedesId)
      .maybeSingle();
    await db.from('recordings').update({ status: 'superseded', is_primary: false }).eq('id', meta.supersedesId);
    if (prior?.is_primary) isPrimary = true;
  }

  // --- Insert the new recording ---
  const fileSize =
    master.size + (opus instanceof Blob ? opus.size : 0);
  const { data: inserted, error: insErr } = await db
    .from('recordings')
    .insert({
      language_id: meta.languageId,
      word_id: meta.wordId ?? null,
      target_id: meta.targetId ?? null,
      example_id: meta.exampleId ?? null,
      kind: meta.kind,
      label: meta.label,
      gloss: meta.gloss ?? null,
      speaker_id: meta.speakerId ?? null,
      recorded_by: auth.user.id,
      storage_path: storagePath,
      master_url: masterUrl,
      master_format: 'wav',
      opus_path: opusPath,
      opus_url: opusUrl,
      mime_type: 'audio/wav',
      sample_rate: meta.sampleRate ?? null,
      bit_depth: meta.bitDepth ?? 16,
      channels: meta.channels ?? 1,
      duration_ms: meta.durationMs ?? null,
      file_size_bytes: fileSize,
      peak_amplitude: meta.peakAmplitude ?? null,
      clipped: meta.clipped ?? false,
      status: 'active',
      version,
      supersedes_id: meta.supersedesId ?? null,
      is_correction: meta.isCorrection ?? false,
      correction_note: meta.correctionNote ?? null,
      is_primary: isPrimary,
      client_id: meta.clientId,
    })
    .select()
    .single();

  if (insErr) {
    // Don't leave orphaned audio in storage if the row failed to insert.
    const orphans = [storagePath, opusPath].filter(Boolean) as string[];
    if (orphans.length) await db.storage.from(BUCKET).remove(orphans).catch(() => undefined);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Mark the worklist target as recorded.
  if (meta.targetId) {
    await db.from('recording_targets').update({ status: 'recorded' }).eq('id', meta.targetId);
  }

  return NextResponse.json(inserted, { status: 201 });
}

// ---- GET: list recordings ---------------------------------------------
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  const wordId = searchParams.get('wordId');
  const status = searchParams.get('status'); // active | superseded | rejected | all
  const limit = Math.min(200, Number(searchParams.get('limit') ?? 100));

  const db = auth.supabase;
  let query = db
    .from('recordings')
    .select('*, speaker:speaker_profiles(id, name, community)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (languageId) query = query.eq('language_id', languageId);
  if (wordId) query = query.eq('word_id', wordId);
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

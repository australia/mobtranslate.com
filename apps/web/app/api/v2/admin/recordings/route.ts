import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordings, recordingTargets, speakerProfiles, languages } from '@/lib/db/schema';
import { snakeRow } from '@/lib/db/case';
import { recordingPublicUrl } from '@/lib/storage';
import { requireAdmin, uploadAudio, removeAudio } from '@/lib/recording/server';
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
  const userId = auth.user.id;

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

  // Idempotency: a retried upload with the same clientId returns the existing row.
  const existingRows = await db
    .select()
    .from(recordings)
    .where(eq(recordings.clientId, meta.clientId))
    .limit(1);
  if (existingRows[0]) {
    return NextResponse.json(snakeRow(existingRows[0]), { status: 200 });
  }

  // --- Store audio objects ---
  const base = `${meta.languageId}/${meta.clientId}`;
  let storagePath: string;
  let opusPath: string | null = null;
  // The WAV master is the irreplaceable archival copy — if it can't be stored,
  // fail the whole request so the client keeps the take and retries.
  try {
    const masterBuf = await master.arrayBuffer();
    const up = await uploadAudio(`${base}.wav`, masterBuf, 'audio/wav');
    storagePath = up.path;
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 502 });
  }

  // The Opus copy is a best-effort streaming convenience. Never fail the save
  // (and lose the master) over it. Normalize the content type to the base MIME
  // — the storage allowlist matches exactly, so "audio/webm;codecs=opus" is
  // rejected; "audio/webm" is the correct, accepted type for the container.
  if (opus instanceof Blob && opus.size > 0) {
    try {
      const { ext, contentType } = compressedAudioMeta(opus.type);
      const opusBuf = await opus.arrayBuffer();
      const upo = await uploadAudio(`${base}.${ext}`, opusBuf, contentType);
      opusPath = upo.path;
    } catch {
      opusPath = null;
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
    ? recordings.wordId
    : meta.exampleId
      ? recordings.exampleId
      : meta.targetId
        ? recordings.targetId
        : null;
  const groupVal = meta.wordId ?? meta.exampleId ?? meta.targetId ?? null;

  if (groupCol && groupVal) {
    const siblings = await db
      .select({ id: recordings.id, version: recordings.version, status: recordings.status, isPrimary: recordings.isPrimary })
      .from(recordings)
      .where(eq(groupCol, groupVal));
    version = siblings.length + 1; // simple per-word/target sequence label
    // Keep the existing primary; only claim primary if none is set yet.
    isPrimary = !siblings.some((s) => s.status === 'active' && s.isPrimary);
  }

  // Explicit correction: retire exactly the one recording being replaced, and
  // inherit its primary flag so the corrected take takes its place.
  if (meta.supersedesId) {
    const priorRows = await db
      .select({ isPrimary: recordings.isPrimary })
      .from(recordings)
      .where(eq(recordings.id, meta.supersedesId))
      .limit(1);
    await db
      .update(recordings)
      .set({ status: 'superseded', isPrimary: false })
      .where(eq(recordings.id, meta.supersedesId));
    if (priorRows[0]?.isPrimary) isPrimary = true;
  }

  // --- Insert the new recording ---
  const fileSize = master.size + (opus instanceof Blob ? opus.size : 0);
  let inserted;
  try {
    const rows = await db
      .insert(recordings)
      .values({
        languageId: meta.languageId,
        wordId: meta.wordId ?? null,
        targetId: meta.targetId ?? null,
        exampleId: meta.exampleId ?? null,
        kind: meta.kind,
        label: meta.label,
        gloss: meta.gloss ?? null,
        speakerId: meta.speakerId ?? null,
        recordedBy: userId,
        storagePath: storagePath,
        masterUrl: recordingPublicUrl(storagePath),
        masterFormat: 'wav',
        opusPath: opusPath,
        opusUrl: recordingPublicUrl(opusPath),
        mimeType: 'audio/wav',
        sampleRate: meta.sampleRate ?? null,
        bitDepth: meta.bitDepth ?? 16,
        channels: meta.channels ?? 1,
        durationMs: meta.durationMs ?? null,
        fileSizeBytes: fileSize,
        peakAmplitude: meta.peakAmplitude ?? null,
        clipped: meta.clipped ?? false,
        status: 'active',
        version,
        supersedesId: meta.supersedesId ?? null,
        isCorrection: meta.isCorrection ?? false,
        correctionNote: meta.correctionNote ?? null,
        isPrimary: isPrimary,
        clientId: meta.clientId,
      })
      .returning();
    inserted = rows[0];
  } catch (err) {
    // Don't leave orphaned audio in storage if the row failed to insert.
    const orphans = [storagePath, opusPath].filter(Boolean) as string[];
    for (const p of orphans) await removeAudio(p).catch(() => undefined);
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 500 });
  }

  // Mark the worklist target as recorded.
  if (meta.targetId) {
    await db.update(recordingTargets).set({ status: 'recorded' }).where(eq(recordingTargets.id, meta.targetId));
  }

  return NextResponse.json(snakeRow(inserted), { status: 201 });
}

// ---- GET: list recordings ---------------------------------------------
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  const wordId = searchParams.get('wordId');
  const speakerId = searchParams.get('speakerId');
  const status = searchParams.get('status'); // active | superseded | rejected | all
  const limit = Math.min(500, Number(searchParams.get('limit') ?? 200));

  const conds = [];
  if (languageId) conds.push(eq(recordings.languageId, languageId));
  if (wordId) conds.push(eq(recordings.wordId, wordId));
  if (speakerId) conds.push(eq(recordings.speakerId, speakerId));
  if (status && status !== 'all') conds.push(eq(recordings.status, status));

  const rows = await db
    .select({
      rec: recordings,
      speakerId2: speakerProfiles.id,
      speakerName: speakerProfiles.name,
      speakerCommunity: speakerProfiles.community,
      languageId2: languages.id,
      languageName: languages.name,
      languageCode: languages.code,
    })
    .from(recordings)
    .leftJoin(speakerProfiles, eq(recordings.speakerId, speakerProfiles.id))
    .leftJoin(languages, eq(recordings.languageId, languages.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(recordings.createdAt))
    .limit(limit);

  const data = rows.map((r) => ({
    ...snakeRow(r.rec),
    // Always serve same-origin URLs derived from storage paths, never the
    // legacy absolute hosted-Supabase master_url/opus_url.
    master_url: recordingPublicUrl(r.rec.storagePath),
    opus_url: recordingPublicUrl(r.rec.opusPath),
    speaker: r.speakerId2 ? { id: r.speakerId2, name: r.speakerName, community: r.speakerCommunity } : null,
    language: r.languageId2 ? { id: r.languageId2, name: r.languageName, code: r.languageCode } : null,
  }));

  return NextResponse.json(data);
}

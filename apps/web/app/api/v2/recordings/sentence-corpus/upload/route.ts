import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { uploadAudio, removeAudio } from '@/lib/recording/server';
import { recordingPublicUrl } from '@/lib/storage';
import { compressedAudioMeta } from '@/lib/recording/types';
import { STUDIO_ROLES, sentenceAudioBase, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST a captured take for a sentence (multipart/form-data):
//   meta   — JSON (see metaSchema)
//   master — lossless WAV master (required)
//   opus   — compressed copy (optional)
//
// Non-destructive: a re-record by the same speaker supersedes their prior active
// take (never deletes audio). On save the queue row becomes 'recorded' (or
// 'fixed_recorded' if the text was corrected), and an unchanged recording also
// appends an 'approved_as_is' verification to the ledger.
const metaSchema = z.object({
  clientId: z.string().min(8).max(128),
  sentenceId: z.string().uuid(),
  speakerId: z.string().uuid(),
  spokenKuku: z.string().min(1).max(4000),
  sampleRate: z.number().int().positive().optional(),
  bitDepth: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  peakAmplitude: z.number().optional(),
  clipped: z.boolean().optional(),
  recordedVia: z.enum(['web', 'app']).optional(),
  culturalConsent: z.boolean().optional(),
  trainingConsent: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

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
    return NextResponse.json(
      { error: 'Invalid meta', details: err instanceof z.ZodError ? err.issues : String(err) },
      { status: 400 },
    );
  }

  const master = form.get('master');
  if (!(master instanceof Blob)) return NextResponse.json({ error: 'Missing master audio' }, { status: 400 });
  const opus = form.get('opus');

  // Idempotency: if this clientId already landed, return it (don't double-store).
  const existingRes = await db.execute(
    sql`select id, audio_path from public.sentence_recordings where client_id = ${meta.clientId}`,
  );
  const existing = rowsOf<{ id: string; audio_path: string }>(existingRes)[0];
  if (existing) {
    return NextResponse.json(
      { id: existing.id, master_url: recordingPublicUrl(existing.audio_path), deduped: true },
      { status: 200 },
    );
  }

  const base = sentenceAudioBase(meta.speakerId, meta.clientId);
  let audioPath: string;
  let masterUrl: string;
  let opusPath: string | null = null;
  try {
    const up = await uploadAudio(`${base}.wav`, await master.arrayBuffer(), 'audio/wav');
    audioPath = up.path;
    masterUrl = up.url;
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save the recording: ${(err as any)?.cause?.message ?? (err as Error).message}` },
      { status: 502 },
    );
  }
  if (opus instanceof Blob && opus.size > 0) {
    try {
      const { ext, contentType } = compressedAudioMeta(opus.type);
      const upo = await uploadAudio(`${base}.${ext}`, await opus.arrayBuffer(), contentType);
      opusPath = upo.path;
    } catch {
      opusPath = null;
    }
  }

  const fileSize = master.size + (opus instanceof Blob ? opus.size : 0);

  try {
    const data = await db.transaction(async (tx) => {
      const sentRes = await tx.execute(sql`
        select id, kuku_text, original_kuku from public.recording_sentences
        where id = ${meta.sentenceId}::uuid for update`);
      const sent = rowsOf<{ id: string; kuku_text: string; original_kuku: string }>(sentRes)[0];
      if (!sent) throw new Error('Sentence not found');

      // Supersede this speaker's prior active take (non-destructive versioning).
      await tx.execute(sql`
        update public.sentence_recordings set status = 'superseded'
        where sentence_id = ${meta.sentenceId}::uuid and speaker_id = ${meta.speakerId}::uuid and status = 'active'`);

      const insRes = await tx.execute(sql`
        insert into public.sentence_recordings
          (sentence_id, speaker_id, recorded_by, spoken_kuku, audio_path, opus_path, mime,
           sample_rate, bit_depth, channels, duration_ms, file_size_bytes, peak_amplitude, clipped,
           recorded_via, cultural_consent, training_consent, status, client_id)
        values
          (${meta.sentenceId}::uuid, ${meta.speakerId}::uuid, ${user!.id}::uuid, ${meta.spokenKuku},
           ${audioPath}, ${opusPath}, ${'audio/wav'},
           ${meta.sampleRate ?? null}::int, ${meta.bitDepth ?? 16}::int, ${meta.channels ?? 1}::int,
           ${meta.durationMs ?? null}::int, ${fileSize}::bigint, ${meta.peakAmplitude ?? null}::real,
           ${meta.clipped ?? false}::boolean, ${meta.recordedVia ?? 'web'},
           ${meta.culturalConsent ?? true}::boolean, ${meta.trainingConsent ?? false}::boolean,
           'active', ${meta.clientId})
        returning id, created_at`);
      const recording = rowsOf(insRes)[0];

      // The queue row is recorded (fixed_recorded if the elder corrected the text).
      const wasFixed = sent.kuku_text !== sent.original_kuku;
      await tx.execute(sql`
        update public.recording_sentences
        set status = ${wasFixed ? 'fixed_recorded' : 'recorded'}, updated_at = now()
        where id = ${meta.sentenceId}::uuid`);

      // An unchanged recording is an elder verification that the synthetic text
      // is correct as written — log it to the provenance ledger.
      if (!wasFixed) {
        await tx.execute(sql`
          insert into public.sentence_reviews
            (sentence_id, speaker_id, reviewer_user_id, action, previous_kuku, new_kuku, reason)
          values
            (${meta.sentenceId}::uuid, ${meta.speakerId}::uuid, ${user!.id}::uuid,
             'approved_as_is', ${sent.kuku_text}, null, 'confirmed by recording')`);
      }

      return { id: recording.id, master_url: masterUrl, status: wasFixed ? 'fixed_recorded' : 'recorded' };
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    // Roll back the stored audio if the DB write failed.
    const orphans = [audioPath, opusPath].filter(Boolean) as string[];
    if (orphans.length) await Promise.all(orphans.map((p) => removeAudio(p).catch(() => undefined)));
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message },
      { status: 400 },
    );
  }
}

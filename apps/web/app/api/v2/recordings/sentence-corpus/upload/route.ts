import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { uploadAudio, removeAudio } from '@/lib/recording/server';
import { recordingPublicUrl } from '@/lib/storage';
import { compressedAudioMeta } from '@/lib/recording/types';
import { STUDIO_ROLES, sentenceAudioBase, rowsOf } from '@/lib/recording/sentence-studio';
import { inspectPcmWav } from '@/lib/recording/wav-inspect.server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_MASTER_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MIN_CLIP_MS = 250;
const MAX_CLIP_MS = 60_000;

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
  sessionId: z.string().uuid(),
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
  condition: z.enum(['in_person_studio', 'quiet_room', 'ordinary_room', 'outdoors']).default('in_person_studio'),
  consentRecordId: z.string().uuid(),
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
  if (master.size === 0 || master.size > MAX_MASTER_BYTES) {
    return NextResponse.json(
      { error: 'The WAV recording is empty or too large.' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (opus instanceof Blob && opus.size > MAX_COMPRESSED_BYTES) {
    return NextResponse.json(
      { error: 'The compressed playback recording is too large.' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const masterBytes = Buffer.from(await master.arrayBuffer());
  let measured;
  try {
    measured = inspectPcmWav(masterBytes);
  } catch {
    return NextResponse.json(
      { error: 'The master recording is not a valid mono 16-bit PCM WAV.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (measured.durationMs < MIN_CLIP_MS || measured.durationMs > MAX_CLIP_MS) {
    return NextResponse.json(
      { error: 'The recording must be between 0.25 and 60 seconds.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Idempotency: if this clientId already landed, return it (don't double-store).
  const existingRes = await db.execute(
    sql`select id, audio_path, speech_consent_record_id
        from public.sentence_recordings where client_id = ${meta.clientId}`,
  );
  const existing = rowsOf<{
    id: string;
    audio_path: string;
    speech_consent_record_id: string | null;
  }>(existingRes)[0];
  if (existing) {
    if (existing.speech_consent_record_id !== meta.consentRecordId) {
      return NextResponse.json(
        { error: 'This upload identity is already bound to another consent record.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { id: existing.id, master_url: recordingPublicUrl(existing.audio_path), deduped: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const consentCheck = await db.execute(sql`
    select id
    from public.current_speech_consent
    where id = ${meta.consentRecordId}::uuid
      and speaker_id = ${meta.speakerId}::uuid
      and recording_allowed = true`);
  if (!rowsOf(consentCheck)[0]) {
    return NextResponse.json(
      { error: 'Current permission to make this recording is required.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const base = sentenceAudioBase(meta.speakerId, meta.clientId);
  let audioPath: string;
  let masterUrl: string;
  let opusPath: string | null = null;
  try {
    const up = await uploadAudio(`${base}.wav`, masterBytes, 'audio/wav');
    audioPath = up.path;
    masterUrl = up.url;
  } catch (err) {
    return NextResponse.json(
      { error: 'The recording could not be stored.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
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

      const consentRes = await tx.execute(sql`
        select consent.id, consent.language_id, consent.public_audio_allowed,
               consent.asr_training_allowed, consent.tts_training_allowed,
               speaker.dialect
        from public.current_speech_consent consent
        join public.speaker_profiles speaker on speaker.id = consent.speaker_id
        where consent.id = ${meta.consentRecordId}::uuid
          and consent.speaker_id = ${meta.speakerId}::uuid
          and consent.recording_allowed = true`);
      const consent = rowsOf<{
        id: string;
        language_id: string;
        public_audio_allowed: boolean;
        asr_training_allowed: boolean;
        tts_training_allowed: boolean;
        dialect: string | null;
      }>(consentRes)[0];
      if (!consent) throw new Error('Current recording consent is required');

      await tx.execute(sql`
        insert into public.speech_recording_sessions
          (id, speaker_id, language_id, consent_record_id, condition, variety, recorded_by)
        values
          (${meta.sessionId}::uuid, ${meta.speakerId}::uuid, ${consent.language_id}::uuid,
           ${consent.id}::uuid, ${meta.condition}, ${consent.dialect ?? null}, ${user!.id}::uuid)
        on conflict (id) do nothing`);
      const sessionRes = await tx.execute(sql`
        select id from public.speech_recording_sessions
        where id = ${meta.sessionId}::uuid
          and speaker_id = ${meta.speakerId}::uuid
          and consent_record_id = ${consent.id}::uuid`);
      if (!rowsOf(sessionRes)[0]) throw new Error('Speech session does not match consent');

      // Supersede this speaker's prior active take (non-destructive versioning).
      await tx.execute(sql`
        update public.sentence_recordings set status = 'superseded'
        where sentence_id = ${meta.sentenceId}::uuid and speaker_id = ${meta.speakerId}::uuid and status = 'active'`);

      const insRes = await tx.execute(sql`
        insert into public.sentence_recordings
          (sentence_id, speaker_id, recorded_by, spoken_kuku, audio_path, opus_path, mime,
           sample_rate, bit_depth, channels, duration_ms, file_size_bytes, peak_amplitude, clipped,
           recorded_via, cultural_consent, training_consent, speech_consent_record_id,
           speech_session_id, status, client_id)
        values
          (${meta.sentenceId}::uuid, ${meta.speakerId}::uuid, ${user!.id}::uuid, ${meta.spokenKuku},
           ${audioPath}, ${opusPath}, ${'audio/wav'},
	           ${measured.sampleRate}::int, ${measured.bitDepth}::int, ${measured.channels}::int,
	           ${measured.durationMs}::int, ${fileSize}::bigint, ${measured.peakAmplitude}::real,
	           ${measured.clipped}::boolean, ${meta.recordedVia ?? 'web'},
           ${consent.public_audio_allowed}::boolean,
           ${consent.asr_training_allowed || consent.tts_training_allowed}::boolean,
           ${consent.id}::uuid, ${meta.sessionId}::uuid, 'active', ${meta.clientId})
        returning id, created_at`);
      const recording = rowsOf<{ id: string }>(insRes)[0];
      if (!recording) throw new Error('Sentence recording insert failed');

      await tx.execute(sql`
        insert into public.speech_transcript_events
          (sentence_recording_id, version, status, transcript, orthography_version,
           reviewer_ids, notes, recorded_by)
        values
          (${recording.id}::uuid, 1, 'single_review', ${meta.spokenKuku},
           'project-nfc-v1',
           ARRAY[${`speaker:${meta.speakerId}`}, ${`operator:${user!.id}`} ]::text[],
           'Speaker-present sentence-studio capture; independent adjudication not yet completed.',
           ${user!.id}::uuid)`);

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
    return NextResponse.json(data, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    // Roll back the stored audio if the DB write failed.
    const orphans = [audioPath, opusPath].filter(Boolean) as string[];
    if (orphans.length) await Promise.all(orphans.map((p) => removeAudio(p).catch(() => undefined)));
    console.error('Governed sentence recording upload failed:', {
      name: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'The recording metadata could not be saved.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

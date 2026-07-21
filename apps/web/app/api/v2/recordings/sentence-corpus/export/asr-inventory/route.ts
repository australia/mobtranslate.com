import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { EXPORT_ROLES, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// Rights-gated inventory for building a speaker/session-disjoint ASR manifest.
// It deliberately does not assign train/development/test or context/target
// roles: those are frozen by the separate corpus builder and split manifest.
export async function GET(request: NextRequest) {
  const { response } = await requireRole(EXPORT_ROLES);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const purpose = searchParams.get('purpose') === 'training' ? 'training' : 'evaluation';
  const execution = searchParams.get('execution') === 'hosted' ? 'hosted' : 'local';
  const promotion = searchParams.get('promotion') === '1';
  const publishDataset = searchParams.get('publishDataset') === '1';
  const releaseWeights = searchParams.get('releaseWeights') === '1';
  const includeClipped = searchParams.get('includeClipped') === '1';

  try {
    const result = await db.execute(sql`
      select
        recording.id,
        recording.audio_path,
        recording.sentence_id as prompt_id,
        recording.speaker_id,
        recording.speech_session_id as session_id,
        recording.duration_ms,
        recording.sample_rate,
        recording.channels,
        recording.clipped,
        session.condition,
        coalesce(nullif(session.variety, ''), 'Kuku Yalanji') as variety,
        transcript.transcript as reference,
        transcript.status as transcript_status,
        transcript.orthography_version,
        transcript.reviewer_ids as transcriber_ids,
        sentence.corpus_sentence_id,
        consent.id as consent_record_id,
        consent.withdrawal_process,
        consent.asr_evaluation_allowed,
        consent.asr_training_allowed,
        consent.hosted_provider_transfer_allowed,
        consent.public_audio_allowed,
        consent.public_transcript_allowed,
        consent.asr_derived_weights_allowed,
        consent.asr_weight_distribution_allowed,
        consent.commercial_use_allowed,
        recording.created_at
      from public.sentence_recordings recording
      join public.speech_recording_sessions session
        on session.id = recording.speech_session_id
       and session.speaker_id = recording.speaker_id
       and session.consent_record_id = recording.speech_consent_record_id
      join public.current_speech_consent consent
        on consent.id = recording.speech_consent_record_id
       and consent.speaker_id = recording.speaker_id
      join public.current_speech_transcript transcript
        on transcript.sentence_recording_id = recording.id
      join public.recording_sentences sentence on sentence.id = recording.sentence_id
      where recording.status = 'active'
        and sentence.status <> 'marked_bad'
        and consent.recording_allowed = true
        and consent.asr_evaluation_allowed = true
        ${purpose === 'training' ? sql`and consent.asr_training_allowed = true` : sql``}
        ${execution === 'hosted' ? sql`and consent.hosted_provider_transfer_allowed = true` : sql``}
        ${promotion ? sql`and transcript.status = 'adjudicated'` : sql`and transcript.status in ('single_review', 'adjudicated')`}
        ${publishDataset ? sql`and consent.public_audio_allowed = true and consent.public_transcript_allowed = true` : sql``}
        ${releaseWeights ? sql`and consent.asr_derived_weights_allowed = true and consent.asr_weight_distribution_allowed = true` : sql``}
        ${includeClipped ? sql`` : sql`and recording.clipped = false`}
      order by recording.speaker_id, recording.speech_session_id, recording.created_at`);
    const rows = rowsOf<Record<string, unknown>>(result);
    const payload =
      rows
        .map((row) =>
          JSON.stringify({
            schema_version: 1,
            language_code: 'gvn',
            id: row.id,
            audio_path: row.audio_path,
            prompt_id: row.prompt_id,
            corpus_sentence_id: row.corpus_sentence_id,
            reference: row.reference,
            speaker_id: row.speaker_id,
            session_id: row.session_id,
            variety: row.variety,
            condition: row.condition,
            prompt_type: 'read',
            orthography_version: row.orthography_version,
            transcript_status: row.transcript_status,
            transcriber_ids: row.transcriber_ids,
            duration_ms: row.duration_ms,
            sample_rate: row.sample_rate,
            channels: row.channels,
            clipped: row.clipped,
            rights: {
              consent_record_id: row.consent_record_id,
              withdrawal_process: row.withdrawal_process,
              evaluation_allowed: row.asr_evaluation_allowed,
              training_allowed: row.asr_training_allowed,
              provider_transfer_allowed: row.hosted_provider_transfer_allowed,
              public_audio_allowed: row.public_audio_allowed,
              public_transcript_allowed: row.public_transcript_allowed,
              derived_weights_allowed: row.asr_derived_weights_allowed,
              weight_distribution_allowed: row.asr_weight_distribution_allowed,
              commercial_use_allowed: row.commercial_use_allowed,
            },
            created_at: row.created_at,
          }),
        )
        .join('\n') + (rows.length ? '\n' : '');

    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="asr-inventory-${new Date().toISOString().slice(0, 10)}.jsonl"`,
        'X-Row-Count': String(rows.length),
        'X-Speech-Purpose': purpose,
        'X-Speech-Execution': execution,
        'X-Promotion-Transcript-Gate': promotion ? 'adjudicated' : 'single-review-or-better',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Governed ASR inventory export failed:', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'The governed ASR inventory could not be built.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

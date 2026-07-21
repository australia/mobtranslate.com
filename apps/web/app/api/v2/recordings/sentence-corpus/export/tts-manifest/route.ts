import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { EXPORT_ROLES, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// GET the TTS training manifest as JSONL (LJSpeech-adjacent). One line per active
// recording of a non-rejected sentence whose exact, current consent event
// permits TTS training and whose current transcript is independently
// adjudicated. `execution=hosted` additionally requires provider transfer.
// `releaseWeights=1` additionally requires model creation and distribution.
// Private audio URLs and speaker names are deliberately absent.
export async function GET(request: NextRequest) {
  const { response } = await requireRole(EXPORT_ROLES);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get('speakerId');
  const speakerUuid = speakerId && /^[0-9a-f-]{36}$/i.test(speakerId) ? speakerId : null;
  const includeClipped = searchParams.get('includeClipped') === '1';
  const execution = searchParams.get('execution') === 'hosted' ? 'hosted' : 'local';
  const releaseWeights = searchParams.get('releaseWeights') === '1';

  try {
    const res = await db.execute(sql`
      select
        sr.id,
        sr.audio_path,
        sr.opus_path,
        transcript.transcript as text,
        transcript.status as transcript_status,
        transcript.orthography_version,
        transcript.reviewer_ids,
        rs.corpus_sentence_id,
        rs.english_text,
        sp.id as speaker_id,
        sr.duration_ms,
        sr.sample_rate,
        sr.channels,
        sr.clipped,
        consent.id as consent_record_id,
        consent.withdrawal_process,
        consent.hosted_provider_transfer_allowed,
        consent.public_audio_allowed,
        consent.public_transcript_allowed,
        consent.tts_training_allowed,
        consent.speaker_voice_replication_allowed,
        consent.tts_derived_weights_allowed,
        consent.tts_weight_distribution_allowed,
        consent.commercial_use_allowed,
        sr.created_at
      from public.sentence_recordings sr
      join public.recording_sentences rs on rs.id = sr.sentence_id
      join public.speaker_profiles sp on sp.id = sr.speaker_id
      join public.current_speech_consent consent
        on consent.id = sr.speech_consent_record_id
       and consent.speaker_id = sr.speaker_id
      join public.current_speech_transcript transcript
        on transcript.sentence_recording_id = sr.id
      where sr.status = 'active'
        and rs.status <> 'marked_bad'
        and consent.recording_allowed = true
        and consent.tts_training_allowed = true
        and transcript.status = 'adjudicated'
        ${speakerUuid ? sql`and sr.speaker_id = ${speakerUuid}::uuid` : sql``}
        ${includeClipped ? sql`` : sql`and sr.clipped = false`}
        ${execution === 'hosted' ? sql`and consent.hosted_provider_transfer_allowed = true` : sql``}
        ${releaseWeights ? sql`and consent.tts_derived_weights_allowed = true and consent.tts_weight_distribution_allowed = true` : sql``}
      order by sp.id asc, sr.created_at asc`);
    const rows = rowsOf<any>(res);

    const ndjson =
      rows
        .map((r) =>
          JSON.stringify({
            id: r.id,
            audio_path: r.audio_path,
            text: r.text,
            english: r.english_text,
            corpus_sentence_id: r.corpus_sentence_id,
            speaker_id: r.speaker_id,
            duration_ms: r.duration_ms,
            sample_rate: r.sample_rate,
            channels: r.channels,
            clipped: r.clipped,
            transcript_status: r.transcript_status,
            orthography_version: r.orthography_version,
            reviewer_ids: r.reviewer_ids,
            rights: {
              consent_record_id: r.consent_record_id,
              withdrawal_process: r.withdrawal_process,
              training_allowed: r.tts_training_allowed,
              provider_transfer_allowed: r.hosted_provider_transfer_allowed,
              public_audio_allowed: r.public_audio_allowed,
              public_transcript_allowed: r.public_transcript_allowed,
              speaker_voice_replication_allowed: r.speaker_voice_replication_allowed,
              derived_weights_allowed: r.tts_derived_weights_allowed,
              weight_distribution_allowed: r.tts_weight_distribution_allowed,
              commercial_use_allowed: r.commercial_use_allowed,
            },
            created_at: r.created_at,
          }),
        )
        .join('\n') + (rows.length ? '\n' : '');

    return new NextResponse(ndjson, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="tts-manifest-${new Date().toISOString().slice(0, 10)}.jsonl"`,
        'X-Row-Count': String(rows.length),
        'X-Speech-Execution': execution,
        'X-Weight-Distribution': releaseWeights ? 'required' : 'not-requested',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Governed TTS manifest export failed:', {
      name: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'The governed TTS manifest could not be built.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

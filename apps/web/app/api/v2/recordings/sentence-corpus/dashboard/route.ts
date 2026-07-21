import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, CORPUS_SOURCE, rowsOf } from '@/lib/recording/sentence-studio';
import { recordingPublicUrl } from '@/lib/storage';

export const runtime = 'nodejs';

// GET operator dashboard data: queue + audio totals, per-speaker table,
// recent fixes (with before/after diff), and recent recordings.
export async function GET(_request: NextRequest) {
  const { user, response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  try {
    const totalsRes = await db.execute(sql`
      select
        (select count(*) from public.recording_sentences where corpus_source = ${CORPUS_SOURCE})::int as total_sentences,
        (select count(*) from public.recording_sentences where status in ('recorded','fixed_recorded'))::int as recorded,
        (select count(*) from public.recording_sentences where status = 'marked_bad')::int as marked_bad,
        (select count(*) from public.recording_sentences where status = 'skipped')::int as skipped,
        (select count(*) from public.recording_sentences where status = 'pending')::int as pending,
        (select count(*) from public.sentence_recordings where status = 'active')::int as clips,
        (select coalesce(round(sum(duration_ms) / 60000.0, 1), 0) from public.sentence_recordings where status = 'active')::float as minutes,
        (select count(*) from public.sentence_reviews where action = 'fixed')::int as fixes,
        (select count(*) from public.sentence_reviews where action = 'approved_as_is')::int as approvals`);
    const totals = rowsOf(totalsRes)[0];

    const perSpeakerRes = await db.execute(sql`
      select sp.id as speaker_id, sp.name, sp.community, sp.dialect,
             consent.id as consent_record_id,
             consent.recording_allowed,
             consent.asr_evaluation_allowed,
             consent.asr_training_allowed,
             consent.hosted_provider_transfer_allowed,
             consent.public_audio_allowed,
             consent.public_transcript_allowed,
             consent.tts_training_allowed,
             consent.speaker_voice_replication_allowed,
             consent.asr_weight_distribution_allowed,
             consent.tts_weight_distribution_allowed,
             audio.clips, audio.minutes, audio.clipped, audio.last_recorded_at
      from public.speaker_profiles sp
      left join public.current_speech_consent consent on consent.speaker_id = sp.id
      join lateral (
        select count(*)::int as clips,
               coalesce(round(sum(sr.duration_ms) / 60000.0, 1), 0)::float as minutes,
               count(*) filter (where sr.clipped)::int as clipped,
               max(sr.created_at) as last_recorded_at
        from public.sentence_recordings sr
        where sr.speaker_id = sp.id and sr.status = 'active'
      ) audio on audio.clips > 0
      order by audio.minutes desc, audio.clips desc`);
    const perSpeaker = rowsOf(perSpeakerRes);

    const recentFixesRes = await db.execute(sql`
      select r.id, r.created_at, r.previous_kuku, r.new_kuku, r.reason,
             rs.corpus_sentence_id, rs.english_text, sp.name as speaker
      from public.sentence_reviews r
      join public.recording_sentences rs on rs.id = r.sentence_id
      left join public.speaker_profiles sp on sp.id = r.speaker_id
      where r.action = 'fixed'
      order by r.created_at desc limit 30`);
    const recentFixes = rowsOf(recentFixesRes);

    const recentBadRes = await db.execute(sql`
      select r.id, r.created_at, r.reason, rs.corpus_sentence_id, rs.kuku_text, rs.english_text, sp.name as speaker
      from public.sentence_reviews r
      join public.recording_sentences rs on rs.id = r.sentence_id
      left join public.speaker_profiles sp on sp.id = r.speaker_id
      where r.action = 'marked_bad'
      order by r.created_at desc limit 30`);
    const recentBad = rowsOf(recentBadRes);

    const recentRecRes = await db.execute(sql`
      select sr.id, sr.created_at, sr.duration_ms, sr.audio_path, sr.clipped, sr.spoken_kuku,
             rs.english_text, rs.corpus_sentence_id, sp.name as speaker,
             transcript.transcript, transcript.status as transcript_status,
             transcript.version as transcript_version,
             transcript.orthography_version,
             transcript.recorded_by is distinct from ${user!.id}::uuid as can_adjudicate
      from public.sentence_recordings sr
      join public.recording_sentences rs on rs.id = sr.sentence_id
      left join public.speaker_profiles sp on sp.id = sr.speaker_id
      left join public.current_speech_transcript transcript
        on transcript.sentence_recording_id = sr.id
      where sr.status = 'active'
      order by sr.created_at desc limit 30`);
    const recentRecordings = rowsOf<{ audio_path: string } & Record<string, unknown>>(
      recentRecRes,
    ).map(({ audio_path, ...recording }) => ({
      ...recording,
      audio_url: recordingPublicUrl(audio_path),
    }));

    return NextResponse.json(
      { totals, perSpeaker, recentFixes, recentBad, recentRecordings },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('Sentence recording dashboard failed:', {
      name: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'The recording dashboard could not be loaded.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

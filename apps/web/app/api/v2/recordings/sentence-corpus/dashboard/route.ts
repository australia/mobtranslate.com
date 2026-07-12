import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, CORPUS_SOURCE, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// GET operator dashboard data: queue + audio totals, per-speaker table,
// recent fixes (with before/after diff), and recent recordings.
export async function GET(_request: NextRequest) {
  const { response } = await requireRole(STUDIO_ROLES);
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
      select sp.id as speaker_id, sp.name, sp.community, sp.dialect, sp.cultural_consent, sp.training_consent,
             count(sr.*)::int as clips,
             coalesce(round(sum(sr.duration_ms) / 60000.0, 1), 0)::float as minutes,
             count(*) filter (where sr.clipped)::int as clipped,
             max(sr.created_at) as last_recorded_at
      from public.speaker_profiles sp
      left join public.sentence_recordings sr on sr.speaker_id = sp.id and sr.status = 'active'
      group by sp.id
      having count(sr.*) > 0
      order by minutes desc, clips desc`);
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
             rs.english_text, rs.corpus_sentence_id, sp.name as speaker
      from public.sentence_recordings sr
      join public.recording_sentences rs on rs.id = sr.sentence_id
      left join public.speaker_profiles sp on sp.id = sr.speaker_id
      where sr.status = 'active'
      order by sr.created_at desc limit 30`);
    const recentRecordings = rowsOf(recentRecRes);

    return NextResponse.json({ totals, perSpeaker, recentFixes, recentBad, recentRecordings });
  } catch (err) {
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message },
      { status: 500 },
    );
  }
}

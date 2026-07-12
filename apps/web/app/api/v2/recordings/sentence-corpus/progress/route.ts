import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, CORPUS_SOURCE, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// GET progress stats — queue counts by status + recorded minutes, overall and
// (optionally) for a single speaker. ?speakerId=<uuid> scopes the audio totals.
export async function GET(request: NextRequest) {
  const { response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get('speakerId');
  const speakerUuid = speakerId && /^[0-9a-f-]{36}$/i.test(speakerId) ? speakerId : null;
  const batch = searchParams.get('batch') ?? 'tts-priority-v1';
  const batchFilter = batch === 'all' ? sql`true` : sql`rs.batch_label = ${batch}`;

  try {
    const queueRes = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status = 'recorded')::int as recorded,
        count(*) filter (where status = 'fixed_recorded')::int as fixed_recorded,
        count(*) filter (where status = 'skipped')::int as skipped,
        count(*) filter (where status = 'marked_bad')::int as marked_bad
      from public.recording_sentences rs
      where rs.corpus_source = ${CORPUS_SOURCE} and ${batchFilter}`);
    const queue = rowsOf(queueRes)[0];

    const audioRes = await db.execute(sql`
      select
        count(*)::int as clips,
        coalesce(round(sum(duration_ms) / 60000.0, 1), 0)::float as minutes,
        count(distinct speaker_id)::int as speakers,
        count(*) filter (where clipped)::int as clipped
      from public.sentence_recordings
      where status = 'active' ${speakerUuid ? sql`and speaker_id = ${speakerUuid}::uuid` : sql``}`);
    const audio = rowsOf(audioRes)[0];

    const perSpeakerRes = await db.execute(sql`
      select sp.id as speaker_id, sp.name, sp.community, sp.dialect,
             count(sr.*)::int as clips,
             coalesce(round(sum(sr.duration_ms) / 60000.0, 1), 0)::float as minutes,
             count(*) filter (where sr.clipped)::int as clipped,
             max(sr.created_at) as last_recorded_at
      from public.speaker_profiles sp
      join public.sentence_recordings sr on sr.speaker_id = sp.id and sr.status = 'active'
      group by sp.id, sp.name, sp.community, sp.dialect
      order by minutes desc, clips desc`);
    const perSpeaker = rowsOf(perSpeakerRes);

    const reviewRes = await db.execute(sql`
      select action, count(*)::int as count from public.sentence_reviews group by action`);
    const reviews = rowsOf<{ action: string; count: number }>(reviewRes).reduce(
      (m, r) => ((m[r.action] = r.count), m),
      {} as Record<string, number>,
    );

    return NextResponse.json({ queue, audio, perSpeaker, reviews });
  } catch (err) {
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message },
      { status: 500 },
    );
  }
}

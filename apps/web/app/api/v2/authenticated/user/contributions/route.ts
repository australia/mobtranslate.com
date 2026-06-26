import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/recording/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rowsOf(res: any): any[] {
  return Array.isArray(res) ? res : (res?.rows ?? []);
}

// GET: the signed-in user's recording contributions, grouped by language, with totals.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const res = await db.execute(sql`
    select
      r.language_id,
      l.code  as language_code,
      l.name  as language_name,
      count(*)                                                              as total_clips,
      count(distinct r.word_id)    filter (where r.word_id is not null)     as distinct_words,
      count(distinct r.example_id) filter (where r.example_id is not null)  as distinct_sentences,
      round(coalesce(sum(r.duration_ms), 0) / 1000.0, 1)                    as total_duration_seconds,
      max(r.created_at)                                                     as last_recorded_at
    from public.recordings r
    join public.speaker_profiles sp on sp.id = r.speaker_id
    join public.languages l on l.id = r.language_id
    where sp.user_id = ${userId}::uuid and r.status = 'active'
    group by r.language_id, l.code, l.name
    order by max(r.created_at) desc
  `);

  const languages = rowsOf(res).map((r: any) => ({
    languageId: r.language_id,
    code: r.language_code,
    name: r.language_name,
    totalClips: Number(r.total_clips) || 0,
    distinctWords: Number(r.distinct_words) || 0,
    distinctSentences: Number(r.distinct_sentences) || 0,
    durationSeconds: Number(r.total_duration_seconds) || 0,
    lastRecordedAt: r.last_recorded_at,
  }));

  const totals = languages.reduce(
    (acc, l) => {
      acc.totalClips += l.totalClips;
      acc.distinctWords += l.distinctWords;
      acc.distinctSentences += l.distinctSentences;
      acc.durationSeconds += l.durationSeconds;
      return acc;
    },
    { totalClips: 0, distinctWords: 0, distinctSentences: 0, durationSeconds: 0, languages: 0 },
  );
  totals.languages = languages.length;

  return NextResponse.json({ totals, languages });
}

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { getSessionUser } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

function rows<T = any>(res: any): T[] {
  return (Array.isArray(res) ? res : res?.rows ?? []) as T[];
}

/**
 * "Your voice" stats for the signed-in user: how many words and sentences they've
 * recorded, total audio, by language, recent clips, and their speaker profile(s).
 *
 * Attribution = active recordings they captured (recorded_by) OR where they are the
 * named speaker (speaker_profiles.user_id) — a self-recording sets both.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid = user.id;

  const mine = sql`r.status = 'active' and (
    r.recorded_by = ${uid}::uuid
    or r.speaker_id in (select id from public.speaker_profiles where user_id = ${uid}::uuid)
  )`;

  const [totals, byLang, recent, speakers] = await Promise.all([
    db.execute(sql`
      select
        count(*)::int                                            as clips,
        count(*) filter (where r.kind = 'word')::int            as words,
        count(*) filter (where r.kind in ('sentence','phrase'))::int as sentences,
        coalesce(sum(r.duration_ms), 0)::bigint                 as duration_ms,
        count(distinct r.language_id)::int                      as languages,
        count(distinct date_trunc('day', r.created_at))::int    as active_days,
        max(r.created_at)                                       as last_recorded_at
      from public.recordings r where ${mine}
    `),
    db.execute(sql`
      select l.code, l.name,
             count(*)::int as clips,
             count(*) filter (where r.kind = 'word')::int as words,
             count(*) filter (where r.kind in ('sentence','phrase'))::int as sentences,
             coalesce(sum(r.duration_ms),0)::bigint as duration_ms
      from public.recordings r join public.languages l on l.id = r.language_id
      where ${mine}
      group by l.code, l.name order by clips desc
    `),
    db.execute(sql`
      select r.id, r.kind, r.label, r.gloss, r.duration_ms, r.created_at, l.code as language_code
      from public.recordings r join public.languages l on l.id = r.language_id
      where ${mine}
      order by r.created_at desc limit 12
    `),
    db.execute(sql`
      select sp.id, sp.name, sp.community, sp.dialect, sp.language_id, l.code as language_code, l.name as language_name,
             sp.training_consent, sp.training_consent_at, sp.cultural_consent
      from public.speaker_profiles sp left join public.languages l on l.id = sp.language_id
      where sp.user_id = ${uid}::uuid
      order by sp.created_at
    `),
  ]);

  const t = rows(totals)[0] || {};
  return NextResponse.json({
    totals: {
      clips: Number(t.clips || 0),
      words: Number(t.words || 0),
      sentences: Number(t.sentences || 0),
      minutes: Math.round((Number(t.duration_ms || 0) / 60000) * 10) / 10,
      languages: Number(t.languages || 0),
      activeDays: Number(t.active_days || 0),
      lastRecordedAt: t.last_recorded_at || null,
    },
    byLanguage: rows(byLang).map((r) => ({
      code: r.code, name: r.name,
      clips: Number(r.clips), words: Number(r.words), sentences: Number(r.sentences),
      minutes: Math.round((Number(r.duration_ms || 0) / 60000) * 10) / 10,
    })),
    recent: rows(recent).map((r) => ({
      id: r.id, kind: r.kind, label: r.label, gloss: r.gloss,
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      languageCode: r.language_code, createdAt: r.created_at,
    })),
    speakers: rows(speakers).map((r) => ({
      id: r.id, name: r.name, community: r.community, dialect: r.dialect,
      languageCode: r.language_code, languageName: r.language_name,
      trainingConsent: r.training_consent === true,
      trainingConsentAt: r.training_consent_at || null,
      culturalConsent: r.cultural_consent === true,
    })),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['super_admin', 'dictionary_admin'];

/** postgres-js / drizzle execute() may return an array or { rows }. Normalize. */
function rows<T = any>(res: any): T[] {
  return (Array.isArray(res) ? res : res?.rows ?? []) as T[];
}

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const { response } = await requireRole(ADMIN_ROLES);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource') || 'stats';

  try {
    if (resource === 'stats') return NextResponse.json(await getStats());
    if (resource === 'requests') return NextResponse.json(await getRequests(searchParams));
    if (resource === 'generations') return NextResponse.json(await getGenerations(searchParams));
    return NextResponse.json({ error: 'Unknown resource' }, { status: 400 });
  } catch (err) {
    console.error('admin/explore error:', err);
    return NextResponse.json({ error: 'Failed to load explore data' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Overview stats — the cards + spark data at the top of the page.
// ---------------------------------------------------------------------------
async function getStats() {
  const [reqTotals, reqByKind, reqDaily, reqLangs, genTotals, genByEngine, genLangs] = await Promise.all([
    db.execute(sql`
      select
        count(*)::int                                            as total,
        count(*) filter (where status = 'error')::int           as errors,
        count(distinct user_id) filter (where user_id is not null)::int as users,
        count(*) filter (where created_at > now() - interval '24 hours')::int as last_24h,
        count(*) filter (where created_at > now() - interval '7 days')::int   as last_7d
      from public.translation_requests
    `),
    db.execute(sql`select kind, count(*)::int as count from public.translation_requests group by kind order by count desc`),
    db.execute(sql`
      select to_char(d::date, 'YYYY-MM-DD') as day,
             coalesce(count(r.id), 0)::int  as count
      from generate_series(now()::date - interval '13 days', now()::date, interval '1 day') d
      left join public.translation_requests r on r.created_at::date = d::date
      group by d order by d
    `),
    db.execute(sql`
      select coalesce(language_code, '—') as language_code, count(*)::int as count
      from public.translation_requests group by language_code order by count desc limit 8
    `),
    db.execute(sql`
      select
        count(*)::int                  as clips,
        coalesce(sum(play_count), 0)::int as plays,
        coalesce(sum(byte_size), 0)::bigint as bytes,
        coalesce(sum(duration_ms), 0)::bigint as duration_ms,
        count(*) filter (where play_count = 0)::int as never_played
      from public.tts_generations
    `),
    db.execute(sql`select engine, count(*)::int as count, coalesce(sum(play_count),0)::int as plays from public.tts_generations group by engine order by count desc`),
    db.execute(sql`select language_code, count(*)::int as clips, coalesce(sum(play_count),0)::int as plays from public.tts_generations group by language_code order by clips desc limit 8`),
  ]);

  const rt = rows(reqTotals)[0] || {};
  const gt = rows(genTotals)[0] || {};
  return {
    generatedAt: new Date().toISOString(),
    requests: {
      total: Number(rt.total || 0),
      errors: Number(rt.errors || 0),
      users: Number(rt.users || 0),
      last24h: Number(rt.last_24h || 0),
      last7d: Number(rt.last_7d || 0),
      byKind: rows(reqByKind).map((r) => ({ kind: r.kind, count: Number(r.count) })),
      daily: rows(reqDaily).map((r) => ({ label: String(r.day).slice(5), count: Number(r.count) })),
      languages: rows(reqLangs).map((r) => ({ code: r.language_code, count: Number(r.count) })),
    },
    generations: {
      clips: Number(gt.clips || 0),
      plays: Number(gt.plays || 0),
      bytes: Number(gt.bytes || 0),
      durationMs: Number(gt.duration_ms || 0),
      neverPlayed: Number(gt.never_played || 0),
      byEngine: rows(genByEngine).map((r) => ({ engine: r.engine, count: Number(r.count), plays: Number(r.plays) })),
      languages: rows(genLangs).map((r) => ({ code: r.language_code, clips: Number(r.clips), plays: Number(r.plays) })),
    },
  };
}

// ---------------------------------------------------------------------------
// Translate / chat requests — paginated, searchable, filterable.
// ---------------------------------------------------------------------------
async function getRequests(params: URLSearchParams) {
  const page = Math.max(0, parseInt(params.get('page') || '0', 10) || 0);
  const q = (params.get('q') || '').trim();
  const kind = (params.get('kind') || '').trim();
  const lang = (params.get('lang') || '').trim();
  const offset = page * PAGE_SIZE;

  const where = sql`where 1=1`;
  const conds: any[] = [];
  if (q) conds.push(sql`(input_text ilike ${'%' + q + '%'} or output_text ilike ${'%' + q + '%'})`);
  if (kind) conds.push(sql`kind = ${kind}`);
  if (lang) conds.push(sql`language_code = ${lang}`);
  const whereClause = conds.length
    ? sql`where ${sql.join(conds, sql` and `)}`
    : sql``;

  const [list, total] = await Promise.all([
    db.execute(sql`
      select id, kind, source, language_code, input_text, output_text, gloss,
             user_id, status, error, model, duration_ms, created_at
      from public.translation_requests
      ${whereClause}
      order by created_at desc
      limit ${PAGE_SIZE} offset ${offset}
    `),
    db.execute(sql`select count(*)::int as count from public.translation_requests ${whereClause}`),
  ]);

  return {
    page,
    pageSize: PAGE_SIZE,
    total: Number(rows(total)[0]?.count || 0),
    items: rows(list).map((r) => ({
      id: r.id,
      kind: r.kind,
      source: r.source,
      languageCode: r.language_code,
      input: r.input_text,
      output: r.output_text,
      gloss: r.gloss,
      userId: r.user_id,
      status: r.status,
      error: r.error,
      model: r.model,
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      createdAt: r.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// TTS voice generations — paginated, searchable, sortable by plays/recency.
// ---------------------------------------------------------------------------
async function getGenerations(params: URLSearchParams) {
  const page = Math.max(0, parseInt(params.get('page') || '0', 10) || 0);
  const q = (params.get('q') || '').trim();
  const lang = (params.get('lang') || '').trim();
  const sort = params.get('sort') === 'recent' ? 'recent' : 'plays';
  const offset = page * PAGE_SIZE;

  const conds: any[] = [];
  if (q) conds.push(sql`text ilike ${'%' + q + '%'}`);
  if (lang) conds.push(sql`language_code = ${lang}`);
  const whereClause = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;
  const orderClause =
    sort === 'recent' ? sql`order by created_at desc` : sql`order by play_count desc, created_at desc`;

  const [list, total] = await Promise.all([
    db.execute(sql`
      select id, language_code, text, normalized_input, model, engine, format,
             duration_ms, byte_size, play_count, last_played_at, created_at
      from public.tts_generations
      ${whereClause}
      ${orderClause}
      limit ${PAGE_SIZE} offset ${offset}
    `),
    db.execute(sql`select count(*)::int as count from public.tts_generations ${whereClause}`),
  ]);

  return {
    page,
    pageSize: PAGE_SIZE,
    sort,
    total: Number(rows(total)[0]?.count || 0),
    items: rows(list).map((r) => ({
      id: r.id,
      languageCode: r.language_code,
      text: r.text,
      mapped: r.normalized_input,
      model: r.model,
      engine: r.engine,
      format: r.format,
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      byteSize: r.byte_size == null ? null : Number(r.byte_size),
      playCount: Number(r.play_count || 0),
      lastPlayedAt: r.last_played_at,
      createdAt: r.created_at,
    })),
  };
}

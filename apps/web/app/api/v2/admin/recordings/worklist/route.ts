import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Dictionary words + their recording status, plus a progress summary.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });

  const filter = (searchParams.get('filter') ?? 'pending') as 'pending' | 'recorded' | 'all';
  const q = searchParams.get('q') ?? '';
  const limit = Math.min(100, Number(searchParams.get('limit') ?? 40));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  // Fetch one extra row to compute hasMore without a separate count query.
  let wlRes: any;
  let pRes: any;
  try {
    [wlRes, pRes] = await Promise.all([
      db.execute(
        sql`select * from public.recording_worklist(${languageId}::uuid, ${filter}, ${q}, ${limit + 1}::int, ${offset}::int)`,
      ),
      db.execute(sql`select * from public.recording_progress(${languageId}::uuid)`),
    ]);
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 500 });
  }

  const list = (Array.isArray(wlRes) ? wlRes : wlRes?.rows ?? []) as Array<Record<string, unknown>>;
  const progressRows = (Array.isArray(pRes) ? pRes : pRes?.rows ?? []) as Array<Record<string, unknown>>;
  const hasMore = list.length > limit;
  const items = hasMore ? list.slice(0, limit) : list;

  return NextResponse.json({
    items,
    hasMore,
    offset,
    progress: progressRows[0] ?? null,
  });
}

import { NextRequest, NextResponse } from 'next/server';
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

  const db = auth.supabase;

  // Fetch one extra row to compute hasMore without a separate count query.
  const [{ data: rows, error: wlErr }, { data: progress, error: pErr }] = await Promise.all([
    db.rpc('recording_worklist', {
      p_language: languageId,
      p_filter: filter,
      p_q: q,
      p_limit: limit + 1,
      p_offset: offset,
    }),
    db.rpc('recording_progress', { p_language: languageId }),
  ]);

  if (wlErr) return NextResponse.json({ error: wlErr.message }, { status: 500 });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const list = (rows ?? []) as Array<Record<string, unknown>>;
  const hasMore = list.length > limit;
  const items = hasMore ? list.slice(0, limit) : list;

  return NextResponse.json({
    items,
    hasMore,
    offset,
    progress: Array.isArray(progress) ? progress[0] : progress,
  });
}

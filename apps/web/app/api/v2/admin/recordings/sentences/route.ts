import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Worklist of dictionary example sentences + their recording status.
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

  const { data, error } = await auth.supabase.rpc('recording_sentence_worklist', {
    p_language: languageId,
    p_filter: filter,
    p_q: q,
    p_limit: limit + 1,
    p_offset: offset,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = list.length > limit;
  return NextResponse.json({ items: hasMore ? list.slice(0, limit) : list, hasMore, offset });
}

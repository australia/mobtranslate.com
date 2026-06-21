import { NextRequest, NextResponse } from 'next/server';
import { publicClient } from '@/lib/recording/public';

export const runtime = 'nodejs';

// Words or sentences to record for the invite's language.
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') === 'sentence' ? 'sentence' : 'word';
  const filter = (searchParams.get('filter') ?? 'pending') as 'pending' | 'recorded' | 'all';
  const q = searchParams.get('q') ?? '';
  const limit = Math.min(60, Number(searchParams.get('limit') ?? 30));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  const db = publicClient();
  const { data, error } = await db.rpc('invite_worklist', {
    p_token: params.token,
    p_kind: kind,
    p_filter: filter,
    p_q: q,
    p_limit: limit + 1,
    p_offset: offset,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const list = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = list.length > limit;
  return NextResponse.json({ items: hasMore ? list.slice(0, limit) : list, hasMore, offset, kind });
}

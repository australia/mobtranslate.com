import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';

export const runtime = 'nodejs';

// Words or sentences to record for the invite's language.
export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') === 'sentence' ? 'sentence' : 'word';
  const filter = (searchParams.get('filter') ?? 'pending') as 'pending' | 'recorded' | 'all';
  const q = searchParams.get('q') ?? '';
  const limit = Math.min(60, Number(searchParams.get('limit') ?? 30));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  let list: Array<Record<string, unknown>>;
  try {
    const r: any = await db.execute(
      sql`select * from public.invite_worklist(${params.token}, ${kind}, ${filter}, ${q}, ${limit + 1}::int, ${offset}::int)`,
    );
    list = (Array.isArray(r) ? r : r.rows ?? []) as Array<Record<string, unknown>>;
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }

  const hasMore = list.length > limit;
  return NextResponse.json({ items: hasMore ? list.slice(0, limit) : list, hasMore, offset, kind });
}

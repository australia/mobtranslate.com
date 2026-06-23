import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/recording/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });
  const kind = searchParams.get('kind') === 'sentence' ? 'sentence' : 'word';
  const filter = (searchParams.get('filter') ?? 'pending') as 'pending' | 'recorded' | 'all';
  const q = searchParams.get('q') ?? '';
  const limit = Math.min(60, Number(searchParams.get('limit') ?? 30));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  // auth_worklist reads auth.uid() from the request.jwt.claim.sub GUC.
  let list: Array<Record<string, unknown>>;
  try {
    list = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${auth.user.id}, true)`);
      const r: any = await tx.execute(
        sql`select * from public.auth_worklist(${languageId}::uuid, ${kind}, ${filter}, ${q}, ${limit + 1}::int, ${offset}::int)`,
      );
      return (Array.isArray(r) ? r : r.rows ?? []) as Array<Record<string, unknown>>;
    });
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }

  const hasMore = list.length > limit;
  return NextResponse.json({ items: hasMore ? list.slice(0, limit) : list, hasMore, offset, kind });
}

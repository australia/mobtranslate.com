import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Languages the signed-in user has been invited to record.
// auth_my_invites() reads auth.uid() from the request.jwt.claim.sub GUC.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${auth.user.id}, true)`);
      const r: any = await tx.execute(sql`select * from public.auth_my_invites()`);
      return Array.isArray(r) ? r : r.rows ?? [];
    });
    return NextResponse.json(rows ?? []);
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }
}

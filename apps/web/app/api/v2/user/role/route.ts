import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';

export async function GET(_request: NextRequest) {
  try {
    // Check authentication
    const { user, response } = await requireUser();
    if (response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get user's highest role (global first, then any language-specific).
    // The SQL function still exists in the DB.
    let role: string | null = null;
    try {
      const r: any = await db.execute(
        sql`select public.get_user_language_role(${user!.id}::uuid, ${null}::uuid) as role`
      );
      const rows = Array.isArray(r) ? r : r.rows;
      role = rows?.[0]?.role ?? null;
    } catch (rpcError) {
      console.error('Error calling get_user_language_role:', rpcError);
    }

    return NextResponse.json({
      role: role || 'user',
      userId: user!.id
    });
  } catch (error) {
    console.error('Error fetching user role:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user role' },
      { status: 500 }
    );
  }
}

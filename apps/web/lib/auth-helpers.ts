import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { auth } from './auth';
import { db } from './db/index';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
};

/**
 * Server-side current user from the better-auth session cookie.
 * Replaces `(await createClient()).auth.getUser()`. `user.id` is the UUID
 * used by every public FK (mirrors auth.users.id).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

/**
 * App-level authz (RLS is gone). Mirrors the SQL `user_has_role(uuid, text[], uuid)`
 * that the admin/curator routes used via `.rpc('user_has_role', ...)`.
 */
export async function userHasRole(
  userId: string,
  roleNames: string[],
  langId?: string | null
): Promise<boolean> {
  const roleArray = sql`ARRAY[${sql.join(
    roleNames.map((r) => sql`${r}`),
    sql`, `
  )}]::text[]`;
  const res: any = await db.execute(
    sql`select public.user_has_role(${userId}::uuid, ${roleArray}, ${langId ?? null}::uuid) as has_role`
  );
  const row = Array.isArray(res) ? res[0] : res?.rows?.[0];
  return row?.has_role === true;
}

/**
 * Guard for API routes. Usage:
 *   const { user, response } = await requireRole(['super_admin', 'dictionary_admin']);
 *   if (response) return response;
 *   // ...user is authenticated AND authorized
 */
export async function requireRole(
  roleNames: string[],
  langId?: string | null
): Promise<{ user: SessionUser | null; response: NextResponse | null }> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const ok = await userHasRole(user.id, roleNames, langId);
  if (!ok) {
    return { user, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, response: null };
}

/** Guard that only requires authentication (no specific role). */
export async function requireUser(): Promise<{
  user: SessionUser | null;
  response: NextResponse | null;
}> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user, response: null };
}

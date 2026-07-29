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

function authError(message: string, status: 401 | 403): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

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
 * App-level authz (RLS is gone). Check assignments directly rather than the
 * legacy database helper: an older version of that function treated every
 * dictionary_admin assignment as global, even when it named one language.
 */
export async function userHasRole(
  userId: string,
  roleNames: string[],
  langId?: string | null,
): Promise<boolean> {
  const roleArray = sql`ARRAY[${sql.join(
    roleNames.map((r) => sql`${r}`),
    sql`, `,
  )}]::text[]`;
  const scope = langId
    ? sql`and (ur.name = 'super_admin' or ura.language_id is null or ura.language_id = ${langId}::uuid)`
    : sql``;
  const res: any = await db.execute(sql`
    select exists (
      select 1
      from public.user_role_assignments ura
      join public.user_roles ur on ur.id = ura.role_id
      where ura.user_id = ${userId}::uuid
        and ura.is_active = true
        and (ura.expires_at is null or ura.expires_at > now())
        and ur.name = any(${roleArray})
        ${scope}
    ) as has_role
  `);
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
  langId?: string | null,
): Promise<{ user: SessionUser | null; response: NextResponse | null }> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, response: authError('Unauthorized', 401) };
  }
  const ok = await userHasRole(user.id, roleNames, langId);
  if (!ok) {
    return { user, response: authError('Forbidden', 403) };
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
    return { user: null, response: authError('Unauthorized', 401) };
  }
  return { user, response: null };
}

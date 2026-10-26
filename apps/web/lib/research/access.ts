import 'server-only';

import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { getSessionUser, userHasRole, type SessionUser } from '@/lib/auth-helpers';

/**
 * Research tools (Quinkan discovery atlas, restricted field workspace, rock-art
 * workbench) are super_admin only. Layouts do not re-run on client navigation,
 * so every research page and route handler calls one of these guards itself.
 */
export const RESEARCH_ROLES = ['super_admin'];

export const researchHeaders = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Expires', value: '0' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet, noimageindex' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
] as const;

export function applyResearchHeaders(headers: Headers): Headers {
  for (const { key, value } of researchHeaders) headers.set(key, value);
  return headers;
}

export function researchJson(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  applyResearchHeaders(response.headers);
  return response;
}

async function currentResearchAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return (await userHasRole(user.id, RESEARCH_ROLES)) ? user : null;
}

/** Page guard: anyone who is not a research admin sees a plain 404. */
export async function requireResearchAdminPage(): Promise<SessionUser> {
  const user = await currentResearchAdmin();
  if (!user) notFound();
  return user;
}

/**
 * Route guard. Usage:
 *   const { response } = await requireResearchAdminApi();
 *   if (response) return response;
 */
export async function requireResearchAdminApi(): Promise<
  { user: SessionUser; response: null } | { user: null; response: NextResponse }
> {
  const user = await currentResearchAdmin();
  if (!user) return { user: null, response: researchJson({ error: 'not_found' }, 404) };
  return { user, response: null };
}

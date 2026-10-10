import { NextRequest, NextResponse } from 'next/server';
import { requireUser, userHasRole } from '@/lib/auth-helpers';
import { contributionOwner, hideContribution } from '@/lib/country/contributions.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MODERATOR_ROLES = ['super_admin', 'dictionary_admin', 'curator'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// A contributor can take down their own contribution; curators can take down any.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response || !user) return response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

  const owner = await contributionOwner(id);
  if (owner === null && !(await userHasRole(user.id, MODERATOR_ROLES))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }
  const allowed = owner === user.id || (await userHasRole(user.id, MODERATOR_ROLES));
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE });

  const reason = request.nextUrl.searchParams.get('reason');
  const hidden = await hideContribution(id, user.id, reason ? reason.slice(0, 500) : null);
  return NextResponse.json({ hidden }, { status: hidden ? 200 : 404, headers: NO_STORE });
}

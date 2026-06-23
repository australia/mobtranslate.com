import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';

// Historically this endpoint enabled Postgres Row-Level Security policies via the
// Supabase service-role client. The app has migrated off Supabase to a self-hosted
// Postgres where RLS is intentionally DROPPED — authorization is now enforced in
// application/query code (see lib/auth-helpers.ts `requireRole`/`requireUser`). This
// endpoint is therefore a deliberate no-op and must NOT re-enable RLS.
export async function POST() {
  // Keep it admin-gated so it can't be probed anonymously.
  const { response } = await requireRole(['super_admin']);
  if (response) return response;

  return NextResponse.json({
    message:
      'No-op: RLS is no longer used. Authorization is managed at the application level ' +
      '(requireRole / requireUser in lib/auth-helpers.ts). This endpoint intentionally ' +
      'does not enable or modify any Row-Level Security policies.',
    rls: 'disabled',
    managedAt: 'application',
  });
}

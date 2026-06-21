import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Languages the signed-in user has been invited to record.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { data, error } = await auth.supabase.rpc('auth_my_invites');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

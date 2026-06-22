import { NextRequest, NextResponse } from 'next/server';
import { resolveInvite } from '@/lib/recording/public';

export const runtime = 'nodejs';

// Validate the invite token and return its context (language, speaker, progress).
export async function GET(_request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const ctx = await resolveInvite(params.token);
  if (!ctx) return NextResponse.json({ error: 'This recording link is not valid or has been turned off.' }, { status: 404 });
  return NextResponse.json(ctx);
}

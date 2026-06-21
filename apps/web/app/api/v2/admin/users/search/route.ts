import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Search registered users (by email / username / display name) to invite as speakers.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('q') ?? '').trim();
  // Sanitize before building a PostgREST .or() filter — remove characters that
  // are structural in PostgREST filter syntax ( , ( ) " : ) or are LIKE
  // wildcards ( % * ), so a crafted query can't inject extra filter clauses.
  // (Keeps unicode letters so non-ASCII names still search.)
  const q = raw.replace(/[,()"*%:\\]/g, '').slice(0, 80);
  if (q.length < 2) return NextResponse.json([]);

  const like = `%${q}%`;
  const { data, error } = await auth.supabase
    .from('user_profiles')
    .select('user_id, email, username, display_name')
    .or(`email.ilike.${like},username.ilike.${like},display_name.ilike.${like}`)
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((u) => ({ id: u.user_id, email: u.email, username: u.username, display_name: u.display_name })),
  );
}

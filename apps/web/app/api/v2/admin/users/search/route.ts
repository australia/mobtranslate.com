import { NextRequest, NextResponse } from 'next/server';
import { or, ilike } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { userProfiles } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Search registered users (by email / username / display name) to invite as speakers.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('q') ?? '').trim();
  // Drizzle parameterizes values so query injection is not a concern, but keep
  // the LIKE wildcards out of the term and bound its length.
  const q = raw.replace(/[%_\\]/g, '').slice(0, 80);
  if (q.length < 2) return NextResponse.json([]);

  const like = `%${q}%`;
  const rows = await db
    .select({
      userId: userProfiles.userId,
      email: userProfiles.email,
      username: userProfiles.username,
      displayName: userProfiles.displayName,
    })
    .from(userProfiles)
    .where(
      or(
        ilike(userProfiles.email, like),
        ilike(userProfiles.username, like),
        ilike(userProfiles.displayName, like),
      ),
    )
    .limit(20);

  return NextResponse.json(
    rows.map((u) => ({ id: u.userId, email: u.email, username: u.username, display_name: u.displayName })),
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike, ne } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { requireUser } from '@/lib/auth-helpers';
import { userProfiles } from '@/lib/db/schema';

// Username validation function (shared with signup)
function validateUsername(username: string): string | null {
  if (!username) return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters long';
  if (username.length > 50) return 'Username must be no more than 50 characters long';
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return 'Username can only contain letters, numbers, underscores, and hyphens';
  }
  const reserved = ['admin', 'root', 'user', 'anonymous', 'guest', 'system', 'api', 'www', 'mail', 'ftp'];
  if (reserved.includes(username.toLowerCase())) return 'This username is reserved';
  return null;
}

// GET - Fetch user profile (create a default one if missing)
export async function GET(_request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  try {
    const existing = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user!.id))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ profile: snakeRow(existing[0]) });
    }

    // No profile — create a default one from the email prefix.
    const emailPrefix = user!.email?.split('@')[0] || 'user';
    const randomSuffix = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    let defaultUsername = `${emailPrefix}${randomSuffix}`.replace(/[^a-zA-Z0-9_-]/g, '');
    if (defaultUsername.length < 3) defaultUsername = `user${randomSuffix}`;
    else if (defaultUsername.length > 50) defaultUsername = defaultUsername.substring(0, 50);

    try {
      const [created] = await db
        .insert(userProfiles)
        .values({ userId: user!.id, username: defaultUsername, displayName: emailPrefix, email: user!.email })
        .returning();
      return NextResponse.json({ profile: snakeRow(created) });
    } catch {
      // Username collision — fall back to a timestamp-based username.
      const fallbackUsername = `user${Date.now().toString().slice(-6)}`;
      const [fallback] = await db
        .insert(userProfiles)
        .values({ userId: user!.id, username: fallbackUsername, displayName: emailPrefix, email: user!.email })
        .returning();
      return NextResponse.json({ profile: snakeRow(fallback) });
    }
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Create user profile
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  try {
    const { username, display_name } = await request.json();

    const existing = await db
      .select({ userId: userProfiles.userId })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user!.id))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Profile already exists' }, { status: 400 });
    }

    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }

    const taken = await db
      .select({ username: userProfiles.username })
      .from(userProfiles)
      .where(ilike(userProfiles.username, username))
      .limit(1);
    if (taken.length > 0) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
    }

    const [created] = await db
      .insert(userProfiles)
      .values({
        userId: user!.id,
        username,
        displayName: display_name || username,
        email: user!.email,
      })
      .returning();

    return NextResponse.json({ profile: snakeRow(created), message: 'Profile created successfully' });
  } catch (error) {
    console.error('Profile creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update user profile
export async function PUT(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  try {
    const { username, display_name, bio } = await request.json();

    if (username !== undefined) {
      const usernameError = validateUsername(username);
      if (usernameError) {
        return NextResponse.json({ error: usernameError }, { status: 400 });
      }
      const taken = await db
        .select({ userId: userProfiles.userId })
        .from(userProfiles)
        .where(and(ilike(userProfiles.username, username), ne(userProfiles.userId, user!.id)))
        .limit(1);
      if (taken.length > 0) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
      }
    }

    if (display_name !== undefined && display_name.length > 100) {
      return NextResponse.json({ error: 'Display name must be no more than 100 characters' }, { status: 400 });
    }
    if (bio !== undefined && bio.length > 500) {
      return NextResponse.json({ error: 'Bio must be no more than 500 characters' }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (username !== undefined) updateData.username = username;
    if (display_name !== undefined) updateData.displayName = display_name;
    if (bio !== undefined) updateData.bio = bio;

    const [updated] = await db
      .update(userProfiles)
      .set(updateData)
      .where(eq(userProfiles.userId, user!.id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ profile: snakeRow(updated), message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

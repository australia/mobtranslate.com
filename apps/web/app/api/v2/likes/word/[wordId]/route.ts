import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import { userWordLikes } from '@/lib/db/schema';

// GET - Check if a word is liked
export async function GET(request: NextRequest, props: { params: Promise<{ wordId: string }> }) {
  const params = await props.params;
  const { wordId } = params;

  // Check authentication
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const rows = await db
      .select({ id: userWordLikes.id })
      .from(userWordLikes)
      .where(and(eq(userWordLikes.userId, user!.id), eq(userWordLikes.wordId, wordId)))
      .limit(1);

    return NextResponse.json({ liked: rows.length > 0 });
  } catch (error) {
    console.error('Like check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Like a word
export async function POST(request: NextRequest, props: { params: Promise<{ wordId: string }> }) {
  const params = await props.params;
  const { wordId } = params;

  // Check authentication
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    // Check if already liked
    const existing = await db
      .select({ id: userWordLikes.id })
      .from(userWordLikes)
      .where(and(eq(userWordLikes.userId, user!.id), eq(userWordLikes.wordId, wordId)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ liked: true, message: 'Already liked' });
    }

    // Create like
    try {
      await db.insert(userWordLikes).values({
        userId: user!.id,
        wordId: wordId
      });
    } catch (likeError) {
      console.error('Error creating like:', likeError);
      return NextResponse.json({ error: 'Failed to like word' }, { status: 500 });
    }

    return NextResponse.json({ liked: true, message: 'Word liked successfully' });
  } catch (error) {
    console.error('Like creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Unlike a word
export async function DELETE(request: NextRequest, props: { params: Promise<{ wordId: string }> }) {
  const params = await props.params;
  const { wordId } = params;

  // Check authentication
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    await db
      .delete(userWordLikes)
      .where(and(eq(userWordLikes.userId, user!.id), eq(userWordLikes.wordId, wordId)));

    return NextResponse.json({ liked: false, message: 'Word unliked successfully' });
  } catch (error) {
    console.error('Like deletion error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

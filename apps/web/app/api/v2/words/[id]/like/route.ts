import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { requireUser } from '@/lib/auth-helpers';
import { userWordLikes, words as wordsT } from '@/lib/db/schema';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const wordId = params.id;

  // Check if user is authenticated
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    // Get the user's like status for this word
    const rows = await db
      .select()
      .from(userWordLikes)
      .where(and(eq(userWordLikes.userId, user!.id), eq(userWordLikes.wordId, wordId)))
      .limit(1);
    const data = rows[0];

    return NextResponse.json({
      isLiked: !!data,
      isLove: data?.isLove || false,
      likedAt: data?.likedAt || null
    });
  } catch (error) {
    console.error('Error checking like status:', error);
    return NextResponse.json(
      { error: 'Failed to check like status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const wordId = params.id;

  // Check if user is authenticated
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await request.json();
    const { isLove = false } = body;

    // Check if word exists
    const wordRows = await db
      .select({ id: wordsT.id })
      .from(wordsT)
      .where(eq(wordsT.id, wordId))
      .limit(1);

    if (wordRows.length === 0) {
      return NextResponse.json(
        { error: 'Word not found' },
        { status: 404 }
      );
    }

    // Insert or update the like (upsert on user_id,word_id)
    const [data] = await db
      .insert(userWordLikes)
      .values({
        userId: user!.id,
        wordId: wordId,
        isLove: isLove,
        likedAt: new Date().toISOString()
      })
      .onConflictDoUpdate({
        target: [userWordLikes.userId, userWordLikes.wordId],
        set: { isLove: isLove, likedAt: new Date().toISOString() }
      })
      .returning();

    return NextResponse.json({
      success: true,
      like: snakeRow(data)
    });
  } catch (error) {
    console.error('Error liking word:', error);
    return NextResponse.json(
      { error: 'Failed to like word' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const wordId = params.id;

  // Check if user is authenticated
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    await db
      .delete(userWordLikes)
      .where(and(eq(userWordLikes.userId, user!.id), eq(userWordLikes.wordId, wordId)));

    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('Error unliking word:', error);
    return NextResponse.json(
      { error: 'Failed to unlike word' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import { commentVotes } from '@/lib/db/schema';
import { z } from 'zod';

const voteSchema = z.object({
  vote_type: z.enum(['up', 'down'])
});

export async function POST(request: NextRequest, props: { params: Promise<{ commentId: string }> }) {
  const params = await props.params;
  const { commentId } = params;

  try {
    // Check authentication
    const { user, response } = await requireUser();
    if (response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse and validate request body
    const body = await request.json();
    const { vote_type } = voteSchema.parse(body);

    // Check if user already voted (owner-scoped)
    const existingRows = await db
      .select()
      .from(commentVotes)
      .where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, user!.id)))
      .limit(1);
    const existingVote = existingRows[0];

    if (existingVote) {
      if (existingVote.voteType === vote_type) {
        // Remove vote if clicking the same vote type
        await db.delete(commentVotes).where(eq(commentVotes.id, existingVote.id));
        return NextResponse.json({ message: 'Vote removed' });
      } else {
        // Update vote type
        await db
          .update(commentVotes)
          .set({ voteType: vote_type })
          .where(eq(commentVotes.id, existingVote.id));
        return NextResponse.json({ message: 'Vote updated' });
      }
    } else {
      // Create new vote
      await db.insert(commentVotes).values({
        commentId,
        userId: user!.id,
        voteType: vote_type
      });
      return NextResponse.json({ message: 'Vote recorded' }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error voting on comment:', error);
    return NextResponse.json(
      { error: 'Failed to record vote' },
      { status: 500 }
    );
  }
}

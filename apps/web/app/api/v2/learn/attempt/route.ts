import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import { quizAttempts, spacedRepetitionStates } from '@/lib/db/schema';

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await request.json();
    const {
      wordId,
      isCorrect,
      responseTimeMs,
      selectedAnswer,
      correctAnswer
    } = body;

    // Get current state
    const currentStateRows = await db
      .select()
      .from(spacedRepetitionStates)
      .where(
        and(
          eq(spacedRepetitionStates.userId, user!.id),
          eq(spacedRepetitionStates.wordId, wordId)
        )
      )
      .limit(1);

    const bucketAtTime = currentStateRows[0]?.bucket ?? 0;

    // Count previous attempts (owner-scoped)
    const previousAttempts = await db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, user!.id), eq(quizAttempts.wordId, wordId)));

    const attemptNumber = previousAttempts.length + 1;

    // Insert attempt
    try {
      await db.insert(quizAttempts).values({
        userId: user!.id,
        wordId,
        isCorrect,
        responseTimeMs,
        selectedAnswer: selectedAnswer ?? null,
        correctAnswer: correctAnswer ?? null,
        bucketAtTime,
        attemptNumber
      });
    } catch (attemptError) {
      console.error('Error inserting attempt:', attemptError);
      return NextResponse.json({ error: 'Failed to record attempt' }, { status: 500 });
    }

    // Update spaced repetition state
    try {
      await db.execute(
        sql`select public.update_spaced_repetition_state(${user!.id}::uuid, ${wordId}::uuid, ${isCorrect}, ${responseTimeMs})`
      );
    } catch (updateError) {
      console.error('Error updating state:', updateError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing attempt:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

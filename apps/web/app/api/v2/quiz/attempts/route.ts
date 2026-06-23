import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import { quizAttempts, spacedRepetitionStates } from '@/lib/db/schema';

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await request.json();
    const {
      sessionId,
      wordId,
      isCorrect,
      responseTimeMs,
      selectedAnswer,
      correctAnswer,
      distractors
    } = body;

    // Validate required fields
    if (!wordId || typeof isCorrect !== 'boolean' || !responseTimeMs) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get current attempt number for this word (owner-scoped)
    const previousAttempts = await db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, user!.id), eq(quizAttempts.wordId, wordId)));

    const attemptNumber = previousAttempts.length + 1;

    // Get current spaced repetition state
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

    // Insert quiz attempt
    let attempt: { id: string } | undefined;
    try {
      const inserted = await db
        .insert(quizAttempts)
        .values({
          userId: user!.id,
          wordId,
          sessionId: sessionId ?? null,
          isCorrect,
          responseTimeMs,
          selectedAnswer: selectedAnswer ?? null,
          correctAnswer: correctAnswer ?? null,
          distractors: distractors ?? null,
          bucketAtTime,
          attemptNumber,
          userAgent: request.headers.get('user-agent'),
          ipAddress:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip')
        })
        .returning({ id: quizAttempts.id });
      attempt = inserted[0];
    } catch (attemptError) {
      console.error('Error inserting quiz attempt:', attemptError);
      return NextResponse.json({ error: 'Failed to record attempt' }, { status: 500 });
    }

    // Update spaced repetition state using the database function
    try {
      await db.execute(
        sql`select public.update_spaced_repetition_state(${user!.id}::uuid, ${wordId}::uuid, ${isCorrect}, ${responseTimeMs})`
      );
    } catch (updateError) {
      console.error('Error updating spaced repetition state:', updateError);
      // Don't fail the request if state update fails, as the attempt was recorded
    }

    // Get updated state to return
    let updatedState:
      | typeof spacedRepetitionStates.$inferSelect
      | undefined;
    try {
      const updatedRows = await db
        .select()
        .from(spacedRepetitionStates)
        .where(
          and(
            eq(spacedRepetitionStates.userId, user!.id),
            eq(spacedRepetitionStates.wordId, wordId)
          )
        )
        .limit(1);
      updatedState = updatedRows[0];
    } catch (newStateError) {
      console.error('Error fetching updated state:', newStateError);
    }

    // Return success with updated learning state
    return NextResponse.json({
      success: true,
      attemptId: attempt!.id,
      updatedState: updatedState
        ? {
            bucket: updatedState.bucket,
            ef: updatedState.ef,
            dueDate: updatedState.dueDate,
            streak: updatedState.streak,
            totalAttempts: updatedState.totalAttempts,
            correctAttempts: updatedState.correctAttempts,
            accuracy:
              updatedState.totalAttempts > 0
                ? (
                    (updatedState.correctAttempts / updatedState.totalAttempts) *
                    100
                  ).toFixed(1)
                : '0.0'
          }
        : null
    });
  } catch (error) {
    console.error('Error processing quiz attempt:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get attempt history for a user
export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const wordId = searchParams.get('wordId');
  const sessionId = searchParams.get('sessionId');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    const filters = [eq(quizAttempts.userId, user!.id)];
    if (wordId) filters.push(eq(quizAttempts.wordId, wordId));
    if (sessionId) filters.push(eq(quizAttempts.sessionId, sessionId));

    const rows = await db
      .select({
        id: quizAttempts.id,
        word_id: quizAttempts.wordId,
        session_id: quizAttempts.sessionId,
        is_correct: quizAttempts.isCorrect,
        response_time_ms: quizAttempts.responseTimeMs,
        selected_answer: quizAttempts.selectedAnswer,
        correct_answer: quizAttempts.correctAnswer,
        bucket_at_time: quizAttempts.bucketAtTime,
        attempt_number: quizAttempts.attemptNumber,
        created_at: quizAttempts.createdAt
      })
      .from(quizAttempts)
      .where(and(...filters))
      .orderBy(desc(quizAttempts.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      attempts: rows,
      pagination: {
        limit,
        offset,
        hasMore: rows.length === limit
      }
    });
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

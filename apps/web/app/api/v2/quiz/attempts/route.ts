import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

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

    // Get current attempt number for this word
    const { data: previousAttempts, error: countError } = await supabase
      .from('quiz_attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('word_id', wordId);

    if (countError) {
      console.error('Error counting previous attempts:', countError);
    }

    const attemptNumber = (previousAttempts?.length || 0) + 1;

    // Get current spaced repetition state
    const { data: currentState, error: stateError } = await supabase
      .from('spaced_repetition_states')
      .select('*')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .single();

    if (stateError && stateError.code !== 'PGRST116') {
      console.error('Error fetching spaced repetition state:', stateError);
      return NextResponse.json({ error: 'Failed to fetch learning state' }, { status: 500 });
    }

    const bucketAtTime = currentState?.bucket || 0;

    // Insert quiz attempt
    const { data: attempt, error: attemptError } = await supabase
      .from('quiz_attempts')
      .insert({
        user_id: user.id,
        word_id: wordId,
        session_id: sessionId,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
        selected_answer: selectedAnswer,
        correct_answer: correctAnswer,
        distractors: distractors ? JSON.stringify(distractors) : null,
        bucket_at_time: bucketAtTime,
        attempt_number: attemptNumber,
        user_agent: request.headers.get('user-agent'),
        ip_address: request.ip || request.headers.get('x-forwarded-for')
      })
      .select('id')
      .single();

    if (attemptError) {
      console.error('Error inserting quiz attempt:', attemptError);
      return NextResponse.json({ error: 'Failed to record attempt' }, { status: 500 });
    }

    // Update spaced repetition state using the database function
    const { error: updateError } = await supabase.rpc(
      'update_spaced_repetition_state',
      {
        p_user_id: user.id,
        p_word_id: wordId,
        p_is_correct: isCorrect,
        p_response_time_ms: responseTimeMs
      }
    );

    if (updateError) {
      console.error('Error updating spaced repetition state:', updateError);
      // Don't fail the request if state update fails, as the attempt was recorded
    }

    // Get updated state to return
    const { data: updatedState, error: newStateError } = await supabase
      .from('spaced_repetition_states')
      .select('bucket, ef, due_date, streak, total_attempts, correct_attempts')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .single();

    if (newStateError) {
      console.error('Error fetching updated state:', newStateError);
    }

    // Return success with updated learning state
    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      updatedState: updatedState ? {
        bucket: updatedState.bucket,
        ef: updatedState.ef,
        dueDate: updatedState.due_date,
        streak: updatedState.streak,
        totalAttempts: updatedState.total_attempts,
        correctAttempts: updatedState.correct_attempts,
        accuracy: updatedState.total_attempts > 0 
          ? (updatedState.correct_attempts / updatedState.total_attempts * 100).toFixed(1)
          : '0.0'
      } : null
    });

  } catch (error) {
    console.error('Error processing quiz attempt:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get attempt history for a user
export async function GET(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const wordId = searchParams.get('wordId');
  const sessionId = searchParams.get('sessionId');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    let query = supabase
      .from('quiz_attempts')
      .select(`
        id,
        word_id,
        session_id,
        is_correct,
        response_time_ms,
        selected_answer,
        correct_answer,
        bucket_at_time,
        attempt_number,
        created_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (wordId) {
      query = query.eq('word_id', wordId);
    }

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data: attempts, error } = await query;

    if (error) {
      console.error('Error fetching quiz attempts:', error);
      return NextResponse.json({ error: 'Failed to fetch attempts' }, { status: 500 });
    }

    return NextResponse.json({
      attempts: attempts || [],
      pagination: {
        limit,
        offset,
        hasMore: attempts?.length === limit
      }
    });

  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
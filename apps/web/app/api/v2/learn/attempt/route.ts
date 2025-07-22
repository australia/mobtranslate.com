import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

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
    const { data: currentState } = await supabase
      .from('spaced_repetition_states')
      .select('*')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .single();

    const bucketAtTime = currentState?.bucket || 0;

    // Count previous attempts
    const { data: previousAttempts } = await supabase
      .from('quiz_attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('word_id', wordId);

    const attemptNumber = (previousAttempts?.length || 0) + 1;

    // Insert attempt
    const { error: attemptError } = await supabase
      .from('quiz_attempts')
      .insert({
        user_id: user.id,
        word_id: wordId,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
        selected_answer: selectedAnswer,
        correct_answer: correctAnswer,
        bucket_at_time: bucketAtTime,
        attempt_number: attemptNumber
      });

    if (attemptError) {
      console.error('Error inserting attempt:', attemptError);
      return NextResponse.json({ error: 'Failed to record attempt' }, { status: 500 });
    }

    // Update spaced repetition state
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
      console.error('Error updating state:', updateError);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error processing attempt:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
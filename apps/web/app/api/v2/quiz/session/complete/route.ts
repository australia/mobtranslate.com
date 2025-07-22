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
      totalQuestions,
      correctAnswers,
      accuracy,
      streak,
      avgResponseTime,
      attempts = []
    } = body;

    // Validate required fields
    if (!sessionId || typeof totalQuestions !== 'number' || typeof correctAnswers !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('quiz_sessions')
      .select('id, user_id, language_id, created_at')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Update session with completion data
    const { error: updateError } = await supabase
      .from('quiz_sessions')
      .update({
        total_questions: totalQuestions,
        correct_answers: correctAnswers,
        accuracy_percentage: accuracy,
        streak: streak,
        avg_response_time_ms: avgResponseTime,
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Error updating quiz session:', updateError);
      return NextResponse.json({ error: 'Failed to complete session' }, { status: 500 });
    }

    // Update user's quiz progress view (this will be recalculated by the database)
    try {
      await supabase.rpc('refresh_user_quiz_progress', { p_user_id: user.id });
    } catch (refreshError) {
      console.error('Error refreshing user progress:', refreshError);
      // Don't fail the request if refresh fails
    }

    // Calculate session statistics
    const sessionDuration = Date.now() - new Date(session.created_at).getTime();
    const wordsPerMinute = totalQuestions > 0 ? (totalQuestions / (sessionDuration / 60000)).toFixed(1) : '0';
    
    const stats = {
      sessionId,
      totalQuestions,
      correctAnswers,
      accuracy: parseFloat(accuracy.toFixed(1)),
      streak,
      avgResponseTime: Math.round(avgResponseTime),
      sessionDuration: Math.round(sessionDuration),
      wordsPerMinute: parseFloat(wordsPerMinute),
      completedAt: new Date().toISOString()
    };

    // Analyze performance by bucket
    const bucketPerformance = attempts.reduce((acc: any, attempt: any) => {
      const bucket = attempt.bucket || 0;
      if (!acc[bucket]) {
        acc[bucket] = { total: 0, correct: 0 };
      }
      acc[bucket].total++;
      if (attempt.isCorrect) {
        acc[bucket].correct++;
      }
      return acc;
    }, {});

    const performanceAnalysis = Object.entries(bucketPerformance).map(([bucket, data]: [string, any]) => ({
      bucket: parseInt(bucket),
      accuracy: data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : '0',
      questions: data.total
    }));

    return NextResponse.json({
      success: true,
      message: 'Session completed successfully',
      stats,
      performanceAnalysis,
      recommendations: generateRecommendations(stats, performanceAnalysis)
    });

  } catch (error) {
    console.error('Error completing quiz session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function generateRecommendations(stats: any, performance: any[]) {
  const recommendations = [];

  // Accuracy-based recommendations
  if (stats.accuracy < 60) {
    recommendations.push({
      type: 'accuracy',
      message: 'Focus on reviewing definitions more carefully before starting each session.',
      priority: 'high'
    });
  } else if (stats.accuracy < 80) {
    recommendations.push({
      type: 'accuracy', 
      message: 'Good progress! Try to slow down slightly to improve accuracy.',
      priority: 'medium'
    });
  }

  // Speed-based recommendations
  if (stats.avgResponseTime > 4000) {
    recommendations.push({
      type: 'speed',
      message: 'Try to answer more quickly - faster recall strengthens memory.',
      priority: 'medium'
    });
  } else if (stats.avgResponseTime < 1500 && stats.accuracy > 90) {
    recommendations.push({
      type: 'speed',
      message: 'Excellent speed and accuracy! You\'re mastering these words.',
      priority: 'low'
    });
  }

  // Bucket-specific recommendations
  const strugglingBuckets = performance.filter(p => parseFloat(p.accuracy) < 70);
  if (strugglingBuckets.length > 0) {
    recommendations.push({
      type: 'bucket',
      message: `Focus extra attention on ${strugglingBuckets.length > 1 ? 'multiple difficulty levels' : 'challenging words'}.`,
      priority: 'high'
    });
  }

  // Session frequency recommendation
  if (stats.totalQuestions >= 15) {
    recommendations.push({
      type: 'frequency',
      message: 'Great session length! Try to practice daily for best results.',
      priority: 'low'
    });
  }

  return recommendations;
}
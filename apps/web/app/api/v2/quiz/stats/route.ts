import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get('language');
  const period = searchParams.get('period') || '7d'; // 7d, 30d, all

  try {
    // Get language filter
    let languageId = null;
    if (languageCode) {
      const { data: language } = await supabase
        .from('languages')
        .select('id')
        .eq('code', languageCode)
        .single();
      languageId = language?.id;
    }

    // Get user progress summary
    let progressQuery = supabase
      .from('user_quiz_progress')
      .select('*')
      .eq('user_id', user.id);

    if (languageCode && languageId) {
      // Get specific language progress from spaced repetition states
      const { data: states, error: statesError } = await supabase
        .from('spaced_repetition_states')
        .select(`
          bucket,
          streak,
          total_attempts,
          correct_attempts,
          due_date,
          word:words!inner(language_id)
        `)
        .eq('user_id', user.id)
        .eq('word.language_id', languageId);

      if (statesError) {
        console.error('Error fetching language-specific progress:', statesError);
        return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
      }

      const now = new Date();
      const summary = {
        language_code: languageCode,
        total_words: states?.length || 0,
        new_words: states?.filter(s => s.bucket === 0).length || 0,
        learning_words: states?.filter(s => s.bucket >= 1 && s.bucket <= 2).length || 0,
        review_words: states?.filter(s => s.bucket >= 3 && s.bucket <= 4).length || 0,
        mastered_words: states?.filter(s => s.bucket === 5).length || 0,
        due_for_review: states?.filter(s => new Date(s.due_date) <= now).length || 0,
        best_streak: Math.max(...(states?.map(s => s.streak) || [0]), 0),
        avg_accuracy: states?.length ? 
          (states.reduce((sum, s) => sum + (s.total_attempts > 0 ? s.correct_attempts / s.total_attempts : 0), 0) / states.length * 100) : 0
      };

      // Get recent session stats
      let sessionQuery = supabase
        .from('quiz_sessions')
        .select('accuracy_percentage, streak, total_questions, correct_answers, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (languageId) {
        sessionQuery = sessionQuery.eq('language_id', languageId);
      }

      if (period !== 'all') {
        const days = period === '7d' ? 7 : 30;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        sessionQuery = sessionQuery.gte('created_at', cutoff.toISOString());
      }

      const { data: sessions, error: sessionsError } = await sessionQuery.limit(50);

      if (sessionsError) {
        console.error('Error fetching sessions:', sessionsError);
      }

      // Calculate session-based stats
      const sessionStats = {
        total_sessions: sessions?.length || 0,
        avg_session_accuracy: sessions?.length ? 
          (sessions.reduce((sum, s) => sum + (s.accuracy_percentage || 0), 0) / sessions.length) : 0,
        best_session_streak: Math.max(...(sessions?.map(s => s.streak || 0) || [0]), 0),
        total_questions_answered: sessions?.reduce((sum, s) => sum + (s.total_questions || 0), 0) || 0,
        recent_sessions: sessions?.slice(0, 10).map(s => ({
          accuracy: s.accuracy_percentage,
          streak: s.streak,
          questions: s.total_questions,
          correct: s.correct_answers,
          date: s.created_at
        })) || []
      };

      return NextResponse.json({
        summary,
        sessions: sessionStats,
        period
      });
    }

    // Get overall progress (all languages)
    const { data: progress, error: progressError } = await progressQuery;

    if (progressError) {
      console.error('Error fetching user progress:', progressError);
      return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
    }

    // Aggregate across all languages
    const overallSummary = progress?.reduce((acc, lang) => ({
      total_words: acc.total_words + (lang.total_words || 0),
      new_words: acc.new_words + (lang.new_words || 0),
      learning_words: acc.learning_words + (lang.learning_words || 0),
      review_words: acc.review_words + (lang.review_words || 0),
      mastered_words: acc.mastered_words + (lang.mastered_words || 0),
      due_for_review: acc.due_for_review + (lang.due_for_review || 0),
      best_streak: Math.max(acc.best_streak, lang.best_streak || 0),
      languages: acc.languages + 1
    }), {
      total_words: 0,
      new_words: 0,
      learning_words: 0,
      review_words: 0,
      mastered_words: 0,
      due_for_review: 0,
      best_streak: 0,
      languages: 0
    }) || {
      total_words: 0,
      new_words: 0,
      learning_words: 0,
      review_words: 0,
      mastered_words: 0,
      due_for_review: 0,
      best_streak: 0,
      languages: 0
    };

    // Get recent activity
    let activityQuery = supabase
      .from('quiz_sessions')
      .select(`
        id,
        accuracy_percentage,
        streak,
        total_questions,
        correct_answers,
        created_at,
        language:languages(name, code)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (period !== 'all') {
      const days = period === '7d' ? 7 : 30;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      activityQuery = activityQuery.gte('created_at', cutoff.toISOString());
    }

    const { data: recentActivity, error: activityError } = await activityQuery.limit(20);

    if (activityError) {
      console.error('Error fetching recent activity:', activityError);
    }

    // Calculate streak days (consecutive days with quiz activity)
    const { data: dailyActivity, error: dailyError } = await supabase
      .from('quiz_sessions')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    let streakDays = 0;
    if (dailyActivity && !dailyError) {
      const days = new Set(
        dailyActivity.map(session => 
          new Date(session.created_at).toDateString()
        )
      );
      
      const today = new Date().toDateString();
      const daysSorted = Array.from(days).sort((a, b) => 
        new Date(b).getTime() - new Date(a).getTime()
      );
      
      if (daysSorted[0] === today || daysSorted[0] === new Date(Date.now() - 24*60*60*1000).toDateString()) {
        for (let i = 0; i < daysSorted.length; i++) {
          const expectedDate = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toDateString();
          if (daysSorted[i] === expectedDate) {
            streakDays++;
          } else {
            break;
          }
        }
      }
    }

    return NextResponse.json({
      summary: overallSummary,
      streak_days: streakDays,
      recent_activity: recentActivity?.map(session => ({
        id: session.id,
        accuracy: session.accuracy_percentage,
        streak: session.streak,
        questions: session.total_questions,
        correct: session.correct_answers,
        language: session.language,
        date: session.created_at
      })) || [],
      languages: progress?.map(lang => ({
        code: lang.language_code,
        name: lang.language_name,
        mastered: lang.mastered_words,
        total: lang.total_words,
        due: lang.due_for_review
      })) || [],
      period
    });

  } catch (error) {
    console.error('Error fetching quiz stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
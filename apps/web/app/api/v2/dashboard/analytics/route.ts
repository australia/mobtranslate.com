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
  const period = searchParams.get('period') || '30d';

  try {
    // Calculate date range
    let dateFilter = '';
    if (period !== 'all') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      dateFilter = cutoff.toISOString();
    }

    // Get all quiz sessions for the user in the period
    let sessionQuery = supabase
      .from('quiz_sessions')
      .select(`
        id,
        language_id,
        total_questions,
        correct_answers,
        accuracy_percentage,
        streak,
        avg_response_time_ms,
        created_at,
        completed_at,
        language:languages(name, code)
      `)
      .eq('user_id', user.id)
      .eq('is_completed', true)
      .order('created_at', { ascending: false });

    if (dateFilter) {
      sessionQuery = sessionQuery.gte('created_at', dateFilter);
    }

    const { data: sessions, error: sessionsError } = await sessionQuery;

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    // Get all quiz attempts in the period for detailed analysis
    let attemptsQuery = supabase
      .from('quiz_attempts')
      .select(`
        id,
        word_id,
        session_id,
        is_correct,
        response_time_ms,
        bucket_at_time,
        created_at,
        word:words(word, language:languages(name, code))
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dateFilter) {
      attemptsQuery = attemptsQuery.gte('created_at', dateFilter);
    }

    const { data: attempts, error: attemptsError } = await attemptsQuery;

    if (attemptsError) {
      console.error('Error fetching attempts:', attemptsError);
      return NextResponse.json({ error: 'Failed to fetch attempts' }, { status: 500 });
    }

    // Get current spaced repetition states for word counts
    const { data: states, error: statesError } = await supabase
      .from('spaced_repetition_states')
      .select('bucket, word_id')
      .eq('user_id', user.id);

    if (statesError) {
      console.error('Error fetching states:', statesError);
    }

    // Calculate overview statistics
    const totalSessions = sessions?.length || 0;
    const totalQuestions = sessions?.reduce((sum, s) => sum + (s.total_questions || 0), 0) || 0;
    const totalCorrect = sessions?.reduce((sum, s) => sum + (s.correct_answers || 0), 0) || 0;
    const overallAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    
    // Calculate current streak from recent sessions
    const currentStreak = calculateCurrentStreak(sessions || []);
    const longestStreak = Math.max(...(sessions?.map(s => s.streak || 0) || [0]), 0);

    // Calculate total study time (approximate from session durations)
    const totalStudyTime = sessions?.reduce((sum, s) => {
      if (s.completed_at && s.created_at) {
        const duration = new Date(s.completed_at).getTime() - new Date(s.created_at).getTime();
        return sum + Math.round(duration / (1000 * 60)); // Convert to minutes
      }
      return sum + (s.total_questions || 0) * 0.5; // Estimate 30 seconds per question
    }, 0) || 0;

    // Count words by learning stage
    const wordsMastered = states?.filter(s => s.bucket === 5).length || 0;
    const wordsLearned = states?.filter(s => s.bucket >= 1 && s.bucket <= 4).length || 0;

    const overview = {
      totalSessions,
      totalQuestions,
      overallAccuracy,
      currentStreak,
      longestStreak,
      totalStudyTime,
      wordsLearned,
      wordsMastered
    };

    // Calculate recent activity by day
    const recentActivity = calculateDailyActivity(sessions || []);

    // Calculate language progress
    const languageProgress = calculateLanguageProgress(sessions || []);

    // Calculate performance by bucket (difficulty level)
    const performanceByBucket = calculateBucketPerformance(attempts || []);

    // Calculate time of day statistics
    const timeOfDayStats = calculateTimeOfDayStats(sessions || []);

    // Calculate streak history
    const streakHistory = calculateStreakHistory(sessions || []);

    // Calculate weekly progress
    const weeklyProgress = calculateWeeklyProgress(sessions || []);

    return NextResponse.json({
      overview,
      recentActivity,
      languageProgress,
      performanceByBucket,
      timeOfDayStats,
      streakHistory,
      weeklyProgress
    });

  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function calculateCurrentStreak(sessions: any[]): number {
  if (!sessions.length) return 0;
  
  // Group sessions by date
  const sessionsByDate = new Map<string, any[]>();
  sessions.forEach(session => {
    const date = new Date(session.created_at).toDateString();
    if (!sessionsByDate.has(date)) {
      sessionsByDate.set(date, []);
    }
    sessionsByDate.get(date)!.push(session);
  });

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
  
  let streak = 0;
  let checkDate = new Date();
  
  // Start from today or yesterday if user practiced
  if (!sessionsByDate.has(today) && !sessionsByDate.has(yesterday)) {
    return 0;
  }
  
  if (!sessionsByDate.has(today)) {
    checkDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
  
  // Count consecutive days with sessions
  while (sessionsByDate.has(checkDate.toDateString())) {
    streak++;
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return streak;
}

function calculateDailyActivity(sessions: any[]) {
  const dailyMap = new Map<string, {
    sessions: number;
    totalQuestions: number;
    totalCorrect: number;
    totalTime: number;
    bestStreak: number;
  }>();

  sessions.forEach(session => {
    const date = new Date(session.created_at).toISOString().split('T')[0];
    const existing = dailyMap.get(date) || {
      sessions: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      totalTime: 0,
      bestStreak: 0
    };

    const sessionDuration = session.completed_at && session.created_at
      ? Math.round((new Date(session.completed_at).getTime() - new Date(session.created_at).getTime()) / (1000 * 60))
      : (session.total_questions || 0) * 0.5;

    dailyMap.set(date, {
      sessions: existing.sessions + 1,
      totalQuestions: existing.totalQuestions + (session.total_questions || 0),
      totalCorrect: existing.totalCorrect + (session.correct_answers || 0),
      totalTime: existing.totalTime + sessionDuration,
      bestStreak: Math.max(existing.bestStreak, session.streak || 0)
    });
  });

  return Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      sessions: data.sessions,
      accuracy: data.totalQuestions > 0 ? (data.totalCorrect / data.totalQuestions) * 100 : 0,
      streak: data.bestStreak,
      studyTime: data.totalTime
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function calculateLanguageProgress(sessions: any[]) {
  const languageMap = new Map<string, {
    name: string;
    code: string;
    sessions: number;
    totalQuestions: number;
    totalCorrect: number;
    wordsLearned: Set<string>;
    lastSession: string;
  }>();

  sessions.forEach(session => {
    if (!session.language) return;
    
    const key = session.language.code;
    const existing = languageMap.get(key) || {
      name: session.language.name,
      code: session.language.code,
      sessions: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      wordsLearned: new Set(),
      lastSession: session.created_at
    };

    languageMap.set(key, {
      ...existing,
      sessions: existing.sessions + 1,
      totalQuestions: existing.totalQuestions + (session.total_questions || 0),
      totalCorrect: existing.totalCorrect + (session.correct_answers || 0),
      lastSession: session.created_at > existing.lastSession ? session.created_at : existing.lastSession
    });
  });

  return Array.from(languageMap.values()).map(lang => ({
    language: lang.name,
    code: lang.code,
    sessions: lang.sessions,
    accuracy: lang.totalQuestions > 0 ? (lang.totalCorrect / lang.totalQuestions) * 100 : 0,
    wordsLearned: lang.wordsLearned.size,
    lastSession: lang.lastSession
  }));
}

function calculateBucketPerformance(attempts: any[]) {
  const bucketMap = new Map<number, {
    correct: number;
    total: number;
    totalResponseTime: number;
  }>();

  attempts.forEach(attempt => {
    const bucket = attempt.bucket_at_time || 0;
    const existing = bucketMap.get(bucket) || { correct: 0, total: 0, totalResponseTime: 0 };
    
    bucketMap.set(bucket, {
      correct: existing.correct + (attempt.is_correct ? 1 : 0),
      total: existing.total + 1,
      totalResponseTime: existing.totalResponseTime + (attempt.response_time_ms || 0)
    });
  });

  return Array.from(bucketMap.entries()).map(([bucket, data]) => ({
    bucket,
    bucketName: ['New', 'Learning', 'Learning+', 'Review', 'Review+', 'Mastered'][bucket] || 'Unknown',
    accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
    totalQuestions: data.total,
    avgResponseTime: data.total > 0 ? data.totalResponseTime / data.total : 0
  })).sort((a, b) => a.bucket - b.bucket);
}

function calculateTimeOfDayStats(sessions: any[]) {
  const hourMap = new Map<number, { sessions: number; totalCorrect: number; totalQuestions: number }>();

  sessions.forEach(session => {
    const hour = new Date(session.created_at).getHours();
    const existing = hourMap.get(hour) || { sessions: 0, totalCorrect: 0, totalQuestions: 0 };
    
    hourMap.set(hour, {
      sessions: existing.sessions + 1,
      totalCorrect: existing.totalCorrect + (session.correct_answers || 0),
      totalQuestions: existing.totalQuestions + (session.total_questions || 0)
    });
  });

  return Array.from(hourMap.entries()).map(([hour, data]) => ({
    hour,
    sessions: data.sessions,
    accuracy: data.totalQuestions > 0 ? (data.totalCorrect / data.totalQuestions) * 100 : 0
  })).sort((a, b) => a.hour - b.hour);
}

function calculateStreakHistory(sessions: any[]) {
  const dailyStreaks = new Map<string, { streak: number; sessions: number }>();

  sessions.forEach(session => {
    const date = new Date(session.created_at).toISOString().split('T')[0];
    const existing = dailyStreaks.get(date) || { streak: 0, sessions: 0 };
    
    dailyStreaks.set(date, {
      streak: Math.max(existing.streak, session.streak || 0),
      sessions: existing.sessions + 1
    });
  });

  return Array.from(dailyStreaks.entries())
    .map(([date, data]) => ({
      date,
      streak: data.streak,
      sessions: data.sessions
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function calculateWeeklyProgress(sessions: any[]) {
  const weekMap = new Map<string, {
    sessions: number;
    totalQuestions: number;
    totalCorrect: number;
  }>();

  sessions.forEach(session => {
    const date = new Date(session.created_at);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    const weekKey = weekStart.toISOString().split('T')[0];
    
    const existing = weekMap.get(weekKey) || { sessions: 0, totalQuestions: 0, totalCorrect: 0 };
    
    weekMap.set(weekKey, {
      sessions: existing.sessions + 1,
      totalQuestions: existing.totalQuestions + (session.total_questions || 0),
      totalCorrect: existing.totalCorrect + (session.correct_answers || 0)
    });
  });

  return Array.from(weekMap.entries())
    .map(([week, data]) => ({
      week,
      sessions: data.sessions,
      accuracy: data.totalQuestions > 0 ? (data.totalCorrect / data.totalQuestions) * 100 : 0,
      questionsAnswered: data.totalQuestions
    }))
    .sort((a, b) => new Date(b.week).getTime() - new Date(a.week).getTime())
    .slice(0, 8); // Last 8 weeks
}
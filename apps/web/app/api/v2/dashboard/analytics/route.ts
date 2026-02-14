import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  console.log('[Analytics API] Starting request');
  const supabase = createClient();

  // Check authentication
  console.log('[Analytics API] Checking authentication...');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('[Analytics API] Auth error:', authError);
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  console.log('[Analytics API] Authenticated user:', user.id);

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '30d';
  const languageCode = searchParams.get('language');
  console.log('[Analytics API] Period:', period, 'Language:', languageCode);

  try {
    // Calculate date range
    let dateFilter = '';
    if (period !== 'all') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      dateFilter = cutoff.toISOString();
      console.log('[Analytics API] Date filter:', dateFilter);
    }

    // Get language info if filtering by language
    let languageInfo = null;
    let languageId = null;
    
    if (languageCode) {
      console.log('[Analytics API] Fetching language info for:', languageCode);
      const { data: langData, error: langError } = await supabase
        .from('languages')
        .select('id, name, code')
        .eq('code', languageCode)
        .single();
      
      if (langError || !langData) {
        console.error('[Analytics API] Language not found:', languageCode);
        return NextResponse.json({ error: 'Language not found' }, { status: 404 });
      }
      
      languageInfo = langData;
      languageId = langData.id;
      console.log('[Analytics API] Language found:', languageInfo);
    }

    // Get all quiz sessions for the user in the period
    console.log('[Analytics API] Fetching quiz sessions...');
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
        languages(name, code)
      `)
      .eq('user_id', user.id)
      .not('completed_at', 'is', null)
      .order('created_at', { ascending: false });

    if (dateFilter) {
      sessionQuery = sessionQuery.gte('created_at', dateFilter);
    }
    
    if (languageId) {
      sessionQuery = sessionQuery.eq('language_id', languageId);
    }

    const { data: sessions, error: sessionsError } = await sessionQuery;

    if (sessionsError) {
      console.error('[Analytics API] Error fetching sessions:', sessionsError);
      console.error('[Analytics API] Sessions error details:', {
        message: sessionsError.message,
        details: sessionsError.details,
        hint: sessionsError.hint,
        code: sessionsError.code
      });
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }
    console.log('[Analytics API] Sessions fetched:', sessions?.length || 0);

    // Get all quiz attempts in the period for detailed analysis
    console.log('[Analytics API] Fetching quiz attempts...');
    let attemptsQuery = supabase
      .from('quiz_attempts')
      .select(`
        id,
        word_id,
        session_id,
        is_correct,
        response_time_ms,
        bucket_at_time,
        created_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dateFilter) {
      attemptsQuery = attemptsQuery.gte('created_at', dateFilter);
    }
    
    // If filtering by language, only get attempts from sessions of that language
    if (languageId && sessions) {
      const sessionIds = sessions.map(s => s.id);
      if (sessionIds.length > 0) {
        attemptsQuery = attemptsQuery.in('session_id', sessionIds);
      }
    }

    const { data: attempts, error: attemptsError } = await attemptsQuery;

    if (attemptsError) {
      console.error('[Analytics API] Error fetching attempts:', attemptsError);
      console.error('[Analytics API] Attempts error details:', {
        message: attemptsError.message,
        details: attemptsError.details,
        hint: attemptsError.hint,
        code: attemptsError.code
      });
      return NextResponse.json({ error: 'Failed to fetch attempts' }, { status: 500 });
    }
    console.log('[Analytics API] Attempts fetched:', attempts?.length || 0);

    // Get current spaced repetition states for word counts
    console.log('[Analytics API] Fetching spaced repetition states...');
    let statesQuery = supabase
      .from('spaced_repetition_states')
      .select('bucket, word_id, words!inner(language_id)')
      .eq('user_id', user.id);
    
    if (languageId) {
      statesQuery = statesQuery.eq('words.language_id', languageId);
    }
    
    const { data: states, error: statesError } = await statesQuery;

    if (statesError) {
      console.error('[Analytics API] Error fetching states:', statesError);
      console.error('[Analytics API] States error details:', {
        message: statesError.message,
        details: statesError.details,
        hint: statesError.hint,
        code: statesError.code
      });
    }
    console.log('[Analytics API] States fetched:', states?.length || 0);

    // Calculate overview statistics
    console.log('[Analytics API] Calculating statistics...');
    const totalSessions = sessions?.length || 0;
    const totalQuestions = sessions?.reduce((sum, s) => sum + (s.total_questions || 0), 0) || 0;
    const totalCorrect = sessions?.reduce((sum, s) => sum + (s.correct_answers || 0), 0) || 0;
    const overallAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    console.log('[Analytics API] Stats:', { totalSessions, totalQuestions, totalCorrect, overallAccuracy });
    
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
    const performanceByBucket = calculateBucketPerformance(attempts || null);

    // Calculate time of day statistics
    const timeOfDayStats = calculateTimeOfDayStats(sessions || []);

    // Calculate streak history
    const streakHistory = calculateStreakHistory(sessions || []);

    // Calculate weekly progress
    const weeklyProgress = calculateWeeklyProgress(sessions || []);

    // Get word statistics if filtering by language
    let wordStats = null;
    if (languageId) {
      console.log('[Analytics API] Fetching word statistics...');
      
      // Get all attempts grouped by word
      const { data: wordAttempts, error: wordError } = await supabase
        .from('quiz_attempts')
        .select(`
          word_id,
          is_correct,
          response_time_ms,
          created_at,
          words!inner(
            id,
            word,
            language_id
          )
        `)
        .eq('user_id', user.id)
        .eq('words.language_id', languageId)
        .order('created_at', { ascending: false });
      
      if (!wordError && wordAttempts) {
        // Get current bucket states
        const { data: bucketStates } = await supabase
          .from('spaced_repetition_states')
          .select('word_id, bucket')
          .eq('user_id', user.id);
        
        const bucketMap = new Map(bucketStates?.map(s => [s.word_id, s.bucket]) || []);
        
        // Process word statistics
        const wordStatsMap = new Map<string, any>();
        
        wordAttempts.forEach(attempt => {
          const wordId = attempt.word_id;
          const word = attempt.words as any;

          if (!wordStatsMap.has(wordId)) {
            wordStatsMap.set(wordId, {
              id: wordId,
              word: word.word,
              totalAttempts: 0,
              correctAttempts: 0,
              failedAttempts: 0,
              totalResponseTime: 0,
              lastSeen: attempt.created_at,
              bucket: bucketMap.get(wordId) || 0
            });
          }
          
          const stats = wordStatsMap.get(wordId);
          stats.totalAttempts++;
          if (attempt.is_correct) {
            stats.correctAttempts++;
          } else {
            stats.failedAttempts++;
          }
          stats.totalResponseTime += attempt.response_time_ms || 0;
          if (attempt.created_at > stats.lastSeen) {
            stats.lastSeen = attempt.created_at;
          }
        });
        
        // Convert to array and calculate derived stats
        wordStats = Array.from(wordStatsMap.values())
          .map(stats => ({
            ...stats,
            accuracy: stats.totalAttempts > 0 ? (stats.correctAttempts / stats.totalAttempts) * 100 : 0,
            avgResponseTime: stats.totalAttempts > 0 ? Math.round(stats.totalResponseTime / stats.totalAttempts) : 0
          }))
          .sort((a, b) => b.totalAttempts - a.totalAttempts)
          .slice(0, 50); // Top 50 most attempted words
      }
      
      console.log('[Analytics API] Word stats fetched:', wordStats?.length || 0);
    }

    const response = {
      overview,
      recentActivity,
      languageProgress,
      performanceByBucket,
      timeOfDayStats,
      streakHistory,
      weeklyProgress,
      wordStats,
      languageInfo
    };

    console.log('[Analytics API] Success! Returning response');
    console.log('[Analytics API] Response overview:', overview);
    
    return NextResponse.json(response);

  } catch (error) {
    console.error('[Analytics API] Unexpected error:', error);
    console.error('[Analytics API] Error stack:', (error as Error).stack);
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
    if (!session.languages) return;
    
    const key = session.languages.code;
    const existing = languageMap.get(key) || {
      name: session.languages.name,
      code: session.languages.code,
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

function calculateBucketPerformance(attempts: any[] | null) {
  if (!attempts || attempts.length === 0) {
    return [];
  }

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
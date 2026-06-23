import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import {
  languages as languagesT,
  quizAttempts,
  quizSessions,
  spacedRepetitionStates,
  words as wordsT,
} from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  // Check authentication
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '30d';
  const languageCode = searchParams.get('language');

  try {
    // Calculate date range
    let dateFilter = '';
    if (period !== 'all') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      dateFilter = cutoff.toISOString();
    }

    // Get language info if filtering by language
    let languageInfo: { id: string; name: string; code: string } | null = null;
    let languageId: string | null = null;

    if (languageCode) {
      const langRows = await db
        .select({ id: languagesT.id, name: languagesT.name, code: languagesT.code })
        .from(languagesT)
        .where(eq(languagesT.code, languageCode))
        .limit(1);

      if (!langRows[0]) {
        return NextResponse.json({ error: 'Language not found' }, { status: 404 });
      }

      languageInfo = langRows[0];
      languageId = langRows[0].id;
    }

    // Get all completed quiz sessions for the user in the period (+ language)
    let sessions: any[];
    try {
      const sessionFilters = [
        eq(quizSessions.userId, user!.id),
        isNotNull(quizSessions.completedAt),
      ];
      if (dateFilter) sessionFilters.push(gte(quizSessions.createdAt, dateFilter));
      if (languageId) sessionFilters.push(eq(quizSessions.languageId, languageId));

      const sessionRows = await db
        .select({
          id: quizSessions.id,
          language_id: quizSessions.languageId,
          total_questions: quizSessions.totalQuestions,
          correct_answers: quizSessions.correctAnswers,
          accuracy_percentage: quizSessions.accuracyPercentage,
          streak: quizSessions.streak,
          avg_response_time_ms: quizSessions.avgResponseTimeMs,
          created_at: quizSessions.createdAt,
          completed_at: quizSessions.completedAt,
          lang_name: languagesT.name,
          lang_code: languagesT.code,
        })
        .from(quizSessions)
        .leftJoin(languagesT, eq(quizSessions.languageId, languagesT.id))
        .where(and(...sessionFilters))
        .orderBy(desc(quizSessions.createdAt));

      sessions = sessionRows.map((s) => ({
        ...s,
        languages: s.lang_name ? { name: s.lang_name, code: s.lang_code } : null,
      }));
    } catch (sessionsError) {
      console.error('Analytics: error fetching sessions:', sessionsError);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    // Get all quiz attempts in the period for detailed analysis.
    // Filter by the word's language directly. (Filtering attempts through
    // session_id undercounts, since sessions are often left incomplete.)
    let attempts: any[];
    try {
      const attemptFilters = [eq(quizAttempts.userId, user!.id)];
      if (dateFilter) attemptFilters.push(gte(quizAttempts.createdAt, dateFilter));
      if (languageId) attemptFilters.push(eq(wordsT.languageId, languageId));

      attempts = await db
        .select({
          id: quizAttempts.id,
          word_id: quizAttempts.wordId,
          session_id: quizAttempts.sessionId,
          is_correct: quizAttempts.isCorrect,
          response_time_ms: quizAttempts.responseTimeMs,
          bucket_at_time: quizAttempts.bucketAtTime,
          created_at: quizAttempts.createdAt,
        })
        .from(quizAttempts)
        .innerJoin(wordsT, eq(quizAttempts.wordId, wordsT.id))
        .where(and(...attemptFilters))
        .orderBy(desc(quizAttempts.createdAt));
    } catch (attemptsError) {
      console.error('Analytics: error fetching attempts:', attemptsError);
      return NextResponse.json({ error: 'Failed to fetch attempts' }, { status: 500 });
    }

    // Get current spaced repetition states for word counts
    let states: Array<{ bucket: number; word_id: string }> = [];
    try {
      const stateFilters = [eq(spacedRepetitionStates.userId, user!.id)];
      if (languageId) stateFilters.push(eq(wordsT.languageId, languageId));
      states = await db
        .select({ bucket: spacedRepetitionStates.bucket, word_id: spacedRepetitionStates.wordId })
        .from(spacedRepetitionStates)
        .innerJoin(wordsT, eq(spacedRepetitionStates.wordId, wordsT.id))
        .where(and(...stateFilters));
    } catch (statesError) {
      console.error('Analytics: error fetching states:', statesError);
    }

    // Calculate overview statistics from attempts (the real activity record;
    // sessions are frequently left incomplete and would read as zero).
    const totalQuestions = attempts?.length || 0;
    const totalCorrect = attempts?.filter((a) => a.is_correct).length || 0;
    const overallAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

    // Distinct active days double as a "sessions" estimate + the streak basis.
    const activeDays = new Set(
      (attempts || [])
        .map((a) => (a.created_at ? new Date(a.created_at).toDateString() : ''))
        .filter(Boolean),
    );
    const totalSessions = activeDays.size;
    const currentStreak = streakFromDays(activeDays);
    const longestStreak = currentStreak; // simplified — historical longest not tracked per-day
    const totalStudyTime = Math.round(totalQuestions * 0.5); // ~30s per question

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
      // Get all attempts grouped by word (joined to the word for its text)
      let wordAttempts: any[] | null = null;
      try {
        wordAttempts = await db
          .select({
            word_id: quizAttempts.wordId,
            is_correct: quizAttempts.isCorrect,
            response_time_ms: quizAttempts.responseTimeMs,
            created_at: quizAttempts.createdAt,
            words: { id: wordsT.id, word: wordsT.word, language_id: wordsT.languageId },
          })
          .from(quizAttempts)
          .innerJoin(wordsT, eq(quizAttempts.wordId, wordsT.id))
          .where(and(eq(quizAttempts.userId, user!.id), eq(wordsT.languageId, languageId)))
          .orderBy(desc(quizAttempts.createdAt));
      } catch (wordError) {
        console.error('Analytics: error fetching word attempts:', wordError);
      }

      if (wordAttempts) {
        // Get current bucket states
        const bucketStates = await db
          .select({ word_id: spacedRepetitionStates.wordId, bucket: spacedRepetitionStates.bucket })
          .from(spacedRepetitionStates)
          .where(eq(spacedRepetitionStates.userId, user!.id));

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

    return NextResponse.json(response);

  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Consecutive-day streak ending today or yesterday, from a set of date strings. */
function streakFromDays(days: Set<string>): number {
  if (days.size === 0) return 0;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (!days.has(today) && !days.has(yesterday)) return 0;
  let streak = 0;
  let cursor = new Date(days.has(today) ? Date.now() : Date.now() - 86_400_000);
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor = new Date(cursor.getTime() - 86_400_000);
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
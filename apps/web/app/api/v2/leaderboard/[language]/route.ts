import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function calculateStreakFromDaily(dailyActivity: Map<string, number>): number {
  if (dailyActivity.size === 0) return 0;
  
  let streak = 0;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
  
  // Start from today or yesterday
  let checkDate = new Date();
  if (!dailyActivity.has(today) && !dailyActivity.has(yesterday)) {
    return 0;
  }
  
  if (!dailyActivity.has(today)) {
    checkDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
  
  // Count consecutive days
  while (dailyActivity.has(checkDate.toDateString())) {
    streak++;
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return streak;
}

export async function GET(request: NextRequest, { params }: { params: { language: string } }) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'week';
  const languageCode = params.language;

  console.log('[Leaderboard API] Fetching for language:', languageCode, 'period:', period);

  try {
    // Get language info
    const { data: langData, error: langError } = await supabase
      .from('languages')
      .select('id, name, code')
      .eq('code', languageCode)
      .single();

    if (langError || !langData) {
      return NextResponse.json({ error: 'Language not found' }, { status: 404 });
    }

    const languageId = langData.id;

    // Calculate date range for period filtering
    let dateFilter = '';
    const now = new Date();
    
    switch (period) {
      case 'day':
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter = today.toISOString();
        break;
      case 'week':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        dateFilter = startOfWeek.toISOString();
        break;
      case 'month':
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = startOfMonth.toISOString();
        break;
      case 'year':
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        dateFilter = startOfYear.toISOString();
        break;
      default:
        dateFilter = '';
    }

    console.log('[Leaderboard API] Date filter:', dateFilter);

    // Get all users who have quiz attempts in this language for the period
    let attemptsQuery = supabase
      .from('quiz_attempts')
      .select(`
        user_id,
        is_correct,
        response_time_ms,
        created_at,
        words!inner(language_id)
      `)
      .eq('words.language_id', languageId);

    if (dateFilter) {
      attemptsQuery = attemptsQuery.gte('created_at', dateFilter);
    }

    const { data: attempts, error: attemptsError } = await attemptsQuery;

    if (attemptsError) {
      console.error('[Leaderboard API] Error fetching attempts:', attemptsError);
      return NextResponse.json({ error: 'Failed to fetch leaderboard data' }, { status: 500 });
    }

    console.log('[Leaderboard API] Attempts found:', attempts?.length || 0);

    // Get spaced repetition states for word counts
    const { data: states, error: statesError } = await supabase
      .from('spaced_repetition_states')
      .select(`
        user_id,
        word_id,
        bucket,
        words!inner(language_id)
      `)
      .eq('words.language_id', languageId);

    if (statesError) {
      console.error('[Leaderboard API] Error fetching states:', statesError);
    }

    // Process user statistics
    const userStatsMap = new Map<string, any>();

    // Process quiz attempts data
    attempts?.forEach(attempt => {
      const userId = attempt.user_id;
      
      if (!userStatsMap.has(userId)) {
        userStatsMap.set(userId, {
          userId,
          totalQuestions: 0,
          correctAnswers: 0,
          responseTimes: [],
          lastActivity: attempt.created_at,
          dailyActivity: new Map()
        });
      }

      const stats = userStatsMap.get(userId);
      stats.totalQuestions++;
      if (attempt.is_correct) {
        stats.correctAnswers++;
      }
      
      if (attempt.response_time_ms) {
        stats.responseTimes.push(attempt.response_time_ms);
      }

      if (attempt.created_at > stats.lastActivity) {
        stats.lastActivity = attempt.created_at;
      }

      // Track daily activity for sessions estimation
      const day = new Date(attempt.created_at).toDateString();
      if (!stats.dailyActivity.has(day)) {
        stats.dailyActivity.set(day, 0);
      }
      stats.dailyActivity.set(day, stats.dailyActivity.get(day) + 1);
    });

    // Process word learning states
    const wordCountsByUser = new Map<string, { learned: number; mastered: number }>();
    states?.forEach(state => {
      const userId = state.user_id;
      if (!wordCountsByUser.has(userId)) {
        wordCountsByUser.set(userId, { learned: 0, mastered: 0 });
      }
      
      const counts = wordCountsByUser.get(userId)!;
      if (state.bucket >= 1) counts.learned++;
      if (state.bucket >= 5) counts.mastered++;
    });

    // Get real usernames from user_profiles table
    const userIds = Array.from(userStatsMap.keys());
    const usernamesMap = new Map<string, string>();
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, username, display_name')
        .in('user_id', userIds);
      
      profiles?.forEach(profile => {
        // Use display_name if available, otherwise username
        const displayName = profile.display_name || profile.username;
        usernamesMap.set(profile.user_id, displayName);
      });
      
      // Fallback for users without profiles
      userIds.forEach(userId => {
        if (!usernamesMap.has(userId)) {
          usernamesMap.set(userId, `User${userId.substring(0, 8)}`);
        }
      });
    }

    // Calculate final stats and points for each user
    const leaderboardEntries = userIds.map(userId => {
      const stats = userStatsMap.get(userId)!;
      const wordCounts = wordCountsByUser.get(userId) || { learned: 0, mastered: 0 };
      
      const accuracy = stats.totalQuestions > 0 ? (stats.correctAnswers / stats.totalQuestions) * 100 : 0;
      const avgResponseTime = stats.responseTimes.length > 0 
        ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length 
        : 0;
      
      // Estimate sessions from daily activity
      const totalSessions = stats.dailyActivity.size;
      
      // Calculate streak from daily activity
      const currentStreak = calculateStreakFromDaily(stats.dailyActivity);
      const longestStreak = currentStreak; // Simplified

      // Estimate study time (30 seconds per question)
      const totalStudyTime = Math.round(stats.totalQuestions * 0.5);

      // Calculate points (same formula as overview)
      const points = Math.round(
        (stats.correctAnswers * 10) + // 10 points per correct answer
        (accuracy * 5) + // Bonus for accuracy
        (currentStreak * 50) + // Streak bonus
        (wordCounts.mastered * 100) + // Mastery bonus
        (totalSessions * 20) // Session completion bonus
      );

      return {
        userId,
        username: usernamesMap.get(userId) || `User${userId.substring(0, 8)}`,
        totalSessions,
        totalQuestions: stats.totalQuestions,
        correctAnswers: stats.correctAnswers,
        accuracy,
        totalStudyTime,
        wordsLearned: wordCounts.learned,
        wordsMastered: wordCounts.mastered,
        currentStreak,
        longestStreak,
        avgResponseTime: Math.round(avgResponseTime),
        points,
        isCurrentUser: userId === user.id
      };
    });

    // Sort by points (descending) and assign ranks
    leaderboardEntries.sort((a, b) => b.points - a.points);
    
    const rankedEntries = leaderboardEntries.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

    // Find current user's rank
    const currentUserEntry = rankedEntries.find(entry => entry.isCurrentUser);
    const currentUserRank = currentUserEntry?.rank;

    // Calculate period statistics
    const periodStats = {
      totalQuestions: rankedEntries.reduce((sum, entry) => sum + entry.totalQuestions, 0),
      totalSessions: rankedEntries.reduce((sum, entry) => sum + entry.totalSessions, 0),
      averageAccuracy: rankedEntries.length > 0 
        ? rankedEntries.reduce((sum, entry) => sum + entry.accuracy, 0) / rankedEntries.length 
        : 0
    };

    const response = {
      leaderboard: rankedEntries.slice(0, 100), // Top 100
      currentUserRank,
      totalParticipants: rankedEntries.length,
      languageInfo: {
        name: langData.name,
        code: langData.code
      },
      periodStats
    };

    console.log('[Leaderboard API] Success! Returning', rankedEntries.length, 'entries');
    return NextResponse.json(response);

  } catch (error) {
    console.error('[Leaderboard API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
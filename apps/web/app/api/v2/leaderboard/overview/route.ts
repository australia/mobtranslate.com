import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface LanguageLeaderboard {
  languageId: string;
  languageName: string;
  languageCode: string;
  champion: {
    userId: string;
    username: string;
    points: number;
    accuracy: number;
    totalQuestions: number;
    currentStreak: number;
  } | null;
  totalParticipants: number;
  totalQuestions: number;
  averageAccuracy: number;
  lastActivity: string | null;
}

function calculateStreakFromDaily(dailyActivity: Map<string, number>): number {
  if (dailyActivity.size === 0) return 0;
  
  const sortedDays = Array.from(dailyActivity.keys()).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );
  
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

export async function GET(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'week';

  console.log('[Leaderboard Overview API] Fetching overview for period:', period);

  try {
    // Get all languages
    const { data: languages, error: languagesError } = await supabase
      .from('languages')
      .select('id, name, code')
      .order('name');

    if (languagesError) {
      console.error('[Leaderboard Overview API] Error fetching languages:', languagesError);
      return NextResponse.json({ error: 'Failed to fetch languages' }, { status: 500 });
    }

    // Calculate date range for period filtering
    let dateFilter = '';
    const now = new Date();
    
    switch (period) {
      case 'day': {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateFilter = today.toISOString();
        break;
      }
      case 'week': {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        dateFilter = startOfWeek.toISOString();
        break;
      }
      case 'month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = startOfMonth.toISOString();
        break;
      }
      case 'year': {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        dateFilter = startOfYear.toISOString();
        break;
      }
      default:
        dateFilter = '';
    }

    console.log('[Leaderboard Overview API] Date filter:', dateFilter);

    const leaderboards: LanguageLeaderboard[] = [];

    // Process each language
    for (const language of languages) {
      console.log('[Leaderboard Overview API] Processing language:', language.name);

      // Get quiz attempts for this language (since sessions aren't being completed properly)
      let attemptsQuery = supabase
        .from('quiz_attempts')
        .select(`
          user_id,
          is_correct,
          response_time_ms,
          created_at,
          words!inner(language_id)
        `)
        .eq('words.language_id', language.id);

      if (dateFilter) {
        attemptsQuery = attemptsQuery.gte('created_at', dateFilter);
      }

      const { data: attempts, error: attemptsError } = await attemptsQuery;

      if (attemptsError) {
        console.error('[Leaderboard Overview API] Error fetching attempts for', language.name, ':', attemptsError);
        continue;
      }

      console.log('[Leaderboard Overview API] Attempts found for', language.name, ':', attempts?.length || 0);

      if (!attempts || attempts.length === 0) {
        leaderboards.push({
          languageId: language.id,
          languageName: language.name,
          languageCode: language.code,
          champion: null,
          totalParticipants: 0,
          totalQuestions: 0,
          averageAccuracy: 0,
          lastActivity: null
        });
        continue;
      }

      // Get spaced repetition states for word counts
      const { data: states } = await supabase
        .from('spaced_repetition_states')
        .select(`
          user_id,
          word_id,
          bucket,
          words!inner(language_id)
        `)
        .eq('words.language_id', language.id);

      // Process user statistics from quiz attempts
      const userStatsMap = new Map<string, any>();

      // Process attempts data
      attempts.forEach(attempt => {
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

      // Calculate final stats and find champion
      let champion = null;
      let maxPoints = 0;

      const userEntries = userIds.map(userId => {
        const stats = userStatsMap.get(userId)!;
        const wordCounts = wordCountsByUser.get(userId) || { learned: 0, mastered: 0 };
        
        const accuracy = stats.totalQuestions > 0 ? (stats.correctAnswers / stats.totalQuestions) * 100 : 0;
        
        // Estimate sessions from daily activity
        const totalSessions = stats.dailyActivity.size;
        
        // Simple streak calculation based on consecutive days
        const currentStreak = calculateStreakFromDaily(stats.dailyActivity);

        // Calculate points using same formula as individual leaderboard
        const points = Math.round(
          (stats.correctAnswers * 10) +
          (accuracy * 5) +
          (currentStreak * 50) +
          (wordCounts.mastered * 100) +
          (totalSessions * 20)
        );

        if (points > maxPoints) {
          maxPoints = points;
          champion = {
            userId,
            username: usernamesMap.get(userId) || `User${userId.substring(0, 8)}`,
            points,
            accuracy,
            totalQuestions: stats.totalQuestions,
            currentStreak
          };
        }

        return {
          userId,
          points,
          accuracy,
          totalQuestions: stats.totalQuestions,
          lastActivity: stats.lastActivity
        };
      });

      // Calculate aggregate stats
      const totalQuestions = attempts.length;
      const totalCorrect = attempts.filter(a => a.is_correct).length;
      const averageAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
      const lastActivity = userEntries.length > 0 
        ? userEntries.reduce((latest, entry) => 
            entry.lastActivity > latest ? entry.lastActivity : latest, 
            userEntries[0].lastActivity
          )
        : null;

      leaderboards.push({
        languageId: language.id,
        languageName: language.name,
        languageCode: language.code,
        champion,
        totalParticipants: userIds.length,
        totalQuestions,
        averageAccuracy,
        lastActivity
      });
    }

    // Sort by total participants and activity
    leaderboards.sort((a, b) => {
      if (a.totalParticipants !== b.totalParticipants) {
        return b.totalParticipants - a.totalParticipants;
      }
      if (a.lastActivity && b.lastActivity) {
        return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
      }
      return a.languageName.localeCompare(b.languageName);
    });

    const response = {
      leaderboards: leaderboards.filter(l => l.totalParticipants > 0), // Only show languages with activity
      allLanguages: leaderboards, // Include all for reference
      period,
      totalLanguages: leaderboards.filter(l => l.totalParticipants > 0).length,
      totalParticipants: leaderboards.reduce((sum, l) => sum + l.totalParticipants, 0),
      generatedAt: new Date().toISOString()
    };

    console.log('[Leaderboard Overview API] Success! Returning', response.leaderboards.length, 'active languages');
    return NextResponse.json(response);

  } catch (error) {
    console.error('[Leaderboard Overview API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
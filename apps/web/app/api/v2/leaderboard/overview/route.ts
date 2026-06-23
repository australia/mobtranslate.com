import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  languages as languagesT,
  quizAttempts as quizAttemptsT,
  spacedRepetitionStates as spacedRepetitionStatesT,
  userProfiles as userProfilesT,
  words as wordsT,
} from '@/lib/db/schema';

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
  
  const _sortedDays = Array.from(dailyActivity.keys()).sort((a, b) =>
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
  // Public leaderboard: aggregate every learner's quiz activity. RLS is gone in
  // the self-hosted DB, so a plain read sees all rows (no per-viewer scoping).

  // Leaderboard is publicly accessible - no auth required
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'all';

  try {
    // Get all languages
    const languages = await db
      .select({ id: languagesT.id, name: languagesT.name, code: languagesT.code })
      .from(languagesT)
      .orderBy(asc(languagesT.name));

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

    const leaderboards: LanguageLeaderboard[] = [];

    // Process each language
    for (const language of languages) {
      // Get quiz attempts for this language (since sessions aren't being completed properly)
      const attemptFilters = [eq(wordsT.languageId, language.id)];
      if (dateFilter) {
        attemptFilters.push(gte(quizAttemptsT.createdAt, dateFilter));
      }

      const attempts = await db
        .select({
          user_id: quizAttemptsT.userId,
          is_correct: quizAttemptsT.isCorrect,
          response_time_ms: quizAttemptsT.responseTimeMs,
          created_at: quizAttemptsT.createdAt,
        })
        .from(quizAttemptsT)
        .innerJoin(wordsT, eq(quizAttemptsT.wordId, wordsT.id))
        .where(and(...attemptFilters));

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
      const states = await db
        .select({
          user_id: spacedRepetitionStatesT.userId,
          word_id: spacedRepetitionStatesT.wordId,
          bucket: spacedRepetitionStatesT.bucket,
        })
        .from(spacedRepetitionStatesT)
        .innerJoin(wordsT, eq(spacedRepetitionStatesT.wordId, wordsT.id))
        .where(eq(wordsT.languageId, language.id));

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
        const profiles = await db
          .select({
            user_id: userProfilesT.userId,
            username: userProfilesT.username,
            display_name: userProfilesT.displayName,
          })
          .from(userProfilesT)
          .where(inArray(userProfilesT.userId, userIds));

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

    return NextResponse.json(response);

  } catch (error) {
    console.error('Leaderboard overview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
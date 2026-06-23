import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import {
  languages as languagesT,
  quizAttempts,
  quizSessions,
  spacedRepetitionStates,
  userQuizProgress,
  words as wordsT,
} from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get('language');
  const period = searchParams.get('period') || '7d'; // 7d, 30d, all

  try {
    // Get language filter
    let languageId: string | null = null;
    if (languageCode) {
      const langRows = await db
        .select({ id: languagesT.id })
        .from(languagesT)
        .where(eq(languagesT.code, languageCode))
        .limit(1);
      languageId = langRows[0]?.id ?? null;
    }

    if (languageCode && languageId) {
      // Get specific language progress from spaced repetition states
      const stateRows = await db
        .select({
          bucket: spacedRepetitionStates.bucket,
          streak: spacedRepetitionStates.streak,
          total_attempts: spacedRepetitionStates.totalAttempts,
          correct_attempts: spacedRepetitionStates.correctAttempts,
          due_date: spacedRepetitionStates.dueDate,
        })
        .from(spacedRepetitionStates)
        .innerJoin(wordsT, eq(spacedRepetitionStates.wordId, wordsT.id))
        .where(
          and(
            eq(spacedRepetitionStates.userId, user!.id),
            eq(wordsT.languageId, languageId)
          )
        );

      const states = stateRows;
      const now = new Date();
      const summary = {
        language_code: languageCode,
        total_words: states.length,
        new_words: states.filter(s => s.bucket === 0).length,
        learning_words: states.filter(s => s.bucket >= 1 && s.bucket <= 2).length,
        review_words: states.filter(s => s.bucket >= 3 && s.bucket <= 4).length,
        mastered_words: states.filter(s => s.bucket === 5).length,
        due_for_review: states.filter(s => new Date(s.due_date) <= now).length,
        best_streak: Math.max(...(states.map(s => s.streak) || [0]), 0),
        avg_accuracy: states.length ?
          (states.reduce((sum, s) => sum + (s.total_attempts > 0 ? s.correct_attempts / s.total_attempts : 0), 0) / states.length * 100) : 0
      };

      // Get recent session stats
      const sessionFilters = [eq(quizSessions.userId, user!.id)];
      sessionFilters.push(eq(quizSessions.languageId, languageId));
      if (period !== 'all') {
        const days = period === '7d' ? 7 : 30;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        sessionFilters.push(gte(quizSessions.createdAt, cutoff.toISOString()));
      }

      const sessions = await db
        .select({
          accuracy_percentage: quizSessions.accuracyPercentage,
          streak: quizSessions.streak,
          total_questions: quizSessions.totalQuestions,
          correct_answers: quizSessions.correctAnswers,
          created_at: quizSessions.createdAt,
        })
        .from(quizSessions)
        .where(and(...sessionFilters))
        .orderBy(desc(quizSessions.createdAt))
        .limit(50);

      // Calculate session-based stats
      const sessionStats = {
        total_sessions: sessions.length,
        avg_session_accuracy: sessions.length ?
          (sessions.reduce((sum, s) => sum + (Number(s.accuracy_percentage) || 0), 0) / sessions.length) : 0,
        best_session_streak: Math.max(...(sessions.map(s => s.streak || 0) || [0]), 0),
        total_questions_answered: sessions.reduce((sum, s) => sum + (s.total_questions || 0), 0) || 0,
        recent_sessions: sessions.slice(0, 10).map(s => ({
          accuracy: s.accuracy_percentage,
          streak: s.streak,
          questions: s.total_questions,
          correct: s.correct_answers,
          date: s.created_at
        }))
      };

      return NextResponse.json({
        summary,
        sessions: sessionStats,
        period
      });
    }

    // Get overall progress (all languages) from the user_quiz_progress view
    const progress = await db
      .select()
      .from(userQuizProgress)
      .where(eq(userQuizProgress.userId, user!.id));

    // Aggregate across all languages
    const overallSummary = progress.reduce((acc, lang) => ({
      total_words: acc.total_words + (Number(lang.totalWords) || 0),
      new_words: acc.new_words + (Number(lang.newWords) || 0),
      learning_words: acc.learning_words + (Number(lang.learningWords) || 0),
      review_words: acc.review_words + (Number(lang.reviewWords) || 0),
      mastered_words: acc.mastered_words + (Number(lang.masteredWords) || 0),
      due_for_review: acc.due_for_review + (Number(lang.dueForReview) || 0),
      best_streak: Math.max(acc.best_streak, lang.bestStreak || 0),
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
    });

    // Get recent activity
    const activityFilters = [eq(quizSessions.userId, user!.id)];
    if (period !== 'all') {
      const days = period === '7d' ? 7 : 30;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      activityFilters.push(gte(quizSessions.createdAt, cutoff.toISOString()));
    }

    const recentActivity = await db
      .select({
        id: quizSessions.id,
        accuracy_percentage: quizSessions.accuracyPercentage,
        streak: quizSessions.streak,
        total_questions: quizSessions.totalQuestions,
        correct_answers: quizSessions.correctAnswers,
        created_at: quizSessions.createdAt,
        language_name: languagesT.name,
        language_code: languagesT.code,
      })
      .from(quizSessions)
      .leftJoin(languagesT, eq(quizSessions.languageId, languagesT.id))
      .where(and(...activityFilters))
      .orderBy(desc(quizSessions.createdAt))
      .limit(20);

    // Calculate streak days (consecutive days with quiz activity)
    const dailyActivity = await db
      .select({ created_at: quizSessions.createdAt })
      .from(quizSessions)
      .where(
        and(
          eq(quizSessions.userId, user!.id),
          gte(quizSessions.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        )
      )
      .orderBy(desc(quizSessions.createdAt));

    let streakDays = 0;
    if (dailyActivity.length) {
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

    // Calculate recent performance stats
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get attempts for last 7 and 30 days
    const last7DaysAttempts = await db
      .select({ is_correct: quizAttempts.isCorrect })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, user!.id),
          gte(quizAttempts.createdAt, sevenDaysAgo.toISOString())
        )
      );

    const last30DaysAttempts = await db
      .select({ is_correct: quizAttempts.isCorrect })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, user!.id),
          gte(quizAttempts.createdAt, thirtyDaysAgo.toISOString())
        )
      );

    const last7DaysStats = {
      attempts: last7DaysAttempts.length,
      correct: last7DaysAttempts.filter(a => a.is_correct).length,
      accuracy: last7DaysAttempts.length ?
        ((last7DaysAttempts.filter(a => a.is_correct).length / last7DaysAttempts.length) * 100) : 0
    };

    const last30DaysStats = {
      attempts: last30DaysAttempts.length,
      correct: last30DaysAttempts.filter(a => a.is_correct).length,
      accuracy: last30DaysAttempts.length ?
        ((last30DaysAttempts.filter(a => a.is_correct).length / last30DaysAttempts.length) * 100) : 0
    };

    return NextResponse.json({
      summary: overallSummary,
      streak_days: streakDays,
      recent_activity: recentActivity.map(session => ({
        id: session.id,
        accuracy: session.accuracy_percentage,
        streak: session.streak,
        questions: session.total_questions,
        correct: session.correct_answers,
        language: session.language_name ? { name: session.language_name, code: session.language_code } : null,
        date: session.created_at
      })),
      languages: progress.map(lang => ({
        code: lang.languageCode,
        name: lang.languageName,
        mastered: lang.masteredWords,
        total: lang.totalWords,
        due: lang.dueForReview
      })),
      recent_performance: {
        last_7_days: last7DaysStats,
        last_30_days: last30DaysStats
      },
      period
    });
  } catch (error) {
    console.error('Error fetching quiz stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

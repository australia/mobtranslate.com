import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, lte, count } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow, snakeRows } from '@/lib/db/case';
import { requireRole } from '@/lib/auth-helpers';
import {
  curatorActivities as activitiesT,
  curatorMetrics as metricsT,
  languageCurationSettings as settingsT,
  userProfiles as profilesT,
  words as wordsT,
  wordComments as commentsT,
  wordImprovementSuggestions as wisT,
} from '@/lib/db/schema';

export async function GET(_request: NextRequest, props: { params: Promise<{ languageId: string }> }) {
  const params = await props.params;
  const { languageId } = params;

  try {
    // Check authentication and curator role for this language.
    const { user, response } = await requireRole(
      ['curator', 'dictionary_admin', 'super_admin'],
      languageId
    );
    if (response) {
      // Preserve original error message for the 403 case.
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Forbidden: User is not a curator for this language' },
          { status: 403 }
        );
      }
      return response;
    }

    // Get dashboard stats
    const [
      pendingImprovements,
      recentComments,
      unverifiedWords,
      recentActivity,
      languageSettings,
    ] = await Promise.all([
      // Pending improvements (for words in this language)
      db
        .select({ value: count() })
        .from(wisT)
        .leftJoin(wordsT, eq(wisT.wordId, wordsT.id))
        .where(and(eq(wisT.status, 'pending'), eq(wordsT.languageId, languageId))),

      // Recent comments (last 24 hours, for words in this language)
      db
        .select({ value: count() })
        .from(commentsT)
        .leftJoin(wordsT, eq(commentsT.wordId, wordsT.id))
        .where(
          and(
            gte(commentsT.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
            eq(wordsT.languageId, languageId)
          )
        ),

      // Unverified words
      db
        .select({ value: count() })
        .from(wordsT)
        .where(and(eq(wordsT.languageId, languageId), eq(wordsT.isVerified, false))),

      // Recent curator activity (+ acting user's profile)
      db
        .select({ activity: activitiesT, profile: profilesT })
        .from(activitiesT)
        .leftJoin(profilesT, eq(activitiesT.userId, profilesT.userId))
        .where(eq(activitiesT.languageId, languageId))
        .orderBy(desc(activitiesT.createdAt))
        .limit(10),

      // Language curation settings
      db.select().from(settingsT).where(eq(settingsT.languageId, languageId)).limit(1),
    ]);

    // Words needing review (unverified) — the legacy `words_needing_review` view
    // does not exist in the self-hosted schema, so derive it from unverified words.
    const wordsNeedingReview = await db
      .select()
      .from(wordsT)
      .where(and(eq(wordsT.languageId, languageId), eq(wordsT.isVerified, false)))
      .limit(5);

    // Get curator's recent metrics for the current month.
    const currentMonth = new Date();
    const periodStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const periodEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const curatorMetricsRows = await db
      .select()
      .from(metricsT)
      .where(
        and(
          eq(metricsT.userId, user!.id),
          eq(metricsT.languageId, languageId),
          gte(metricsT.periodStart, periodStart.toISOString()),
          lte(metricsT.periodEnd, periodEnd.toISOString())
        )
      )
      .limit(1);
    const curatorMetrics = curatorMetricsRows[0] ?? null;

    const recentActivityData = recentActivity.map((row) => ({
      ...snakeRow(row.activity),
      user: row.profile
        ? { display_name: row.profile.displayName, avatar_url: row.profile.avatarUrl }
        : null,
    }));

    const dashboardData = {
      stats: {
        pending_improvements: pendingImprovements[0]?.value || 0,
        recent_comments: recentComments[0]?.value || 0,
        unverified_words: unverifiedWords[0]?.value || 0,
      },
      recent_activity: recentActivityData,
      words_needing_review: snakeRows(wordsNeedingReview),
      curator_metrics: curatorMetrics
        ? snakeRow(curatorMetrics)
        : {
            words_reviewed: 0,
            words_approved: 0,
            words_rejected: 0,
            improvements_reviewed: 0,
            comments_moderated: 0,
          },
      language_settings: languageSettings[0] ? snakeRow(languageSettings[0]) : null,
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('Error fetching curator dashboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}

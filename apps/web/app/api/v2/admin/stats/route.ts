import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import {
  curatorActivities as curatorActivitiesT,
  userProfiles as userProfilesT,
  wordComments as wordCommentsT,
  wordImprovementSuggestions as wisT,
  words as wordsT,
} from '@/lib/db/schema';

export async function GET(_request: NextRequest) {
  try {
    // Authz in code (RLS is gone): admin role required.
    const { response } = await requireRole(['super_admin', 'dictionary_admin']);
    if (response) return response;

    const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch various stats
    const [
      totalUsersRows,
      activeUsersRows,
      pendingReviewsRows,
      totalWordsRows,
      totalCommentsRows,
      improvementRows,
      recentActivityRows,
    ] = await Promise.all([
      // Total users
      db.select({ value: count() }).from(userProfilesT),

      // Active users (last 30 days)
      db
        .select({ value: count() })
        .from(userProfilesT)
        .where(gte(userProfilesT.updatedAt, cutoff30)),

      // Pending reviews (unverified words)
      db
        .select({ value: count() })
        .from(wordsT)
        .where(eq(wordsT.isVerified, false)),

      // Total words
      db.select({ value: count() }).from(wordsT),

      // Total comments
      db
        .select({ value: count() })
        .from(wordCommentsT)
        .where(eq(wordCommentsT.isDeleted, false)),

      // Improvement suggestions
      db
        .select({ value: count() })
        .from(wisT)
        .where(eq(wisT.status, 'pending')),

      // Recent activity (last 10 actions) + the actor's profile.
      db
        .select({
          id: curatorActivitiesT.id,
          activity_type: curatorActivitiesT.activityType,
          activity_data: curatorActivitiesT.activityData,
          created_at: curatorActivitiesT.createdAt,
          user_id: curatorActivitiesT.userId,
          display_name: userProfilesT.displayName,
          username: userProfilesT.username,
        })
        .from(curatorActivitiesT)
        .leftJoin(userProfilesT, eq(curatorActivitiesT.userId, userProfilesT.userId))
        .orderBy(desc(curatorActivitiesT.createdAt))
        .limit(10),
    ]);

    const totalUsers = totalUsersRows[0]?.value ?? 0;
    const activeUsers = activeUsersRows[0]?.value ?? 0;
    const pendingReviews = pendingReviewsRows[0]?.value ?? 0;
    const totalWords = totalWordsRows[0]?.value ?? 0;
    const totalComments = totalCommentsRows[0]?.value ?? 0;
    const improvementSuggestions = improvementRows[0]?.value ?? 0;

    const recentActivity = recentActivityRows.map((r) => ({
      id: r.id,
      activity_type: r.activity_type,
      activity_data: r.activity_data,
      created_at: r.created_at,
      user_id: r.user_id,
      profiles: r.display_name || r.username
        ? { display_name: r.display_name, username: r.username }
        : null,
    }));

    // Calculate approval rate (last 30 days)
    const [approvedRows, rejectedRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(curatorActivitiesT)
        .where(
          and(
            inArray(curatorActivitiesT.activityType, ['word_approved', 'improvement_approved']),
            gte(curatorActivitiesT.createdAt, cutoff30)
          )
        ),
      db
        .select({ value: count() })
        .from(curatorActivitiesT)
        .where(
          and(
            inArray(curatorActivitiesT.activityType, ['word_rejected', 'improvement_rejected']),
            gte(curatorActivitiesT.createdAt, cutoff30)
          )
        ),
    ]);

    const approvedCount = approvedRows[0]?.value ?? 0;
    const rejectedCount = rejectedRows[0]?.value ?? 0;
    const totalReviews = approvedCount + rejectedCount;
    const approvalRate = totalReviews > 0 ? Math.round((approvedCount / totalReviews) * 100) : 0;

    return NextResponse.json({
      totalUsers,
      activeUsers,
      pendingReviews,
      totalWords,
      totalComments,
      improvementSuggestions,
      approvalRate,
      recentActivity
    });
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, lte, count } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  curatorActivities as activitiesT,
  languages as languagesT,
  userProfiles as profilesT,
  userRoleAssignments as uraT,
  userRoles as rolesT,
  words as wordsT,
  wordImprovementSuggestions as wisT,
} from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const languageId = searchParams.get('languageId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Check if user is a curator
    const roleAssignments = await db
      .select({ languageId: uraT.languageId, roleId: uraT.roleId, name: rolesT.name })
      .from(uraT)
      .innerJoin(rolesT, eq(uraT.roleId, rolesT.id))
      .where(
        and(
          eq(uraT.userId, user.id),
          eq(uraT.isActive, true),
          inArray(rolesT.name, ['curator', 'dictionary_admin', 'super_admin'])
        )
      );

    if (!roleAssignments || roleAssignments.length === 0) {
      return NextResponse.json({ error: 'Not a curator' }, { status: 403 });
    }

    // Get curator activities for rejected items
    const filters = [
      eq(activitiesT.userId, user.id),
      inArray(activitiesT.activityType, ['word_rejected', 'improvement_rejected']),
    ];
    if (languageId) filters.push(eq(activitiesT.languageId, languageId));
    if (dateFrom) filters.push(gte(activitiesT.createdAt, dateFrom));
    if (dateTo) filters.push(lte(activitiesT.createdAt, dateTo));

    const where = and(...filters);

    const [activityRows, totalRows] = await Promise.all([
      db
        .select({ activity: activitiesT, language: languagesT, profile: profilesT })
        .from(activitiesT)
        .leftJoin(languagesT, eq(activitiesT.languageId, languagesT.id))
        .leftJoin(profilesT, eq(activitiesT.userId, profilesT.userId))
        .where(where)
        .orderBy(desc(activitiesT.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(activitiesT).where(where),
    ]);

    const total = totalRows[0]?.value ?? 0;

    // Enrich activities with target details and analyze rejection reasons
    const rejectionReasons: { [key: string]: number } = {};

    const enrichedActivities = await Promise.all(
      activityRows.map(async (row) => {
        const activity: any = {
          ...snakeRow(row.activity),
          languages: row.language ? snakeRow(row.language) : null,
          profiles: row.profile ? snakeRow(row.profile) : null,
        };
        let targetDetails: any = null;

        // Extract rejection reason from activity data
        const reason = (activity.activity_data as any)?.reason || 'Other';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;

        if (activity.target_type === 'word' && activity.target_id) {
          const wordRows = await db
            .select({
              id: wordsT.id,
              word: wordsT.word,
              createdAt: wordsT.createdAt,
              createdBy: wordsT.createdBy,
              communityNotes: wordsT.communityNotes,
            })
            .from(wordsT)
            .where(eq(wordsT.id, activity.target_id))
            .limit(1);
          const word = wordRows[0];
          if (word) {
            let profile: any = null;
            if (word.createdBy) {
              const pr = await db
                .select({ id: profilesT.id, displayName: profilesT.displayName, username: profilesT.username })
                .from(profilesT)
                .where(eq(profilesT.userId, word.createdBy))
                .limit(1);
              profile = pr[0]
                ? { id: pr[0].id, display_name: pr[0].displayName, username: pr[0].username }
                : null;
            }
            targetDetails = {
              id: word.id,
              word: word.word,
              created_at: word.createdAt,
              created_by: word.createdBy,
              community_notes: word.communityNotes,
              profiles: profile,
            };
          }
        } else if (activity.target_type === 'improvement' && activity.target_id) {
          const impRows = await db
            .select({
              id: wisT.id,
              improvementType: wisT.improvementType,
              fieldName: wisT.fieldName,
              currentValue: wisT.currentValue,
              suggestedValue: wisT.suggestedValue,
              improvementReason: wisT.improvementReason,
              createdAt: wisT.createdAt,
              submittedBy: wisT.submittedBy,
              reviewComment: wisT.reviewComment,
              wordId: wisT.wordId,
            })
            .from(wisT)
            .where(eq(wisT.id, activity.target_id))
            .limit(1);
          const improvement = impRows[0];
          if (improvement) {
            let word: any = null;
            if (improvement.wordId) {
              const wr = await db
                .select({ id: wordsT.id, word: wordsT.word })
                .from(wordsT)
                .where(eq(wordsT.id, improvement.wordId))
                .limit(1);
              word = wr[0] ? { id: wr[0].id, word: wr[0].word } : null;
            }
            let profile: any = null;
            if (improvement.submittedBy) {
              const pr = await db
                .select({ id: profilesT.id, displayName: profilesT.displayName, username: profilesT.username })
                .from(profilesT)
                .where(eq(profilesT.userId, improvement.submittedBy))
                .limit(1);
              profile = pr[0]
                ? { id: pr[0].id, display_name: pr[0].displayName, username: pr[0].username }
                : null;
            }
            targetDetails = {
              id: improvement.id,
              improvement_type: improvement.improvementType,
              field_name: improvement.fieldName,
              current_value: improvement.currentValue,
              suggested_value: improvement.suggestedValue,
              improvement_reason: improvement.improvementReason,
              created_at: improvement.createdAt,
              submitted_by: improvement.submittedBy,
              review_comment: improvement.reviewComment,
              words: word,
              profiles: profile,
            };
          }
        }

        return {
          ...activity,
          targetDetails,
          rejectionReason: reason,
        };
      })
    );

    // Calculate statistics
    const stats = {
      totalRejected: total,
      wordsRejected: enrichedActivities.filter((a) => a.activity_type === 'word_rejected').length,
      improvementsRejected: enrichedActivities.filter((a) => a.activity_type === 'improvement_rejected').length,
      commonRejectionReasons: Object.entries(rejectionReasons)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count })),
    };

    // Check for resubmission eligibility
    const resubmissionEligible = enrichedActivities.filter((activity) => {
      // Items rejected more than 7 days ago might be eligible for resubmission
      const daysSinceRejection = Math.floor(
        (Date.now() - new Date(activity.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceRejection >= 7;
    });

    return NextResponse.json({
      activities: enrichedActivities,
      stats: {
        ...stats,
        resubmissionEligible: resubmissionEligible.length,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch rejected items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rejected items' },
      { status: 500 }
    );
  }
}

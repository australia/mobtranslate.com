import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, lte, count } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  curatorActivities as activitiesT,
  definitions as definitionsT,
  languages as languagesT,
  translations as translationsT,
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

    // Check if user is a curator (has any curator/dictionary_admin/super_admin assignment)
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

    // Get curator activities for approved items
    const filters = [
      eq(activitiesT.userId, user.id),
      inArray(activitiesT.activityType, ['word_approved', 'improvement_approved']),
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

    // Enrich activities with target details
    const enrichedActivities = await Promise.all(
      activityRows.map(async (row) => {
        const activity: any = {
          ...snakeRow(row.activity),
          languages: row.language ? snakeRow(row.language) : null,
          profiles: row.profile ? snakeRow(row.profile) : null,
        };
        let targetDetails: any = null;

        if (activity.target_type === 'word' && activity.target_id) {
          const wordRows = await db
            .select({ id: wordsT.id, word: wordsT.word, createdAt: wordsT.createdAt })
            .from(wordsT)
            .where(eq(wordsT.id, activity.target_id))
            .limit(1);
          const word = wordRows[0];
          if (word) {
            const [defs, trans] = await Promise.all([
              db.select({ definition: definitionsT.definition }).from(definitionsT).where(eq(definitionsT.wordId, word.id)),
              db.select({ translation: translationsT.translation }).from(translationsT).where(eq(translationsT.wordId, word.id)),
            ]);
            // Mirror Supabase `!inner` joins: only present if it has defs+translations.
            if (defs.length > 0 && trans.length > 0) {
              targetDetails = {
                id: word.id,
                word: word.word,
                created_at: word.createdAt,
                definitions: defs.map((d) => ({ definition: d.definition })),
                translations: trans.map((t) => ({ translation: t.translation })),
              };
            }
          }
        } else if (activity.target_type === 'improvement' && activity.target_id) {
          const impRows = await db
            .select({
              id: wisT.id,
              improvementType: wisT.improvementType,
              fieldName: wisT.fieldName,
              suggestedValue: wisT.suggestedValue,
              createdAt: wisT.createdAt,
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
            targetDetails = {
              id: improvement.id,
              improvement_type: improvement.improvementType,
              field_name: improvement.fieldName,
              suggested_value: improvement.suggestedValue,
              created_at: improvement.createdAt,
              words: word,
            };
          }
        }

        return {
          ...activity,
          targetDetails,
        };
      })
    );

    // Calculate statistics
    const stats = {
      totalApproved: total,
      wordsApproved: enrichedActivities.filter((a) => a.activity_type === 'word_approved').length,
      improvementsApproved: enrichedActivities.filter((a) => a.activity_type === 'improvement_approved').length,
      averagePerDay: total ? Math.round((total / 30) * 10) / 10 : 0,
    };

    return NextResponse.json({
      activities: enrichedActivities,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch approved items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approved items' },
      { status: 500 }
    );
  }
}

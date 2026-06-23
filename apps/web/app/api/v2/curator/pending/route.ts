import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, count } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import { applyWordSuggestion, snapshotWordRevision } from '@/lib/words/editing';
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
    const type = searchParams.get('type') || 'all'; // all, words, improvements
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Check if user is a curator for the specified language
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

    // Get languages user can curate
    const curatorLanguages = roleAssignments
      .filter((ra) => ra.languageId || ra.name === 'super_admin' || ra.name === 'dictionary_admin')
      .map((ra) => ra.languageId)
      .filter(Boolean) as string[];

    const isSuperAdmin = roleAssignments.some(
      (ra) => ra.name === 'super_admin' || ra.name === 'dictionary_admin'
    );

    let results: any[] = [];
    let totalCount = 0;

    if (type === 'all' || type === 'words') {
      // Fetch pending words (with language + creator profile)
      const wordFilters = [eq(wordsT.isVerified, false)];
      if (languageId && !isSuperAdmin) {
        wordFilters.push(eq(wordsT.languageId, languageId));
      } else if (!isSuperAdmin && curatorLanguages.length > 0) {
        wordFilters.push(inArray(wordsT.languageId, curatorLanguages));
      }
      const wordsWhere = and(...wordFilters);

      const baseWordsQuery = db
        .select({ word: wordsT, language: languagesT, profile: profilesT })
        .from(wordsT)
        .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
        .leftJoin(profilesT, eq(wordsT.createdBy, profilesT.userId))
        .where(wordsWhere)
        .orderBy(desc(wordsT.createdAt));

      const [wordRows, wordsCountRows] = await Promise.all([
        type === 'words' ? baseWordsQuery.limit(limit).offset(offset) : baseWordsQuery,
        db.select({ value: count() }).from(wordsT).where(wordsWhere),
      ]);

      // Only words that have at least one definition AND translation (mirrors `!inner`).
      const wordIds = wordRows.map((r) => r.word.id);
      const [defs, trans] = wordIds.length
        ? await Promise.all([
            db.select({ id: definitionsT.id, definition: definitionsT.definition, wordId: definitionsT.wordId }).from(definitionsT).where(inArray(definitionsT.wordId, wordIds)),
            db.select({ id: translationsT.id, translation: translationsT.translation, wordId: translationsT.wordId }).from(translationsT).where(inArray(translationsT.wordId, wordIds)),
          ])
        : [[], []];

      const defsByWord = new Map<string, any[]>();
      for (const d of defs) {
        const arr = defsByWord.get(d.wordId) ?? [];
        arr.push({ id: d.id, definition: d.definition });
        defsByWord.set(d.wordId, arr);
      }
      const transByWord = new Map<string, any[]>();
      for (const t of trans) {
        const arr = transByWord.get(t.wordId) ?? [];
        arr.push({ id: t.id, translation: t.translation });
        transByWord.set(t.wordId, arr);
      }

      for (const r of wordRows) {
        const wDefs = defsByWord.get(r.word.id) ?? [];
        const wTrans = transByWord.get(r.word.id) ?? [];
        if (wDefs.length === 0 || wTrans.length === 0) continue; // !inner semantics
        const created = r.word.createdAt;
        results.push({
          ...snakeRow(r.word),
          languages: r.language ? snakeRow(r.language) : null,
          profiles: r.profile ? snakeRow(r.profile) : null,
          definitions: wDefs,
          translations: wTrans,
          type: 'word',
          priority: created
            ? Math.max(0, 10 - Math.floor((Date.now() - new Date(created).getTime()) / (1000 * 60 * 60 * 24)))
            : 5,
        });
      }
      totalCount += wordsCountRows[0]?.value ?? 0;
    }

    if (type === 'all' || type === 'improvements') {
      // Fetch pending improvements (join word + its language + submitter profile)
      const impFilters = [eq(wisT.status, 'pending')];
      if (languageId && !isSuperAdmin) {
        impFilters.push(eq(wordsT.languageId, languageId));
      } else if (!isSuperAdmin && curatorLanguages.length > 0) {
        impFilters.push(inArray(wordsT.languageId, curatorLanguages));
      }
      const impWhere = and(...impFilters);

      const baseImpQuery = db
        .select({ improvement: wisT, word: wordsT, language: languagesT, profile: profilesT })
        .from(wisT)
        .leftJoin(wordsT, eq(wisT.wordId, wordsT.id))
        .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
        .leftJoin(profilesT, eq(wisT.submittedBy, profilesT.userId))
        .where(impWhere)
        .orderBy(desc(wisT.createdAt));

      const [impRows, impCountRows] = await Promise.all([
        type === 'improvements' ? baseImpQuery.limit(limit).offset(offset) : baseImpQuery,
        db
          .select({ value: count() })
          .from(wisT)
          .leftJoin(wordsT, eq(wisT.wordId, wordsT.id))
          .where(impWhere),
      ]);

      for (const r of impRows) {
        results.push({
          ...snakeRow(r.improvement),
          words: r.word
            ? {
                id: r.word.id,
                word: r.word.word,
                language_id: r.word.languageId,
                languages: r.language
                  ? { id: r.language.id, name: r.language.name, code: r.language.code }
                  : null,
              }
            : null,
          profiles: r.profile
            ? { id: r.profile.id, display_name: r.profile.displayName, username: r.profile.username, reputation_score: null }
            : null,
          type: 'improvement',
          priority: r.improvement.confidenceScore ? Math.round(r.improvement.confidenceScore * 10) : 5,
        });
      }
      totalCount += impCountRows[0]?.value ?? 0;
    }

    // Sort by priority and created_at if fetching all
    if (type === 'all') {
      results.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      // Apply pagination to combined results
      results = results.slice(offset, offset + limit);
    }

    return NextResponse.json({
      items: results,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch pending items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending items' },
      { status: 500 }
    );
  }
}

// Review a pending item (approve/reject)
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { itemId, itemType, action, reason, notes } = body;

    if (!itemId || !itemType || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject', 'request_changes'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Handle different item types
    if (itemType === 'word') {
      // Get word details
      const wordRows = await db.select().from(wordsT).where(eq(wordsT.id, itemId)).limit(1);
      const word = wordRows[0];

      if (!word) {
        return NextResponse.json({ error: 'Word not found' }, { status: 404 });
      }

      // Check curator permission for this language
      const hasPermission = await userHasRole(
        user.id,
        ['curator', 'dictionary_admin', 'super_admin'],
        word.languageId
      );

      if (!hasPermission) {
        return NextResponse.json({ error: 'No permission to review this word' }, { status: 403 });
      }

      // Update word based on action
      if (action === 'approve') {
        const now = new Date().toISOString();
        await db
          .update(wordsT)
          .set({
            isVerified: true,
            verifiedBy: user.id,
            verifiedAt: now,
            lastReviewedAt: now,
            lastReviewedBy: user.id,
            reviewCount: (word.reviewCount || 0) + 1,
          })
          .where(eq(wordsT.id, itemId));

        // Log activity
        await db.insert(activitiesT).values({
          userId: user.id,
          languageId: word.languageId,
          activityType: 'word_approved',
          targetType: 'word',
          targetId: itemId,
          activityData: { word: word.word, notes },
        });
      } else if (action === 'reject') {
        const now = new Date().toISOString();
        await db
          .update(wordsT)
          .set({
            lastReviewedAt: now,
            lastReviewedBy: user.id,
            reviewCount: (word.reviewCount || 0) + 1,
            communityNotes: reason || notes,
          })
          .where(eq(wordsT.id, itemId));

        // Log activity
        await db.insert(activitiesT).values({
          userId: user.id,
          languageId: word.languageId,
          activityType: 'word_rejected',
          targetType: 'word',
          targetId: itemId,
          activityData: { word: word.word, reason, notes },
        });
      }
    } else if (itemType === 'improvement') {
      // Get improvement details (+ its word's language)
      const impRows = await db
        .select({ improvement: wisT, word: wordsT })
        .from(wisT)
        .leftJoin(wordsT, eq(wisT.wordId, wordsT.id))
        .where(eq(wisT.id, itemId))
        .limit(1);
      const row = impRows[0];

      if (!row) {
        return NextResponse.json({ error: 'Improvement not found' }, { status: 404 });
      }
      const improvement = row.improvement;
      const improvementWord = row.word;

      // Check curator permission for this language
      const hasPermission = await userHasRole(
        user.id,
        ['curator', 'dictionary_admin', 'super_admin'],
        improvementWord?.languageId
      );

      if (!hasPermission) {
        return NextResponse.json({ error: 'No permission to review this improvement' }, { status: 403 });
      }

      // Update improvement status
      const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'under_review';

      await db
        .update(wisT)
        .set({
          status: newStatus,
          reviewedBy: user.id,
          reviewedAt: new Date().toISOString(),
          reviewComment: notes || reason,
        })
        .where(eq(wisT.id, itemId));

      // If approved, snapshot a revision then apply (handles word columns plus
      // definition/translation edits, and both `{id,text}` and legacy shapes).
      if (action === 'approve' && improvement.wordId) {
        await snapshotWordRevision(
          db,
          improvement.wordId,
          user.id,
          `Approved edit: ${improvement.fieldName ?? improvement.improvementType}`,
        );
        await applyWordSuggestion(db, {
          word_id: improvement.wordId,
          improvement_type: improvement.improvementType,
          field_name: improvement.fieldName,
          suggested_value: improvement.suggestedValue,
        });

        await db
          .update(wisT)
          .set({
            status: 'implemented',
            implementedAt: new Date().toISOString(),
            implementationNotes: 'Applied after approval',
          })
          .where(eq(wisT.id, itemId));
      }

      // Log activity
      await db.insert(activitiesT).values({
        userId: user.id,
        languageId: improvementWord?.languageId,
        activityType: action === 'approve' ? 'improvement_approved' : 'improvement_rejected',
        targetType: 'improvement',
        targetId: itemId,
        activityData: {
          word: improvementWord?.word,
          improvement_type: improvement.improvementType,
          action,
          notes,
        },
      });
    }

    return NextResponse.json({
      message: `Item ${action}ed successfully`,
      itemId,
      action,
    });
  } catch (error) {
    console.error('Failed to review item:', error);
    return NextResponse.json(
      { error: 'Failed to review item' },
      { status: 500 }
    );
  }
}

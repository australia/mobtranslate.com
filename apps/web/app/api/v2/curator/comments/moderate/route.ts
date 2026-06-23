import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, count } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import {
  curatorActivities as activitiesT,
  languages as languagesT,
  userProfiles as profilesT,
  userRoleAssignments as uraT,
  userRoles as rolesT,
  words as wordsT,
  wordComments as commentsT,
} from '@/lib/db/schema';

// NOTE: the `word_comments` table has no `is_flagged` / `moderated_at` /
// `moderated_by` columns in the self-hosted schema (the legacy Supabase code
// referenced them but they never existed). "Flagged" is therefore derived from
// downvotes only, and the `approve` action just clears review state without
// persisting flag columns — preserving the route's response contract.

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
    const status = searchParams.get('status') || 'flagged'; // flagged, all, deleted
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

    // Get languages user can moderate
    const curatorLanguages = roleAssignments
      .filter((ra) => ra.languageId || ra.name === 'super_admin' || ra.name === 'dictionary_admin')
      .map((ra) => ra.languageId)
      .filter(Boolean) as string[];

    const isSuperAdmin = roleAssignments.some(
      (ra) => ra.name === 'super_admin' || ra.name === 'dictionary_admin'
    );

    // Build comments query filters
    const filters: any[] = [];
    if (status === 'flagged') {
      filters.push(gte(commentsT.downvotes, 3));
    } else if (status === 'deleted') {
      filters.push(eq(commentsT.isDeleted, true));
    }
    // For 'all', no additional filters

    // Filter by language if specified (via joined word)
    if (languageId && !isSuperAdmin) {
      filters.push(eq(wordsT.languageId, languageId));
    } else if (!isSuperAdmin && curatorLanguages.length > 0) {
      filters.push(inArray(wordsT.languageId, curatorLanguages));
    }

    const where = filters.length ? and(...filters) : undefined;

    const [commentRows, totalRows] = await Promise.all([
      db
        .select({ comment: commentsT, word: wordsT, language: languagesT, profile: profilesT })
        .from(commentsT)
        .leftJoin(wordsT, eq(commentsT.wordId, wordsT.id))
        .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
        .leftJoin(profilesT, eq(commentsT.userId, profilesT.userId))
        .where(where)
        .orderBy(desc(commentsT.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(commentsT)
        .leftJoin(wordsT, eq(commentsT.wordId, wordsT.id))
        .where(where),
    ]);

    const total = totalRows[0]?.value ?? 0;

    // Resolve parent comments (for replies) keyed by id.
    const parentIds = Array.from(
      new Set(commentRows.map((r) => r.comment.parentId).filter(Boolean) as string[])
    );
    const parents = parentIds.length
      ? await db
          .select({ id: commentsT.id, commentText: commentsT.commentText, userId: commentsT.userId })
          .from(commentsT)
          .where(inArray(commentsT.id, parentIds))
      : [];
    const parentById = new Map(parents.map((p) => [p.id, { id: p.id, comment_text: p.commentText, user_id: p.userId }]));

    // Calculate engagement metrics for each comment
    const enrichedComments = commentRows.map((row) => {
      const comment: any = {
        ...snakeRow(row.comment),
        words: row.word
          ? {
              id: row.word.id,
              word: row.word.word,
              language_id: row.word.languageId,
              languages: row.language
                ? { id: row.language.id, name: row.language.name, code: row.language.code }
                : null,
            }
          : null,
        profiles: row.profile
          ? { id: row.profile.id, display_name: row.profile.displayName, username: row.profile.username, reputation_score: null }
          : null,
        parent: row.comment.parentId ? parentById.get(row.comment.parentId) ?? null : null,
      };

      const upvotes = comment.upvotes ?? 0;
      const downvotes = comment.downvotes ?? 0;
      const totalVotes = upvotes + downvotes;
      const controversyScore = totalVotes > 0 ? Math.min(upvotes, downvotes) / Math.max(upvotes, downvotes) : 0;

      return {
        ...comment,
        engagement: {
          totalVotes,
          ratio: totalVotes > 0 ? upvotes / totalVotes : 0.5,
          controversyScore,
          flaggedForReview: downvotes >= 3 || controversyScore > 0.4,
        },
      };
    });

    // Get moderation statistics
    const [flaggedRows, deletedRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(commentsT)
        .where(and(gte(commentsT.downvotes, 3), eq(commentsT.isDeleted, false))),
      db.select({ value: count() }).from(commentsT).where(eq(commentsT.isDeleted, true)),
    ]);

    return NextResponse.json({
      comments: enrichedComments,
      stats: {
        totalFlagged: flaggedRows[0]?.value ?? 0,
        totalDeleted: deletedRows[0]?.value ?? 0,
        currentlyViewing: total,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch comments for moderation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// Moderate a comment (delete, restore, warn user)
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { commentId, action, reason, warnUser } = body;

    if (!commentId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['delete', 'restore', 'approve'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Get comment details (+ its word's language)
    const rows = await db
      .select({ comment: commentsT, word: wordsT })
      .from(commentsT)
      .leftJoin(wordsT, eq(commentsT.wordId, wordsT.id))
      .where(eq(commentsT.id, commentId))
      .limit(1);
    const row = rows[0];

    if (!row) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }
    const comment = row.comment;
    const commentWord = row.word;

    // Check curator permission for this language
    const hasPermission = await userHasRole(
      user.id,
      ['curator', 'dictionary_admin', 'super_admin'],
      commentWord?.languageId
    );

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'No permission to moderate comments for this language' },
        { status: 403 }
      );
    }

    // Perform moderation action
    if (action === 'delete') {
      await db
        .update(commentsT)
        .set({
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: user.id,
        })
        .where(eq(commentsT.id, commentId));

      // Log activity
      await db.insert(activitiesT).values({
        userId: user.id,
        languageId: commentWord?.languageId,
        activityType: 'comment_deleted',
        targetType: 'comment',
        targetId: commentId,
        activityData: {
          reason,
          comment_preview: comment.commentText.substring(0, 100),
          warned_user: warnUser || false,
        },
      });

      // If warnUser is true, you could send a notification or update user metrics
      if (warnUser) {
        // In production, implement warning system
        console.log(`Warning issued to user ${comment.userId} for comment ${commentId}`);
      }
    } else if (action === 'restore') {
      await db
        .update(commentsT)
        .set({
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
        })
        .where(eq(commentsT.id, commentId));

      // Log activity
      await db.insert(activitiesT).values({
        userId: user.id,
        languageId: commentWord?.languageId,
        activityType: 'comment_restored',
        targetType: 'comment',
        targetId: commentId,
        activityData: {
          comment_preview: comment.commentText.substring(0, 100),
        },
      });
    } else if (action === 'approve') {
      // Clear any flags on the comment. The schema has no flag columns, so we
      // just touch updated_at to record the review.
      await db
        .update(commentsT)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(commentsT.id, commentId));

      // Log activity
      await db.insert(activitiesT).values({
        userId: user.id,
        languageId: commentWord?.languageId,
        activityType: 'comment_approved',
        targetType: 'comment',
        targetId: commentId,
        activityData: {
          comment_preview: comment.commentText.substring(0, 100),
        },
      });
    }

    return NextResponse.json({
      message: `Comment ${action}d successfully`,
      commentId,
      action,
    });
  } catch (error) {
    console.error('Failed to moderate comment:', error);
    return NextResponse.json(
      { error: 'Failed to moderate comment' },
      { status: 500 }
    );
  }
}

// Bulk moderation actions
export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { commentIds, action, reason } = body;

    if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0 || !action) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Check if user is a curator
    const roleAssignments = await db
      .select({ roleId: uraT.roleId, name: rolesT.name })
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

    // Perform bulk action
    let updateData: any = null;

    if (action === 'delete') {
      updateData = {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: user.id,
      };
    } else if (action === 'approve') {
      // No flag columns to clear; record the review by touching updated_at.
      updateData = {
        updatedAt: new Date().toISOString(),
      };
    }

    if (updateData) {
      await db.update(commentsT).set(updateData).where(inArray(commentsT.id, commentIds));
    }

    // Log bulk activity
    await db.insert(activitiesT).values({
      userId: user.id,
      activityType: `bulk_comments_${action}d`,
      targetType: 'comments',
      targetId: commentIds[0], // Use first ID as reference
      activityData: {
        total_comments: commentIds.length,
        action,
        reason,
      },
    });

    return NextResponse.json({
      message: `${commentIds.length} comments ${action}d successfully`,
      count: commentIds.length,
      action,
    });
  } catch (error) {
    console.error('Failed to perform bulk moderation:', error);
    return NextResponse.json(
      { error: 'Failed to perform bulk moderation' },
      { status: 500 }
    );
  }
}

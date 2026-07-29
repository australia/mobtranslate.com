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

// The schema has no separate flag record. A comment enters the review queue at
// three downvotes; keeping it visible requires no mutation, while delete and
// restore remain explicit, audited moderation actions.

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
    if (!['flagged', 'all', 'deleted'].includes(status)) {
      return NextResponse.json({ error: 'Invalid comment filter' }, { status: 400 });
    }
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

    if (languageId && !isSuperAdmin && !curatorLanguages.includes(languageId)) {
      return NextResponse.json({ error: 'No permission to moderate this language' }, { status: 403 });
    }

    if (!isSuperAdmin && curatorLanguages.length === 0) {
      return NextResponse.json({
        comments: [],
        stats: { totalFlagged: 0, totalDeleted: 0, currentlyViewing: 0 },
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    // Build comments query filters
    const filters: any[] = [];
    if (status === 'flagged') {
      filters.push(gte(commentsT.downvotes, 3), eq(commentsT.isDeleted, false));
    } else if (status === 'deleted') {
      filters.push(eq(commentsT.isDeleted, true));
    } else {
      filters.push(eq(commentsT.isDeleted, false));
    }

    // Filter by language if specified (via joined word)
    if (languageId) {
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
          flaggedForReview: downvotes >= 3,
        },
      };
    });

    // Get moderation statistics
    const scopeFilters = [];
    if (languageId) {
      scopeFilters.push(eq(wordsT.languageId, languageId));
    } else if (!isSuperAdmin) {
      scopeFilters.push(inArray(wordsT.languageId, curatorLanguages));
    }
    const [flaggedRows, deletedRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(commentsT)
        .leftJoin(wordsT, eq(commentsT.wordId, wordsT.id))
        .where(and(...scopeFilters, gte(commentsT.downvotes, 3), eq(commentsT.isDeleted, false))),
      db
        .select({ value: count() })
        .from(commentsT)
        .leftJoin(wordsT, eq(commentsT.wordId, wordsT.id))
        .where(and(...scopeFilters, eq(commentsT.isDeleted, true))),
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

    if (!['delete', 'restore'].includes(action)) {
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

// Bulk moderation stays unavailable until every comment is checked against its
// language-scoped role and receives its own audit entry.
export async function PUT() {
  return NextResponse.json(
    {
      error: 'Bulk comment moderation is not available. Review comments individually.',
      code: 'BULK_MODERATION_NOT_AVAILABLE',
    },
    { status: 501 },
  );
}

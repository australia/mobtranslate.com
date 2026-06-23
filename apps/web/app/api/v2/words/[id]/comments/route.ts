import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { requireUser } from '@/lib/auth-helpers';
import { userProfiles, wordComments } from '@/lib/db/schema';
import { z } from 'zod';

const createCommentSchema = z.object({
  comment_text: z.string().min(1).max(5000),
  comment_type: z.enum(['general', 'pronunciation', 'usage', 'cultural', 'grammar']).optional(),
  parent_id: z.string().uuid().optional()
});

// Build a { id, display_name, avatar_url } user object for a set of user ids,
// sourced from user_profiles (there is no separate `profiles` table).
async function loadUsers(userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean))) as string[];
  const map = new Map<string, { id: string; display_name: string | null; avatar_url: string | null }>();
  if (ids.length === 0) return map;
  const profiles = await db
    .select({
      userId: userProfiles.userId,
      displayName: userProfiles.displayName,
      username: userProfiles.username,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(userProfiles)
    .where(inArray(userProfiles.userId, ids));
  for (const p of profiles) {
    map.set(p.userId, {
      id: p.userId,
      display_name: p.displayName ?? p.username,
      avatar_url: p.avatarUrl,
    });
  }
  return map;
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id: wordId } = params;

  try {
    // Top-level (non-deleted) comments for this word
    const topLevel = await db
      .select()
      .from(wordComments)
      .where(
        and(
          eq(wordComments.wordId, wordId),
          isNull(wordComments.parentId),
          eq(wordComments.isDeleted, false)
        )
      )
      .orderBy(desc(wordComments.createdAt));

    // Replies for those comments
    const parentIds = topLevel.map((c) => c.id);
    const replyRows = parentIds.length
      ? await db
          .select()
          .from(wordComments)
          .where(and(inArray(wordComments.parentId, parentIds), eq(wordComments.isDeleted, false)))
          .orderBy(asc(wordComments.createdAt))
      : [];

    // Resolve comment authors
    const userMap = await loadUsers([
      ...topLevel.map((c) => c.userId).filter(Boolean) as string[],
      ...replyRows.map((c) => c.userId).filter(Boolean) as string[],
    ]);

    const repliesByParent = new Map<string, any[]>();
    for (const r of replyRows) {
      if (!r.parentId) continue;
      const arr = repliesByParent.get(r.parentId) ?? [];
      arr.push({ ...snakeRow(r), user: r.userId ? userMap.get(r.userId) ?? null : null });
      repliesByParent.set(r.parentId, arr);
    }

    const commentsWithReplies = topLevel.map((c) => ({
      ...snakeRow(c),
      user: c.userId ? userMap.get(c.userId) ?? null : null,
      replies: repliesByParent.get(c.id) ?? [],
    }));

    return NextResponse.json(commentsWithReplies);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id: wordId } = params;

  try {
    // Check authentication
    const { user, response } = await requireUser();
    if (response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createCommentSchema.parse(body);

    // Create comment
    const [comment] = await db
      .insert(wordComments)
      .values({
        wordId,
        userId: user!.id,
        commentText: validatedData.comment_text,
        commentType: validatedData.comment_type,
        parentId: validatedData.parent_id ?? null,
      })
      .returning();

    const userMap = await loadUsers([user!.id]);

    return NextResponse.json(
      { ...snakeRow(comment), user: userMap.get(user!.id) ?? null },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}

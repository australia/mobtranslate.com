import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { requireUser } from '@/lib/auth-helpers';
import {
  improvementVotes,
  userProfiles,
  wordImprovementSuggestions,
  words as wordsT,
} from '@/lib/db/schema';
import { z } from 'zod';

const createImprovementSchema = z.object({
  improvement_type: z.enum(['definition', 'translation', 'example', 'pronunciation', 'grammar', 'cultural_context']),
  field_name: z.string().optional(),
  current_value: z.any().optional(),
  suggested_value: z.any(),
  improvement_reason: z.string().optional(),
  supporting_references: z.array(z.string()).optional()
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
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  try {
    const filters = [eq(wordImprovementSuggestions.wordId, wordId)];
    if (status) filters.push(eq(wordImprovementSuggestions.status, status));

    const improvements = await db
      .select()
      .from(wordImprovementSuggestions)
      .where(and(...filters))
      .orderBy(desc(wordImprovementSuggestions.createdAt));

    // Votes for these suggestions (+ the voter user object)
    const suggestionIds = improvements.map((i) => i.id);
    const voteRows = suggestionIds.length
      ? await db
          .select()
          .from(improvementVotes)
          .where(inArray(improvementVotes.suggestionId, suggestionIds))
      : [];

    // Resolve all referenced users (submitter, reviewer, voters)
    const userMap = await loadUsers([
      ...improvements.map((i) => i.submittedBy).filter(Boolean) as string[],
      ...improvements.map((i) => i.reviewedBy).filter(Boolean) as string[],
      ...voteRows.map((v) => v.voterId).filter(Boolean) as string[],
    ]);

    const votesBySuggestion = new Map<string, any[]>();
    for (const v of voteRows) {
      if (!v.suggestionId) continue;
      const arr = votesBySuggestion.get(v.suggestionId) ?? [];
      const voter = v.voterId ? userMap.get(v.voterId) ?? null : null;
      arr.push({
        vote: v.vote,
        voter: voter ? { id: voter.id, display_name: voter.display_name } : null,
      });
      votesBySuggestion.set(v.suggestionId, arr);
    }

    const improvementsWithVoteSummary = improvements.map((improvement) => {
      const votes = votesBySuggestion.get(improvement.id) ?? [];
      const voteSummary = { approve: 0, reject: 0, needs_work: 0 };
      votes.forEach((vote: any) => {
        if (vote.vote in voteSummary) {
          voteSummary[vote.vote as keyof typeof voteSummary]++;
        }
      });

      const submitter = improvement.submittedBy ? userMap.get(improvement.submittedBy) ?? null : null;
      const reviewer = improvement.reviewedBy ? userMap.get(improvement.reviewedBy) ?? null : null;

      return {
        ...snakeRow(improvement),
        submitted_by_user: submitter,
        reviewed_by_user: reviewer,
        votes,
        vote_summary: voteSummary,
      };
    });

    return NextResponse.json(improvementsWithVoteSummary);
  } catch (error) {
    console.error('Error fetching improvements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch improvements' },
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
    const validatedData = createImprovementSchema.parse(body);

    // Get current word data if current_value not provided
    let currentValue = validatedData.current_value;
    if (!currentValue && validatedData.field_name) {
      const wordRows = await db
        .select()
        .from(wordsT)
        .where(eq(wordsT.id, wordId))
        .limit(1);
      const word = wordRows[0] as Record<string, any> | undefined;
      if (word && validatedData.field_name in word) {
        currentValue = word[validatedData.field_name];
      }
    }

    // Create improvement suggestion
    const [improvement] = await db
      .insert(wordImprovementSuggestions)
      .values({
        wordId,
        submittedBy: user!.id,
        improvementType: validatedData.improvement_type,
        fieldName: validatedData.field_name ?? null,
        currentValue: currentValue ?? null,
        suggestedValue: validatedData.suggested_value,
        improvementReason: validatedData.improvement_reason ?? null,
        supportingReferences: validatedData.supporting_references ?? null,
        confidenceScore: 0.5, // Default confidence
      })
      .returning();

    const userMap = await loadUsers([user!.id]);

    return NextResponse.json(
      { ...snakeRow(improvement), submitted_by_user: userMap.get(user!.id) ?? null },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating improvement suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to create improvement suggestion' },
      { status: 500 }
    );
  }
}

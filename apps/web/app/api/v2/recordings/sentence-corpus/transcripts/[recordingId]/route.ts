import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { db } from '@/lib/db/index';
import { STUDIO_ROLES, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

const ReviewSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: z.enum(['adjudicated', 'rejected']),
    transcript: z.string().trim().min(1).max(4000),
    orthographyVersion: z.string().trim().min(1).max(255),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

type CurrentTranscript = {
  id: string;
  version: number;
  recorded_by: string | null;
};

class TranscriptReviewError extends Error {
  constructor(
    readonly code: 'not_found' | 'stale' | 'independent_reviewer_required',
  ) {
    super(code);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ recordingId: string }> },
) {
  const { user, response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  const { recordingId } = await context.params;
  if (!z.string().uuid().safeParse(recordingId).success) {
    return NextResponse.json(
      { error: 'Recording not found.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const parsed = ReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'The transcript review is incomplete.', details: parsed.error.issues },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await db.transaction(async (transaction) => {
      const currentResult = await transaction.execute(sql`
        select event.id, event.version, event.recorded_by
        from public.sentence_recordings recording
        join lateral (
          select id, version, recorded_by
          from public.speech_transcript_events
          where sentence_recording_id = recording.id
          order by version desc
          limit 1
        ) event on true
        where recording.id = ${recordingId}::uuid
          and recording.status = 'active'
        for update of recording`);
      const current = rowsOf<CurrentTranscript>(currentResult)[0];
      if (!current) throw new TranscriptReviewError('not_found');
      if (current.version !== parsed.data.expectedVersion) {
        throw new TranscriptReviewError('stale');
      }
      if (
        parsed.data.status === 'adjudicated' &&
        current.recorded_by === user!.id
      ) {
        throw new TranscriptReviewError('independent_reviewer_required');
      }

      const operatorReviewerId = `operator:${user!.id}`;
      const inserted = await transaction.execute(sql`
        insert into public.speech_transcript_events
          (sentence_recording_id, version, status, transcript,
           orthography_version, reviewer_ids, supersedes_id, notes, recorded_by)
        select
          ${recordingId}::uuid,
          ${current.version + 1},
          ${parsed.data.status},
          ${parsed.data.transcript},
          ${parsed.data.orthographyVersion},
          array(
            select distinct reviewer_id
            from unnest(previous.reviewer_ids || ARRAY[${operatorReviewerId}]::text[])
              as reviewer_id
          ),
          ${current.id}::uuid,
          ${parsed.data.notes ?? null},
          ${user!.id}::uuid
        from public.speech_transcript_events previous
        where previous.id = ${current.id}::uuid
        returning id, version, status, transcript, orthography_version,
          reviewer_ids, supersedes_id, created_at`);
      return rowsOf(inserted)[0];
    });

    return NextResponse.json(result, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof TranscriptReviewError) {
      const messages = {
        not_found: 'Recording not found.',
        stale: 'This transcript changed while you were reviewing it. Reload and review the latest version.',
        independent_reviewer_required: 'A different signed-in reviewer must adjudicate this transcript.',
      } as const;
      return NextResponse.json(
        { error: messages[error.code] },
        {
          status: error.code === 'not_found' ? 404 : 409,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }
    console.error('Kuku Yalanji transcript review failed:', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'The transcript review could not be saved.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

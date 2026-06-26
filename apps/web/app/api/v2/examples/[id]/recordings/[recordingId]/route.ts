import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordings as recordingsT } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

// Remove your OWN reading of an example sentence (soft-delete).
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; recordingId: string }> },
) {
  const { id: exampleId, recordingId } = await context.params;
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const [updated] = await db
    .update(recordingsT)
    .set({ status: 'deleted', updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(recordingsT.id, recordingId),
        eq(recordingsT.exampleId, exampleId),
        eq(recordingsT.recordedBy, me.id),
        eq(recordingsT.status, 'active'),
      ),
    )
    .returning({ id: recordingsT.id });

  if (!updated) return NextResponse.json({ error: 'Not found or not yours' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

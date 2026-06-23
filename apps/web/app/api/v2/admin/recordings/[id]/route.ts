import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordings } from '@/lib/db/schema';
import { snakeRow } from '@/lib/db/case';
import { recordingPublicUrl } from '@/lib/storage';
import { requireAdmin, removeAudio } from '@/lib/recording/server';

export const runtime = 'nodejs';

const patchSchema = z.object({
  status: z.enum(['active', 'superseded', 'rejected']).optional(),
  isPrimary: z.boolean().optional(),
  gloss: z.string().max(1000).nullable().optional(),
  correctionNote: z.string().max(1000).nullable().optional(),
});

// Moderate a recording: reject, restore, set primary, or edit notes.
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.status) update.status = body.status;
  if (typeof body.isPrimary === 'boolean') update.isPrimary = body.isPrimary;
  if (body.gloss !== undefined) update.gloss = body.gloss;
  if (body.correctionNote !== undefined) update.correctionNote = body.correctionNote;

  // Setting one recording primary clears the flag on its siblings.
  if (body.isPrimary === true) {
    const targetRows = await db
      .select({ wordId: recordings.wordId, targetId: recordings.targetId })
      .from(recordings)
      .where(eq(recordings.id, params.id))
      .limit(1);
    const target = targetRows[0];
    if (target?.wordId) {
      await db.update(recordings).set({ isPrimary: false }).where(eq(recordings.wordId, target.wordId));
    } else if (target?.targetId) {
      await db.update(recordings).set({ isPrimary: false }).where(eq(recordings.targetId, target.targetId));
    }
  }

  const rows = await db.update(recordings).set(update).where(eq(recordings.id, params.id)).returning();
  const data = rows[0];
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...snakeRow(data),
    master_url: recordingPublicUrl(data.storagePath),
    opus_url: recordingPublicUrl(data.opusPath),
  });
}

// Permanently delete a recording and its storage objects.
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const recRows = await db
    .select({ storagePath: recordings.storagePath, opusPath: recordings.opusPath })
    .from(recordings)
    .where(eq(recordings.id, params.id))
    .limit(1);
  const rec = recRows[0];
  if (rec) {
    const paths = [rec.storagePath, rec.opusPath].filter(Boolean) as string[];
    for (const p of paths) await removeAudio(p);
  }
  await db.delete(recordings).where(eq(recordings.id, params.id));
  return NextResponse.json({ ok: true });
}

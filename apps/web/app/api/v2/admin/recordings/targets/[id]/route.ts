import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordingTargets } from '@/lib/db/schema';
import { snakeRow } from '@/lib/db/case';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

const patchSchema = z.object({
  status: z.enum(['pending', 'recorded', 'skipped', 'archived']).optional(),
  text: z.string().min(1).max(500).optional(),
  gloss: z.string().max(1000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  priority: z.number().int().optional(),
});

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
  if (body.text) update.text = body.text;
  if (body.gloss !== undefined) update.gloss = body.gloss;
  if (body.note !== undefined) update.note = body.note;
  if (body.priority !== undefined) update.priority = body.priority;

  const rows = await db.update(recordingTargets).set(update).where(eq(recordingTargets.id, params.id)).returning();
  const data = rows[0];
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(snakeRow(data));
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  await db.delete(recordingTargets).where(eq(recordingTargets.id, params.id));
  return NextResponse.json({ ok: true });
}

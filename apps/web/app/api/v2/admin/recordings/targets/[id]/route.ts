import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

const patchSchema = z.object({
  status: z.enum(['pending', 'recorded', 'skipped', 'archived']).optional(),
  text: z.string().min(1).max(500).optional(),
  gloss: z.string().max(1000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  priority: z.number().int().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

  const db = auth.supabase;
  const { data, error } = await db.from('recording_targets').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = auth.supabase;
  const { error } = await db.from('recording_targets').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

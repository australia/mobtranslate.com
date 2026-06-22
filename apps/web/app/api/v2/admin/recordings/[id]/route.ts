import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BUCKET, requireAdmin } from '@/lib/recording/server';

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

  const db = auth.supabase;
  const update: Record<string, unknown> = {};
  if (body.status) update.status = body.status;
  if (typeof body.isPrimary === 'boolean') update.is_primary = body.isPrimary;
  if (body.gloss !== undefined) update.gloss = body.gloss;
  if (body.correctionNote !== undefined) update.correction_note = body.correctionNote;

  // Setting one recording primary clears the flag on its siblings.
  if (body.isPrimary === true) {
    const { data: target } = await db.from('recordings').select('word_id, target_id').eq('id', params.id).single();
    if (target?.word_id) {
      await db.from('recordings').update({ is_primary: false }).eq('word_id', target.word_id);
    } else if (target?.target_id) {
      await db.from('recordings').update({ is_primary: false }).eq('target_id', target.target_id);
    }
  }

  const { data, error } = await db.from('recordings').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Permanently delete a recording and its storage objects.
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = auth.supabase;
  const { data: rec } = await db.from('recordings').select('storage_path, opus_path').eq('id', params.id).single();
  if (rec) {
    const paths = [rec.storage_path, rec.opus_path].filter(Boolean) as string[];
    if (paths.length) await db.storage.from(BUCKET).remove(paths);
  }
  const { error } = await db.from('recordings').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// ---- GET: list custom recording targets (phrases / new words) ----------
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  const status = searchParams.get('status') ?? 'pending';
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });

  const db = auth.supabase;
  let query = db
    .from('recording_targets')
    .select('*, recordings:recordings(id, status)')
    .eq('language_id', languageId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ---- POST: add a word/phrase the speaker wants recorded ----------------
const createSchema = z.object({
  languageId: z.string().uuid(),
  kind: z.enum(['word', 'phrase', 'sentence']).default('phrase'),
  text: z.string().min(1).max(500),
  gloss: z.string().max(1000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  wordId: z.string().uuid().nullable().optional(),
  priority: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  const db = auth.supabase;
  const { data, error } = await db
    .from('recording_targets')
    .insert({
      language_id: body.languageId,
      kind: body.kind,
      text: body.text,
      gloss: body.gloss ?? null,
      note: body.note ?? null,
      word_id: body.wordId ?? null,
      priority: body.priority ?? 0,
      status: 'pending',
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

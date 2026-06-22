import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/recording/server';

export const runtime = 'nodejs';

const schema = z.object({
  languageId: z.string().uuid(),
  kind: z.enum(['word', 'phrase', 'sentence']).default('word'),
  text: z.string().min(1).max(2000),
  gloss: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid input', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc('auth_add_target', {
    p_language_id: body.languageId,
    p_kind: body.kind,
    p_text: body.text,
    p_gloss: body.gloss ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

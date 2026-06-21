import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { publicClient } from '@/lib/recording/public';

export const runtime = 'nodejs';

const schema = z.object({
  kind: z.enum(['word', 'phrase', 'sentence']).default('word'),
  text: z.string().min(1).max(2000),
  gloss: z.string().max(2000).nullable().optional(),
});

// The speaker adds their own word/sentence + translation to record.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid input', details: err instanceof z.ZodError ? err.errors : String(err) }, { status: 400 });
  }

  const db = publicClient();
  const { data, error } = await db.rpc('invite_add_target', {
    p_token: params.token,
    p_kind: body.kind,
    p_text: body.text,
    p_gloss: body.gloss ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

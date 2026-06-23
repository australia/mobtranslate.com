import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';

export const runtime = 'nodejs';

const schema = z.object({
  kind: z.enum(['word', 'phrase', 'sentence']).default('word'),
  text: z.string().min(1).max(2000),
  gloss: z.string().max(2000).nullable().optional(),
});

// The speaker adds their own word/sentence + translation to record.
export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid input', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  try {
    const r: any = await db.execute(
      sql`select public.invite_add_target(${params.token}, ${body.kind}, ${body.text}, ${body.gloss ?? null}) as result`,
    );
    const rows = Array.isArray(r) ? r : r.rows ?? [];
    return NextResponse.json(rows[0]?.result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }
}

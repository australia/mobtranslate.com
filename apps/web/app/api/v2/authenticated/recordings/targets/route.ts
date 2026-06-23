import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
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

  // auth_add_target reads auth.uid() from the request.jwt.claim.sub GUC.
  try {
    const data = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${auth.user.id}, true)`);
      const r: any = await tx.execute(
        sql`select public.auth_add_target(${body.languageId}::uuid, ${body.kind}, ${body.text}, ${body.gloss ?? null}) as result`,
      );
      const rows = Array.isArray(r) ? r : r.rows ?? [];
      return rows[0]?.result;
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }
}

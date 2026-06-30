import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { usageExamples, words as wordsT } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

const schema = z.object({
  exampleText: z.string().min(1).max(2000),
  translation: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/v2/words/{id}/examples
 *
 * Any signed-in user can add a usage example to a word. Returns the created
 * example (incl. its id) so the client can immediately record it via
 * /api/v2/examples/{id}/recordings.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: wordId } = await props.params;
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: 'Please sign in to add an example.' }, { status: 401 });

  let data: z.infer<typeof schema>;
  try {
    data = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  try {
    const w = await db.select({ id: wordsT.id }).from(wordsT).where(eq(wordsT.id, wordId)).limit(1);
    if (!w[0]) return NextResponse.json({ error: 'Word not found' }, { status: 404 });

    const [row] = await db
      .insert(usageExamples)
      .values({
        wordId,
        exampleText: data.exampleText.trim(),
        translation: data.translation?.trim() || null,
        createdBy: me.id,
      })
      .returning({ id: usageExamples.id, exampleText: usageExamples.exampleText, translation: usageExamples.translation });

    return NextResponse.json(
      { id: row.id, example: row.exampleText, translation: row.translation },
      { status: 201 },
    );
  } catch (err) {
    console.error('[words/examples] insert failed', err);
    return NextResponse.json({ error: 'Could not add the example.' }, { status: 500 });
  }
}

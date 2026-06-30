import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/index';
import { getSessionUser } from '@/lib/auth-helpers';
import { wordImprovementSuggestions, words as wordsT } from '@/lib/db/schema';

export const runtime = 'nodejs';

const schema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  note: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/v2/words/{id}/location-suggestion
 *
 * Lets any signed-in user suggest where a place name sits on the map by dropping
 * (or dragging) a pin. Stored in the shared `word_improvement_suggestions` review
 * queue with improvement_type = 'location'; current lat/lon are captured so a
 * curator can see what (if anything) it would change before approving.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: wordId } = await props.params;
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: 'Please sign in to suggest a location.' }, { status: 401 });

  let data: z.infer<typeof schema>;
  try {
    data = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request', details: err instanceof z.ZodError ? err.issues : String(err) },
      { status: 400 },
    );
  }

  try {
    const w = await db
      .select({ id: wordsT.id, word: wordsT.word, latitude: wordsT.latitude, longitude: wordsT.longitude })
      .from(wordsT)
      .where(eq(wordsT.id, wordId))
      .limit(1);
    if (!w[0]) return NextResponse.json({ error: 'Place not found' }, { status: 404 });

    const [row] = await db
      .insert(wordImprovementSuggestions)
      .values({
        wordId,
        submittedBy: me.id,
        improvementType: 'location',
        fieldName: 'location',
        currentValue:
          w[0].latitude != null && w[0].longitude != null
            ? { latitude: Number(w[0].latitude), longitude: Number(w[0].longitude) }
            : null,
        suggestedValue: {
          word: w[0].word,
          latitude: data.latitude,
          longitude: data.longitude,
        },
        improvementReason: data.note ?? null,
        status: 'pending',
      })
      .returning({ id: wordImprovementSuggestions.id });

    return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
  } catch (err) {
    console.error('[location-suggestion] insert failed', err);
    return NextResponse.json({ error: 'Could not submit your suggestion.' }, { status: 500 });
  }
}

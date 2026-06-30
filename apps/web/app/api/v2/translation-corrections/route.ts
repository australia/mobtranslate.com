import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import { wordImprovementSuggestions, languages as languagesT } from '@/lib/db/schema';

export const runtime = 'nodejs';

const schema = z.object({
  languageCode: z.string().min(1),
  sourceText: z.string().min(1).max(2000),
  currentTranslation: z.string().max(2000).optional().nullable(),
  suggestedTranslation: z.string().min(1).max(2000),
  reason: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/v2/translation-corrections
 *
 * Lets any signed-in user suggest a better translation for a phrase that isn't a
 * single dictionary word (e.g. a homepage / app translate result). Stored in the
 * shared `word_improvement_suggestions` table with `word_id = null` and
 * `improvement_type = 'translation'`, so it flows into the same curator review
 * queue as word-level corrections.
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Please sign in to suggest a correction.' }, { status: 401 });

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
    // Resolve the language (for context); don't hard-fail if it's missing.
    const lang = await db
      .select({ id: languagesT.id, code: languagesT.code, name: languagesT.name })
      .from(languagesT)
      .where(eq(languagesT.code, data.languageCode))
      .limit(1);

    const [row] = await db
      .insert(wordImprovementSuggestions)
      .values({
        wordId: null,
        submittedBy: user!.id,
        improvementType: 'translation',
        fieldName: 'translation',
        currentValue: data.currentTranslation ?? null,
        suggestedValue: {
          languageCode: data.languageCode,
          languageName: lang[0]?.name ?? null,
          sourceText: data.sourceText,
          suggestedTranslation: data.suggestedTranslation,
        },
        improvementReason: data.reason ?? null,
        status: 'pending',
      })
      .returning({ id: wordImprovementSuggestions.id });

    return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
  } catch (err) {
    console.error('[translation-corrections] insert failed', err);
    return NextResponse.json({ error: 'Could not submit your suggestion.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import {
  definitions as definitionsT,
  translations as translationsT,
  words as wordsT,
  wordImprovementSuggestions as wisT,
} from '@/lib/db/schema';

export const runtime = 'nodejs';

const ADMIN_ROLES = ['super_admin', 'dictionary_admin'];

// Editable snapshot of a word: its columns, primary definition + translation,
// and any pending edit suggestions.
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { response } = await requireRole(ADMIN_ROLES);
  if (response) return response;

  const wordRows = await db
    .select({
      id: wordsT.id,
      language_id: wordsT.languageId,
      word: wordsT.word,
      phonetic_transcription: wordsT.phoneticTranscription,
      notes: wordsT.notes,
      word_type: wordsT.wordType,
    })
    .from(wordsT)
    .where(eq(wordsT.id, params.id))
    .limit(1);
  const word = wordRows[0];
  if (!word) return NextResponse.json({ error: 'Word not found' }, { status: 404 });

  const [defs, trans, suggestions] = await Promise.all([
    db
      .select({
        id: definitionsT.id,
        definition: definitionsT.definition,
        is_primary: definitionsT.isPrimary,
        definition_number: definitionsT.definitionNumber,
      })
      .from(definitionsT)
      .where(eq(definitionsT.wordId, params.id))
      .orderBy(desc(definitionsT.isPrimary), asc(definitionsT.definitionNumber)),
    db
      .select({
        id: translationsT.id,
        translation: translationsT.translation,
        is_primary: translationsT.isPrimary,
      })
      .from(translationsT)
      .where(eq(translationsT.wordId, params.id))
      .orderBy(desc(translationsT.isPrimary)),
    db
      .select({
        id: wisT.id,
        improvement_type: wisT.improvementType,
        field_name: wisT.fieldName,
        current_value: wisT.currentValue,
        suggested_value: wisT.suggestedValue,
        status: wisT.status,
        improvement_reason: wisT.improvementReason,
        created_at: wisT.createdAt,
      })
      .from(wisT)
      .where(and(eq(wisT.wordId, params.id), inArray(wisT.status, ['pending', 'under_review'])))
      .orderBy(desc(wisT.createdAt)),
  ]);

  return NextResponse.json({
    ...word,
    primaryDefinition: defs?.[0] ?? null,
    primaryTranslation: trans?.[0] ?? null,
    pendingSuggestions: suggestions ?? [],
  });
}

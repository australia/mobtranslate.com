// Shared logic for editing dictionary words through the suggestion/revision flow.
//
// Every edit becomes a `word_improvement_suggestions` row. Super_admins apply
// instantly (self-approve); other curators leave it pending for /curator review.
// On apply we snapshot the prior word state into `word_revisions` for a full
// audit trail, then mutate the underlying words/definitions/translations rows.

import { desc, eq } from 'drizzle-orm';
import { db as drizzle } from '@/lib/db/index';
import {
  definitions as definitionsT,
  translations as translationsT,
  words as wordsT,
  wordRevisions as revisionsT,
} from '@/lib/db/schema';

export const WORD_COLUMN_FIELDS = ['word', 'phonetic_transcription', 'notes', 'word_type'] as const;
export type WordColumnField = (typeof WORD_COLUMN_FIELDS)[number];
export type EditableField = WordColumnField | 'definition' | 'translation';

export const EDITABLE_FIELDS: EditableField[] = [...WORD_COLUMN_FIELDS, 'definition', 'translation'];

/** Map an editable field to the constrained improvement_type enum. */
export function improvementTypeFor(field: EditableField): string {
  if (field === 'definition') return 'definition';
  if (field === 'translation') return 'translation';
  if (field === 'phonetic_transcription') return 'pronunciation';
  return 'grammar'; // word / notes / word_type
}

export const FIELD_LABELS: Record<EditableField, string> = {
  word: 'Word (spelling)',
  phonetic_transcription: 'Phonetic transcription',
  notes: 'Notes',
  word_type: 'Word type',
  definition: 'Definition',
  translation: 'English translation',
};

/** A single proposed change coming from the editor. */
export interface FieldChange {
  field: EditableField;
  current: string | null;
  suggested: string | null;
  /** For definition/translation: the existing row id, or null to create one. */
  rowId?: string | null;
}

// The `db` parameter is kept for call-site compatibility but is no longer used:
// these helpers now talk to the shared Drizzle client directly.
type DB = unknown;

// Map a snake_case words-table column (field_name) to the camelCase Drizzle
// property key used in `.set({ ... })`.
const WORD_COLUMN_MAP: Record<string, string> = {
  word: 'word',
  normalized_word: 'normalizedWord',
  phonetic_transcription: 'phoneticTranscription',
  notes: 'notes',
  word_type: 'wordType',
  gender: 'gender',
  number: 'number',
  stem: 'stem',
  register: 'register',
  domain: 'domain',
  gloss: 'gloss',
};

/**
 * Apply one suggestion's change to the underlying tables.
 * `suggested_value` shape: a plain string for word columns; `{ id, text }` for
 * definition/translation.
 */
export async function applyWordSuggestion(
  _db: DB,
  suggestion: {
    word_id: string;
    improvement_type: string;
    field_name: string | null;
    suggested_value: unknown;
  },
): Promise<void> {
  const { word_id, improvement_type, field_name, suggested_value } = suggestion;

  // Tolerate both shapes: `{ id, text }` (this editor) or a plain string (legacy
  // suggestions created elsewhere) for definition/translation edits.
  const asRow = (val: unknown): { id: string | null; text: string } =>
    typeof val === 'string' ? { id: null, text: val } : ({ id: null, text: '', ...(val as object) } as { id: string | null; text: string });

  if (improvement_type === 'definition') {
    const v = asRow(suggested_value);
    if (v.id) await drizzle.update(definitionsT).set({ definition: v.text }).where(eq(definitionsT.id, v.id));
    else await drizzle.insert(definitionsT).values({ wordId: word_id, definition: v.text, isPrimary: true, definitionNumber: 1 });
    return;
  }

  if (improvement_type === 'translation') {
    const v = asRow(suggested_value);
    if (v.id) await drizzle.update(translationsT).set({ translation: v.text }).where(eq(translationsT.id, v.id));
    else await drizzle.insert(translationsT).values({ wordId: word_id, translation: v.text, isPrimary: true, targetLanguage: 'en' });
    return;
  }

  // Plain words-table column (word / phonetic_transcription / notes / word_type / …).
  // Trust field_name as a column (matches the prior curator behaviour).
  if (field_name) {
    const prop = WORD_COLUMN_MAP[field_name];
    if (prop) {
      await drizzle
        .update(wordsT)
        .set({ [prop]: (suggested_value as string) ?? null })
        .where(eq(wordsT.id, word_id));
    }
  }
}

/** Snapshot the current word (with definitions + translations) into word_revisions. */
export async function snapshotWordRevision(
  _db: DB,
  wordId: string,
  userId: string,
  changeDescription: string,
): Promise<void> {
  const [wordRows, defs, trans, lastRevRows] = await Promise.all([
    drizzle.select().from(wordsT).where(eq(wordsT.id, wordId)).limit(1),
    drizzle.select().from(definitionsT).where(eq(definitionsT.wordId, wordId)),
    drizzle.select().from(translationsT).where(eq(translationsT.wordId, wordId)),
    drizzle
      .select({ revisionNumber: revisionsT.revisionNumber })
      .from(revisionsT)
      .where(eq(revisionsT.wordId, wordId))
      .orderBy(desc(revisionsT.revisionNumber))
      .limit(1),
  ]);

  const word = wordRows[0] ?? null;
  const revisionNumber = (lastRevRows[0]?.revisionNumber ?? 0) + 1;
  await drizzle.insert(revisionsT).values({
    wordId,
    revisionData: { word, definitions: defs ?? [], translations: trans ?? [] },
    changeDescription,
    changedBy: userId,
    revisionNumber,
  });
}

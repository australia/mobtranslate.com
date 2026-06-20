// Shared logic for editing dictionary words through the suggestion/revision flow.
//
// Every edit becomes a `word_improvement_suggestions` row. Super_admins apply
// instantly (self-approve); other curators leave it pending for /curator review.
// On apply we snapshot the prior word state into `word_revisions` for a full
// audit trail, then mutate the underlying words/definitions/translations rows.

import type { SupabaseClient } from '@supabase/supabase-js';

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

type DB = SupabaseClient;

/**
 * Apply one suggestion's change to the underlying tables.
 * `suggested_value` shape: a plain string for word columns; `{ id, text }` for
 * definition/translation.
 */
export async function applyWordSuggestion(
  db: DB,
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
    if (v.id) await db.from('definitions').update({ definition: v.text }).eq('id', v.id);
    else await db.from('definitions').insert({ word_id, definition: v.text, is_primary: true, definition_number: 1 });
    return;
  }

  if (improvement_type === 'translation') {
    const v = asRow(suggested_value);
    if (v.id) await db.from('translations').update({ translation: v.text }).eq('id', v.id);
    else await db.from('translations').insert({ word_id, translation: v.text, is_primary: true, target_language: 'en' });
    return;
  }

  // Plain words-table column (word / phonetic_transcription / notes / word_type / …).
  // Trust field_name as a column (matches the prior curator behaviour).
  if (field_name) {
    await db
      .from('words')
      .update({ [field_name]: (suggested_value as string) ?? null })
      .eq('id', word_id);
  }
}

/** Snapshot the current word (with definitions + translations) into word_revisions. */
export async function snapshotWordRevision(
  db: DB,
  wordId: string,
  userId: string,
  changeDescription: string,
): Promise<void> {
  const [{ data: word }, { data: defs }, { data: trans }, { data: lastRev }] = await Promise.all([
    db.from('words').select('*').eq('id', wordId).single(),
    db.from('definitions').select('*').eq('word_id', wordId),
    db.from('translations').select('*').eq('word_id', wordId),
    db.from('word_revisions').select('revision_number').eq('word_id', wordId).order('revision_number', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const revisionNumber = (lastRev?.revision_number ?? 0) + 1;
  await db.from('word_revisions').insert({
    word_id: wordId,
    revision_data: { word, definitions: defs ?? [], translations: trans ?? [] },
    change_description: changeDescription,
    changed_by: userId,
    revision_number: revisionNumber,
  });
}

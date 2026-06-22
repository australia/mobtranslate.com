import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Editable snapshot of a word: its columns, primary definition + translation,
// and any pending edit suggestions.
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const db = auth.supabase;

  const { data: word, error } = await db
    .from('words')
    .select('id, language_id, word, phonetic_transcription, notes, word_type')
    .eq('id', params.id)
    .single();
  if (error || !word) return NextResponse.json({ error: 'Word not found' }, { status: 404 });

  const [{ data: defs }, { data: trans }, { data: suggestions }] = await Promise.all([
    db.from('definitions').select('id, definition, is_primary, definition_number').eq('word_id', params.id).order('is_primary', { ascending: false }).order('definition_number', { ascending: true }),
    db.from('translations').select('id, translation, is_primary').eq('word_id', params.id).order('is_primary', { ascending: false }),
    db
      .from('word_improvement_suggestions')
      .select('id, improvement_type, field_name, current_value, suggested_value, status, improvement_reason, created_at')
      .eq('word_id', params.id)
      .in('status', ['pending', 'under_review'])
      .order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({
    ...word,
    primaryDefinition: defs?.[0] ?? null,
    primaryTranslation: trans?.[0] ?? null,
    pendingSuggestions: suggestions ?? [],
  });
}

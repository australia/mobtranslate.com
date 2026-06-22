import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/recording/server';
import { createClient } from '@/lib/supabase/server';
import {
  applyWordSuggestion,
  EDITABLE_FIELDS,
  FIELD_LABELS,
  improvementTypeFor,
  snapshotWordRevision,
  type EditableField,
} from '@/lib/words/editing';

export const runtime = 'nodejs';

const changeSchema = z.object({
  field: z.enum(['word', 'phonetic_transcription', 'notes', 'word_type', 'definition', 'translation']),
  current: z.string().nullable().optional(),
  suggested: z.string().max(5000).nullable(),
  rowId: z.string().uuid().nullable().optional(),
});

const bodySchema = z.object({
  changes: z.array(changeSchema).min(1),
  reason: z.string().max(1000).optional(),
});

// Submit edits to a word. Super_admins apply immediately (still logged as a
// suggestion + revision); other curators leave them pending for /curator.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const db = auth.supabase;
  const wordId = params.id;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  // Drop no-op changes.
  const changes = body.changes.filter((c) => (c.current ?? '') !== (c.suggested ?? ''));
  if (changes.length === 0) return NextResponse.json({ applied: 0, queued: 0, suggestions: [] });

  // Self-approve only for super_admins (per policy); others queue for review.
  const userClient = await createClient();
  const { data: isSuper } = await userClient.rpc('user_has_role', { user_uuid: auth.user.id, role_names: ['super_admin'] });
  const selfApprove = !!isSuper;

  const { data: word } = await db.from('words').select('id, language_id').eq('id', wordId).single();
  if (!word) return NextResponse.json({ error: 'Word not found' }, { status: 404 });

  // Snapshot the current state before any mutation (only when applying now).
  if (selfApprove) {
    const summary = changes.map((c) => FIELD_LABELS[c.field as EditableField]).join(', ');
    await snapshotWordRevision(db, wordId, auth.user.id, `Edited: ${summary}`);
  }

  const created: unknown[] = [];
  let applied = 0;
  let queued = 0;

  for (const c of changes) {
    const field = c.field as EditableField;
    if (!EDITABLE_FIELDS.includes(field)) continue;
    const improvementType = improvementTypeFor(field);

    // Build JSONB current/suggested values: scalar for columns, {id,text} for def/trans.
    const isRowField = field === 'definition' || field === 'translation';
    const suggestedValue = isRowField ? { id: c.rowId ?? null, text: c.suggested ?? '' } : (c.suggested ?? '');
    const currentValue = isRowField ? { id: c.rowId ?? null, text: c.current ?? '' } : (c.current ?? '');
    const fieldName = isRowField ? field : field;

    const { data: suggestion, error: insErr } = await db
      .from('word_improvement_suggestions')
      .insert({
        word_id: wordId,
        submitted_by: auth.user.id,
        improvement_type: improvementType,
        field_name: fieldName,
        current_value: currentValue,
        suggested_value: suggestedValue,
        improvement_reason: body.reason ?? null,
        status: selfApprove ? 'implemented' : 'pending',
        reviewed_by: selfApprove ? auth.user.id : null,
        reviewed_at: selfApprove ? new Date().toISOString() : null,
        implemented_at: selfApprove ? new Date().toISOString() : null,
        implementation_notes: selfApprove ? 'Self-approved by super_admin from recording studio' : null,
      })
      .select()
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    created.push(suggestion);

    if (selfApprove) {
      await applyWordSuggestion(db, {
        word_id: wordId,
        improvement_type: improvementType,
        field_name: fieldName,
        suggested_value: suggestedValue,
      });
      applied += 1;
    } else {
      queued += 1;
    }
  }

  // Log the activity for the curator dashboard / audit trail.
  await db.from('curator_activities').insert({
    user_id: auth.user.id,
    language_id: word.language_id,
    activity_type: selfApprove ? 'word_edited' : 'edit_suggested',
    target_type: 'word',
    target_id: wordId,
    activity_data: { fields: changes.map((c) => c.field), applied, queued, reason: body.reason ?? null },
  });

  return NextResponse.json({ applied, queued, selfApprove, suggestions: created });
}

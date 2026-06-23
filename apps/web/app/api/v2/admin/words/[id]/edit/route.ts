import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole, userHasRole } from '@/lib/auth-helpers';
import {
  curatorActivities as activitiesT,
  words as wordsT,
  wordImprovementSuggestions as wisT,
} from '@/lib/db/schema';
import {
  applyWordSuggestion,
  EDITABLE_FIELDS,
  FIELD_LABELS,
  improvementTypeFor,
  snapshotWordRevision,
  type EditableField,
} from '@/lib/words/editing';

export const runtime = 'nodejs';

const ADMIN_ROLES = ['super_admin', 'dictionary_admin'];

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
  const { user, response } = await requireRole(ADMIN_ROLES);
  if (response) return response;
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
  const isSuper = await userHasRole(user!.id, ['super_admin']);
  const selfApprove = !!isSuper;

  const wordRows = await db
    .select({ id: wordsT.id, languageId: wordsT.languageId })
    .from(wordsT)
    .where(eq(wordsT.id, wordId))
    .limit(1);
  const word = wordRows[0];
  if (!word) return NextResponse.json({ error: 'Word not found' }, { status: 404 });

  // Snapshot the current state before any mutation (only when applying now).
  if (selfApprove) {
    const summary = changes.map((c) => FIELD_LABELS[c.field as EditableField]).join(', ');
    await snapshotWordRevision(db, wordId, user!.id, `Edited: ${summary}`);
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

    let suggestion: any;
    try {
      const inserted = await db
        .insert(wisT)
        .values({
          wordId,
          submittedBy: user!.id,
          improvementType,
          fieldName,
          currentValue,
          suggestedValue,
          improvementReason: body.reason ?? null,
          status: selfApprove ? 'implemented' : 'pending',
          reviewedBy: selfApprove ? user!.id : null,
          reviewedAt: selfApprove ? new Date().toISOString() : null,
          implementedAt: selfApprove ? new Date().toISOString() : null,
          implementationNotes: selfApprove ? 'Self-approved by super_admin from recording studio' : null,
        })
        .returning();
      suggestion = inserted[0];
    } catch (insErr) {
      return NextResponse.json({ error: insErr instanceof Error ? insErr.message : String(insErr) }, { status: 500 });
    }
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
  await db.insert(activitiesT).values({
    userId: user!.id,
    languageId: word.languageId,
    activityType: selfApprove ? 'word_edited' : 'edit_suggested',
    targetType: 'word',
    targetId: wordId,
    activityData: { fields: changes.map((c) => c.field), applied, queued, reason: body.reason ?? null },
  });

  return NextResponse.json({ applied, queued, selfApprove, suggestions: created });
}

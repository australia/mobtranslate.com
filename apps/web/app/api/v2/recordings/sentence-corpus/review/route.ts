import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// POST an elder judgment on a sentence. Every call appends one row to the
// append-only sentence_reviews ledger (provenance) and transitions the queue:
//   fixed          → update kuku_text (original_kuku stays immutable), log previous/new
//   marked_bad     → status = marked_bad
//   skipped        → status = skipped, times_skipped++
//   approved_as_is → text confirmed correct as written (verification, no text change)
const schema = z.object({
  sentenceId: z.string().uuid(),
  speakerId: z.string().uuid().nullable().optional(),
  action: z.enum(['fixed', 'marked_bad', 'skipped', 'approved_as_is']),
  newKuku: z.string().min(1).max(4000).nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) },
      { status: 400 },
    );
  }

  if (body.action === 'fixed' && !body.newKuku?.trim()) {
    return NextResponse.json({ error: 'newKuku is required to fix a sentence' }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Lock + read the current authoritative surface.
      const curRes = await tx.execute(sql`
        select id, kuku_text, original_kuku, status
        from public.recording_sentences where id = ${body.sentenceId}::uuid for update`);
      const cur = rowsOf<{ id: string; kuku_text: string; original_kuku: string; status: string }>(curRes)[0];
      if (!cur) throw new Error('Sentence not found');

      const previousKuku = cur.kuku_text;
      let newKuku: string | null = null;

      if (body.action === 'fixed') {
        newKuku = body.newKuku!.trim();
        // Only kuku_text moves; original_kuku is immutable. Status stays as-is
        // (the corrected text is recorded next, which sets fixed_recorded).
        await tx.execute(sql`
          update public.recording_sentences
          set kuku_text = ${newKuku}, updated_at = now()
          where id = ${body.sentenceId}::uuid`);
      } else if (body.action === 'marked_bad') {
        await tx.execute(sql`
          update public.recording_sentences
          set status = 'marked_bad', updated_at = now()
          where id = ${body.sentenceId}::uuid`);
      } else if (body.action === 'skipped') {
        await tx.execute(sql`
          update public.recording_sentences
          set status = 'skipped', times_skipped = times_skipped + 1, updated_at = now()
          where id = ${body.sentenceId}::uuid`);
      }
      // approved_as_is: no queue change — a verification event only.

      // Append the immutable ledger row.
      const insRes = await tx.execute(sql`
        insert into public.sentence_reviews
          (sentence_id, speaker_id, reviewer_user_id, action, previous_kuku, new_kuku, reason)
        values
          (${body.sentenceId}::uuid, ${body.speakerId ?? null}::uuid, ${user!.id}::uuid,
           ${body.action}, ${previousKuku}, ${newKuku}, ${body.reason ?? null})
        returning id, created_at`);
      const review = rowsOf(insRes)[0];

      return { review, newKuku };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message },
      { status: 400 },
    );
  }
}

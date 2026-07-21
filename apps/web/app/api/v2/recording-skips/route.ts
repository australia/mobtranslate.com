import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/index';
import { getSessionUser } from '@/lib/auth-helpers';
import { recordingSkips, languages as languagesT } from '@/lib/db/schema';

export const runtime = 'nodejs';

const REASONS = ['unsure', 'bad_sentence', 'wrong_spelling', 'inappropriate', 'too_hard', 'other'] as const;

const schema = z.object({
  targetType: z.enum(['word', 'sentence']),
  targetId: z.string().uuid(),
  languageCode: z.string().optional().nullable(),
  reason: z.enum(REASONS).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/v2/recording-skips
 *
 * A recorder passes on a word/sentence instead of recording it, optionally
 * saying why (e.g. the sentence is bad). Stored so curators can see which items
 * get skipped a lot and why — a quality signal, not just a personal skip.
 */
export async function POST(request: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

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
    let languageId: string | null = null;
    if (data.languageCode) {
      const lang = await db
        .select({ id: languagesT.id })
        .from(languagesT)
        .where(eq(languagesT.code, data.languageCode))
        .limit(1);
      languageId = lang[0]?.id ?? null;
    }

    const [row] = await db
      .insert(recordingSkips)
      .values({
        targetType: data.targetType,
        targetId: data.targetId,
        languageId,
        reason: data.reason ?? null,
        note: data.note ?? null,
        skippedBy: me.id,
      })
      .returning({ id: recordingSkips.id });

    return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
  } catch (err) {
    console.error('[recording-skips] insert failed', err);
    return NextResponse.json({ error: 'Could not record your skip.' }, { status: 500 });
  }
}

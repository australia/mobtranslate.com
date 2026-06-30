import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { speakerInvites, languages } from '@/lib/db/schema';
import { requireUser } from '@/lib/recording/server';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v2/authenticated/recordings/self-enroll
 *
 * Lets ANY signed-in user opt in to contribute recordings for a language.
 * Idempotently ensures a `speaker_invites` row with mode='registered',
 * invited_user_id = current user, language_id = languageId — which is exactly
 * what `_auth_registered_lang(user_id, language_id)` validates, so after this
 * the worklist / targets / upload endpoints work for that user.
 *
 * Mirrors the registered-invite insert path in
 * app/api/v2/admin/recordings/invites/route.ts (matches the open
 * public-domain contribution model).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  let languageId: string | undefined;
  try {
    const body = await request.json();
    languageId = typeof body?.languageId === 'string' ? body.languageId.trim() : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!languageId || !UUID_RE.test(languageId)) {
    return NextResponse.json({ error: 'languageId (uuid) is required' }, { status: 400 });
  }

  try {
    // Validate the language exists (FK is ON DELETE CASCADE, but give a clear 404).
    const langRows = await db
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.id, languageId))
      .limit(1);
    if (!langRows[0]) {
      return NextResponse.json({ error: 'Language not found' }, { status: 404 });
    }

    // Idempotent: if an active registered invite already exists, no-op.
    const existing = await db
      .select({ id: speakerInvites.id })
      .from(speakerInvites)
      .where(
        and(
          eq(speakerInvites.languageId, languageId),
          eq(speakerInvites.invitedUserId, userId),
          eq(speakerInvites.mode, 'registered'),
          eq(speakerInvites.status, 'active'),
        ),
      )
      .limit(1);

    if (existing[0]) {
      return NextResponse.json({ enrolled: true, languageId });
    }

    // Create the registered invite. `token` is NOT NULL + unique; a registered
    // invite is account-linked (no link to share) but the column still needs a
    // value, so mint a random one. status/mode handled explicitly.
    const token = randomBytes(24).toString('base64url');
    try {
      await db.insert(speakerInvites).values({
        token,
        languageId,
        mode: 'registered',
        status: 'active',
        invitedUserId: userId,
        createdBy: userId,
        label: 'Self-enrolled contributor',
      });
    } catch (error) {
      // 23505 = the partial unique index (uniq_registered_invite) — a concurrent
      // self-enroll already created it. Treat as success (idempotent).
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ enrolled: true, languageId });
      }
      throw error;
    }

    return NextResponse.json({ enrolled: true, languageId });
  } catch (err) {
    console.error('[self-enroll] failed', err);
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message ?? 'Failed to enroll' },
      { status: 500 },
    );
  }
}

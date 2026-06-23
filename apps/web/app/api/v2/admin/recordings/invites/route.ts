import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { speakerInvites, speakerProfiles, userProfiles } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

function inviteUrl(request: NextRequest, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/record/${token}`;
}

// ---- GET: list invites for a language ----------------------------------
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });

  const rows = await db
    .select({
      id: speakerInvites.id,
      token: speakerInvites.token,
      label: speakerInvites.label,
      status: speakerInvites.status,
      mode: speakerInvites.mode,
      invited_user_id: speakerInvites.invitedUserId,
      expires_at: speakerInvites.expiresAt,
      last_used_at: speakerInvites.lastUsedAt,
      created_at: speakerInvites.createdAt,
      speakerId: speakerProfiles.id,
      speakerName: speakerProfiles.name,
    })
    .from(speakerInvites)
    .leftJoin(speakerProfiles, eq(speakerInvites.speakerId, speakerProfiles.id))
    .where(eq(speakerInvites.languageId, languageId))
    .orderBy(desc(speakerInvites.createdAt));

  const invites = rows.map(({ speakerId, speakerName, ...i }) => ({
    ...i,
    speaker: speakerId ? { id: speakerId, name: speakerName } : null,
    url: inviteUrl(request, i.token),
  }));
  return NextResponse.json(invites);
}

// ---- POST: create an invite (optionally creating a speaker) ------------
const createSchema = z.object({
  languageId: z.string().uuid(),
  speakerId: z.string().uuid().nullable().optional(),
  speakerName: z.string().min(1).max(255).nullable().optional(),
  invitedUserId: z.string().uuid().nullable().optional(),
  label: z.string().max(255).nullable().optional(),
});

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }
  const targets = [body.speakerId, body.speakerName, body.invitedUserId].filter(Boolean);
  if (targets.length !== 1) {
    return NextResponse.json({ error: 'Provide exactly one of: a registered user, an existing speaker, or a new name.' }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + NINETY_DAYS_MS).toISOString();
  const token = randomBytes(24).toString('base64url'); // URL-safe, ~32 chars

  // --- Registered-user invite: links to an account, no anonymous token needed to share ---
  if (body.invitedUserId) {
    const profileRows = await db
      .select({
        userId: userProfiles.userId,
        email: userProfiles.email,
        displayName: userProfiles.displayName,
        username: userProfiles.username,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, body.invitedUserId))
      .limit(1);
    const profile = profileRows[0];
    if (!profile) return NextResponse.json({ error: 'That user was not found.' }, { status: 404 });

    let data;
    try {
      const rows = await db
        .insert(speakerInvites)
        .values({
          token,
          languageId: body.languageId,
          mode: 'registered',
          invitedUserId: body.invitedUserId,
          label: body.label?.trim() || profile.displayName || profile.username || profile.email || 'Speaker',
          createdBy: userId,
          expiresAt: expiresAt,
        })
        .returning({
          id: speakerInvites.id,
          token: speakerInvites.token,
          label: speakerInvites.label,
          status: speakerInvites.status,
          mode: speakerInvites.mode,
          created_at: speakerInvites.createdAt,
          expires_at: speakerInvites.expiresAt,
          invited_user_id: speakerInvites.invitedUserId,
        });
      data = rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'That user already has an active invite for this language.' }, { status: 409 });
      }
      return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
    return NextResponse.json(
      { ...data, url: inviteUrl(request, token), invited_user: { email: profile.email, display_name: profile.displayName, username: profile.username } },
      { status: 201 },
    );
  }

  // --- Anonymous (token-link) invite ---
  let speakerId = body.speakerId ?? null;
  let speaker: { id: string; name: string } | null = null;
  if (!speakerId && body.speakerName) {
    try {
      const rows = await db
        .insert(speakerProfiles)
        .values({ name: body.speakerName.trim(), languageId: body.languageId, createdBy: userId })
        .returning({ id: speakerProfiles.id, name: speakerProfiles.name });
      speaker = rows[0];
      speakerId = rows[0].id;
    } catch (err) {
      return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 500 });
    }
  } else if (speakerId) {
    const rows = await db
      .select({ id: speakerProfiles.id, name: speakerProfiles.name })
      .from(speakerProfiles)
      .where(eq(speakerProfiles.id, speakerId))
      .limit(1);
    speaker = rows[0] ?? null;
  }

  let data;
  try {
    const rows = await db
      .insert(speakerInvites)
      .values({
        token,
        languageId: body.languageId,
        mode: 'anonymous',
        speakerId: speakerId,
        label: body.label?.trim() || body.speakerName?.trim() || null,
        createdBy: userId,
        expiresAt: expiresAt,
      })
      .returning({
        id: speakerInvites.id,
        token: speakerInvites.token,
        label: speakerInvites.label,
        status: speakerInvites.status,
        mode: speakerInvites.mode,
        created_at: speakerInvites.createdAt,
        expires_at: speakerInvites.expiresAt,
      });
    data = rows[0];
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 500 });
  }

  return NextResponse.json({ ...data, speaker, url: inviteUrl(request, token) }, { status: 201 });
}

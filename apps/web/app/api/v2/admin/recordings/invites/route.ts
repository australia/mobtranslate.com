import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
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

  const { data, error } = await auth.supabase
    .from('speaker_invites')
    .select('id, token, label, status, mode, invited_user_id, expires_at, last_used_at, created_at, speaker:speaker_profiles(id, name)')
    .eq('language_id', languageId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const invites = (data ?? []).map((i) => ({ ...i, url: inviteUrl(request, i.token) }));
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

  const db = auth.supabase;
  const expiresAt = new Date(Date.now() + NINETY_DAYS_MS).toISOString();
  const token = randomBytes(24).toString('base64url'); // URL-safe, ~32 chars

  // --- Registered-user invite: links to an account, no anonymous token needed to share ---
  if (body.invitedUserId) {
    const { data: profile } = await db
      .from('user_profiles')
      .select('user_id, email, display_name, username')
      .eq('user_id', body.invitedUserId)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: 'That user was not found.' }, { status: 404 });

    const { data, error } = await db
      .from('speaker_invites')
      .insert({
        token,
        language_id: body.languageId,
        mode: 'registered',
        invited_user_id: body.invitedUserId,
        label: body.label?.trim() || profile.display_name || profile.username || profile.email || 'Speaker',
        created_by: auth.user.id,
        expires_at: expiresAt,
      })
      .select('id, token, label, status, mode, created_at, expires_at, invited_user_id')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'That user already has an active invite for this language.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { ...data, url: inviteUrl(request, token), invited_user: { email: profile.email, display_name: profile.display_name, username: profile.username } },
      { status: 201 },
    );
  }

  // --- Anonymous (token-link) invite ---
  let speakerId = body.speakerId ?? null;
  if (!speakerId && body.speakerName) {
    const { data: sp, error: spErr } = await db
      .from('speaker_profiles')
      .insert({ name: body.speakerName.trim(), language_id: body.languageId, created_by: auth.user.id })
      .select('id, name')
      .single();
    if (spErr) return NextResponse.json({ error: spErr.message }, { status: 500 });
    speakerId = sp.id;
  }

  const { data, error } = await db
    .from('speaker_invites')
    .insert({
      token,
      language_id: body.languageId,
      mode: 'anonymous',
      speaker_id: speakerId,
      label: body.label?.trim() || body.speakerName?.trim() || null,
      created_by: auth.user.id,
      expires_at: expiresAt,
    })
    .select('id, token, label, status, mode, created_at, expires_at, speaker:speaker_profiles(id, name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...data, url: inviteUrl(request, token) }, { status: 201 });
}

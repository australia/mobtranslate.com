// Anon Supabase client + helpers for the no-login speaker portal.
// All privileged work happens inside token-validated SECURITY DEFINER RPCs;
// this client only ever runs as the `anon` role.
import { createClient } from '@supabase/supabase-js';

export const RECORDINGS_BUCKET = 'recordings';

export function publicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface InviteContext {
  invite_id: string;
  label: string | null;
  language_id: string;
  language_code: string;
  language_name: string;
  speaker_id: string | null;
  speaker_name: string | null;
  my_recordings: number;
}

/** Resolve + validate an invite token. Returns null if invalid/revoked/expired. */
export async function resolveInvite(token: string): Promise<InviteContext | null> {
  const db = publicClient();
  const { data, error } = await db.rpc('invite_context', { p_token: token });
  if (error || !data) return null;
  return data as InviteContext;
}

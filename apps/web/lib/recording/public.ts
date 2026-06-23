// Helpers for the no-login speaker portal.
// Privileged work happens inside token-validated SECURITY DEFINER SQL functions
// (`invite_*`); we call them via raw SQL against the self-hosted Postgres.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';

export const RECORDINGS_BUCKET = 'recordings';

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
  try {
    const res: any = await db.execute(
      sql`select public.invite_context(${token}) as ctx`
    );
    const rows = Array.isArray(res) ? res : res?.rows;
    const ctx = rows?.[0]?.ctx;
    if (!ctx) return null;
    return ctx as InviteContext;
  } catch {
    return null;
  }
}

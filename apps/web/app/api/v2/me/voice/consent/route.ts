import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { getSessionUser } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

function rows<T = any>(res: any): T[] {
  return (Array.isArray(res) ? res : res?.rows ?? []) as T[];
}

/**
 * Grant or revoke consent to train a voice model on the user's own recordings.
 * Explicit and revocable (CARE). If the user has no speaker profile yet, we create
 * a self profile linked to them for the language they've recorded most.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid = user.id;

  const body = await req.json().catch(() => ({}));
  const grant = body?.grant === true;
  const note = typeof body?.note === 'string' ? body.note.slice(0, 1000) : null;

  // Ensure the user has at least one speaker profile to attach consent to.
  const existing = rows(await db.execute(sql`select id from public.speaker_profiles where user_id = ${uid}::uuid limit 1`));
  if (existing.length === 0) {
    const dom = rows(await db.execute(sql`
      select r.language_id, count(*)::int c from public.recordings r
      where r.status='active' and r.recorded_by = ${uid}::uuid
      group by r.language_id order by c desc limit 1
    `));
    const languageId: string | null = dom[0]?.language_id ?? null;
    await db.execute(sql`
      insert into public.speaker_profiles (user_id, name, language_id, created_by)
      values (${uid}::uuid, ${user.name || user.email || 'Me'}, ${languageId}::uuid, ${uid}::uuid)
      on conflict do nothing
    `);
  }

  await db.execute(sql`
    update public.speaker_profiles
       set training_consent = ${grant},
           training_consent_at = ${grant ? sql`now()` : sql`null`},
           training_consent_note = ${note},
           updated_at = now()
     where user_id = ${uid}::uuid
  `);

  return NextResponse.json({ ok: true, granted: grant });
}

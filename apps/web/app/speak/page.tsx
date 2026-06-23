import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Mic, ChevronRight } from 'lucide-react';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { getSessionUser } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Record your language' };

interface MyInvite {
  language_id: string;
  language_code: string;
  language_name: string;
  my_recordings: number;
}

export default async function SpeakHubPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth/signin?redirect=/speak');

  // auth_my_invites() reads auth.uid() from the request.jwt.claim.sub GUC.
  // Set it transaction-locally so the SECURITY DEFINER function scopes to us.
  const data = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${user.id}, true)`);
    const res: any = await tx.execute(sql`select * from public.auth_my_invites()`);
    return Array.isArray(res) ? res : res?.rows ?? [];
  });
  const invites = (data ?? []) as MyInvite[];

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="flex items-center gap-2 text-[var(--color-primary)]">
        <Mic className="h-5 w-5" />
        <span className="text-sm font-semibold uppercase tracking-wide">Record</span>
      </div>
      <h1 className="mt-2 font-display text-3xl font-bold text-foreground">Record your language</h1>

      {invites.length === 0 ? (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-8 text-center">
          <Mic className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-lg font-medium text-foreground">No recording invitations yet</p>
          <p className="mt-1 text-base text-muted-foreground">
            When a language keeper invites you to record, the language will appear here.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-lg text-muted-foreground">Pick a language you’ve been invited to record.</p>
          <div className="mt-6 space-y-3">
            {invites.map((inv) => (
              <Link
                key={inv.language_id}
                href={`/speak/${inv.language_id}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-[var(--color-primary)]"
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)] text-[var(--color-primary)]">
                  <Mic className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-foreground">{inv.language_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {inv.my_recordings > 0 ? `${inv.my_recordings} recordings so far` : 'Not started yet'}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

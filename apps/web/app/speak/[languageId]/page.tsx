import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Mic } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PortalApp } from '@/app/record/[token]/PortalApp';

export const dynamic = 'force-dynamic';

interface MyInvite {
  language_id: string;
  language_code: string;
  language_name: string;
}

export default async function SpeakLanguagePage({ params }: { params: { languageId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/signin?redirect=/speak/${params.languageId}`);

  const { data } = await supabase.rpc('auth_my_invites');
  const invites = (data ?? []) as MyInvite[];
  const invite = invites.find((i) => i.language_id === params.languageId);

  if (!invite) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Mic className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-foreground">You’re not recording this language</h1>
        <p className="mt-2 text-lg text-muted-foreground">You don’t have an active invitation for this language.</p>
        <Link href="/speak" className="mt-5 inline-flex items-center gap-1 text-base font-medium text-[var(--color-primary)]">
          <ChevronLeft className="h-4 w-4" /> Back to my languages
        </Link>
      </div>
    );
  }

  return (
    <PortalApp
      source={{
        kind: 'auth',
        ctx: { language_id: invite.language_id, language_code: invite.language_code, language_name: invite.language_name },
      }}
    />
  );
}

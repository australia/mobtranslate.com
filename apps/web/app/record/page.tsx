import Link from 'next/link';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES } from '@/lib/recording/sentence-studio';
import SentenceStudio from './SentenceStudio';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sentence Recording Studio · Kuku Yalanji',
  description: 'Record and verify Kuku Yalanji sentences with elders.',
};

function Gate({ title, body, cta }: { title: string; body: string; cta?: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-stone-50 p-8">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-bold text-stone-800 mb-3">{title}</h1>
        <p className="text-lg text-stone-600 mb-6">{body}</p>
        {cta}
      </div>
    </main>
  );
}

export default async function RecordPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <Gate
        title="Sign in to record"
        body="The sentence recording studio is for signed-in curators and language admins helping elders record Kuku Yalanji."
        cta={
          <Link
            href="/auth/signin?redirect=/record"
            className="inline-block rounded-xl bg-emerald-600 px-6 py-3 text-lg font-semibold text-white hover:bg-emerald-700"
          >
            Sign in
          </Link>
        }
      />
    );
  }
  const ok = await userHasRole(user.id, STUDIO_ROLES);
  if (!ok) {
    return (
      <Gate
        title="Curator access needed"
        body="Recording and verifying sentences with elders requires a curator or language-admin role. Ask an admin to grant you access."
        cta={
          <Link href="/" className="inline-block rounded-xl border border-stone-300 px-6 py-3 text-lg font-semibold text-stone-700 hover:bg-stone-100">
            Back to home
          </Link>
        }
      />
    );
  }

  return <SentenceStudio operatorName={user.name ?? user.email} />;
}

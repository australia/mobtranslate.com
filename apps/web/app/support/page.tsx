import type { Metadata } from 'next';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { BookOpen, Mail, Mic, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get help with the Mob Translate app, accounts, language content and recordings.',
  alternates: { canonical: '/support' },
};

export default function SupportPage() {
  return (
    <SharedLayout>
      <div className="max-w-3xl mx-auto py-10 md:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary mb-2">
          Help
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
          Mob Translate support
        </h1>
        <p className="text-lg text-muted-foreground mt-4 max-w-2xl leading-relaxed">
          Tell us what happened, which language you were using, and which screen
          you were on. We can help with the Android app, accounts, recordings
          and language content.
        </p>

        <a
          href="mailto:ajax@mobtranslate.com?subject=Mob%20Translate%20support"
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 h-12 font-semibold hover:opacity-90 transition-opacity"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Email ajax@mobtranslate.com
        </a>

        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          <SupportCard
            icon={BookOpen}
            title="Words and translations"
            body="Include the language, word or phrase, and what you think should change."
          />
          <SupportCard
            icon={Mic}
            title="Recordings"
            body="We can help with uploads or remove a recording you contributed."
          />
          <SupportCard
            icon={ShieldCheck}
            title="Privacy and accounts"
            body="Ask a privacy question or request account and data deletion."
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link
            href="/privacy"
            className="text-primary font-medium hover:underline"
          >
            Privacy Policy
          </Link>
          <Link
            href="/account-deletion"
            className="text-primary font-medium hover:underline"
          >
            Delete account and data
          </Link>
          <a
            href="https://github.com/australia/mobtranslate.com/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium hover:underline"
          >
            Report a technical issue
          </a>
        </div>
      </div>
    </SharedLayout>
  );
}

function SupportCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof BookOpen;
  title: string;
  body: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      <h2 className="font-semibold mt-3">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
        {body}
      </p>
    </section>
  );
}

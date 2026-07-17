import Link from 'next/link';
import type { Metadata } from 'next';
import SharedLayout from '../components/SharedLayout';
import { Mail, ShieldCheck, Trash2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Delete your account and data',
  description:
    'Request deletion of your Mob Translate account and associated personal data.',
  alternates: { canonical: '/account-deletion' },
};

const DELETE_EMAIL =
  'mailto:ajax@mobtranslate.com?subject=Delete%20my%20Mob%20Translate%20account&body=Please%20delete%20my%20Mob%20Translate%20account%20and%20associated%20data.%0A%0AAccount%20email%3A%20';

export default function AccountDeletionPage() {
  return (
    <SharedLayout>
      <article className="max-w-2xl mx-auto py-10 md:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary mb-2">
          Privacy control
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-balance">
          Delete your account and data
        </h1>
        <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
          You can request deletion of your Mob Translate account at any time.
          You do not need the app installed to make a request.
        </p>

        <section className="mt-8 rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-start gap-3">
            <Trash2
              className="h-5 w-5 text-primary mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-lg font-semibold">What we delete</h2>
              <ul className="list-disc pl-5 mt-3 space-y-2 text-foreground/90">
                <li>
                  Your sign-in account, profile, active sessions and
                  authentication data.
                </li>
                <li>
                  Your saved words, learning progress and activity associated
                  with the account.
                </li>
                <li>
                  Your voice recordings, text contributions and suggestions, or
                  their permanent link to your identity where de-identification
                  is required for a legitimate reason.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-start gap-3">
            <Mail
              className="h-5 w-5 text-primary mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-lg font-semibold">How to request deletion</h2>
              <ol className="list-decimal pl-5 mt-3 space-y-2 text-foreground/90">
                <li>
                  Email us from the address used for your Mob Translate account.
                </li>
                <li>Use the subject “Delete my Mob Translate account”.</li>
                <li>
                  We will verify the request, confirm what will be removed, and
                  complete it as quickly as reasonably possible.
                </li>
              </ol>
              <a
                href={DELETE_EMAIL}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 h-12 font-semibold hover:opacity-90 transition-opacity"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email a deletion request
              </a>
            </div>
          </div>
        </section>

        <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          <ShieldCheck
            className="h-5 w-5 text-primary shrink-0"
            aria-hidden="true"
          />
          <p>
            We may retain minimal information only where required for security,
            fraud prevention, legal obligations, or to record that a deletion
            request was completed. See our{' '}
            <Link
              href="/privacy"
              className="text-primary font-medium hover:underline"
            >
              Privacy Policy
            </Link>{' '}
            for details.
          </p>
        </div>
      </article>
    </SharedLayout>
  );
}

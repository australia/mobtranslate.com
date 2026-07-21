import type { Metadata } from 'next';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Mob Translate handles your data.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <SharedLayout>
      <article className="max-w-2xl mx-auto py-10 md:py-14 prose-mt">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last updated: 19 July 2026
        </p>

        <p className="mt-6 leading-relaxed">
          Mob Translate is an open-source website and mobile app for learning,
          translating and recording First Nations languages. This policy
          explains what Mob Translate collects, why we collect it, how it may be
          shared, and the choices you have.
        </p>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <b>Account details</b> — your name, email address, account
              identifier and sign-in information if you create an account.
              Passwords are stored as secure hashes, not as readable text.
            </li>
            <li>
              <b>Language contributions</b> — voice recordings, words,
              sentences, corrections, place suggestions, speaker information and
              consent choices that you submit.
            </li>
            <li>
              <b>App activity and requests</b> — app opens, dictionary searches,
              text submitted for translation, pronunciation requests and feature
              usage needed to provide and improve the service.
            </li>
            <li>
              <b>Technical data</b> — standard server logs such as request time,
              IP address, browser or device information, and error details used
              for security and reliability. We do not use advertising trackers.
            </li>
          </ul>
          <p className="mt-3">
            The built-in language keyboard makes suggestions on your device.
            Text typed into other apps with the keyboard is not sent to Mob
            Translate. The app does not request your device location; map
            coordinates are only collected when you deliberately place and
            submit a pin.
          </p>
        </Section>

        <Section title="How we use it">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              To provide translation, dictionary, pronunciation and recording
              features.
            </li>
            <li>
              To operate accounts and attribute contributions where appropriate.
            </li>
            <li>
              To build community language resources and let language workers
              review them.
            </li>
            <li>To secure, troubleshoot and understand use of the service.</li>
          </ul>
        </Section>

        <Section title="Public contributions">
          <p>
            Language recordings and text you deliberately contribute may be
            published in Mob Translate so speakers, learners and language
            workers can use them. We identify this before upload where
            practical. You can ask us to remove a contribution or its personal
            attribution at any time.
          </p>
        </Section>

        <Section title="Service providers and sharing">
          <p>
            We use service providers to run Mob Translate, including hosting and
            storage, email delivery, operational monitoring, and AI or speech
            services used to answer a request. For example, text submitted for
            translation or generated media may be processed by an AI provider,
            and limited operational events may be sent to our private monitoring
            tools. These providers process data for Mob Translate under their
            own security and privacy terms. Public language contributions are
            shared with people who use the service.
          </p>
          <p className="mt-3">
            We do not sell personal data, share it with advertisers, or use it
            to build advertising profiles.
          </p>
        </Section>

        <Section title="Community language and cultural data">
          <p>
            Language belongs to its community. Recordings and language content
            are handled with respect for the wishes of the relevant language
            community and custodians. A community may ask us to restrict or
            remove material that should not be public.
          </p>
        </Section>

        <Section title="Storage, security and retention">
          <p>
            Data is sent over encrypted HTTPS connections and access is
            restricted. Account data is kept while your account is active.
            Contributions are kept while they remain part of the community
            resource, unless you or the relevant custodians request removal.
            Raw translation and chat request records are normally kept for no
            more than 30 days, then replaced by text-free daily usage totals.
            Cached synthesized-audio files and their technical provenance may
            be kept longer so the same text does not need to be sent to a speech
            provider again; after 30 days, the input text in that cache index is
            replaced by an opaque fingerprint. Security records may be kept
            longer when needed to investigate abuse or an incident.
          </p>
          <p className="mt-3">
            Translation, chat and pronunciation text may appear for a limited
            time in private operational monitoring, including a private Discord
            channel. Signed-in accounts are represented there by a pseudonymous
            identifier rather than an email address. Do not submit confidential,
            legal, health, ceremonial or culturally restricted material.
          </p>
          <p className="mt-3">
            Ordinary requests and operational logs are not reused as model
            training data. Material is considered for training only when it is
            deliberately submitted as a language contribution with the required
            consent, source rights and governance approval.
          </p>
        </Section>

        <Section title="Your choices and deletion">
          <p>
            You can ask us to delete your account and associated personal data,
            including your recordings and contributions, or to permanently
            remove their link to your identity where complete deletion is not
            possible for a legitimate reason. We will explain any limited
            information we must retain.
          </p>
          <p className="mt-3">
            <Link className="text-primary font-medium" href="/account-deletion">
              Request account and data deletion
            </Link>
            .
          </p>
        </Section>

        <Section title="Children">
          <p>
            Mob Translate&apos;s public learning content can be used by families
            and schools, but account creation and contribution features are
            intended for people aged 13 or older. A parent or guardian can
            contact us about a young person&apos;s data.
          </p>
        </Section>

        <Section title="What we do not do">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>We do not sell your data.</li>
            <li>We do not share your personal information with advertisers.</li>
            <li>We do not build advertising profiles.</li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            Privacy questions:{' '}
            <a className="text-primary" href="mailto:ajax@mobtranslate.com">
              ajax@mobtranslate.com
            </a>
            .
          </p>
        </Section>

        <p className="text-sm text-muted-foreground mt-10">
          Mob Translate is open source. © 2026 Mob Translate Community.
        </p>
      </article>
    </SharedLayout>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

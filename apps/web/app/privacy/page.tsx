import type { Metadata } from 'next';
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
        <p className="text-sm text-muted-foreground mt-1">Last updated: 29 June 2026</p>

        <p className="mt-6 leading-relaxed">
          Mob Translate is an open-source app for learning, translating and recording Australian
          First Nations languages. We collect as little as possible. This explains what we collect
          and how we use it.
        </p>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><b>Account details</b> — your name and email, only if you create an account. Used to
              sign you in and to attribute the recordings you contribute.</li>
            <li><b>Voice recordings &amp; sentences</b> — if you record words or sentences, the audio
              and text are sent to Mob Translate to become part of the community dictionary.</li>
            <li><b>Basic technical data</b> — standard request information needed to run the service.
              We do not use advertising trackers.</li>
          </ul>
          <p className="mt-3">What you type to translate or search is sent only to return a result.
          The built-in keyboard makes its suggestions on your device; what you type on the keyboard
          is not uploaded.</p>
        </Section>

        <Section title="How we use it">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To provide translation, dictionary, pronunciation and recording features.</li>
            <li>To build community language dictionaries and help keep languages strong.</li>
            <li>To let you and language workers review the recordings you contribute.</li>
          </ul>
        </Section>

        <Section title="What we don't do">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>We do not sell your data.</li>
            <li>We do not share your personal information with advertisers.</li>
            <li>We do not build advertising profiles.</li>
          </ul>
        </Section>

        <Section title="Community language & data">
          <p>Language belongs to its community. Recordings and language content are treated as
          community knowledge, handled with respect to the wishes of the relevant language community
          and custodians. If you contribute a recording you can ask for it to be removed.</p>
        </Section>

        <Section title="Storage, security & deletion">
          <p>Data is sent over encrypted connections (HTTPS) and stored on our servers. You can ask
          us to delete your account, your recordings, or any data we hold about you, and we will
          action it.</p>
        </Section>

        <Section title="Contact">
          <p>Questions or deletion requests: <a className="text-primary" href="mailto:hello@mobtranslate.com">hello@mobtranslate.com</a></p>
        </Section>

        <p className="text-sm text-muted-foreground mt-10">Mob Translate is open source. © 2026 Mob Translate Community.</p>
      </article>
    </SharedLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

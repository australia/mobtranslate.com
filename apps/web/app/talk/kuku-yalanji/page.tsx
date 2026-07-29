import type { Metadata } from 'next';
import Link from 'next/link';
import SharedLayout from '@/app/components/SharedLayout';

export const metadata: Metadata = {
  title: 'Talk in Kuku Yalanji',
  description:
    'An early voice-listening and spoken conversation test for Kuku Yalanji.',
  alternates: { canonical: '/talk/kuku-yalanji' },
};

export default function KukuYalanjiTalkPage() {
  return (
    <SharedLayout>
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Research boundary
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Voice conversation is not ready for learner use
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          The early Kuku Yalanji conversation experiment depended on a sentence
          model that has not passed the linguistic and community authorization
          gates required for a public learning tool. It has been moved out of
          the main experience rather than presented as reliable language.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/dictionaries/kuku_yalanji"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Explore the dictionary
          </Link>
          <Link
            href="/translate/v2"
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-sm font-semibold text-foreground"
          >
            View model research
          </Link>
        </div>
      </main>
    </SharedLayout>
  );
}

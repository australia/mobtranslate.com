import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import SharedLayout from '../../../../components/SharedLayout';
import { getCountryEntries, getCountryPlaces, hasCountry } from '@/lib/country/entries.server';
import { listContributions } from '@/lib/country/contributions.server';
import { ContributionCard } from '../components/ContributionCard';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata({
  title: 'Community contributions — Kuku Yalanji Country',
  description:
    'Photos, words, uses, corrections and proposed pages added by the community to the Kuku Yalanji Country encyclopedia.',
  path: '/dictionaries/kuku_yalanji/country/contributions',
});

export default async function ContributionsPage(props: { params: Promise<{ language: string }> }) {
  const { language } = await props.params;
  if (!hasCountry(language)) notFound();
  const contributions = await listContributions({ language, limit: 200 });
  const titles = new Map<string, string>([
    ...getCountryEntries(language).map((entry) => [`entry:${entry.slug}`, entry.title] as const),
    ...getCountryPlaces(language).map((place) => [`place:${place.slug}`, place.title] as const),
  ]);

  return (
    <SharedLayout>
      <div data-language={language} className="mx-auto max-w-3xl py-8 md:py-12">
        <Link
          href={`/dictionaries/${language}/country`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-[var(--lang-accent)]"
        >
          <ArrowLeft className="h-4 w-4" /> Kuku Yalanji Country
        </Link>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">From the community</h1>
        <p className="mt-3 mb-8 text-muted-foreground">
          Everything people have added across the Country pages, newest first: {contributions.length} so far. Each one is
          shown as it was written, with the contributor&apos;s name. Merging this knowledge into the written pages is a
          later step.
        </p>
        {contributions.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet. Open any page and add what you know.</p>
        ) : (
          <div className="space-y-3">
            {contributions.map((contribution) => (
              <ContributionCard
                key={contribution.id}
                contribution={contribution}
                showTarget
                targetTitle={titles.get(contribution.target)}
              />
            ))}
          </div>
        )}
      </div>
    </SharedLayout>
  );
}

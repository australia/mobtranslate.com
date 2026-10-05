import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import SharedLayout from '../../../components/SharedLayout';
import { COUNTRY_LANGUAGES, getCountryEntries } from '@/lib/country/entries.server';
import { CountryBrowser, type CountryCard } from './CountryBrowser';
import { ReviewNotice } from './components/ReviewNotice';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRY_LANGUAGES.map((language) => ({ language }));
}

export const metadata: Metadata = {
  title: 'Kuku Yalanji Country — trees, animals, stone and how to use them — MobTranslate',
  description:
    'An encyclopedia of Kuku Yalanji country: trees, plants, animals, fish, stone, fire and tools, with their Kuku Yalanji names and how they were hunted, gathered and prepared, from published sources.',
  alternates: { canonical: '/dictionaries/kuku_yalanji/country' },
};

// Plain-text teaser for cards: drop citation markers and Markdown emphasis.
const blurb = (markdown: string) =>
  markdown
    .replace(/\s?\[ref:[a-z0-9-]+\]/g, '')
    .replace(/[*_]/g, '')
    .slice(0, 220);

export default async function CountryIndexPage(props: { params: Promise<{ language: string }> }) {
  const { language } = await props.params;
  const entries = getCountryEntries(language);
  const cards: CountryCard[] = entries.map((entry) => ({
    slug: entry.slug,
    title: entry.title,
    category: entry.category,
    words: entry.names.map((name) => name.word),
    scientificName: entry.scientificName,
    countryTypes: entry.countryTypes,
    blurb: blurb(entry.summary),
  }));

  return (
    <SharedLayout>
      <div data-language={language} className="mx-auto max-w-5xl py-8 md:py-12">
        <Link
          href={`/dictionaries/${language}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-[var(--lang-accent)]"
        >
          <ArrowLeft className="h-4 w-4" /> Kuku Yalanji dictionary
        </Link>

        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Kuku Yalanji Country <span className="text-[var(--lang-accent)]">bubu</span>
          </h1>
          <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
            Trees, plants, animals, fish, stone, fire and the things made from them: their Kuku Yalanji names, where they
            live, and how they were hunted, gathered and prepared. {entries.length} {entries.length === 1 ? 'entry' : 'entries'} so far. Every Kuku Yalanji word
            links to its dictionary entry, and every fact cites its source.
          </p>
        </header>

        <div className="mb-8">
          <ReviewNotice status="unreviewed" />
        </div>

        <CountryBrowser language={language} cards={cards} />
      </div>
    </SharedLayout>
  );
}

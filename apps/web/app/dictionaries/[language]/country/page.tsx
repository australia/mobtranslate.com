import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import SharedLayout from '../../../components/SharedLayout';
import { COUNTRY_LANGUAGES, getCountryEntries, getCountryImages, getCountryPlaces, getWantedPages } from '@/lib/country/entries.server';
import { CountryBrowser, type CountryCard } from './CountryBrowser';
import { ReviewNotice } from './components/ReviewNotice';
import { Community } from './components/Community';

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
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]/g, '')
    .slice(0, 220);

export default async function CountryIndexPage(props: { params: Promise<{ language: string }> }) {
  const { language } = await props.params;
  const entries = getCountryEntries(language);
  const places = getCountryPlaces(language);
  const wanted = getWantedPages(language);
  const cards: CountryCard[] = entries.map((entry) => ({
    slug: entry.slug,
    title: entry.title,
    category: entry.category,
    words: entry.names.map((name) => name.word),
    scientificName: entry.scientificName,
    countryTypes: entry.countryTypes,
    blurb: blurb(entry.summary),
    thumb: getCountryImages(language, entry.slug)[0]?.src,
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

        {places.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-semibold tracking-tight">Place guides</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {places.map((place) => (
                <li key={place.slug}>
                  <Link
                    href={`/dictionaries/${language}/country/places/${place.slug}`}
                    className="block h-full rounded-lg border border-[var(--lang-accent)] bg-[var(--lang-accent-soft)] px-4 py-3 no-underline transition-colors hover:border-[var(--lang-accent)]"
                  >
                    <p className="font-semibold text-foreground">{place.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{place.subtitle}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <CountryBrowser language={language} cards={cards} />

        {wanted.length > 0 && (
          <section className="mt-12 border-t border-border pt-8">
            <h2 className="mb-1 text-xl font-semibold tracking-tight">Pages still to write</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Things other pages mention that don't have their own page yet, most-needed first. Dotted links in the
              text point here.
            </p>
            <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {wanted.map((page) => (
                <li key={page.slug} id={`wanted-${page.slug}`} className="scroll-mt-24">
                  <span className="font-medium text-foreground">{page.title}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    — mentioned in{' '}
                    {page.linkedFrom.map((from, index) => (
                      <span key={from.slug}>
                        {index > 0 && ', '}
                        <Link href={`/dictionaries/${language}/country/${from.slug}`} className="hover:underline">
                          {from.title}
                        </Link>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Community language={language} target="new" mode="proposals" />
        <p className="mt-6 text-sm">
          <Link href={`/dictionaries/${language}/country/contributions`} className="font-medium text-[var(--lang-accent)] hover:underline">
            Everything the community has added, across all pages
          </Link>
        </p>
      </div>
    </SharedLayout>
  );
}

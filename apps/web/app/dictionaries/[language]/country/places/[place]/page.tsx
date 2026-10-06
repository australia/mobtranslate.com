import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import SharedLayout from '../../../../../components/SharedLayout';
import {
  COUNTRY_LANGUAGES,
  getCountryEntries,
  getCountryEntrySlugs,
  getCountryImages,
  getCountryPlace,
  getCountryPlaces,
} from '@/lib/country/entries.server';
import { CATEGORY_LABELS } from '@/lib/country/schema';
import { CountryMarkdown } from '../../components/CountryMarkdown';
import { ReviewNotice } from '../../components/ReviewNotice';
import { CountryFigure } from '../../components/CountryFigure';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRY_LANGUAGES.flatMap((language) =>
    getCountryPlaces(language).map((place) => ({ language, place: place.slug })),
  );
}

export async function generateMetadata(props: {
  params: Promise<{ language: string; place: string }>;
}): Promise<Metadata> {
  const { language, place: slug } = await props.params;
  const place = getCountryPlace(language, slug);
  if (!place) return { title: 'Country — MobTranslate' };
  return {
    title: `${place.title} — Kuku Yalanji Country — MobTranslate`,
    description: place.subtitle,
    alternates: { canonical: `/dictionaries/${language}/country/places/${slug}` },
  };
}

export default async function CountryPlacePage(props: { params: Promise<{ language: string; place: string }> }) {
  const { language, place: slug } = await props.params;
  const place = getCountryPlace(language, slug);
  if (!place) notFound();

  const citedOrder = [
    ...new Set(
      Array.from(
        [place.summary, ...place.sections.map((section) => section.body)].join('\n').matchAll(/\[ref:([a-z0-9-]+)\]/g),
        (match) => match[1],
      ),
    ),
  ];
  const references = [...place.references].sort(
    (a, b) => (citedOrder.indexOf(a.id) + 1 || Infinity) - (citedOrder.indexOf(b.id) + 1 || Infinity),
  );
  const refNumbers = new Map(references.map((ref, index) => [ref.id, index + 1]));
  const entries = new Map(getCountryEntries(language).map((entry) => [entry.slug, entry]));
  const existingEntries = getCountryEntrySlugs(language);
  const [leadImage, ...galleryImages] = getCountryImages(language, place.slug, { place: true });

  return (
    <SharedLayout>
      <article data-language={language} className="mx-auto max-w-5xl py-8 md:py-12">
        <Link
          href={`/dictionaries/${language}/country`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-[var(--lang-accent)]"
        >
          <ArrowLeft className="h-4 w-4" /> Kuku Yalanji Country
        </Link>

        <header className="mb-6 border-b border-border pb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--lang-accent)]">Place guide</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{place.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{place.subtitle}</p>
        </header>

        {leadImage && (
          <div className="mb-6">
            <CountryFigure image={leadImage} />
          </div>
        )}

        <div className="mb-8">
          <ReviewNotice status={place.review.status} />
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 text-[1.0625rem]">
            <CountryMarkdown refNumbers={refNumbers} language={language} existingEntries={existingEntries}>{place.summary}</CountryMarkdown>

            <section id="what-lives-here" className="mt-8 scroll-mt-24">
              <h2 className="mb-3 border-b border-border pb-1 text-2xl font-semibold tracking-tight">What you'll find here</h2>
              {place.groups.map((group) => (
                <div key={group.heading} className="mb-6">
                  <h3 className="mb-1 text-lg font-semibold">{group.heading}</h3>
                  {group.note && <p className="mb-2 text-sm text-muted-foreground">{group.note}</p>}
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {group.entries
                      .map((entrySlug) => entries.get(entrySlug))
                      .filter((entry) => entry !== undefined)
                      .map((entry) => (
                        <li key={entry.slug}>
                          <Link
                            href={`/dictionaries/${language}/country/${entry.slug}`}
                            className="block h-full rounded-lg border border-border bg-card px-3 py-2 no-underline transition-colors hover:border-[var(--lang-accent)]"
                          >
                            <span className="font-semibold text-foreground">{entry.title}</span>{' '}
                            <span className="text-sm font-medium text-[var(--lang-accent)]">{entry.names[0]?.word}</span>
                            <span className="block text-xs text-muted-foreground">{CATEGORY_LABELS[entry.category]}</span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </section>

            {place.sections.map((section) => (
              <section key={section.id} id={section.id} className="mt-8 scroll-mt-24">
                <h2 className="mb-3 border-b border-border pb-1 text-2xl font-semibold tracking-tight">{section.heading}</h2>
                <CountryMarkdown refNumbers={refNumbers} language={language} existingEntries={existingEntries}>{section.body}</CountryMarkdown>
              </section>
            ))}

            {galleryImages.length > 0 && (
              <section id="images" className="mt-10 scroll-mt-24">
                <h2 className="mb-3 border-b border-border pb-1 text-2xl font-semibold tracking-tight">Images</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  {galleryImages.map((image) => (
                    <CountryFigure key={image.src} image={image} />
                  ))}
                </div>
              </section>
            )}

            <section id="references" className="mt-10 scroll-mt-24">
              <h2 className="mb-3 border-b border-border pb-1 text-2xl font-semibold tracking-tight">References</h2>
              <ol className="ml-5 list-decimal space-y-2 text-sm leading-6">
                {references.map((ref) => (
                  <li key={ref.id} id={`ref-${ref.id}`} className="scroll-mt-24">
                    {ref.citation}
                    {ref.locator && <span className="text-muted-foreground"> — {ref.locator}</span>}
                    {ref.url && (
                      <>
                        {' '}
                        <a href={ref.url} className="break-all text-[var(--lang-accent)] underline underline-offset-2" rel="noopener noreferrer">
                          {ref.url.replace(/^https?:\/\//, '')}
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-lg border border-border bg-card text-sm">
              <div className="bg-[var(--lang-accent-soft)] px-4 py-2 text-center font-semibold">{place.title}</div>
              <dl className="divide-y divide-border">
                {place.infobox.map((row) => (
                  <div key={row.label} className="grid grid-cols-[6.5rem_1fr] gap-2 px-4 py-2">
                    <dt className="font-medium text-muted-foreground">{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <nav aria-label="Contents" className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <p className="mb-1 font-semibold">Contents</p>
              <ol className="ml-5 list-decimal space-y-0.5">
                <li>
                  <a href="#what-lives-here" className="text-[var(--lang-accent)] hover:underline">
                    What you'll find here
                  </a>
                </li>
                {place.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-[var(--lang-accent)] hover:underline">
                      {section.heading}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#references" className="text-[var(--lang-accent)] hover:underline">
                    References
                  </a>
                </li>
              </ol>
            </nav>

            <p className="text-xs text-muted-foreground">Last updated {place.updated}</p>
          </aside>
        </div>
      </article>
    </SharedLayout>
  );
}

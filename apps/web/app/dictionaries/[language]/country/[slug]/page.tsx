import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import SharedLayout from '../../../../components/SharedLayout';
import {
  COUNTRY_LANGUAGES,
  getCountryBacklinks,
  getCountryEntries,
  getCountryEntry,
  getCountryEntrySlugs,
  getCountryImages,
} from '@/lib/country/entries.server';
import { countryHref } from '@/lib/country/links';
import { CATEGORY_LABELS, COUNTRY_TYPE_LABELS } from '@/lib/country/schema';
import { CountryMarkdown } from '../components/CountryMarkdown';
import { ReviewNotice } from '../components/ReviewNotice';
import { CountryFigure } from '../components/CountryFigure';
import { Community } from '../components/Community';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRY_LANGUAGES.flatMap((language) =>
    getCountryEntries(language).map((entry) => ({ language, slug: entry.slug })),
  );
}

export async function generateMetadata(props: {
  params: Promise<{ language: string; slug: string }>;
}): Promise<Metadata> {
  const { language, slug } = await props.params;
  const entry = getCountryEntry(language, slug);
  if (!entry) return { title: 'Country' };
  const names = entry.names.map((name) => name.word).join(', ');
  return pageMetadata({
    title: `${entry.title} (${names}) — Kuku Yalanji Country`,
    description: `${entry.title}: Kuku Yalanji ${names}. Names, identification, where it lives, uses and how it was gathered and prepared, with sources.`,
    path: `/dictionaries/${language}/country/${slug}`,
    type: 'article',
  });
}

const wordHref = (language: string, word: string) => `/dictionaries/${language}/words/${encodeURIComponent(word)}`;

const CONFIDENCE_LABEL = {
  confirmed: 'Identification confirmed by source',
  probable: 'Probable identification',
  uncertain: 'Identification uncertain',
} as const;

export default async function CountryEntryPage(props: { params: Promise<{ language: string; slug: string }> }) {
  const { language, slug } = await props.params;
  const entry = getCountryEntry(language, slug);
  if (!entry) notFound();

  // Number references in order of first citation, as Wikipedia does.
  const citedOrder = [
    ...new Set(
      Array.from(
        [entry.summary, ...entry.sections.map((section) => section.body)].join('\n').matchAll(/\[ref:([a-z0-9-]+)\]/g),
        (match) => match[1],
      ),
    ),
  ];
  const references = [...entry.references].sort(
    (a, b) => (citedOrder.indexOf(a.id) + 1 || Infinity) - (citedOrder.indexOf(b.id) + 1 || Infinity),
  );
  const refNumbers = new Map(references.map((ref, index) => [ref.id, index + 1]));
  const allEntries = getCountryEntries(language);
  const related = entry.relatedEntries
    .map((relatedSlug) => allEntries.find((candidate) => candidate.slug === relatedSlug))
    .filter((candidate) => candidate !== undefined);
  const backlinks = getCountryBacklinks(language, entry.slug);
  const existingEntries = getCountryEntrySlugs(language);
  const [leadImage, ...galleryImages] = getCountryImages(language, entry.slug);

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
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--lang-accent)]">
            {CATEGORY_LABELS[entry.category]}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{entry.title}</h1>
          <p className="mt-2 text-lg">
            {entry.names.map((name, index) => (
              <span key={`${name.word}-${index}`}>
                {index > 0 && <span className="text-muted-foreground"> · </span>}
                <Link href={wordHref(language, name.word)} className="font-semibold text-[var(--lang-accent)] hover:underline">
                  {name.word}
                </Link>
              </span>
            ))}
            {entry.scientificName && <em className="ml-3 text-base text-muted-foreground">{entry.scientificName}</em>}
          </p>
        </header>

        <div className="mb-8">
          <ReviewNotice status={entry.review.status} />
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 text-[1.0625rem]">
            {leadImage && (
              <div className="mb-6 lg:hidden">
                <CountryFigure image={leadImage} compact />
              </div>
            )}
            <div className="text-foreground">
              <CountryMarkdown refNumbers={refNumbers} language={language} existingEntries={existingEntries}>{entry.summary}</CountryMarkdown>
            </div>

            <nav aria-label="Contents" className="my-6 rounded-lg border border-border bg-card px-4 py-3 text-sm lg:hidden">
              <p className="mb-1 font-semibold">Contents</p>
              <ol className="ml-5 list-decimal space-y-0.5">
                {entry.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-[var(--lang-accent)] hover:underline">
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            {entry.sections.map((section) => (
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

            <Community language={language} target={`entry:${entry.slug}`} />
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-lg border border-border bg-card text-sm">
              <div className="bg-[var(--lang-accent-soft)] px-4 py-2 text-center font-semibold">{entry.title}</div>
              {leadImage && (
                <div className="hidden border-b border-border p-3 lg:block">
                  <CountryFigure image={leadImage} compact />
                </div>
              )}
              <dl className="divide-y divide-border">
                {entry.infobox.map((row) => (
                  <div key={row.label} className="grid grid-cols-[6.5rem_1fr] gap-2 px-4 py-2">
                    <dt className="font-medium text-muted-foreground">{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
                <div className="grid grid-cols-[6.5rem_1fr] gap-2 px-4 py-2">
                  <dt className="font-medium text-muted-foreground">Country</dt>
                  <dd>{entry.countryTypes.map((type) => COUNTRY_TYPE_LABELS[type]).join(', ')}</dd>
                </div>
              </dl>
              <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{CONFIDENCE_LABEL[entry.identification.confidence]}</p>
                <p className="mt-0.5">{entry.identification.basis}</p>
              </div>
            </div>

            <nav aria-label="Contents" className="hidden rounded-lg border border-border bg-card px-4 py-3 text-sm lg:block">
              <p className="mb-1 font-semibold">Contents</p>
              <ol className="ml-5 list-decimal space-y-0.5">
                {entry.sections.map((section) => (
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

            {(entry.names.length > 0 || entry.relatedWords.length > 0) && (
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <p className="mb-2 font-semibold">In the dictionary</p>
                <ul className="space-y-1.5">
                  {[...entry.names, ...entry.relatedWords].map((word, index) => (
                    <li key={`${word.word}-${index}`}>
                      <Link href={wordHref(language, word.word)} className="font-semibold text-[var(--lang-accent)] hover:underline">
                        {word.word}
                      </Link>{' '}
                      <span className="text-muted-foreground">{word.gloss}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {related.length > 0 && (
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <p className="mb-2 font-semibold">See also</p>
                <ul className="space-y-1.5">
                  {related.map((other) => (
                    <li key={other.slug}>
                      <Link href={`/dictionaries/${language}/country/${other.slug}`} className="text-[var(--lang-accent)] hover:underline">
                        {other.title}
                      </Link>{' '}
                      <span className="text-muted-foreground">{other.names[0]?.word}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {backlinks.length > 0 && (
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <p className="mb-2 font-semibold">What links here</p>
                <ul className="space-y-1.5">
                  {backlinks.map((link) => (
                    <li key={`${link.kind}-${link.slug}`}>
                      <Link href={countryHref(language, link)} className="text-[var(--lang-accent)] hover:underline">
                        {link.title}
                      </Link>
                      {link.kind === 'place' && <span className="text-muted-foreground"> (place guide)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Last updated {entry.updated}</p>
          </aside>
        </div>
      </article>
    </SharedLayout>
  );
}

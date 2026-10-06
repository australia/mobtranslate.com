import fs from 'fs';
import path from 'path';
import { countryLinksIn } from './links';
import { countryEntrySchema, countryPlaceSchema, type CountryEntry, type CountryPlace } from './schema';

// Read at build time: the Country routes are statically generated.
const DATA_ROOT = path.join(process.cwd(), 'data', 'country');

export const COUNTRY_LANGUAGES = ['kuku_yalanji'] as const;

export function hasCountry(language: string): boolean {
  return (COUNTRY_LANGUAGES as readonly string[]).includes(language);
}

const cache = new Map<string, CountryEntry[]>();

export function getCountryEntries(language: string, { includeHidden = false } = {}): CountryEntry[] {
  if (!hasCountry(language)) return [];
  // Cache only in production builds, so new entry files show up in `next dev`.
  let entries = process.env.NODE_ENV === 'production' ? cache.get(language) : undefined;
  if (!entries) {
    const dir = path.join(DATA_ROOT, language);
    entries = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((file) => file.endsWith('.json'))
          .map((file) => countryEntrySchema.parse(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))))
          .sort((a, b) => a.title.localeCompare(b.title, 'en'))
      : [];
    cache.set(language, entries);
  }
  return includeHidden ? entries : entries.filter((entry) => entry.review.status !== 'hidden');
}

export function getCountryEntry(language: string, slug: string): CountryEntry | null {
  return getCountryEntries(language).find((entry) => entry.slug === slug) ?? null;
}

export function getCountryPlaces(language: string): CountryPlace[] {
  if (!hasCountry(language)) return [];
  const dir = path.join(DATA_ROOT, language, 'places');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => countryPlaceSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))))
    .filter((place) => place.review.status !== 'hidden')
    .sort((a, b) => a.title.localeCompare(b.title, 'en'));
}

export function getCountryPlace(language: string, slug: string): CountryPlace | null {
  return getCountryPlaces(language).find((place) => place.slug === slug) ?? null;
}

export type CountryBacklink = { kind: 'entry' | 'place'; slug: string; title: string };

// "What links here": every entry or place guide whose text links to `slug`.
export function getCountryBacklinks(language: string, slug: string): CountryBacklink[] {
  const linksTo = (texts: string[]) =>
    countryLinksIn(texts.join('\n')).some((link) => link.kind === 'entry' && link.slug === slug);
  return [
    ...getCountryEntries(language)
      .filter((entry) => entry.slug !== slug && linksTo([entry.summary, ...entry.sections.map((s) => s.body)]))
      .map((entry) => ({ kind: 'entry' as const, slug: entry.slug, title: entry.title })),
    ...getCountryPlaces(language)
      .filter((place) => place.groups.some((g) => g.entries.includes(slug)) || linksTo([place.summary, ...place.sections.map((s) => s.body)]))
      .map((place) => ({ kind: 'place' as const, slug: place.slug, title: place.title })),
  ];
}

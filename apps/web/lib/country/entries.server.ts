import fs from 'fs';
import path from 'path';
import { countryEntrySchema, type CountryEntry } from './schema';

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

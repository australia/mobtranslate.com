import fs from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';
import { getActiveLanguages, getBrowseHeadwords } from '@/lib/db/queries';
import { CREDITS } from '@/lib/credits';
import { getLessons } from '@/lib/lessons/content';
import { COUNTRY_LANGUAGES, getCountryEntries, getCountryPlaces } from '@/lib/country/entries.server';
import { SITE_URL } from '@/lib/seo';

export const revalidate = 86400; // refresh daily

type Entry = MetadataRoute.Sitemap[number];
type Frequency = Entry['changeFrequency'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const at = (route: string, priority: number, changeFrequency: Frequency = 'monthly'): Entry => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  const routes: MetadataRoute.Sitemap = [
    at('/', 1, 'weekly'),
    at('/dictionaries', 0.9, 'weekly'),
    at('/education', 0.7),
    at('/learn', 0.7),
    at('/download', 0.7),
    // /map, /spread and /languages redirect into the atlas, so only the atlas is listed.
    at('/atlas', 0.8),
    at('/atlas/directory', 0.6),
    at('/atlas/grammar', 0.6),
    at('/atlas/spread', 0.6),
    at('/atlas/methods', 0.5),
    at('/stories/kuku-yalanji-camp', 0.6),
    at('/translate/v2', 0.5),
    at('/labs/kuku-possum', 0.5),
    at('/talk/kuku-yalanji', 0.4),
    at('/models', 0.4),
    at('/leaderboard', 0.4, 'weekly'),
    at('/contribute', 0.5),
    at('/about', 0.5),
    at('/credits', 0.4),
    ...CREDITS.map((c) => at(`/credits/${c.slug}`, 0.3)),
    at('/support', 0.3, 'yearly'),
    at('/privacy', 0.2, 'yearly'),
    at('/account-deletion', 0.2, 'yearly'),
  ];

  for (const language of COUNTRY_LANGUAGES) {
    routes.push(at(`/dictionaries/${language}/country`, 0.7));
    for (const entry of getCountryEntries(language)) routes.push(at(`/dictionaries/${language}/country/${entry.slug}`, 0.5));
    for (const place of getCountryPlaces(language)) routes.push(at(`/dictionaries/${language}/country/places/${place.slug}`, 0.5));
  }

  try {
    const atlasDir = path.join(process.cwd(), 'data', 'atlas', 'languages');
    for (const file of fs.readdirSync(atlasDir)) {
      if (file.endsWith('.json')) routes.push(at(`/atlas/${file.slice(0, -5)}`, 0.4, 'yearly'));
    }
  } catch {
    // No atlas data in this build.
  }

  try {
    const languages = await getActiveLanguages();
    for (const language of languages) {
      routes.push(at(`/dictionaries/${language.code}`, 0.8, 'weekly'));
      for (const lesson of getLessons(language.code)) routes.push(at(`/lessons/${language.code}/${lesson.slug}`, 0.5));
    }
    // One URL per headword: the pages people search for and share.
    const headwords = await Promise.all(languages.map((l) => getBrowseHeadwords(l.id)));
    languages.forEach((language, i) => {
      for (const word of headwords[i]) {
        routes.push(at(`/dictionaries/${language.code}/words/${encodeURIComponent(word)}`, 0.5));
      }
    });
  } catch {
    // DB unavailable at build/request time — still return the static routes.
  }

  return routes;
}

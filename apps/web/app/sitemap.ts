import type { MetadataRoute } from 'next';
import { getActiveLanguages } from '@/lib/db/queries';

export const revalidate = 86400; // refresh daily

const BASE = 'https://mobtranslate.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/dictionaries`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/download`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/education`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/leaderboard`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${BASE}/contribute`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE}/credits`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ];

  let languageRoutes: MetadataRoute.Sitemap = [];
  try {
    const langs = await getActiveLanguages();
    languageRoutes = langs.map((l) => ({
      url: `${BASE}/dictionaries/${l.code}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch {
    // DB unavailable at build/request time — still return the static routes.
  }

  return [...staticRoutes, ...languageRoutes];
}

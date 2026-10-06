// Cross-links between Country pages, written in entry text as
// `[lawyer cane](entry:lawyer-cane)` or `[Karma Waters](place:karma-waters)`.
const LINK = /\]\((entry|place):([a-z0-9-]+)\)/g;

export type CountryLink = { kind: 'entry' | 'place'; slug: string };

export function countryHref(language: string, link: CountryLink): string {
  return link.kind === 'place'
    ? `/dictionaries/${language}/country/places/${link.slug}`
    : `/dictionaries/${language}/country/${link.slug}`;
}

export function resolveCountryLinks(markdown: string, language: string): string {
  return markdown.replace(LINK, (_, kind: CountryLink['kind'], slug: string) => `](${countryHref(language, { kind, slug })})`);
}

export function countryLinksIn(markdown: string): CountryLink[] {
  return Array.from(markdown.matchAll(LINK), (match) => ({ kind: match[1] as CountryLink['kind'], slug: match[2] }));
}

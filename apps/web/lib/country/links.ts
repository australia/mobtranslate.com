// Links written in Country text:
//   [lawyer cane](entry:lawyer-cane)    another Country entry (or a page not written yet)
//   [Karma Waters](place:karma-waters)  a place guide
//   [ngabal](word:ngabal)               a Kuku Yalanji dictionary headword
const LINK = /\]\((entry|place|word):([^)\n]+)\)/g;

export type CountryLinkKind = 'entry' | 'place' | 'word';
export type CountryLink = { kind: CountryLinkKind; slug: string };

// Entry links to pages nobody has written yet point here, so the renderer can
// style them as "not written yet" and the index can list them.
export const WANTED_ANCHOR = '#wanted-';

export function countryHref(language: string, link: CountryLink): string {
  if (link.kind === 'place') return `/dictionaries/${language}/country/places/${link.slug}`;
  if (link.kind === 'word') return `/dictionaries/${language}/words/${encodeURIComponent(link.slug)}`;
  return `/dictionaries/${language}/country/${link.slug}`;
}

export function resolveCountryLinks(markdown: string, language: string, existingEntries?: Set<string>): string {
  return markdown.replace(LINK, (_, kind: CountryLinkKind, slug: string) => {
    if (kind === 'entry' && existingEntries && !existingEntries.has(slug)) {
      return `](/dictionaries/${language}/country${WANTED_ANCHOR}${slug})`;
    }
    return `](${countryHref(language, { kind, slug })})`;
  });
}

export function countryLinksIn(markdown: string): CountryLink[] {
  return Array.from(markdown.matchAll(LINK), (match) => ({ kind: match[1] as CountryLinkKind, slug: match[2] }));
}

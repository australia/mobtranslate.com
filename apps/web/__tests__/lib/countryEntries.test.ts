import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import {
  countryEntrySchema,
  countryImageSetSchema,
  countryLocationsSchema,
  countryPlaceSchema,
  entryTexts,
  SECTION_IDS,
  wantedPagesSchema,
  type CountryEntry,
} from '@/lib/country/schema';
import { countryLinksIn } from '@/lib/country/links';

// Every Country entry must be valid, cite only references it declares, and
// name things only with words that are real dictionary headwords.
const DATA_DIR = path.resolve(__dirname, '../../data/country/kuku_yalanji');
const DICTIONARY = path.resolve(__dirname, '../../../../dictionaries/kuku_yalanji/dictionary.yaml');

const headwords = new Set(
  ((loadYaml(fs.readFileSync(DICTIONARY, 'utf8')) as { words: { word: string }[] }).words ?? []).map((w) => w.word),
);

const files = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith('.json'));
const PLACES_DIR = path.join(DATA_DIR, 'places');
const placeFiles = fs.existsSync(PLACES_DIR) ? fs.readdirSync(PLACES_DIR).filter((file) => file.endsWith('.json')) : [];
const entrySlugs = new Set(files.map((file) => file.replace(/\.json$/, '')));
const placeSlugs = new Set(placeFiles.map((file) => file.replace(/\.json$/, '')));

const LOCATIONS_FILE = path.join(DATA_DIR, 'locations', 'index.json');
const locationIds = fs.existsSync(LOCATIONS_FILE)
  ? countryLocationsSchema.parse(JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'))).locations.map((location) => location.id)
  : [];

const WANTED_DIR = path.join(DATA_DIR, 'wanted');
const wantedFiles = fs.existsSync(WANTED_DIR) ? fs.readdirSync(WANTED_DIR).filter((file) => file.endsWith('.json')) : [];
const wantedSlugs = new Set(
  wantedFiles.flatMap((file) =>
    wantedPagesSchema.parse(JSON.parse(fs.readFileSync(path.join(WANTED_DIR, file), 'utf8'))).pages.map((page) => page.slug),
  ),
);

// Every link must resolve: entries to a written or registered-wanted page,
// places to a place guide, words to a dictionary headword.
function brokenLinks(texts: string[]): string[] {
  return countryLinksIn(texts.join('\n'))
    .filter((link) => {
      if (link.kind === 'entry') return !entrySlugs.has(link.slug) && !wantedSlugs.has(link.slug);
      if (link.kind === 'place') return !placeSlugs.has(link.slug);
      return !headwords.has(link.slug);
    })
    .map((link) => `${link.kind}:${link.slug}`);
}

function citations(entry: CountryEntry): string[] {
  const text = entryTexts(entry).join('\n');
  return [...text.matchAll(/\[ref:([a-z0-9-]+)\]/g)].map((match) => match[1]);
}

describe('Kuku Yalanji Country entries', () => {
  it('has entries', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files)('%s', (file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));

    it('matches the schema and its file name', () => {
      const entry = countryEntrySchema.parse(raw);
      expect(`${entry.slug}.json`).toBe(file);
    });

    it('uses only dictionary headwords for Kuku Yalanji names', () => {
      const entry = countryEntrySchema.parse(raw);
      const words = [...entry.names, ...entry.relatedWords].map((name) => name.word);
      expect(words.filter((word) => !headwords.has(word))).toEqual([]);
    });

    it('cites only declared references, and every reference is cited', () => {
      const entry = countryEntrySchema.parse(raw);
      const declared = new Set(entry.references.map((ref) => ref.id));
      const cited = citations(entry);
      expect(cited.filter((id) => !declared.has(id))).toEqual([]);
      expect([...declared].filter((id) => !cited.includes(id))).toEqual([]);
    });

    it('links only to Country pages that exist', () => {
      const entry = countryEntrySchema.parse(raw);
      expect(brokenLinks(entryTexts(entry))).toEqual([]);
      expect(entry.relatedEntries.filter((slug) => !entrySlugs.has(slug))).toEqual([]);
    });

    it('keeps sections unique and in encyclopedia order', () => {
      const entry = countryEntrySchema.parse(raw);
      const order = entry.sections.map((section) => SECTION_IDS.indexOf(section.id));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(order).size).toBe(order.length);
    });

    it('segments only registered locations, once each, in registry order', () => {
      const entry = countryEntrySchema.parse(raw);
      const order = entry.locations.map((segment) => locationIds.indexOf(segment.location));
      expect(order.filter((index) => index < 0)).toEqual([]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(order).size).toBe(order.length);
      for (const segment of entry.locations) {
        const sections = segment.sections.map((section) => SECTION_IDS.indexOf(section.id));
        expect(sections).toEqual([...sections].sort((a, b) => a - b));
        expect(new Set(sections).size).toBe(sections.length);
      }
    });
  });
});

describe('Locations', () => {
  it('registers each location once, and links only to place guides that exist', () => {
    const { locations } = countryLocationsSchema.parse(JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8')));
    expect(new Set(locations.map((location) => location.id)).size).toBe(locations.length);
    expect(locations.filter((location) => location.place && !placeSlugs.has(location.place))).toEqual([]);
  });
});


describe.runIf(placeFiles.length > 0)('Kuku Yalanji place guides', () => {
  describe.each(placeFiles)('%s', (file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(PLACES_DIR, file), 'utf8'));

    it('matches the schema and its file name', () => {
      const place = countryPlaceSchema.parse(raw);
      expect(`${place.slug}.json`).toBe(file);
    });

    it('links only to entries that exist', () => {
      const place = countryPlaceSchema.parse(raw);
      const linked = place.groups.flatMap((group) => group.entries);
      expect(linked.filter((slug) => !entrySlugs.has(slug))).toEqual([]);
      expect(brokenLinks([place.summary, ...place.sections.map((section) => section.body)])).toEqual([]);
    });

    it('cites only declared references, and every reference is cited', () => {
      const place = countryPlaceSchema.parse(raw);
      const text = [place.summary, ...place.sections.map((section) => section.body)].join('\n');
      const cited = [...text.matchAll(/\[ref:([a-z0-9-]+)\]/g)].map((match) => match[1]);
      const declared = new Set(place.references.map((ref) => ref.id));
      expect(cited.filter((id) => !declared.has(id))).toEqual([]);
      expect([...declared].filter((id) => !cited.includes(id))).toEqual([]);
    });
  });
});

const allText = [
  ...files.map((file) => {
    const entry = countryEntrySchema.parse(JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')));
    return entryTexts(entry).join('\n');
  }),
  ...placeFiles.map((file) => {
    const place = countryPlaceSchema.parse(JSON.parse(fs.readFileSync(path.join(PLACES_DIR, file), 'utf8')));
    return [place.summary, ...place.sections.map((section) => section.body)].join('\n');
  }),
].join('\n');

describe('Pages still to write', () => {
  it('lists only pages that something links to', () => {
    const linked = new Set(countryLinksIn(allText).filter((link) => link.kind === 'entry').map((link) => link.slug));
    expect([...wantedSlugs].filter((slug) => !linked.has(slug) && !entrySlugs.has(slug))).toEqual([]);
  });
});

const IMAGES_DIR = path.join(DATA_DIR, 'images');
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const imageFiles = [
  ...(fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, place: false })) : []),
  ...(fs.existsSync(path.join(IMAGES_DIR, 'places'))
    ? fs.readdirSync(path.join(IMAGES_DIR, 'places')).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, place: true }))
    : []),
];

describe.runIf(imageFiles.length > 0)('Country images', () => {
  describe.each(imageFiles)('$file', ({ file, place }) => {
    const set = countryImageSetSchema.parse(
      JSON.parse(fs.readFileSync(path.join(IMAGES_DIR, ...(place ? ['places'] : []), file), 'utf8')),
    );

    it('belongs to a page that exists', () => {
      expect(`${set.slug}.json`).toBe(file);
      expect((place ? placeSlugs : entrySlugs).has(set.slug)).toBe(true);
    });

    it('points at image files that exist in that page\'s folder', () => {
      for (const image of set.images) {
        expect(image.src.split('/')[3]).toBe(set.slug);
        expect(fs.existsSync(path.join(PUBLIC_DIR, image.src))).toBe(true);
      }
    });
  });
});

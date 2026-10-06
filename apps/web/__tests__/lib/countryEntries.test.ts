import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { countryEntrySchema, countryPlaceSchema, SECTION_IDS, type CountryEntry } from '@/lib/country/schema';
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

// Every [text](entry:slug) / [text](place:slug) link must resolve to a page.
function brokenLinks(texts: string[]): string[] {
  return countryLinksIn(texts.join('\n'))
    .filter((link) => !(link.kind === 'entry' ? entrySlugs : placeSlugs).has(link.slug))
    .map((link) => `${link.kind}:${link.slug}`);
}

function citations(entry: CountryEntry): string[] {
  const text = [entry.summary, ...entry.sections.map((section) => section.body)].join('\n');
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
      expect(brokenLinks([entry.summary, ...entry.sections.map((section) => section.body)])).toEqual([]);
      expect(entry.relatedEntries.filter((slug) => !entrySlugs.has(slug))).toEqual([]);
    });

    it('keeps sections unique and in encyclopedia order', () => {
      const entry = countryEntrySchema.parse(raw);
      const order = entry.sections.map((section) => SECTION_IDS.indexOf(section.id));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(order).size).toBe(order.length);
    });
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

// Kuku Yalanji Country encyclopedia — entry schema.
//
// One JSON file per entry under apps/web/data/country/<language>/. Every
// Kuku Yalanji name must be a headword in dictionaries/<language>/dictionary.yaml
// (enforced by __tests__/lib/countryEntries.test.ts). Body text is Markdown;
// `[ref:<id>]` marks a citation to one of the entry's `references`, and
// `[text](entry:<slug>)` / `[text](place:<slug>)` link to other Country pages.
import { z } from 'zod';

export const COUNTRY_CATEGORIES = [
  'tree',
  'plant',
  'fungus',
  'mammal',
  'bird',
  'reptile',
  'amphibian',
  'fish',
  'shellfish-crustacean',
  'insect',
  'stone-earth',
  'tool',
  'weapon',
  'fire',
  'water',
  'landform',
  'food',
  'technique',
] as const;

export const CATEGORY_LABELS: Record<(typeof COUNTRY_CATEGORIES)[number], string> = {
  tree: 'Trees',
  plant: 'Plants, vines & grasses',
  fungus: 'Fungi',
  mammal: 'Mammals',
  bird: 'Birds',
  reptile: 'Reptiles',
  amphibian: 'Frogs',
  fish: 'Fish',
  'shellfish-crustacean': 'Shellfish & crustaceans',
  insect: 'Insects & honey',
  'stone-earth': 'Stone, ochre & earth',
  tool: 'Tools & things made',
  weapon: 'Spears & weapons',
  fire: 'Fire',
  water: 'Water',
  landform: 'Land',
  food: 'Foods & cooking',
  technique: 'Skills & methods',
};

export const COUNTRY_TYPES = [
  'rainforest',
  'coast-mangrove',
  'reef-sea',
  'river-freshwater',
  'open-woodland',
  'mountains',
  'camp',
] as const;

export const COUNTRY_TYPE_LABELS: Record<(typeof COUNTRY_TYPES)[number], string> = {
  rainforest: 'Rainforest (madja)',
  'coast-mangrove': 'Beach & mangroves',
  'reef-sea': 'Reef & sea',
  'river-freshwater': 'Rivers & creeks',
  'open-woodland': 'Open forest & woodland',
  mountains: 'Mountains',
  camp: 'Camp',
};

// Fixed section order so every entry reads like the same encyclopedia.
export const SECTION_IDS = [
  'names',
  'description',
  'habitat',
  'seasons',
  'uses',
  'how-to',
  'safety',
  'today',
  'language',
] as const;

const markdown = z.string().min(1);

export const countryEntrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  category: z.enum(COUNTRY_CATEGORIES),
  names: z
    .array(
      z.object({
        word: z.string().min(1), // dictionary headword, exact spelling
        gloss: z.string().min(1), // the dictionary's own English, verbatim
        dialect: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
  scientificName: z.string().optional(),
  identification: z.object({
    confidence: z.enum(['confirmed', 'probable', 'uncertain']),
    basis: z.string().min(1),
  }),
  countryTypes: z.array(z.enum(COUNTRY_TYPES)).min(1),
  summary: markdown,
  infobox: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })),
  sections: z
    .array(
      z.object({
        id: z.enum(SECTION_IDS),
        heading: z.string().min(1),
        body: markdown,
      }),
    )
    .min(3),
  relatedEntries: z.array(z.string()).default([]),
  relatedWords: z.array(z.object({ word: z.string().min(1), gloss: z.string().min(1) })).default([]),
  references: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        citation: z.string().min(1),
        url: z.string().url().optional(),
        locator: z.string().optional(),
      }),
    )
    .min(1),
  review: z.object({
    status: z.enum(['unreviewed', 'community-reviewed', 'corrected', 'hidden']),
    note: z.string().optional(),
  }),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CountryEntry = z.infer<typeof countryEntrySchema>;
export type CountryCategory = (typeof COUNTRY_CATEGORIES)[number];
export type CountryType = (typeof COUNTRY_TYPES)[number];

// Place guides: one page per place (a station, a river reach), linking the
// entries that occur there. Stored under data/country/<language>/places/.
export const countryPlaceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  summary: markdown,
  infobox: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })),
  sections: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        heading: z.string().min(1),
        body: markdown,
      }),
    )
    .min(3),
  // Entries found here, grouped for the page ("In the river", "On the banks" …).
  groups: z
    .array(
      z.object({
        heading: z.string().min(1),
        note: z.string().optional(),
        entries: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  references: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        citation: z.string().min(1),
        url: z.string().url().optional(),
        locator: z.string().optional(),
      }),
    )
    .min(1),
  review: z.object({
    status: z.enum(['unreviewed', 'community-reviewed', 'corrected', 'hidden']),
    note: z.string().optional(),
  }),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CountryPlace = z.infer<typeof countryPlaceSchema>;

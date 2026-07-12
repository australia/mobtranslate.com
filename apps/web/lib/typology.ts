// Typology layer data access.
//
// The /languages/[code] endpoint reads the committed static snapshot in public/typology/
// (built by tools/australian-languages/build_public_snapshot.py from the CC-BY-4.0 sources:
// Grambank v1.0.3, WALS v2020.4, Glottolog 5.3, AIATSIS AUSTLANG). This keeps the endpoint
// free of request-time DB coupling; the same data is also loaded into mobtranslate-pg
// (typology_* tables) for querying/joining — see tools/australian-languages/import_typology.py.
//
// Grambank's 195 variables are a STANDARDIZED CROSS-LINGUISTIC BASELINE, not an exhaustive grammar.

import fs from 'fs';
import path from 'path';

const TYP_DIR = path.join(process.cwd(), 'public', 'typology');

export interface TypologyIndexRow {
  glottocode: string;
  name: string | null;
  family: string | null;
  subgroup: string | null;
  iso639_3: string | null;
  latitude: number | null;
  longitude: number | null;
  grambank_coded: number;
  wals_coded: number;
  aus_extension_coded: number;
  n_constructions: number;
  cluster: number | null;
  has_dictionary: boolean;
  dictionary_code: string | null;
}

export interface TypologyFeatureValue {
  id: string;
  name: string;
  gloss: string;
  domain: string;
  value: string;
  value_meaning?: string;
  derivation?: string;
}

export interface TypologyNeighbour {
  glottocode: string;
  name: string | null;
  grambank_recorded_agreement: number;
  n_joint: number;
}

export interface TypologyConstruction {
  id: string;
  language: string;
  domain: string;
  construction_name: string;
  description: string;
  example: { form: string; gloss: string; translation: string };
  source: { work: string; section: string; via?: string };
  analyst_confidence: string;
  community_terminology: string | null;
  license: string;
}

export interface TypologyLanguageDetail {
  glottocode: string;
  name: string | null;
  iso639_3: string | null;
  family: string | null;
  subgroup: string | null;
  family_chain: { glottocode: string; name: string }[];
  latitude: number | null;
  longitude: number | null;
  austlang_codes: string[];
  endangerment: string | null;
  coverage: {
    grambank_coded: number;
    grambank_unknown: number;
    grambank_total: number;
    grambank_pct: number;
    wals_coded: number;
    aus_extension_coded: number;
    aus_extension_total: number;
  };
  cluster: number | null;
  cluster_meta: { cluster: number; size: number; dominant_subgroup_glottocode: string; subgroup_purity: number } | null;
  grambank_features: TypologyFeatureValue[];
  aus_extension: TypologyFeatureValue[];
  neighbours: TypologyNeighbour[];
  constructions: TypologyConstruction[];
  dictionary: { code: string; href: string } | null;
  _provenance: Record<string, string>;
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function getTypologyIndex(): TypologyIndexRow[] {
  const data = readJson<{ languages: TypologyIndexRow[] }>(path.join(TYP_DIR, 'index.json'));
  return data?.languages ?? [];
}

export function listLanguageCodes(): string[] {
  return getTypologyIndex().map((l) => l.glottocode);
}

export function getLanguageTypology(code: string): TypologyLanguageDetail | null {
  // guard against traversal — glottocodes are [a-z0-9]{8}
  if (!/^[a-z0-9]{4,20}$/.test(code)) return null;
  return readJson<TypologyLanguageDetail>(path.join(TYP_DIR, 'lang', `${code}.json`));
}

// group Grambank feature values by their (topic) domain, in a stable display order
const DOMAIN_ORDER = [
  'nominal',
  'pronoun',
  'demonstrative',
  'verb_and_valency',
  'clause_and_syntax',
  'numerals',
  'other',
];

function domainRank(d: string): number {
  const i = DOMAIN_ORDER.indexOf(d);
  return i === -1 ? DOMAIN_ORDER.length : i;
}

export function groupFeaturesByDomain(features: TypologyFeatureValue[]) {
  const by = new Map<string, TypologyFeatureValue[]>();
  for (const f of features) {
    if (!by.has(f.domain)) by.set(f.domain, []);
    by.get(f.domain)!.push(f);
  }
  return [...by.entries()].sort((a, b) => domainRank(a[0]) - domainRank(b[0]));
}

export function groupConstructionsByDomain(records: TypologyConstruction[]) {
  const by = new Map<string, TypologyConstruction[]>();
  for (const r of records) {
    if (!by.has(r.domain)) by.set(r.domain, []);
    by.get(r.domain)!.push(r);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

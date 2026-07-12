// Static config + colour helpers for the /atlas hub map island.
// A clean, modular re-implementation (NOT a fork of the 47KB MapExplorer) that
// later atlas phases (profile insets, spread, grammar lens) can extend.
//
// Colours are fixed hex (not theme tokens) because the circles paint onto a
// raster basemap, not the page background — they must read on BOTH light and
// dark tiles. They are drawn from the earth palette (ochre/eucalyptus/nightsky/
// amber) so the atlas stays grounded, never neon.

export const MAPLIBRE_VERSION = '4.7.1';
export const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
export const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

// CARTO raster basemaps — free, no API key. Graceful: if unreachable the map
// still renders points on the solid background layer below.
export const BASEMAP = {
  light: [
    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  ],
  dark: [
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  ],
  attribution: '© OpenStreetMap contributors © CARTO',
  bg: { light: '#eae3d8', dark: '#14110e' },
  stroke: { light: '#fbf8f3', dark: '#1c1610' },
};

export const AU_BOUNDS: [[number, number], [number, number]] = [
  [111, -44],
  [155, -8.5],
];

/**
 * Pama-Nyungan is the vast majority (≈60% of located languoids) so it holds the
 * brand rust — the "sea" the map floats on. The ~27 non-Pama-Nyungan families
 * (concentrated in the north) get brighter, cooler earth hues so they POP
 * against that rust. Unclassified is a quiet warm grey — present, never a
 * fabricated family.
 */
export const PN_COLOR = '#c0562a'; // brand rust / ochre — Pama-Nyungan
export const UNCLASSIFIED_COLOR = '#9a8e7d'; // warm grey — honestly unclassified
export const OTHER_FAMILY_COLOR = '#7a7268'; // long-tail non-PN families (grouped)

// Non-PN categorical palette — cooler/brighter earth tones that read against the
// rust majority while staying grounded (no neon). Assigned by descending count.
export const NONPN_PALETTE = [
  '#3f6bb0', // nightsky blue
  '#3c7b5a', // eucalyptus green
  '#c69223', // amber gold
  '#7d4a9e', // muted purple
  '#2f9c95', // teal
  '#c94f6d', // rose
  '#6f9a2f', // olive
  '#d97b2c', // warm orange
  '#4b93c4', // sky blue
  '#a83e3e', // deep red
  '#5f8f6a', // sage
  '#8a6d3b', // earth brown
];

export const PN_FAMILY = 'Pama-Nyungan';
export const UNCLASSIFIED_FAMILY = 'unclassified';

export interface FamilyLegendItem {
  family: string;
  label: string;
  color: string;
  count: number;
  group: 'pn' | 'nonpn' | 'unclassified' | 'other';
}

export interface FamilyColorResult {
  /** family name -> hex colour (every located family resolves to a colour) */
  colorOf: Record<string, string>;
  /** ordered legend rows for the UI (PN, top non-PN, other, unclassified) */
  legend: FamilyLegendItem[];
  /** how many non-PN families were folded into "Other families" */
  otherCount: number;
}

/**
 * Deterministic family -> colour assignment from a family=>count map.
 * PN and unclassified are fixed; remaining families rank by count and take the
 * categorical palette; the long tail folds into one honest "Other families".
 */
export function buildFamilyColors(
  counts: Record<string, number>,
): FamilyColorResult {
  const colorOf: Record<string, string> = {};
  const legend: FamilyLegendItem[] = [];

  const pnCount = counts[PN_FAMILY] ?? 0;
  colorOf[PN_FAMILY] = PN_COLOR;
  legend.push({
    family: PN_FAMILY,
    label: 'Pama-Nyungan',
    color: PN_COLOR,
    count: pnCount,
    group: 'pn',
  });

  const nonPn = Object.entries(counts)
    .filter(([fam]) => fam !== PN_FAMILY && fam !== UNCLASSIFIED_FAMILY)
    .sort((a, b) => b[1] - a[1]);

  let otherCount = 0;
  let otherLangs = 0;
  nonPn.forEach(([fam, count], i) => {
    if (i < NONPN_PALETTE.length) {
      const color = NONPN_PALETTE[i];
      colorOf[fam] = color;
      legend.push({
        family: fam,
        label: fam === '(isolate)' ? 'Isolates' : fam,
        color,
        count,
        group: 'nonpn',
      });
    } else {
      colorOf[fam] = OTHER_FAMILY_COLOR;
      otherCount += 1;
      otherLangs += count;
    }
  });

  if (otherCount > 0) {
    legend.push({
      family: '__other__',
      label: `Other families (${otherCount})`,
      color: OTHER_FAMILY_COLOR,
      count: otherLangs,
      group: 'other',
    });
  }

  const unclCount = counts[UNCLASSIFIED_FAMILY] ?? 0;
  colorOf[UNCLASSIFIED_FAMILY] = UNCLASSIFIED_COLOR;
  legend.push({
    family: UNCLASSIFIED_FAMILY,
    label: 'Unclassified',
    color: UNCLASSIFIED_COLOR,
    count: unclCount,
    group: 'unclassified',
  });

  return { colorOf, legend, otherCount };
}

export function colorForFamily(
  family: string | null | undefined,
  colorOf: Record<string, string>,
): string {
  if (!family) return UNCLASSIFIED_COLOR;
  return colorOf[family] ?? OTHER_FAMILY_COLOR;
}

export const TIER_LABEL: Record<string, string> = {
  comprehensive: 'Comprehensive',
  documented: 'Documented',
  classified: 'Classified',
  listed: 'Listed',
};

export const COORD_PROVENANCE_LABEL: Record<string, string> = {
  glottolog: 'Glottolog point',
  austlang: 'AUSTLANG approximate',
  derived_centroid: 'Derived subgroup centroid',
  none: 'Location unknown',
};

// --- shared slim record types (built server-side, consumed by the client) ---

export interface AtlasPointProps {
  slug: string;
  name: string;
  family: string;
  tier: string;
  approx: boolean;
  provenance: string;
  __c: string; // family colour, precomputed server-side
  __sel: boolean;
}

export interface AtlasSearchItem {
  slug: string;
  name: string;
  family: string;
  macroarea: string | null;
  tier: string;
  glottocode: string | null;
  iso639_3: string | null;
  austlang: string[];
  located: boolean;
  approx: boolean;
  has_grammar: boolean;
  lexicon_state: string;
  dated: boolean;
  endangerment: string;
}

export interface AtlasCoverage {
  genuine_languoids: number;
  located: number;
  lexicon_live: number;
  lexicon_open: number;
  grammar_profiled: number;
  deep_time_dated: number;
  with_family_chain: number;
  endangerment_known: number;
  unlocated: number;
}

export function glottologUrl(gc: string) {
  return `https://glottolog.org/resource/languoid/id/${gc}`;
}
export function austlangUrl(code: string) {
  return `https://collection.aiatsis.gov.au/austlang/language/${code}`;
}

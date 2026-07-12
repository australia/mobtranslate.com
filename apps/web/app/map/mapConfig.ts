// Static config + colour helpers for the /map explorer.
// Colours are fixed hex (not theme tokens) because the circles sit on a raster
// basemap, not the page background — they must read on BOTH light and dark tiles.

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
  [111, -45],
  [155, -8.5],
];

// Categorical palette — mid-saturation, distinguishable on light & dark tiles.
// [0] is the brand rust/ochre, deliberately assigned to the dominant family.
export const CATEGORICAL = [
  '#c0562a', // rust / ochre (brand)
  '#3c7b5a', // eucalyptus green
  '#3f6bb0', // nightsky blue
  '#c69223', // amber / gold
  '#7d4a9e', // purple
  '#c94f6d', // rose
  '#2f9c95', // teal
  '#8a6d3b', // brown
  '#6f9a2f', // olive
  '#d97b2c', // orange
  '#5b6b7a', // slate
  '#a83e3e', // deep red
];

export const OTHER_COLOR = '#8c8175'; // long-tail families
export const ISOLATE_COLOR = '#a49a8c'; // "Unclassified / isolate"
export const NOT_CODED = '#a99f92'; // grey — feature not coded / not clustered
export const PRESENT = '#c0562a'; // binary present (warm)
export const ABSENT = '#4b7fb0'; // binary absent (cool)

// 8 clusters (k=8) + not-clustered grey handled separately.
export const CLUSTER_COLORS = [
  '#c0562a', '#3c7b5a', '#3f6bb0', '#c69223',
  '#7d4a9e', '#2f9c95', '#c94f6d', '#6f9a2f',
];

export type Mode = 'family' | 'feature' | 'agreement';

export interface PointProps {
  id: string;
  gc: string | null;
  name: string | null;
  family: string | null;
  subgroup: string | null;
  level: string | null;
  iso: string | null;
  austlang: string | null;
  end: string | null;
  gb: number;
  wals: number;
  aux: number;
  typ: boolean;
  cl: number | null;
  ncon: number;
  dict: string | null;
}

export interface FeatureCatalogItem {
  id: string;
  name: string;
  gloss: string;
  domain: string;
  catalog: 'baseline' | 'extension';
  values: { value: string; meaning: string }[];
  coded: number;
}

export interface Neighbour {
  gc: string;
  name: string | null;
  agr: number;
  n: number;
  dom: Record<string, [number, number]>;
}

// Build a stable family→colour map from the meta family counts.
export function buildFamilyColors(families: Record<string, number>) {
  const entries = Object.entries(families).sort((a, b) => b[1] - a[1]);
  const map: Record<string, string> = {};
  let pi = 0;
  const distinct: { family: string; color: string; count: number }[] = [];
  for (const [fam, count] of entries) {
    if (fam === 'Unclassified / isolate') {
      map[fam] = ISOLATE_COLOR;
      continue;
    }
    if (pi < CATEGORICAL.length) {
      map[fam] = CATEGORICAL[pi++];
      distinct.push({ family: fam, color: map[fam], count });
    } else {
      map[fam] = OTHER_COLOR;
    }
  }
  return { map, distinct };
}

// Colour scale for a selected feature's value space.
export function buildFeatureColors(item: FeatureCatalogItem): Record<string, string> {
  const out: Record<string, string> = {};
  const vals = item.values;
  // Binary present/absent gets a meaningful warm/cool pair.
  const isBinary =
    vals.length === 2 &&
    vals.some((v) => /absent|0|no|none/i.test(v.meaning) || v.value === '0') &&
    vals.some((v) => /present|1|yes/i.test(v.meaning) || v.value === '1');
  if (isBinary) {
    for (const v of vals) {
      const on = v.value === '1' || /present|yes/i.test(v.meaning);
      out[v.value] = on ? PRESENT : ABSENT;
    }
    return out;
  }
  vals.forEach((v, i) => {
    out[v.value] = CATEGORICAL[i % CATEGORICAL.length];
  });
  return out;
}

export const ENDANGERMENT_LABEL: Record<string, string> = {
  'not endangered': 'Not endangered',
  threatened: 'Threatened',
  shifting: 'Shifting',
  moribund: 'Moribund',
  'nearly extinct': 'Nearly extinct',
  extinct: 'Sleeping / extinct',
};

export const DOMAIN_ORDER = [
  'Boundness',
  'Flexivity',
  'Gender_or_Noun_Class',
  'Locus_of_Marking',
  'Word_Order',
];

export function austlangUrl(code: string) {
  return `https://collection.aiatsis.gov.au/austlang/language/${code}`;
}
export function glottologUrl(gc: string) {
  return `https://glottolog.org/resource/languoid/id/${gc}`;
}

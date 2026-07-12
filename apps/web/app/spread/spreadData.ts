// Data shaping + colour helpers for the /spread wind-map.
// Coordinate order in the source dataset is [latitude, longitude] everywhere.
// MapLibre wants [lon, lat]; we convert at the boundary here.

import { CATEGORICAL } from '../map/mapConfig';

export const DATA_URL = '/spread/diffusion_model.json';

/** Brand rust/ochre — reserved for Pama-Nyungan, the time-calibrated expansion. */
export const PN_COLOR = '#e0692f';

export interface RawNode {
  id: string;
  backbone: 'glottolog' | 'bouckaert2018';
  type: 'internal' | 'leaf';
  family: string | null;
  name: string | null;
  latlon?: [number, number] | null;
  age_bp_median?: number | null;
  time_basis?: string;
  posterior?: number | null;
  glottocode?: string | null;
}

export interface RawEdge {
  id: string;
  backbone: 'glottolog' | 'bouckaert2018';
  parent: string;
  child: string;
  family: string | null;
  from_latlon?: [number, number] | null;
  to_latlon?: [number, number] | null;
  from_age_bp?: number | null;
  to_age_bp?: number | null;
  time_basis?: string;
}

export interface RawDataset {
  _meta: Record<string, unknown>;
  caveats: string;
  sources: {
    id: string;
    citation: string;
    doi?: string;
    used_for?: string;
    license?: string;
  }[];
  origin: {
    family: string;
    description: string;
    lat: number;
    lon: number;
    age_bp_median: number;
    age_bp_95hpd: [number, number];
    source: string;
    note: string;
  };
  stats: Record<string, any>;
  focal_lineages: Record<
    string,
    {
      label: string;
      glottolog_lineage: any[];
      bouckaert2018_dated_lineage: any[] | null;
    }
  >;
  nodes: RawNode[];
  edges: RawEdge[];
}

/** A Bouckaert (dated, Pama-Nyungan) spread edge in draw-ready form. */
export interface DatedEdge {
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
  fromAge: number; // years BP at the ancestor (older, larger)
  toAge: number; // years BP at the descendant (younger, smaller)
  posterior: number; // 0..1 support of the child clade
  childIsLeaf: boolean;
  childName: string | null;
}

/** A static, UNDATED context edge (non-Pama-Nyungan northern families). */
export interface ContextEdge {
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
  family: string;
  color: string;
}

export interface FocalStep {
  lon: number;
  lat: number;
  age: number | null;
  name: string | null;
  posterior?: number | null;
}

export interface FocalPath {
  key: string;
  label: string;
  color: string;
  steps: FocalStep[]; // dated diffusion path (Gulf -> home), age descending
  leafName: string;
  leafLon: number;
  leafLat: number;
  leafAge: number | null;
}

export interface PreparedData {
  origin: RawDataset['origin'];
  rootAge: number;
  datedEdges: DatedEdge[];
  contextEdges: ContextEdge[];
  contextFamilies: { family: string; color: string; count: number }[];
  datedLeaves: { lon: number; lat: number; name: string | null }[];
  focalPaths: Record<string, FocalPath>;
  caveats: string[];
  sources: RawDataset['sources'];
  stats: Record<string, any>;
  meta: Record<string, unknown>;
}

/** Build a stable family -> colour map for the non-PN context families. */
export function buildContextFamilyColors(dataset: RawDataset) {
  const counts: Record<string, number> =
    dataset.stats?.glottolog_backbone?.family_leaf_counts ?? {};
  const skip = new Set([
    'Pama-Nyungan',
    'Artificial Language',
    'Unclassifiable',
    'Eastern Trans-Fly',
  ]);
  const entries = Object.entries(counts)
    .filter(([fam]) => !skip.has(fam))
    .sort((a, b) => b[1] - a[1]);
  const map: Record<string, string> = {};
  const list: { family: string; color: string; count: number }[] = [];
  // Palette index 0 is the brand rust (reserved for PN) — start at 1.
  let pi = 1;
  for (const [fam, count] of entries) {
    const color = CATEGORICAL[pi % CATEGORICAL.length];
    pi += 1;
    map[fam] = color;
    list.push({ family: fam, color, count });
  }
  return { map, list };
}

const FOCAL_COLORS: Record<string, string> = {
  kuku1273: '#ffd23f', // bright gold — the operator's own language, arriving home
  warl1254: '#4fb0e0',
  guma1253: '#7bd88f',
  kaur1267: '#e07bb8',
};

export function prepare(dataset: RawDataset): PreparedData {
  const nodeById = new Map<string, RawNode>();
  for (const n of dataset.nodes) nodeById.set(n.id, n);

  const { map: famColor, list: contextFamilies } =
    buildContextFamilyColors(dataset);

  const datedEdges: DatedEdge[] = [];
  const contextEdges: ContextEdge[] = [];

  for (const e of dataset.edges) {
    if (!e.from_latlon || !e.to_latlon) continue; // skip null-latlon edges
    const [fLat, fLon] = e.from_latlon;
    const [tLat, tLon] = e.to_latlon;
    if (
      e.backbone === 'bouckaert2018' &&
      e.from_age_bp != null &&
      e.to_age_bp != null
    ) {
      const child = nodeById.get(e.child);
      const posterior =
        typeof child?.posterior === 'number' ? child.posterior : 0.5;
      datedEdges.push({
        fromLon: fLon,
        fromLat: fLat,
        toLon: tLon,
        toLat: tLat,
        fromAge: e.from_age_bp,
        toAge: e.to_age_bp,
        posterior,
        childIsLeaf: child?.type === 'leaf',
        childName: child?.name ?? null,
      });
    } else if (e.backbone === 'glottolog' && e.family && e.family !== 'Pama-Nyungan') {
      const color = famColor[e.family] ?? '#8c8175';
      contextEdges.push({
        fromLon: fLon,
        fromLat: fLat,
        toLon: tLon,
        toLat: tLat,
        family: e.family,
        color,
      });
    }
  }

  // present-day dated leaves (light up as they are reached)
  const datedLeaves: { lon: number; lat: number; name: string | null }[] = [];
  for (const n of dataset.nodes) {
    if (n.backbone === 'bouckaert2018' && n.type === 'leaf' && n.latlon) {
      datedLeaves.push({ lon: n.latlon[1], lat: n.latlon[0], name: n.name });
    }
  }

  // focal paths from the dated lineage (falls back to glottolog lineage points)
  const focalPaths: Record<string, FocalPath> = {};
  for (const [key, fl] of Object.entries(dataset.focal_lineages)) {
    const dated = fl.bouckaert2018_dated_lineage;
    const glotto = fl.glottolog_lineage;
    let steps: FocalStep[] = [];
    if (dated && dated.length > 1) {
      steps = dated
        .filter((s: any) => Array.isArray(s.latlon))
        .map((s: any) => ({
          lon: s.latlon[1],
          lat: s.latlon[0],
          age: s.age_bp_median ?? null,
          name: s.name ?? null,
          posterior: s.posterior ?? null,
        }));
    }
    // append the glottolog leaf tip if the dated path stops short of the language itself
    const leafG = glotto[glotto.length - 1];
    let leafLon = steps.length ? steps[steps.length - 1].lon : 0;
    let leafLat = steps.length ? steps[steps.length - 1].lat : 0;
    let leafName = fl.label;
    let leafAge: number | null = steps.length
      ? steps[steps.length - 1].age
      : null;
    if (leafG && Array.isArray(leafG.latlon)) {
      leafLon = leafG.latlon[1];
      leafLat = leafG.latlon[0];
      leafName = leafG.name ?? fl.label;
      // add a final visual hop to the actual language location if it differs
      const last = steps[steps.length - 1];
      if (
        !last ||
        Math.abs(last.lon - leafLon) > 0.05 ||
        Math.abs(last.lat - leafLat) > 0.05
      ) {
        steps.push({
          lon: leafLon,
          lat: leafLat,
          age: last?.age != null ? Math.max(0, last.age - 20) : 0,
          name: leafName,
          posterior: null,
        });
        leafAge = steps[steps.length - 1].age;
      }
    }
    focalPaths[key] = {
      key,
      label: fl.label,
      color: FOCAL_COLORS[key] ?? '#ffd23f',
      steps,
      leafName,
      leafLon,
      leafLat,
      leafAge,
    };
  }

  // split the caveats string into numbered paragraphs
  const caveats = dataset.caveats
    .split(/\n(?=\d+\.\s)/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    origin: dataset.origin,
    rootAge: dataset.origin.age_bp_median,
    datedEdges,
    contextEdges,
    contextFamilies,
    datedLeaves,
    focalPaths,
    caveats,
    sources: dataset.sources,
    stats: dataset.stats,
    meta: dataset._meta,
  };
}

/** years BP -> rough calendar label (BP is "before 1950"). */
export function calendarLabel(bp: number): string {
  const year = 1950 - Math.round(bp);
  if (year < 0) return `~${Math.abs(year).toLocaleString()} BCE`;
  if (year === 0) return '~1 BCE';
  return `~${year.toLocaleString()} CE`;
}

export function fmtBP(bp: number): string {
  return `${Math.round(bp).toLocaleString()} yr BP`;
}

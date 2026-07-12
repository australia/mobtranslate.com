// Shared types for the grammar matrix artifact (apps/web/data/atlas/grammar-matrix.json
// and its public/ fetch copy). Emitted deterministically by scripts/atlas/build-data.ts.
import type { StateChar, FeatureValue } from './grammarColors';

export interface GrammarFeature {
  key: string; // `${layer}:${id}` — unique
  id: string;
  source: 'Grambank' | 'WALS' | 'AUS extension' | string;
  layer: 'grambank' | 'wals' | 'aus_extension' | string;
  domain: string | null;
  gloss: string; // plain-English gloss (never a raw code)
  values: FeatureValue[]; // distinct coded values, most-common first
  coded: number; // langs with a real value
  unknown: number; // langs that coded it as '?'
  na: number;
  langs: number; // langs with any row (coded+unknown+na)
}

export interface GrammarMetric {
  name: string;
  label: string;
  not_called: string;
  definition: string;
}

export interface GrammarNeighbour {
  slug: string;
  name: string;
  family: string;
  score: number;
  n_joint: number;
}

export interface GrammarPair {
  a: { slug: string; name: string; family: string };
  b: { slug: string; name: string; family: string };
  score: number;
  n_joint: number;
}

export interface GrammarLangLite {
  n: number; // coded feature count
  name: string;
  family: string;
}

export interface GrammarMatrix {
  version: string;
  build_stamp: string;
  metric: GrammarMetric;
  baseline_caveat: string;
  coverage: {
    profiled_languages: number;
    genuine_languoids: number;
    features_total: number;
    by_source: Record<string, number>;
    coded_data_points: number;
    similarity_pairs: number;
  };
  domains: { id: string; count: number }[];
  features: GrammarFeature[];
  langs: Record<string, GrammarLangLite>;
  values: Record<string, Record<string, [string, StateChar]>>;
  neighbours: Record<string, GrammarNeighbour[]>;
  top_pairs: GrammarPair[];
}

// The light catalogue passed as a server prop (everything EXCEPT the big values
// map, which the client fetches lazily).
export interface GrammarCatalog {
  version: string;
  build_stamp: string;
  metric: GrammarMetric;
  baseline_caveat: string;
  coverage: GrammarMatrix['coverage'];
  domains: GrammarMatrix['domains'];
  features: GrammarFeature[];
  langs: Record<string, GrammarLangLite>;
  neighbours: Record<string, GrammarNeighbour[]>;
  top_pairs: GrammarPair[];
}

/** Recorded-agreement over two languages' Grambank feature vectors. Identical
 *  to the DB's typology_similarity.grambank_recorded_agreement (verified). */
export function recordedAgreement(
  valuesByFeatureKey: Record<string, Record<string, [string, StateChar]>>,
  slugA: string,
  slugB: string,
): { agree: number; n_joint: number; score: number | null } {
  let agree = 0;
  let n = 0;
  for (const key in valuesByFeatureKey) {
    if (!key.startsWith('grambank:')) continue; // metric is Grambank-only, by definition
    const m = valuesByFeatureKey[key];
    const a = m[slugA];
    const b = m[slugB];
    if (!a || !b) continue;
    // coded values only (exclude '?'-unknown and N/A from BOTH num and denom)
    if (a[1] === 'u' || a[1] === 'x' || b[1] === 'u' || b[1] === 'x') continue;
    n++;
    if (a[0] === b[0]) agree++;
  }
  return { agree, n_joint: n, score: n > 0 ? agree / n : null };
}

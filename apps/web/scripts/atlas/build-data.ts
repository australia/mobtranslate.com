/*
 * Atlas of Australian Languages — P0 DATA FOUNDATION pipeline.
 *
 * Reads the four data planes:
 *   (1) Registry  — the CANONICAL universe of 1,029 languoids
 *       (australian_languages_registry.json)
 *   (2) Phylogeography — Bouckaert 2018 dated Pama-Nyungan tree (diffusion_model.json)
 *   (3) Dictionary inventory + DB typology plane — lexical/grammar coverage
 *   (4) Live DB (mobtranslate-pg, READ-ONLY export) — languages + word counts
 *
 * JOINS them deterministically keyed on glottocode, with fallback keys
 * (austlang code, then normalized name / DB slug), and emits versioned,
 * reproducible artifacts under apps/web/data/atlas/.
 *
 * HARD RULES honoured:
 *   - mobtranslate-pg is READ-ONLY (SELECT only; no writes/DDL).
 *   - No fabricated data: every derived value carries a provenance flag.
 *   - Reproducible: build stamp comes from env/arg, never Date.now.
 *
 * Run:  pnpm atlas:build-data
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

// ---------------------------------------------------------------------------
// Config (all overridable via env for reproducibility / portability)
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_RELEASE_VERSION = process.env.ATLAS_RELEASE_VERSION ?? '1.0.0';
// Fixed build stamp for reproducibility. NEVER Date.now() in a way that
// changes the artifact on every run — pass ATLAS_BUILD_STAMP to override.
const BUILD_STAMP = process.env.ATLAS_BUILD_STAMP ?? '2026-07-12T00:00:00Z';

const RESEARCH_ROOT =
  process.env.ATLAS_RESEARCH_ROOT ??
  '/mnt/donto-data/donto-resources/research/australian-languages';

const OUT_DIR =
  process.env.ATLAS_OUT_DIR ?? path.resolve(__dirname, '../../data/atlas');

const REGISTRY_PATH = path.join(
  RESEARCH_ROOT,
  'registry/australian_languages_registry.json',
);
const DIFFUSION_PATH = path.join(RESEARCH_ROOT, 'phylogeography/diffusion_model.json');
const DICT_INV_PATH = path.join(RESEARCH_ROOT, 'dictionaries/dictionary-inventory.json');
const TYPOLOGY_MATRIX_PATH = path.join(
  RESEARCH_ROOT,
  'typology/language-features-matrix.json',
);

// Families that are NOT genuine spoken Aboriginal/TSI languages. These 49
// registry nodes go into the appendix, never the main atlas count.
const NON_GENUINE_FAMILIES = new Set<string>([
  'Sign Language',
  'Bookkeeping',
  'Pidgin',
  'Artificial Language',
  'Mixed Language',
  'Unclassifiable',
]);

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
function readJson<T = any>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

/** Normalize a name/locality to a comparison key: lowercase, strip diacritics
 *  and all non-alphanumerics. Used for the name-fallback join only. */
function normName(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** kebab-case a name for a slug fallback. */
function kebab(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RegistryLanguoid {
  glottocode: string | null;
  canonical_name: string;
  level: string | null;
  iso639_3: string | null;
  austlang_codes: string[];
  alt_names: string[];
  family: string | null;
  family_chain: { glottocode: string; name: string }[];
  latitude: number | null;
  longitude: number | null;
  coord_source: string | null;
  macroarea: string | null;
  state: string | null;
  region: string | null;
  endangerment_aes_level: number | null;
  endangerment_aes_label: string | null;
  grambank_coverage: boolean;
  grambank_feature_count: number;
  wals_coverage: boolean;
  wals_feature_count: number;
  source: string;
  austlang_uri?: string;
}

interface DbLanguage {
  code: string;
  name: string;
  native_name: string | null;
  glottocode: string | null;
  iso_639_3: string | null;
  family: string | null;
  region: string | null;
  country: string | null;
  status: string | null;
  metadata: Record<string, any> | null;
  word_count: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const log = (...a: any[]) => console.log('[atlas]', ...a);
  const orphanLog: {
    plane: string;
    id: string;
    name: string;
    reason: string;
  }[] = [];

  log(`release v${DATA_RELEASE_VERSION}  stamp ${BUILD_STAMP}`);
  log(`research root: ${RESEARCH_ROOT}`);
  log(`output dir:    ${OUT_DIR}`);

  // -- Plane 1: registry (canonical universe) -------------------------------
  const registryDoc = readJson<{ languoids: RegistryLanguoid[]; _meta: any }>(
    REGISTRY_PATH,
  );
  const languoids = registryDoc.languoids;
  log(`registry: ${languoids.length} languoids`);

  // -- Plane 2: phylogeography (dated tree) ---------------------------------
  const diffusion = readJson<{ nodes: any[]; edges: any[]; stats: any; origin: any }>(
    DIFFUSION_PATH,
  );
  const nodeById = new Map<string, any>();
  for (const n of diffusion.nodes) nodeById.set(n.id, n);
  // child -> parent (for divergence-age lookup)
  const parentOf = new Map<string, string>();
  for (const e of diffusion.edges) parentOf.set(e.child, e.parent);
  // glottocode -> dated Bouckaert leaf
  const datedLeafByGlotto = new Map<string, any>();
  for (const n of diffusion.nodes) {
    if (
      n.backbone === 'bouckaert2018' &&
      n.type === 'leaf' &&
      n.glottocode &&
      !datedLeafByGlotto.has(n.glottocode)
    ) {
      datedLeafByGlotto.set(n.glottocode, n);
    }
  }
  log(`phylo: ${datedLeafByGlotto.size} glottocode-mapped dated leaves`);

  // -- Plane 3a: dictionary inventory (lexical resource pointers) -----------
  const dictInv = readJson<{ languages: any[]; summary: any }>(DICT_INV_PATH);
  const dictByGlotto = new Map<string, any>();
  const dictByAustlang = new Map<string, any>();
  for (const d of dictInv.languages) {
    if (d.glottocode) dictByGlotto.set(d.glottocode, d);
    for (const a of d.austlang_codes ?? []) if (!dictByAustlang.has(a)) dictByAustlang.set(a, d);
  }
  const bestWordCount = (d: any): number | null => {
    if (!d?.resources) return null;
    let best: number | null = null;
    for (const r of d.resources) {
      if (typeof r.word_count === 'number' && (best === null || r.word_count > best)) best = r.word_count;
    }
    return best;
  };
  const bestPointer = (d: any): { title: string; url: string; license: string | null } | null => {
    if (!d?.resources?.length) return null;
    // prefer an open-download resource, else the first with a url
    const open = d.resources.find((r: any) => r.acquired || /open/i.test(r.digital_availability ?? ''));
    const r = open ?? d.resources.find((r: any) => r.url) ?? d.resources[0];
    return r ? { title: r.title ?? null, url: r.url ?? null, license: r.license ?? null } : null;
  };

  // -- Plane 3b: DB typology coverage (grammar plane in the live DB) --------
  const typoMatrix = readJson<{ languages: any[] }>(TYPOLOGY_MATRIX_PATH);
  const typoByGlotto = new Map<string, any>();
  for (const t of typoMatrix.languages) if (t.glottocode) typoByGlotto.set(t.glottocode, t);

  // -- Plane 4: live DB snapshot (READ-ONLY) --------------------------------
  const dbUrl = process.env.DATABASE_URL;
  let dbLanguages: DbLanguage[] = [];
  if (!dbUrl) {
    log('WARNING: DATABASE_URL not set — building WITHOUT the live-DB lexical plane.');
  } else {
    const sql = postgres(dbUrl, { max: 4, prepare: false });
    try {
      const rows = await sql<DbLanguage[]>`
        SELECT l.code, l.name, l.native_name, l.glottocode, l.iso_639_3,
               l.family, l.region, l.country, l.status, l.metadata,
               COUNT(w.id)::int AS word_count
        FROM languages l
        LEFT JOIN words w ON w.language_id = l.id
        GROUP BY l.id, l.code, l.name, l.native_name, l.glottocode, l.iso_639_3,
                 l.family, l.region, l.country, l.status, l.metadata
        ORDER BY l.code`;
      dbLanguages = rows.map((r) => ({ ...r, word_count: Number(r.word_count) }));
    } finally {
      await sql.end({ timeout: 5 });
    }
    log(`db snapshot: ${dbLanguages.length} languages`);
  }

  // -- Registry lookup indexes for the DB join ------------------------------
  const regByGlotto = new Map<string, RegistryLanguoid>();
  const regByIso = new Map<string, RegistryLanguoid>();
  const regByAustlang = new Map<string, RegistryLanguoid>();
  const regByNorm = new Map<string, RegistryLanguoid>();
  for (const l of languoids) {
    if (l.glottocode) regByGlotto.set(l.glottocode, l);
    if (l.iso639_3) regByIso.set(l.iso639_3, l);
    for (const a of l.austlang_codes) if (!regByAustlang.has(a)) regByAustlang.set(a, l);
    const keys = [l.canonical_name, ...(l.alt_names ?? [])];
    for (const k of keys) {
      const nk = normName(k);
      if (nk && !regByNorm.has(nk)) regByNorm.set(nk, l);
    }
  }

  // Resolve a DB language to a registry languoid. Returns { languoid, join_key } or null.
  function resolveDb(db: DbLanguage, isCurr: boolean): { languoid: RegistryLanguoid; join_key: string } | null {
    if (db.glottocode && regByGlotto.has(db.glottocode))
      return { languoid: regByGlotto.get(db.glottocode)!, join_key: 'glottocode' };
    if (db.iso_639_3 && regByIso.has(db.iso_639_3))
      return { languoid: regByIso.get(db.iso_639_3)!, join_key: 'iso639_3' };
    // name fallback. For curr rows, strip the "(Curr #NNN)" suffix + locality noise.
    let nameForMatch = db.name;
    if (isCurr) nameForMatch = db.name.replace(/\s*\(Curr #\d+\)\s*$/i, '');
    for (const cand of [db.name, db.native_name, nameForMatch, db.code]) {
      const nk = normName(cand);
      if (nk && regByNorm.has(nk)) return { languoid: regByNorm.get(nk)!, join_key: 'normalized_name' };
    }
    return null;
  }

  // -- Attach DB lexical data to registry languoids -------------------------
  // key: registry identity (glottocode || 'austlang:'+first || 'norm:'+canonical)
  function regKey(l: RegistryLanguoid): string {
    if (l.glottocode) return `gc:${l.glottocode}`;
    if (l.austlang_codes.length) return `al:${l.austlang_codes[0]}`;
    return `nm:${normName(l.canonical_name)}`;
  }
  interface LiveLex { db_code: string; word_count: number }
  interface HistLex { db_code: string; locality: string | null; word_count: number; source: string; license: string | null; source_url: string | null }
  const liveLexByReg = new Map<string, LiveLex>();
  const histLexByReg = new Map<string, HistLex[]>();
  const appendixHistorical: any[] = []; // unmapped Curr wordlists
  let migmaqExcluded = 0;
  let currMappedToLanguoid = 0;
  let currUnmapped = 0;
  let dbLiveMapped = 0;

  for (const db of dbLanguages) {
    // EXCLUDE Mi'gmaq (Canadian Algonquian) entirely from the Australian atlas.
    const isMigmaq = db.code === 'migmaq' || /canada/i.test(db.country ?? '') || db.family === 'Algonquian';
    if (isMigmaq) {
      migmaqExcluded++;
      orphanLog.push({ plane: 'db', id: db.code, name: db.name, reason: 'excluded: non-Australian (Mi\'gmaq / Canada)' });
      continue;
    }
    const isCurr = db.code.startsWith('curr_');
    const resolved = resolveDb(db, isCurr);

    if (!isCurr) {
      // Modern DB language → live lexicon on the matched languoid.
      if (resolved && db.word_count > 0) {
        const k = regKey(resolved.languoid);
        const existing = liveLexByReg.get(k);
        if (!existing || db.word_count > existing.word_count) {
          liveLexByReg.set(k, { db_code: db.code, word_count: db.word_count });
        }
        dbLiveMapped++;
      } else if (!resolved) {
        orphanLog.push({ plane: 'db', id: db.code, name: db.name, reason: 'modern DB language: no registry match (glottocode/iso/name)' });
      }
      // db.word_count === 0 modern langs (gamilaraay etc.) still resolve; just no live lexicon attached.
    } else {
      // Curr historical wordlist. Tag + try a confident map to a real languoid.
      const meta = db.metadata ?? {};
      const hist: HistLex = {
        db_code: db.code,
        locality: meta.locality ?? null,
        word_count: db.word_count,
        source: meta.source ?? 'E. M. Curr, The Australian Race (1886-87)',
        license: meta.license ?? 'Public Domain',
        source_url: meta.source_url ?? null,
      };
      // Only a glottocode/iso/exact-name match counts as "confident"; OCR locality
      // names virtually never match, so most land in the appendix (honest).
      if (resolved && (resolved.join_key === 'glottocode' || resolved.join_key === 'iso639_3' || resolved.join_key === 'normalized_name')) {
        const k = regKey(resolved.languoid);
        const arr = histLexByReg.get(k) ?? [];
        arr.push(hist);
        histLexByReg.set(k, arr);
        currMappedToLanguoid++;
      } else {
        currUnmapped++;
        appendixHistorical.push({
          kind: 'historical_wordlist',
          source_kind: 'historical_wordlist',
          db_code: db.code,
          name: db.name,
          locality: hist.locality,
          word_count: hist.word_count,
          source: hist.source,
          license: hist.license,
          source_url: hist.source_url,
          note: 'E. M. Curr 1886-87 locality wordlist (OCR); not confidently mappable to a Glottolog languoid — kept as a labelled historical appendix item, NOT a modern language.',
        });
      }
    }
  }

  // -- Derived-centroid support: family_chain node -> coords of leaves ------
  const coordsByChainNode = new Map<string, [number, number][]>();
  for (const l of languoids) {
    if (typeof l.latitude === 'number' && typeof l.longitude === 'number') {
      for (const node of l.family_chain) {
        const arr = coordsByChainNode.get(node.glottocode) ?? [];
        arr.push([l.latitude, l.longitude]);
        coordsByChainNode.set(node.glottocode, arr);
      }
    }
  }
  function deriveCentroid(l: RegistryLanguoid): { lat: number; lon: number; via: string } | null {
    // Walk family_chain from most specific (last) to least (first).
    for (let i = l.family_chain.length - 1; i >= 0; i--) {
      const node = l.family_chain[i];
      const pts = coordsByChainNode.get(node.glottocode);
      if (pts && pts.length >= 1) {
        const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const lon = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        return { lat: round(lat), lon: round(lon), via: node.name };
      }
    }
    return null;
  }

  // -- Slug assignment (prefer glottocode, else austlang, else kebab name) --
  const usedSlugs = new Set<string>();
  function assignSlug(l: RegistryLanguoid): string {
    let base: string;
    if (l.glottocode) base = l.glottocode;
    else if (l.austlang_codes.length) base = l.austlang_codes[0].toLowerCase();
    else base = kebab(l.canonical_name) || 'unnamed';
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);
    return slug;
  }

  // -- Build per-language records -------------------------------------------
  const records: any[] = [];
  const indexRows: any[] = [];
  const appendixNodes: any[] = [];

  // coverage counters
  const cov = {
    genuine: 0,
    coords_real_glottolog: 0,
    coords_austlang: 0,
    coords_derived_centroid: 0,
    coords_none: 0,
    with_any_id: 0,
    with_glottocode: 0,
    with_iso: 0,
    with_austlang: 0,
    with_family_chain: 0,
    with_grammar_profile: 0,
    lexicon_live: 0,
    lexicon_open_resource: 0,
    lexicon_pointer_only: 0,
    lexicon_none: 0,
    dated_tree: 0,
    with_endangerment: 0,
    tier: { comprehensive: 0, documented: 0, classified: 0, listed: 0 } as Record<string, number>,
  };

  for (const l of languoids) {
    const genuine = !(l.family && NON_GENUINE_FAMILIES.has(l.family));

    // --- Coordinates with fallback chain + provenance ---
    let coordinates: { lat: number | null; lon: number | null; provenance: string; approximate: boolean; derived_via?: string };
    if (typeof l.latitude === 'number' && typeof l.longitude === 'number') {
      const prov = l.coord_source === 'austlang' ? 'austlang' : 'glottolog';
      coordinates = {
        lat: l.latitude,
        lon: l.longitude,
        provenance: prov,
        approximate: prov === 'austlang',
      };
    } else {
      const c = deriveCentroid(l);
      if (c) {
        coordinates = { lat: c.lat, lon: c.lon, provenance: 'derived_centroid', approximate: true, derived_via: c.via };
      } else {
        coordinates = { lat: null, lon: null, provenance: 'none', approximate: false };
      }
    }

    // --- IDs ---
    const ids = {
      glottocode: l.glottocode,
      iso639_3: l.iso639_3,
      austlang: l.austlang_codes,
    };
    const hasAnyId = !!(l.glottocode || l.iso639_3 || l.austlang_codes.length);

    // --- Classification ---
    const classification_chain = l.family_chain.length
      ? l.family_chain.map((n) => ({ glottocode: n.glottocode, name: n.name }))
      : null;
    const hasFamilyChain = !!(classification_chain && classification_chain.length);

    // --- Grammar (Grambank/WALS authoritative from registry; DB typology = supplementary) ---
    const typo = l.glottocode ? typoByGlotto.get(l.glottocode) : undefined;
    const grammarProfiled = l.grambank_coverage || l.wals_coverage;
    const grammar = grammarProfiled || typo
      ? {
          profiled: true,
          has_grambank: l.grambank_coverage,
          grambank_feature_count: l.grambank_feature_count,
          has_wals: l.wals_coverage,
          wals_feature_count: l.wals_feature_count,
          has_db_typology: !!typo,
          db_typology_coverage_pct: typo?.coverage_pct ?? null,
          feature_count: l.grambank_feature_count + l.wals_feature_count,
        }
      : { profiled: false as const, state: 'not_profiled' as const };

    // --- Lexicon state ---
    const k = regKey(l);
    const live = liveLexByReg.get(k);
    const hist = histLexByReg.get(k) ?? [];
    const dict = (l.glottocode && dictByGlotto.get(l.glottocode)) ||
      l.austlang_codes.map((a) => dictByAustlang.get(a)).find(Boolean);
    let lexicon: any;
    if (live) {
      lexicon = {
        state: 'live',
        word_count: live.word_count,
        db_code: live.db_code,
        historical_sources: hist.length ? hist : undefined,
      };
    } else if (dict?.has_open_resource) {
      const ptr = bestPointer(dict);
      lexicon = {
        state: 'open_resource',
        word_count: bestWordCount(dict),
        resource: ptr,
        historical_sources: hist.length ? hist : undefined,
      };
    } else if (dict?.has_any_digital) {
      const ptr = bestPointer(dict);
      lexicon = {
        state: 'pointer_only',
        resource_count: dict.resource_count ?? (dict.resources?.length ?? 0),
        pointer: ptr,
        historical_sources: hist.length ? hist : undefined,
      };
    } else if (hist.length) {
      // Only historical Curr wordlist(s) mapped here — treat as pointer to a historical source.
      lexicon = { state: 'pointer_only', historical_sources: hist };
    } else {
      lexicon = { state: 'none' };
    }

    // --- Deep-time position (dated only for glottocode-mapped Bouckaert leaves) ---
    let deep_time: any;
    const leaf = l.glottocode ? datedLeafByGlotto.get(l.glottocode) : undefined;
    if (leaf) {
      const parentId = parentOf.get(leaf.id);
      const parent = parentId ? nodeById.get(parentId) : undefined;
      deep_time = {
        dated: true,
        tree_node: leaf.id,
        backbone: 'bouckaert2018',
        leaf_age_bp: leaf.age_bp_median ?? null,
        leaf_hpd_bp: leaf.age_bp_95hpd ?? null,
        divergence_age_bp: parent?.age_bp_median ?? null,
        divergence_hpd_bp: parent?.age_bp_95hpd ?? null,
        note: 'Dates the LANGUAGE lineage (Bouckaert 2018 BEAST tree), NOT a population arrival.',
      };
    } else {
      deep_time = { dated: false, state: 'undated_or_coordinate_only' };
    }

    // --- Endangerment ---
    const endangerment = l.endangerment_aes_level != null || l.endangerment_aes_label
      ? { aes_level: l.endangerment_aes_level, label: l.endangerment_aes_label }
      : { aes_level: null, label: 'unknown' };

    // --- Autonym candidate (labelled unverified) ---
    // We do NOT assert an autonym; alt_names conflate endonyms with spelling
    // variants, so surface at most one candidate, clearly flagged unverified.
    const autonymCandidate = l.alt_names?.length
      ? { value: l.alt_names[0], status: 'unverified — from alt-names', all_candidates_count: l.alt_names.length }
      : { value: null, status: 'none' };

    // --- data_completeness booleans ---
    const data_completeness = {
      name: true,
      any_id: hasAnyId,
      glottocode: !!l.glottocode,
      iso639_3: !!l.iso639_3,
      austlang: !!l.austlang_codes.length,
      classification_chain: hasFamilyChain,
      coordinates_real: coordinates.provenance === 'glottolog',
      coordinates_any: coordinates.provenance !== 'none',
      endangerment: endangerment.label !== 'unknown',
      grammar_profile: grammar.profiled,
      lexicon_data: lexicon.state === 'live' || lexicon.state === 'open_resource',
      deep_time_dated: deep_time.dated,
      autonym_candidate: autonymCandidate.value != null,
    };

    // --- Coverage tier (deterministic) ---
    let tier: string;
    if (
      data_completeness.coordinates_real &&
      hasFamilyChain &&
      grammar.profiled &&
      (lexicon.state === 'live' || lexicon.state === 'open_resource')
    ) {
      tier = 'comprehensive';
    } else if (
      data_completeness.coordinates_any &&
      hasFamilyChain &&
      (grammar.profiled || lexicon.state !== 'none' || deep_time.dated)
    ) {
      tier = 'documented';
    } else if (hasFamilyChain && hasAnyId) {
      tier = 'classified';
    } else {
      tier = 'listed';
    }

    // --- Provenance/source citations per datum ---
    const sources = {
      classification: hasFamilyChain ? 'Glottolog 5.3 CLDF (CC-BY-4.0)' : (l.source === 'austlang-only' ? 'AIATSIS AUSTLANG (CC-BY-4.0)' : null),
      coordinates:
        coordinates.provenance === 'glottolog' ? 'Glottolog 5.3 (CC-BY-4.0)'
        : coordinates.provenance === 'austlang' ? 'AIATSIS AUSTLANG approx. point (CC-BY-4.0)'
        : coordinates.provenance === 'derived_centroid' ? 'derived: mean of sibling-leaf coords (drawing convenience, not a claim)'
        : null,
      endangerment: endangerment.label !== 'unknown' ? 'Glottolog AES (CC-BY-4.0)' : null,
      grammar: grammar.profiled ? 'Grambank v1.0.3 / WALS 2020.4 (CC-BY-4.0)' : null,
      lexicon:
        lexicon.state === 'live' ? 'mobtranslate-pg live dictionary'
        : lexicon.state === 'open_resource' ? (lexicon.resource?.license ?? 'open resource')
        : lexicon.state === 'pointer_only' ? 'catalogue pointer (rights-managed)'
        : null,
      deep_time: deep_time.dated ? 'Bouckaert, Bowern & Atkinson 2018 (Phlorest CLDF, CC-BY-4.0)' : null,
      ids: 'Glottolog 5.3 + AIATSIS AUSTLANG',
    };

    const slug = assignSlug(l);

    if (!genuine) {
      // Non-language node → appendix (never counted as an Aboriginal language).
      appendixNodes.push({
        slug,
        canonical_name: l.canonical_name,
        node_kind: l.family, // Sign Language / Bookkeeping / Pidgin / Artificial Language / Mixed Language / Unclassifiable
        ids,
        glottocode: l.glottocode,
        macroarea: l.macroarea,
        coordinates,
        reason: `excluded from main atlas: ${l.family} node (not a genuine spoken Aboriginal/TSI language)`,
      });
      continue;
    }

    // genuine record
    const record = {
      slug,
      canonical_name: l.canonical_name,
      autonym_candidate: autonymCandidate,
      is_genuine_language: true,
      source_kind: 'language',
      level: l.level, // language | dialect | null
      ids,
      family: l.family ?? 'unclassified',
      classification_chain,
      classification_state: hasFamilyChain ? 'classified' : 'unclassified',
      macroarea: l.macroarea,
      region: l.region,
      state: l.state, // null everywhere in open exports — honest
      coordinates,
      endangerment,
      grammar,
      lexicon,
      deep_time,
      data_completeness,
      tier,
      sources,
      registry_source: l.source, // glottolog | austlang-only
    };
    records.push(record);

    // index row (lightweight)
    indexRows.push({
      slug,
      name: l.canonical_name,
      family: l.family ?? 'unclassified',
      macroarea: l.macroarea,
      level: l.level,
      lat: coordinates.lat,
      lon: coordinates.lon,
      coord_provenance: coordinates.provenance,
      coord_approximate: coordinates.approximate,
      tier,
      glottocode: l.glottocode,
      iso639_3: l.iso639_3,
      austlang: l.austlang_codes,
      endangerment: endangerment.label,
      has_grammar: grammar.profiled,
      lexicon_state: lexicon.state,
      dated: deep_time.dated,
    });

    // counters
    cov.genuine++;
    if (coordinates.provenance === 'glottolog') cov.coords_real_glottolog++;
    else if (coordinates.provenance === 'austlang') cov.coords_austlang++;
    else if (coordinates.provenance === 'derived_centroid') cov.coords_derived_centroid++;
    else cov.coords_none++;
    if (hasAnyId) cov.with_any_id++;
    if (l.glottocode) cov.with_glottocode++;
    if (l.iso639_3) cov.with_iso++;
    if (l.austlang_codes.length) cov.with_austlang++;
    if (hasFamilyChain) cov.with_family_chain++;
    if (grammar.profiled) cov.with_grammar_profile++;
    if (lexicon.state === 'live') cov.lexicon_live++;
    else if (lexicon.state === 'open_resource') cov.lexicon_open_resource++;
    else if (lexicon.state === 'pointer_only') cov.lexicon_pointer_only++;
    else cov.lexicon_none++;
    if (deep_time.dated) cov.dated_tree++;
    if (endangerment.label !== 'unknown') cov.with_endangerment++;
    cov.tier[tier]++;
  }

  // -- Write artifacts ------------------------------------------------------
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT_DIR, 'languages'), { recursive: true });

  // sort records/index deterministically by slug
  records.sort((a, b) => a.slug.localeCompare(b.slug));
  indexRows.sort((a, b) => a.slug.localeCompare(b.slug));
  appendixNodes.sort((a, b) => a.slug.localeCompare(b.slug));
  appendixHistorical.sort((a, b) => a.db_code.localeCompare(b.db_code));
  orphanLog.sort((a, b) => a.id.localeCompare(b.id));

  // per-language sharded detail files
  for (const r of records) {
    fs.writeFileSync(path.join(OUT_DIR, 'languages', `${r.slug}.json`), JSON.stringify(r, null, 2));
  }

  // index.json (lightweight, for map/directory/search)
  fs.writeFileSync(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify({ version: DATA_RELEASE_VERSION, build_stamp: BUILD_STAMP, count: indexRows.length, languages: indexRows }, null, 2),
  );

  // appendix.json (non-language nodes + unmapped historical wordlists)
  fs.writeFileSync(
    path.join(OUT_DIR, 'appendix.json'),
    JSON.stringify(
      {
        version: DATA_RELEASE_VERSION,
        build_stamp: BUILD_STAMP,
        non_language_nodes: { count: appendixNodes.length, note: 'Sign / Bookkeeping / Pidgin / Artificial / Mixed / Unclassifiable registry nodes — NOT counted as genuine Aboriginal/TSI languages.', items: appendixNodes },
        historical_wordlists: { count: appendixHistorical.length, note: 'E. M. Curr 1886-87 OCR locality wordlists not confidently mappable to a Glottolog languoid.', items: appendixHistorical },
      },
      null,
      2,
    ),
  );

  // orphans.json (join diagnostics)
  fs.writeFileSync(
    path.join(OUT_DIR, 'orphans.json'),
    JSON.stringify({ version: DATA_RELEASE_VERSION, build_stamp: BUILD_STAMP, count: orphanLog.length, orphans: orphanLog }, null, 2),
  );

  // coverage report
  const migmaqInIndex = indexRows.some((r) => r.slug.includes('migmaq') || /mi.?g.?maq/i.test(r.name));
  const coverageReport = {
    version: DATA_RELEASE_VERSION,
    build_stamp: BUILD_STAMP,
    universe_registry_languoids: languoids.length,
    non_language_nodes_appendixed: appendixNodes.length,
    genuine_languoids: cov.genuine,
    migmaq_excluded_from_db: migmaqExcluded,
    migmaq_present_in_atlas: migmaqInIndex,
    coordinates: {
      real_glottolog: cov.coords_real_glottolog,
      austlang_approx: cov.coords_austlang,
      derived_centroid: cov.coords_derived_centroid,
      none: cov.coords_none,
      any: cov.genuine - cov.coords_none,
    },
    ids: {
      any_id: cov.with_any_id,
      glottocode: cov.with_glottocode,
      iso639_3: cov.with_iso,
      austlang: cov.with_austlang,
    },
    classification: {
      with_family_chain: cov.with_family_chain,
      unclassified: cov.genuine - cov.with_family_chain,
    },
    grammar_profiled: cov.with_grammar_profile,
    endangerment_known: cov.with_endangerment,
    lexicon: {
      live: cov.lexicon_live,
      open_resource: cov.lexicon_open_resource,
      pointer_only: cov.lexicon_pointer_only,
      none: cov.lexicon_none,
    },
    deep_time_dated: cov.dated_tree,
    tiers: cov.tier,
    db_join: {
      db_languages_total: dbLanguages.length,
      db_live_mapped: dbLiveMapped,
      curr_mapped_to_languoid: currMappedToLanguoid,
      curr_unmapped_appendix: currUnmapped,
      orphans: orphanLog.length,
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'coverage-report.json'), JSON.stringify(coverageReport, null, 2));

  // manifest.json (data-release + source versions/licenses + coverage summary)
  const manifest = {
    name: 'Atlas of Australian Languages — data release',
    data_release_version: DATA_RELEASE_VERSION,
    build_stamp: BUILD_STAMP,
    generator: 'apps/web/scripts/atlas/build-data.ts',
    canonical_universe: 'australian_languages_registry.json (1,029 languoids)',
    artifacts: {
      index: 'index.json',
      per_language_detail: 'languages/<slug>.json',
      appendix: 'appendix.json',
      orphans: 'orphans.json',
      coverage_report: 'coverage-report.json',
    },
    source_datasets: [
      { name: 'Glottolog', version: '5.3 CLDF', license: 'CC-BY-4.0', role: 'classification, coordinates, ISO/glottocode, AES endangerment' },
      { name: 'Grambank', version: 'v1.0.3 CLDF', license: 'CC-BY-4.0', role: 'grammatical feature profiles (195 features)' },
      { name: 'WALS', version: '2020.4 CLDF', license: 'CC-BY-4.0', role: 'supplementary grammatical features' },
      { name: 'AIATSIS AUSTLANG', version: 'data.gov.au export', license: 'CC-BY-4.0', role: 'canonical AU language codes, approx. coordinates, alt-names' },
      { name: 'Bouckaert, Bowern & Atkinson 2018 (Phlorest)', version: 'phlorest CLDF', license: 'CC-BY-4.0', role: 'dated Pama-Nyungan phylogeographic tree (deep_time)' },
      { name: 'PHOIBLE', version: 'referenced', license: 'CC-BY-SA-3.0', role: 'phonological inventories (pointer; not ingested in P0)' },
      { name: 'E. M. Curr, The Australian Race (1886-87)', version: 'archive.org OCR', license: 'Public Domain', role: 'historical locality wordlists (live DB curr_* + appendix)' },
      { name: 'English Wiktionary', version: 'kaikki.org export', license: 'CC-BY-SA-4.0', role: 'open lexical resources for some languoids' },
      { name: 'mobtranslate-pg (live DB)', version: `read-only snapshot @ ${BUILD_STAMP}`, license: 'mixed (see per-source)', role: 'live lexical word-counts' },
    ],
    coverage_summary: coverageReport,
    caveats: [
      'A spreading language lineage is NOT a moving/arriving population. Bouckaert root age ~5,578 BP dates the Pama-Nyungan LINGUISTIC spread across an already long-populated continent (~65,000 yr of presence).',
      'state/jurisdiction is null for all languoids: not present in the open Glottolog/AUSTLANG exports.',
      'Autonyms are UNVERIFIED candidates drawn from alt-names (which conflate endonyms with spelling variants); never asserted as confirmed.',
      'Derived-centroid coordinates are a drawing convenience (mean of sibling-leaf coords), not a claim about where a language is spoken; flagged approximate + provenance=derived_centroid.',
      'Curr 1886-87 OCR wordlists are historical sources, not modern language identities.',
    ],
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // -- Report to stdout -----------------------------------------------------
  log('----------------------------------------------------------------');
  log('COVERAGE REPORT');
  log(`  universe registry languoids      : ${languoids.length}`);
  log(`  non-language nodes (appendix)     : ${appendixNodes.length}`);
  log(`  GENUINE languoids in atlas        : ${cov.genuine}`);
  log(`  Mi'gmaq excluded from DB          : ${migmaqExcluded}   present_in_atlas=${migmaqInIndex}`);
  log(`  coords: glottolog=${cov.coords_real_glottolog} austlang=${cov.coords_austlang} derived=${cov.coords_derived_centroid} none=${cov.coords_none}`);
  log(`  ids: any=${cov.with_any_id} glotto=${cov.with_glottocode} iso=${cov.with_iso} austlang=${cov.with_austlang}`);
  log(`  family_chain=${cov.with_family_chain}  unclassified=${cov.genuine - cov.with_family_chain}`);
  log(`  grammar_profiled=${cov.with_grammar_profile}  endangerment_known=${cov.with_endangerment}`);
  log(`  lexicon: live=${cov.lexicon_live} open=${cov.lexicon_open_resource} pointer=${cov.lexicon_pointer_only} none=${cov.lexicon_none}`);
  log(`  deep_time dated=${cov.dated_tree}`);
  log(`  tiers: ${JSON.stringify(cov.tier)}`);
  log(`  DB join: live_mapped=${dbLiveMapped} curr_mapped=${currMappedToLanguoid} curr_unmapped=${currUnmapped} orphans=${orphanLog.length}`);
  log('----------------------------------------------------------------');

  if (migmaqInIndex) {
    console.error('[atlas] FATAL: Mi\'gmaq leaked into the Australian atlas index. Aborting.');
    process.exit(1);
  }
  log(`wrote ${records.length} language records + index/appendix/orphans/manifest to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[atlas] build failed:', err);
  process.exit(1);
});

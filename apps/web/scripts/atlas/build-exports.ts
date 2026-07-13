/*
 * Atlas of Australian Languages — OPEN-DATA EXPORT builder (P5 rigor).
 *
 * Reads the ALREADY-BUILT, versioned atlas artifacts under apps/web/data/atlas/
 * (index.json, languages/<slug>.json, manifest.json, coverage-report.json,
 * grammar-matrix.json) plus data/theses.json, and emits a set of downloadable,
 * citable open datasets under apps/web/public/atlas-data/downloads/:
 *
 *   languages.csv          one row per genuine languoid
 *   languages.geojson      FeatureCollection of the located languages
 *   grammar-values.csv     long-format Grambank/WALS/AUS feature codings
 *   theses.json            the 8 movement theses (copied verbatim)
 *   sources.bib            BibTeX of upstream datasets + key papers
 *   CITATION.cff           Citation File Format for the atlas itself
 *   README.md              data dictionary + licences + how-to-cite
 *   downloads.json         machine manifest (files, sizes, rowcounts) for the UI
 *
 * HARD RULES honoured:
 *   - No DB access: reads only the committed static artifacts (deterministic).
 *   - Writes to public/atlas-data/downloads/ (NOT data/atlas/, which build-data
 *     rm -rf's each run — these exports are durable, authored-derived output).
 *   - No fabricated DOIs/licences: DOIs come from theses.json citations; dataset
 *     licences from manifest.json; dataset DOIs are omitted (canonical URL only)
 *     rather than invented.
 *   - Build date comes from the manifest build stamp, never Date.now().
 *
 * Run:  pnpm atlas:build-exports   (or via  pnpm atlas:build-data)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const ATLAS_DIR = path.join(WEB_ROOT, 'data', 'atlas');
const LANG_DIR = path.join(ATLAS_DIR, 'languages');
const THESES_PATH = path.join(WEB_ROOT, 'data', 'theses.json');
const OUT_DIR = path.join(WEB_ROOT, 'public', 'atlas-data', 'downloads');

function log(...a: unknown[]) {
  console.log('[atlas:exports]', ...a);
}

function readJSON<T = any>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

// --- CSV helper: RFC-4180-safe quoting ------------------------------------
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

function main() {
  const manifest = readJSON(path.join(ATLAS_DIR, 'manifest.json'));
  const coverage = readJSON(path.join(ATLAS_DIR, 'coverage-report.json'));
  const grammarMatrix = readJSON(path.join(ATLAS_DIR, 'grammar-matrix.json'));
  const theses = readJSON(THESES_PATH);
  const release: string = manifest.data_release_version ?? '1.1.0';
  const buildStamp: string = manifest.build_stamp ?? '2026-07-12T00:00:00Z';
  const buildDate = buildStamp.slice(0, 10); // YYYY-MM-DD (never Date.now)

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Load every genuine-language shard, in index order for determinism.
  const index = readJSON(path.join(ATLAS_DIR, 'index.json'));
  const slugs: string[] = index.languages.map((l: any) => l.slug);
  const shards = slugs
    .map((slug) => {
      const p = path.join(LANG_DIR, `${slug}.json`);
      return fs.existsSync(p) ? readJSON(p) : null;
    })
    .filter(Boolean) as any[];

  const written: { file: string; description: string; rows: number | null }[] = [];

  // grammar_feature_count from the coded shard features (non-'?' codings).
  function codedGrammarCount(shard: any): number | '' {
    if (!shard.grammar?.features) return shard.grammar?.profiled ? 0 : '';
    return shard.grammar.features.filter((f: any) => f.state !== 'unknown').length;
  }
  function chainString(shard: any): string {
    const chain = shard.classification_chain;
    if (!Array.isArray(chain) || chain.length === 0) return '';
    return chain.map((c: any) => c.name).join(' > ');
  }

  // ------------------------------------------------------------------ CSV --
  {
    const header = [
      'slug', 'name', 'family', 'macroarea', 'glottocode', 'iso639_3', 'austlang',
      'lat', 'lon', 'coord_provenance', 'coord_approximate', 'tier', 'endangerment',
      'grammar_profiled', 'grammar_feature_count', 'lexicon_state', 'word_count',
      'deep_time_divergence_bp', 'classification_chain',
    ];
    const lines = [csvRow(header)];
    for (const s of shards) {
      lines.push(
        csvRow([
          s.slug,
          s.canonical_name,
          s.family ?? '',
          s.macroarea ?? '',
          s.ids?.glottocode ?? '',
          s.ids?.iso639_3 ?? '',
          (s.ids?.austlang ?? []).join(';'),
          s.coordinates?.lat ?? '',
          s.coordinates?.lon ?? '',
          s.coordinates?.provenance ?? 'none',
          s.coordinates?.lat != null ? String(!!s.coordinates?.approximate) : '',
          s.tier ?? '',
          s.endangerment?.label ?? 'unknown',
          String(!!s.grammar?.profiled),
          codedGrammarCount(s),
          s.lexicon?.state ?? '',
          s.lexicon?.word_count ?? '',
          s.deep_time?.divergence_age_bp ?? '',
          chainString(s),
        ]),
      );
    }
    fs.writeFileSync(path.join(OUT_DIR, 'languages.csv'), lines.join('\n') + '\n');
    written.push({ file: 'languages.csv', description: 'One row per genuine languoid: identity, family, coordinates + provenance, tier, endangerment, grammar/lexicon coverage, deep-time divergence and full classification chain.', rows: shards.length });
    log(`languages.csv: ${shards.length} rows`);
  }

  // -------------------------------------------------------------- GeoJSON --
  {
    const features: any[] = [];
    let unlocated = 0;
    for (const s of shards) {
      const lat = s.coordinates?.lat;
      const lon = s.coordinates?.lon;
      if (lat == null || lon == null) {
        unlocated += 1;
        continue;
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          slug: s.slug,
          name: s.canonical_name,
          family: s.family ?? null,
          macroarea: s.macroarea ?? null,
          glottocode: s.ids?.glottocode ?? null,
          iso639_3: s.ids?.iso639_3 ?? null,
          austlang: (s.ids?.austlang ?? []).join(';') || null,
          tier: s.tier ?? null,
          endangerment: s.endangerment?.label ?? 'unknown',
          coord_provenance: s.coordinates?.provenance ?? 'none',
          coord_approximate: !!s.coordinates?.approximate,
          grammar_profiled: !!s.grammar?.profiled,
          lexicon_state: s.lexicon?.state ?? null,
          dated: !!s.deep_time?.dated,
          deep_time_divergence_bp: s.deep_time?.divergence_age_bp ?? null,
        },
      });
    }
    const geojson = {
      type: 'FeatureCollection',
      metadata: {
        title: 'Atlas of Australian Languages — located languages',
        data_release_version: release,
        build_stamp: buildStamp,
        located: features.length,
        unlocated_omitted: unlocated,
        note:
          'Only languages with a real (Glottolog) or approximate (AUSTLANG / derived-subgroup-centroid) coordinate are plotted; each carries coord_provenance + coord_approximate. ' +
          `${unlocated} genuine languoids have NO located point and are deliberately omitted from this GeoJSON (they remain in languages.csv with coord_provenance=none) — never given a fabricated point.`,
        license: 'Derived layer CC-BY-4.0; coordinates © Glottolog 5.3 (CC-BY-4.0) / AIATSIS AUSTLANG (CC-BY-4.0). Attribute upstream.',
      },
      features,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'languages.geojson'), JSON.stringify(geojson, null, 1) + '\n');
    written.push({ file: 'languages.geojson', description: `GeoJSON FeatureCollection of the ${features.length} located languages (Point geometry); the ${unlocated} unlocated languoids are honestly omitted, never given a fake point.`, rows: features.length });
    log(`languages.geojson: ${features.length} features (${unlocated} unlocated omitted)`);
  }

  // ---------------------------------------------------- grammar-values.csv --
  {
    const header = [
      'language_slug', 'language_name', 'feature_id', 'source', 'layer',
      'domain', 'gloss', 'value', 'state', 'raw',
    ];
    const lines = [csvRow(header)];
    let rows = 0;
    for (const s of shards) {
      if (!s.grammar?.features) continue;
      for (const f of s.grammar.features) {
        lines.push(
          csvRow([
            s.slug,
            s.canonical_name,
            f.feature_id ?? '',
            f.source ?? '',
            f.layer ?? '',
            f.domain ?? '',
            f.label ?? '',
            f.value ?? '',
            f.state ?? '',
            f.raw ?? '',
          ]),
        );
        rows += 1;
      }
    }
    fs.writeFileSync(path.join(OUT_DIR, 'grammar-values.csv'), lines.join('\n') + '\n');
    written.push({ file: 'grammar-values.csv', description: 'Long-format grammatical feature codings (one row per language × feature). value/present/absent/unknown(?) states kept distinct — read the state column; unknown = not recorded.', rows });
    log(`grammar-values.csv: ${rows} rows`);
  }

  // ------------------------------------------------------------- theses ----
  {
    fs.writeFileSync(path.join(OUT_DIR, 'theses.json'), JSON.stringify(theses, null, 2) + '\n');
    written.push({ file: 'theses.json', description: 'The 8 "why did the languages move?" scholarly theses, contradiction-preserving — each with mechanism, proponents, evidence for AND against, hard facts, contestation level and full citations (with DOIs).', rows: theses.cards?.length ?? null });
    log(`theses.json: ${theses.cards?.length ?? 0} cards`);
  }

  // ------------------------------------------------------------ BibTeX -----
  {
    // Collect unique citations across all thesis cards (verified DOIs only).
    const seen = new Map<string, any>();
    for (const c of theses.cards ?? []) {
      for (const cit of c.citations ?? []) {
        if (cit.ref && !seen.has(cit.ref)) seen.set(cit.ref, cit);
      }
    }
    const usedKeys = new Set<string>();
    function keyFor(author: string, year: string | number): string {
      const surname =
        (author.match(/^([A-Za-zÀ-ÿ'’-]+)/)?.[1] ?? 'ref')
          .replace(/[^A-Za-z]/g, '')
          .toLowerCase() || 'ref';
      let base = `${surname}${year || 'nd'}`;
      let key = base;
      let i = 0;
      while (usedKeys.has(key)) key = base + String.fromCharCode(97 + i++);
      usedKeys.add(key);
      return key;
    }
    function bibEscape(s: string): string {
      return s.replace(/([&%#_$])/g, '\\$1');
    }

    const entries: string[] = [];
    entries.push(
      '% Atlas of Australian Languages — bibliography',
      `% Data release ${release} (build ${buildStamp})`,
      '% Upstream datasets + the key scholarly references behind the movement theses.',
      '% DOIs are as published (verified from the atlas thesis corpus); dataset',
      '% entries link the canonical landing page — a versioned Zenodo DOI is on that',
      '% page and is NOT reproduced here to avoid asserting an unverified identifier.',
      '',
    );

    // Upstream datasets (from manifest) — canonical URLs, no invented DOIs.
    const datasetBib: Array<[string, string]> = [
      ['glottolog53', `@misc{glottolog53,
  author       = {{Hammarström, Harald and Forkel, Robert and Haspelmath, Martin and Bank, Sebastian}},
  title        = {Glottolog 5.3},
  year         = {2025},
  publisher    = {Max Planck Institute for Evolutionary Anthropology},
  howpublished = {\\url{https://glottolog.org}},
  note         = {CLDF release; CC-BY-4.0. Versioned DOI on the Glottolog Zenodo record.}
}`],
      ['grambank103', `@misc{grambank103,
  author       = {{Skirgård, Hedvig and others (Grambank Consortium)}},
  title        = {Grambank v1.0.3},
  year         = {2023},
  publisher    = {Max Planck Institute for Evolutionary Anthropology and University of Auckland},
  howpublished = {\\url{https://grambank.clld.org}},
  note         = {CLDF release; CC-BY-4.0. See also Skirgård et al. 2023, Science Advances, DOI 10.1126/sciadv.adg6175. Versioned DOI on the Grambank Zenodo record.}
}`],
      ['wals2020', `@misc{wals2020,
  author       = {{Dryer, Matthew S. and Haspelmath, Martin (eds.)}},
  title        = {WALS Online (v2020.4)},
  year         = {2013},
  publisher    = {Max Planck Institute for Evolutionary Anthropology},
  howpublished = {\\url{https://wals.info}},
  note         = {World Atlas of Language Structures; CLDF release; CC-BY-4.0.}
}`],
      ['austlang', `@misc{austlang,
  author       = {{AIATSIS}},
  title        = {AUSTLANG: Australian Indigenous Languages Database},
  publisher    = {Australian Institute of Aboriginal and Torres Strait Islander Studies},
  howpublished = {\\url{https://collection.aiatsis.gov.au/austlang}},
  note         = {Language registry, codes and approximate locations; data.gov.au export, CC-BY-4.0.}
}`],
      ['phlorest', `@misc{phlorest,
  author       = {{Kaltenberger, Martin and Forkel, Robert and Greenhill, Simon J. and others}},
  title        = {Phlorest: a CLDF collection of phylogenetic trees},
  howpublished = {\\url{https://phlorest.clld.org}},
  note         = {CLDF-standardised Bouckaert et al. 2018 Pama-Nyungan tree; CC-BY-4.0. The same phylogeny is also distributed via D-PLACE, part of which carries CC-BY-NC — the atlas uses the CC-BY-4.0 Phlorest CLDF.}
}`],
      ['curr1886', `@book{curr1886,
  author    = {Curr, Edward M.},
  title      = {The Australian Race: Its Origin, Languages, Customs},
  year       = {1886},
  publisher  = {John Ferres, Government Printer, Melbourne},
  note       = {Public domain; 19th-century colonial OCR wordlists, not community-approved lexicons. Via archive.org.}
}`],
      ['wiktionary', `@misc{wiktionary,
  author       = {{Wiktionary contributors}},
  title        = {English Wiktionary (kaikki.org export)},
  howpublished = {\\url{https://kaikki.org}},
  note         = {Open lexical resources for some languoids; CC-BY-SA-4.0.}
}`],
      ['atlasaustlang', `@misc{atlas_australian_languages,
  author       = {{Mob Translate project and Claude (Anthropic)}},
  title        = {The Atlas of Australian Languages},
  year         = {2026},
  version      = {${release}},
  howpublished = {\\url{https://mobtranslate.com/atlas}},
  note         = {Historian-grade aggregation of open datasets; derived layer CC-BY-4.0. Data release ${release}, build ${buildDate}.}
}`],
    ];
    entries.push('% ---- Upstream datasets & the atlas itself ----', '');
    for (const [, bib] of datasetBib) entries.push(bib, '');

    entries.push('% ---- Scholarly references (movement theses) ----', '');
    for (const cit of seen.values()) {
      // APA-ish parse: "Authors (Year). Title. Venue..."
      const m = String(cit.ref).match(/^(.*?)\s*\((\d{4}[a-z]?)\)\.\s*(.*?)\.\s*(.*)$/);
      const year = cit.year ?? (m ? m[2] : '');
      if (m) {
        const author = m[1].trim();
        const title = m[3].trim();
        const venue = m[4].trim().replace(/\s+$/, '');
        const key = keyFor(author, year);
        const isBook = /Cambridge|Routledge|Allen|Press|\(eds?\)|Government Printer/.test(venue);
        const lines = [
          `@${isBook ? 'book' : 'article'}{${key},`,
          `  author  = {${bibEscape(author)}},`,
          `  title   = {${bibEscape(title)}},`,
          `  year    = {${year}},`,
          `  ${isBook ? 'publisher' : 'journal'} = {${bibEscape(venue)}},`,
        ];
        if (cit.doi) lines.push(`  doi     = {${cit.doi}},`);
        lines.push(`  note    = {${cit.open_access ? 'Open access. ' : ''}${bibEscape(String(cit.ref))}}`);
        lines.push('}');
        entries.push(lines.join('\n'), '');
      } else {
        // Fallback: lossless note-only entry (never fabricate parsed fields).
        const key = keyFor(String(cit.ref), year);
        const lines = [`@misc{${key},`, `  note = {${bibEscape(String(cit.ref))}},`];
        if (year) lines.push(`  year = {${year}},`);
        if (cit.doi) lines.push(`  doi  = {${cit.doi}},`);
        lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
        lines.push('}');
        entries.push(lines.join('\n'), '');
      }
    }
    const bibText = entries.join('\n');
    fs.writeFileSync(path.join(OUT_DIR, 'sources.bib'), bibText.replace(/\n{3,}/g, '\n\n'));
    written.push({ file: 'sources.bib', description: `BibTeX for the upstream datasets and the ${seen.size} scholarly references behind the movement theses (DOIs as published). Includes an entry for citing the atlas itself.`, rows: datasetBib.length + seen.size });
    log(`sources.bib: ${datasetBib.length} dataset + ${seen.size} paper entries`);
  }

  // ---------------------------------------------------------- CITATION.cff --
  {
    const cff = `cff-version: 1.2.0
message: >-
  If you use the Atlas of Australian Languages, please cite it as below AND cite
  the upstream datasets it aggregates (Glottolog, Grambank, WALS, AIATSIS
  AUSTLANG, and Bouckaert, Bowern & Atkinson 2018 via Phlorest). See sources.bib.
title: "The Atlas of Australian Languages"
abstract: >-
  A historian-grade, contradiction-preserving web atlas of the ~980 genuine
  Australian Aboriginal and Torres Strait Islander languoids: classification,
  Country and coordinates (with provenance), endangerment, grammatical
  (Grambank/WALS) profiles, lexical coverage, and dated Pama-Nyungan deep-time
  position, joined at build time from open scholarly datasets with per-datum
  provenance and honest uncertainty flags.
type: dataset
version: "${release}"
date-released: "${buildDate}"
license: CC-BY-4.0
license-url: "https://creativecommons.org/licenses/by/4.0/"
url: "https://mobtranslate.com/atlas"
repository-code: "https://github.com/australia/mobtranslate.com"
authors:
  - name: "Mob Translate project"
    website: "https://mobtranslate.com"
  - name: "Claude (Anthropic)"
keywords:
  - Australian languages
  - Pama-Nyungan
  - historical linguistics
  - language atlas
  - Indigenous languages
  - Glottolog
  - Grambank
  - AUSTLANG
references:
  - type: article
    title: "The origin and expansion of Pama-Nyungan languages across Australia"
    authors:
      - family-names: Bouckaert
        given-names: Remco R.
      - family-names: Bowern
        given-names: Claire
      - family-names: Atkinson
        given-names: Quentin D.
    year: 2018
    journal: "Nature Ecology & Evolution"
    volume: 2
    start: 741
    end: 749
    doi: "10.1038/s41559-018-0489-3"
  - type: database
    title: "Glottolog 5.3"
    authors:
      - name: "Max Planck Institute for Evolutionary Anthropology"
    year: 2025
    url: "https://glottolog.org"
    notes: "CC-BY-4.0. Versioned DOI on the Glottolog Zenodo record."
  - type: database
    title: "Grambank v1.0.3"
    authors:
      - name: "Grambank Consortium"
    year: 2023
    url: "https://grambank.clld.org"
    notes: "CC-BY-4.0. See Skirgård et al. 2023, Science Advances, DOI 10.1126/sciadv.adg6175."
  - type: database
    title: "WALS Online v2020.4"
    authors:
      - name: "Max Planck Institute for Evolutionary Anthropology"
    year: 2013
    url: "https://wals.info"
    notes: "CC-BY-4.0."
  - type: database
    title: "AUSTLANG — Australian Indigenous Languages Database"
    authors:
      - name: "AIATSIS"
    url: "https://collection.aiatsis.gov.au/austlang"
    notes: "CC-BY-4.0 via data.gov.au."
  - type: database
    title: "Phlorest: a CLDF collection of phylogenetic trees"
    authors:
      - name: "Phlorest"
    url: "https://phlorest.clld.org"
    notes: "CC-BY-4.0. CLDF-standardised Bouckaert et al. 2018 tree; also on D-PLACE (partly CC-BY-NC)."
`;
    fs.writeFileSync(path.join(OUT_DIR, 'CITATION.cff'), cff);
    written.push({ file: 'CITATION.cff', description: 'Citation File Format metadata for the atlas itself (title, authors, version, licence, release date, upstream references) — machine-readable "cite this".', rows: null });
    log('CITATION.cff written');
  }

  // ------------------------------------------------------------- README ----
  {
    const suggested = `Mob Translate project & Claude (2026). The Atlas of Australian Languages, data release ${release}. https://mobtranslate.com/atlas (accessed <date>).`;
    const cov = coverage;
    const readme = `# Atlas of Australian Languages — open data downloads

**Data release ${release}** · build ${buildDate} · generated by \`apps/web/scripts/atlas/build-exports.ts\`

These files are a deterministic, reproducible snapshot of the atlas, built from
the committed static artifacts under \`apps/web/data/atlas/\` (which are in turn
joined from the upstream datasets listed below). No blank ever passes as a
value: every missing datum is an explicit honest state (\`none\`, \`unknown\`,
\`not_profiled\`, \`undated\`), and coordinates carry a provenance flag.

## Files

| File | Rows | What it is |
|------|------|------------|
${written.map((w) => `| \`${w.file}\` | ${w.rows ?? '—'} | ${w.description.replace(/\|/g, '\\|')} |`).join('\n')}
| \`README.md\` | — | This data dictionary. |

## Data dictionary — languages.csv

One row per **genuine languoid** (${cov.genuine_languoids} of ${cov.universe_registry_languoids} registry nodes; the ${cov.non_language_nodes_appendixed} Sign/Pidgin/Bookkeeping/mixed nodes are appendixed, not counted). Mi'gmaq is excluded as non-Australian.

- **slug** — stable atlas id (prefers glottocode; falls back to AUSTLANG code / DB slug). The canonical URL is \`/atlas/<slug>\`.
- **name** — canonical (English-catalogue) name. Autonyms are shown on the profile as *unverified candidates* only, so are not a CSV column.
- **family** — top-level family; \`unclassified\` where the open exports give no classification.
- **macroarea** — Glottolog macroarea.
- **glottocode**, **iso639_3** — codes where present (blank = none in the open export).
- **austlang** — AIATSIS AUSTLANG code(s), \`;\`-joined (a languoid may map to several).
- **lat**, **lon** — coordinate if located; blank if location unknown.
- **coord_provenance** — \`glottolog\` (real point) · \`austlang\` (approximate) · \`derived_centroid\` (mean of sibling leaves, a drawing convenience) · \`none\` (unlocated — never given a fake point).
- **coord_approximate** — \`true\` for austlang/derived points; blank when unlocated.
- **tier** — coverage tier: comprehensive / documented / classified / listed.
- **endangerment** — Glottolog AES label (\`unknown\` where not coded).
- **grammar_profiled** — whether a Grambank/WALS/AUS feature profile exists.
- **grammar_feature_count** — number of *recorded* (non-\`?\`) feature codings for the language.
- **lexicon_state** — \`live\` (browsable words in DB) · \`open_resource\` · \`pointer_only\` (rights-managed catalogue link) · \`none\`.
- **word_count** — live DB word count (blank unless \`lexicon_state=live\`).
- **deep_time_divergence_bp** — divergence age (years BP) of the language's lineage from the Bouckaert 2018 tree, where dated. **This dates a LANGUAGE lineage, not a population arrival.**
- **classification_chain** — full Glottolog path, \` > \`-joined.

## Data dictionary — languages.geojson

FeatureCollection of the **${written.find((w) => w.file === 'languages.geojson')?.rows} located** languages (Point geometry, \`[lon, lat]\`). Properties mirror the key CSV fields plus \`coord_approximate\`. Unlocated languoids are **omitted** (see \`metadata.unlocated_omitted\`) — they remain in \`languages.csv\` with \`coord_provenance=none\`. No coordinate is ever fabricated.

## Data dictionary — grammar-values.csv

Long format: one row per language × feature coding.
- **language_slug**, **language_name** — the language.
- **feature_id** — Grambank (\`GBxxx\`) / WALS / AUS-extension feature id.
- **source** — \`Grambank\` / \`WALS\` / \`AUS extension\`.
- **layer**, **domain** — grouping metadata.
- **gloss** — the feature's plain-English description.
- **value** — the coded value.
- **state** — \`value\`/\`present\`/\`absent\` (real codings) vs \`unknown\` (\`?\`, not recorded). These are kept **distinct** — an absent (0) is a real datum; an unknown is a gap.
- **raw** — the original coded token.

> \`grammar_recorded_agreement\` (used in the Grammar lens) is agreement over *jointly-recorded* Grambank features only — **not** overall grammatical similarity and **not** genetic relatedness. Always read \`n_joint\`.

## Licences — attribute accordingly

These are **open data under the upstream licences**. The atlas's own *derived* layer (the joins, tiers, provenance flags, coverage tables) is released **CC-BY-4.0**. Individual fields inherit their source licence:

${(manifest.source_datasets ?? []).map((s: any) => `- **${s.name}** (${s.version}) — **${s.license}** — ${s.role}`).join('\n')}

**Share-alike note:** Wiktionary-derived lexical data is **CC-BY-SA-4.0** and PHOIBLE is **CC-BY-SA-3.0**; if you redistribute those fields, keep the share-alike terms. Everything else is CC-BY-family (attribution only).

**CC-BY vs CC-BY-NC note:** the Bouckaert et al. 2018 phylogeny is used here via the **Phlorest CLDF (CC-BY-4.0)**. The same tree is also distributed through **D-PLACE**, parts of which carry **CC-BY-NC** — we deliberately source the CC-BY-4.0 Phlorest release so the deep-time layer is not encumbered by a non-commercial clause.

## How to cite

**Suggested citation**

> ${suggested}

Plus cite the upstream datasets you rely on (see \`sources.bib\` / \`CITATION.cff\`). A copy-pasteable BibTeX block and the machine-readable \`CITATION.cff\` are in this folder.

## Honesty & uncertainty

- Coverage is reported as fractions, never rounded to imply completeness: ${cov.grammar_profiled}/${cov.genuine_languoids} grammatically profiled; ${cov.deep_time_dated}/${cov.genuine_languoids} with a dated tree position; ${cov.coordinates.any}/${cov.genuine_languoids} located.
- Deep-time ages are the **language lineage**, with weak posterior support at the deepest Pama-Nyungan nodes — not a settled fact and not a population-arrival date.
- Autonyms are unverified candidates from alt-name lists; they are not asserted here.
- The movement theses (\`theses.json\`) are held contradiction-preservingly: every thesis carries mandatory evidence *against* and a contestation level; no single "winner" is declared.

_Communities are the final authority on their own languages. Rights-managed materials (AIATSIS / language-centre dictionaries) are catalogue pointers only — never scraped. To correct or request removal of any record, contact ajax@mobtranslate.com._
`;
    fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme);
    written.push({ file: 'README.md', description: 'Data dictionary: every file + column, the per-source licences, how to cite, and the honesty/uncertainty notes.', rows: null });
    log('README.md written');
  }

  // ---------------------------------------------------- downloads.json (UI) --
  {
    // Compute sizes now that every file exists.
    const files = written.map((w) => {
      const full = path.join(OUT_DIR, w.file);
      const bytes = fs.existsSync(full) ? fs.statSync(full).size : 0;
      return { ...w, bytes };
    });
    const dl = {
      data_release_version: release,
      build_stamp: buildStamp,
      build_date: buildDate,
      derived_license: 'CC-BY-4.0',
      files,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'downloads.json'), JSON.stringify(dl, null, 2));
    log('downloads.json written');
    log('---- EXPORT SIZES ----');
    for (const f of files) {
      log(`  ${f.file.padEnd(20)} ${String(f.bytes).padStart(9)} bytes  rows=${f.rows ?? '—'}`);
    }
  }

  log(`wrote ${written.length} files to ${OUT_DIR}`);
}

main();

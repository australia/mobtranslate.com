# tools/australian-languages

Generator for the **master registry of Australian Aboriginal & Torres Strait Islander languoids** —
joins AIATSIS **AUSTLANG code ↔ Glottocode ↔ ISO 639-3** and enriches with family/subgroup chain,
coordinates, endangerment status (Glottolog AES), and Grambank / WALS typology coverage.

## `build_registry.py`

Pure Python stdlib, deterministic, idempotent. Reads four **CC-BY-4.0** open datasets and writes the
registry JSON/CSV + stats. It does **not** fetch anything — point it at a data dir that already holds
the downloaded CLDF/AUSTLANG files.

```bash
python3 build_registry.py --data-dir <DIR> [--out-dir <DIR>/registry]
```

`<DIR>` must contain:
```
glottolog/cldf/{languages,values,names}.csv     # Glottolog 5.3 CLDF (CC-BY-4.0)
grambank/cldf/{languages,values}.csv            # Grambank v1.0.3 CLDF (CC-BY-4.0)
wals/cldf/{languages,values}.csv                # WALS Online CLDF (CC-BY-4.0)
austlang/austlang_dataset.csv                   # AIATSIS AUSTLANG via data.gov.au (CC-BY-4.0)
```

Outputs: `australian_languages_registry.{json,csv}`, `austlang_unmapped.json`, `registry_stats.json`.

**Canonical data + downloads + full source/license provenance (sha256 per artifact):**
`/mnt/donto-data/donto-resources/research/australian-languages/` (`SOURCES.md`, `README.md`).
The registry data lives on the research mount (per the research-on-mount rule), not in this repo;
this directory holds only the reproducible generator.

### Join method
Glottolog CLDF does not carry the AIATSIS alphanumeric code, so AUSTLANG↔Glottocode is joined on the
datasets' own shared name strings (Glottolog ingested AIATSIS name-variants into `names.csv`), scored
with a confidence band + a haversine distance gate. See the module docstring and the research README
for details. Every mapping is auditable per row (`austlang_matches`); unmapped codes are never dropped.

---

# The typology layer (Task C — the grammatical-knowledge layer)

A **layered** grammatical-knowledge model over the registry. Grambank's 195 variables are treated
as a **standardized cross-linguistic BASELINE, not an exhaustive grammar** — finer detail lives in
higher layers. All inputs are the same four **CC-BY-4.0** open datasets; every output is a derivative
work carrying that attribution.

## Pipeline (run in order; each is pure-stdlib, deterministic, idempotent)

```bash
python3 build_layer1.py          # L1 Grambank baseline: features-catalog + language-features-matrix
                                 #    (+ WALS supplement, provenance-tagged, NEVER merged)
python3 build_layer2.py          # L2 Australia extension catalog (~50 AUX features; coded where derivable)
python3 build_layer3.py          # L3 construction records (Kuku Yalanji seed, ~75, from the grammar cheatsheet)
python3 build_layer4.py          # L4 derived features: derive Grambank-comparable values from L3, compare to kuku1273
python3 build_similarity.py      # grambank_recorded_agreement (jointly-coded only, n_joint>=30) + k-medoids clusters
python3 build_public_snapshot.py # committed static snapshot -> apps/web/public/typology/ (powers /languages/[code])
python3 import_typology.py       # idempotent load into mobtranslate-pg (typology_* tables)
```

Outputs land in `<research-mount>/typology/` (data, per the research-on-mount rule) and, for the web
endpoint, in `apps/web/public/typology/` (committed snapshot).

## The four layers

- **L1 — Grambank baseline.** `features-catalog.json` = 195 features, each with the official name, an
  **authored plain-English gloss (all 195)**, value space, and Grambank's own published feature-group
  memberships. `language-features-matrix.json` = 144 AU languoids × 195; values kept verbatim with a
  status that keeps **`coded` / `unknown` (`?`) / `not_applicable` (`N/A`) / `not_recorded`** strictly
  distinct (unknown is never conflated with absent). WALS is a **separate, provenance-tagged supplement**
  (`wals-supplement-*.json`), never silently merged.
- **L2 — Australia extension.** `aus-extension-catalog.json` = 53 finer Australianist variables
  (split-ergativity conditioning, bound-pronoun host, case on nouns vs pronouns, dual/paucal/trial,
  comitative/instrumental syncretism, associated motion, avoidance register, kinship dyads,
  initial-dropping, ignorative syncretism, …). Values are coded **only where derivable** from WALS +
  Grambank + Glottolog; coverage is honestly **low** (this is infrastructure for future grammar-mining).
- **L3 — construction records.** `constructions.json` = the primary descriptive-data layer. Seeded with
  ~75 Kuku Yalanji records transcribed from the program's KY mega grammar cheat-sheet (a cited study of
  Patz 1982), preserving the § citations. `community_terminology` is left null pending consultation.
- **L4 — derived features.** `derived-features.json` derives Grambank-comparable values bottom-up from
  the L3 records and compares them to Grambank's own coding of `kuku1273` (14/15 agree; the one
  disagreement, numeral-noun order, is an honest artifact of a compressed seed).

## Similarity — `grambank_recorded_agreement`

Pairwise agreement over **jointly-coded** Grambank features only (`?`/`N/A`/`not_recorded` excluded from
numerator and denominator; `n_joint >= 30`). Per-domain sub-scores use Grambank's own published
feature-group columns (each with its own `n_joint`). Top-10 neighbours per language + k-medoids
clustering (k chosen by silhouette in 8..12) with a cluster-vs-genealogical-subgroup Rand-index stat.
The metric is **never** called "grammatical similarity" — it is agreement over recorded codings only.

## Storage decision

The app's dictionary/language data flows through **mobtranslate-pg** (Drizzle) — so the queryable/
joinable store is **DB tables** (`typology_languages`, `typology_features`, `typology_language_features`,
`typology_constructions`, `typology_similarity`, `typology_clusters`; migration
`apps/web/supabase/migrations/20260712000000_create_typology_layer.sql`, loaded idempotently by
`import_typology.py`). The **`/languages/[code]` endpoint** reads a committed **static snapshot**
(`apps/web/public/typology/`, `lib/typology.ts`) — this avoids request-time DB coupling and avoids
editing the shared Drizzle `schema.ts`. Both sinks derive from the same research-mount artifacts.

## Licensing

Every Grambank/WALS/Glottolog/AUSTLANG value is CC-BY-4.0; all derived artifacts inherit that
attribution (recorded in `SOURCES.md`). The L3 construction records store **analytical grammatical
facts** (not copyrightable) plus short **cited** examples from Patz 1982 for research/education — the
copyrighted grammar itself is not reproduced, and community rights review is pending.

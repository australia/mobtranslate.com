# Kuku Yalanji dictionary — data specification

This document specifies the structure of [`dictionary.yaml`](dictionary.yaml) after the
academic enrichment & correction pass, and the controlled vocabularies it uses.

## Provenance

| Artefact | Source |
|---|---|
| Headwords, definitions, translations | Community dictionary data (Hershberger lineage), `dictionary.yaml` |
| Reference grammar | Elisabeth Patz, *A Grammar of the Kuku Yalanji Language of North Queensland* (Pacific Linguistics) — see [`grammar.md`](grammar.md) |
| Distilled linguistic framework | [`framework.json`](framework.json) — extracted from the grammar by the `ky-grammar-analysis` workflow |
| Backup of the pre-enrichment file | `dictionary.yaml.backup-2026-06-23` (also in git history, sha `bd7d9e3`) |

**Guiding principle:** the original Kuku Yalanji language data (headword, definitions,
translations) is *never fabricated*. Enrichment fields are additive and grounded in the
grammar or in unambiguous structural patterns. Corrections to genuine errors are applied
only from curated, grounded tables and are recorded in each entry's `commentary`.

## File structure

```yaml
meta:
  name: Kuku Yalanji
words:
  - word: jalbu
    type: noun
    ...
```

## Entry fields

| Field | Type | Required | Description |
|---|---|---|---|
| `word` | string | ✔ | Headword (practical orthography). Homonyms appear as separate entries. |
| `type` | enum | – | Part of speech, controlled vocabulary (see below). |
| `phonemic` | string | – | Rule-derived IPA in `/…/`, primary stress on first syllable (Patz §2.1, §2.6.1). |
| `gloss` | string | – | Concise primary English gloss (first translation). |
| `definitions` | string[] | – | Full English definitions. Embedded example sentences have been lifted into `examples`. |
| `translations` | string[] | – | English equivalents. |
| `examples` | object[] | – | `{kuku_yalanji, english}` sentence pairs (extracted verbatim from the source definitions). |
| `synonyms` | string[] | – | Kuku Yalanji synonyms. |
| `see_also` | string[] | – | Cross-references to related headwords. |
| `usages` | string[] | – | Usage / register notes. |
| `reduplication` | object | – | `{pattern: full\|partial, base}` — Patz §3.2.3.5 (nominal), §3.8.5.5 (verbal). |
| `verb_class` | enum | – | `l-conjugation` or `y-conjugation` (Patz §3.8.3, Table 3.15). |
| `derivation` | object | – | `{morpheme, function}` for clearly derived verb stems (Patz §3.8.5). |
| `semantic_domain` | enum | – | Semantic field (controlled vocabulary, see below). |
| `loanword` | object | – | `{source, …}` — attested or verified English loan (Patz §2.3, §3.12). |
| `dialect` | string | – | Dialect attribution where the source records one (Yalanji / Nyungkul / Jalunji …). |
| `commentary` | string[] | – | **Scholarly notes** — corrections (with rationale), etymology, morphology, dialect and cultural observations. See below. |
| `needs_review` | string | – | Flag on contentless source stubs (no definition or translation). Nothing is deleted. |
| `meaning`, `maybe` | – | Legacy free-text fields retained from the source. |

### `commentary` — the scholarly-notes list

`commentary` is a list so an entry can carry several independent observations. Each note
is a self-contained sentence, grounded in the grammar, the source prose, or a structural
fact — never invented. Typical contents:

- **Corrections** — e.g. *"Correction: original `type` value 'policeman' was the word's
  meaning, not a part of speech; reclassified as noun."*
- **Etymology** — e.g. *"English loan from 'Missus' (Patz §2.3)."*
- **Morphology** — e.g. *"Reflexive / general-intransitive stem in `-ji-` (Patz §3.8.5.4)."*
- **Dialect** — e.g. *"Nyungkul form; the Yalanji equivalent is julaji."*
- **Cultural context** — facts already present in the source definition.

## Controlled vocabularies

### `type` (part of speech) — Patz §3.1

`noun`, `adjective`, `quantifier`, `transitive-verb`, `intransitive-verb`, `adverb`,
`locational`, `temporal`, `personal-pronoun`, `interrogative`, `demonstrative`,
`particle`, `interjection`.

Patz treats negation, conjunction and discourse words as non-inflecting **particles**;
manner/modifier words map to **adverb**; time words to **temporal**; direction words to
**locational**.

### `verb_class` — Patz §3.8.3 (Table 3.15)

| class | citation form | transitivity |
|---|---|---|
| `l-conjugation` | ends in `-l` | ~92 % transitive (plus a closed set of intransitive roots and `-ma-l` inchoatives) |
| `y-conjugation` | ends in `-y` (incl. `-ji-y` stems) | 100 % intransitive |

### `semantic_domain`

Grounded in the culture chapter (§1.2) and nominal semantic content (§3.1.2), extended
with action/property domains for verbs and adjectives:

> fauna-mammal · fauna-bird · fauna-fish · fauna-reptile · fauna-insect ·
> fauna-shellfish-crustacean · flora-tree · flora-plant · food · kinship · body-part ·
> human-generic-classifier · bodily-mental-state · artefact · weapon · tool-implement ·
> shelter-dwelling · clothing-adornment · fire · water · land-geography · sky-weather ·
> celestial · spirit-mythical-being · place-name · personal-name · tribal-group-name ·
> ceremony-magic-song · colour · dimension-size · value-quality · age · texture · taste ·
> physical-property · motion-travel · posture-rest · perception · cognition-emotion ·
> speech-communication · ingestion-consumption · bodily-function · manipulation-impact ·
> transfer-possession · hunting-fishing-gathering · cooking · quantity-number ·
> location-deixis · time-deixis · manner · interjection · grammatical-particle

## Regenerating

```bash
# 1. deterministic corrections + enrichment (grammar-grounded, no LLM)
python3 enrich.py                 # reads dictionary.yaml + framework.json, writes dictionary.yaml

# 2. apply additive LLM patches (semantic_domain, commentary, POS for ambiguous entries)
python3 apply_patches.py          # reads patches.json, merges additively

# 3. regenerate the human-readable renderings
python3 gen_markdown.py           # dictionary.md
```

`enrich.py` is idempotent and validated to preserve every original headword, definition
and translation (only example sentences are lifted into `examples`).

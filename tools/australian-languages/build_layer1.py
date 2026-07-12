#!/usr/bin/env python3
"""
LAYER 1 — Grambank baseline (+ WALS supplement).

Builds, from the openly-licensed CLDF datasets on the research mount:
  typology/features-catalog.json        195 Grambank features: id, official name,
                                         AUTHORED plain-English gloss (all 195), value
                                         space, and Grambank's own published feature-group
                                         memberships (Boundness/Flexivity/Gender_or_Noun_Class/
                                         Locus_of_Marking/Word_Order) + a coarse topic domain.
  typology/language-features-matrix.json language x 195-feature matrix for every AU languoid
                                         that Grambank codes. Values are stored verbatim
                                         (0/1/2/3) with an explicit status that keeps
                                         'unknown' ('?'), 'coded', and 'not_recorded' (absent
                                         from Grambank) strictly distinct. Per-language coverage
                                         count = coded features / 195.
  typology/wals-supplement-catalog.json  WALS features that touch AU languages, provenance-
                                         tagged (source=WALS), grouped by WALS area.
  typology/wals-supplement-matrix.json   language x WALS-feature values for AU languoids
                                         (SEPARATE from Grambank, never silently merged).

Grambank is a STANDARDIZED CROSS-LINGUISTIC BASELINE, not an exhaustive grammar — see the
Australia extension catalog (Layer 2) and construction records (Layer 3) for finer detail.

Sources (CC-BY-4.0): Grambank v1.0.3 CLDF, WALS v2020.4 CLDF, Glottolog 5.3 CLDF (registry).
"""
import csv, json, sys, collections
from pathlib import Path

ROOT = Path("/mnt/donto-data/donto-resources/research/australian-languages")
OUT = ROOT / "typology"
OUT.mkdir(exist_ok=True)

sys.path.insert(0, str(Path(__file__).parent))
from glosses_grambank import GLOSSES

csv.field_size_limit(10_000_000)


def load_csv(p):
    with open(p, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    # ---- registry: the set of AU languoids + their metadata ----
    reg = json.load(open(ROOT / "registry/australian_languages_registry.json"))
    languoids = reg["languoids"]
    au_glotto = {l["glottocode"]: l for l in languoids if l.get("glottocode")}

    # ================= GRAMBANK CATALOG =================
    gparams = load_csv(ROOT / "grambank/cldf/parameters.csv")
    gcodes = load_csv(ROOT / "grambank/cldf/codes.csv")
    code_by_param = collections.defaultdict(list)
    for c in gcodes:
        code_by_param[c["Parameter_ID"]].append({"value": c["Name"], "meaning": c["Description"]})

    # Grambank's own published multi-label feature groupings (from parameters.csv).
    GROUP_COLS = ["Boundness", "Flexivity", "Gender_or_Noun_Class", "Locus_of_Marking", "Word_Order"]

    # A coarse single-assignment topic domain, derived from the feature's Grambank Informativity
    # tag + name keywords (display grouping only; the SIMILARITY per-domain sub-scores use the
    # published GROUP_COLS above, not this).
    def topic_domain(pid, name):
        n = name.lower()
        if any(k in n for k in ["article", "gender", "noun class", "number marking", "dual", "plural",
                                "paucal", "trial", "classifier", "diminutive", "augmentative",
                                "case for", "possess", "adnominal", "reduplicat", "derived", "deriv"]):
            return "nominal"
        if "pronoun" in n or "inclusive" in n or "logophoric" in n or "reflexive pronoun" in n:
            return "pronoun"
        if "demonstrative" in n:
            return "demonstrative"
        if any(k in n for k in ["tense", "aspect", "mood", "verb", "applicative", "causative",
                                "passive", "antipassive", "inverse", "conjugation", "serial",
                                "copula", "auxiliary", "negation", "index", "argument", "valen"]):
            return "verb_and_valency"
        if any(k in n for k in ["order", "clause", "relative", "switch", "chaining", "interrog",
                                "question", "comparative", "complementizer", "pro-drop", "quantifier"]):
            return "clause_and_syntax"
        if "numeral" in n or "decimal" in n or "quinary" in n or "vigesimal" in n or "tallying" in n:
            return "numerals"
        if "evidence" in n or "politeness" in n or "ideophone" in n:
            return "other"
        return "other"

    features = []
    missing_gloss = []
    for p in gparams:
        pid = p["ID"]
        codes = code_by_param.get(pid, [])
        gloss = GLOSSES.get(pid)
        if not gloss:
            missing_gloss.append(pid)
        groups = [g for g in GROUP_COLS if p.get(g) and p[g] not in ("", "0")]
        features.append({
            "id": pid,
            "name": p["Name"],
            "gloss": gloss or "",           # AUTHORED plain-English gloss (every feature)
            "value_space": codes,           # e.g. [{value:0,meaning:absent},{value:1,meaning:present}]
            "multistate": len(codes) > 2,
            "grambank_groups": groups,      # Grambank's published multi-label feature groups
            "topic_domain": topic_domain(pid, p["Name"]),
            "informativity_tag": p.get("Informativity") or None,
        })
    if missing_gloss:
        raise SystemExit(f"FATAL: {len(missing_gloss)} features have no authored gloss: {missing_gloss}")

    catalog = {
        "_meta": {
            "layer": "L1-grambank-baseline",
            "kind": "features-catalog",
            "note": "Grambank's 195 variables are a STANDARDIZED CROSS-LINGUISTIC BASELINE, not an "
                    "exhaustive grammar representation. Finer Australianist distinctions live in the "
                    "Australia extension catalog (Layer 2); primary descriptive data lives in the "
                    "construction records (Layer 3).",
            "source": "Grambank v1.0.3 CLDF (CC-BY-4.0)",
            "n_features": len(features),
            "glosses_author": "mobtranslate typology pipeline (Claude-authored); official Name/codes from Grambank",
            "grambank_group_columns": GROUP_COLS,
        },
        "features": features,
    }
    json.dump(catalog, open(OUT / "features-catalog.json", "w"), indent=1, ensure_ascii=False)

    # ================= GRAMBANK MATRIX =================
    gvals = load_csv(ROOT / "grambank/cldf/values.csv")
    feat_ids = [f["id"] for f in features]
    # language -> {param -> raw value}
    raw = collections.defaultdict(dict)
    comments = collections.defaultdict(dict)
    for v in gvals:
        lid = v["Language_ID"]
        if lid in au_glotto:
            raw[lid][v["Parameter_ID"]] = v["Value"]
            if v.get("Comment"):
                comments[lid][v["Parameter_ID"]] = v["Comment"]

    def status_of(val):
        if val is None:
            return "not_recorded"      # Grambank never assessed this feature for this language
        if val == "?":
            return "unknown"           # assessed, but value could not be determined
        if val in ("", "N/A"):
            return "not_applicable"    # feature does not apply
        return "coded"                 # a real 0/1/2/3 value

    lang_rows = []
    for lid in sorted(raw.keys()):
        meta = au_glotto[lid]
        cells = {}
        coded = 0
        unknown = 0
        for fid in feat_ids:
            val = raw[lid].get(fid)
            st = status_of(val)
            if st == "coded":
                coded += 1
            elif st == "unknown":
                unknown += 1
            cells[fid] = {"value": val, "status": st}
            if fid in comments[lid]:
                cells[fid]["comment"] = comments[lid][fid]
        lang_rows.append({
            "glottocode": lid,
            "name": meta.get("canonical_name"),
            "iso639_3": meta.get("iso639_3"),
            "family": meta.get("family"),
            "austlang_codes": meta.get("austlang_codes", []),
            "coverage_coded": coded,
            "coverage_unknown": unknown,
            "coverage_total_features": len(feat_ids),
            "coverage_pct": round(100 * coded / len(feat_ids), 1),
            "cells": cells,
        })

    matrix = {
        "_meta": {
            "layer": "L1-grambank-baseline",
            "kind": "language-features-matrix",
            "source": "Grambank v1.0.3 CLDF (CC-BY-4.0)",
            "dims": {"languages": len(lang_rows), "features": len(feat_ids)},
            "value_semantics": {
                "coded": "a real value (0/1 or multistate 2/3) assessed by Grambank",
                "unknown": "'?' — assessed but not determinable; NOT the same as absent (0)",
                "not_applicable": "'N/A' — feature does not apply",
                "not_recorded": "no Grambank row for this language x feature (never assessed)",
            },
        },
        "languages": lang_rows,
    }
    json.dump(matrix, open(OUT / "language-features-matrix.json", "w"), indent=1, ensure_ascii=False)

    # ================= WALS SUPPLEMENT (SEPARATE, provenance-tagged) =================
    wlangs = load_csv(ROOT / "wals/cldf/languages.csv")
    wgl = {r["ID"]: r["Glottocode"] for r in wlangs if r["Glottocode"]}
    wparams = load_csv(ROOT / "wals/cldf/parameters.csv")
    wcodes = load_csv(ROOT / "wals/cldf/codes.csv")
    wchapters = {c["ID"]: c for c in load_csv(ROOT / "wals/cldf/chapters.csv")}
    wareas = {a["ID"]: a["Name"] for a in load_csv(ROOT / "wals/cldf/areas.csv")}
    wcode_by_param = collections.defaultdict(dict)
    for c in wcodes:
        wcode_by_param[c["Parameter_ID"]][c["ID"]] = c["Name"]

    wvals = load_csv(ROOT / "wals/cldf/values.csv")
    # which WALS params touch AU languages
    au_wparam_ids = set()
    wraw = collections.defaultdict(dict)  # glottocode -> {param -> (value_code_id)}
    for v in wvals:
        g = wgl.get(v["Language_ID"])
        if g in au_glotto:
            au_wparam_ids.add(v["Parameter_ID"])
            wraw[g][v["Parameter_ID"]] = v.get("Code_ID") or v.get("Value")

    def wals_area(pid, chap_id):
        ch = wchapters.get(chap_id)
        if ch and ch.get("Area_ID"):
            return wareas.get(ch["Area_ID"], "Other")
        return "Other"

    wfeatures = []
    for p in sorted(au_wparam_ids):
        pr = next((x for x in wparams if x["ID"] == p), None)
        if not pr:
            continue
        area = wals_area(p, pr.get("Chapter_ID"))
        wfeatures.append({
            "id": pr["ID"],
            "name": pr["Name"],
            "wals_area": area,
            "value_space": [{"code": cid, "meaning": nm} for cid, nm in wcode_by_param.get(p, {}).items()],
            "source": "WALS",
            "provenance": "WALS Online v2020.4 (CC-BY-4.0) — supplement, not merged into Grambank baseline",
        })

    wcatalog = {
        "_meta": {
            "layer": "L1-wals-supplement",
            "kind": "wals-supplement-catalog",
            "note": "WALS features are kept as a SEPARATE, provenance-tagged supplement. They are "
                    "NEVER silently merged into the Grambank baseline — WALS and Grambank use "
                    "different feature definitions and value spaces.",
            "source": "WALS Online v2020.4 CLDF (CC-BY-4.0)",
            "n_features": len(wfeatures),
        },
        "features": wfeatures,
    }
    json.dump(wcatalog, open(OUT / "wals-supplement-catalog.json", "w"), indent=1, ensure_ascii=False)

    # WALS matrix (value code + human-readable meaning)
    wlang_rows = []
    for g in sorted(wraw.keys()):
        meta = au_glotto[g]
        cells = {}
        coded = 0
        for pid in sorted(au_wparam_ids):
            cid = wraw[g].get(pid)
            if cid:
                meaning = wcode_by_param.get(pid, {}).get(cid, cid)
                cells[pid] = {"code": cid, "value": meaning}
                coded += 1
        wlang_rows.append({
            "glottocode": g,
            "name": meta.get("canonical_name"),
            "coverage_coded": coded,
            "coverage_total_features": len(au_wparam_ids),
            "cells": cells,
        })
    wmatrix = {
        "_meta": {
            "layer": "L1-wals-supplement",
            "kind": "wals-supplement-matrix",
            "source": "WALS Online v2020.4 CLDF (CC-BY-4.0)",
            "dims": {"languages": len(wlang_rows), "features": len(au_wparam_ids)},
            "note": "Separate provenance-tagged supplement (source=WALS). Not merged with Grambank.",
        },
        "languages": wlang_rows,
    }
    json.dump(wmatrix, open(OUT / "wals-supplement-matrix.json", "w"), indent=1, ensure_ascii=False)

    # ================= stats =================
    covs = [r["coverage_coded"] for r in lang_rows]
    well = [r for r in lang_rows if r["coverage_coded"] >= 30]
    stats = {
        "grambank_catalog_features": len(features),
        "grambank_matrix_languages": len(lang_rows),
        "grambank_features": len(feat_ids),
        "languages_coverage_ge_30": len(well),
        "languages_coverage_ge_100": len([c for c in covs if c >= 100]),
        "max_coverage": max(covs) if covs else 0,
        "median_coverage": sorted(covs)[len(covs) // 2] if covs else 0,
        "wals_supplement_features": len(wfeatures),
        "wals_supplement_languages": len(wlang_rows),
        "all_glosses_present": len(missing_gloss) == 0,
    }
    json.dump(stats, open(OUT / "layer1-stats.json", "w"), indent=1)
    print("LAYER 1 built:")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()

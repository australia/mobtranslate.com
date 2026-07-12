#!/usr/bin/env python3
"""
build_map_data.py — compile the /map page's static data bundle.

Reads the open (CC-BY-4.0) research-mount artifacts + the already-built typology
snapshot, and emits a small set of JSON files into apps/web/public/map/ that the
MapLibre map page fetches at runtime. NOTHING here is request-time DB coupled;
the same data also lives in mobtranslate-pg (typology_* tables).

Inputs (research mount = the research-on-mount rule):
  registry/australian_languages_registry.json   — ALL 1,029 languoids (847 with coords)
  typology/language-features-matrix.json         — Grambank baseline (144x195), coded/unknown status
  typology/aus-extension-catalog.json/-values    — Australianist extension (53 features)
  typology/features-catalog.json                 — Grambank feature metadata (glosses, value spaces)
  typology/similarity.json                       — pairs + top-10 neighbours (grambank_recorded_agreement)
  typology/clusters.json                         — k-medoids clusters over recorded agreement
apps/web/public/typology/index.json              — the 204-language typology index (cluster/dict/ncon flags)

Outputs (apps/web/public/map/):
  points.geojson          — every registry language with coords (a point)
  features-catalog.json    — the FEATURE-mode picker (baseline + extension, labeled)
  feature-values.json      — {featureId: {glottocode: codedValue}}  (real values only)
  agreement.json           — clusters + per-language top-10 neighbours w/ per-domain breakdown
  meta.json                — sources/licenses/metric-definition/coverage denominators (About modal)

EPISTEMIC HONESTY carried through: '?' / 'N/A' / not-recorded are NEVER emitted as
coded values; the agreement metric keeps its exact definition + n_joint; Grambank's
195 variables are labeled a STANDARDIZED BASELINE, not an exhaustive grammar.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = "/mnt/donto-data/donto-resources/research/australian-languages"
TYP = os.path.join(RESEARCH, "typology")
WEB_PUBLIC = os.path.abspath(os.path.join(HERE, "../../apps/web/public"))
OUT = os.path.join(WEB_PUBLIC, "map-data")
TYP_SNAPSHOT = os.path.join(WEB_PUBLIC, "typology")

# Dictionaries in the repo (dictionaries/<dir>) mapped to their glottocode.
# Curated identity map, verified from each dictionary.yaml `glottocode:` field.
# migmaq is DELIBERATELY EXCLUDED — it is Mi'kmaq (Canada), not an Australian language.
DICTIONARY_GLOTTOCODE = {
    "kuku_yalanji": "kuku1273",
    "anindilyakwa": "anin1240",
    "woiwurrung": "woiw1237",
    "gamilaraay": "gami1243",
    "anguthimri": "angu1242",
    "eastern_arrernte": "east2379",
    "pitjantjatjara": "pitj1243",
    "wajarri": "waja1257",
}


def load(path):
    with open(path) as f:
        return json.load(f)


def dump(obj, path):
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
    return os.path.getsize(path)


def main():
    os.makedirs(OUT, exist_ok=True)

    reg = load(os.path.join(RESEARCH, "registry", "australian_languages_registry.json"))
    languoids = reg["languoids"]
    typ_index = {l["glottocode"]: l for l in load(os.path.join(TYP_SNAPSHOT, "index.json"))["languages"]}

    # dictionary map by glottocode -> dir (validate every glottocode actually exists in the registry)
    reg_by_gc = {l["glottocode"]: l for l in languoids if l.get("glottocode")}
    dict_by_gc = {}
    for d, gc in DICTIONARY_GLOTTOCODE.items():
        if gc in reg_by_gc:
            dict_by_gc[gc] = d
        else:
            print(f"  WARN: dictionary '{d}' glottocode {gc} not found in registry", file=sys.stderr)

    # ---------------------------------------------------------------- points
    feats = []
    mapped_glottocodes = set()
    for l in languoids:
        lat, lon = l.get("latitude"), l.get("longitude")
        if lat is None or lon is None:
            continue
        gc = l.get("glottocode")
        austlang = (l.get("austlang_codes") or [None])[0]
        pid = gc or (f"au:{austlang}" if austlang else None)
        if not pid:
            continue
        subgroup = None
        chain = l.get("family_chain") or []
        if len(chain) >= 2:
            subgroup = chain[1]["name"]
        ti = typ_index.get(gc) if gc else None
        if gc:
            mapped_glottocodes.add(gc)
        props = {
            "id": pid,
            "gc": gc,
            "name": l.get("canonical_name"),
            "family": l.get("family"),
            "subgroup": subgroup,
            "level": l.get("level"),
            "iso": l.get("iso639_3"),
            "austlang": austlang,
            "end": l.get("endangerment_aes_label"),
            "gb": l.get("grambank_feature_count") or 0,
            "wals": l.get("wals_feature_count") or 0,
            "aux": (ti or {}).get("aus_extension_coded", 0),
            "typ": bool(ti),
            "cl": (ti or {}).get("cluster"),
            "ncon": (ti or {}).get("n_constructions", 0),
            "dict": dict_by_gc.get(gc),
        }
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]},
            "properties": props,
        })

    points = {
        "type": "FeatureCollection",
        "_meta": {
            "kind": "map-points",
            "n_points": len(feats),
            "note": "every registry languoid with coordinates; not all have typology data (see `typ`).",
        },
        "features": feats,
    }
    sz_points = dump(points, os.path.join(OUT, "points.geojson"))

    # ------------------------------------------------- feature catalog + values
    gb_cat = load(os.path.join(TYP, "features-catalog.json"))
    gb_matrix = load(os.path.join(TYP, "language-features-matrix.json"))
    ext_cat = load(os.path.join(TYP, "aus-extension-catalog.json"))
    ext_vals = load(os.path.join(TYP, "aus-extension-values.json"))

    # per-feature coded values (real values only; '?'/'N/A'/not-recorded excluded)
    values = {}  # featureId -> {glottocode: value}
    for lang in gb_matrix["languages"]:
        gc = lang["glottocode"]
        for fid, cell in lang["cells"].items():
            if cell.get("status") == "coded":
                v = cell.get("value")
                if v not in (None, "?", "N/A"):
                    values.setdefault(fid, {})[gc] = str(v)
    for lang in ext_vals["languages"]:
        gc = lang["glottocode"]
        for fid, cell in lang["cells"].items():
            v = cell.get("value")
            if v not in (None, "?", "N/A", ""):
                values.setdefault(fid, {})[gc] = str(v)

    def coverage(fid):
        vm = values.get(fid, {})
        return sum(1 for gc in vm if gc in mapped_glottocodes)

    catalog = []
    # baseline (Grambank)
    for f in gb_cat["features"]:
        vs = [{"value": str(v["value"]), "meaning": v.get("meaning", str(v["value"]))}
              for v in f.get("value_space", [])]
        catalog.append({
            "id": f["id"], "name": f["name"], "gloss": f.get("gloss", ""),
            "domain": f.get("domain", "other"), "catalog": "baseline",
            "values": vs, "coded": coverage(f["id"]),
        })
    # extension (Australianist)
    for f in ext_cat["features"]:
        vs = [{"value": str(v), "meaning": str(v)} for v in f.get("value_space", [])]
        catalog.append({
            "id": f["id"], "name": f["name"],
            "gloss": f.get("gloss", "") or f.get("coding_question", ""),
            "domain": f.get("domain", "other"), "catalog": "extension",
            "values": vs, "coded": coverage(f["id"]),
        })

    features_catalog = {
        "_meta": {
            "kind": "map-feature-catalog",
            "baseline_note": ("Grambank's 195 variables are a STANDARDIZED CROSS-LINGUISTIC BASELINE, "
                              "not an exhaustive grammar. The Australianist extension records finer "
                              "distinctions Grambank compresses; its coverage is honestly low."),
            "n_baseline": sum(1 for c in catalog if c["catalog"] == "baseline"),
            "n_extension": sum(1 for c in catalog if c["catalog"] == "extension"),
            "n_mapped_points": len(feats),
        },
        "features": catalog,
    }
    sz_cat = dump(features_catalog, os.path.join(OUT, "features-catalog.json"))
    sz_vals = dump(values, os.path.join(OUT, "feature-values.json"))

    # -------------------------------------------------------- agreement / clusters
    sim = load(os.path.join(TYP, "similarity.json"))
    clusters = load(os.path.join(TYP, "clusters.json"))

    # pair -> per_domain lookup
    pair_dom = {}
    for p in sim["pairs"]:
        key = frozenset((p["a"], p["b"]))
        pair_dom[key] = p.get("per_domain", {})

    name_by_gc = {gc: (typ_index.get(gc, {}).get("name")) for gc in mapped_glottocodes}
    neighbours = {}
    for gc, nbrs in sim["neighbours"].items():
        out_n = []
        for n in nbrs:
            dom = pair_dom.get(frozenset((gc, n["glottocode"])), {})
            # compact per-domain: {domainName: [agreement, n_joint]}
            cdom = {k: [round(v["agreement"], 3), v["n_joint"]] for k, v in dom.items()}
            out_n.append({
                "gc": n["glottocode"],
                "name": n.get("name"),
                "agr": round(n["grambank_recorded_agreement"], 4),
                "n": n["n_joint"],
                "dom": cdom,
            })
        neighbours[gc] = out_n

    cl_meta = {}
    for c in clusters["clusters"]:
        cl_meta[str(c["cluster"])] = {
            "size": c.get("size"),
            "dominant_subgroup": c.get("dominant_subgroup_glottocode"),
            "purity": c.get("subgroup_purity"),
        }

    agreement = {
        "_meta": {
            "kind": "map-agreement",
            "metric_name": sim["_meta"]["metric_name"],
            "metric_definition": sim["_meta"]["metric_definition"],
            "not_called": sim["_meta"]["not_called"],
            "min_n_joint": sim["_meta"]["min_n_joint"],
            "cluster_method": clusters["_meta"]["method"],
            "chosen_k": clusters["_meta"]["chosen_k"],
            "silhouette": clusters["_meta"]["silhouette"],
            "rand_vs_subgroup": clusters["_meta"]["family_vs_cluster"]["rand_index_cluster_vs_genealogical_subgroup"],
            "subgroup_purity": clusters["_meta"]["family_vs_cluster"]["macro_subgroup_purity"],
        },
        "clusters": cl_meta,
        "neighbours": neighbours,
    }
    sz_agr = dump(agreement, os.path.join(OUT, "agreement.json"))

    # ------------------------------------------------------------------- meta
    n_coords = len(feats)
    n_typ = sum(1 for f in feats if f["properties"]["typ"])
    n_gb = sum(1 for f in feats if f["properties"]["gb"] > 0)
    n_dict = sum(1 for f in feats if f["properties"]["dict"])
    families = {}
    for f in feats:
        fam = f["properties"]["family"] or "Unclassified / isolate"
        families[fam] = families.get(fam, 0) + 1

    meta = {
        "kind": "map-meta",
        "generated_from": "tools/australian-languages/build_map_data.py",
        "counts": {
            "points": n_coords,
            "with_typology": n_typ,
            "with_grambank": n_gb,
            "with_dictionary": n_dict,
            "registry_total": len(languoids),
            "grambank_assessed": gb_matrix["_meta"]["dims"]["languages"],
        },
        "families": dict(sorted(families.items(), key=lambda kv: -kv[1])),
        "sources": [
            {"name": "Glottolog 5.3", "license": "CC-BY-4.0",
             "attribution": "Hammarström, Harald & Forkel, Robert & Haspelmath, Martin & Bank, Sebastian. 2024. Glottolog 5.3. Leipzig: MPI-EVA.",
             "used_for": "classification chains, coordinates, ISO 639-3, AES endangerment"},
            {"name": "Grambank v1.0.3", "license": "CC-BY-4.0",
             "attribution": "Skirgård, Hedvig et al. 2023. Grambank v1.0.3. Zenodo / MPI-EVA (Science Advances).",
             "used_for": "195-feature standardized morphosyntax baseline + recorded-agreement metric"},
            {"name": "WALS Online v2020.4", "license": "CC-BY-4.0",
             "attribution": "Dryer, Matthew S. & Haspelmath, Martin (eds.). 2013. The World Atlas of Language Structures Online. Leipzig: MPI-EVA.",
             "used_for": "supplementary features feeding the Australianist extension"},
            {"name": "AIATSIS AUSTLANG", "license": "CC-BY-4.0",
             "attribution": "AIATSIS. AUSTLANG: Australian Indigenous Languages Database.",
             "used_for": "language varieties, AUSTLANG codes, approximate coordinates"},
        ],
        "metric": {
            "name": agreement["_meta"]["metric_name"],
            "definition": agreement["_meta"]["metric_definition"],
            "not_called": agreement["_meta"]["not_called"],
            "min_n_joint": agreement["_meta"]["min_n_joint"],
        },
        "unknown_vs_absent": (
            "A grey 'not coded' point means the feature was NEVER ASSESSED for that language — "
            "this is different from a recorded value of 'absent' (0). Grambank '?' (assessed but "
            "not determinable) and 'N/A' (not applicable) are also treated as not-coded and never "
            "shown as a value."
        ),
    }
    sz_meta = dump(meta, os.path.join(OUT, "meta.json"))

    print(f"points.geojson       {n_coords:5d} points        {sz_points/1024:8.1f} KB")
    print(f"features-catalog.json {len(catalog):4d} features     {sz_cat/1024:8.1f} KB")
    print(f"feature-values.json  {len(values):5d} feature-maps  {sz_vals/1024:8.1f} KB")
    print(f"agreement.json       {len(neighbours):5d} langs        {sz_agr/1024:8.1f} KB")
    print(f"meta.json                                   {sz_meta/1024:8.1f} KB")
    print(f"coverage: {n_coords} points | {n_typ} with typology | {n_gb} with Grambank | {n_dict} with dictionary")


if __name__ == "__main__":
    main()

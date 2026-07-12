#!/usr/bin/env python3
"""
Build the committed static JSON snapshot that powers the /languages/[code] endpoint.

Storage decision (see README): the typology layer is STATIC REFERENCE data. Dictionary data in
this app flows through mobtranslate-pg (Drizzle), so the queryable store is DB tables (see
import_typology.py + the migration). The /languages/[code] page instead reads a committed static
snapshot (Next static generation) — this avoids request-time DB coupling and avoids editing the
shared Drizzle schema.ts that other agents have uncommitted work in. Both derive from the SAME
upstream typology artifacts on the research mount.

Writes into apps/web/public/typology/:
  index.json             — summary row per languoid (all with grambank OR wals coverage)
  features.json          — baseline (grambank) + extension (aus) feature catalogs w/ glosses
  lang/<glottocode>.json — per-language detail: coverage, features+glosses+values, aus-extension
                           values, top-10 neighbours (each with n_joint), constructions, cluster,
                           dictionary link when a dictionary exists.
"""
import json, collections, shutil
from pathlib import Path

ROOT = Path("/mnt/donto-data/donto-resources/research/australian-languages")
TYP = ROOT / "typology"
PUB = Path("/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/typology")


def load(p):
    return json.load(open(TYP / p))


def main():
    matrix = load("language-features-matrix.json")
    fcat = load("features-catalog.json")
    wcat = load("wals-supplement-catalog.json")
    wmat = load("wals-supplement-matrix.json")
    acat = load("aus-extension-catalog.json")
    avals = load("aus-extension-values.json")
    cons = load("constructions.json")
    sim = load("similarity.json")
    clus = load("clusters.json")
    reg = json.load(open(ROOT / "registry/australian_languages_registry.json"))

    feat = {f["id"]: f for f in fcat["features"]}
    afeat = {f["id"]: f for f in acat["features"]}
    reg_by = {l["glottocode"]: l for l in reg["languoids"] if l.get("glottocode")}

    # cluster membership
    cluster_of = {}
    cluster_meta = {}
    for c in clus["clusters"]:
        cluster_meta[c["cluster"]] = {"cluster": c["cluster"], "size": c["size"],
                                      "dominant_subgroup_glottocode": c["dominant_subgroup_glottocode"],
                                      "subgroup_purity": c["subgroup_purity"]}
        for mmb in c["members"]:
            cluster_of[mmb["glottocode"]] = c["cluster"]

    # grambank matrix rows
    gb_rows = {r["glottocode"]: r for r in matrix["languages"]}
    wals_rows = {r["glottocode"]: r for r in wmat["languages"]}
    aval_rows = {r["glottocode"]: r for r in avals["languages"]}
    cons_by = collections.defaultdict(list)
    for c in cons["constructions"]:
        cons_by[c["language"]].append(c)

    # --- dictionary links: resolve dict code -> glottocode by name match against the registry ---
    # the small fixed set of on-repo dictionaries (verified glottocodes); resolved by name where possible
    DICT_META = {  # dict-code : display name (from dictionaries/index.ts)
        "kuku_yalanji": "Kuku Yalanji", "anindilyakwa": "Anindilyakwa", "woiwurrung": "Woiwurrung",
        "gamilaraay": "Gamilaraay", "anguthimri": "Anguthimri", "eastern_arrernte": "Eastern Arrernte",
        "pitjantjatjara": "Pitjantjatjara", "migmaq": "Mi'gmaq",
    }
    # build name -> glottocode index from registry (canonical + alt names, normalised)
    def norm(s):
        return "".join(ch for ch in s.lower() if ch.isalnum())
    name_index = {}
    for g, l in reg_by.items():
        for nm in [l.get("canonical_name")] + (l.get("alt_names") or []):
            if nm:
                name_index.setdefault(norm(nm), g)
    dict_link = {}
    for code, disp in DICT_META.items():
        g = name_index.get(norm(disp))
        if g:
            dict_link[g] = code

    PUB.mkdir(parents=True, exist_ok=True)
    (PUB / "lang").mkdir(exist_ok=True)
    # clean stale per-language files so removed languages don't linger
    for old in (PUB / "lang").glob("*.json"):
        old.unlink()

    # feature catalogs snapshot
    json.dump({
        "grambank": {"note": fcat["_meta"]["note"], "n": len(fcat["features"]),
                     "features": [{"id": f["id"], "name": f["name"], "gloss": f["gloss"],
                                   "domain": f["topic_domain"], "groups": f["grambank_groups"],
                                   "value_space": f["value_space"], "multistate": f["multistate"]}
                                  for f in fcat["features"]]},
        "aus_extension": {"note": acat["_meta"]["note"], "n": len(acat["features"]),
                          "features": acat["features"]},
        "wals_supplement": {"note": wcat["_meta"]["note"], "n": len(wcat["features"])},
    }, open(PUB / "features.json", "w"), indent=1, ensure_ascii=False)

    # per-language + index
    all_glotto = set(gb_rows) | set(wals_rows)
    index = []
    for g in sorted(all_glotto):
        meta = reg_by.get(g, {})
        gbr = gb_rows.get(g)
        wr = wals_rows.get(g)
        chain = meta.get("family_chain") or []
        subgroup = (chain[1]["name"] if len(chain) >= 2 else (chain[0]["name"] if chain else meta.get("family")))

        # top features: coded grambank features, ordered by domain then id, with gloss + value meaning
        top_features = []
        if gbr:
            for fid, cell in gbr["cells"].items():
                if cell.get("status") == "coded":
                    f = feat[fid]
                    # value meaning
                    vm = next((c["meaning"] for c in f["value_space"] if c["value"] == cell["value"]),
                              cell["value"])
                    top_features.append({"id": fid, "name": f["name"], "gloss": f["gloss"],
                                         "domain": f["topic_domain"], "value": cell["value"],
                                         "value_meaning": vm})
            top_features.sort(key=lambda x: (x["domain"], x["id"]))

        # aus-extension coded values
        aux_vals = []
        ar = aval_rows.get(g)
        if ar:
            for aid, cell in ar["cells"].items():
                if cell["value"] != "?":
                    af = afeat[aid]
                    aux_vals.append({"id": aid, "name": af["name"], "gloss": af["gloss"],
                                     "domain": af["domain"], "value": cell["value"],
                                     "derivation": cell["derivation"]})

        neigh = sim["neighbours"].get(g, [])
        recs = cons_by.get(g, [])

        detail = {
            "glottocode": g,
            "name": meta.get("canonical_name"),
            "iso639_3": meta.get("iso639_3"),
            "family": meta.get("family"),
            "subgroup": subgroup,
            "family_chain": chain,
            "latitude": meta.get("latitude"),
            "longitude": meta.get("longitude"),
            "austlang_codes": meta.get("austlang_codes", []),
            "endangerment": meta.get("endangerment_aes_label"),
            "coverage": {
                "grambank_coded": gbr["coverage_coded"] if gbr else 0,
                "grambank_unknown": gbr["coverage_unknown"] if gbr else 0,
                "grambank_total": 195,
                "grambank_pct": gbr["coverage_pct"] if gbr else 0,
                "wals_coded": wr["coverage_coded"] if wr else 0,
                "aus_extension_coded": len(aux_vals),
                "aus_extension_total": len(acat["features"]),
            },
            "cluster": cluster_of.get(g),
            "cluster_meta": cluster_meta.get(cluster_of.get(g)),
            "grambank_features": top_features,
            "aus_extension": aux_vals,
            "neighbours": neigh,
            "constructions": recs,
            "dictionary": ({"code": dict_link[g],
                            "href": f"/dictionaries/{dict_link[g]}"} if g in dict_link else None),
            "_provenance": {
                "grambank": "Grambank v1.0.3 CLDF (CC-BY-4.0)",
                "wals": "WALS v2020.4 CLDF (CC-BY-4.0)",
                "registry": "AIATSIS AUSTLANG + Glottolog 5.3 (CC-BY-4.0)",
            },
        }
        json.dump(detail, open(PUB / "lang" / f"{g}.json", "w"), indent=1, ensure_ascii=False)

        index.append({
            "glottocode": g,
            "name": meta.get("canonical_name"),
            "family": meta.get("family"),
            "subgroup": subgroup,
            "iso639_3": meta.get("iso639_3"),
            "latitude": meta.get("latitude"),
            "longitude": meta.get("longitude"),
            "grambank_coded": gbr["coverage_coded"] if gbr else 0,
            "wals_coded": wr["coverage_coded"] if wr else 0,
            "aus_extension_coded": len(aux_vals),
            "n_constructions": len(recs),
            "cluster": cluster_of.get(g),
            "has_dictionary": g in dict_link,
            "dictionary_code": dict_link.get(g),
        })

    index.sort(key=lambda r: (r["name"] or r["glottocode"]))
    json.dump({
        "_meta": {
            "kind": "typology-index",
            "n_languages": len(index),
            "sources": ["Grambank v1.0.3 (CC-BY-4.0)", "WALS v2020.4 (CC-BY-4.0)",
                        "Glottolog 5.3 (CC-BY-4.0)", "AIATSIS AUSTLANG (CC-BY-4.0)"],
            "metric_note": "similarity metric is 'grambank_recorded_agreement' over jointly-coded "
                           "Grambank features only (n_joint >= 30).",
        },
        "languages": index,
    }, open(PUB / "index.json", "w"), indent=1, ensure_ascii=False)

    print(f"Public snapshot written to {PUB}")
    print(f"    index.json: {len(index)} languages")
    print(f"    lang/*.json: {len(all_glotto)} files")
    print(f"    dictionary links resolved: {len(dict_link)} -> {sorted(dict_link.values())}")


if __name__ == "__main__":
    main()

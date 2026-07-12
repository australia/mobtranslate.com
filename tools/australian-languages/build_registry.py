#!/usr/bin/env python3
"""
build_registry.py — Master registry of Australian Aboriginal & Torres Strait Islander
languoids, joining AIATSIS AUSTLANG codes <-> Glottocodes <-> ISO 639-3, enriched with
family/subgroup classification, coordinates, endangerment status (Glottolog AES), and
Grambank / WALS typology coverage.

Pure Python stdlib (no pandas). Deterministic. Idempotent.

Inputs (relative to --data-dir, default = the research dir this script lives beside):
  glottolog/cldf/languages.csv   glottolog/cldf/values.csv   glottolog/cldf/names.csv
  grambank/cldf/languages.csv    grambank/cldf/values.csv
  wals/cldf/languages.csv        wals/cldf/values.csv
  austlang/austlang_dataset.csv

Output:
  registry/australian_languages_registry.json   (array of rows + a _meta header object)
  registry/australian_languages_registry.csv    (flattened, one row per languoid)
  registry/austlang_unmapped.json               (AUSTLANG codes with no Glottocode match)
  registry/registry_stats.json                  (the report numbers)

AUSTLANG <-> Glottocode join method
-----------------------------------
Glottolog's CLDF export does NOT carry the AIATSIS alphanumeric code (e.g. Y78). It DOES
carry, in names.csv, the AIATSIS name-variants (Provider='aiatsis') that Glottolog ingested
straight from AUSTLANG, plus each languoid's canonical name. We therefore join on the
datasets' OWN shared name strings (data-driven, not a hand-maintained synonym table):

  * Build a normalized name -> {glottocode} index from Glottolog names.csv + canonical names,
    restricted to Australian languoids only (AUSTLANG is entirely Australian).
  * For each AUSTLANG row, score candidate glottocodes: +3 if the AUSTLANG primary
    language_name matches a Glottolog name for that glottocode, +1 per matching synonym.
  * Assign the top-scoring glottocode; record method, score, margin, and confidence band so
    the join is auditable and honest. Ties / no-match are reported, never silently dropped.

ISO 639-3 comes from the matched Glottocode's Glottolog assignment (languages.csv).
"""
import csv, json, os, re, sys, hashlib, unicodedata, argparse, math
from collections import defaultdict

def haversine_km(a, b):
    (la1, lo1), (la2, lo2) = a, b
    r = 6371.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = math.radians(la2 - la1), math.radians(lo2 - lo1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))

# Reject a name-based AUSTLANG<->Glottocode match if the variety's own coordinates and the
# matched glottocode's coordinates are grossly far apart (data-driven sanity gate; catches
# synonym-vote cross-continent errors like Torres Strait <-> South Australia).
MATCH_MAX_KM = 1500.0

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

AUS_BBOX = dict(lat_min=-44.0, lat_max=-9.0, lon_min=112.0, lon_max=154.0)

def norm_name(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)

def num(x):
    try:
        v = float(x)
        return v
    except (TypeError, ValueError):
        return None

def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--data-dir", default=os.path.dirname(here))
    ap.add_argument("--out-dir", default=None)
    args = ap.parse_args()
    D = args.data_dir
    OUT = args.out_dir or os.path.join(D, "registry")
    os.makedirs(OUT, exist_ok=True)

    # ---------- Glottolog ----------
    glang = {}                      # glottocode -> row
    name_of = {}                    # glottocode -> canonical name (any level, for chain resolution)
    for r in read_csv(os.path.join(D, "glottolog/cldf/languages.csv")):
        gc = r["Glottocode"] or r["ID"]
        glang[gc] = r
        name_of[gc] = r["Name"]

    def has_au_country(r):
        return "AU" in [x.strip() for x in (r.get("Countries") or "").split(";")]

    def macro_has_australia(r):
        return "Australia" in [x.strip() for x in (r.get("Macroarea") or "").split(";")]

    # Broad candidate set for name-matching AUSTLANG: any languoid Glottolog associates with
    # Australia by macroarea OR country of use. (Country-only adds a handful of diaspora
    # languages e.g. Yiddish/Fiji Hindi; they get no AUSTLANG match and are dropped from the
    # registry, whose scope is macroarea=Australia OR an AUSTLANG code points to it.)
    au_codes = {gc for gc, r in glang.items()
                if macro_has_australia(r) or has_au_country(r)}

    # names.csv -> per-glottocode name variants (+ provider), and an AU name index
    variants = defaultdict(set)     # glottocode -> set(name strings)
    providers = defaultdict(set)    # glottocode -> set(providers)
    name_index = defaultdict(set)   # normalized name -> {glottocode}  (AU languoids only)
    for gc in au_codes:
        cn = name_of.get(gc)
        if cn:
            variants[gc].add(cn)
            name_index[norm_name(cn)].add(gc)
    for r in read_csv(os.path.join(D, "glottolog/cldf/names.csv")):
        gc = r["Language_ID"]
        if gc not in au_codes:
            continue
        nm = (r.get("Name") or "").strip()
        if not nm or nm.lower() == "not specified":
            continue
        variants[gc].add(nm)
        providers[gc].add(r.get("Provider") or "")
        n = norm_name(nm)
        if len(n) >= 3:
            name_index[n].add(gc)

    # values.csv -> classification (family chain) + aes (endangerment)
    classification = {}             # glottocode -> [ancestor glottocodes]
    aes_val = {}                    # glottocode -> (int level, code label)
    AES_LABEL = {
        "aes-not_endangered": "not endangered", "aes-threatened": "threatened",
        "aes-shifting": "shifting", "aes-moribund": "moribund",
        "aes-nearly_extinct": "nearly extinct", "aes-extinct": "extinct",
    }
    for r in read_csv(os.path.join(D, "glottolog/cldf/values.csv")):
        p = r["Parameter_ID"]
        if p == "classification":
            v = r["Value"] or ""
            classification[r["Language_ID"]] = [x for x in v.split("/") if x]
        elif p == "aes":
            code = r["Code_ID"] or ""
            lvl = num(r["Value"])
            aes_val[r["Language_ID"]] = (int(lvl) if lvl is not None else None,
                                          AES_LABEL.get(code, code))

    # ---------- Grambank ----------
    gb_langs = {}                   # glottocode -> grambank row
    for r in read_csv(os.path.join(D, "grambank/cldf/languages.csv")):
        gc = r.get("Glottocode") or r.get("ID")
        if gc:
            gb_langs[gc] = r
    gb_id_to_gc = {r["ID"]: (r.get("Glottocode") or r["ID"]) for r in
                   read_csv(os.path.join(D, "grambank/cldf/languages.csv"))}
    gb_count = defaultdict(int)     # glottocode -> #coded features
    for r in read_csv(os.path.join(D, "grambank/cldf/values.csv")):
        val = (r.get("Value") or "").strip()
        if val and val != "?":
            gc = gb_id_to_gc.get(r["Language_ID"])
            if gc:
                gb_count[gc] += 1

    # ---------- WALS ----------
    wals_gc = defaultdict(list)     # glottocode -> [wals language ids]
    wals_id_to_gc = {}
    for r in read_csv(os.path.join(D, "wals/cldf/languages.csv")):
        gc = (r.get("Glottocode") or "").strip()
        if gc:
            wals_gc[gc].append(r["ID"])
            wals_id_to_gc[r["ID"]] = gc
    wals_count = defaultdict(int)   # glottocode -> #feature values (summed over wals langs)
    for r in read_csv(os.path.join(D, "wals/cldf/values.csv")):
        val = (r.get("Value") or "").strip()
        if val:
            gc = wals_id_to_gc.get(r["Language_ID"])
            if gc:
                wals_count[gc] += 1

    # ---------- AUSTLANG ----------
    austlang = list(read_csv(os.path.join(D, "austlang/austlang_dataset.csv")))
    # join each AUSTLANG code -> glottocode by name/synonym overlap
    al_match = {}                   # austlang code -> dict(glottocode, score, margin, method, confidence)
    gc_to_austlang = defaultdict(list)   # glottocode -> [austlang code rows]
    for r in austlang:
        code = (r.get("language_code") or "").strip()
        prim = norm_name(r.get("language_name") or "")
        syns = [norm_name(s) for s in (r.get("language_synonym") or "").split("|")]
        scores = defaultdict(int)
        for gc in name_index.get(prim, ()):    # primary name match (weight 3)
            scores[gc] += 3
        for s in syns:                          # synonym matches (weight 1)
            if len(s) < 3:
                continue
            for gc in name_index.get(s, ()):
                scores[gc] += 1
        if not scores:
            al_match[code] = dict(glottocode=None, score=0, margin=0,
                                  method="none", confidence="unmapped")
            continue
        ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
        best_gc, best = ranked[0]
        margin = best - (ranked[1][1] if len(ranked) > 1 else 0)
        primary_hit = best_gc in name_index.get(prim, ())
        if primary_hit and margin > 0:
            conf, meth = "high", "primary-name-exact"
        elif primary_hit:
            conf, meth = "medium", "primary-name-tie"
        elif best >= 2 and margin > 0:
            conf, meth = "medium", "synonym-vote"
        else:
            conf, meth = "low", "synonym-weak"
        # distance sanity gate (only when both the variety and the glottocode have coords)
        alat, alon = num(r.get("approximate_latitude_of_language_variety")), \
                     num(r.get("approximate_longitude_of_language_variety"))
        glat, glon = num(glang.get(best_gc, {}).get("Latitude")), \
                     num(glang.get(best_gc, {}).get("Longitude"))
        if (conf != "high" and alat not in (None, 0) and alon not in (None, 0)
                and glat is not None and glon is not None
                and haversine_km((alat, alon), (glat, glon)) > MATCH_MAX_KM):
            al_match[code] = dict(glottocode=None, score=best, margin=margin,
                                  method="rejected-distance", confidence="unmapped")
            continue
        al_match[code] = dict(glottocode=best_gc, score=best, margin=margin,
                              method=meth, confidence=conf)
        gc_to_austlang[best_gc].append(r)

    # ---------- assemble registry ----------
    def family_chain(gc):
        chain = classification.get(gc, [])
        return [{"glottocode": a, "name": name_of.get(a, a)} for a in chain]

    def coords(gc, al_rows):
        la, lo = num(glang.get(gc, {}).get("Latitude")), num(glang.get(gc, {}).get("Longitude"))
        src = "glottolog"
        if la is None or lo is None or (la == 0 and lo == 0):
            for ar in al_rows:
                ala = num(ar.get("approximate_latitude_of_language_variety"))
                alo = num(ar.get("approximate_longitude_of_language_variety"))
                if ala not in (None, 0) or alo not in (None, 0):
                    return ala, alo, "austlang"
            return None, None, None
        return la, lo, src

    # Registry scope: Glottolog languoids whose macroarea includes Australia (Aboriginal
    # languages), UNION any glottocode an AUSTLANG code maps to (keeps Torres Strait Islander
    # languages such as Meriam whose macroarea is Papunesia). Diaspora languages associated
    # with AU only by country-of-use are excluded.
    registry_gcs = {gc for gc, r in glang.items()
                    if macro_has_australia(r) or gc in gc_to_austlang}
    rows = []
    for gc in sorted(registry_gcs):
        r = glang[gc]
        level = r["Level"]
        if level == "family":
            continue                 # families are groupings, not languoids-as-rows
        al_rows = gc_to_austlang.get(gc, [])
        la, lo, csrc = coords(gc, al_rows)
        aes = aes_val.get(gc, (None, None))
        alt = sorted(n for n in variants.get(gc, set()) if n != r["Name"])
        row = {
            "glottocode": gc,
            "canonical_name": r["Name"],
            "level": level,
            "iso639_3": (r.get("ISO639P3code") or None),
            "austlang_codes": sorted(ar["language_code"] for ar in al_rows),
            "austlang_matches": sorted(
                ({"code": ar["language_code"],
                  "confidence": al_match[ar["language_code"]]["confidence"],
                  "method": al_match[ar["language_code"]]["method"]}
                 for ar in al_rows), key=lambda m: m["code"]),
            "alt_names": alt,
            "family": (name_of.get(classification.get(gc, [None])[0])
                       if classification.get(gc) else ("(isolate)" if not classification.get(gc) else None)),
            "family_chain": family_chain(gc),
            "latitude": la, "longitude": lo, "coord_source": csrc,
            "macroarea": r.get("Macroarea") or None,
            "macroarea_note": (None if (r.get("Macroarea") or "") == "Australia"
                               else "non-Australia macroarea (Torres Strait / offshore) — kept via AUSTLANG membership"),
            "state": None,           # not present in the open Glottolog / data.gov.au AUSTLANG exports
            "region": r.get("Macroarea") or None,
            "endangerment_aes_level": aes[0],
            "endangerment_aes_label": aes[1],
            "grambank_coverage": gc in gb_langs,
            "grambank_feature_count": gb_count.get(gc, 0),
            "wals_coverage": gc in wals_gc,
            "wals_feature_count": wals_count.get(gc, 0),
            "source": "glottolog",
        }
        rows.append(row)

    # AUSTLANG-only rows (membership scope, no Glottolog match)
    unmapped = []
    seen_codes = {c for c, m in al_match.items() if m["glottocode"]}
    for r in austlang:
        code = (r.get("language_code") or "").strip()
        if code in seen_codes:
            continue
        la = num(r.get("approximate_latitude_of_language_variety"))
        lo = num(r.get("approximate_longitude_of_language_variety"))
        if la == 0 and lo == 0:
            la = lo = None
        entry = {
            "glottocode": None,
            "canonical_name": r.get("language_name"),
            "level": None,
            "iso639_3": None,
            "austlang_codes": [code],
            "alt_names": [s for s in (r.get("language_synonym") or "").split("|") if s],
            "family": None, "family_chain": [],
            "latitude": la, "longitude": lo,
            "coord_source": ("austlang" if la is not None else None),
            "macroarea": "Australia",
            "state": None, "region": "Australia",
            "endangerment_aes_level": None, "endangerment_aes_label": None,
            "grambank_coverage": False, "grambank_feature_count": 0,
            "wals_coverage": False, "wals_feature_count": 0,
            "source": "austlang-only",
            "austlang_uri": r.get("uri"),
        }
        rows.append(entry)
        unmapped.append({"language_code": code, "language_name": r.get("language_name"),
                         "uri": r.get("uri")})

    # ---------- quality checks ----------
    gcs = [r["glottocode"] for r in rows if r["glottocode"]]
    dup = sorted({g for g in gcs if gcs.count(g) > 1})
    def in_bbox(r):
        la, lo = r["latitude"], r["longitude"]
        if la is None or lo is None:
            return None
        return (AUS_BBOX["lat_min"] <= la <= AUS_BBOX["lat_max"]
                and AUS_BBOX["lon_min"] <= lo <= AUS_BBOX["lon_max"])
    outside = [{"glottocode": r["glottocode"], "name": r["canonical_name"],
                "lat": r["latitude"], "lon": r["longitude"]}
               for r in rows if in_bbox(r) is False]

    glotto_rows = [r for r in rows if r["source"] == "glottolog"]
    by_gc = {r["glottocode"]: r for r in rows if r["glottocode"]}
    def spot(gc):
        r = by_gc.get(gc)
        if not r:
            return {"glottocode": gc, "found": False}
        return {"glottocode": gc, "found": True, "name": r["canonical_name"],
                "iso": r["iso639_3"], "austlang": r["austlang_codes"],
                "lat": r["latitude"], "lon": r["longitude"], "family": r["family"],
                "grambank": r["grambank_feature_count"], "wals": r["wals_feature_count"],
                "in_bbox": in_bbox(r)}
    spotchecks = {name: spot(gc) for name, gc in [
        ("Kuku Yalanji", "kuku1273"), ("Warlpiri", "warl1254"),
        ("Djambarrpuyngu (Yolngu Matha)", "djam1256"),
        ("Dhuwal (Yolngu Matha)", "dhuw1249"),
        ("Kaurna", "kaur1267"), ("Anindilyakwa", "anin1240")]}
    nonaus_kept = [{"glottocode": r["glottocode"], "name": r["canonical_name"],
                    "macroarea": r["macroarea"], "austlang": r["austlang_codes"]}
                   for r in glotto_rows if (r["macroarea"] or "") != "Australia"]
    stats = {
        "total_languoids": len(rows),
        "glottolog_languoids": len(glotto_rows),
        "austlang_only_languoids": len(unmapped),
        "by_level": {lv: sum(1 for r in glotto_rows if r["level"] == lv)
                     for lv in sorted({r["level"] for r in glotto_rows})},
        "with_coords": sum(1 for r in rows if r["latitude"] is not None),
        "with_iso639_3": sum(1 for r in glotto_rows if r["iso639_3"]),
        "with_austlang_code": sum(1 for r in rows if r["austlang_codes"]),
        "with_grambank": sum(1 for r in rows if r["grambank_coverage"]),
        "with_wals": sum(1 for r in rows if r["wals_coverage"]),
        "austlang_total_codes": len(austlang),
        "austlang_mapped_codes": len(seen_codes),
        "austlang_unmapped_codes": len(unmapped),
        "austlang_match_confidence": {
            band: sum(1 for m in al_match.values() if m["confidence"] == band)
            for band in ["high", "medium", "low", "unmapped"]},
        "austlang_rejected_by_distance_gate": sum(
            1 for m in al_match.values() if m["method"] == "rejected-distance"),
        "duplicate_glottocodes": dup,
        "coords_outside_australia_bbox": outside,
        "aus_bbox": AUS_BBOX,
        "non_australia_macroarea_kept": nonaus_kept,
        "spot_checks": spotchecks,
    }

    meta = {
        "_meta": {
            "title": "Master registry of Australian Aboriginal & Torres Strait Islander languoids",
            "generator": "build_registry.py",
            "sources": {
                "glottolog": "Glottolog 5.3 CLDF (glottolog/glottolog-cldf v5.3, CC-BY-4.0)",
                "grambank": "Grambank v1.0.3 CLDF (grambank/grambank, CC-BY-4.0)",
                "wals": "WALS Online CLDF (cldf-datasets/wals v2020.4, CC-BY-4.0)",
                "austlang": "AIATSIS AUSTLANG dataset via data.gov.au (CC-BY-4.0)",
            },
            "join_method": "AUSTLANG<->Glottocode by shared name/synonym overlap "
                           "(Glottolog-ingested AIATSIS name variants); ISO 639-3 from Glottolog.",
            "notes": [
                "state/region: not present in the open Glottolog or data.gov.au AUSTLANG exports; "
                "left null. macroarea (Glottolog) used as region. Fuller AIATSIS export carries "
                "state but is terms-gated (see SOURCES.md access plan).",
                "AUSTLANG is more granular than Glottolog: several AUSTLANG codes may map to one "
                "glottocode. Torres Strait languoids are kept and fall inside the AU bounding box.",
            ],
        },
        "stats": stats,
    }

    with open(os.path.join(OUT, "australian_languages_registry.json"), "w", encoding="utf-8") as f:
        json.dump({**meta, "languoids": rows}, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "registry_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "austlang_unmapped.json"), "w", encoding="utf-8") as f:
        json.dump(unmapped, f, ensure_ascii=False, indent=2)

    # flat CSV
    cols = ["glottocode", "canonical_name", "level", "iso639_3", "austlang_codes",
            "family", "latitude", "longitude", "coord_source", "macroarea", "state",
            "endangerment_aes_level", "endangerment_aes_label", "grambank_coverage",
            "grambank_feature_count", "wals_coverage", "wals_feature_count", "source"]
    with open(os.path.join(OUT, "australian_languages_registry.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            w.writerow([("|".join(r[c]) if isinstance(r[c], list) else r[c]) for c in cols])

    print(json.dumps(stats, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()

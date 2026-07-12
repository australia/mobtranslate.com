#!/usr/bin/env python3
"""
build_dictionaries.py — Mass-convert open Australian-language lexical sources into
mobtranslate `dictionaries/<slug>/dictionary.yaml` files, with an honest per-source
`meta` tier block (tier / source / license / attribution / registry linkage).

Two source tiers are emitted (a third, the hand-built rich dictionaries such as
kuku_yalanji / migmaq / anindilyakwa / wajarri, is NEVER touched by this script):

  A. WIKTIONARY   community-sourced, CC-BY-SA-4.0
     research/australian-languages/wiktionary/parsed/<slug>.json
       -> dictionaries/<slug>/dictionary.yaml   (tier_id: wiktionary)
     Directories that already exist in the repo are LEFT ALONE (the 5 already-committed
     Wiktionary dicts + the rich dicts) — richer / already-committed material wins.

  B. CURR 1886-87  historical wordlist, public domain
     research/australian-languages/curr/parsed/vocabularies.json
       -> dictionaries/curr_<n>_<locality>/dictionary.yaml   (tier_id: curr)
     E. M. Curr, *The Australian Race* (1886-87) comparative vocabularies. OCR is noisy;
     only genuine vocabulary rows are kept (native token + short English gloss), and only
     vocabularies with >= MIN_CURR_PAIRS clean rows are published. Identity is FUZZY by
     nature: a vocabulary is mapped to a registry languoid ONLY when the cleaned locality
     is a near-exact (>= MAP_CONFIDENT) match to a languoid name/synonym; otherwise it is
     published unmapped (language_link: null) with any close candidates listed. Never force
     a wrong identity. Every entry keeps its Curr number + locality as provenance.

Pure Python + PyYAML. Deterministic. Idempotent (re-running regenerates identical files).

Reads the research mount READ-ONLY; writes only into <repo>/dictionaries/.

Usage:
  python3 build_dictionaries.py \
      --data-dir /mnt/donto-data/donto-resources/research/australian-languages \
      --repo-dir /mnt/donto-data/workspace/mobtranslate.com
"""
import argparse, json, os, re, sys, difflib, unicodedata
from collections import defaultdict

import yaml

TODAY = "2026-07-12"
MIN_WIKT_LEMMAS = 10        # task 3a
MIN_CURR_PAIRS = 10         # task 3b honest floor (a real comparative wordlist)
MAP_CONFIDENT = 0.90        # locality vs registry name ratio to auto-map
MAP_CANDIDATE = 0.72        # ratio to list as a candidate

WIKT_TIER = "community-sourced (Wiktionary, CC-BY-SA-4.0)"
CURR_TIER = "historical wordlist (E.M. Curr, The Australian Race, 1886-87 — public domain)"


# --------------------------------------------------------------------------- utils
def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def slugify(s, maxlen=48):
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
    return s[:maxlen].strip("_")


def coarse_region(lat, lon):
    """Very rough AU state hint from coordinates — a geographic label only, never an
    identity claim. Returns '' when outside Australia or unknown."""
    if lat is None or lon is None:
        return ""
    try:
        lat = float(lat); lon = float(lon)
    except (TypeError, ValueError):
        return ""
    if not (-45 <= lat <= -9 and 112 <= lon <= 155):
        return ""  # not mainland/Tasmania Australia (e.g. Torres Strait handled below)
    if lat <= -39.5:
        return "Tasmania"
    if lon < 129:
        return "Western Australia"
    if lon < 141 and lat < -26:
        return "South Australia"
    if lon < 138 and lat >= -26:
        return "Northern Territory"
    if lat >= -29 and lon >= 138:
        return "Queensland"
    if lat < -34 and lon >= 141:
        return "Victoria"
    if lon >= 141 and lat >= -37.5:
        return "New South Wales"
    return "Australia"


# --------------------------------------------------------------------------- registry
class Registry:
    def __init__(self, path):
        data = json.load(open(path, encoding="utf-8"))
        self.languoids = data["languoids"]
        # name -> list of languoids (canonical + alt names)
        self.by_name = defaultdict(list)
        for lg in self.languoids:
            names = [lg.get("canonical_name")] + list(lg.get("alt_names") or [])
            for nm in names:
                n = norm(nm)
                if n:
                    self.by_name[n].append(lg)
        self.name_keys = list(self.by_name.keys())

    def match(self, name):
        """Return (languoid, ratio) best name match, or (None, 0)."""
        n = norm(name)
        if not n:
            return None, 0.0
        if n in self.by_name:
            return self.by_name[n][0], 1.0
        best = difflib.get_close_matches(n, self.name_keys, n=1, cutoff=MAP_CANDIDATE)
        if best:
            r = difflib.SequenceMatcher(None, n, best[0]).ratio()
            return self.by_name[best[0]][0], r
        return None, 0.0

    def enrich(self, languoid):
        """Meta fields derived from a registry languoid."""
        if not languoid:
            return {}
        lat, lon = languoid.get("latitude"), languoid.get("longitude")
        region = coarse_region(lat, lon) or (languoid.get("state") or "")
        out = {
            "family": languoid.get("family") or None,
            "glottocode": languoid.get("glottocode") or None,
            "iso639_3": languoid.get("iso639_3") or None,
            "austlang_codes": list(languoid.get("austlang_codes") or []) or None,
            "region": region or None,
        }
        if lat is not None and lon is not None:
            out["coordinates"] = {"lat": lat, "lon": lon}
        return {k: v for k, v in out.items() if v is not None}


# --------------------------------------------------------------------------- YAML io
def write_dict(repo_dir, slug, meta, words, dry=False):
    d = os.path.join(repo_dir, "dictionaries", slug)
    payload = {"meta": meta, "words": words}
    if dry:
        return d
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "dictionary.yaml"), "w", encoding="utf-8") as f:
        yaml.safe_dump(
            payload, f, allow_unicode=True, sort_keys=False,
            default_flow_style=False, width=100,
        )
    return d


# --------------------------------------------------------------------------- wiktionary
BAD_WORD = re.compile(r"[/]|(?:\bA to\b)|^\s*$")


def clean_wikt_word(w):
    w = (w or "").strip()
    if not w or len(w) > 60:
        return None
    if BAD_WORD.search(w):
        return None
    return w


def build_wiktionary(data_dir, repo_dir, reg, existing_dirs, report):
    pdir = os.path.join(data_dir, "wiktionary", "parsed")
    files = sorted(f for f in os.listdir(pdir) if f.endswith(".json")
                   and not f.endswith("manifest.json"))
    made = skipped = 0
    for fn in files:
        slug = fn[:-5]
        d = json.load(open(os.path.join(pdir, fn), encoding="utf-8"))
        name = d.get("language") or slug.replace("_", " ").title()
        entries = d.get("entries") or []
        words = []
        for e in entries:
            w = clean_wikt_word(e.get("word"))
            if not w:
                continue
            glosses = [g.strip() for g in (e.get("glosses") or []) if g and g.strip()]
            if not glosses:
                continue
            row = {"word": w}
            if e.get("pos"):
                row["type"] = e["pos"]
            row["definitions"] = glosses
            row["translations"] = glosses
            words.append(row)
        if len(words) < MIN_WIKT_LEMMAS:
            report["wikt_below_threshold"].append({"slug": slug, "words": len(words)})
            continue
        # Never overwrite an already-committed dir (the 5 committed + rich dicts).
        if slug in existing_dirs:
            report["wikt_existing_skipped"].append({"slug": slug, "words": len(words)})
            skipped += 1
            continue
        lg, ratio = reg.match(name)
        enr = reg.enrich(lg if ratio >= 0.85 else None)
        meta = {
            "name": name,
            "description": _wikt_desc(name, enr),
            "tier": WIKT_TIER,
            "tier_id": "wiktionary",
            "source": "English Wiktionary (en.wiktionary.org)",
            "source_url": f"https://en.wiktionary.org/wiki/Category:{name.replace(' ', '_')}_lemmas",
            "license": "CC-BY-SA-4.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
            "attribution": (
                f"Wiktionary contributors, “Category:{name} lemmas”, English Wiktionary, "
                f"retrieved {TODAY}. Text is available under CC-BY-SA 4.0."
            ),
            "extracted": TODAY,
            "word_count": len(words),
        }
        for k, v in enr.items():
            meta.setdefault(k, v)
        write_dict(repo_dir, slug, meta, words)
        report["wiktionary"].append({"slug": slug, "name": name, "words": len(words),
                                     "glottocode": enr.get("glottocode")})
        made += 1
    return made, skipped


def _wikt_desc(name, enr):
    fam = enr.get("family")
    reg = enr.get("region")
    bits = f"{name} is"
    if fam and reg:
        bits += f" a {fam} language of {reg}"
    elif fam:
        bits += f" a {fam} language of Australia"
    else:
        bits += " an Australian Aboriginal language"
    bits += ". Lexicon sourced from English Wiktionary (CC-BY-SA 4.0)."
    return bits


# --------------------------------------------------------------------------- curr
NATIVE_TOK = re.compile(r"^[A-Za-z][A-Za-z'’.\-]{1,19}$")
CONT = re.compile(r"(?i)(?:^|[\s\W])(?:cont|contin|conttn|isontint|corumu|conttnu).*$")


def clean_curr_pairs(vocab):
    out = []
    seen = set()
    for w in vocab.get("words", []):
        native = (w.get("word") or "").strip().strip(".,;:()")
        eng = (w.get("english") or "").strip()
        if not native or not eng:
            continue
        if " " in native:
            continue
        if len(eng) > 28 or len(eng.split()) > 4:
            continue
        if not NATIVE_TOK.match(native):
            continue
        key = (norm(native), norm(eng))
        if key in seen:
            continue
        seen.add(key)
        out.append((eng, native))
    return out


def clean_locality(raw):
    s = raw or ""
    s = re.sub(r"[\^_~`*|]", " ", s)          # drop OCR speckle chars
    s = CONT.sub("", s)                        # strip "…continued" tails
    s = re.sub(r"[^A-Za-z0-9 ,.'\-/]", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" ,.-/")
    # Title-case tokens that are ALLCAPS or lowercase; leave mixed alone.
    toks = []
    for t in s.split():
        if t.isupper() or t.islower():
            toks.append(t.capitalize())
        else:
            toks.append(t)
    label = " ".join(toks).strip()
    # crude garbage gate: needs some vowels + >=3 alpha chars
    alpha = re.sub(r"[^A-Za-z]", "", label)
    if len(alpha) < 3 or not re.search(r"[aeiouAEIOU]", alpha):
        return ""
    return label


def locality_score(raw):
    """Higher = a cleaner, more trustworthy locality label. Penalises OCR 'continued'
    fragments and garbled strings so the base page's locality wins the merge."""
    label = clean_locality(raw)
    if not label:
        return -1, ""
    alpha = re.sub(r"[^A-Za-z]", "", label)
    score = len(alpha)
    if re.search(r"(?i)contin|ontinu|eontin|onttn", raw or ""):
        score -= 100
    # ALLCAPS originals are Curr's clean headers; garbled OCR is mixed-case noise.
    if (raw or "").isupper():
        score += 20
    return score, label


def build_curr(data_dir, repo_dir, reg, existing_names, report):
    voc = json.load(open(os.path.join(data_dir, "curr", "parsed", "vocabularies.json"),
                         encoding="utf-8"))["vocabularies"]
    # Curr numbers a vocabulary per locality/tribe; OCR split many across pages that
    # SHARE the number ('…continued'). Merge every fragment of a number into ONE
    # wordlist and keep the cleanest locality label.
    groups = defaultdict(list)
    order = []
    for v in voc:
        n = v.get("number")
        if n not in groups:
            order.append(n)
        groups[n].append(v)

    made = 0
    used_slugs = set()
    for num in order:
        frags = groups[num]
        # merge + dedup clean pairs across fragments
        seen = set()
        pairs = []
        for fr in frags:
            for eng, native in clean_curr_pairs(fr):
                key = (norm(native), norm(eng))
                if key in seen:
                    continue
                seen.add(key)
                pairs.append((eng, native))
        if len(pairs) < MIN_CURR_PAIRS:
            report["curr_below_threshold"].append({"number": num, "clean": len(pairs)})
            continue
        # cleanest locality wins
        best_raw, best = "", (-2, "")
        for fr in frags:
            sc = locality_score(fr.get("location") or "")
            if sc[0] > best[0]:
                best, best_raw = sc, (fr.get("location") or "")
        raw_loc = best_raw
        loc = best[1]
        volume = frags[0].get("volume")
        # attempt confident identity mapping from the cleaned locality
        lang_link = None
        candidates = []
        if loc:
            lg, ratio = reg.match(loc)
            if lg and ratio >= MAP_CONFIDENT and norm(lg.get("canonical_name")) not in existing_names:
                lang_link = lg.get("glottocode") or slugify(lg.get("canonical_name"))
                report["curr_mapped"].append({"number": num, "locality": loc,
                                              "language": lg.get("canonical_name"),
                                              "glottocode": lg.get("glottocode"),
                                              "ratio": round(ratio, 3)})
            else:
                # surface close names as non-binding candidates
                n = norm(loc)
                for key in difflib.get_close_matches(n, reg.name_keys, n=3, cutoff=MAP_CANDIDATE):
                    lg2 = reg.by_name[key][0]
                    candidates.append({
                        "name": lg2.get("canonical_name"),
                        "glottocode": lg2.get("glottocode"),
                        "score": round(difflib.SequenceMatcher(None, n, key).ratio(), 3),
                    })
        display_loc = loc if loc else f"Curr Vocabulary #{num}"
        name = f"{display_loc} (Curr #{num})"
        # languages.code is varchar(50); keep the whole slug well under that.
        prefix = f"curr_{num}_"
        base = slugify(loc, maxlen=max(4, 44 - len(prefix))) if loc else ""
        slug = (prefix + base).strip("_") if base else f"curr_{num}"
        while slug in used_slugs:
            slug = (slug + "x")[:50]
        used_slugs.add(slug)

        words = []
        for eng, native in pairs:
            words.append({"word": native, "definitions": [eng], "translations": [eng]})

        enr = {}
        if lang_link:
            lg, _ = reg.match(loc)
            enr = reg.enrich(lg)
        meta = {
            "name": name,
            "description": (
                f"Historical comparative wordlist for the locality “{display_loc}”, "
                f"vocabulary no. {num} in E. M. Curr, *The Australian Race* (1886-87). "
                f"Colonial-era, ~{len(words)}-word list transcribed from archive.org OCR — "
                f"spellings and identifications are of their time and unverified."
            ),
            "tier": CURR_TIER,
            "tier_id": "curr",
            "source": "E. M. Curr, The Australian Race (1886-87)",
            "source_url": "https://archive.org/details/australianrace01curruoft",
            "license": "Public Domain",
            "license_url": "https://en.wikipedia.org/wiki/Public_domain",
            "attribution": (
                f"E. M. Curr (ed.), *The Australian Race*, Melbourne, 1886-87. "
                f"Comparative vocabulary no. {num}, “{display_loc}”. Public domain; "
                f"digitised by archive.org. Transcribed via OCR."
            ),
            "curr_number": num,
            "curr_volume": volume,
            "locality": display_loc,
            "locality_raw": raw_loc,
            "language_link": lang_link,
            "extracted": TODAY,
            "word_count": len(words),
        }
        if candidates:
            meta["candidates"] = candidates
        for k, val in enr.items():
            meta.setdefault(k, val)
        write_dict(repo_dir, slug, meta, words)
        made += 1
    return made


# --------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="/mnt/donto-data/donto-resources/research/australian-languages")
    ap.add_argument("--repo-dir", default="/mnt/donto-data/workspace/mobtranslate.com")
    ap.add_argument("--tier", choices=["all", "wiktionary", "curr"], default="all")
    args = ap.parse_args()

    reg = Registry(os.path.join(args.data_dir, "registry",
                                "australian_languages_registry.json"))
    dict_root = os.path.join(args.repo_dir, "dictionaries")
    existing_dirs = {d for d in os.listdir(dict_root)
                     if os.path.isdir(os.path.join(dict_root, d))
                     and not d.startswith((".", "node_modules"))}
    # names already claimed by an existing (committed / rich) dictionary — so Curr
    # never fabricates a competing identity for a language we already publish.
    existing_names = set()
    for d in existing_dirs:
        yp = os.path.join(dict_root, d, "dictionary.yaml")
        if os.path.exists(yp):
            try:
                m = yaml.safe_load(open(yp, encoding="utf-8"))
                if isinstance(m, dict) and m.get("meta", {}).get("name"):
                    existing_names.add(norm(m["meta"]["name"]))
            except Exception:
                pass
        existing_names.add(norm(d))

    report = defaultdict(list)
    if args.tier in ("all", "wiktionary"):
        w_made, w_skip = build_wiktionary(args.data_dir, args.repo_dir, reg,
                                          existing_dirs, report)
    else:
        w_made = w_skip = 0
    if args.tier in ("all", "curr"):
        c_made = build_curr(args.data_dir, args.repo_dir, reg, existing_names, report)
    else:
        c_made = 0

    summary = {
        "generated": TODAY,
        "wiktionary_dicts_written": w_made,
        "wiktionary_existing_skipped": w_skip,
        "wiktionary_below_threshold": len(report["wikt_below_threshold"]),
        "curr_dicts_written": c_made,
        "curr_mapped_to_language": len(report["curr_mapped"]),
        "curr_below_threshold": len(report["curr_below_threshold"]),
        "detail": dict(report),
    }
    out = os.path.join(args.repo_dir, "dictionaries", ".generated-manifest.json")
    json.dump(summary, open(out, "w"), indent=1)
    print(json.dumps({k: v for k, v in summary.items() if k != "detail"}, indent=1))
    print(f"manifest -> {out}")


if __name__ == "__main__":
    main()

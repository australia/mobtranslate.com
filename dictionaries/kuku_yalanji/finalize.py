#!/usr/bin/env python3
"""Finalise the enriched dictionary:
  1. prune trivial commentary (notes that merely restate the gloss/definition)
  2. insert verified missing lexemes (accepted_words.json) in alphabetical position,
     generating phonemic transcriptions for them
  3. re-order fields and write dictionary.yaml

Usage:  python3 finalize.py [--dry-run]
"""
import argparse
import json
import os
import re
from collections import OrderedDict, Counter

import yaml

# reuse phonemic from enrich.py
import importlib.util
_spec = importlib.util.spec_from_file_location("enrich", os.path.join(os.path.dirname(os.path.abspath(__file__)), "enrich.py"))
_enrich = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_enrich)
phonemic = _enrich.phonemic

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "dictionary.yaml")
ACCEPTED = os.path.join(HERE, "accepted_words.json")

ORDER = ["word", "type", "phonemic", "gloss", "definitions", "translations",
         "examples", "synonyms", "see_also", "usages", "reduplication",
         "verb_class", "derivation", "semantic_domain", "loanword", "dialect",
         "commentary", "needs_review", "meaning", "maybe", "source"]

# commentary that carries real information keeps these signals
KEEP_SIGNALS = ["§", "loan", "reduplicat", "dialect", "nyungkul", "yalanji", "jalunji",
                "place name", "personal name", "kin", "correction", "compound", "derived",
                "english", "lit", "cf", "related", "polysem", "intensif", "homophon",
                "register", "obsolete", "attested", "moiety", "species", "used", "story",
                "site", "spelled", "variant", "from ", "stem", "baby talk", "taboo"]


def norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", str(s).lower())


def tokens(s):
    return set(t for t in norm(s).split() if len(t) > 2)


def is_trivial(note, deftext):
    n = note.lower()
    if any(sig in n for sig in KEEP_SIGNALS):
        return False
    nt = tokens(note)
    if not nt:
        return True
    dt = tokens(deftext)
    # trivial if (almost) all note tokens are already in the definition/gloss
    overlap = len(nt & dt) / len(nt)
    return overlap >= 0.8


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = yaml.safe_load(open(SRC, encoding="utf-8"))
    words = data.get("words", [])
    rep = Counter()

    # 1. prune trivial commentary
    for w in words:
        if not isinstance(w, dict):
            continue
        notes = w.get("commentary")
        if not notes:
            continue
        if isinstance(notes, str):
            notes = [notes]
        deftext = " ".join(map(str, (w.get("definitions") or []))) + " " + \
                  " ".join(map(str, (w.get("translations") or []))) + " " + str(w.get("gloss") or "")
        kept = [n for n in notes if not is_trivial(n, deftext)]
        rep["commentary_pruned"] += len(notes) - len(kept)
        if kept:
            w["commentary"] = kept
        else:
            w.pop("commentary", None)

    # 2. insert verified missing lexemes
    added = []
    if os.path.exists(ACCEPTED):
        accepted = json.load(open(ACCEPTED, encoding="utf-8"))
        existing = {str(w.get("word", "")).strip().lower() for w in words if isinstance(w, dict)}
        for e in accepted:
            wd = str(e.get("word", "")).strip()
            if not wd or wd.lower() in existing:
                rep["missing_skipped_dup"] += 1
                continue
            existing.add(wd.lower())
            entry = {"word": wd}
            if e.get("type"):
                entry["type"] = e["type"]
            ipa = phonemic(wd)
            if ipa:
                entry["phonemic"] = ipa
            if e.get("gloss"):
                entry["gloss"] = e["gloss"]
            if e.get("definition"):
                entry["definitions"] = [e["definition"]]
            if e.get("gloss"):
                entry["translations"] = [e["gloss"]]
            if e.get("semantic_domain") and e["semantic_domain"] != "uncategorised":
                entry["semantic_domain"] = e["semantic_domain"]
            if e.get("loanword_source"):
                entry["loanword"] = {"source": e["loanword_source"], "reference": "Patz §2.3/§3.12"}
            if e.get("dialect"):
                entry["dialect"] = e["dialect"]
            com = e.get("commentary") or []
            com = [c for c in com if c]
            com.append("Added from the reference grammar (Patz); not present in the original community dictionary.")
            entry["commentary"] = com
            entry["source"] = "grammar"
            added.append(entry)
        words.extend(added)
        rep["missing_added"] = len(added)

    # sort: keep alphabetical order (existing list is alphabetical; new entries slot in)
    def keyf(w):
        return re.sub(r"[^a-z]", "", str(w.get("word", "")).lower()) if isinstance(w, dict) else ""
    words = sorted(words, key=keyf)
    data["words"] = words

    print("FINALISE REPORT")
    for k in sorted(rep):
        print(f"  {k:22} {rep[k]}")
    print(f"  total entries          {sum(1 for w in words if isinstance(w, dict))}")
    if added:
        print("\n  sample added words:")
        for e in added[:12]:
            print(f"    {e['word']:18} ({e.get('type','?')}) {e.get('gloss','')}")

    if args.dry_run:
        print("\n(dry run — nothing written)")
        return

    class Dumper(yaml.SafeDumper):
        pass

    def ordered(w):
        out = OrderedDict()
        for k in ORDER:
            if k in w:
                out[k] = w[k]
        for k in w:
            if k not in out:
                out[k] = w[k]
        return out

    data["words"] = [ordered(w) if isinstance(w, dict) else w for w in words]
    Dumper.add_representer(OrderedDict,
                          lambda d, x: d.represent_mapping("tag:yaml.org,2002:map", x.items()))
    with open(SRC, "w", encoding="utf-8") as f:
        f.write("# Kuku Yalanji dictionary — enriched & corrected against Patz, "
                "A Grammar of the Kuku Yalanji Language.\n")
        f.write("# Source language data preserved; `commentary` records corrections; "
                "`source: grammar` marks lexemes added from the grammar. See SCHEMA.md.\n\n")
        yaml.dump(data, f, Dumper=Dumper, allow_unicode=True, sort_keys=False,
                  default_flow_style=False, width=4096)
    print(f"\nWrote {SRC}")


if __name__ == "__main__":
    main()

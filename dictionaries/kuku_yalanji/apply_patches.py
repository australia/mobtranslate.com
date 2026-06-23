#!/usr/bin/env python3
"""Apply additive LLM-proposed patches to dictionary.yaml.

Patches (patches.json) are produced by the ky-semantic-enrichment workflow and
contain ONLY additive fields keyed by entry index:
    {index, word, semantic_domain, part_of_speech?, commentary?, loanword?}

This merger guarantees the source language data is never altered:
  * word / definitions / translations are NEVER touched.
  * part_of_speech is applied to `type` ONLY when the entry currently lacks a
    valid controlled POS (i.e. it was empty/ambiguous and left for the LLM pass).
  * semantic_domain / loanword are added only if absent.
  * commentary is appended (deduplicated).
  * index+word must agree or the patch is skipped (reported).

Usage:  python3 apply_patches.py [--patches patches.json] [--dry-run]
"""
import argparse
import json
import os
from collections import OrderedDict, Counter

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "dictionary.yaml")

VALID_POS = {"noun", "adjective", "quantifier", "transitive-verb", "intransitive-verb",
             "adverb", "locational", "temporal", "personal-pronoun", "interrogative",
             "demonstrative", "particle", "interjection"}

ORDER = ["word", "type", "phonemic", "gloss", "definitions", "translations",
         "examples", "synonyms", "see_also", "usages", "reduplication",
         "verb_class", "derivation", "semantic_domain", "loanword", "dialect",
         "commentary", "needs_review", "meaning", "maybe"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--patches", default=os.path.join(HERE, "patches.json"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = yaml.safe_load(open(SRC, encoding="utf-8"))
    words = data.get("words", [])
    real = [w for w in words if isinstance(w, dict)]

    patches = json.load(open(args.patches, encoding="utf-8"))
    if isinstance(patches, dict):
        patches = patches.get("patches", [])

    rep = Counter()
    skipped = []
    for p in patches:
        idx = p.get("index")
        if idx is None or idx < 0 or idx >= len(real):
            skipped.append(("bad-index", p.get("word"), idx)); rep["skipped"] += 1; continue
        w = real[idx]
        if str(w.get("word", "")).strip() != str(p.get("word", "")).strip():
            skipped.append(("word-mismatch", p.get("word"), idx)); rep["skipped"] += 1; continue

        dom = p.get("semantic_domain")
        if dom and dom != "uncategorised" and "semantic_domain" not in w:
            w["semantic_domain"] = dom; rep["semantic_domain"] += 1

        pos = p.get("part_of_speech")
        cur = str(w.get("type") or "").strip().lower()
        if pos in VALID_POS and (cur == "" or cur not in VALID_POS):
            w["type"] = pos; rep["pos_filled"] += 1

        loan = p.get("loanword")
        if loan and "loanword" not in w:
            w["loanword"] = loan; rep["loanword"] += 1

        notes = p.get("commentary") or []
        if notes:
            cur_notes = w.get("commentary") or []
            if isinstance(cur_notes, str):
                cur_notes = [cur_notes]
            for n in notes:
                if n and n not in cur_notes:
                    cur_notes.append(n)
            w["commentary"] = cur_notes
            rep["commentary"] += 1

    print("PATCH APPLICATION REPORT")
    for k in sorted(rep):
        print(f"  {k:18} {rep[k]}")
    if skipped:
        print(f"\n  {len(skipped)} patches skipped (first 10):")
        for s in skipped[:10]:
            print("   ", s)

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
        f.write("# Source language data preserved; `commentary` records corrections. "
                "See SCHEMA.md for the field spec.\n\n")
        yaml.dump(data, f, Dumper=Dumper, allow_unicode=True, sort_keys=False,
                  default_flow_style=False, width=4096)
    print(f"\nWrote {SRC}")


if __name__ == "__main__":
    main()

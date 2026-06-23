#!/usr/bin/env python3
"""Diff grammar-harvested lexemes against the dictionary to find missing words.

Reads lexemes.json (output of the ky-grammar-lexemes workflow) and dictionary.yaml,
then reports Kuku Yalanji roots attested in the grammar that are absent from the
dictionary. Matching is deliberately GENEROUS (to avoid false "missing" claims):
a candidate counts as PRESENT if it equals a headword, is the root of a headword,
or is an inflected form built on a headword root.

Usage:  python3 find_missing.py [--min-confidence medium] > missing_report.txt
"""
import argparse
import json
import os
import re
from collections import defaultdict

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "dictionary.yaml")
LEX = os.path.join(HERE, "lexemes.json")

# inflectional/derivational suffixes worth stripping when comparing (Patz §3.2, §3.8)
SUFFIXES = ["mundu", "muny", "ngka", "nda", "nka", "ngku", "baja", "baka", "warra",
            "bulal", "kari", "mun", "bu", "ka", "ny", "da", "ji", "rr", "ku", "y", "l", "n", "m"]


def compact(s):
    return re.sub(r"[^a-z]", "", str(s).lower())


def strip_suffix(s):
    for suf in SUFFIXES:
        if s.endswith(suf) and len(s) - len(suf) >= 3:
            return s[: -len(suf)]
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-confidence", default="medium", choices=["high", "medium", "low"])
    args = ap.parse_args()
    rank = {"high": 3, "medium": 2, "low": 1}
    floor = rank[args.min_confidence]

    words = [w for w in yaml.safe_load(open(SRC, encoding="utf-8"))["words"] if isinstance(w, dict)]
    heads = set()
    head_roots = set()
    for w in words:
        c = compact(w.get("word", ""))
        if c:
            heads.add(c)
            head_roots.add(strip_suffix(c))
    # also each space/hyphen token of multiword headwords
    for w in words:
        for tok in re.split(r"[ -]", str(w.get("word", ""))):
            c = compact(tok)
            if len(c) >= 3:
                head_roots.add(strip_suffix(c))

    def present(root):
        c = compact(root)
        if not c:
            return True
        if c in heads:
            return True
        r = strip_suffix(c)
        if r in heads or r in head_roots or c in head_roots:
            return True
        # candidate is inflected form of a dict root, or dict has it as a root
        for hr in head_roots:
            if len(hr) >= 4 and (c.startswith(hr) or hr.startswith(c)) and abs(len(c) - len(hr)) <= 3:
                return True
        return False

    lex = json.load(open(LEX, encoding="utf-8"))
    if isinstance(lex, dict):
        lex = lex.get("lexemes", [])

    missing = defaultdict(lambda: {"glosses": set(), "sources": set(), "pos": set(), "conf": 0, "surface": set()})
    seen_total = 0
    for item in lex:
        root = (item.get("root") or "").strip()
        if not root:
            continue
        seen_total += 1
        if rank.get(item.get("confidence", "low"), 1) < floor:
            continue
        if present(root):
            continue
        key = compact(root)
        m = missing[key]
        m["display"] = root.lower()
        if item.get("gloss"):
            m["glosses"].add(item["gloss"].strip())
        if item.get("source"):
            m["sources"].add(item["source"].strip())
        if item.get("pos"):
            m["pos"].add(item["pos"].strip())
        if item.get("surface"):
            m["surface"].add(item["surface"].strip())
        m["conf"] = max(m["conf"], rank.get(item.get("confidence", "low"), 1))

    print(f"# Lexemes attested in the grammar but missing from the dictionary")
    print(f"# raw attestations: {seen_total}; distinct missing roots (>= {args.min_confidence} confidence): {len(missing)}\n")
    # high-confidence, multiply-attested first
    rows = sorted(missing.items(), key=lambda kv: (-kv[1]["conf"], -len(kv[1]["sources"]), kv[0]))
    for key, m in rows:
        conf = {3: "high", 2: "medium", 1: "low"}[m["conf"]]
        gl = "; ".join(sorted(m["glosses"]))[:120]
        pos = "/".join(sorted(m["pos"]))
        src = ", ".join(sorted(m["sources"]))[:80]
        print(f"{m['display']:22} [{conf:6}] ({pos}) — {gl}   << {src}")

    # machine-readable for the verification/merge step
    out = [{"root": m["display"], "glosses": sorted(m["glosses"]), "pos": sorted(m["pos"]),
            "sources": sorted(m["sources"]), "confidence": {3: "high", 2: "medium", 1: "low"}[m["conf"]]}
           for _, m in rows]
    json.dump(out, open(os.path.join(HERE, "missing_candidates.json"), "w"),
              ensure_ascii=False, indent=1)
    print(f"\n# wrote {len(out)} candidates to missing_candidates.json", file=__import__("sys").stderr)


if __name__ == "__main__":
    main()

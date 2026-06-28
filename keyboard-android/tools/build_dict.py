#!/usr/bin/env python3
"""
Build the keyboard's offline English -> Aboriginal-language suggestion index from
a TSV export of the MobTranslate dictionary (columns: code, name, word,
translation, definition).

Output: app/src/main/assets/dictionary/<code>.json, shaped as

    { "code": "...", "name": "...", "count": N,
      "entries": { "water": [{"w": "bana", "g": "water"}, ...], ... } }

The index is English keyword -> candidate target words, so typing an English
word in any app surfaces tappable translations. This is data prep, not runtime
logic; regenerate by re-running with a fresh TSV.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

STOPWORDS = {
    "the", "a", "an", "to", "of", "in", "on", "at", "and", "or", "for", "with",
    "is", "are", "be", "by", "as", "it", "its", "this", "that", "these", "those",
    "from", "into", "out", "up", "down", "off", "over", "under", "his", "her",
    "him", "she", "he", "they", "them", "you", "your", "etc", "see", "eg", "ie",
    "one", "two", "kind", "type", "sort", "used", "use", "make", "made", "esp",
    "something", "someone", "small", "big", "very", "also", "any", "all", "no",
}

WORD_RE = re.compile(r"[a-z][a-z'-]*")
MAX_CANDIDATES_PER_KEY = 8


def keywords(gloss: str):
    """English keywords from a gloss string (single tokens, filtered)."""
    out = []
    for tok in WORD_RE.findall(gloss.lower()):
        tok = tok.strip("'-")
        if len(tok) < 3 or tok in STOPWORDS:
            continue
        out.append(tok)
    return out


def main():
    tsv = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    # code -> {name, entries: {english -> {target -> {gloss, exact, tlen}}}}
    langs = {}

    for line in tsv.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) < 5:
            parts += [""] * (5 - len(parts))
        code, name, word, translation, definition = parts[:5]
        word = word.strip()
        if not code or not word:
            continue
        lang = langs.setdefault(code, {"name": name, "entries": defaultdict(dict)})

        # Prefer the translation as the cleanest gloss; fall back to definition.
        gloss = (translation or definition or "").strip()
        if not gloss:
            continue

        # The whole gloss as a single clean word is the strongest signal.
        whole = gloss.lower().strip()
        exact_single = bool(WORD_RE.fullmatch(whole)) and whole not in STOPWORDS

        keys = set(keywords(translation))
        keys |= set(keywords(definition))
        if exact_single:
            keys.add(whole)

        for k in keys:
            cur = lang["entries"][k].get(word)
            is_exact = exact_single and k == whole
            if cur is None or (is_exact and not cur["exact"]):
                lang["entries"][k][word] = {
                    "gloss": gloss[:60],
                    "exact": is_exact,
                    "tlen": len(word),
                }

    for code, lang in langs.items():
        entries = {}
        for english, targets in lang["entries"].items():
            ranked = sorted(
                targets.items(),
                key=lambda kv: (not kv[1]["exact"], kv[1]["tlen"], kv[0]),
            )[:MAX_CANDIDATES_PER_KEY]
            entries[english] = [{"w": w, "g": meta["gloss"]} for w, meta in ranked]
        payload = {
            "code": code,
            "name": lang["name"],
            "count": len(entries),
            "entries": entries,
        }
        out_path = out_dir / f"{code}.json"
        out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(f"{code}: {len(entries)} english keys -> {out_path}")


if __name__ == "__main__":
    main()

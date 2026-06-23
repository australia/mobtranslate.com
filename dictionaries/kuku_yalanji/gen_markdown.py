#!/usr/bin/env python3
"""Generate a full Markdown rendering of the Kuku Yalanji dictionary from dictionary.yaml.

Run:  python3 dictionaries/kuku_yalanji/gen_markdown.py
Writes: dictionaries/kuku_yalanji/dictionary.md
"""
import os
import re
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "dictionary.yaml")
OUT = os.path.join(HERE, "dictionary.md")

# The source YAML was hand-edited over time and has a few misspelled keys.
# Normalise them so no content is silently dropped.
KEY_ALIASES = {
    "type": ["type", "tyoe"],
    "definitions": ["definitions", "defintiions", "defintions"],
    "translations": ["translations", "translatians", "translation"],
    "synonyms": ["synonyms", "synoynms", "syonyms"],
    "usages": ["usages", "usage"],
    "see": ["see"],
    "maybe": ["maybe"],
    "meaning": ["meaning"],
}


def get(entry, canonical):
    for k in KEY_ALIASES[canonical]:
        if k in entry and entry[k] not in (None, "", []):
            return entry[k]
    return None


def as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [str(v).strip()]


def anchor_letter(word):
    c = word[:1].lower()
    return c if c.isalpha() else "#"


def main():
    with open(SRC, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    meta = data.get("meta", {}) or {}
    name = meta.get("name", "Kuku Yalanji")
    words = data.get("words", []) or []

    # Keep source order, but bucket by first letter for navigation.
    buckets = {}
    headwords = set()
    for entry in words:
        if not isinstance(entry, dict):
            continue
        w = str(entry.get("word", "")).strip()
        if not w:
            continue
        headwords.add(w.lower())
        buckets.setdefault(anchor_letter(w), []).append(entry)

    letters = sorted([l for l in buckets if l != "#"])
    if "#" in buckets:
        letters.append("#")

    total_entries = sum(len(v) for v in buckets.values())

    lines = []
    lines.append(f"# {name} Dictionary")
    lines.append("")
    lines.append(
        f"A complete word list for **{name}**, an Aboriginal language of the rainforest "
        f"region of far north Queensland, Australia."
    )
    lines.append("")
    lines.append(
        f"**{len(headwords):,} distinct headwords** across **{total_entries:,} entries** "
        f"(some headwords have several senses, listed separately)."
    )
    lines.append("")
    lines.append(
        "> Generated from [`dictionary.yaml`](dictionary.yaml) by "
        "[`gen_markdown.py`](gen_markdown.py). The companion grammar reference is "
        "[`grammar.md`](grammar.md). Quoted example sentences are kept as recorded in the source."
    )
    lines.append("")

    # Table of contents.
    toc = " · ".join(
        f"[{('#' if l == '#' else l.upper())}](#{('symbols' if l == '#' else l)})"
        for l in letters
    )
    lines.append("## Index")
    lines.append("")
    lines.append(toc)
    lines.append("")

    for l in letters:
        heading = "Symbols & numbers" if l == "#" else l.upper()
        lines.append(f"## {heading}")
        lines.append("")
        # Within a letter, sort case-insensitively by headword for readability.
        for entry in sorted(buckets[l], key=lambda e: str(e.get("word", "")).lower()):
            w = str(entry.get("word", "")).strip()
            pos = get(entry, "type")
            defs = as_list(get(entry, "definitions"))
            trans = as_list(get(entry, "translations"))
            syns = as_list(get(entry, "synonyms"))
            usages = as_list(get(entry, "usages"))
            see = as_list(get(entry, "see"))
            meaning = get(entry, "meaning")

            header = f"### {w}"
            if pos:
                header += f"  *{str(pos).replace('-', ' ')}*"
            lines.append(header)
            lines.append("")

            if meaning:
                lines.append(f"*{meaning}*")
                lines.append("")
            for d in defs:
                lines.append(f"- {d}")
            if defs:
                lines.append("")
            if trans:
                lines.append(f"**English:** {', '.join(trans)}  ")
            if syns:
                lines.append(f"**Synonyms:** {', '.join(syns)}  ")
            if usages:
                lines.append(f"**Usage:** {'; '.join(usages)}  ")
            if see:
                lines.append(f"**See also:** {', '.join(see)}  ")
            lines.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).rstrip() + "\n")

    print(f"Wrote {OUT}")
    print(f"  headwords: {len(headwords):,}  entries: {total_entries:,}  letters: {len(letters)}")


if __name__ == "__main__":
    main()

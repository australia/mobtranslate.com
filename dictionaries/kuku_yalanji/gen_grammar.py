#!/usr/bin/env python3
"""Assemble grammar.md alongside the dictionary from the converted Patz grammar.

Source markdown: experiments/pdftomd/grammar_complete.md (PDF -> Markdown conversion
of Patz, *A Grammar of the Kuku Yalanji Language of North Queensland*).
Copies the referenced figures into grammar_assets/ and rewrites image paths.

Run:  python3 dictionaries/kuku_yalanji/gen_grammar.py
"""
import os
import re
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(REPO, "experiments", "pdftomd", "grammar_complete.md")
IMG_SRC = os.path.join(REPO, "experiments", "pdftomd", "grammar_markdown", "images")
OUT = os.path.join(HERE, "grammar.md")
ASSETS = os.path.join(HERE, "grammar_assets")

HEADER = """# Kuku Yalanji — Reference Grammar

A reference grammar of **Kuku Yalanji**, an Aboriginal language of the rainforest
region of far north Queensland, Australia. This Markdown edition is a conversion of
Elisabeth Patz, *A Grammar of the Kuku Yalanji Language of North Queensland*
(Pacific Linguistics), provided for reference alongside the
[dictionary](dictionary.md). The original PDF is in
[`resources/grammar.pdf`](resources/grammar.pdf).

> Converted from PDF, so headings, tables, and example glosses may carry minor
> formatting artefacts. The source PDF remains authoritative.

---

"""


def main():
    with open(SRC, encoding="utf-8") as f:
        text = f.read()

    os.makedirs(ASSETS, exist_ok=True)

    # Rewrite image references: ![](_page_x.jpeg) -> ![](grammar_assets/_page_x.jpeg)
    refs = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", text)
    copied = 0
    for ref in set(refs):
        base = os.path.basename(ref)
        src_img = os.path.join(IMG_SRC, base)
        if os.path.exists(src_img):
            shutil.copy2(src_img, os.path.join(ASSETS, base))
            copied += 1
        text = text.replace(f"]({ref})", f"](grammar_assets/{base})")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(HEADER + text.lstrip())

    print(f"Wrote {OUT}")
    print(f"  image refs: {len(refs)}  copied to grammar_assets/: {copied}")


if __name__ == "__main__":
    main()

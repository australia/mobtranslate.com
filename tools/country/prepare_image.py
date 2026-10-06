#!/usr/bin/env python3
"""Fetch (or read) an image, size it for the web and file it under a Country page.

Usage:
  prepare_image.py <url-or-path> <page-slug> <name> [--crop L,T,R,B] [--language kuku_yalanji]

Writes apps/web/public/country-img/<language>/<page-slug>/<name>.webp (longest side
at most 1600 px, WebP quality 80) and prints a JSON stub with src, width and
height to paste into data/country/<language>/images/<page-slug>.json.
--crop takes pixel coordinates on the ORIGINAL image (e.g. to cut one figure
out of a scanned plate).
"""
import argparse
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MAX_SIDE = 1600


def load(source: str) -> Image.Image:
    if re.match(r"^https?://", source):
        request = urllib.request.Request(source, headers={"User-Agent": "mobtranslate-country/1.0 (research; contact via mobtranslate.com)"})
        with urllib.request.urlopen(request, timeout=60) as response:
            return Image.open(io.BytesIO(response.read()))
    return Image.open(source)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("slug")
    parser.add_argument("name")
    parser.add_argument("--crop")
    parser.add_argument("--language", default="kuku_yalanji")
    args = parser.parse_args()
    for value in (args.slug, args.name):
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            sys.exit(f"slug and name must be kebab-case: {value!r}")

    image = load(args.source)
    image.load()
    if args.crop:
        left, top, right, bottom = (int(v) for v in args.crop.split(","))
        image = image.crop((left, top, right, bottom))
    image = image.convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    out_dir = ROOT / "apps/web/public/country-img" / args.language / args.slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{args.name}.webp"
    image.save(out, "WEBP", quality=80, method=6)
    print(json.dumps({
        "src": f"/country-img/{args.language}/{args.slug}/{args.name}.webp",
        "width": image.width,
        "height": image.height,
        "bytes": out.stat().st_size,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

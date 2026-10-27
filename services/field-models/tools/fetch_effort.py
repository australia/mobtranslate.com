#!/usr/bin/env python3
"""Download where people record each group of living things, for target-group background.

Public records cluster near roads, towns and research stations. Drawing a
model's background from the places where anyone recorded the same kind of
thing (any reptile for a goanna, any plant for a yam) cancels most of that
bias, because presences and background then share it.

For each group this asks the Atlas of Living Australia for the 0.01-degree
cells inside the registry's regional grid that hold at least one record, and
writes <data-dir>/cache/effort/<group>.json. Queries carry a taxon group and a
box only.

    fetch_effort.py <registry.json> <data-dir> [group ...]
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

ALA_SEARCH = "https://biocache-ws.ala.org.au/ws/occurrences/search"
TILE_DEGREES = 2.0

GROUPS = {
    "plants": "kingdom:Plantae",
    "reptiles": "class:Reptilia",
    "mammals": "class:Mammalia",
    "fish": "class:Actinopterygii",
    "crustaceans": "class:Malacostraca",
}


def tile_cells(query, west, south, east, north):
    params = [
        ("q", query),
        ("fq", f"decimalLatitude:[{south} TO {north}]"),
        ("fq", f"decimalLongitude:[{west} TO {east}]"),
        ("fq", "spatiallyValid:true"),
        ("pageSize", "0"),
        ("facets", "point-0.01"),
        ("flimit", "-1"),
    ]
    url = f"{ALA_SEARCH}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"user-agent": "mobtranslate-field-models/0.1"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                body = json.load(response)
            break
        except Exception as error:  # ALA answers 503 under load; back off and retry.
            if attempt == 4:
                raise
            print(f"  retry after {error}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    cells = []
    for facet in body.get("facetResults") or []:
        for result in facet.get("fieldResult", []):
            try:
                lat, lon = (float(v) for v in result["label"].split(","))
            except (KeyError, ValueError):
                continue
            # Facet boxes overlap at their edges; keep each cell in one tile.
            if west <= lon < east and south <= lat < north:
                cells.append([round(lon, 2), round(lat, 2), int(result.get("count", 1))])
    return cells


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    registry = json.load(open(sys.argv[1]))
    out_dir = os.path.join(sys.argv[2], "cache", "effort")
    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    bounds = registry["regionalGrid"]["bounds"]
    groups = sys.argv[3:] or list(GROUPS)
    for group in groups:
        query = GROUPS[group]
        cells = {}
        lat = bounds["south"]
        while lat < bounds["north"]:
            lon = bounds["west"]
            while lon < bounds["east"]:
                north, east = min(lat + TILE_DEGREES, bounds["north"]), min(lon + TILE_DEGREES, bounds["east"])
                for c in tile_cells(query, lon, lat, east, north):
                    cells[(c[0], c[1])] = c
                lon += TILE_DEGREES
            lat += TILE_DEGREES
            print(f"{group}: up to {lat:.1f}, {len(cells)} cells", file=sys.stderr)
        path = os.path.join(out_dir, f"{group}.json")
        with open(path + ".tmp", "w") as f:
            json.dump(
                {
                    "group": group,
                    "query": query,
                    "source": "Atlas of Living Australia, point-0.01 facets",
                    "fetchedAt": time.strftime("%Y-%m-%d"),
                    "cellDegrees": 0.01,
                    "cells": sorted(cells.values()),
                },
                f,
                separators=(",", ":"),
            )
        os.replace(path + ".tmp", path)
        print(f"{group}: {len(cells)} cells -> {path}", file=sys.stderr)


if __name__ == "__main__":
    main()

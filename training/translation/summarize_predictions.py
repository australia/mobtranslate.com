#!/usr/bin/env python3
"""Summarize a MobTranslate translation prediction JSON file."""

from __future__ import annotations

import argparse
import collections
import json
import random
import statistics
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prediction_file")
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def words(text: str | None) -> list[str]:
    return (text or "").split()


def repeat_share(tokens: list[str]) -> float:
    if not tokens:
        return 0.0
    return max(collections.Counter(tokens).values()) / len(tokens)


def row_text(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if isinstance(value, str):
            return value
    return ""


def describe(values: list[float]) -> dict[str, float]:
    if not values:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0}
    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
    }


def main() -> None:
    args = parse_args()
    data = json.loads(Path(args.prediction_file).read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = data.get("predictions", [])

    length_ratios: list[float] = []
    repeat_shares: list[float] = []
    empty_predictions = 0
    for row in rows:
        prediction = words(row_text(row, "prediction"))
        reference = words(row_text(row, "reference", "output_text"))
        if not prediction:
            empty_predictions += 1
        length_ratios.append(len(prediction) / (len(reference) or 1))
        repeat_shares.append(repeat_share(prediction))

    summary = {
        "file": str(Path(args.prediction_file).resolve()),
        "metrics": data.get("metrics", {}),
        "rows": len(rows),
        "empty_predictions": empty_predictions,
        "length_ratio": describe(length_ratios),
        "max_token_repeat_share": describe(repeat_shares),
    }
    print(json.dumps(summary, indent=2))

    if rows and args.samples > 0:
        print("\nSAMPLES")
        rng = random.Random(args.seed)
        sampled = rows[: min(4, len(rows))]
        remaining = rows[len(sampled) :]
        sampled.extend(rng.sample(remaining, min(args.samples - len(sampled), len(remaining))))
        for row in sampled:
            print(f"\nREF: {row.get('canonical_ref', '')}")
            print(f"SRC: {row_text(row, 'input_text', 'source_text', 'source')}")
            print(f"HYP: {row_text(row, 'prediction')}")
            print(f"TGT: {row_text(row, 'reference', 'output_text', 'target_text')}")


if __name__ == "__main__":
    main()

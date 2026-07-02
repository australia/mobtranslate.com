#!/usr/bin/env python3
"""Compare two MobTranslate prediction reports row-by-row."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline_report")
    parser.add_argument("candidate_report")
    parser.add_argument("--baseline-label", default="baseline")
    parser.add_argument("--candidate-label", default="candidate")
    parser.add_argument("--samples", type=int, default=12)
    return parser.parse_args()


def load_report(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def row_key(row: dict[str, Any]) -> str:
    return str(row.get("id") or row.get("canonical_ref"))


def clean(text: str) -> str:
    return " ".join(text.split())


def token_repeat_share(text: str) -> float:
    tokens = clean(text).split()
    if not tokens:
        return 0.0
    counts: dict[str, int] = {}
    for token in tokens:
        counts[token] = counts.get(token, 0) + 1
    return max(counts.values()) / len(tokens)


def ngrams(text: str, n: int) -> dict[str, int]:
    padded = clean(text)
    if len(padded) < n:
        return {}
    out: dict[str, int] = {}
    for idx in range(len(padded) - n + 1):
        gram = padded[idx : idx + n]
        out[gram] = out.get(gram, 0) + 1
    return out


def char_overlap_f(prediction: str, reference: str, max_order: int = 6) -> float:
    """Small dependency-free sentence-level chrF-style score for ranking rows."""
    scores: list[float] = []
    for n in range(1, max_order + 1):
        pred = ngrams(prediction, n)
        ref = ngrams(reference, n)
        if not pred or not ref:
            continue
        overlap = sum(min(count, ref.get(gram, 0)) for gram, count in pred.items())
        precision = overlap / sum(pred.values())
        recall = overlap / sum(ref.values())
        if precision + recall:
            scores.append((2 * precision * recall) / (precision + recall))
    return 100 * mean(scores) if scores else 0.0


def aggregate(rows: list[dict[str, Any]]) -> dict[str, float]:
    predictions = [clean(row.get("prediction", "")) for row in rows]
    references = [clean(row.get("reference", row.get("output_text", ""))) for row in rows]
    return {
        "empty": float(sum(1 for pred in predictions if not pred)),
        "mean_length_ratio": mean(
            len(pred) / max(len(ref), 1) for pred, ref in zip(predictions, references, strict=True)
        ),
        "mean_repeat_share": mean(token_repeat_share(pred) for pred in predictions),
    }


def main() -> None:
    args = parse_args()
    baseline = load_report(args.baseline_report)
    candidate = load_report(args.candidate_report)

    baseline_rows = {row_key(row): row for row in baseline["predictions"]}
    candidate_rows = {row_key(row): row for row in candidate["predictions"]}
    keys = sorted(set(baseline_rows) & set(candidate_rows))
    if not keys:
        raise SystemExit("No common prediction rows")

    paired = []
    for key in keys:
        b = baseline_rows[key]
        c = candidate_rows[key]
        reference = clean(b.get("reference", b.get("output_text", "")))
        paired.append(
            {
                "key": key,
                "source": clean(b.get("input_text", "")),
                "reference": reference,
                "baseline": clean(b.get("prediction", "")),
                "candidate": clean(c.get("prediction", "")),
                "baseline_char_f": char_overlap_f(b.get("prediction", ""), reference),
                "candidate_char_f": char_overlap_f(c.get("prediction", ""), reference),
            }
        )

    baseline_common = [baseline_rows[key] for key in keys]
    candidate_common = [candidate_rows[key] for key in keys]
    deltas = [row["candidate_char_f"] - row["baseline_char_f"] for row in paired]
    report = {
        "common_rows": len(keys),
        args.baseline_label: {
            "stored_metrics": baseline.get("metrics", {}),
            "common_row_shape": aggregate(baseline_common),
        },
        args.candidate_label: {
            "stored_metrics": candidate.get("metrics", {}),
            "common_row_shape": aggregate(candidate_common),
        },
        "sentence_char_f_delta": {
            "mean": mean(deltas),
            "candidate_wins": sum(1 for delta in deltas if delta > 0),
            "baseline_wins": sum(1 for delta in deltas if delta < 0),
            "ties": sum(1 for delta in deltas if delta == 0),
        },
    }
    print(json.dumps(report, indent=2))

    print("\nLargest candidate gains:")
    for row in sorted(paired, key=lambda item: item["candidate_char_f"] - item["baseline_char_f"], reverse=True)[
        : args.samples
    ]:
        print_sample(row)

    print("\nLargest candidate losses:")
    for row in sorted(paired, key=lambda item: item["candidate_char_f"] - item["baseline_char_f"])[: args.samples]:
        print_sample(row)


def print_sample(row: dict[str, Any]) -> None:
    delta = row["candidate_char_f"] - row["baseline_char_f"]
    print(f"\nREF: {row['key']}  sentence_char_f_delta={delta:.2f}")
    print(f"SRC: {row['source']}")
    print(f"TGT: {row['reference']}")
    print(f"BASE: {row['baseline']}")
    print(f"CAND: {row['candidate']}")


if __name__ == "__main__":
    main()

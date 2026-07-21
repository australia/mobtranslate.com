#!/usr/bin/env python3
"""Select one decoding configuration from validation-only evaluations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", action="append", required=True, help="LABEL=EVALUATION_JSON")
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected-split", default="validation")
    parser.add_argument("--expected-rows", type=int)
    return parser.parse_args()


def load_candidate(value: str, expected_split: str, expected_rows: int | None) -> dict[str, Any]:
    if "=" not in value:
        raise ValueError(f"Candidate must be LABEL=PATH: {value}")
    label, file = value.split("=", 1)
    payload = json.loads(Path(file).read_text(encoding="utf-8"))
    metrics = payload.get("metrics", {})
    rows = payload.get("predictions", [])
    if not rows:
        raise ValueError(f"Candidate contains no predictions: {file}")
    row_ids = [str(row.get("id", "")) for row in rows]
    if any(not row_id for row_id in row_ids) or len(row_ids) != len(set(row_ids)):
        raise ValueError(f"Candidate has missing or duplicate row IDs: {file}")
    if expected_rows is not None and len(rows) != expected_rows:
        raise ValueError(f"Candidate has {len(rows)} rows; expected {expected_rows}: {file}")
    unexpected_splits = sorted({str(row.get("split", "")) for row in rows} - {expected_split})
    if unexpected_splits:
        raise ValueError(
            f"Candidate contains rows outside split {expected_split!r}: {unexpected_splits}: {file}"
        )
    repeated_trigram = 0
    for row in rows:
        words = str(row.get("prediction", "")).lower().split()
        trigrams = [tuple(words[index:index + 3]) for index in range(max(0, len(words) - 2))]
        repeated_trigram += len(trigrams) != len(set(trigrams))
    reference_mean = float(metrics.get("mean_reference_characters", 0.0))
    prediction_mean = float(metrics.get("mean_prediction_characters", 0.0))
    ratio = prediction_mean / reference_mean if reference_mean else 0.0
    hard_gate = (
        int(metrics.get("empty_outputs", 1)) == 0
        and int(metrics.get("source_copy_outputs", 1)) == 0
        and 0.5 <= ratio <= 2.0
        and repeated_trigram / max(1, len(rows)) <= 0.05
    )
    return {
        "label": label,
        "file": str(Path(file).resolve()),
        "row_ids": row_ids,
        "metrics": metrics,
        "repeated_trigram_outputs": repeated_trigram,
        "mean_length_ratio": ratio,
        "hard_gate_pass": hard_gate,
    }


def main() -> None:
    args = parse_args()
    candidates = [
        load_candidate(value, args.expected_split, args.expected_rows)
        for value in args.candidate
    ]
    expected_ids = candidates[0]["row_ids"]
    for candidate in candidates[1:]:
        if candidate["row_ids"] != expected_ids:
            raise ValueError(
                f"Candidate row IDs or ordering differ: {candidate['label']} does not match {candidates[0]['label']}"
            )
    for candidate in candidates:
        del candidate["row_ids"]
    passing = [candidate for candidate in candidates if candidate["hard_gate_pass"]]
    if not passing:
        verdict = {"status": "fail", "reason": "No validation decoding candidate passed the surface hard gates", "candidates": candidates}
        Path(args.output).write_text(json.dumps(verdict, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(verdict, indent=2))
        raise SystemExit(1)
    selected = max(passing, key=lambda candidate: (float(candidate["metrics"].get("chrf", 0.0)), float(candidate["metrics"].get("bleu", 0.0))))
    verdict = {
        "status": "pass",
        "selection_surface": "validation only",
        "validation_rows": len(expected_ids),
        "selection_rule": "Highest chrF++ among candidates passing empty/copy/length/repeated-trigram hard gates; BLEU breaks ties.",
        "selected": selected,
        "candidates": candidates,
        "frozen_test_accessed": False,
    }
    Path(args.output).write_text(json.dumps(verdict, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(verdict, indent=2))


if __name__ == "__main__":
    main()

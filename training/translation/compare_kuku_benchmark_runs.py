#!/usr/bin/env python3
"""Compare aligned prediction rows from two Kuku Yalanji benchmark executions."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--candidate", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def labeled(values: list[str]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for value in values:
        label, separator, path = value.partition("=")
        if not separator or not label or not path or label in result:
            raise ValueError(f"expected a unique LABEL=PATH value, got {value!r}")
        result[label] = Path(path)
    return result


def load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload.get("predictions"), list):
        raise ValueError(f"missing prediction rows in {path}")
    return payload


def sha256(path: Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    baselines = labeled(args.baseline)
    candidates = labeled(args.candidate)
    if list(baselines) != list(candidates):
        raise SystemExit("baseline and candidate labels must match in the same order")

    comparisons: dict[str, Any] = {}
    for label in baselines:
        baseline = load(baselines[label])
        candidate = load(candidates[label])
        left_rows = baseline["predictions"]
        right_rows = candidate["predictions"]
        left_ids = [str(row.get("id")) for row in left_rows]
        right_ids = [str(row.get("id")) for row in right_rows]
        if left_ids != right_ids:
            raise SystemExit(f"row identity or ordering differs for {label}")
        mismatches = [
            {
                "id": left.get("id"),
                "baseline": left.get("prediction"),
                "candidate": right.get("prediction"),
            }
            for left, right in zip(left_rows, right_rows)
            if left.get("prediction") != right.get("prediction")
        ]
        metric_deltas = {
            key: float(candidate["metrics"][key]) - float(baseline["metrics"][key])
            for key in ("bleu", "chrf", "exact_match", "empty_outputs", "source_copy_outputs")
        }
        comparisons[label] = {
            "baseline_file": str(baselines[label]),
            "baseline_sha256": sha256(baselines[label]),
            "candidate_file": str(candidates[label]),
            "candidate_sha256": sha256(candidates[label]),
            "rows": len(left_rows),
            "identical_predictions": len(left_rows) - len(mismatches),
            "mismatched_predictions": len(mismatches),
            "exact_prediction_parity_percent": 100
            * (len(left_rows) - len(mismatches))
            / max(1, len(left_rows)),
            "metric_deltas_candidate_minus_baseline": metric_deltas,
            "mismatches": mismatches,
        }

    result = {
        "schema_version": 1,
        "all_predictions_identical": all(
            value["mismatched_predictions"] == 0 for value in comparisons.values()
        ),
        "models": comparisons,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

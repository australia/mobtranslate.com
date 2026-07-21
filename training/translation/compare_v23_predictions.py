#!/usr/bin/env python3
"""Paired baseline/candidate audit over arbitrary sealed v23 evaluation files."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from compare_v21_models import (
    DECODE_KEYS,
    identity,
    load_prediction_document,
    paired_metrics,
    representative_examples,
    sha256,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pair", action="append", required=True, metavar="LABEL=BASE,CANDIDATE")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bootstrap-replicates", type=int, default=50_000)
    parser.add_argument("--seed", type=int, default=2300)
    return parser.parse_args()


def parse_pair(value: str) -> tuple[str, Path, Path]:
    label, separator, paths = value.partition("=")
    baseline, comma, candidate = paths.partition(",")
    if not separator or not comma or not label or not baseline or not candidate:
        raise ValueError(f"invalid pair: {value}")
    return label, Path(baseline), Path(candidate)


def attestation_slices(
    rows_a: list[dict[str, Any]],
    rows_b: list[dict[str, Any]],
    replicates: int,
    seed: int,
) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for flag, label in ((False, "transcription_unflagged"), (True, "transcription_flagged")):
        indices = [
            index
            for index, row in enumerate(rows_a)
            if (row.get("attestation") or {}).get("transcription_uncertainty_flag") is flag
        ]
        if not indices:
            continue
        metrics, _ = paired_metrics(
            [rows_a[index] for index in indices],
            [rows_b[index] for index in indices],
            replicates,
            seed + (1 if flag else 0),
        )
        output[label] = metrics
    return output


def main() -> int:
    args = parse_args()
    evaluations: dict[str, Any] = {}
    for offset, specification in enumerate(args.pair):
        label, baseline_path, candidate_path = parse_pair(specification)
        baseline = load_prediction_document(baseline_path)
        candidate = load_prediction_document(candidate_path)
        rows_a = baseline["predictions"]
        rows_b = candidate["predictions"]
        if [identity(row) for row in rows_a] != [identity(row) for row in rows_b]:
            raise ValueError(f"ordered input/reference mismatch: {label}")
        decode_a = {key: baseline.get("metrics", {}).get(key) for key in DECODE_KEYS}
        decode_b = {key: candidate.get("metrics", {}).get(key) for key in DECODE_KEYS}
        if decode_a != decode_b:
            raise ValueError(f"decoder mismatch for {label}: {decode_a} != {decode_b}")
        metrics, paired_rows = paired_metrics(
            rows_a,
            rows_b,
            args.bootstrap_replicates,
            args.seed + offset * 10,
        )
        evaluations[label] = {
            "baseline_path": str(baseline_path),
            "candidate_path": str(candidate_path),
            "baseline_sha256": sha256(baseline_path),
            "candidate_sha256": sha256(candidate_path),
            "decode": decode_a,
            "metrics": metrics,
            "attestation_slices": attestation_slices(
                rows_a,
                rows_b,
                args.bootstrap_replicates,
                args.seed + offset * 10 + 2,
            ),
            "representative_examples": representative_examples(paired_rows, count=8),
        }
    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "labels": {"model_a": "v21.2 guarded baseline", "model_b": "selected v23 seed"},
        "evaluations": evaluations,
        "method": {
            "metric": "sacrebleu chrF++ (word_order=2)",
            "primary_paired_estimand": "mean per-row sentence chrF++ difference, v23 minus v21.2",
            "interval": "paired row bootstrap percentile 95% interval",
            "speaker_inference_warning": (
                "Rows within one narrative are not independent speakers; row-bootstrap intervals do not "
                "license population-level claims over Kuku Yalanji speakers."
            ),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for label, record in evaluations.items():
        delta = record["metrics"]["delta_b_minus_a"]
        interval = record["metrics"]["paired_sentence_chrf"]["ci95"]
        print(
            f"{label}: corpus chrF {delta['corpus_chrf']:+.3f}; "
            f"mean sentence chrF {delta['mean_sentence_chrf']:+.3f}; "
            f"95% CI [{interval[0]:+.3f}, {interval[1]:+.3f}]"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

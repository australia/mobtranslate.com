#!/usr/bin/env python3
"""Apply the frozen v21.2 decoder-transfer gates."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any


ALL_EVALUATIONS = (
    "synthetic_dev_1609",
    "synthetic_test_tagged_1606",
    "synthetic_test_untagged_1606",
    "elder_sentence_pair_43",
    "db_usage_heldout_84",
    "bible_direct_heldout_325",
    "bible_ref_heldout_325",
)
QUALITY_FLOORS = {
    "synthetic_test_tagged_1606": 52.8374,
    "synthetic_test_untagged_1606": 52.8142,
    "db_usage_heldout_84": 46.1391,
    "bible_direct_heldout_325": 42.7751,
    "bible_ref_heldout_325": 42.9093,
}
LOOP_MAXIMA = {
    "synthetic_test_tagged_1606": 5,
    "synthetic_test_untagged_1606": 5,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def aggregate(path: Path) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    value = document.get("aggregate")
    if not isinstance(value, dict):
        raise ValueError(f"missing aggregate: {path}")
    return value


def main() -> int:
    args = parse_args()
    model_dir = args.model_dir.resolve()
    observations: dict[str, dict[str, Any]] = {}
    checks: dict[str, bool] = {}

    for label in ALL_EVALUATIONS:
        value = aggregate(model_dir / f"eval_{label}_analysis_locked.json")
        safety = value["output_safety"]
        observation = {
            "chrf": value["chrf"],
            "bleu": value["bleu"],
            "exact": value["exact"],
            "empty": value["empty"],
            "repeated_segment_rows": safety["rows_repeated_segment_at_least_10_times"],
            "maximum_repeated_segment_count": safety["maximum_repeated_segment_count"],
            "severe_underlength_rows": safety["rows_token_ratio_below_0_5"],
            "severe_overlength_rows": safety["rows_character_ratio_above_2_0"],
            "mean_character_length_ratio": safety["character_length_ratio"]["mean"],
        }
        observations[label] = observation
        checks[f"{label}_empty_zero"] = observation["empty"] == 0

    for label, floor in QUALITY_FLOORS.items():
        checks[f"{label}_chrf_noninferior"] = observations[label]["chrf"] >= floor
    for label, maximum in LOOP_MAXIMA.items():
        checks[f"{label}_loops"] = observations[label]["repeated_segment_rows"] <= maximum

    output = {
        "schema_version": 1,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "PASS" if all(checks.values()) else "FAIL",
        "experiment": "v21.2 final checkpoint with decoder transferred from v22 development",
        "decoder": {
            "num_beams": 1,
            "no_repeat_ngram_size": 4,
            "repetition_penalty": 1.1,
            "length_penalty": 1.0,
        },
        "quality_floors": QUALITY_FLOORS,
        "loop_maxima": LOOP_MAXIMA,
        "checks": checks,
        "observations": observations,
        "interpretation": (
            "PASS authorizes only a versioned guarded-decoding recipe for the unchanged v21.2 research model. "
            "It is not a new trained model, speaker certification, or approval for authoritative translation."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Apply the frozen v22.0 promotion gates without suppressing negative results."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any


BASELINE_THRESHOLDS = {
    "synthetic_test_tagged_1606": {"chrf_min": 52.8374, "loops_max": 25},
    "db_usage_heldout_84": {"chrf_min": 45.1391},
    "bible_direct_heldout_325": {"chrf_min": 41.7751},
    "bible_ref_heldout_325": {"chrf_min": 41.9093},
}
ALL_EVALUATIONS = (
    "synthetic_dev_1609",
    "synthetic_test_tagged_1606",
    "synthetic_test_untagged_1606",
    "elder_sentence_pair_43",
    "db_usage_heldout_84",
    "bible_direct_heldout_325",
    "bible_ref_heldout_325",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--selected-id", required=True)
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
    checks: dict[str, bool] = {}
    observations: dict[str, Any] = {"baseline": {}, "selected": {}}

    for label, threshold in BASELINE_THRESHOLDS.items():
        value = aggregate(model_dir / f"eval_{label}_analysis.json")
        safety = value["output_safety"]
        observation = {
            "chrf": value["chrf"],
            "empty": value["empty"],
            "repeated_segment_rows": safety["rows_repeated_segment_at_least_10_times"],
        }
        observations["baseline"][label] = observation
        checks[f"baseline_{label}_empty_zero"] = observation["empty"] == 0
        checks[f"baseline_{label}_chrf"] = observation["chrf"] >= threshold["chrf_min"]
        if "loops_max" in threshold:
            checks[f"baseline_{label}_loops"] = observation["repeated_segment_rows"] <= threshold["loops_max"]

    for label in ALL_EVALUATIONS:
        value = aggregate(model_dir / f"eval_{label}_analysis_selected-{args.selected_id}.json")
        observations["selected"][label] = {
            "chrf": value["chrf"],
            "empty": value["empty"],
            "repeated_segment_rows": value["output_safety"]["rows_repeated_segment_at_least_10_times"],
        }
        checks[f"selected_{label}_empty_zero"] = value["empty"] == 0

    baseline_loops = observations["baseline"]["synthetic_test_tagged_1606"]["repeated_segment_rows"]
    selected_loops = observations["selected"]["synthetic_test_tagged_1606"]["repeated_segment_rows"]
    checks["selected_synthetic_loops_not_above_baseline"] = selected_loops <= baseline_loops

    output = {
        "schema_version": 1,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "PASS" if all(checks.values()) else "FAIL",
        "selected_decoder": args.selected_id,
        "thresholds": BASELINE_THRESHOLDS,
        "checks": checks,
        "observations": observations,
        "interpretation": (
            "PASS means the automatic preregistered research-candidate gates passed; it is not speaker certification "
            "or authorization for unrestricted production use."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

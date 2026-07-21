#!/usr/bin/env python3
"""Apply the preregistered v23 promotion gates and preserve negative results."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed-selection", type=Path, required=True)
    parser.add_argument("--paired-audit", type=Path, required=True)
    parser.add_argument("--lexicon-audit", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def evaluation(audit: dict[str, Any], label: str) -> dict[str, Any]:
    return audit["evaluations"][label]["metrics"]


def main() -> int:
    args = parse_args()
    selection = json.loads(args.seed_selection.read_text(encoding="utf-8"))
    paired = json.loads(args.paired_audit.read_text(encoding="utf-8"))
    lexicon = json.loads(args.lexicon_audit.read_text(encoding="utf-8"))
    checks: dict[str, bool] = {}

    replication = selection["replication"]
    selected_delta = selection["selected"]["delta_vs_baseline"]
    checks["three_safety_eligible_seeds"] = replication["eligible_seeds"] == 3
    checks["at_least_two_seeds_improve_dev_corpus_chrf"] = (
        replication["seeds_improving_baseline_corpus_chrf"] >= 2
    )
    checks["selected_dev_corpus_chrf_delta_ge_0_5"] = selected_delta["corpus_chrf"] >= 0.5

    natural_test = evaluation(paired, "natural_test_text3")
    natural_test_delta = natural_test["delta_b_minus_a"]
    natural_test_paired = natural_test["paired_sentence_chrf"]
    checks["natural_test_corpus_chrf_delta_ge_1_0"] = natural_test_delta["corpus_chrf"] >= 1.0
    checks["natural_test_paired_ci_lower_gt_0"] = natural_test_paired["ci95"][0] > 0.0
    checks["natural_test_more_wins_than_losses"] = (
        natural_test_paired["wins_b"] > natural_test_paired["wins_a"]
    )
    unflagged = paired["evaluations"]["natural_test_text3"]["attestation_slices"].get(
        "transcription_unflagged"
    )
    checks["natural_test_unflagged_corpus_chrf_delta_positive"] = bool(
        unflagged and unflagged["delta_b_minus_a"]["corpus_chrf"] > 0.0
    )

    noninferiority = {
        "db_usage_heldout_84": -1.0,
        "synthetic_test_tagged_1606": -1.0,
        "synthetic_test_untagged_1606": -1.5,
        "elder_sentence_pair_43": -1.0,
    }
    for label, floor in noninferiority.items():
        metrics = evaluation(paired, label)
        checks[f"{label}_corpus_chrf_noninferior"] = (
            metrics["delta_b_minus_a"]["corpus_chrf"] >= floor
        )

    for label, record in paired["evaluations"].items():
        metrics = record["metrics"]
        checks[f"{label}_candidate_empty_zero"] = metrics["model_b"]["empty"] == 0
        checks[f"{label}_candidate_loops_not_above_baseline"] = (
            metrics["model_b"]["output_diagnostics"]["rows_repeated_segment_at_least_10_times"]
            <= metrics["model_a"]["output_diagnostics"]["rows_repeated_segment_at_least_10_times"]
        )

    baseline_lexicon = lexicon["models"]["baseline"]["lexicon"]["overall"]
    candidate_lexicon = lexicon["models"]["candidate"]["lexicon"]["overall"]
    checks["lexicon_exact_count_regression_at_most_3"] = (
        candidate_lexicon["normalized_exact_count"]
        >= baseline_lexicon["normalized_exact_count"] - 3
    )
    checks["lexicon_empty_zero"] = candidate_lexicon["empty_outputs"] == 0

    bible = evaluation(paired, "bible_direct_heldout_325")
    checks["bible_catastrophic_forgetting_floor_minus_10_chrf"] = (
        bible["delta_b_minus_a"]["corpus_chrf"] >= -10.0
    )
    checks["bible_empty_zero"] = bible["model_b"]["empty"] == 0

    output = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if all(checks.values()) else "FAIL",
        "selected_seed": selection["selected"]["label"],
        "checks": checks,
        "policy": {
            "primary_promotion_evidence": [
                "speaker-disjoint Text 36 development replication",
                "sealed Ivy Walker Text 3 Yalanji test improvement",
            ],
            "noninferiority_controls": list(noninferiority),
            "dictionary_and_elder": "important nonblind diagnostics, never pooled with natural test",
            "bible": {
                "role": "catastrophic-forgetting guard only",
                "training_rows": 0,
                "seed_selection_weight": 0,
                "promotion_objective_weight": 0,
                "guard_margin_chrf": -10.0,
            },
            "interpretation": (
                "PASS licenses a research-candidate promotion only. It is not speaker certification, "
                "community approval, or evidence of population-level generalization."
            ),
        },
        "observations": {
            "replication": replication,
            "selected_dev_delta": selected_delta,
            "natural_test": natural_test,
            "lexicon_baseline": baseline_lexicon,
            "lexicon_candidate": candidate_lexicon,
            "bible_catastrophic_guard": bible,
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Analyze Wajarri Stage-I hosted trajectories without linguistic overclaiming."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Any, Iterable
import unicodedata


CLAIM_LIMIT = (
    "This analysis describes deterministic surface behavior on closed-set training "
    "reconstruction, source-scoped lexical diagnostics, and controlled synthetic "
    "development rows. It does not establish a new lexical fact, semantic explanation, "
    "productive morphology, natural Wajarri sentence competence, speaker approval, or "
    "release readiness."
)


class AnalysisError(ValueError):
    """A bound Stage-I result or schedule is incomplete or inconsistent."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result-root", type=Path, required=True)
    parser.add_argument("--schedule", type=Path, required=True)
    parser.add_argument("--expected-schedule-sha256", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).casefold().split())


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AnalysisError(f"expected object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise AnalysisError(f"expected object: {path}:{line_number}")
            rows.append(value)
    return rows


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def unit_profile(
    prediction: str, references: list[str], c0_targets: set[str], c0_units: set[str]
) -> dict[str, Any]:
    normalized_prediction = normalize(prediction)
    normalized_references = [normalize(value) for value in references]
    prediction_units = normalized_prediction.split()
    reference_units = normalized_references[0].split() if normalized_references else []
    return {
        "whole_prediction_is_c0_target": normalized_prediction in c0_targets,
        "all_prediction_units_are_c0_units": bool(prediction_units)
        and all(value in c0_units for value in prediction_units),
        "any_prediction_unit_is_c0_unit": any(
            value in c0_units for value in prediction_units
        ),
        "first_reference_unit_preserved_as_first": bool(
            prediction_units and reference_units
        )
        and prediction_units[0] == reference_units[0],
        "remaining_reference_units_exact": bool(reference_units[1:])
        and prediction_units[1:] == reference_units[1:],
        "reference_is_complete_c0_target": any(
            value in c0_targets for value in normalized_references
        ),
        "prediction_whitespace_units": prediction_units,
        "first_declared_reference_whitespace_units": reference_units,
    }


def compact_structural(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    predictions = Counter(row["normalized_prediction"] for row in rows)
    return {
        "rows": total,
        "exact": sum(bool(row["normalized_exact"]) for row in rows),
        "unique_predictions": len(predictions),
        "maximum_prediction_multiplicity": max(predictions.values(), default=0),
        "top_predictions": [
            {"prediction": value, "rows": count}
            for value, count in sorted(
                predictions.items(), key=lambda item: (-item[1], item[0])
            )[:10]
        ],
        "whole_prediction_is_c0_target": sum(
            bool(row["structure"]["whole_prediction_is_c0_target"]) for row in rows
        ),
        "all_prediction_units_are_c0_units": sum(
            bool(row["structure"]["all_prediction_units_are_c0_units"]) for row in rows
        ),
        "any_prediction_unit_is_c0_unit": sum(
            bool(row["structure"]["any_prediction_unit_is_c0_unit"]) for row in rows
        ),
        "first_reference_unit_preserved_as_first": sum(
            bool(row["structure"]["first_reference_unit_preserved_as_first"])
            for row in rows
        ),
        "remaining_reference_units_exact": sum(
            bool(row["structure"]["remaining_reference_units_exact"]) for row in rows
        ),
        "reference_is_complete_c0_target": sum(
            bool(row["structure"]["reference_is_complete_c0_target"]) for row in rows
        ),
    }


def identical_output_count(
    left: list[dict[str, Any]], right: list[dict[str, Any]]
) -> dict[str, Any]:
    left_map = {row["evaluation_id"]: row for row in left}
    right_map = {row["evaluation_id"]: row for row in right}
    if left_map.keys() != right_map.keys():
        raise AnalysisError("prediction populations differ")
    identical = sum(
        left_map[key]["generated_content_token_ids"]
        == right_map[key]["generated_content_token_ids"]
        for key in left_map
    )
    return {
        "rows": len(left_map),
        "token_identical_rows": identical,
        "token_identical_rate": identical / len(left_map) if left_map else 0.0,
    }


def main() -> None:
    args = parse_args()
    result_root = args.result_root.expanduser().resolve()
    schedule = args.schedule.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(output_dir)
    if sha256_file(schedule) != args.expected_schedule_sha256:
        raise AnalysisError("schedule SHA-256 mismatch")
    schedule_rows = read_jsonl(schedule)
    c0_targets = {normalize(row["output_text"]) for row in schedule_rows}
    c0_units = {unit for target in c0_targets for unit in target.split()}
    parent_ids = {row["accounting_parent_id"] for row in schedule_rows}
    if len(schedule_rows) != 52000 or len(parent_ids) != 55:
        raise AnalysisError("C0 schedule population drift")

    all_predictions: dict[tuple[str, int], list[dict[str, Any]]] = {}
    trajectory: list[dict[str, Any]] = []
    input_files: dict[str, str] = {str(schedule): sha256_file(schedule)}
    row_diagnostics: list[dict[str, Any]] = []
    for arm in ("I0", "I1", "I2"):
        arm_result_path = result_root / "arms" / arm / "ARM-RESULT.json"
        arm_result = read_json(arm_result_path)
        input_files[str(arm_result_path)] = sha256_file(arm_result_path)
        for step in (50, 100, 200, 400):
            root = result_root / "arms" / arm / "hosted-evaluation" / f"step-{step}"
            predictions_path = root / "PREDICTIONS.jsonl"
            metrics_path = root / "METRICS.json"
            predictions = read_jsonl(predictions_path)
            metrics = read_json(metrics_path)
            if len(predictions) != 143 or metrics["overall_diagnostics"]["rows"] != 143:
                raise AnalysisError(f"incomplete hosted population: {arm} step {step}")
            input_files[str(predictions_path)] = sha256_file(predictions_path)
            input_files[str(metrics_path)] = sha256_file(metrics_path)
            quality = arm_result["hosted_evaluations"][str(step)]
            all_predictions[(arm, step)] = predictions
            trajectory.append(
                {
                    "arm": arm,
                    "step": step,
                    "quality_eligible": quality["quality_eligible"],
                    "quality_status": quality["status"],
                    "overall": metrics["overall_diagnostics"],
                    "by_suite": metrics["by_suite"],
                }
            )
            if step != 400:
                continue
            for row in predictions:
                structure = unit_profile(
                    row["prediction"], row["accepted_references"], c0_targets, c0_units
                )
                row_diagnostics.append(
                    {
                        "arm": arm,
                        "step": step,
                        "evaluation_id": row["evaluation_id"],
                        "row_id": row["row_id"],
                        "suite": row["suite"],
                        "task": row["task"],
                        "pair_kind": row["pair_kind"],
                        "input_text": row["input_text"],
                        "accepted_references": row["accepted_references"],
                        "prediction": row["prediction"],
                        "normalized_prediction": row["normalized_prediction"],
                        "normalized_exact": row["normalized_exact"],
                        "grapheme_cluster_error_rate": row[
                            "grapheme_cluster_error_rate"
                        ],
                        "surface_class": row["surface_class"],
                        "prediction_token_count": row["prediction_token_count"],
                        "minimum_reference_token_count": row[
                            "minimum_reference_token_count"
                        ],
                        "outside_reference_graphemes": row[
                            "outside_reference_graphemes"
                        ],
                        "template_id": row.get("template_id"),
                        "construction_family": row.get("construction_family"),
                        "structure": structure,
                        "claim_limit": CLAIM_LIMIT,
                    }
                )

    structural_by_arm: dict[str, Any] = {}
    for arm in ("I0", "I1", "I2"):
        arm_rows = [row for row in row_diagnostics if row["arm"] == arm]
        suites: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in arm_rows:
            suites[row["suite"]].append(row)
        structural_by_arm[arm] = {
            "all": compact_structural(arm_rows),
            "by_suite": {
                name: compact_structural(rows) for name, rows in sorted(suites.items())
            },
            "open_lexical_exact_rows": [
                {
                    "row_id": row["row_id"],
                    "input_text": row["input_text"],
                    "accepted_references": row["accepted_references"],
                    "prediction": row["prediction"],
                }
                for row in arm_rows
                if row["suite"] == "open_lexical_training_reconstruction"
                and row["normalized_exact"]
            ],
            "synthetic_exact_rows": [
                {
                    "row_id": row["row_id"],
                    "input_text": row["input_text"],
                    "accepted_references": row["accepted_references"],
                    "prediction": row["prediction"],
                    "template_id": row["template_id"],
                }
                for row in arm_rows
                if row["suite"] == "synthetic_compositional_development"
                and row["normalized_exact"]
            ],
        }

    pairwise_step400 = {
        f"{left}_vs_{right}": identical_output_count(
            all_predictions[(left, 400)], all_predictions[(right, 400)]
        )
        for left, right in (("I0", "I1"), ("I0", "I2"), ("I1", "I2"))
    }
    checkpoint_stability: dict[str, Any] = {}
    for arm in ("I0", "I1", "I2"):
        checkpoint_stability[arm] = {
            f"step_{left}_vs_{right}": identical_output_count(
                all_predictions[(arm, left)], all_predictions[(arm, right)]
            )
            for left, right in ((50, 100), (100, 200), (200, 400))
        }

    summary = {
        "schema_version": 1,
        "status": "PASS_COMPLETE_HOSTED_STAGE_I_STRUCTURAL_ANALYSIS",
        "claim_limit": CLAIM_LIMIT,
        "inputs": {
            "result_root": str(result_root),
            "schedule_rows": len(schedule_rows),
            "unique_c0_parent_rows": len(parent_ids),
            "unique_c0_target_strings": len(c0_targets),
            "unique_c0_target_whitespace_units": len(c0_units),
            "files": dict(sorted(input_files.items())),
        },
        "trajectory": trajectory,
        "step_400_structural_diagnostics": structural_by_arm,
        "step_400_pairwise_token_identity": pairwise_step400,
        "checkpoint_token_identity": checkpoint_stability,
        "interpretive_limits": [
            "C0 target-string and whitespace-unit membership is a mechanical replay diagnostic, not semantic analysis.",
            "First-unit and remaining-unit preservation describe positions in controlled references; they are not inferred grammatical constituents.",
            "The 76 open lexical rows are source-scoped reconstruction diagnostics, not an unseen-lexeme test.",
            "The 12 synthetic rows are controlled held-out bindings without fluent-speaker validation, not natural reference gold.",
        ],
    }
    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "SUMMARY.json", summary)
    write_jsonl_atomic(output_dir / "ROW-DIAGNOSTICS.jsonl", row_diagnostics)
    files = [output_dir / "ROW-DIAGNOSTICS.jsonl", output_dir / "SUMMARY.json"]
    (output_dir / "OUTPUT-SHA256SUMS").write_text(
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

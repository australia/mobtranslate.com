#!/usr/bin/env python3
"""Compare the Mi'kmaq v1, retention-control, and lexical-treatment screens.

The comparison is entirely artifact based. It validates the exhaustive row
alignment, distinguishes directly trained lexemes from held-out lineages, and
keeps lexical reconstruction separate from sentence-retention measurements.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import statistics
import tempfile
from typing import Any, Callable


TASK_SUFFIX = ":task-lexeme"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--v1-predictions", type=Path, required=True)
    parser.add_argument("--v1-sentence-run", type=Path, required=True)
    parser.add_argument("--control-run", type=Path, required=True)
    parser.add_argument("--treatment-run", type=Path, required=True)
    parser.add_argument("--direct-train-pool", type=Path, required=True)
    parser.add_argument("--heldout-pool", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, default=14_438)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--row-output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_id(value: Any) -> str:
    row_id = str(value or "")
    if row_id.endswith(TASK_SUFFIX):
        return row_id[: -len(TASK_SUFFIX)]
    return row_id


def normalized_references(row: dict[str, Any]) -> tuple[str, ...]:
    references = row.get("accepted_references_normalized") or row.get("accepted_references") or []
    return tuple(sorted(" ".join(str(value).casefold().split()) for value in references))


def load_predictions(path: Path) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            row = json.loads(line)
            row_id = canonical_id(row.get("id"))
            if not row_id:
                raise ValueError(f"missing row ID at {path}:{line_number}")
            if row_id in rows:
                raise ValueError(f"duplicate canonical row ID {row_id} in {path}")
            if "accepted_exact" not in row or "grapheme_cer" not in row:
                raise ValueError(f"missing lexical measurements for {row_id} in {path}")
            rows[row_id] = row
    if not rows:
        raise ValueError(f"no prediction rows in {path}")
    return rows


def load_pool_ids(path: Path) -> set[str]:
    ids: set[str] = set()
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            row_id = canonical_id(json.loads(line).get("id"))
            if not row_id:
                raise ValueError(f"missing pool row ID at {path}:{line_number}")
            if row_id in ids:
                raise ValueError(f"duplicate pool row ID {row_id} in {path}")
            ids.add(row_id)
    return ids


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object in {path}")
    return value


def mean(values: list[float]) -> float:
    return statistics.mean(values) if values else 0.0


def basic_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    predictions = [str(row.get("prediction_normalized") or "") for row in rows]
    exact = [bool(row["accepted_exact"]) for row in rows]
    cers = [float(row["grapheme_cer"]) for row in rows]
    frequencies = Counter(predictions)
    return {
        "rows": len(rows),
        "accepted_exact_count": sum(exact),
        "accepted_exact_percent": 100 * mean([float(value) for value in exact]),
        "mean_grapheme_cer": mean(cers),
        "median_grapheme_cer": statistics.median(cers) if cers else 0.0,
        "empty_outputs": sum(bool(row.get("empty")) for row in rows),
        "source_copy_outputs": sum(bool(row.get("source_copy")) for row in rows),
        "near_surface_failures": sum(row.get("edit_error_type") == "near_surface_form" for row in rows),
        "unique_normalized_outputs": len(frequencies),
        "maximum_normalized_output_frequency": max(frequencies.values(), default=0),
    }


def grouped_metrics(
    rows: list[dict[str, Any]],
    key: Callable[[dict[str, Any]], str],
) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[key(row)].append(row)
    return {name: basic_metrics(group) for name, group in sorted(groups.items())}


def top_predictions(rows: list[dict[str, Any]], limit: int = 20) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("prediction_normalized") or "")].append(row)
    ranked = sorted(grouped.items(), key=lambda item: (-len(item[1]), item[0]))[:limit]
    result: list[dict[str, Any]] = []
    for prediction, members in ranked:
        exact = sum(bool(row["accepted_exact"]) for row in members)
        references = {normalized_references(row) for row in members}
        result.append(
            {
                "prediction": prediction,
                "rows": len(members),
                "accepted_exact_count": exact,
                "exact_precision_percent": 100 * exact / len(members),
                "distinct_accepted_reference_sets": len(references),
            }
        )
    return result


def top_predictions_by_part_of_speech(rows: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get("part_of_speech") or "(missing)")].append(row)
    return {
        part_of_speech: {
            "rows": len(members),
            "top_predictions": top_predictions(members, limit=5),
        }
        for part_of_speech, members in sorted(groups.items())
    }


def model_summary(rows: dict[str, dict[str, Any]], cohorts: dict[str, str]) -> dict[str, Any]:
    ordered = [rows[row_id] for row_id in sorted(rows)]
    return {
        "overall": basic_metrics(ordered),
        "cohort": grouped_metrics(ordered, lambda row: cohorts[canonical_id(row.get("id"))]),
        "part_of_speech": grouped_metrics(
            ordered, lambda row: str(row.get("part_of_speech") or "(missing)")
        ),
        "target_subword_count": grouped_metrics(
            ordered,
            lambda row: str(row.get("target_subword_count") or "(missing)"),
        ),
        "edit_error_type": dict(
            sorted(Counter(str(row.get("edit_error_type") or "(missing)") for row in ordered).items())
        ),
        "top_predictions": top_predictions(ordered),
        "top_predictions_by_part_of_speech": top_predictions_by_part_of_speech(ordered),
    }


def exact_transition(left: bool, right: bool) -> str:
    if left and right:
        return "stable_exact"
    if left:
        return "loss"
    if right:
        return "gain"
    return "stable_failure"


def paired_summary(
    left: dict[str, dict[str, Any]],
    right: dict[str, dict[str, Any]],
    cohorts: dict[str, str],
    left_label: str,
    right_label: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    matrix: list[dict[str, Any]] = []
    for row_id in sorted(left):
        left_row = left[row_id]
        right_row = right[row_id]
        left_cer = float(left_row["grapheme_cer"])
        right_cer = float(right_row["grapheme_cer"])
        matrix.append(
            {
                "id": row_id,
                "cohort": cohorts[row_id],
                "input": right_row.get("unconditioned_input_text"),
                "part_of_speech": right_row.get("part_of_speech"),
                "accepted_references": right_row.get("accepted_references"),
                "target_subword_count": right_row.get("target_subword_count"),
                "exact_transition": exact_transition(
                    bool(left_row["accepted_exact"]), bool(right_row["accepted_exact"])
                ),
                "grapheme_cer_delta_right_minus_left": right_cer - left_cer,
                left_label: {
                    "prediction": left_row.get("prediction"),
                    "accepted_exact": bool(left_row["accepted_exact"]),
                    "grapheme_cer": left_cer,
                    "edit_error_type": left_row.get("edit_error_type"),
                },
                right_label: {
                    "prediction": right_row.get("prediction"),
                    "accepted_exact": bool(right_row["accepted_exact"]),
                    "grapheme_cer": right_cer,
                    "edit_error_type": right_row.get("edit_error_type"),
                },
            }
        )

    transitions = Counter(row["exact_transition"] for row in matrix)
    deltas = [float(row["grapheme_cer_delta_right_minus_left"]) for row in matrix]
    epsilon = 1e-12
    by_cohort: dict[str, Any] = {}
    for cohort in sorted(set(cohorts.values())):
        members = [row for row in matrix if row["cohort"] == cohort]
        cohort_deltas = [float(row["grapheme_cer_delta_right_minus_left"]) for row in members]
        by_cohort[cohort] = {
            "rows": len(members),
            "exact_transitions": dict(sorted(Counter(row["exact_transition"] for row in members).items())),
            "mean_grapheme_cer_delta_right_minus_left": mean(cohort_deltas),
            "cer_improved_rows": sum(value < -epsilon for value in cohort_deltas),
            "cer_worsened_rows": sum(value > epsilon for value in cohort_deltas),
            "cer_tied_rows": sum(abs(value) <= epsilon for value in cohort_deltas),
        }

    gains = [row for row in matrix if row["exact_transition"] == "gain"]
    losses = [row for row in matrix if row["exact_transition"] == "loss"]
    largest_improvements = sorted(matrix, key=lambda row: row["grapheme_cer_delta_right_minus_left"])[
        :25
    ]
    largest_regressions = sorted(
        matrix, key=lambda row: row["grapheme_cer_delta_right_minus_left"], reverse=True
    )[:25]
    return (
        {
            "left": left_label,
            "right": right_label,
            "rows": len(matrix),
            "exact_transitions": dict(sorted(transitions.items())),
            "mean_grapheme_cer_delta_right_minus_left": mean(deltas),
            "cer_improved_rows": sum(value < -epsilon for value in deltas),
            "cer_worsened_rows": sum(value > epsilon for value in deltas),
            "cer_tied_rows": sum(abs(value) <= epsilon for value in deltas),
            "by_cohort": by_cohort,
            "exact_gain_examples": gains,
            "exact_loss_examples": losses,
            "largest_cer_improvements": largest_improvements,
            "largest_cer_regressions": largest_regressions,
        },
        matrix,
    )


def sentence_metrics(run: Path, baseline: bool = False) -> dict[str, Any]:
    if baseline:
        manifest = load_json(run / "manifest.json")
        return manifest["metrics"]
    return {
        "validation": load_json(run / "evaluations/sentence-validation.json")["metrics"],
        "opened_regression": load_json(
            run / "evaluations/sentence-opened-regression.json"
        )["metrics"],
    }


def training_exposure(run: Path) -> dict[str, Any]:
    manifest = load_json(run / "model/model_manifest.json")
    return {
        "training_args": {
            key: manifest["training_args"].get(key)
            for key in (
                "max_steps",
                "batch_size",
                "gradient_accumulation_steps",
                "learning_rate",
                "warmup_ratio",
            )
        },
        "actual_training_exposure": manifest["trainer_state"]["actual_training_exposure"],
    }


def validate_alignment(
    candidates: dict[str, dict[str, dict[str, Any]]],
    expected_rows: int,
) -> set[str]:
    labels = list(candidates)
    first_ids = set(candidates[labels[0]])
    if len(first_ids) != expected_rows:
        raise ValueError(f"expected {expected_rows} rows, found {len(first_ids)} in {labels[0]}")
    for label in labels[1:]:
        ids = set(candidates[label])
        if ids != first_ids:
            raise ValueError(
                f"row mismatch for {label}: first_only={len(first_ids - ids)}, "
                f"candidate_only={len(ids - first_ids)}"
            )
    for row_id in first_ids:
        references = {
            normalized_references(candidates[label][row_id])
            for label in labels
        }
        if len(references) != 1:
            raise ValueError(f"accepted-reference mismatch for {row_id}")
    return first_ids


def build_report(
    v1_predictions: Path,
    v1_sentence_run: Path,
    control_run: Path,
    treatment_run: Path,
    direct_train_pool: Path,
    heldout_pool: Path,
    expected_rows: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    prediction_paths = {
        "v1": v1_predictions,
        "retention_control": control_run / "evaluations/lexical-full/predictions.jsonl",
        "lexical_treatment": treatment_run / "evaluations/lexical-full/predictions.jsonl",
    }
    candidates = {label: load_predictions(path) for label, path in prediction_paths.items()}
    benchmark_ids = validate_alignment(candidates, expected_rows)

    direct_ids = load_pool_ids(direct_train_pool)
    heldout_ids = load_pool_ids(heldout_pool)
    if direct_ids & heldout_ids:
        raise ValueError(f"training and held-out pools overlap by {len(direct_ids & heldout_ids)} rows")
    if direct_ids | heldout_ids != benchmark_ids:
        raise ValueError(
            "pool union does not equal benchmark: "
            f"benchmark_only={len(benchmark_ids - (direct_ids | heldout_ids))}, "
            f"pool_only={len((direct_ids | heldout_ids) - benchmark_ids)}"
        )
    cohorts = {
        row_id: "direct_pair_training_pool" if row_id in direct_ids else "heldout_lineage"
        for row_id in benchmark_ids
    }

    control_comparison, control_matrix = paired_summary(
        candidates["retention_control"],
        candidates["lexical_treatment"],
        cohorts,
        "retention_control",
        "lexical_treatment",
    )
    v1_comparison, _ = paired_summary(
        candidates["v1"],
        candidates["lexical_treatment"],
        cohorts,
        "v1",
        "lexical_treatment",
    )

    base_sentence = sentence_metrics(v1_sentence_run, baseline=True)
    control_sentence = sentence_metrics(control_run)
    treatment_sentence = sentence_metrics(treatment_run)
    for split in ("validation", "opened_regression"):
        signatures = {
            tuple(
                metrics[split][key]
                for key in (
                    "rows",
                    "num_beams",
                    "no_repeat_ngram_size",
                    "repetition_penalty",
                    "length_penalty",
                )
            )
            for metrics in (base_sentence, control_sentence, treatment_sentence)
        }
        if len(signatures) != 1:
            raise ValueError(f"sentence evaluation contract mismatch for {split}")

    sentence = {
        "v1": base_sentence,
        "retention_control": control_sentence,
        "lexical_treatment": treatment_sentence,
        "delta_from_v1": {
            label: {
                split: {
                    "chrf": metrics[split]["chrf"] - base_sentence[split]["chrf"],
                    "bleu": metrics[split]["bleu"] - base_sentence[split]["bleu"],
                }
                for split in ("validation", "opened_regression")
            }
            for label, metrics in (
                ("retention_control", control_sentence),
                ("lexical_treatment", treatment_sentence),
            )
        },
        "lexical_treatment_minus_retention_control": {
            split: {
                "chrf": treatment_sentence[split]["chrf"] - control_sentence[split]["chrf"],
                "bleu": treatment_sentence[split]["bleu"] - control_sentence[split]["bleu"],
            }
            for split in ("validation", "opened_regression")
        },
    }

    report = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "migmaq_v2_paired_lexical_supervision_screen",
        "implementation": {
            "path": str(Path(__file__).resolve()),
            "sha256": sha256(Path(__file__)),
        },
        "claim_limit": (
            "This compares closed-set lexical reconstruction and frozen sentence regression artifacts. "
            "It does not establish unseen lexical generalization, grammatical adequacy, speaker approval, "
            "or readiness for public sentence translation."
        ),
        "inputs": {
            label: {"path": str(path.resolve()), "sha256": sha256(path)}
            for label, path in prediction_paths.items()
        }
        | {
            "direct_train_pool": {
                "path": str(direct_train_pool.resolve()),
                "sha256": sha256(direct_train_pool),
            },
            "heldout_pool": {"path": str(heldout_pool.resolve()), "sha256": sha256(heldout_pool)},
        },
        "rows": expected_rows,
        "cohort_rows": dict(sorted(Counter(cohorts.values()).items())),
        "lexical": {
            label: model_summary(rows, cohorts) for label, rows in candidates.items()
        },
        "paired": {
            "retention_control_to_lexical_treatment": control_comparison,
            "v1_to_lexical_treatment": v1_comparison,
        },
        "sentence": sentence,
        "training_exposure": {
            "retention_control": training_exposure(control_run),
            "lexical_treatment": training_exposure(treatment_run),
        },
    }
    return report, control_matrix


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    report, matrix = build_report(
        args.v1_predictions,
        args.v1_sentence_run,
        args.control_run,
        args.treatment_run,
        args.direct_train_pool,
        args.heldout_pool,
        args.expected_rows,
    )
    write_json_atomic(args.output, report)
    write_jsonl_atomic(args.row_output, matrix)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Join Wajarri mixed-replay exposure, lexical transitions, and composition output."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result-output-dir", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--pair-matches", type=Path, required=True)
    parser.add_argument("--treatment-schedule", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"JSON root must be an object: {path}")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not all(isinstance(row, dict) for row in rows):
        raise TypeError(f"JSONL contains a non-object: {path}")
    return rows


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def index_unique(rows: list[dict[str, Any]], field: str, label: str) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = str(row.get(field) or "")
        if not value or value in indexed:
            raise ValueError(f"{label} has an empty or duplicate {field}: {value!r}")
        indexed[value] = row
    return indexed


def transition(before: bool, after: bool) -> str:
    if before and after:
        return "retained_exact"
    if before and not after:
        return "lost_exact"
    if not before and after:
        return "gained_exact"
    return "remained_nonexact"


def normalized_tokens(value: str) -> set[str]:
    return set(re.findall(r"[^\W_]+(?:[-'][^\W_]+)*", value.casefold()))


def grouped_exact(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row[field])].append(row)
    return {
        key: {
            "rows": len(values),
            "exact": sum(bool(value["treatment_exact"]) for value in values),
            "lost_from_baseline": sum(
                value["transition"] == "lost_exact" for value in values
            ),
        }
        for key, values in sorted(grouped.items())
    }


def summarize_anchor_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "rows": len(rows),
        "baseline_exact": sum(bool(row["baseline_exact"]) for row in rows),
        "control_exact": sum(bool(row["control_exact"]) for row in rows),
        "treatment_exact": sum(bool(row["treatment_exact"]) for row in rows),
        "transitions": dict(sorted(Counter(row["transition"] for row in rows).items())),
        "treatment_surface_classes": dict(
            sorted(Counter(row["treatment_surface_class"] for row in rows).items())
        ),
        "composition_surface_intrusions": sum(
            bool(row["composition_surface_intrusions"]) for row in rows
        ),
        "by_selected_checkpoint_presentations": grouped_exact(
            rows, "selected_checkpoint_presentations"
        ),
        "by_target_token_bucket": grouped_exact(rows, "target_token_bucket"),
    }


def build_analysis(
    *,
    result_dir: Path,
    contract: dict[str, Any],
    pairs: list[dict[str, Any]],
    treatment_schedule: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    result = load_json(result_dir / "RESULT.json")
    roles = result["experiment_roles"]
    baseline_arm = str(roles["baseline_arm"])
    control_arm = str(roles["control_arm"])
    treatment_arm = str(roles["treatment_arm"])
    selected = result["selected_checkpoints"][treatment_arm]
    selected_step = int(selected["step"])
    selected_label = str(selected["label"])

    predictions: dict[str, dict[str, dict[str, Any]]] = {}
    for arm in (baseline_arm, control_arm, treatment_arm):
        path = result_dir / "full-evaluation" / arm / "predictions" / "lexical_direct_closed.jsonl"
        predictions[arm] = index_unique(load_jsonl(path), "id", f"{arm} predictions")
    if not (
        predictions[baseline_arm].keys()
        == predictions[control_arm].keys()
        == predictions[treatment_arm].keys()
    ):
        raise ValueError("full lexical prediction populations differ between arms")

    presentations_per_update = int(
        contract["training"]["effective_presentations_per_update"]
    )
    selected_presentations = selected_step * presentations_per_update
    schedule_prefix = treatment_schedule[:selected_presentations]
    if len(schedule_prefix) != selected_presentations:
        raise ValueError("treatment schedule is shorter than the selected checkpoint exposure")
    schedule_exposures = Counter(str(row["accounting_parent_id"]) for row in schedule_prefix)
    schedule_updates: dict[str, list[int]] = defaultdict(list)
    for row in schedule_prefix:
        schedule_updates[str(row["accounting_parent_id"])].append(
            int(row["optimizer_update"])
        )

    exposure_path = (
        result_dir
        / "selected-adapters"
        / treatment_arm
        / "exposure-row-presentations.jsonl"
    )
    checkpoint_exposures = {
        str(row["id"]): int(row["presentations"])
        for row in load_jsonl(exposure_path)
    }
    if dict(schedule_exposures) != checkpoint_exposures:
        raise ValueError("selected checkpoint exposure ledger does not match schedule prefix")

    dev_predictions: dict[str, dict[str, dict[str, Any]]] = {}
    dev_labels = {
        baseline_arm: baseline_arm,
        control_arm: str(result["selected_checkpoints"][control_arm]["label"]),
        treatment_arm: selected_label,
    }
    for arm, label in dev_labels.items():
        path = result_dir / "development-evaluation" / label / "PREDICTIONS.jsonl"
        dev_predictions[arm] = index_unique(load_jsonl(path), "cell_id", f"{label} development")
    if not (
        dev_predictions[baseline_arm].keys()
        == dev_predictions[control_arm].keys()
        == dev_predictions[treatment_arm].keys()
    ):
        raise ValueError("development prediction populations differ between arms")

    composition_surfaces: set[str] = set()
    for row in dev_predictions[treatment_arm].values():
        composition_surfaces.update(normalized_tokens(str(row["expected_subject"])))
        composition_surfaces.update(normalized_tokens(str(row["expected_predicate"])))

    anchor_rows: list[dict[str, Any]] = []
    seen_anchor_ids: set[str] = set()
    for pair in pairs:
        anchor = pair["anchor"]
        anchor_id = str(anchor["id"])
        if anchor_id in seen_anchor_ids:
            raise ValueError(f"duplicate anchor ID: {anchor_id}")
        seen_anchor_ids.add(anchor_id)
        arm_rows = {arm: predictions[arm][anchor_id] for arm in predictions}
        treatment_prediction = str(arm_rows[treatment_arm]["prediction"])
        target = str(anchor["output_text"])
        intrusions = sorted(
            normalized_tokens(treatment_prediction)
            & composition_surfaces
            - normalized_tokens(target)
        )
        updates = schedule_updates.get(anchor_id, [])
        anchor_rows.append(
            {
                "schema_version": 1,
                "pair_id": str(pair["pair_id"]),
                "id": anchor_id,
                "input_text": str(anchor["input_text"]),
                "target_text": target,
                "mandatory_regression_anchor": bool(
                    pair.get("mandatory_regression_anchor")
                ),
                "source_tokens_with_specials": int(
                    anchor["token_accounting"]["source_tokens_with_specials"]
                ),
                "target_tokens_with_specials": int(
                    anchor["token_accounting"]["target_tokens_with_specials"]
                ),
                "target_token_bucket": str(anchor["reference_token_length_bucket"]),
                "selected_checkpoint_presentations": schedule_exposures.get(anchor_id, 0),
                "first_presentation_update": min(updates) if updates else None,
                "last_presentation_update": max(updates) if updates else None,
                "baseline_prediction": str(arm_rows[baseline_arm]["prediction"]),
                "baseline_exact": bool(arm_rows[baseline_arm]["exact"]),
                "control_prediction": str(arm_rows[control_arm]["prediction"]),
                "control_exact": bool(arm_rows[control_arm]["exact"]),
                "treatment_prediction": treatment_prediction,
                "treatment_exact": bool(arm_rows[treatment_arm]["exact"]),
                "treatment_surface_class": str(
                    arm_rows[treatment_arm]["surface_class"]
                ),
                "treatment_chrf2": float(arm_rows[treatment_arm]["chrf2"]),
                "treatment_grapheme_cer": float(
                    arm_rows[treatment_arm]["grapheme_cer"]
                ),
                "transition": transition(
                    bool(arm_rows[baseline_arm]["exact"]),
                    bool(arm_rows[treatment_arm]["exact"]),
                ),
                "composition_surface_intrusions": intrusions,
            }
        )

    lexical_transitions: list[dict[str, Any]] = []
    for row_id in sorted(predictions[baseline_arm]):
        arm_rows = {arm: predictions[arm][row_id] for arm in predictions}
        if arm_rows[baseline_arm].get("ambiguity_class") != "one_target":
            continue
        lexical_transitions.append(
            {
                "schema_version": 1,
                "id": row_id,
                "input_text": str(arm_rows[baseline_arm]["input_text"]),
                "accepted_references": arm_rows[baseline_arm]["accepted_references"],
                "baseline_prediction": str(arm_rows[baseline_arm]["prediction"]),
                "baseline_exact": bool(arm_rows[baseline_arm]["exact"]),
                "control_prediction": str(arm_rows[control_arm]["prediction"]),
                "control_exact": bool(arm_rows[control_arm]["exact"]),
                "treatment_prediction": str(arm_rows[treatment_arm]["prediction"]),
                "treatment_exact": bool(arm_rows[treatment_arm]["exact"]),
                "treatment_surface_class": str(
                    arm_rows[treatment_arm]["surface_class"]
                ),
                "transition": transition(
                    bool(arm_rows[baseline_arm]["exact"]),
                    bool(arm_rows[treatment_arm]["exact"]),
                ),
                "is_trained_anchor": row_id in seen_anchor_ids,
            }
        )

    development_rows: list[dict[str, Any]] = []
    for cell_id in sorted(dev_predictions[baseline_arm]):
        arm_rows = {arm: dev_predictions[arm][cell_id] for arm in dev_predictions}
        treatment_row = arm_rows[treatment_arm]
        development_rows.append(
            {
                "schema_version": 1,
                "cell_id": cell_id,
                "source_text": str(treatment_row["source_text"]),
                "reference": str(treatment_row["reference"]),
                "subject_id": str(treatment_row["subject_id"]),
                "predicate_id": str(treatment_row["predicate_id"]),
                "baseline_prediction": str(arm_rows[baseline_arm]["prediction"]),
                "control_prediction": str(arm_rows[control_arm]["prediction"]),
                "treatment_prediction": str(treatment_row["prediction"]),
                "treatment_exact": bool(treatment_row["exact"]),
                "treatment_subject_present": bool(
                    treatment_row["expected_subject_present"]
                ),
                "treatment_predicate_present": bool(
                    treatment_row["expected_predicate_present"]
                ),
                "treatment_both_slots_present": bool(
                    treatment_row["both_expected_slots_present"]
                ),
                "treatment_chrf2": float(treatment_row["chrf2"]),
                "failure_codes": treatment_row["failure_codes"],
            }
        )

    mandatory_rows = [row for row in anchor_rows if row["mandatory_regression_anchor"]]
    lexical_transition_counts = dict(
        sorted(Counter(row["transition"] for row in lexical_transitions).items())
    )
    report = {
        "schema_version": 1,
        "run_id": str(result["run_id"]),
        "result_status": str(result["status"]),
        "roles": roles,
        "selected_treatment_checkpoint": {
            "step": selected_step,
            "label": selected_label,
            "presentations": selected_presentations,
            "unique_rows_seen": len(checkpoint_exposures),
        },
        "lexical_transitions": {
            "rows": len(lexical_transitions),
            "counts": lexical_transition_counts,
            "net_exact_change": lexical_transition_counts.get("gained_exact", 0)
            - lexical_transition_counts.get("lost_exact", 0),
        },
        "anchor_replay": {
            "all": summarize_anchor_rows(anchor_rows),
            "mandatory": summarize_anchor_rows(mandatory_rows),
        },
        "fresh_composition": {
            "rows": len(development_rows),
            "exact": sum(bool(row["treatment_exact"]) for row in development_rows),
            "both_slots_present": sum(
                bool(row["treatment_both_slots_present"])
                for row in development_rows
            ),
            "subject_present": sum(
                bool(row["treatment_subject_present"]) for row in development_rows
            ),
            "predicate_present": sum(
                bool(row["treatment_predicate_present"])
                for row in development_rows
            ),
            "by_subject": grouped_exact(
                [
                    {
                        **row,
                        "transition": (
                            "retained_exact" if row["treatment_exact"] else "remained_nonexact"
                        ),
                    }
                    for row in development_rows
                ],
                "subject_id",
            ),
            "by_predicate": grouped_exact(
                [
                    {
                        **row,
                        "transition": (
                            "retained_exact" if row["treatment_exact"] else "remained_nonexact"
                        ),
                    }
                    for row in development_rows
                ],
                "predicate_id",
            ),
        },
        "claim_limit": (
            "This post-hoc analysis localizes behavior in a development-consumed, "
            "controlled synthetic screen. It does not estimate natural Wajarri "
            "translation reliability or authorize public model promotion."
        ),
    }
    return report, anchor_rows, lexical_transitions, development_rows


def main() -> None:
    args = parse_args()
    result_dir = args.result_output_dir.resolve()
    report, anchor_rows, lexical_transitions, development_rows = build_analysis(
        result_dir=result_dir,
        contract=load_json(args.contract),
        pairs=load_jsonl(args.pair_matches),
        treatment_schedule=load_jsonl(args.treatment_schedule),
    )
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=False)
    write_json(output_dir / "REPORT.json", report)
    write_jsonl(output_dir / "ANCHOR-OUTCOMES.jsonl", anchor_rows)
    write_jsonl(output_dir / "LEXICAL-TRANSITIONS.jsonl", lexical_transitions)
    write_jsonl(output_dir / "DEVELOPMENT-OUTCOMES.jsonl", development_rows)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Summarize per-lexeme learning and regression across aligned checkpoints."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from itertools import pairwise
import json
from pathlib import Path
import tempfile
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--row-analysis-file", type=Path, required=True)
    parser.add_argument("--candidate-order", action="append", required=True)
    parser.add_argument("--baseline-label", default="B0")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--matrix-output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_aligned(path: Path) -> dict[str, dict[str, dict[str, Any]]]:
    candidates: dict[str, dict[str, dict[str, Any]]] = {}
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            row = json.loads(line)
            candidate = str(row.get("candidate") or "")
            row_id = str(row.get("id") or "")
            if not candidate or not row_id:
                raise ValueError(f"missing candidate or row ID at line {line_number}")
            by_id = candidates.setdefault(candidate, {})
            if row_id in by_id:
                raise ValueError(f"duplicate {candidate}/{row_id}")
            by_id[row_id] = row
    if not candidates:
        raise ValueError(f"empty row analysis: {path}")
    return candidates


def is_exact(row: dict[str, Any]) -> bool:
    analysis = row.get("analysis") or {}
    if "exact_accepted" not in analysis:
        raise ValueError(f"row lacks analysis.exact_accepted: {row.get('candidate')}/{row.get('id')}")
    return bool(analysis["exact_accepted"])


def trajectory_class(statuses: list[bool]) -> str:
    if not any(statuses):
        return "never_exact"
    if all(statuses):
        return "exact_at_every_checkpoint"
    gains = [index for index in range(1, len(statuses)) if not statuses[index - 1] and statuses[index]]
    losses = [index for index in range(1, len(statuses)) if statuses[index - 1] and not statuses[index]]
    if losses and gains and any(gain > losses[0] for gain in gains):
        return "oscillating"
    if losses:
        return "regressed"
    return "learned_and_retained"


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


def summarize(
    row_analysis_file: Path,
    candidate_order: list[str],
    baseline_label: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if len(candidate_order) < 2 or len(candidate_order) != len(set(candidate_order)):
        raise ValueError("candidate order must contain at least two unique labels")
    if baseline_label not in candidate_order:
        raise ValueError("baseline label is absent from candidate order")

    candidates = load_aligned(row_analysis_file)
    missing = [label for label in candidate_order if label not in candidates]
    if missing:
        raise ValueError(f"missing candidates: {missing}")
    reference_ids = set(candidates[candidate_order[0]])
    for label in candidate_order[1:]:
        ids = set(candidates[label])
        if ids != reference_ids:
            raise ValueError(
                f"row ID mismatch for {label}: missing={len(reference_ids - ids)}, extra={len(ids - reference_ids)}"
            )

    treatment_labels = [label for label in candidate_order if label != baseline_label]
    matrix: list[dict[str, Any]] = []
    classes: Counter[str] = Counter()
    transitions: dict[str, Counter[str]] = {
        f"{previous}->{current}": Counter()
        for previous, current in pairwise(candidate_order)
    }
    checkpoint_categories: dict[str, Counter[str]] = {label: Counter() for label in candidate_order}

    for row_id in sorted(reference_ids):
        rows = {label: candidates[label][row_id] for label in candidate_order}
        statuses = {label: is_exact(rows[label]) for label in candidate_order}
        treatment_statuses = [statuses[label] for label in treatment_labels]
        classification = trajectory_class(treatment_statuses)
        classes[classification] += 1

        for label in candidate_order:
            checkpoint_categories[label][str(rows[label]["analysis"]["category"])] += 1
        for previous, current in pairwise(candidate_order):
            before = statuses[previous]
            after = statuses[current]
            transition = "gain" if not before and after else "loss" if before and not after else "stable_exact" if after else "stable_failure"
            transitions[f"{previous}->{current}"][transition] += 1

        first_exact = next((label for label in treatment_labels if statuses[label]), None)
        losses_after_exact = [
            label
            for previous, label in pairwise(treatment_labels)
            if statuses[previous] and not statuses[label]
        ]
        representative = rows[candidate_order[0]]
        matrix.append(
            {
                "id": row_id,
                "input_text": representative.get("input_text"),
                "unconditioned_input_text": representative.get("unconditioned_input_text"),
                "accepted_references": representative.get("accepted_references"),
                "parts_of_speech": representative.get("parts_of_speech"),
                "semantic_domains": (representative.get("strata") or {}).get("semantic_domain"),
                "statuses": statuses,
                "predictions": {label: rows[label].get("prediction") for label in candidate_order},
                "error_categories": {
                    label: rows[label]["analysis"]["category"] for label in candidate_order
                },
                "trajectory_class": classification,
                "first_exact_checkpoint": first_exact,
                "losses_after_exact": losses_after_exact,
            }
        )

    summary = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "aligned_closed_set_lexeme_checkpoint_trajectories",
        "row_analysis_file": str(row_analysis_file.resolve()),
        "row_analysis_sha256": sha256(row_analysis_file),
        "rows": len(matrix),
        "candidate_order": candidate_order,
        "baseline_label": baseline_label,
        "treatment_labels": treatment_labels,
        "trajectory_classes": dict(sorted(classes.items())),
        "adjacent_transitions": {
            pair: dict(sorted(counts.items())) for pair, counts in transitions.items()
        },
        "checkpoint_error_categories": {
            label: dict(sorted(counts.items())) for label, counts in checkpoint_categories.items()
        },
        "interpretation": (
            "All rows are training-overlapping closed-set reconstruction diagnostics. Trajectories distinguish "
            "optimization persistence and regression; they do not establish unseen lexical or sentence competence."
        ),
    }
    return summary, matrix


def main() -> None:
    args = parse_args()
    summary, matrix = summarize(args.row_analysis_file, args.candidate_order, args.baseline_label)
    write_json_atomic(args.output, summary)
    write_jsonl_atomic(args.matrix_output, matrix)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

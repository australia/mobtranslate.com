#!/usr/bin/env python3
"""Compare two exhaustive, aligned v24 lexical row analyses."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--left-row-analysis", type=Path, required=True)
    parser.add_argument("--left-label", required=True)
    parser.add_argument("--right-row-analysis", type=Path, required=True)
    parser.add_argument("--right-label", required=True)
    parser.add_argument("--expected-rows", type=int, default=2724)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--row-output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_candidate(path: Path, label: str) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    seen_label = False
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            row = json.loads(line)
            if row.get("candidate") != label:
                continue
            seen_label = True
            row_id = str(row.get("id") or "")
            if not row_id:
                raise ValueError(f"missing row ID at {path}:{line_number}")
            if row_id in rows:
                raise ValueError(f"duplicate {label}/{row_id} in {path}")
            if "exact_accepted" not in (row.get("analysis") or {}):
                raise ValueError(f"missing exact decision for {label}/{row_id}")
            rows[row_id] = row
    if not seen_label:
        raise ValueError(f"candidate {label!r} is absent from {path}")
    return rows


def transition(left_exact: bool, right_exact: bool) -> str:
    if left_exact and right_exact:
        return "stable_exact"
    if not left_exact and right_exact:
        return "gain"
    if left_exact and not right_exact:
        return "loss"
    return "stable_failure"


def count_memberships(rows: list[dict[str, Any]], path: tuple[str, ...]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for row in rows:
        value: Any = row
        for key in path:
            value = value.get(key) if isinstance(value, dict) else None
        if value is None:
            counts["unknown"] += 1
        elif isinstance(value, list):
            for member in value or ["unknown"]:
                counts[str(member)] += 1
        else:
            counts[str(value)] += 1
    return dict(sorted(counts.items()))


def summarize(
    left_path: Path,
    left_label: str,
    right_path: Path,
    right_label: str,
    expected_rows: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    left = load_candidate(left_path, left_label)
    right = load_candidate(right_path, right_label)
    left_ids = set(left)
    right_ids = set(right)
    if left_ids != right_ids:
        raise ValueError(
            f"row ID mismatch: left_only={len(left_ids - right_ids)}, right_only={len(right_ids - left_ids)}"
        )
    if len(left_ids) != expected_rows:
        raise ValueError(f"expected {expected_rows} aligned rows, found {len(left_ids)}")

    matrix: list[dict[str, Any]] = []
    transition_counts: Counter[str] = Counter()
    left_exact_count = 0
    right_exact_count = 0
    for row_id in sorted(left_ids):
        left_row = left[row_id]
        right_row = right[row_id]
        if left_row.get("accepted_references") != right_row.get("accepted_references"):
            raise ValueError(f"accepted-reference mismatch for {row_id}")
        left_exact = bool(left_row["analysis"]["exact_accepted"])
        right_exact = bool(right_row["analysis"]["exact_accepted"])
        left_exact_count += left_exact
        right_exact_count += right_exact
        change = transition(left_exact, right_exact)
        transition_counts[change] += 1
        matrix.append(
            {
                "id": row_id,
                "input_text": left_row.get("input_text"),
                "unconditioned_input_text": left_row.get("unconditioned_input_text"),
                "accepted_references": left_row.get("accepted_references"),
                "parts_of_speech": left_row.get("parts_of_speech"),
                "semantic_domains": (left_row.get("strata") or {}).get("semantic_domain"),
                "source_word_count": (left_row.get("strata") or {}).get("source_word_count"),
                "target_subword_count": (left_row.get("strata") or {}).get("target_subword_count"),
                "transition": change,
                "left": {
                    "label": left_label,
                    "prediction": left_row.get("prediction"),
                    "exact_accepted": left_exact,
                    "error_category": left_row["analysis"].get("category"),
                },
                "right": {
                    "label": right_label,
                    "prediction": right_row.get("prediction"),
                    "exact_accepted": right_exact,
                    "error_category": right_row["analysis"].get("category"),
                },
            }
        )

    groups = {
        name: [row for row in matrix if row["transition"] == name]
        for name in ("gain", "loss", "stable_failure", "stable_exact")
    }
    right_failures = groups["loss"] + groups["stable_failure"]
    summary = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "aligned_exhaustive_lexeme_run_comparison",
        "inputs": {
            "left": {"path": str(left_path.resolve()), "sha256": sha256(left_path), "label": left_label},
            "right": {"path": str(right_path.resolve()), "sha256": sha256(right_path), "label": right_label},
        },
        "rows": len(matrix),
        "left_accepted_exact": left_exact_count,
        "right_accepted_exact": right_exact_count,
        "accepted_exact_delta": right_exact_count - left_exact_count,
        "transitions": dict(sorted(transition_counts.items())),
        "gains_from_left_error_category": count_memberships(groups["gain"], ("left", "error_category")),
        "losses_to_right_error_category": count_memberships(groups["loss"], ("right", "error_category")),
        "right_failure_breakdown": {
            "error_category": count_memberships(right_failures, ("right", "error_category")),
            "source_word_count": count_memberships(right_failures, ("source_word_count",)),
            "part_of_speech": count_memberships(right_failures, ("parts_of_speech",)),
            "semantic_domain": count_memberships(right_failures, ("semantic_domains",)),
            "target_subword_count": count_memberships(right_failures, ("target_subword_count",)),
        },
        "interpretation": (
            "This is a paired comparison over the same training-overlapping closed-set lexeme records. It measures "
            "reconstruction transitions, not unseen lexical generalization or sentence translation reliability."
        ),
    }
    return summary, matrix


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
    summary, matrix = summarize(
        args.left_row_analysis,
        args.left_label,
        args.right_row_analysis,
        args.right_label,
        args.expected_rows,
    )
    write_json_atomic(args.output, summary)
    write_jsonl_atomic(args.row_output, matrix)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

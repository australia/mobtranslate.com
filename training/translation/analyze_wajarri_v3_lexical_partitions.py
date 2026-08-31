#!/usr/bin/env python3
"""Partition a Wajarri closed lexical census by mixed-replay training exposure."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--pair-matches", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--expected-prediction-rows", type=int, required=True)
    parser.add_argument("--expected-one-target-rows", type=int, required=True)
    parser.add_argument("--expected-pairs", type=int, required=True)
    parser.add_argument("--expected-mandatory-anchors", type=int, required=True)
    return parser.parse_args()


def load_jsonl(path: Path, expected_rows: int) -> list[dict[str, Any]]:
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if len(rows) != expected_rows:
        raise ValueError(
            f"row-count mismatch for {path}: {len(rows)} != {expected_rows}"
        )
    if not all(isinstance(row, dict) for row in rows):
        raise TypeError(f"JSONL contains a non-object: {path}")
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        raise ValueError("cannot summarize an empty lexical partition")
    exact = sum(bool(row["exact"]) for row in rows)
    return {
        "rows": len(rows),
        "exact": exact,
        "exact_rate": exact / len(rows),
        "mean_chrf2": sum(float(row["chrf2"]) for row in rows) / len(rows),
        "mean_grapheme_cer": sum(float(row["grapheme_cer"]) for row in rows)
        / len(rows),
        "surface_classes": dict(
            sorted(Counter(str(row["surface_class"]) for row in rows).items())
        ),
        "faults": {
            field: sum(bool(row[field]) for row in rows)
            for field in ("blank", "source_copy", "repeated_token_4gram")
        },
    }


def build_partitions(
    predictions: list[dict[str, Any]],
    pairs: list[dict[str, Any]],
    *,
    expected_one_target_rows: int,
    expected_mandatory_anchors: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    identifiers = [str(row.get("id") or "") for row in predictions]
    if any(not value for value in identifiers) or len(identifiers) != len(
        set(identifiers)
    ):
        raise ValueError("prediction IDs are empty or non-unique")
    prediction_by_id = dict(zip(identifiers, predictions, strict=True))
    one_target_ids = {
        str(row["id"])
        for row in predictions
        if row.get("ambiguity_class") == "one_target"
    }
    if len(one_target_ids) != expected_one_target_rows:
        raise ValueError(
            "one-target population mismatch: "
            f"{len(one_target_ids)} != {expected_one_target_rows}"
        )

    anchor_ids: set[str] = set()
    control_ids: set[str] = set()
    mandatory_ids: set[str] = set()
    pair_by_member: dict[str, str] = {}
    for pair in pairs:
        pair_id = str(pair["pair_id"])
        anchor_id = str(pair["anchor"]["id"])
        control_id = str(pair["control"]["id"])
        if anchor_id in anchor_ids or control_id in control_ids:
            raise ValueError(f"duplicate lexical pair member: {pair_id}")
        anchor_ids.add(anchor_id)
        control_ids.add(control_id)
        pair_by_member[anchor_id] = pair_id
        pair_by_member[control_id] = pair_id
        if pair.get("mandatory_regression_anchor") is True:
            mandatory_ids.add(anchor_id)
    if anchor_ids & control_ids:
        raise ValueError("anchor and control populations overlap")
    if len(mandatory_ids) != expected_mandatory_anchors:
        raise ValueError(
            "mandatory-anchor mismatch: "
            f"{len(mandatory_ids)} != {expected_mandatory_anchors}"
        )
    unknown = (anchor_ids | control_ids) - one_target_ids
    if unknown:
        raise ValueError(
            f"lexical replay IDs are absent from one-target census: {sorted(unknown)}"
        )

    partition_ids = {
        "all_one_target": one_target_ids,
        "trained_anchors": anchor_ids,
        "matched_controls": control_ids,
        "unanchored_complement": one_target_ids - anchor_ids,
        "mandatory_regression_anchors": mandatory_ids,
    }
    report = {
        name: summarize([prediction_by_id[row_id] for row_id in sorted(row_ids)])
        for name, row_ids in partition_ids.items()
    }
    memberships = []
    for row_id in sorted(one_target_ids):
        roles = [
            name
            for name, row_ids in partition_ids.items()
            if name != "all_one_target" and row_id in row_ids
        ]
        memberships.append(
            {
                "schema_version": 1,
                "id": row_id,
                "roles": roles,
                "pair_id": pair_by_member.get(row_id),
                "exact": bool(prediction_by_id[row_id]["exact"]),
                "prediction": prediction_by_id[row_id]["prediction"],
            }
        )
    return report, memberships


def main() -> None:
    args = parse_args()
    predictions = load_jsonl(args.predictions, args.expected_prediction_rows)
    pairs = load_jsonl(args.pair_matches, args.expected_pairs)
    partitions, memberships = build_partitions(
        predictions,
        pairs,
        expected_one_target_rows=args.expected_one_target_rows,
        expected_mandatory_anchors=args.expected_mandatory_anchors,
    )
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=False)
    report = {
        "schema_version": 1,
        "label": args.label,
        "partitions": partitions,
        "claim_limit": (
            "Closed-set reconstruction partitions measure retention relative to "
            "known lexical rows; they do not authorize sentence translation."
        ),
    }
    (output_dir / "REPORT.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    with (output_dir / "MEMBERSHIP.jsonl").open("w", encoding="utf-8") as handle:
        for row in memberships:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

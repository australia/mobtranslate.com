#!/usr/bin/env python3
"""Score lexical predictions against an explicit cross-resource alignment audit."""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any

from training.translation.audit_lexicon_overlap import accepted_references, normalize


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--overlap-rows", type=Path, required=True)
    parser.add_argument("--left-label", required=True)
    parser.add_argument("--right-label", required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--endpoint-field")
    parser.add_argument("--endpoint-value")
    parser.add_argument("--expected-rows", type=int)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--row-output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
    if not rows:
        raise ValueError(f"empty JSONL resource: {path}")
    return rows


def load_predictions(path: Path, endpoint_field: str | None, endpoint_value: str | None) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("predictions")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"prediction file has no predictions: {path}")
    if endpoint_field:
        rows = [row for row in rows if str(row.get(endpoint_field)) == str(endpoint_value)]
    if not rows:
        raise ValueError("endpoint filter removed every prediction row")
    return rows


def prediction_prompt(row: dict[str, Any]) -> str:
    prompt = normalize(row.get("unconditioned_input_text"))
    if not prompt:
        raise ValueError(f"prediction row lacks unconditioned input: {row.get('id')}")
    return prompt


def build_overlap_index(
    rows: list[dict[str, Any]], left_label: str, right_label: str
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        prompt = normalize(row.get("prompt"))
        if not prompt or prompt in result:
            raise ValueError(f"invalid or duplicate overlap prompt: {prompt!r}")
        if left_label not in row or right_label not in row:
            raise ValueError(f"overlap row lacks requested labels for prompt {prompt!r}")
        result[prompt] = row
    return result


def summarize_transfer(
    prediction_rows: list[dict[str, Any]],
    overlap_rows: list[dict[str, Any]],
    left_label: str,
    right_label: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    overlap = build_overlap_index(overlap_rows, left_label, right_label)
    seen_prompts: set[str] = set()
    output_rows: list[dict[str, Any]] = []
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for prediction_row in prediction_rows:
        prompt = prediction_prompt(prediction_row)
        if prompt in seen_prompts:
            raise ValueError(f"duplicate prediction prompt: {prompt}")
        seen_prompts.add(prompt)
        prediction = normalize(prediction_row.get("prediction"))
        left_references = accepted_references(prediction_row)
        aligned = overlap.get(prompt)
        relation = aligned["relation"] if aligned else f"{left_label}_only"
        right_references = (
            [normalize(value) for value in aligned[right_label]["accepted_references"]]
            if aligned
            else []
        )
        record = {
            "id": str(prediction_row.get("id") or ""),
            "prompt": prompt,
            "prediction": prediction,
            f"{left_label}_accepted_references": left_references,
            f"{left_label}_exact": prediction in left_references,
            "resource_relation": relation,
            f"{right_label}_accepted_references": right_references,
            f"prediction_supported_by_{right_label}": (
                prediction in right_references if aligned else None
            ),
        }
        grouped[relation].append(record)
        output_rows.append(record)

    def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
        left_exact = sum(bool(item[f"{left_label}_exact"]) for item in items)
        aligned_items = [
            item for item in items if item[f"prediction_supported_by_{right_label}"] is not None
        ]
        right_supported = sum(
            bool(item[f"prediction_supported_by_{right_label}"]) for item in aligned_items
        )
        return {
            "rows": len(items),
            f"{left_label}_exact_count": left_exact,
            f"{left_label}_exact_percent": 100 * left_exact / len(items) if items else 0.0,
            "aligned_rows": len(aligned_items),
            f"prediction_supported_by_{right_label}_count": right_supported,
            f"prediction_supported_by_{right_label}_percent": (
                100 * right_supported / len(aligned_items) if aligned_items else None
            ),
        }

    summary = summarize(output_rows)
    summary["by_resource_relation"] = {
        relation: summarize(items) for relation, items in sorted(grouped.items())
    }
    summary["overlap_prompts_without_predictions"] = len(set(overlap) - seen_prompts)
    return summary, output_rows


def write_json_atomic(path: Path, payload: Any, jsonl: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        if jsonl:
            for row in payload:
                handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        else:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
    temporary.chmod(0o664)
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    if bool(args.endpoint_field) != bool(args.endpoint_value):
        raise ValueError("endpoint field and value must be supplied together")
    overlap_rows = load_jsonl(args.overlap_rows)
    prediction_rows = load_predictions(args.predictions, args.endpoint_field, args.endpoint_value)
    if args.expected_rows is not None and len(prediction_rows) != args.expected_rows:
        raise ValueError(f"expected {args.expected_rows} predictions, found {len(prediction_rows)}")
    summary, row_output = summarize_transfer(
        prediction_rows,
        overlap_rows,
        args.left_label,
        args.right_label,
    )
    output = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "cross_resource_lexical_prediction_transfer_audit",
        "left_label": args.left_label,
        "right_label": args.right_label,
        "inputs": {
            "overlap_rows": {
                "path": str(args.overlap_rows.resolve()),
                "sha256": sha256(args.overlap_rows),
            },
            "predictions": {
                "path": str(args.predictions.resolve()),
                "sha256": sha256(args.predictions),
            },
        },
        "endpoint_filter": (
            {"field": args.endpoint_field, "value": args.endpoint_value}
            if args.endpoint_field
            else None
        ),
        "summary": summary,
        "row_output": str(args.row_output.resolve()),
        "limitations": [
            "This audit reports deterministic surface support across two accepted-reference sets.",
            "A disjoint reference set can reflect sense, variety, source, or curation differences and needs review.",
            "Neither reference resource is converted into a population-level translation-reliability claim.",
        ],
    }
    write_json_atomic(args.output, output)
    write_json_atomic(args.row_output, row_output, jsonl=True)
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

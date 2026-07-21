#!/usr/bin/env python3
"""Audit prompt and accepted-form overlap between two lexical JSONL resources."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import unicodedata
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--left", required=True, metavar="LABEL=PATH")
    parser.add_argument("--right", required=True, metavar="LABEL=PATH")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--row-output", type=Path, required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).casefold().split())


def notation_skeleton(value: Any) -> str:
    return "".join(character for character in normalize(value) if character.isalnum())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def labeled_path(value: str) -> tuple[str, Path]:
    label, separator, raw_path = value.partition("=")
    label = label.strip()
    path = Path(raw_path).expanduser().resolve()
    if not separator or not label or not raw_path.strip():
        raise ValueError(f"invalid resource {value!r}; expected LABEL=PATH")
    if not path.is_file():
        raise FileNotFoundError(path)
    return label, path


def accepted_references(row: dict[str, Any]) -> list[str]:
    values = row.get("accepted_references") or [row.get("output_text") or row.get("reference")]
    references = [normalize(value) for value in values if normalize(value)]
    if not references:
        raise ValueError(f"lexical row lacks an accepted form: {row.get('id')}")
    return list(dict.fromkeys(references))


def row_prompt(row: dict[str, Any]) -> str:
    prompt = normalize(row.get("unconditioned_input_text"))
    if not prompt:
        raise ValueError(f"lexical row lacks unconditioned_input_text: {row.get('id')}")
    return prompt


def row_summary(row: dict[str, Any], line_number: int) -> dict[str, Any]:
    return {
        "source_line": line_number,
        "id": str(row.get("id") or ""),
        "prompt": row_prompt(row),
        "selected_form": normalize(row.get("output_text") or row.get("reference")),
        "accepted_references": accepted_references(row),
        "pair_kind": row.get("pair_kind"),
        "parts_of_speech": (
            (row.get("lexicon") or {}).get("parts_of_speech")
            or row.get("parts_of_speech")
            or [
                record.get("type")
                for record in (row.get("curated_dictionary") or {}).get("entry_records", [])
                if record.get("type")
            ]
        ),
        "provenance": {
            "lexicon_entry_ids": (row.get("lexicon") or {}).get("entry_ids"),
            "curated_entry_indices": [
                record.get("canonical_index")
                for record in (row.get("curated_dictionary") or {}).get("entry_records", [])
                if record.get("canonical_index") is not None
            ],
        },
    }


def load_resource(path: Path) -> tuple[dict[str, list[dict[str, Any]]], int]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    row_count = 0
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            summary = row_summary(row, line_number)
            grouped[summary["prompt"]].append(summary)
            row_count += 1
    if not grouped:
        raise ValueError(f"empty lexical resource: {path}")
    return dict(grouped), row_count


def grouped_references(rows: list[dict[str, Any]]) -> list[str]:
    return list(
        dict.fromkeys(reference for row in rows for reference in row["accepted_references"])
    )


def classify(left_references: list[str], right_references: list[str]) -> dict[str, Any]:
    left = set(left_references)
    right = set(right_references)
    shared = sorted(left & right)
    if shared:
        return {"relation": "shared_accepted_form", "matching_pairs": [[value, value] for value in shared]}

    skeleton_matches = sorted(
        [left_value, right_value]
        for left_value in left
        for right_value in right
        if notation_skeleton(left_value) == notation_skeleton(right_value)
    )
    if skeleton_matches:
        return {"relation": "notation_skeleton_match", "matching_pairs": skeleton_matches}

    prefix_matches = sorted(
        [left_value, right_value]
        for left_value in left
        for right_value in right
        if notation_skeleton(left_value)
        and notation_skeleton(right_value)
        and (
            notation_skeleton(left_value).startswith(notation_skeleton(right_value))
            or notation_skeleton(right_value).startswith(notation_skeleton(left_value))
        )
    )
    if prefix_matches:
        return {"relation": "skeleton_prefix_relation", "matching_pairs": prefix_matches}
    return {"relation": "surface_disjoint", "matching_pairs": []}


def audit(
    left_label: str,
    left: dict[str, list[dict[str, Any]]],
    right_label: str,
    right: dict[str, list[dict[str, Any]]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    shared_prompts = sorted(set(left) & set(right))
    rows: list[dict[str, Any]] = []
    relation_counts: Counter[str] = Counter()
    for prompt in shared_prompts:
        left_references = grouped_references(left[prompt])
        right_references = grouped_references(right[prompt])
        relation = classify(left_references, right_references)
        relation_counts[relation["relation"]] += 1
        rows.append(
            {
                "prompt": prompt,
                "relation": relation["relation"],
                "matching_pairs": relation["matching_pairs"],
                left_label: {
                    "accepted_references": left_references,
                    "records": left[prompt],
                },
                right_label: {
                    "accepted_references": right_references,
                    "records": right[prompt],
                },
            }
        )
    summary = {
        "left_label": left_label,
        "right_label": right_label,
        "left_unique_prompts": len(left),
        "right_unique_prompts": len(right),
        "overlapping_prompts": len(shared_prompts),
        "left_only_prompts": len(set(left) - set(right)),
        "right_only_prompts": len(set(right) - set(left)),
        "union_prompts": len(set(left) | set(right)),
        "relation_counts": dict(sorted(relation_counts.items())),
    }
    return summary, rows


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(content)
    temporary.chmod(0o664)
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    left_label, left_path = labeled_path(args.left)
    right_label, right_path = labeled_path(args.right)
    if left_label == right_label:
        raise ValueError("resource labels must differ")
    left, left_rows = load_resource(left_path)
    right, right_rows = load_resource(right_path)
    summary, rows = audit(left_label, left, right_label, right)
    output = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operation": "lexical_prompt_overlap_surface_audit",
        "resources": {
            left_label: {"path": str(left_path), "sha256": sha256(left_path), "rows": left_rows},
            right_label: {"path": str(right_path), "sha256": sha256(right_path), "rows": right_rows},
        },
        "summary": summary,
        "row_output": str(args.row_output.expanduser().resolve()),
        "limitations": [
            "Relations are deterministic surface comparisons, not judgments of synonymy, sense, variety, or correctness.",
            "Skeleton and prefix relations require source and fluent-speaker review before accepted sets are merged.",
            "Prompt rows are clustered dictionary records and are not a sampled user-query population.",
        ],
    }
    write_atomic(args.output, json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    write_atomic(
        args.row_output,
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

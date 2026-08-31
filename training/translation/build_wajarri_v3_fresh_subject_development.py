#!/usr/bin/env python3
"""Build a fresh held-subject Wajarri composition development matrix."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-fresh-subject-development-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected JSON object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{number}: expected JSON object")
        rows.append(value)
    return rows


def resolve_rows(
    program_root: Path, binding: dict[str, Any]
) -> list[dict[str, Any]]:
    path = (program_root / binding["path"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"input escapes program root: {path}") from error
    if sha256_file(path) != binding["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(f"row-count mismatch for {path}")
    return rows


def write_text_atomic(path: Path, value: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(value, encoding="utf-8")
    os.replace(temporary, path)


def write_json_atomic(path: Path, value: Any) -> None:
    write_text_atomic(
        path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    write_text_atomic(path, "".join(canonical_json(row) + "\n" for row in rows))


def validate_subject(
    spec: dict[str, Any],
    dispositions: list[dict[str, Any]],
    baseline_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    source_record_id = spec["source_record_id"]
    source_rows = [
        row for row in dispositions if row["sourceRecordId"] == source_record_id
    ]
    if len(source_rows) != 1:
        raise ValueError(f"subject must resolve to one source record: {source_record_id}")
    source = source_rows[0]
    if source["sourcePrompt"].casefold() != spec["source_prompt"].casefold():
        raise ValueError(f"source prompt mismatch: {source_record_id}")
    if source["sourceTarget"].casefold() != spec["target_surface"].casefold():
        raise ValueError(f"source target mismatch: {source_record_id}")
    if not source["benchmarkEligibility"]["unconditionedPromptReconstruction"]:
        raise ValueError(f"source is not reconstruction eligible: {source_record_id}")

    baseline = [
        row
        for row in baseline_rows
        if row.get("source_record_ids") == [source_record_id]
        and row.get("ambiguity_class") == "one_target"
    ]
    if len(baseline) != 1:
        raise ValueError(f"subject lacks one-target baseline: {source_record_id}")
    if not baseline[0]["exact"]:
        raise ValueError(f"subject baseline is not exact: {source_record_id}")
    if baseline[0]["prediction"].casefold() != spec["target_surface"].casefold():
        raise ValueError(f"subject baseline surface mismatch: {source_record_id}")
    return {
        "schema_version": 1,
        "subject_id": spec["subject_id"],
        "english_subject": spec["english_subject"],
        "target_surface": spec["target_surface"],
        "source_prompt": source["sourcePrompt"],
        "source_definition": source["sourceDefinition"],
        "source_record_id": source_record_id,
        "source_record_sha256": source["sourceRecordSha256"],
        "baseline_evaluation_id": baseline[0]["id"],
        "baseline_prediction": baseline[0]["prediction"],
        "baseline_exact": True,
        "semantic_compatibility_review": spec["semantic_compatibility_review"],
        "review_status": "accepted_for_internal_development_only",
        "training_eligibility": "not_allowed",
        "attested_sentence": False,
    }


def build_cells(
    subjects: list[dict[str, Any]], predicates: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    rows = []
    for subject in subjects:
        for predicate in sorted(predicates, key=lambda row: row["predicate_id"]):
            source_text = f"{subject['english_subject']} {predicate['english_clause']}."
            output_text = f"{subject['target_surface']} {predicate['target_surface']}."
            rows.append(
                {
                    "schema_version": 1,
                    "cell_id": (
                        f"wbv-v3-fresh-dev:{subject['subject_id']}:"
                        f"{predicate['predicate_id']}"
                    ),
                    "subject_id": subject["subject_id"],
                    "predicate_id": predicate["predicate_id"],
                    "input_text": f"<translate> {source_text}",
                    "source_text": source_text,
                    "output_text": output_text,
                    "subject_realization_id": (
                        f"wbv-v3-fresh-subject:{subject['subject_id']}:v1"
                    ),
                    "predicate_realization_id": (
                        f"wbv-v3-reviewed-predicate:{predicate['predicate_id']}:v1"
                    ),
                    "subject_source_record_ids": [subject["source_record_id"]],
                    "predicate_source_record_ids": [predicate["source_record_id"]],
                    "pair_kind": "controlled_synthetic_composition_development_v2",
                    "task": "translate",
                    "direction": "eng-wbv",
                    "split": "development_consumed_on_first_evaluation",
                    "training_eligibility": "not_allowed",
                    "benchmark_eligibility": "development_only_not_sealed",
                    "attested_reference": False,
                    "inferred_morphology": False,
                    "claim_limit": (
                        "The row composes two complete source-bound surfaces and "
                        "generates no inflection. It is synthetic development evidence, "
                        "not an attested sentence or public-release reference."
                    ),
                }
            )
    return sorted(rows, key=lambda row: row["cell_id"])


def main() -> None:
    args = parse_args()
    contract = load_json(args.contract.resolve())
    if contract["method_id"] != METHOD_ID:
        raise ValueError(f"unexpected method ID: {contract['method_id']}")
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    inputs = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }
    subjects = [
        validate_subject(
            spec,
            inputs["reference_dispositions"],
            inputs["baseline_lexical_predictions"],
        )
        for spec in contract["subjects"]
    ]
    if len({row["subject_id"] for row in subjects}) != len(subjects):
        raise ValueError("duplicate held subject ID")

    predicate_reviews = {
        row["predicate_id"]: row for row in inputs["predicate_reviews"]
    }
    predicates = []
    for spec in contract["predicates"]:
        review = predicate_reviews.get(spec["predicate_id"])
        if review is None or review["review_decision"] != "allowed_for_internal_fixed_compute_screen":
            raise ValueError(f"predicate is not source-review approved: {spec['predicate_id']}")
        if review["target_surface"] != spec["target_surface"]:
            raise ValueError(f"predicate target mismatch: {spec['predicate_id']}")
        predicates.append({**spec, "source_record_id": review["source_record_id"]})

    cells = build_cells(subjects, predicates)
    old_inputs = {
        row["input_text"]
        for name in ("previous_training", "previous_development")
        for row in inputs[name]
    }
    overlap = sorted(row["input_text"] for row in cells if row["input_text"] in old_inputs)
    if overlap:
        raise ValueError(f"fresh development overlaps an earlier matrix: {overlap}")
    expected = contract["expected"]
    if len(subjects) != expected["subjects"] or len(cells) != expected["cells"]:
        raise ValueError("fresh development count mismatch")

    output_dir.mkdir(parents=True)
    write_jsonl_atomic(output_dir / "SUBJECT-REVIEWS.jsonl", subjects)
    write_jsonl_atomic(output_dir / "DEVELOPMENT.jsonl", cells)
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_FRESH_HELD_SUBJECT_DEVELOPMENT_FROZEN",
        "subjects": len(subjects),
        "predicates": len(predicates),
        "cells": len(cells),
        "all_subjects_one_target_exact_at_b0": all(
            row["baseline_exact"] for row in subjects
        ),
        "old_matrix_input_overlap": 0,
        "training_rows_issued": 0,
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "REPORT.json", report)
    names = ["DEVELOPMENT.jsonl", "REPORT.json", "SUBJECT-REVIEWS.jsonl"]
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "contract_path": str(args.contract.resolve()),
        "contract_sha256": sha256_file(args.contract.resolve()),
        "files": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
            }
            for name in names
        },
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in sorted(names + ["MANIFEST.json"])
        ),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

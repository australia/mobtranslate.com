#!/usr/bin/env python3
"""Review and issue a bounded Wajarri composition intervention payload."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

try:
    from training.translation.build_wajarri_v3_composition_intervention import (
        canonical_json,
        load_json,
        load_jsonl,
        normalize_surface,
        sha256_file,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_composition_intervention import (
        canonical_json,
        load_json,
        load_jsonl,
        normalize_surface,
        sha256_file,
    )


METHOD_ID = "wajarri-v3-composition-source-review-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


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


def resolve_rows(
    program_root: Path, binding: dict[str, Any]
) -> tuple[Path, list[dict[str, Any]]]:
    path = (program_root / binding["path"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"input escapes program root: {path}") from error
    if sha256_file(path) != binding["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(
            f"row-count mismatch for {path}: expected {binding['rows']}, got {len(rows)}"
        )
    return path, rows


def collect_identifiers(value: Any) -> set[str]:
    result: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if isinstance(child, str) and (
                key.lower().endswith("id") or key in {"curated_example_id"}
            ):
                result.add(child)
            elif isinstance(child, list) and key.lower().endswith("ids"):
                result.update(item for item in child if isinstance(item, str))
            result.update(collect_identifiers(child))
    elif isinstance(value, list):
        for child in value:
            result.update(collect_identifiers(child))
    return result


def stable_pair_id(input_text: str, output_text: str) -> str:
    digest = hashlib.sha256(
        f"{normalize_surface(input_text)}\0{normalize_surface(output_text)}".encode(
            "utf-8"
        )
    ).hexdigest()[:24]
    return f"wbv-v3-composition-pair:{digest}"


def validate_pair_partitions(
    training_rows: list[dict[str, Any]], development_rows: list[dict[str, Any]]
) -> None:
    train_pairs = {
        (normalize_surface(row["input_text"]), normalize_surface(row["output_text"]))
        for row in training_rows
    }
    development_pairs = {
        (normalize_surface(row["input_text"]), normalize_surface(row["output_text"]))
        for row in development_rows
    }
    overlap = train_pairs & development_pairs
    if overlap:
        raise ValueError(f"training/development pair overlap: {len(overlap)}")
    if len(train_pairs) != len(training_rows):
        raise ValueError("duplicate normalized training pair")
    if len(development_pairs) != len(development_rows):
        raise ValueError("duplicate normalized development pair")


def validate_source_files(program_root: Path, bindings: list[dict[str, Any]]) -> None:
    for binding in bindings:
        path = (program_root / binding["path"]).resolve()
        try:
            path.relative_to(program_root.resolve())
        except ValueError as error:
            raise ValueError(f"source file escapes program root: {path}") from error
        if not path.is_file():
            raise ValueError(f"missing source file: {path}")
        if sha256_file(path) != binding["sha256"]:
            raise ValueError(f"source-file hash mismatch: {path}")


def review_predicates(
    contract: dict[str, Any], loaded: dict[str, list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    source_outcomes = {
        row["source_record_id"]: row for row in loaded["source_record_outcomes"]
    }
    audio = {row["sourceRecordId"]: row for row in loaded["audio_crosswalk"]}
    evidence_ids = set()
    for name in (
        "grammar_syntheses",
        "synthetic_templates",
        "scsa_claims",
        "scsa_examples",
        "douglas_visual_examples",
        "source_record_outcomes",
        "audio_crosswalk",
    ):
        evidence_ids.update(collect_identifiers(loaded[name]))

    synthesis = next(
        (
            row
            for row in loaded["grammar_syntheses"]
            if row.get("synthesisId") == contract["grammar_synthesis_id"]
        ),
        None,
    )
    if synthesis is None:
        raise ValueError("required grammar synthesis is absent")
    if synthesis.get("syntheticEligibility") != "allowed" or synthesis.get(
        "trainingEligibility"
    ) != "allowed":
        raise ValueError("grammar synthesis is not authorized for bounded generation")
    template = next(
        (
            row
            for row in loaded["synthetic_templates"]
            if row.get("template_id") == contract["template_precedent_id"]
        ),
        None,
    )
    if template is None or template.get("acceptance_status") != (
        "accepted_for_controlled_sentence_generation"
    ):
        raise ValueError("accepted intransitive template precedent is absent")

    reviews = []
    for policy in contract["predicate_reviews"]:
        source = source_outcomes.get(policy["source_record_id"])
        if source is None:
            raise ValueError(f"missing source outcome: {policy['source_record_id']}")
        if normalize_surface(source["source_target"]) != normalize_surface(
            policy["expected_target"]
        ):
            raise ValueError(f"source target mismatch: {policy['predicate_id']}")
        if normalize_surface(source["source_definition"]) != normalize_surface(
            policy["expected_definition"]
        ):
            raise ValueError(f"source definition mismatch: {policy['predicate_id']}")
        audio_row = audio.get(policy["source_record_id"])
        if audio_row is None or normalize_surface(audio_row["headword"]) != (
            normalize_surface(policy["expected_target"])
        ):
            raise ValueError(f"audio crosswalk mismatch: {policy['predicate_id']}")
        missing = set(policy["required_evidence_ids"]) - evidence_ids
        if missing:
            raise ValueError(
                f"unresolved evidence for {policy['predicate_id']}: {sorted(missing)}"
            )
        reviews.append(
            {
                "schema_version": 1,
                "predicate_id": policy["predicate_id"],
                "source_record_id": policy["source_record_id"],
                "target_surface": policy["expected_target"],
                "source_definition": policy["expected_definition"],
                "evidence_grade": policy["evidence_grade"],
                "required_evidence_ids": policy["required_evidence_ids"],
                "audio_asset_id": audio_row["assetId"],
                "audio_archive_path": audio_row["archiveRelativePath"],
                "review_decision": "allowed_for_internal_fixed_compute_screen",
                "limitations": policy["limitations"],
                "inferred_morphology": False,
                "whole_source_form_only": True,
                "benchmark_reference_eligible": False,
                "public_release_authorizing": False,
            }
        )
    return sorted(reviews, key=lambda row: row["predicate_id"])


def issue_rows(
    cells: list[dict[str, Any]], predicate_reviews: list[dict[str, Any]], contract: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    review_by_predicate = {row["predicate_id"]: row for row in predicate_reviews}
    training = []
    development = []
    retention = []
    blocked = []
    for cell in cells:
        disposition = cell["disposition"]
        if disposition == "novel_train_candidate":
            predicate_review = review_by_predicate.get(cell["predicate_id"])
            if predicate_review is None:
                raise ValueError(f"unreviewed predicate: {cell['predicate_id']}")
            training.append(
                {
                    "schema_version": 1,
                    "id": stable_pair_id(cell["input_text"], cell["target_text"]),
                    "input_text": cell["input_text"],
                    "output_text": cell["target_text"],
                    "task": "translate",
                    "direction": "eng-wbv",
                    "split": "training",
                    "pair_kind": "controlled_synthetic_composition_intervention",
                    "source_cell_id": cell["cell_id"],
                    "subject_realization_id": cell["subject_realization_id"],
                    "predicate_realization_id": cell["predicate_realization_id"],
                    "dictionary_record_ids": sorted(
                        set(cell["subject_source_record_ids"])
                        | set(cell["predicate_source_record_ids"])
                    ),
                    "grammar_synthesis_id": contract["grammar_synthesis_id"],
                    "template_precedent_id": contract["template_precedent_id"],
                    "semantic_compatibility_rationale": cell[
                        "semantic_compatibility_rationale"
                    ],
                    "predicate_evidence_grade": predicate_review["evidence_grade"],
                    "predicate_evidence_ids": predicate_review[
                        "required_evidence_ids"
                    ],
                    "inferred_morphology": False,
                    "review_status": "approved_for_internal_fixed_compute_screen",
                    "training_eligibility": (
                        "allowed_internal_noncommercial_fixed_compute_screen"
                    ),
                    "approved_for_training": True,
                    "public_release_authorizing": False,
                    "benchmark_reference_eligible": False,
                    "attested_reference": False,
                    "synthetic_output_is_linguistic_evidence": False,
                    "model_output_is_linguistic_evidence": False,
                    "claim_limit": contract["row_claim_limit"],
                }
            )
        elif disposition == "development_candidate":
            development.append(
                {
                    **cell,
                    "output_text": cell["target_text"],
                    "review_status": "reserved_for_development_only",
                    "training_eligibility": "not_allowed",
                    "benchmark_eligibility": "development_only_not_sealed",
                }
            )
        elif disposition == "existing_retention":
            retention.append(
                {
                    **cell,
                    "review_status": "use_existing_row_identity_only",
                    "training_eligibility": "existing_corpus_policy_applies",
                }
            )
        else:
            blocked.append(cell)
    validate_pair_partitions(training, development)
    return (
        sorted(training, key=lambda row: row["id"]),
        sorted(development, key=lambda row: row["cell_id"]),
        sorted(retention, key=lambda row: row["cell_id"]),
        sorted(blocked, key=lambda row: row["cell_id"]),
    )


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("unsupported contract schema")

    loaded = {}
    manifest_inputs = {}
    for name, binding in contract["inputs"].items():
        _, rows = resolve_rows(program_root, binding)
        loaded[name] = rows
        manifest_inputs[name] = dict(binding)
    validate_source_files(program_root, contract["bound_source_files"])

    predicate_reviews = review_predicates(contract, loaded)
    training, development, retention, blocked = issue_rows(
        loaded["composition_cells"], predicate_reviews, contract
    )
    evidence_grades = Counter(row["evidence_grade"] for row in predicate_reviews)
    blocked_dispositions = Counter(row["disposition"] for row in blocked)
    counts = {
        "predicate_reviews": len(predicate_reviews),
        "issued_training_rows": len(training),
        "development_rows": len(development),
        "retention_cells": len(retention),
        "blocked_cells": len(blocked),
        "blocked_reference_conflicts": blocked_dispositions[
            "blocked_reference_conflict"
        ],
        "blocked_subject_adjudication": blocked_dispositions[
            "blocked_subject_adjudication"
        ],
        "excluded_semantic_cells": blocked_dispositions[
            "excluded_semantic_compatibility"
        ],
        "public_release_authorizing_rows": sum(
            bool(row["public_release_authorizing"]) for row in training
        ),
    }
    for key, expected in contract["expected"].items():
        if counts.get(key) != int(expected):
            raise ValueError(
                f"count mismatch for {key}: expected {expected}, got {counts.get(key)}"
            )

    report = {
        "schema_version": 1,
        "review_id": contract["review_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_INTERNAL_SCREEN_ROWS_ISSUED_RUNPOD_STILL_BLOCKED",
        "counts": counts,
        "predicate_evidence_grade_counts": dict(sorted(evidence_grades.items())),
        "decision": (
            "The 36 rows may be used only in the frozen internal composition screen. "
            "They are controlled synthetic research data, not attested references."
        ),
        "runpod_authorized": False,
        "next_gate": (
            "Build token-accounted paired control and treatment schedules, freeze the "
            "corrected development baseline, and validate the complete RunPod kit."
        ),
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    write_jsonl_atomic(output_dir / "TRAINING-ROWS.jsonl", training)
    write_jsonl_atomic(output_dir / "DEVELOPMENT-ROWS.jsonl", development)
    write_jsonl_atomic(output_dir / "RETENTION-CELLS.jsonl", retention)
    write_jsonl_atomic(output_dir / "BLOCKED-CELLS.jsonl", blocked)
    write_jsonl_atomic(output_dir / "PREDICATE-REVIEWS.jsonl", predicate_reviews)
    write_json_atomic(output_dir / "REPORT.json", report)
    manifest = {
        "schema_version": 1,
        "review_id": contract["review_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": report["status"],
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
        },
        "contract": {
            "path": str(contract_path),
            "sha256": sha256_file(contract_path),
        },
        "inputs": manifest_inputs,
        "bound_source_files": contract["bound_source_files"],
        "outputs": {
            "TRAINING-ROWS.jsonl": {"rows": len(training)},
            "DEVELOPMENT-ROWS.jsonl": {"rows": len(development)},
            "RETENTION-CELLS.jsonl": {"rows": len(retention)},
            "BLOCKED-CELLS.jsonl": {"rows": len(blocked)},
            "PREDICATE-REVIEWS.jsonl": {"rows": len(predicate_reviews)},
            "REPORT.json": {"rows": 1},
        },
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    output_names = (
        "BLOCKED-CELLS.jsonl",
        "DEVELOPMENT-ROWS.jsonl",
        "MANIFEST.json",
        "PREDICATE-REVIEWS.jsonl",
        "REPORT.json",
        "RETENTION-CELLS.jsonl",
        "TRAINING-ROWS.jsonl",
    )
    write_text_atomic(
        output_dir / "OUTPUT-SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n" for name in output_names
        ),
    )
    print(canonical_json({"output_dir": str(output_dir), **counts}))


if __name__ == "__main__":
    main()

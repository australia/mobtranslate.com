#!/usr/bin/env python3
"""Compile image-led reviews of the forty curated Douglas Wajarri examples.

The manual decisions accept only what a non-speaker operator can verify on the
scanned page: the historical Wajarri line, any printed morpheme-gloss line, the
printed free translation, and source editorial notes. They do not establish a
current-Wajarri correspondence, validate Douglas's analysis, license a
productive rule, or create a controlled synthetic training pair.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from collections.abc import Iterable
from pathlib import Path
from typing import Any


REQUIRED_DECISION_VALUES = {
    "transcription_decision": "accepted_exact_source_image_transcription",
    "source_layout_pairing_decision": "observed_in_source_not_semantically_validated",
    "semantic_validation_status": "not_independently_validated",
    "current_orthography_correspondence_status": "not_assessed",
    "training_eligibility": "not_allowed",
    "synthetic_eligibility": "not_authorized",
    "controlled_synthetic_sentence_pairs_added": 0,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")


def jsonl_bytes(rows: Iterable[dict[str, Any]]) -> bytes:
    return b"".join(
        (
            json.dumps(
                row,
                ensure_ascii=True,
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n"
        ).encode("utf-8")
        for row in rows
    )


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"expected JSON object: {path}")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise TypeError(f"expected object at {path}:{line_number}")
        rows.append(value)
    return rows


def resolve_within(root: Path, raw_path: str, label: str) -> Path:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        raise ValueError(f"{label} must be relative to program root")
    path = (root / candidate).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes program root: {raw_path}") from error
    return path


def require_hash(root: Path, spec: dict[str, Any], label: str) -> Path:
    raw_path = spec.get("path")
    expected_hash = spec.get("sha256")
    if not isinstance(raw_path, str) or not raw_path:
        raise ValueError(f"{label}.path must be a nonempty string")
    if not isinstance(expected_hash, str) or len(expected_hash) != 64:
        raise ValueError(f"{label}.sha256 must be a SHA-256 hex digest")
    path = resolve_within(root, raw_path, label)
    if not path.is_file():
        raise FileNotFoundError(path)
    actual_hash = sha256_file(path)
    if actual_hash != expected_hash:
        raise ValueError(
            f"{label} hash mismatch: expected {expected_hash}, found {actual_hash}"
        )
    return path


def require_nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a nonempty string")
    return value


def require_optional_string(value: Any, label: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be null or a nonempty string")
    return value


def require_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not all(
        isinstance(item, str) and item.strip() for item in value
    ):
        raise ValueError(f"{label} must be a list of nonempty strings")
    return value


def validate_decision(decision: dict[str, Any]) -> None:
    if decision.get("schema_version") != 1:
        raise ValueError("decision schema_version must be 1")
    require_nonempty_string(decision.get("decision_id"), "decision_id")
    if not isinstance(decision.get("example_number"), int):
        raise ValueError("example_number must be an integer")
    require_nonempty_string(decision.get("witness_id"), "witness_id")
    require_nonempty_string(decision.get("reviewed_at_utc"), "reviewed_at_utc")
    require_nonempty_string(
        decision.get("historical_wajarri_text"), "historical_wajarri_text"
    )
    require_optional_string(
        decision.get("source_morpheme_gloss"), "source_morpheme_gloss"
    )
    require_nonempty_string(
        decision.get("source_free_translation"), "source_free_translation"
    )
    require_optional_string(
        decision.get("source_editorial_note"), "source_editorial_note"
    )
    require_nonempty_string(decision.get("source_layout_type"), "source_layout_type")
    if decision.get("visual_legibility") not in {
        "clear",
        "clear_with_layout_caveat",
    }:
        raise ValueError("unsupported visual_legibility")
    require_nonempty_string(decision.get("visual_review_note"), "visual_review_note")
    require_string_list(
        decision.get("unresolved_uncertainties"), "unresolved_uncertainties"
    )
    page_hash = decision.get("page_png_sha256")
    if not isinstance(page_hash, str) or len(page_hash) != 64:
        raise ValueError("page_png_sha256 must be a SHA-256 hex digest")
    for key, expected in REQUIRED_DECISION_VALUES.items():
        if decision.get(key) != expected:
            raise ValueError(f"decision {key} must equal {expected!r}")


def compile_review_rows(
    *,
    witnesses: list[dict[str, Any]],
    curated_examples: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    reviewer_scope: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    witness_by_id = {row.get("witness_id"): row for row in witnesses}
    if len(witness_by_id) != len(witnesses) or None in witness_by_id:
        raise ValueError("OCR witness IDs must be non-null and unique")
    curated_by_number = {
        row.get("exampleNumber"): row for row in curated_examples
    }
    if len(curated_by_number) != len(curated_examples) or None in curated_by_number:
        raise ValueError("curated example numbers must be non-null and unique")

    decision_ids: set[str] = set()
    decision_numbers: set[int] = set()
    reviewed: list[dict[str, Any]] = []
    queue: list[dict[str, Any]] = []
    for decision in decisions:
        validate_decision(decision)
        decision_id = decision["decision_id"]
        example_number = decision["example_number"]
        if decision_id in decision_ids:
            raise ValueError(f"duplicate decision ID: {decision_id}")
        if example_number in decision_numbers:
            raise ValueError(f"duplicate decision example: {example_number}")
        decision_ids.add(decision_id)
        decision_numbers.add(example_number)

        witness = witness_by_id.get(decision["witness_id"])
        if witness is None:
            raise ValueError(f"unknown witness ID: {decision['witness_id']}")
        if witness.get("example_number") != example_number:
            raise ValueError(f"witness example mismatch: {decision_id}")
        if witness.get("page_png_sha256") != decision["page_png_sha256"]:
            raise ValueError(f"page image hash mismatch: {decision_id}")
        curated = curated_by_number.get(example_number)
        if curated is None:
            raise ValueError(f"decision is not in curated set: {example_number}")
        if curated.get("acceptanceStatus") != "not_accepted":
            raise ValueError("curated parent unexpectedly accepted linguistic data")
        if curated.get("trainingEligibility") != "not_allowed":
            raise ValueError("curated parent unexpectedly permits training")

        row = {
            "schema_version": 1,
            "review_id": decision_id,
            "example_number": example_number,
            "witness_id": decision["witness_id"],
            "reviewed_at_utc": decision["reviewed_at_utc"],
            "reviewer_scope": reviewer_scope,
            "source": {
                "source_example_id": witness["source_example_id"],
                "occurrence_index": witness["occurrence_index"],
                "chapter_page_ordinal": witness["chapter_page_ordinal"],
                "printed_page": witness["printed_page"],
                "source_pdf_page": witness["source_pdf_page"],
                "source_page_sha256": witness["source_page_sha256"],
                "source_span_sha256": witness["source_span_sha256"],
                "page_png_path": witness["page_png_path"],
                "page_png_sha256": witness["page_png_sha256"],
                "source_text_layer_witness_sha256": witness[
                    "source_text_layer_witness_sha256"
                ],
                "secondary_ocr_witness_sha256": witness[
                    "secondary_ocr_witness_sha256"
                ],
            },
            "historical_source_record": {
                "historical_wajarri_text": decision["historical_wajarri_text"],
                "historical_wajarri_text_sha256": sha256_bytes(
                    decision["historical_wajarri_text"].encode("utf-8")
                ),
                "source_morpheme_gloss": decision["source_morpheme_gloss"],
                "source_free_translation": decision["source_free_translation"],
                "source_editorial_note": decision["source_editorial_note"],
                "source_layout_type": decision["source_layout_type"],
            },
            "visual_review": {
                "visual_legibility": decision["visual_legibility"],
                "visual_review_note": decision["visual_review_note"],
                "unresolved_uncertainties": decision["unresolved_uncertainties"],
                "transcription_decision": decision["transcription_decision"],
                "source_layout_pairing_decision": decision[
                    "source_layout_pairing_decision"
                ],
            },
            "curation_context": {
                "curated_example_id": curated["curatedExampleId"],
                "phenomenon_tags": curated["phenomenonTags"],
                "selection_rationale": curated["selectionRationale"],
            },
            "semantic_validation_status": decision["semantic_validation_status"],
            "morpheme_analysis_status": "source_analysis_transcribed_not_validated",
            "current_orthography_correspondence_status": decision[
                "current_orthography_correspondence_status"
            ],
            "current_wajarri_form": None,
            "productive_grammar_rule_status": "not_authorized",
            "training_eligibility": decision["training_eligibility"],
            "synthetic_eligibility": decision["synthetic_eligibility"],
            "controlled_synthetic_sentence_pairs_added": 0,
        }
        reviewed.append(row)
        queue.append(
            {
                "schema_version": 1,
                "review_queue_id": f"{decision_id}:current-correspondence",
                "review_id": decision_id,
                "example_number": example_number,
                "historical_wajarri_text": decision["historical_wajarri_text"],
                "source_free_translation": decision["source_free_translation"],
                "phenomenon_tags": curated["phenomenonTags"],
                "required_actions": [
                    "segment_historical_tokens_without_silent_modernization",
                    "rank_current_dictionary_candidates_dynamically",
                    "retain_zero_candidate_and_multiple_candidate_outcomes",
                    "adjudicate_form_sense_variety_and_substitutability_separately",
                    "keep_productive_rule_and_synthetic_generation_closed",
                ],
                "status": "pending",
                "current_correspondences_accepted": 0,
                "productive_rules_accepted": 0,
                "controlled_synthetic_sentence_pairs_added": 0,
                "training_eligibility": "not_allowed",
                "synthetic_eligibility": "not_authorized",
            }
        )

    expected_numbers = set(curated_by_number)
    if decision_numbers != expected_numbers:
        missing = sorted(expected_numbers - decision_numbers)
        unexpected = sorted(decision_numbers - expected_numbers)
        raise ValueError(
            f"decisions must cover exact curated set: missing={missing} "
            f"unexpected={unexpected}"
        )
    reviewed.sort(key=lambda row: row["example_number"])
    queue.sort(key=lambda row: row["example_number"])
    return reviewed, queue


def write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)


def build_inventory(
    *, program_root: Path, contract_path: Path, build_root: Path
) -> dict[str, Any]:
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("contract schema_version must be 1")
    inputs = contract.get("inputs")
    if not isinstance(inputs, dict):
        raise TypeError("contract inputs must be an object")
    witness_manifest_path = require_hash(
        program_root, inputs["ocr_witness_manifest"], "ocr_witness_manifest"
    )
    witness_path = require_hash(
        program_root, inputs["ocr_example_witnesses"], "ocr_example_witnesses"
    )
    curated_path = require_hash(
        program_root, inputs["curated_examples"], "curated_examples"
    )
    decisions_path = require_hash(
        program_root, inputs["manual_review_decisions"], "manual_review_decisions"
    )
    require_hash(program_root, inputs["source_pdf"], "source_pdf")

    witness_manifest = load_json(witness_manifest_path)
    witnesses = load_jsonl(witness_path)
    curated_examples = load_jsonl(curated_path)
    decisions = load_jsonl(decisions_path)
    expected = contract["expected_counts"]
    if witness_manifest.get("inventory_id") != contract["source_inventory_id"]:
        raise ValueError("OCR witness manifest identity changed")
    if len(decisions) != expected["manual_review_decisions"]:
        raise ValueError("manual review decision count changed")
    if len(curated_examples) != expected["curated_examples"]:
        raise ValueError("curated example count changed")

    reviewer_scope = contract.get("reviewer_scope")
    if not isinstance(reviewer_scope, dict):
        raise TypeError("reviewer_scope must be an object")
    if reviewer_scope.get("fluent_speaker") is not False:
        raise ValueError("this method requires honest non-speaker reviewer scope")
    if reviewer_scope.get("linguistic_certification") != "none":
        raise ValueError("this method cannot claim linguistic certification")

    reviewed, queue = compile_review_rows(
        witnesses=witnesses,
        curated_examples=curated_examples,
        decisions=decisions,
        reviewer_scope=reviewer_scope,
    )
    if len(reviewed) != expected["source_image_transcriptions"]:
        raise ValueError("compiled source transcription count changed")

    payloads = {
        "reviewed-examples.jsonl": jsonl_bytes(reviewed),
        "current-correspondence-review-queue.jsonl": jsonl_bytes(queue),
    }
    report = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "status": "curated_historical_source_image_transcription_review",
        "source_inventory_id": contract["source_inventory_id"],
        "reviewer_scope": reviewer_scope,
        "counts": {
            "curated_examples": len(reviewed),
            "source_image_transcriptions_accepted": len(reviewed),
            "source_layout_pairings_observed": len(reviewed),
            "source_morpheme_glosses_transcribed": sum(
                row["historical_source_record"]["source_morpheme_gloss"] is not None
                for row in reviewed
            ),
            "semantic_translation_alignments_accepted": 0,
            "current_correspondences_accepted": 0,
            "productive_grammar_rules_accepted": 0,
            "controlled_synthetic_sentence_pairs": 0,
            "benchmark_rows": 0,
            "training_eligible_rows": 0,
        },
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    payloads["REPORT.json"] = json_bytes(report)
    for name, payload in payloads.items():
        write_bytes(build_root / name, payload)

    manifest = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": report["status"],
        "immutable": True,
        "contract": {
            "path": contract_path.relative_to(program_root).as_posix(),
            "sha256": sha256_file(contract_path),
        },
        "inputs": inputs,
        "reviewer_scope": reviewer_scope,
        "components": {
            "reviewed_examples": {
                "path": "reviewed-examples.jsonl",
                "sha256": sha256_file(build_root / "reviewed-examples.jsonl"),
                "rows": len(reviewed),
            },
            "current_correspondence_review_queue": {
                "path": "current-correspondence-review-queue.jsonl",
                "sha256": sha256_file(
                    build_root / "current-correspondence-review-queue.jsonl"
                ),
                "rows": len(queue),
            },
            "report": {
                "path": "REPORT.json",
                "sha256": sha256_file(build_root / "REPORT.json"),
            },
        },
        "source_image_transcriptions_accepted": len(reviewed),
        "semantic_translation_alignments_accepted": 0,
        "current_correspondences_accepted": 0,
        "productive_grammar_rules_accepted": 0,
        "controlled_synthetic_sentence_pairs_added": 0,
        "benchmark_rows": 0,
        "training_eligible_rows": 0,
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    write_bytes(build_root / "MANIFEST.json", json_bytes(manifest))
    return manifest


def compare_trees(left: Path, right: Path) -> None:
    left_files = sorted(
        path.relative_to(left).as_posix() for path in left.rglob("*") if path.is_file()
    )
    right_files = sorted(
        path.relative_to(right).as_posix()
        for path in right.rglob("*")
        if path.is_file()
    )
    if left_files != right_files:
        raise ValueError("existing output file inventory differs")
    for relative in left_files:
        if sha256_file(left / relative) != sha256_file(right / relative):
            raise ValueError(f"refusing to rewrite non-identical output: {relative}")


def write_inventory(
    *, program_root: Path, contract_path: Path, output_dir: Path
) -> dict[str, Any]:
    output_dir = output_dir.resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=output_dir.parent)
    )
    try:
        manifest = build_inventory(
            program_root=program_root,
            contract_path=contract_path,
            build_root=temporary,
        )
        if output_dir.exists():
            compare_trees(temporary, output_dir)
            shutil.rmtree(temporary)
        else:
            temporary.replace(output_dir)
        return manifest
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    contract_path = resolve_within(program_root, str(args.contract), "contract")
    output_dir = resolve_within(program_root, str(args.output_dir), "output_dir")
    manifest = write_inventory(
        program_root=program_root,
        contract_path=contract_path,
        output_dir=output_dir,
    )
    print(
        json.dumps(
            {
                "inventory_id": manifest["inventory_id"],
                "manifest_path": str(output_dir / "MANIFEST.json"),
                "manifest_sha256": sha256_file(output_dir / "MANIFEST.json"),
                "source_image_transcriptions_accepted": manifest[
                    "source_image_transcriptions_accepted"
                ],
                "controlled_synthetic_sentence_pairs_added": 0,
                "training_eligible_rows": 0,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

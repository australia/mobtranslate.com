#!/usr/bin/env python3
"""Build the bounded Wajarri subject-slot rendering commission."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable

try:
    from training.translation.build_wajarri_v3_contrast_commission import (
        canonical_json,
        load_json,
        load_jsonl,
        normalize_surface,
        sha256_file,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_contrast_commission import (
        canonical_json,
        load_json,
        load_jsonl,
        normalize_surface,
        sha256_file,
    )


METHOD_ID = "wajarri-v3-subject-slot-commission-v1"
SLOT_TOKEN = "<copy>"
REPRESENTATIONS = ("masked_source", "declared_source")


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


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:{digest}"


def resolve_rows(program_root: Path, binding: dict[str, Any]) -> list[dict[str, Any]]:
    path = (program_root / str(binding["path"])).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"input escapes program root: {path}") from error
    if not path.is_file():
        raise ValueError(f"missing input: {path}")
    if sha256_file(path) != binding["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(f"row-count mismatch for {path}: {len(rows)}")
    return rows


def verify_bound_file(program_root: Path, binding: dict[str, Any]) -> Path:
    path = (program_root / str(binding["path"])).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"bound file escapes program root: {path}") from error
    if not path.is_file() or sha256_file(path) != binding["sha256"]:
        raise ValueError(f"bound file failed checksum verification: {path}")
    return path


def pair_plain_and_inline(
    plain_rows: list[dict[str, Any]], inline_rows: list[dict[str, Any]]
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    inline_by_parent = {str(row.get("parent_row_id")): row for row in inline_rows}
    if len(inline_by_parent) != len(inline_rows) or "None" in inline_by_parent:
        raise ValueError("inline rows lack unique parent_row_id values")
    plain_ids = {str(row.get("id")) for row in plain_rows}
    if plain_ids != set(inline_by_parent):
        raise ValueError("plain/inline parent partitions differ")
    return [(row, inline_by_parent[str(row["id"])]) for row in plain_rows]


def terminology_pair(row: dict[str, Any], slot: str) -> dict[str, Any]:
    matches = [
        value for value in row.get("terminology_pairs", []) if value.get("slot") == slot
    ]
    if len(matches) != 1:
        raise ValueError(f"row {row.get('id')} has {len(matches)} {slot} terms")
    return matches[0]


def mask_source_subject(source_text: str, english_subject: str) -> str:
    expected_prefix = f"The {english_subject} "
    if not source_text.startswith(expected_prefix):
        raise ValueError(
            f"source frame does not begin with {expected_prefix!r}: {source_text!r}"
        )
    return f"The {SLOT_TOKEN} {source_text.removeprefix(expected_prefix)}"


def build_slot_row(
    plain: dict[str, Any], inline: dict[str, Any], representation: str
) -> dict[str, Any]:
    if representation not in REPRESENTATIONS:
        raise ValueError(f"unsupported slot representation: {representation}")
    if inline.get("parent_row_id") != plain.get("id"):
        raise ValueError("inline row does not identify the plain parent")
    if normalize_surface(inline.get("output_text")) != normalize_surface(
        plain.get("output_text")
    ):
        raise ValueError("plain/inline targets differ")

    subject = terminology_pair(inline, "subject")
    predicate = terminology_pair(inline, "predicate")
    target_tokens = normalize_surface(plain["output_text"]).split()
    if target_tokens != [
        normalize_surface(subject["wajarri_surface"]),
        normalize_surface(predicate["wajarri_surface"]),
    ]:
        raise ValueError(f"target slots do not match terminology: {plain.get('id')}")

    source_text = str(plain["source_text"])
    english_subject = str(subject["english_surface"])
    masked_source = mask_source_subject(source_text, english_subject)
    if representation == "masked_source":
        input_text = f"<translate> {masked_source}"
    else:
        input_text = (
            f"{plain['input_text']} <glossary> {english_subject} = {SLOT_TOKEN}"
        )
    predicate_surface = str(predicate["wajarri_surface"])
    output_text = f"{SLOT_TOKEN} {predicate_surface}."
    rendered_output = str(plain["output_text"])
    return {
        **plain,
        "schema_version": 1,
        "id": stable_id(
            "wbv-v3-subject-slot", str(plain["id"]), representation, input_text
        ),
        "parent_row_id": plain["id"],
        "input_text": input_text,
        "output_text": output_text,
        "rendered_output_text": rendered_output,
        "task": "subject_slot_conditioned_translation",
        "pair_kind": f"controlled_synthetic_subject_slot_{representation}",
        "representation": representation,
        "slot_token": SLOT_TOKEN,
        "slot_count": 1,
        "slot_binding": {
            "slot": "subject",
            "english_surface": english_subject,
            "wajarri_surface": str(subject["wajarri_surface"]),
            "source_record_ids": plain.get("subject_source_record_ids", []),
        },
        "predicate_binding": {
            "predicate_id": plain["predicate_id"],
            "english_surface": str(predicate["english_surface"]),
            "wajarri_surface": predicate_surface,
            "source_record_ids": plain.get("predicate_source_record_ids", []),
        },
        "renderer_contract": {
            "method": "replace_one_exact_slot_token",
            "required_slot_count": 1,
            "reject_unresolved_or_extra_slots": True,
            "dictionary_lookup_external": True,
        },
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
        "claim_limit": (
            "The model predicts one fixed slot marker plus one source-bound complete "
            "predicate. A deterministic renderer inserts the governed dictionary "
            "subject. The rendered clause is controlled synthesis, not attested or "
            "speaker-validated Wajarri."
        ),
    }


def validate_partitions(groups: dict[str, list[dict[str, Any]]]) -> None:
    train_parents = {row["parent_row_id"] for row in groups["training"]}
    development_parents = {
        row["parent_row_id"]
        for name, rows in groups.items()
        if name != "training"
        for row in rows
    }
    if train_parents & development_parents:
        raise ValueError("slot training/development parent leakage")
    for name, rows in groups.items():
        identifiers = [row["id"] for row in rows]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError(f"duplicate slot row in {name}")
        for row in rows:
            if row["output_text"].count(SLOT_TOKEN) != 1:
                raise ValueError(f"raw target does not contain one slot: {row['id']}")
            if SLOT_TOKEN in row["rendered_output_text"]:
                raise ValueError(f"rendered target contains a slot: {row['id']}")


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1 or contract.get("method_id") != METHOD_ID:
        raise ValueError("unsupported subject-slot commission contract")
    if contract.get("slot_token") != SLOT_TOKEN:
        raise ValueError("slot token contract changed")

    verify_bound_file(program_root, contract["source_commission_manifest"])

    inputs = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }
    source_groups = {
        "training": pair_plain_and_inline(
            inputs["training_plain"], inputs["training_inline"]
        ),
        "composition_development": pair_plain_and_inline(
            inputs["composition_development_plain"],
            inputs["composition_development_inline"],
        ),
        "held_development": pair_plain_and_inline(
            inputs["held_development_plain"], inputs["held_development_inline"]
        ),
    }
    built = {
        representation: {
            group: [
                build_slot_row(plain, inline, representation)
                for plain, inline in pairs
            ]
            for group, pairs in source_groups.items()
        }
        for representation in REPRESENTATIONS
    }
    validate_partitions(
        {
            group: built["masked_source"][group]
            for group in source_groups
        }
    )

    counts = {
        "representations": len(REPRESENTATIONS),
        "training_parent_pairs": len(source_groups["training"]),
        "composition_development_parent_pairs": len(
            source_groups["composition_development"]
        ),
        "held_development_parent_pairs": len(source_groups["held_development"]),
        "training_rows": sum(
            len(built[representation]["training"])
            for representation in REPRESENTATIONS
        ),
        "development_rows": sum(
            len(built[representation][group])
            for representation in REPRESENTATIONS
            for group in ("composition_development", "held_development")
        ),
        "masked_training_unique_model_pairs": len(
            {
                (row["input_text"], row["output_text"])
                for row in built["masked_source"]["training"]
            }
        ),
        "declared_training_unique_model_pairs": len(
            {
                (row["input_text"], row["output_text"])
                for row in built["declared_source"]["training"]
            }
        ),
        "new_wajarri_sentence_pairs": 0,
        "sealed_test_rows_read": 0,
    }
    if counts != contract["expected"]:
        raise ValueError(f"commission census changed: {counts} != {contract['expected']}")

    outputs: dict[str, list[dict[str, Any]]] = {}
    for representation in REPRESENTATIONS:
        slug = representation.upper().replace("_", "-")
        outputs[f"TRAINING-{slug}.jsonl"] = sorted(
            built[representation]["training"], key=lambda row: row["id"]
        )
        outputs[f"COMPOSITION-DEVELOPMENT-{slug}.jsonl"] = sorted(
            built[representation]["composition_development"],
            key=lambda row: row["id"],
        )
        outputs[f"HELD-DEVELOPMENT-{slug}.jsonl"] = sorted(
            built[representation]["held_development"], key=lambda row: row["id"]
        )

    output_dir.mkdir(parents=True)
    for name, rows in outputs.items():
        write_jsonl_atomic(output_dir / name, rows)
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_SUBJECT_SLOT_RENDERING_COMMISSION",
        "slot_token": SLOT_TOKEN,
        "representations": list(REPRESENTATIONS),
        "counts": counts,
        "sealed_test_binding": contract["sealed_test_binding"],
        "sealed_test_policy": (
            "The sealed-test file is checksum-bound as opaque metadata only. This "
            "builder does not resolve, open, parse, copy, or score it."
        ),
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "REPORT.json", report)
    data_names = sorted([*outputs, "REPORT.json"])
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "commission_id": contract["commission_id"],
        "contract": {
            "path": str(contract_path),
            "sha256": sha256_file(contract_path),
        },
        "method_sha256": sha256_file(Path(__file__).resolve()),
        "inputs": contract["inputs"],
        "opaque_sealed_test_binding": contract["sealed_test_binding"],
        "outputs": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
            }
            for name in data_names
        },
        "status": report["status"],
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    checksum_names = sorted(data_names + ["MANIFEST.json"])
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n" for name in checksum_names
        ),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

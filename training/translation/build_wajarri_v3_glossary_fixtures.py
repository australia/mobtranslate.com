#!/usr/bin/env python3
"""Build paired plain/glossary Wajarri composition fixtures without new forms."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

METHOD_ID = "wajarri-v3-glossary-fixtures-v1"
CLAUSE_PATTERN = re.compile(r"^The (?P<subject>.+) is (?P<predicate>.+)\.$")


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
        raise TypeError(f"{path}: expected a JSON object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise TypeError(f"{path}:{line_number}: expected a JSON object")
        rows.append(value)
    return rows


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
        raise ValueError(f"row-count mismatch for {path}")
    return path, rows


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


def sentence_source(row: dict[str, Any]) -> str:
    input_text = " ".join(str(row.get("input_text") or "").split())
    if not input_text.startswith("<translate> "):
        raise ValueError(f"row is not a translation task: {row.get('id') or row.get('cell_id')}")
    source = input_text.removeprefix("<translate> ")
    declared = " ".join(str(row.get("source_text") or source).split())
    if declared != source:
        raise ValueError(f"source text disagrees with input: {row.get('id') or row.get('cell_id')}")
    return source


def split_controlled_clause(row: dict[str, Any]) -> dict[str, str]:
    source = sentence_source(row)
    match = CLAUSE_PATTERN.fullmatch(source)
    if match is None:
        raise ValueError(f"row is outside the frozen clause template: {source!r}")
    target = " ".join(str(row.get("output_text") or "").split())
    target_tokens = target.rstrip(".").split()
    if len(target_tokens) != 2:
        raise ValueError(f"target is not a two-slot clause: {target!r}")
    return {
        "source": source,
        "source_subject": match.group("subject"),
        "source_predicate": match.group("predicate"),
        "target_subject": target_tokens[0],
        "target_predicate": target_tokens[1],
    }


def glossary_row(row: dict[str, Any], split: str) -> dict[str, Any]:
    parts = split_controlled_clause(row)
    parent_id = str(row.get("id") or row.get("cell_id") or "")
    if not parent_id:
        raise ValueError("controlled clause lacks an ID")
    return {
        **row,
        "id": f"{parent_id}:glossary-v1",
        "parent_row_id": parent_id,
        "input_text": (
            f"<translate> {parts['source']} <glossary> "
            f"{parts['source_subject']} = {parts['target_subject']}; "
            f"{parts['source_predicate']} = {parts['target_predicate']}"
        ),
        "unconditioned_input_text": f"<translate> {parts['source']}",
        "pair_kind": "controlled_synthetic_glossary_conditioned_composition",
        "task": "glossary_translation",
        "task_prefix": "<translate>",
        "glossary_pairs": [
            {
                "slot": "subject",
                "english_surface": parts["source_subject"],
                "wajarri_sentence_surface": parts["target_subject"],
            },
            {
                "slot": "predicate",
                "english_surface": parts["source_predicate"],
                "wajarri_sentence_surface": parts["target_predicate"],
            },
        ],
        "glossary_condition": "complete_source_bound_sentence_surfaces",
        "split": split,
        "creates_new_target_sentence": False,
        "claim_limit": (
            "Input-only glossary variant of an existing controlled synthetic pair. "
            "It creates no new Wajarri form and is not attested or speaker-validated."
        ),
    }


def pairing_record(plain: dict[str, Any], glossary: dict[str, Any], split: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "split": split,
        "parent_row_id": glossary["parent_row_id"],
        "plain_input_text": plain["input_text"],
        "glossary_input_text": glossary["input_text"],
        "output_text": plain["output_text"],
        "target_identical": plain["output_text"] == glossary["output_text"],
        "only_model_input_changed": all(
            plain.get(key) == glossary.get(key)
            for key in ("output_text", "direction", "subject_realization_id", "predicate_realization_id")
        ),
        "glossary_pairs": glossary["glossary_pairs"],
    }


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    contract = load_json(contract_path)
    if contract.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method ID: {contract.get('method_id')}")
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")

    resolved = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }
    training = resolved["training"][1]
    development = resolved["development"][1]
    training_glossary = [glossary_row(row, "training") for row in training]
    development_glossary = [
        glossary_row(row, "development_consumed") for row in development
    ]
    pairings = [
        pairing_record(plain, glossary, "training")
        for plain, glossary in zip(training, training_glossary, strict=True)
    ] + [
        pairing_record(plain, glossary, "development_consumed")
        for plain, glossary in zip(development, development_glossary, strict=True)
    ]
    if len({row["id"] for row in training_glossary + development_glossary}) != len(
        training_glossary + development_glossary
    ):
        raise ValueError("duplicate glossary fixture ID")
    if not all(row["target_identical"] and row["only_model_input_changed"] for row in pairings):
        raise ValueError("glossary pairing changed more than the model input")
    expected = contract["expected"]
    if len(training_glossary) != expected["training_rows"]:
        raise ValueError("training glossary count mismatch")
    if len(development_glossary) != expected["development_rows"]:
        raise ValueError("development glossary count mismatch")

    output_dir.mkdir(parents=True)
    write_jsonl_atomic(output_dir / "GLOSSARY-TRAINING.jsonl", training_glossary)
    write_jsonl_atomic(output_dir / "GLOSSARY-DEVELOPMENT.jsonl", development_glossary)
    write_jsonl_atomic(output_dir / "PAIRING-CENSUS.jsonl", pairings)
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract.get("created_at_utc")
        or datetime.now(timezone.utc).isoformat(),
        "status": "PASS_INPUT_ONLY_GLOSSARY_FIXTURES_FROZEN",
        "training_rows": len(training_glossary),
        "development_rows": len(development_glossary),
        "paired_rows": len(pairings),
        "new_unique_wajarri_sentences": 0,
        "target_identity_pass": all(row["target_identical"] for row in pairings),
        "input_only_intervention_pass": all(
            row["only_model_input_changed"] for row in pairings
        ),
        "training_eligibility": (
            "The 36 training variants inherit the existing internal-screen eligibility; "
            "the 32 development variants remain training-prohibited."
        ),
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "REPORT.json", report)
    artifact_names = [
        "GLOSSARY-DEVELOPMENT.jsonl",
        "GLOSSARY-TRAINING.jsonl",
        "PAIRING-CENSUS.jsonl",
        "REPORT.json",
    ]
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": report["created_at_utc"],
        "contract_path": str(contract_path),
        "contract_sha256": sha256_file(contract_path),
        "inputs": {
            name: {
                "path": str(path),
                "rows": len(rows),
                "sha256": sha256_file(path),
            }
            for name, (path, rows) in resolved.items()
        },
        "files": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
            }
            for name in artifact_names
        },
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in sorted(artifact_names + ["MANIFEST.json"])
        ),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

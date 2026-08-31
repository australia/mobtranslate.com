#!/usr/bin/env python3
"""Deconfound Wajarri terminology copying with neutral one- and two-slot tasks."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_id(prefix: str, *parts: str) -> str:
    payload = "\0".join(parts).encode()
    return f"{prefix}:{hashlib.sha256(payload).hexdigest()[:24]}"


def normalize(value: Any) -> str:
    return " ".join(str(value or "").casefold().split()).strip(" .?!,;:")


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"JSON root must be an object: {path}")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not all(isinstance(row, dict) for row in rows):
        raise TypeError(f"JSONL contains a non-object: {path}")
    return rows


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def load_bound_jsonl(root: Path, binding: dict[str, Any]) -> list[dict[str, Any]]:
    path = root / binding["path"]
    if sha256_file(path) != binding["sha256"]:
        raise ValueError(f"checksum mismatch: {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(f"row-count mismatch: {path}")
    return rows


def target_surface(row: dict[str, Any]) -> str:
    target = " ".join(str(row.get("target_surface") or "").split())
    if not target or any(mark in target for mark in "[]"):
        raise ValueError(f"unsafe copy target on {row.get('id')}: {target!r}")
    if target[-1] in ".?!":
        raise ValueError(f"copy target already has sentence punctuation: {target!r}")
    return target


def common_row(
    *,
    row_id: str,
    split: str,
    input_text: str,
    output_text: str,
    source_rows: list[dict[str, Any]],
    target_surfaces: list[str],
    mechanism: str,
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "id": row_id,
        "input_text": input_text,
        "output_text": output_text,
        "source_text": "neutral supplied-form carrier",
        "direction": "eng-wbv",
        "task": "neutral_terminology_copy_auxiliary",
        "task_prefix": "<translate>",
        "pair_kind": f"nonlinguistic_{mechanism}_terminology_copy_mechanism",
        "copy_mechanism": mechanism,
        "split": split,
        "approved_for_training": split == "training",
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
        "semantic_alignment_present": False,
        "target_surfaces": target_surfaces,
        "parent_copy_row_ids": [str(row["id"]) for row in source_rows],
        "parent_lexical_ids": [str(row["parent_lexical_id"]) for row in source_rows],
        "source_record_ids": sorted(
            {
                str(source_id)
                for row in source_rows
                for source_id in row.get("source_record_ids", [])
            }
        ),
        "claim_limit": (
            "A semantically neutral exact-copy exercise over governed dictionary "
            "surfaces. The output is an ordered symbol sequence, not a Wajarri "
            "sentence, translation claim, or item of linguistic evidence."
        ),
    }


def build_single_row(row: dict[str, Any], split: str) -> dict[str, Any]:
    target = target_surface(row)
    input_text = f"<translate> supplied form [{target}]."
    output_text = f"{target}."
    return common_row(
        row_id=stable_id("wbv-v3-neutral-single-copy", split, target),
        split=split,
        input_text=input_text,
        output_text=output_text,
        source_rows=[row],
        target_surfaces=[target],
        mechanism="neutral_single_slot",
    )


def coprime_offset(size: int) -> int:
    if size < 2:
        raise ValueError("dual-copy split needs at least two surfaces")
    candidate = size // 2 + 1
    while candidate < size and math.gcd(candidate, size) != 1:
        candidate += 1
    if candidate >= size:
        candidate = 1
    if math.gcd(candidate, size) != 1:
        raise AssertionError("could not derive a coprime pairing offset")
    return candidate


def build_dual_rows(rows: list[dict[str, Any]], split: str) -> tuple[list[dict[str, Any]], int]:
    offset = coprime_offset(len(rows))
    built = []
    for index, first_row in enumerate(rows):
        second_row = rows[(index + offset) % len(rows)]
        first = target_surface(first_row)
        second = target_surface(second_row)
        if normalize(first) == normalize(second):
            raise ValueError("dual-copy pairing produced identical surfaces")
        input_text = (
            f"<translate> first supplied form [{first}]; "
            f"second supplied form [{second}]."
        )
        output_text = f"{first} {second}."
        built.append(
            common_row(
                row_id=stable_id("wbv-v3-neutral-dual-copy", split, first, second),
                split=split,
                input_text=input_text,
                output_text=output_text,
                source_rows=[first_row, second_row],
                target_surfaces=[first, second],
                mechanism="neutral_ordered_two_slot",
            )
        )
    return built, offset


def validate_split(
    source_rows: list[dict[str, Any]],
    single_rows: list[dict[str, Any]],
    dual_rows: list[dict[str, Any]],
) -> None:
    source_targets = [normalize(target_surface(row)) for row in source_rows]
    if len(source_targets) != len(set(source_targets)):
        raise ValueError("source copy split has duplicate target surfaces")
    if len(single_rows) != len(source_rows) or len(dual_rows) != len(source_rows):
        raise ValueError("neutral copy row counts differ from source split")
    single_targets = [normalize(row["target_surfaces"][0]) for row in single_rows]
    if single_targets != source_targets:
        raise ValueError("single-copy target order differs from source split")
    first = Counter(normalize(row["target_surfaces"][0]) for row in dual_rows)
    second = Counter(normalize(row["target_surfaces"][1]) for row in dual_rows)
    if first != Counter(source_targets) or second != Counter(source_targets):
        raise ValueError("dual-copy schedule does not use every surface once per position")
    sources_by_id = {str(row["id"]): row for row in source_rows}
    for neutral_row in [*single_rows, *dual_rows]:
        carrier = re.sub(r"\[[^]]*\]", "", str(neutral_row["input_text"]))
        carrier_normalized = normalize(carrier)
        for parent_id in neutral_row["parent_copy_row_ids"]:
            prompt = normalize(sources_by_id[str(parent_id)]["source_prompt"])
            if prompt and f" {prompt} " in f" {carrier_normalized} ":
                raise ValueError(
                    "neutral carrier leaked its target's true English lexical prompt"
                )


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    contract_path = args.contract.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    inputs = contract["inputs"]
    source_splits = {
        split: load_bound_jsonl(root, inputs[split])
        for split in ("training", "development_screen", "development_confirmation")
    }
    diagnosis_path = root / contract["diagnosis_binding"]["path"]
    if sha256_file(diagnosis_path) != contract["diagnosis_binding"]["sha256"]:
        raise ValueError("diagnosis binding checksum mismatch")
    diagnosis = load_json(diagnosis_path)
    if not diagnosis["copy_task_confound"]["confounded"]:
        raise ValueError("neutral commission requires the frozen copy-task confound")

    built: dict[str, list[dict[str, Any]]] = {}
    offsets: dict[str, int] = {}
    target_sets: dict[str, set[str]] = {}
    for split, source_rows in source_splits.items():
        single = [build_single_row(row, split) for row in source_rows]
        dual, offset = build_dual_rows(source_rows, split)
        validate_split(source_rows, single, dual)
        built[f"neutral_single_{split}"] = single
        built[f"neutral_dual_{split}"] = dual
        offsets[split] = offset
        target_sets[split] = {normalize(target_surface(row)) for row in source_rows}
    split_names = list(target_sets)
    if any(
        target_sets[left] & target_sets[right]
        for index, left in enumerate(split_names)
        for right in split_names[index + 1 :]
    ):
        raise ValueError("neutral copy target surfaces overlap across splits")

    source_report_path = root / contract["source_commission_report"]["path"]
    if sha256_file(source_report_path) != contract["source_commission_report"]["sha256"]:
        raise ValueError("source commission report checksum mismatch")
    source_report = load_json(source_report_path)
    held = {normalize(value) for value in source_report["held_sentence_target_surfaces"]}
    if any(values & held for values in target_sets.values()):
        raise ValueError("held sentence target leaked into neutral copy data")
    if int(source_report["counts"]["sealed_test_rows_read"]) != 0:
        raise ValueError("source commission opened sealed test rows")

    report = {
        "schema_version": 1,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_DECONFOUNDED_NEUTRAL_COPY_COMMISSION",
        "source_copy_confound": diagnosis["copy_task_confound"],
        "counts": {
            key: len(rows) for key, rows in sorted(built.items())
        },
        "pairing_offsets": offsets,
        "semantic_alignment_present": False,
        "true_english_lexical_prompts_in_auxiliary_inputs": 0,
        "held_target_surfaces_in_training": 0,
        "sealed_test_rows_read": 0,
        "new_wajarri_sentence_pairs": 0,
        "target_accounting": (
            "Single rows reproduce one governed surface. Dual rows reproduce two "
            "governed surfaces as a declared nonlinguistic ordered sequence. Neither "
            "row type is a sentence or new linguistic evidence."
        ),
        "claim_limit": contract["claim_limit"],
    }
    expected = contract["expected"]
    for key, value in report["counts"].items():
        if int(expected[key]) != value:
            raise ValueError(f"unexpected {key} count: {value}")

    names = {
        "neutral_single_training": "NEUTRAL-SINGLE-TRAINING.jsonl",
        "neutral_single_development_screen": "NEUTRAL-SINGLE-DEVELOPMENT-SCREEN.jsonl",
        "neutral_single_development_confirmation": "NEUTRAL-SINGLE-DEVELOPMENT-CONFIRMATION.jsonl",
        "neutral_dual_training": "NEUTRAL-DUAL-TRAINING.jsonl",
        "neutral_dual_development_screen": "NEUTRAL-DUAL-DEVELOPMENT-SCREEN.jsonl",
        "neutral_dual_development_confirmation": "NEUTRAL-DUAL-DEVELOPMENT-CONFIRMATION.jsonl",
    }
    output_dir.mkdir(parents=True)
    for key, name in names.items():
        write_jsonl(output_dir / name, built[key])
    write_json(output_dir / "REPORT.json", report)

    source_paths = [
        root / binding["path"] for binding in inputs.values()
    ] + [diagnosis_path, source_report_path, contract_path]
    artifact_paths = [output_dir / name for name in names.values()] + [
        output_dir / "REPORT.json"
    ]
    manifest = {
        "schema_version": 1,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": report["status"],
        "sources": {
            str(path.relative_to(root)): {
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
            }
            for path in source_paths
        },
        "artifacts": {
            path.name: {"sha256": sha256_file(path), "bytes": path.stat().st_size}
            for path in artifact_paths
        },
    }
    write_json(output_dir / "MANIFEST.json", manifest)
    sums = [*artifact_paths, output_dir / "MANIFEST.json"]
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in sums),
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

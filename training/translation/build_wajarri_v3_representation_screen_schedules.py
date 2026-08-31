#!/usr/bin/env python3
"""Build paired fixed-update schedules for the Wajarri representation screen."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

try:
    from training.translation.build_wajarri_v3_paired_screen_schedules import (
        annotate_tokens,
        canonical_json,
        load_json,
        load_jsonl,
        schedule_token_accounting,
        sha256_file,
    )
    from training.translation.build_wajarri_v3_task_separated_schedules import (
        build_schedule,
        plain_training_row,
        validate_accounting_profiles,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_paired_screen_schedules import (
        annotate_tokens,
        canonical_json,
        load_json,
        load_jsonl,
        schedule_token_accounting,
        sha256_file,
    )
    from training.translation.build_wajarri_v3_task_separated_schedules import (
        build_schedule,
        plain_training_row,
        validate_accounting_profiles,
    )


METHOD_ID = "wajarri-v3-representation-screen-schedules-v1"
TREATMENT_ARM_TO_INPUT = {
    "R0": "contrast_suffix",
    "R1": "contrast_inline",
    "R2": "contrast_placeholder",
}


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


def resolve_rows(program_root: Path, binding: dict[str, Any]) -> list[dict[str, Any]]:
    path = (program_root / binding["path"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"input escapes program root: {path}") from error
    if not path.is_file() or sha256_file(path) != binding["sha256"]:
        raise ValueError(f"missing or hash-mismatched input: {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(f"row-count mismatch for {path}")
    return rows


def verify_software_contract(contract: dict[str, Any]) -> dict[str, str]:
    observed = {}
    for package, expected in sorted(contract["software"].items()):
        actual = importlib.metadata.version(package)
        if actual != expected:
            raise ValueError(
                f"software version mismatch for {package}: expected {expected}, got {actual}"
            )
        observed[package] = actual
    return observed


def representation_training_row(
    row: dict[str, Any], tokenizer: Any, *, representation: str
) -> dict[str, Any]:
    if row.get("creates_new_target_sentence") is not False:
        raise ValueError(f"representation row creates a target: {row.get('id')}")
    if row.get("representation") != representation:
        raise ValueError(f"representation mismatch: {row.get('id')}")
    result = {
        "schema_version": 1,
        "id": str(row["id"]),
        "input_text": str(row["input_text"]),
        "output_text": str(row["output_text"]),
        "task": "terminology_conditioned_translation",
        "direction": "eng-wbv",
        "pair_kind": f"representation_screen_{representation}",
        "source_population": "contrast",
        "source_row_id": str(row["parent_row_id"]),
        "representation": representation,
        "creates_new_target_sentence": False,
        "terminology_pairs": row["terminology_pairs"],
    }
    return annotate_tokens(result, tokenizer)


def normalize_treatment_population(row: dict[str, Any]) -> dict[str, Any]:
    """Use a common schedule label so treatment randomization is exactly paired."""
    return {**row, "source_population": "contrast"}


def validate_representation_targets(
    target_rows: list[dict[str, Any]], representations: dict[str, list[dict[str, Any]]]
) -> None:
    targets = {str(row["id"]): str(row["output_text"]) for row in target_rows}
    for name, rows in representations.items():
        observed = {
            str(row["parent_row_id"]): str(row["output_text"]) for row in rows
        }
        if observed != targets:
            raise ValueError(f"representation target mismatch: {name}")


def validate_paired_treatment_schedules(
    schedules: dict[str, list[dict[str, Any]]]
) -> None:
    reference = schedules["R0"]
    for arm in ("R1", "R2"):
        candidate = schedules[arm]
        if len(reference) != len(candidate):
            raise ValueError(f"treatment length mismatch: {arm}")
        for index, (left, right) in enumerate(zip(reference, candidate), start=1):
            paired_fields = (
                "target_pair_parent_id",
                "output_text",
                "optimizer_update",
                "presentation_index",
                "schedule_population",
            )
            if any(left.get(field) != right.get(field) for field in paired_fields):
                raise ValueError(f"treatment pairing drift in {arm} at {index}")
            left_target_tokens = left["token_accounting"]["target_tokens_with_specials"]
            right_target_tokens = right["token_accounting"]["target_tokens_with_specials"]
            if left_target_tokens != right_target_tokens:
                raise ValueError(f"target-token drift in {arm} at {index}")


def exposure_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    parent_counts = Counter(str(row["accounting_parent_id"]) for row in rows)
    target_counts = Counter(str(row["target_pair_parent_id"]) for row in rows)
    return {
        "presentations": len(rows),
        "unique_accounting_rows": len(parent_counts),
        "unique_target_pairs": len(target_counts),
        "minimum_presentations_per_accounting_row": min(parent_counts.values()),
        "maximum_presentations_per_accounting_row": max(parent_counts.values()),
        "minimum_presentations_per_target_pair": min(target_counts.values()),
        "maximum_presentations_per_target_pair": max(target_counts.values()),
        "task_presentations": dict(
            sorted(Counter(str(row["task"]) for row in rows).items())
        ),
        "population_presentations": dict(
            sorted(Counter(str(row["schedule_population"]) for row in rows).items())
        ),
    }


def accounting_summary(value: dict[str, Any]) -> dict[str, Any]:
    return {key: child for key, child in value.items() if key != "micro_batches"}


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1 or contract.get("method_id") != METHOD_ID:
        raise ValueError("unsupported representation-screen schedule contract")
    software = verify_software_contract(contract)
    inputs = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }
    old_train = [
        row for row in inputs["controlled_synthetic"] if row.get("split") == "train"
    ]
    if len(old_train) != int(contract["design"]["retention_unique_rows"]):
        raise ValueError("retention row count mismatch")
    validate_representation_targets(
        inputs["contrast_targets"],
        {
            "suffix": inputs["contrast_suffix"],
            "inline_annotation": inputs["contrast_inline"],
            "placeholder_glossary": inputs["contrast_placeholder"],
        },
    )

    adapter_dir = (program_root / contract["tokenizer"]["path"]).resolve()
    sentencepiece = adapter_dir / "sentencepiece.bpe.model"
    if sha256_file(sentencepiece) != contract["tokenizer"]["sentencepiece_sha256"]:
        raise ValueError("tokenizer SentencePiece hash mismatch")
    from transformers import NllbTokenizer

    tokenizer = NllbTokenizer.from_pretrained(
        adapter_dir,
        src_lang="eng_Latn",
        tgt_lang="wbv_Latn",
        local_files_only=True,
    )
    if len(tokenizer) != int(contract["tokenizer"]["vocabulary_size"]):
        raise ValueError("tokenizer vocabulary-size mismatch")

    retention = [
        plain_training_row(row, tokenizer, population="retention") for row in old_train
    ]
    treatments = {
        "R0": [
            normalize_treatment_population(
                representation_training_row(row, tokenizer, representation="suffix")
            )
            for row in inputs["contrast_suffix"]
        ],
        "R1": [
            normalize_treatment_population(
                representation_training_row(
                    row, tokenizer, representation="inline_annotation"
                )
            )
            for row in inputs["contrast_inline"]
        ],
        "R2": [
            normalize_treatment_population(
                representation_training_row(
                    row, tokenizer, representation="placeholder_glossary"
                )
            )
            for row in inputs["contrast_placeholder"]
        ],
    }
    design = contract["design"]
    updates = int(design["optimizer_updates"])
    seed = int(design["seed"])
    schedules = {
        "C4": build_schedule(
            "C4",
            {"retention": retention},
            {"retention": 16},
            optimizer_updates=updates,
            seed=seed,
            identity_version=2,
        )
    }
    for arm, rows in treatments.items():
        schedules[arm] = build_schedule(
            arm,
            {"contrast": rows, "retention": retention},
            {"contrast": 8, "retention": 8},
            optimizer_updates=updates,
            seed=seed,
            identity_version=2,
        )
    expected_presentations = int(design["presentations_per_arm"])
    if any(len(rows) != expected_presentations for rows in schedules.values()):
        raise ValueError("schedule presentation count mismatch")
    for rows in schedules.values():
        validate_accounting_profiles(rows)
    validate_paired_treatment_schedules(schedules)

    accounting = {
        arm: schedule_token_accounting(
            rows, physical_batch_size=int(design["physical_batch_size"])
        )
        for arm, rows in schedules.items()
    }
    treatment_target_totals = {
        accounting[arm]["target_non_padding_tokens_with_specials"]
        for arm in ("R0", "R1", "R2")
    }
    if len(treatment_target_totals) != 1:
        raise ValueError("treatment target-token totals are not matched")

    output_dir.mkdir(parents=True)
    files: dict[str, list[dict[str, Any]]] = {
        **{f"{arm}-SCHEDULE.jsonl": rows for arm, rows in schedules.items()},
        "RETENTION-PLAIN-UNIQUE.jsonl": retention,
        "CONTRAST-SUFFIX-UNIQUE.jsonl": treatments["R0"],
        "CONTRAST-INLINE-UNIQUE.jsonl": treatments["R1"],
        "CONTRAST-PLACEHOLDER-UNIQUE.jsonl": treatments["R2"],
    }
    for name, rows in files.items():
        write_jsonl_atomic(output_dir / name, rows)
    write_json_atomic(output_dir / "TOKEN-ACCOUNTING.json", accounting)

    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_PAIRED_REPRESENTATION_SCREEN_SCHEDULES",
        "software": software,
        "design": design,
        "arm_exposure": {
            arm: {
                **exposure_summary(rows),
                "token_accounting": accounting_summary(accounting[arm]),
            }
            for arm, rows in schedules.items()
        },
        "paired_treatment_target_sequence": True,
        "paired_treatment_target_tokens": True,
        "paired_treatment_optimizer_updates": True,
        "paired_treatment_batch_boundaries": True,
        "source_tokens_intentionally_differ_by_representation": True,
        "sealed_test_rows_read": 0,
        "sealed_test_binding": contract["sealed_test_binding"],
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "REPORT.json", report)

    names = [*files, "TOKEN-ACCOUNTING.json", "REPORT.json"]
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "software": software,
        "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "contract_path": str(contract_path),
        "contract_sha256": sha256_file(contract_path),
        "opaque_sealed_test_binding": contract["sealed_test_binding"],
        "files": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
                **({"rows": len(files[name])} if name in files else {}),
            }
            for name in sorted(names)
        },
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in sorted([*names, "MANIFEST.json"])
        ),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

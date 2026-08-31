#!/usr/bin/env python3
"""Build paired Wajarri N6/D6 schedules for deconfounded copy mechanics."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

from training.translation.build_wajarri_v3_copy_composition_schedules import (
    accounting_summary,
    build_schedule,
    exposure_summary,
    resolve_rows,
    sentence_inline_training_row,
    validate_composition_partition,
    validate_mirror_targets,
    validate_schedule,
    verify_software_contract,
    write_json_atomic,
    write_jsonl_atomic,
    write_text_atomic,
)
from training.translation.build_wajarri_v3_paired_screen_schedules import (
    annotate_tokens,
    load_json,
    schedule_token_accounting,
    sha256_file,
)
from training.translation.build_wajarri_v3_task_separated_schedules import (
    plain_training_row,
)


METHOD_ID = "wajarri-v3-neutral-copy-schedules-v1"
ARMS = ("N6", "D6")


def neutral_copy_training_row(
    row: dict[str, Any], tokenizer: Any, *, population: str
) -> dict[str, Any]:
    expected_mechanisms = {
        "neutral_single_copy": "neutral_single_slot",
        "neutral_dual_copy": "neutral_ordered_two_slot",
    }
    if population not in expected_mechanisms:
        raise ValueError(f"unsupported neutral copy population: {population}")
    checks = {
        "approved_for_training": True,
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
        "semantic_alignment_present": False,
    }
    for field, expected in checks.items():
        if row.get(field) is not expected:
            raise ValueError(f"neutral copy row has invalid {field}: {row.get('id')}")
    if row.get("copy_mechanism") != expected_mechanisms[population]:
        raise ValueError(f"neutral copy mechanism mismatch: {row.get('id')}")
    expected_surfaces = 1 if population == "neutral_single_copy" else 2
    targets = row.get("target_surfaces")
    if not isinstance(targets, list) or len(targets) != expected_surfaces:
        raise ValueError(f"neutral copy target arity mismatch: {row.get('id')}")
    result = {
        "schema_version": 1,
        "id": str(row["id"]),
        "input_text": str(row["input_text"]),
        "output_text": str(row["output_text"]),
        "task": "neutral_terminology_copy_auxiliary",
        "direction": "eng-wbv",
        "pair_kind": str(row["pair_kind"]),
        "source_population": population,
        "source_row_id": str(row["id"]),
        "copy_mechanism": str(row["copy_mechanism"]),
        "target_surfaces": [str(value) for value in targets],
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
        "semantic_alignment_present": False,
    }
    return annotate_tokens(result, tokenizer)


def normalized_surfaces(rows: list[dict[str, Any]]) -> set[str]:
    return {
        " ".join(str(surface).casefold().split())
        for row in rows
        for surface in row["target_surfaces"]
    }


def validate_neutral_copy_partitions(
    *,
    single: dict[str, list[dict[str, Any]]],
    dual: dict[str, list[dict[str, Any]]],
    held_sentences: list[dict[str, Any]],
) -> None:
    split_names = ("training", "development_screen", "development_confirmation")
    split_surfaces: dict[str, set[str]] = {}
    for split in split_names:
        single_rows = single[split]
        dual_rows = dual[split]
        for row in [*single_rows, *dual_rows]:
            if row.get("creates_new_target_sentence") is not False:
                raise ValueError(f"neutral copy row creates a sentence: {row.get('id')}")
            if row.get("semantic_alignment_present") is not False:
                raise ValueError(f"neutral copy row retains semantic alignment: {row.get('id')}")
        single_surfaces = normalized_surfaces(single_rows)
        dual_surfaces = normalized_surfaces(dual_rows)
        if single_surfaces != dual_surfaces:
            raise ValueError(f"single/dual target populations differ in {split}")
        split_surfaces[split] = single_surfaces
    for index, left in enumerate(split_names):
        for right in split_names[index + 1 :]:
            if split_surfaces[left] & split_surfaces[right]:
                raise ValueError(f"neutral copy targets overlap across {left} and {right}")
    held_subjects = {
        str(row["output_text"]).strip().rstrip(".?!").casefold().split()[0]
        for row in held_sentences
    }
    if held_subjects & set().union(*split_surfaces.values()):
        raise ValueError("held sentence target leaked into neutral copy data")


def validate_paired_noncopy_schedules(
    first: list[dict[str, Any]], second: list[dict[str, Any]]
) -> None:
    def signature(rows: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
        return sorted(
            (
                int(row["optimizer_update"]),
                str(row["schedule_population"]),
                str(row["target_pair_parent_id"]),
                str(row["input_text"]),
                str(row["output_text"]),
            )
            for row in rows
            if row["schedule_population"]
            not in {"neutral_single_copy", "neutral_dual_copy"}
        )

    if signature(first) != signature(second):
        raise ValueError("N6/D6 non-copy presentations are not paired")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1 or contract.get("method_id") != METHOD_ID:
        raise ValueError("unsupported neutral-copy schedule contract")
    software = verify_software_contract(contract)
    inputs = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }
    retention_source = [
        row for row in inputs["controlled_synthetic"] if row.get("split") == "train"
    ]
    design = contract["design"]
    if len(retention_source) != int(design["retention_unique_rows"]):
        raise ValueError("retention row count mismatch")
    validate_mirror_targets(
        inputs["sentence_plain"], inputs["sentence_inline"], label="training sentence"
    )
    validate_mirror_targets(
        inputs["composition_development_plain"],
        inputs["composition_development_inline"],
        label="composition development",
    )
    validate_mirror_targets(
        inputs["held_lexeme_development_plain"],
        inputs["held_lexeme_development_inline"],
        label="held-lexeme development",
    )
    validate_composition_partition(
        inputs["sentence_plain"], inputs["composition_development_plain"]
    )
    validate_neutral_copy_partitions(
        single={
            split: inputs[f"neutral_single_{split}"]
            for split in ("training", "development_screen", "development_confirmation")
        },
        dual={
            split: inputs[f"neutral_dual_{split}"]
            for split in ("training", "development_screen", "development_confirmation")
        },
        held_sentences=inputs["held_lexeme_development_plain"],
    )

    adapter_dir = (program_root / contract["tokenizer"]["path"]).resolve()
    if (
        sha256_file(adapter_dir / "sentencepiece.bpe.model")
        != contract["tokenizer"]["sentencepiece_sha256"]
    ):
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

    populations = {
        "retention": [
            plain_training_row(row, tokenizer, population="retention")
            for row in retention_source
        ],
        "sentence_plain": [
            plain_training_row(row, tokenizer, population="sentence_plain")
            for row in inputs["sentence_plain"]
        ],
        "sentence_inline": [
            sentence_inline_training_row(row, tokenizer)
            for row in inputs["sentence_inline"]
        ],
        "neutral_single_copy": [
            neutral_copy_training_row(row, tokenizer, population="neutral_single_copy")
            for row in inputs["neutral_single_training"]
        ],
        "neutral_dual_copy": [
            neutral_copy_training_row(row, tokenizer, population="neutral_dual_copy")
            for row in inputs["neutral_dual_training"]
        ],
    }
    updates = int(design["optimizer_updates"])
    seed = int(design["seed"])
    schedules: dict[str, list[dict[str, Any]]] = {}
    for arm in ARMS:
        quotas = {
            name: int(value) for name, value in design["arms"][arm]["per_update"].items()
        }
        schedules[arm] = build_schedule(
            arm, populations, quotas, optimizer_updates=updates, seed=seed
        )
        validate_schedule(schedules[arm], quotas, updates=updates)
    validate_paired_noncopy_schedules(schedules["N6"], schedules["D6"])
    expected_presentations = int(design["presentations_per_arm"])
    if any(len(rows) != expected_presentations for rows in schedules.values()):
        raise ValueError("arm presentation count mismatch")
    accounting = {
        arm: schedule_token_accounting(
            rows, physical_batch_size=int(design["physical_batch_size"])
        )
        for arm, rows in schedules.items()
    }

    output_dir.mkdir(parents=True)
    files: dict[str, list[dict[str, Any]]] = {
        **{f"{arm}-SCHEDULE.jsonl": rows for arm, rows in schedules.items()},
        "RETENTION-PLAIN-UNIQUE.jsonl": populations["retention"],
        "SENTENCE-PLAIN-UNIQUE.jsonl": populations["sentence_plain"],
        "SENTENCE-INLINE-UNIQUE.jsonl": populations["sentence_inline"],
        "NEUTRAL-SINGLE-COPY-UNIQUE.jsonl": populations["neutral_single_copy"],
        "NEUTRAL-DUAL-COPY-UNIQUE.jsonl": populations["neutral_dual_copy"],
    }
    for name, rows in files.items():
        write_jsonl_atomic(output_dir / name, rows)
    write_json_atomic(output_dir / "TOKEN-ACCOUNTING.json", accounting)
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_NEUTRAL_COPY_PAIRED_SCREENING_SCHEDULES",
        "software": software,
        "design": design,
        "unique_populations": {name: len(rows) for name, rows in populations.items()},
        "arm_exposure": {
            arm: {
                **exposure_summary(rows),
                "token_accounting": accounting_summary(accounting[arm]),
            }
            for arm, rows in schedules.items()
        },
        "n6_d6_noncopy_presentations_paired": True,
        "plain_inline_target_pairing_within_update": True,
        "neutral_copy_split_target_surfaces_disjoint": True,
        "true_english_lexical_prompts_in_copy_inputs": 0,
        "held_sentence_subjects_excluded_from_copy_objective": True,
        "copy_rows_count_as_new_sentences": 0,
        "sealed_test_rows_read": 0,
        "opaque_sealed_test_binding": contract["sealed_test_binding"],
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

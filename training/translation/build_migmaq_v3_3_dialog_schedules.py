#!/usr/bin/env python3
"""Build paired Mi'kmaq v3.3 schedules using only natural Listuguj dialog rows."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import build_migmaq_v3_2_natural_lesson_schedules as v32


V3_2_BUILDER_SHA256 = "6c8a90e03a327da1ebbaa33b37934508c4af186db020906326e87614b1d6ce1b"
EXPECTED = {
    "existing_train": 5_798,
    "lesson_train_translate": 881,
    "lesson_train_dialog": 449,
    "lesson_train_vocab": 432,
    "lesson_validation_translate": 117,
    "lesson_validation_dialog": 43,
    "lesson_validation_vocab": 74,
    "lesson_validation_lexeme": 103,
    "lexical_all": 14_438,
}
ARM_NAMES = {
    "retention": "retention",
    "lessons20": "dialog20",
    "lessons40": "dialog40",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--existing-release", type=Path, required=True)
    parser.add_argument("--lessons-release", type=Path, required=True)
    parser.add_argument("--tokenizer-dir", type=Path, required=True)
    parser.add_argument("--prior-failure-analysis", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260721)
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-target-length", type=int, default=192)
    return parser.parse_args()


def select_container(
    rows: list[dict[str, Any]], container_kind: str
) -> list[dict[str, Any]]:
    selected = [row for row in rows if row.get("container_kind") == container_kind]
    v32.unique_ids(selected, f"{container_kind} rows")
    return selected


def rename_schedule_arms(
    schedules: dict[str, list[dict[str, Any]]],
    audit: dict[str, Any],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    renamed: dict[str, list[dict[str, Any]]] = {}
    for old_arm, rows in schedules.items():
        arm = ARM_NAMES[old_arm]
        renamed[arm] = []
        for row in rows:
            item = dict(row)
            item["schedule_arm"] = arm
            item["natural_dialog_intervention"] = bool(
                item.pop("natural_lesson_intervention")
            )
            item["intervention_scope"] = "listuguj_dialog_only"
            renamed[arm].append(item)

    pairing = dict(audit["pairing"])
    pairing["retention_to_dialog20_changed_positions"] = pairing.pop(
        "retention_to_lessons20_changed_positions"
    )
    pairing["retention_to_dialog40_changed_positions"] = pairing.pop(
        "retention_to_lessons40_changed_positions"
    )
    pairing["dialog20_is_nested_within_dialog40"] = pairing.pop(
        "lessons20_is_nested_within_lessons40"
    )
    pairing["token_deltas"] = {
        ARM_NAMES[arm]: value for arm, value in pairing["token_deltas"].items()
    }
    return renamed, {
        "arms": {ARM_NAMES[arm]: value for arm, value in audit["arms"].items()},
        "pairing": pairing,
    }


def main() -> None:
    args = parse_args()
    existing = args.existing_release.expanduser().resolve()
    lessons = args.lessons_release.expanduser().resolve()
    tokenizer_dir = args.tokenizer_dir.expanduser().resolve()
    prior_analysis = args.prior_failure_analysis.expanduser().resolve()
    output = args.output_dir.expanduser().resolve()
    if output.exists():
        raise FileExistsError(output)
    if v32.sha256(Path(v32.__file__).resolve()) != V3_2_BUILDER_SHA256:
        raise ValueError("v3.2 schedule-builder dependency hash changed")

    paths = {
        "existing_manifest": existing / "manifest.json",
        "existing_train": existing / "pools/sentence-train.eng-mic.jsonl",
        "existing_validation": existing
        / "evaluation/sentence-validation.eng-mic.jsonl",
        "existing_opened": existing
        / "evaluation/sentence-opened-regression.eng-mic.jsonl",
        "lexical_all": existing / "evaluation/lexical-all.eng-mic.jsonl",
        "lessons_manifest": lessons / "manifest.json",
        "lessons_train": lessons / "training/train.eng-mic.jsonl",
        "lessons_validation": lessons / "evaluation/validation.eng-mic.jsonl",
        "tokenizer_json": tokenizer_dir / "tokenizer.json",
        "prior_failure_analysis": prior_analysis,
    }
    for path in paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)

    existing_train_raw = v32.read_jsonl(paths["existing_train"])
    lesson_train_raw = v32.read_jsonl(paths["lessons_train"])
    lesson_validation_raw = v32.read_jsonl(paths["lessons_validation"])
    lexical_raw = v32.read_jsonl(paths["lexical_all"])
    lesson_train_translate = v32.filter_lessons(
        lesson_train_raw, "translate", split="train"
    )
    lesson_train_dialog = select_container(lesson_train_translate, "dialog")
    lesson_train_vocab = select_container(lesson_train_translate, "vocab")
    lesson_validation_translate = v32.filter_lessons(
        lesson_validation_raw, "translate", split="validation"
    )
    lesson_validation_dialog = select_container(lesson_validation_translate, "dialog")
    lesson_validation_vocab = select_container(lesson_validation_translate, "vocab")
    lesson_validation_lexeme = v32.filter_lessons(
        lesson_validation_raw, "lexeme", split="validation"
    )
    observed = {
        "existing_train": len(existing_train_raw),
        "lesson_train_translate": len(lesson_train_translate),
        "lesson_train_dialog": len(lesson_train_dialog),
        "lesson_train_vocab": len(lesson_train_vocab),
        "lesson_validation_translate": len(lesson_validation_translate),
        "lesson_validation_dialog": len(lesson_validation_dialog),
        "lesson_validation_vocab": len(lesson_validation_vocab),
        "lesson_validation_lexeme": len(lesson_validation_lexeme),
        "lexical_all": len(lexical_raw),
    }
    if observed != EXPECTED:
        raise ValueError(f"source row counts changed: {observed} != {EXPECTED}")

    old_train = [
        v32.sentence_row(row, origin="migmaq_online_dictionary_example", split="train")
        for row in existing_train_raw
    ]
    dialog_train = [
        v32.sentence_row(row, origin="listuguj_lessons_dialog", split="train")
        for row in lesson_train_dialog
    ]
    old_validation = [
        v32.sentence_row(
            row, origin="migmaq_online_dictionary_example", split="validation"
        )
        for row in v32.read_jsonl(paths["existing_validation"])
    ]
    old_opened = [
        v32.sentence_row(
            row, origin="migmaq_online_dictionary_example", split="opened_regression"
        )
        for row in v32.read_jsonl(paths["existing_opened"])
    ]
    all_lesson_validation = [
        v32.sentence_row(row, origin="listuguj_lessons", split="validation")
        for row in lesson_validation_translate
    ]
    dialog_validation = [
        v32.sentence_row(row, origin="listuguj_lessons_dialog", split="validation")
        for row in lesson_validation_dialog
    ]
    vocab_validation = [
        v32.sentence_row(
            row, origin="listuguj_lessons_vocab_container", split="validation"
        )
        for row in lesson_validation_vocab
    ]
    lesson_validation_words = [
        v32.lexical_diagnostic_row(row, origin="listuguj_lessons")
        for row in lesson_validation_lexeme
    ]
    lexical_plain = [
        v32.lexical_diagnostic_row(row, origin="migmaq_online_dictionary")
        for row in lexical_raw
    ]

    combined_train = old_train + dialog_train
    v32.unique_ids(combined_train, "v3.3 combined training pools")
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_dir,
        use_fast=True,
        src_lang="eng_Latn",
        tgt_lang="mic_Latn",
        local_files_only=True,
    )
    lengths = v32.tokenizer_lengths(
        combined_train,
        tokenizer,
        max_source_length=args.max_source_length,
        max_target_length=args.max_target_length,
    )
    old_schedules, matching_ledger, old_audit = v32.build_schedules(
        old_train,
        dialog_train,
        lengths,
        seed=args.seed,
    )
    schedules, schedule_audit = rename_schedule_arms(old_schedules, old_audit)

    output.mkdir(parents=True)
    for child in ("schedules", "evaluation", "ledger"):
        (output / child).mkdir()
    outputs: dict[str, Any] = {}
    for arm, rows in schedules.items():
        path = output / "schedules" / f"{arm}-screen-600.eng-mic.jsonl"
        v32.write_jsonl_atomic(path, rows)
        outputs[f"schedules/{arm}-screen-600"] = v32.output_record(path, rows)

    evaluation_rows = {
        "existing-validation-unprefixed": old_validation,
        "existing-opened-regression-unprefixed": old_opened,
        "lesson-validation-all": all_lesson_validation,
        "lesson-validation-dialog": dialog_validation,
        "lesson-validation-vocab-container": vocab_validation,
        "lesson-validation-lexemes-plain": lesson_validation_words,
        "lexical-all-plain": lexical_plain,
    }
    for label, rows in evaluation_rows.items():
        path = output / "evaluation" / f"{label}.eng-mic.jsonl"
        v32.write_jsonl_atomic(path, rows)
        outputs[f"evaluation/{label}"] = v32.output_record(path, rows)
    matching_path = output / "ledger" / "token-length-matched-dialog-replacements.jsonl"
    v32.write_jsonl_atomic(matching_path, matching_ledger)
    outputs["ledger/token-length-matched-dialog-replacements"] = v32.output_record(
        matching_path, matching_ledger
    )

    lesson_manifest = json.loads(paths["lessons_manifest"].read_text(encoding="utf-8"))
    manifest = {
        "schema_version": 1,
        "dataset_id": "migmaq-v3.3-natural-dialog-schedules-v0.1.0-20260721",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operation": "build_token_accounted_natural_dialog_only_schedules",
        "seed": args.seed,
        "direction": "eng-mic",
        "input_contract": "Original v1 unprefixed English sentence input; no task-control strings.",
        "design_evidence": {
            "prior_failure_analysis": {
                "path": str(prior_analysis),
                "sha256": v32.sha256(prior_analysis),
                "finding": (
                    "The mixed v3.2 treatment had positive dialog point estimates but negative vocabulary-"
                    "container effects; neither mixed arm passed its preregistered overall lesson gate."
                ),
            },
            "post_hoc_warning": (
                "Dialog/vocabulary stratification was motivated after v3.2 inspection and is therefore "
                "a new v3.3 hypothesis, not a reinterpretation of v3.2 as successful."
            ),
        },
        "training_contract": {
            "optimizer_updates": 600,
            "effective_batch_size": 32,
            "presentations_per_arm": v32.SCREEN_PRESENTATIONS,
            "arms": {
                "retention": "100% existing source-attested dictionary-example sentences",
                "dialog20": "20% Listuguj dialog rows, 80% token-matched retention",
                "dialog40": "40% Listuguj dialog rows, 60% token-matched retention",
            },
            "eligible_natural_rows": {
                "dialog": len(dialog_train),
                "vocab_container_excluded": len(lesson_train_vocab),
            },
            "excluded_from_sentence_training": [
                "432 Listuguj vocabulary-container translations",
                "265 Listuguj lexical rows",
                "all source-dictionary lexical reconstruction rows",
                "all morphology rows",
                "all synthetic rows",
            ],
            "causal_question": (
                "At fixed updates and within 1% target/total token exposure, does replacing retention replay "
                "with source-attested Listuguj dialog rows improve held-out dialog translation without "
                "materially degrading existing sentence domains?"
            ),
        },
        "token_accounting": {
            "tokenizer_dir": str(tokenizer_dir),
            "tokenizer_json_sha256": v32.sha256(paths["tokenizer_json"]),
            "source_lang": "eng_Latn",
            "target_lang": "mic_Latn",
            "max_source_length": args.max_source_length,
            "max_target_length": args.max_target_length,
            "matching_priority": [
                "minimum absolute target-token difference",
                "minimum absolute source-token difference",
                "minimum absolute total-token difference",
                "seeded SHA-256 tie break",
            ],
            "schedule_audit": schedule_audit,
        },
        "sources": {
            label: {"path": str(path), "sha256": v32.sha256(path)}
            for label, path in paths.items()
        },
        "source_counts": observed,
        "lesson_source_identity": {
            "repository": lesson_manifest["source"]["repository"],
            "commit": lesson_manifest["source"]["commit"],
            "license": lesson_manifest["source"]["license"]["spdx"],
            "sealed_test_read_by_this_builder": False,
        },
        "evaluation_contract": {
            "existing_validation_rows": len(old_validation),
            "existing_opened_regression_rows": len(old_opened),
            "primary_lesson_dialog_rows": len(dialog_validation),
            "separate_vocab_container_diagnostic_rows": len(vocab_validation),
            "all_lesson_translation_diagnostic_rows": len(all_lesson_validation),
            "lesson_plain_lexeme_diagnostic_rows": len(lesson_validation_words),
            "full_plain_lexical_census_rows": len(lexical_plain),
            "lesson_sealed_test": "not read, copied, inspected, or used for screening",
            "route_separation": (
                "Dialog is the sentence-model endpoint. Vocabulary-container phrases and isolated lexemes "
                "remain lookup/phrase-retrieval diagnostics and cannot authorize sentence deployment."
            ),
        },
        "implementation": {
            "builder": str(Path(__file__).resolve()),
            "v3_2_builder_dependency": str(Path(v32.__file__).resolve()),
            "v3_2_builder_dependency_sha256": V3_2_BUILDER_SHA256,
        },
        "outputs": outputs,
    }
    v32.write_json_atomic(output / "manifest.json", manifest)
    files = sorted(path for path in output.rglob("*") if path.is_file())
    (output / "SHA256SUMS").write_text(
        "".join(f"{v32.sha256(path)}  {path.relative_to(output)}\n" for path in files),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output_dir": str(output),
                "source_counts": observed,
                "schedule_audit": schedule_audit,
                "output_count": len(outputs),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

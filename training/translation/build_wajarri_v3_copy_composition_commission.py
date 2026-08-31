#!/usr/bin/env python3
"""Build the Wajarri v3 copy-mechanics and composition commission."""

from __future__ import annotations

import argparse
import hashlib
import sys
from collections import Counter
from pathlib import Path
from typing import Any

try:
    from training.translation.build_wajarri_v3_contrast_commission import (
        canonical_json,
        load_json,
        normalize_surface,
        sha256_file,
    )
    from training.translation.build_wajarri_v3_terminology_representation_commission import (
        build_representation,
        build_target_pair,
        resolve_rows,
        stable_id,
        write_json_atomic,
        write_jsonl_atomic,
        write_text_atomic,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_contrast_commission import (
        canonical_json,
        load_json,
        normalize_surface,
        sha256_file,
    )
    from training.translation.build_wajarri_v3_terminology_representation_commission import (
        build_representation,
        build_target_pair,
        resolve_rows,
        stable_id,
        write_json_atomic,
        write_jsonl_atomic,
        write_text_atomic,
    )


METHOD_ID = "wajarri-v3-copy-composition-commission-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def resolve_json(
    program_root: Path, binding: dict[str, Any]
) -> tuple[Path, dict[str, Any]]:
    path = (program_root / binding["path"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"input escapes program root: {path}") from error
    if not path.is_file() or sha256_file(path) != binding["sha256"]:
        raise ValueError(f"JSON input failed checksum binding: {path}")
    return path, load_json(path)


def holdout_map(
    subject_ids: list[str], predicate_ids: list[str], seed: str
) -> dict[str, str]:
    if not subject_ids or not predicate_ids:
        raise ValueError("composition holdout requires subjects and predicates")
    ordered_subjects = sorted(
        subject_ids,
        key=lambda value: hashlib.sha256(
            f"{seed}\0subject\0{value}".encode()
        ).hexdigest(),
    )
    ordered_predicates = list(predicate_ids)
    if len(set(ordered_predicates)) != len(ordered_predicates):
        raise ValueError("predicate order contains duplicates")
    return {
        subject_id: ordered_predicates[index % len(ordered_predicates)]
        for index, subject_id in enumerate(ordered_subjects)
    }


def source_contract_subject(row: dict[str, Any]) -> dict[str, Any]:
    return {
        **row,
        "family_id": f"wbv-subject-family:{row['subject_id']}",
        "commission_role": f"held_lexeme_{row['split']}_subject",
        "attested_sentence": False,
        "naturalness_verified": False,
    }


def copy_sort_key(row: dict[str, Any], seed: str) -> tuple[str, str]:
    target = normalize_surface(str(row["accepted_references"][0]))
    return (
        hashlib.sha256(f"{seed}\0copy\0{target}\0{row['id']}".encode()).hexdigest(),
        str(row["id"]),
    )


def unique_copy_candidates(
    rows: list[dict[str, Any]], held_target_surfaces: set[str], seed: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selected_by_target: dict[str, dict[str, Any]] = {}
    exclusions: list[dict[str, Any]] = []
    for row in sorted(rows, key=lambda item: str(item["id"])):
        references = row.get("accepted_references", [])
        if row.get("ambiguity_class") != "one_target" or len(references) != 1:
            exclusions.append(
                {
                    "id": row["id"],
                    "reason": "not_one_target",
                    "source_record_ids": row.get("source_record_ids", []),
                }
            )
            continue
        target_key = normalize_surface(str(references[0]))
        if target_key in held_target_surfaces:
            exclusions.append(
                {
                    "id": row["id"],
                    "reason": "held_sentence_lexeme_surface",
                    "target_surface": references[0],
                    "source_record_ids": row.get("source_record_ids", []),
                }
            )
            continue
        if target_key in selected_by_target:
            exclusions.append(
                {
                    "id": row["id"],
                    "reason": "duplicate_normalized_target_surface",
                    "target_surface": references[0],
                    "retained_id": selected_by_target[target_key]["id"],
                    "source_record_ids": row.get("source_record_ids", []),
                }
            )
            continue
        selected_by_target[target_key] = row
    selected = sorted(
        selected_by_target.values(), key=lambda row: copy_sort_key(row, seed)
    )
    return selected, sorted(exclusions, key=lambda row: str(row["id"]))


def build_copy_row(row: dict[str, Any], split: str) -> dict[str, Any]:
    prefix = "<lexeme> "
    lexical_input = str(row["input_text"])
    if not lexical_input.startswith(prefix):
        raise ValueError(f"unexpected lexical input: {row['id']}")
    source_prompt = lexical_input.removeprefix(prefix)
    target = str(row["accepted_references"][0])
    input_text = f"<translate> {source_prompt} [{target}]."
    output_text = f"{target}."
    return {
        "schema_version": 1,
        "id": stable_id("wbv-v3-copy-aux", input_text, output_text),
        "parent_lexical_id": row["id"],
        "source_record_ids": row.get("source_record_ids", []),
        "source_prompt": source_prompt,
        "target_surface": target,
        "input_text": input_text,
        "output_text": output_text,
        "direction": "eng-wbv",
        "task": "terminology_copy_auxiliary",
        "task_prefix": "<translate>",
        "pair_kind": "nonlinguistic_inline_terminology_copy_mechanism",
        "split": split,
        "approved_for_training": split == "training",
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
        "parent_v2_lexical_exposure": "known_documented",
        "claim_limit": (
            "Exact bracket-to-output copy mechanics over one governed dictionary "
            "surface. This is not a sentence, a new translation, or linguistic evidence."
        ),
    }


def validate_sentence_partitions(
    training: list[dict[str, Any]], development: list[dict[str, Any]]
) -> None:
    training_pairs = {
        (row["subject_id"], row["predicate_id"]) for row in training
    }
    development_pairs = {
        (row["subject_id"], row["predicate_id"]) for row in development
    }
    if training_pairs & development_pairs:
        raise ValueError("composition pair leakage")
    training_subjects = {row["subject_id"] for row in training}
    training_predicates = {row["predicate_id"] for row in training}
    if any(
        row["subject_id"] not in training_subjects
        or row["predicate_id"] not in training_predicates
        for row in development
    ):
        raise ValueError("composition development contains unseen component")


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1 or contract.get("method_id") != METHOD_ID:
        raise ValueError("unsupported copy-composition commission contract")

    rows = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }
    source_contract_path, source_contract = resolve_json(
        program_root, contract["source_contrast_contract"]
    )
    synthesis = next(
        (
            row
            for row in rows["grammar_syntheses"]
            if row.get("synthesisId") == contract["grammar_synthesis_id"]
        ),
        None,
    )
    if not synthesis or synthesis.get("syntheticEligibility") != "allowed" or synthesis.get(
        "trainingEligibility"
    ) != "allowed":
        raise ValueError("grammar synthesis is not approved")

    subjects = rows["broad_subject_reviews"]
    if any(row.get("split") != "training" for row in subjects):
        raise ValueError("broad subject input must contain training subjects only")
    subject_ids = [str(row["subject_id"]) for row in subjects]
    if len(set(subject_ids)) != len(subject_ids):
        raise ValueError("duplicate broad subject")
    predicates = source_contract["predicates"]
    predicate_by_id = {str(row["predicate_id"]): row for row in predicates}
    predicate_order = contract["predicate_order"]
    if set(predicate_order) != set(predicate_by_id):
        raise ValueError("predicate order does not match source contract")

    new_subject_ids = [
        str(row["subject_id"])
        for row in subjects
        if row.get("commission_role") == "new_source_governed_training_subject"
    ]
    held_combinations = holdout_map(
        new_subject_ids, predicate_order, contract["composition_holdout_seed"]
    )
    training_plain = []
    composition_development_plain = []
    for subject in subjects:
        for predicate_id in predicate_order:
            pair = build_target_pair(subject, predicate_by_id[predicate_id], contract)
            if held_combinations.get(subject["subject_id"]) == predicate_id:
                pair = {
                    **pair,
                    "split": "development",
                    "approved_for_training": False,
                    "pair_kind": "controlled_synthetic_seen_lexeme_novel_combination_development",
                    "commission_role": "seen_lexeme_novel_combination_development",
                }
                composition_development_plain.append(pair)
            else:
                training_plain.append(pair)
    validate_sentence_partitions(training_plain, composition_development_plain)

    training_inline = [
        build_representation(
            row,
            next(item for item in subjects if item["subject_id"] == row["subject_id"]),
            predicate_by_id[row["predicate_id"]],
            "inline_annotation",
        )
        for row in training_plain
    ]
    composition_development_inline = [
        build_representation(
            row,
            next(item for item in subjects if item["subject_id"] == row["subject_id"]),
            predicate_by_id[row["predicate_id"]],
            "inline_annotation",
        )
        for row in composition_development_plain
    ]

    held_development_subjects = [
        source_contract_subject(row)
        for row in source_contract["subjects"]
        if row["split"] == "development"
    ]
    sealed_subjects = [
        source_contract_subject(row)
        for row in source_contract["subjects"]
        if row["split"] == "sealed_test"
    ]
    held_lexeme_development_plain = []
    for subject in held_development_subjects:
        for predicate_id in predicate_order:
            pair = build_target_pair(subject, predicate_by_id[predicate_id], contract)
            held_lexeme_development_plain.append(
                {
                    **pair,
                    "approved_for_training": False,
                    "pair_kind": "controlled_synthetic_held_lexeme_plain_diagnostic",
                }
            )
    held_lexeme_development_inline = [
        build_representation(
            row,
            next(
                item
                for item in held_development_subjects
                if item["subject_id"] == row["subject_id"]
            ),
            predicate_by_id[row["predicate_id"]],
            "inline_annotation",
        )
        for row in held_lexeme_development_plain
    ]

    all_held_subjects = held_development_subjects + sealed_subjects
    held_target_surfaces = {
        normalize_surface(str(row["target_surface"])) for row in all_held_subjects
    }
    copy_candidates, copy_exclusions = unique_copy_candidates(
        rows["lexical_direct_closed"],
        held_target_surfaces,
        contract["copy_split_seed"],
    )
    copy_train_count = int(contract["copy_split"]["training"])
    copy_screen_count = int(contract["copy_split"]["development_screen"])
    copy_training_source = copy_candidates[:copy_train_count]
    copy_screen_source = copy_candidates[
        copy_train_count : copy_train_count + copy_screen_count
    ]
    copy_confirmation_source = copy_candidates[
        copy_train_count + copy_screen_count :
    ]
    copy_training = [build_copy_row(row, "training") for row in copy_training_source]
    copy_development_screen = [
        build_copy_row(row, "development_screen") for row in copy_screen_source
    ]
    copy_development_confirmation = [
        build_copy_row(row, "development_confirmation")
        for row in copy_confirmation_source
    ]
    copy_target_sets = [
        {normalize_surface(row["target_surface"]) for row in split}
        for split in (
            copy_training,
            copy_development_screen,
            copy_development_confirmation,
        )
    ]
    if any(
        copy_target_sets[left] & copy_target_sets[right]
        for left in range(len(copy_target_sets))
        for right in range(left + 1, len(copy_target_sets))
    ):
        raise ValueError("copy target leakage")
    if any(targets & held_target_surfaces for targets in copy_target_sets):
        raise ValueError("held sentence target leaked into copy objective")

    counts = {
        "training_subjects": len(subjects),
        "carried_training_subjects": len(subjects) - len(new_subject_ids),
        "new_training_subjects": len(new_subject_ids),
        "predicates": len(predicates),
        "full_factorial_target_pairs": len(subjects) * len(predicates),
        "training_target_pairs": len(training_plain),
        "seen_lexeme_novel_combination_development_pairs": len(
            composition_development_plain
        ),
        "held_lexeme_development_pairs": len(held_lexeme_development_plain),
        "new_target_pairs_beyond_prior_76_pair_commission": len(subjects) * 2,
        "lexical_direct_rows": len(rows["lexical_direct_closed"]),
        "copy_unique_eligible_surfaces": len(copy_candidates),
        "copy_training_rows": len(copy_training),
        "copy_development_screen_rows": len(copy_development_screen),
        "copy_development_confirmation_rows": len(copy_development_confirmation),
        "copy_exclusion_rows": len(copy_exclusions),
        "held_subject_surfaces_excluded_from_copy": len(held_target_surfaces),
        "sealed_test_rows_read": 0,
    }
    for key, expected in contract["expected"].items():
        if counts.get(key) != expected:
            raise ValueError(
                f"count mismatch for {key}: {counts.get(key)} != {expected}"
            )

    output_rows = {
        "SUBJECTS.jsonl": sorted(subjects, key=lambda row: row["subject_id"]),
        "PREDICATES.jsonl": sorted(predicates, key=lambda row: row["predicate_id"]),
        "COMPOSITION-HOLDOUT-MAP.jsonl": [
            {"subject_id": subject_id, "predicate_id": predicate_id}
            for subject_id, predicate_id in sorted(held_combinations.items())
        ],
        "TRAINING-PLAIN.jsonl": sorted(training_plain, key=lambda row: row["id"]),
        "TRAINING-INLINE.jsonl": sorted(training_inline, key=lambda row: row["id"]),
        "COMPOSITION-DEVELOPMENT-PLAIN.jsonl": sorted(
            composition_development_plain, key=lambda row: row["id"]
        ),
        "COMPOSITION-DEVELOPMENT-INLINE.jsonl": sorted(
            composition_development_inline, key=lambda row: row["id"]
        ),
        "HELD-LEXEME-DEVELOPMENT-PLAIN.jsonl": sorted(
            held_lexeme_development_plain, key=lambda row: row["id"]
        ),
        "HELD-LEXEME-DEVELOPMENT-INLINE.jsonl": sorted(
            held_lexeme_development_inline, key=lambda row: row["id"]
        ),
        "COPY-AUXILIARY-TRAINING.jsonl": copy_training,
        "COPY-AUXILIARY-DEVELOPMENT-SCREEN.jsonl": copy_development_screen,
        "COPY-AUXILIARY-DEVELOPMENT-CONFIRMATION.jsonl": copy_development_confirmation,
        "COPY-AUXILIARY-EXCLUSIONS.jsonl": copy_exclusions,
    }
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_COPY_MECHANICS_AND_COMPOSITION_COMMISSION",
        "counts": counts,
        "composition_holdout_predicate_counts": dict(
            sorted(Counter(held_combinations.values()).items())
        ),
        "held_sentence_target_surfaces": sorted(
            row["target_surface"] for row in all_held_subjects
        ),
        "sealed_test_binding": contract["sealed_test_binding"],
        "sealed_test_policy": (
            "The sealed pair file was not resolved or opened. Its four subject "
            "surfaces are excluded through the already-public source commission contract."
        ),
        "target_accounting": (
            "The six-predicate factorial contains 114 controlled target pairs, 38 "
            "more than the prior 76-pair commission. Inline rows mirror those targets. "
            "All copy rows reproduce one exact dictionary surface and count as zero sentences."
        ),
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    for name, value in output_rows.items():
        write_jsonl_atomic(output_dir / name, value)
    write_json_atomic(output_dir / "REPORT.json", report)
    data_names = sorted([*output_rows, "REPORT.json"])
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "method_sha256": sha256_file(Path(__file__).resolve()),
        "contract": {
            "path": str(contract_path),
            "sha256": sha256_file(contract_path),
        },
        "source_contrast_contract": {
            "path": str(source_contract_path),
            "sha256": sha256_file(source_contract_path),
        },
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
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in checksum_names
        ),
    )
    print(canonical_json(report))


if __name__ == "__main__":
    main()

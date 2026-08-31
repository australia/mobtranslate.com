#!/usr/bin/env python3
"""Build fixed-update Wajarri schedules for composition and copy-mechanics screening."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import random
import sys
from collections import Counter, defaultdict
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
        plain_training_row,
        validate_accounting_profiles,
    )


METHOD_ID = "wajarri-v3-copy-composition-schedules-v1"
ARMS = ("C5", "S5", "K5")


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


def sentence_inline_training_row(row: dict[str, Any], tokenizer: Any) -> dict[str, Any]:
    if row.get("creates_new_target_sentence") is not False:
        raise ValueError(f"inline row creates a new target: {row.get('id')}")
    if row.get("representation") != "inline_annotation":
        raise ValueError(f"inline representation mismatch: {row.get('id')}")
    result = {
        "schema_version": 1,
        "id": str(row["id"]),
        "input_text": str(row["input_text"]),
        "output_text": str(row["output_text"]),
        "task": "terminology_conditioned_translation",
        "direction": "eng-wbv",
        "pair_kind": "copy_composition_sentence_inline",
        "source_population": "sentence_inline",
        "source_row_id": str(row["parent_row_id"]),
        "representation": "inline_annotation",
        "creates_new_target_sentence": False,
        "terminology_pairs": row["terminology_pairs"],
    }
    return annotate_tokens(result, tokenizer)


def copy_training_row(row: dict[str, Any], tokenizer: Any) -> dict[str, Any]:
    if row.get("approved_for_training") is not True:
        raise ValueError(f"copy row is not approved for training: {row.get('id')}")
    if row.get("creates_new_target_sentence") is not False:
        raise ValueError(f"copy row creates a new target: {row.get('id')}")
    if row.get("synthetic_output_is_linguistic_evidence") is not False:
        raise ValueError(f"copy row claims linguistic evidence: {row.get('id')}")
    result = {
        "schema_version": 1,
        "id": str(row["id"]),
        "input_text": str(row["input_text"]),
        "output_text": str(row["output_text"]),
        "task": "terminology_copy_auxiliary",
        "direction": "eng-wbv",
        "pair_kind": "nonlinguistic_inline_terminology_copy_mechanism",
        "source_population": "copy_auxiliary",
        "source_row_id": str(row["id"]),
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
        "target_surface": str(row["target_surface"]),
        "parent_lexical_id": str(row["parent_lexical_id"]),
    }
    return annotate_tokens(result, tokenizer)


def validate_mirror_targets(
    plain: list[dict[str, Any]], inline: list[dict[str, Any]], *, label: str
) -> None:
    plain_targets = {str(row["id"]): str(row["output_text"]) for row in plain}
    inline_targets = {
        str(row["parent_row_id"]): str(row["output_text"]) for row in inline
    }
    if len(plain_targets) != len(plain) or len(inline_targets) != len(inline):
        raise ValueError(f"duplicate {label} target identity")
    if plain_targets != inline_targets:
        raise ValueError(f"{label} plain/inline target mismatch")


def two_target_slots(row: dict[str, Any]) -> tuple[str, str]:
    tokens = str(row["output_text"]).strip().rstrip(".?!").casefold().split()
    if len(tokens) != 2:
        raise ValueError(f"expected two complete target slots: {row.get('id')}")
    return tokens[0], tokens[1]


def validate_composition_partition(
    training: list[dict[str, Any]], development: list[dict[str, Any]]
) -> None:
    training_pairs = {two_target_slots(row) for row in training}
    training_subjects = {pair[0] for pair in training_pairs}
    training_predicates = {pair[1] for pair in training_pairs}
    for row in development:
        subject, predicate = two_target_slots(row)
        if (subject, predicate) in training_pairs:
            raise ValueError(f"composition development pair appears in training: {row['id']}")
        if subject not in training_subjects or predicate not in training_predicates:
            raise ValueError(f"composition development contains an unexposed slot: {row['id']}")


def validate_copy_partitions(
    training: list[dict[str, Any]],
    screen: list[dict[str, Any]],
    confirmation: list[dict[str, Any]],
    held_sentences: list[dict[str, Any]],
) -> None:
    partitions = {
        "training": training,
        "screen": screen,
        "confirmation": confirmation,
    }
    surfaces: dict[str, set[str]] = {}
    for name, rows in partitions.items():
        observed: set[str] = set()
        for row in rows:
            if row.get("creates_new_target_sentence") is not False:
                raise ValueError(f"copy {name} row creates a target: {row.get('id')}")
            if row.get("synthetic_output_is_linguistic_evidence") is not False:
                raise ValueError(f"copy {name} row claims linguistic evidence: {row.get('id')}")
            surface = str(row["target_surface"]).strip().casefold()
            if not surface or surface in observed:
                raise ValueError(f"duplicate or blank copy {name} surface: {surface!r}")
            observed.add(surface)
        surfaces[name] = observed
    names = tuple(partitions)
    for index, left in enumerate(names):
        for right in names[index + 1 :]:
            if surfaces[left] & surfaces[right]:
                raise ValueError(f"copy surfaces overlap across {left} and {right}")
    held_subjects = {two_target_slots(row)[0] for row in held_sentences}
    if held_subjects & set().union(*surfaces.values()):
        raise ValueError("held sentence subject leaked into a copy partition")


def stable_cycle(
    rows: list[dict[str, Any]], count: int, *, seed: int, label: str
) -> list[dict[str, Any]]:
    if not rows or count <= 0:
        raise ValueError("stable cycle requires rows and a positive count")
    result: list[dict[str, Any]] = []
    cycle = 0
    while len(result) < count:
        ordered = list(rows)
        random.Random(seed + cycle * 104729).shuffle(ordered)
        for row in ordered:
            if len(result) == count:
                break
            result.append(
                {
                    **row,
                    "population_cycle": cycle + 1,
                    "population_presentation": len(result) + 1,
                    "schedule_population": label,
                }
            )
        cycle += 1
    return result


def schedule_identity(row: dict[str, Any]) -> dict[str, str]:
    parent = str(row["source_row_id"])
    population = str(row["schedule_population"])
    return {
        "target_pair_parent_id": parent,
        "accounting_parent_id": f"{parent}::{population}",
    }


def build_schedule(
    arm: str,
    populations: dict[str, list[dict[str, Any]]],
    per_update: dict[str, int],
    *,
    optimizer_updates: int,
    seed: int,
) -> list[dict[str, Any]]:
    sentence_quota = int(per_update.get("sentence_plain", 0))
    if sentence_quota != int(per_update.get("sentence_inline", 0)):
        raise ValueError(f"{arm} plain and inline sentence quotas must match")
    queues: dict[str, list[dict[str, Any]]] = {}
    for index, (name, quota) in enumerate(sorted(per_update.items()), start=1):
        if name in {"sentence_plain", "sentence_inline"}:
            continue
        queues[name] = stable_cycle(
            populations[name],
            optimizer_updates * int(quota),
            seed=seed + index * 1009,
            label=name,
        )
    sentence_parent_queue: list[dict[str, Any]] = []
    if sentence_quota:
        plain_by_parent = {str(row["source_row_id"]): row for row in populations["sentence_plain"]}
        inline_by_parent = {str(row["source_row_id"]): row for row in populations["sentence_inline"]}
        if plain_by_parent.keys() != inline_by_parent.keys():
            raise ValueError("training plain/inline parent sets differ")
        sentence_parent_queue = stable_cycle(
            [
                {"source_row_id": parent, "input_text": "", "output_text": ""}
                for parent in sorted(plain_by_parent)
            ],
            optimizer_updates * sentence_quota,
            seed=seed + 7919,
            label="sentence_pair",
        )
    else:
        plain_by_parent = {}
        inline_by_parent = {}

    offsets = Counter()
    schedule: list[dict[str, Any]] = []
    expected_per_update = sum(int(value) for value in per_update.values())
    for update in range(1, optimizer_updates + 1):
        block: list[dict[str, Any]] = []
        for name, quota_value in sorted(per_update.items()):
            quota = int(quota_value)
            if name in {"sentence_plain", "sentence_inline"}:
                continue
            start = offsets[name]
            block.extend(queues[name][start : start + quota])
            offsets[name] += quota
        if sentence_quota:
            start = offsets["sentence_pair"]
            parent_rows = sentence_parent_queue[start : start + sentence_quota]
            offsets["sentence_pair"] += sentence_quota
            for parent_row in parent_rows:
                parent = str(parent_row["source_row_id"])
                shared = {
                    "population_cycle": parent_row["population_cycle"],
                    "population_presentation": parent_row["population_presentation"],
                }
                block.append(
                    {
                        **plain_by_parent[parent],
                        **shared,
                        "schedule_population": "sentence_plain",
                    }
                )
                block.append(
                    {
                        **inline_by_parent[parent],
                        **shared,
                        "schedule_population": "sentence_inline",
                    }
                )
        if len(block) != expected_per_update:
            raise ValueError(f"{arm} update {update} has {len(block)} presentations")
        random.Random(seed + update * 4099).shuffle(block)
        for row in block:
            presentation = len(schedule) + 1
            schedule.append(
                {
                    **row,
                    "id": f"wbv-v3-copy-composition:{arm.lower()}:{presentation:06d}",
                    "arm": arm,
                    **schedule_identity(row),
                    "presentation_index": presentation,
                    "optimizer_update": update,
                }
            )
    return schedule


def validate_schedule(
    rows: list[dict[str, Any]], per_update: dict[str, int], *, updates: int
) -> None:
    expected = sum(int(value) for value in per_update.values())
    by_update: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_update[int(row["optimizer_update"])].append(row)
    if sorted(by_update) != list(range(1, updates + 1)):
        raise ValueError("schedule update sequence is incomplete")
    for update, block in by_update.items():
        counts = Counter(str(row["schedule_population"]) for row in block)
        if counts != Counter({name: int(value) for name, value in per_update.items()}):
            raise ValueError(f"population quota drift at update {update}: {counts}")
        plain = {
            str(row["target_pair_parent_id"])
            for row in block
            if row["schedule_population"] == "sentence_plain"
        }
        inline = {
            str(row["target_pair_parent_id"])
            for row in block
            if row["schedule_population"] == "sentence_inline"
        }
        if plain != inline:
            raise ValueError(f"plain/inline target pairing drift at update {update}")
    if len(rows) != updates * expected:
        raise ValueError("schedule presentation count mismatch")
    validate_accounting_profiles(rows)


def exposure_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    accounting = Counter(str(row["accounting_parent_id"]) for row in rows)
    targets = Counter(str(row["target_pair_parent_id"]) for row in rows)
    return {
        "presentations": len(rows),
        "unique_accounting_rows": len(accounting),
        "unique_target_parents": len(targets),
        "minimum_presentations_per_accounting_row": min(accounting.values()),
        "maximum_presentations_per_accounting_row": max(accounting.values()),
        "minimum_presentations_per_target_parent": min(targets.values()),
        "maximum_presentations_per_target_parent": max(targets.values()),
        "task_presentations": dict(sorted(Counter(str(row["task"]) for row in rows).items())),
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
        raise ValueError("unsupported copy-composition schedule contract")
    software = verify_software_contract(contract)
    inputs = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }

    retention_source = [
        row for row in inputs["controlled_synthetic"] if row.get("split") == "train"
    ]
    if len(retention_source) != int(contract["design"]["retention_unique_rows"]):
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
    validate_copy_partitions(
        inputs["copy_training"],
        inputs["copy_development_screen"],
        inputs["copy_development_confirmation"],
        inputs["held_lexeme_development_plain"],
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
        "copy_auxiliary": [
            copy_training_row(row, tokenizer) for row in inputs["copy_training"]
        ],
    }
    design = contract["design"]
    updates = int(design["optimizer_updates"])
    seed = int(design["seed"])
    schedules = {}
    for arm in ARMS:
        quotas = {
            name: int(value)
            for name, value in design["arms"][arm]["per_update"].items()
        }
        schedules[arm] = build_schedule(
            arm,
            populations,
            quotas,
            optimizer_updates=updates,
            seed=seed,
        )
        validate_schedule(schedules[arm], quotas, updates=updates)
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
        "COPY-AUXILIARY-UNIQUE.jsonl": populations["copy_auxiliary"],
    }
    for name, rows in files.items():
        write_jsonl_atomic(output_dir / name, rows)
    write_json_atomic(output_dir / "TOKEN-ACCOUNTING.json", accounting)

    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_COPY_COMPOSITION_SCREENING_SCHEDULES",
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
        "plain_inline_target_pairing_within_update": True,
        "composition_development_contains_only_seen_slots_in_novel_pairs": True,
        "copy_split_target_surfaces_disjoint": True,
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

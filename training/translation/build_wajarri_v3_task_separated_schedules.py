#!/usr/bin/env python3
"""Build task-separated Wajarri sentence-adapter screening schedules."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import random
import re
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


METHOD_ID_V1 = "wajarri-v3-task-separated-schedules-v1"
METHOD_ID_V2 = "wajarri-v3-task-separated-schedules-v2"
SUPPORTED_METHOD_IDS = {METHOD_ID_V1, METHOD_ID_V2}
THIRD_PERSON_SOURCE = re.compile(r"^<translate> The (?P<subject>.+) is (?P<predicate>.+)\.$")
FIRST_PERSON_SOURCE = re.compile(r"^<translate> I am (?P<predicate>.+)\.$")


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


def verify_software_contract(contract: dict[str, Any]) -> dict[str, str]:
    required = contract.get("software")
    if not required:
        return {}
    observed: dict[str, str] = {}
    for package, expected in sorted(required.items()):
        actual = importlib.metadata.version(package)
        if actual != expected:
            raise ValueError(
                f"software version mismatch for {package}: expected {expected}, got {actual}"
            )
        observed[package] = actual
    return observed


def resolve_rows(program_root: Path, binding: dict[str, Any]) -> list[dict[str, Any]]:
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
    return rows


def parse_two_slot_source(input_text: str) -> tuple[str, str]:
    third_person = THIRD_PERSON_SOURCE.fullmatch(input_text)
    if third_person:
        return third_person.group("subject"), third_person.group("predicate")
    first_person = FIRST_PERSON_SOURCE.fullmatch(input_text)
    if first_person:
        return "I", first_person.group("predicate")
    raise ValueError(f"unsupported controlled source shape: {input_text!r}")


def target_slots(output_text: str) -> tuple[str, str]:
    tokens = output_text.strip().rstrip(".?!").split()
    if len(tokens) != 2:
        raise ValueError(f"controlled target is not a two-slot clause: {output_text!r}")
    return tokens[0].casefold(), tokens[1].casefold()


def plain_training_row(row: dict[str, Any], tokenizer: Any, *, population: str) -> dict[str, Any]:
    result = {
        "schema_version": 1,
        "id": str(row["id"]),
        "input_text": str(row["input_text"]),
        "output_text": str(row["output_text"]),
        "task": "translate",
        "direction": "eng-wbv",
        "pair_kind": f"task_separated_{population}_plain",
        "source_population": population,
        "source_row_id": str(row["id"]),
    }
    return annotate_tokens(result, tokenizer)


def old_glossary_training_row(row: dict[str, Any], tokenizer: Any) -> dict[str, Any]:
    english_subject, english_predicate = parse_two_slot_source(str(row["input_text"]))
    target_subject, target_predicate = target_slots(str(row["output_text"]))
    input_text = (
        f"{row['input_text']} <glossary> "
        f"{english_subject} = {target_subject}; "
        f"{english_predicate} = {target_predicate}"
    )
    result = {
        "schema_version": 1,
        "id": f"{row['id']}:glossary-v1",
        "input_text": input_text,
        "output_text": str(row["output_text"]),
        "task": "glossary_translation",
        "direction": "eng-wbv",
        "pair_kind": "task_separated_retention_glossary",
        "source_population": "retention",
        "source_row_id": str(row["id"]),
        "creates_new_target_sentence": False,
        "glossary_pairs": [
            {
                "slot": "subject",
                "english_surface": english_subject,
                "wajarri_surface": target_subject,
            },
            {
                "slot": "predicate",
                "english_surface": english_predicate,
                "wajarri_surface": target_predicate,
            },
        ],
    }
    return annotate_tokens(result, tokenizer)


def commissioned_glossary_row(row: dict[str, Any], tokenizer: Any) -> dict[str, Any]:
    if row.get("creates_new_target_sentence") is not False:
        raise ValueError(f"glossary row creates an unbound target: {row.get('id')}")
    result = {
        "schema_version": 1,
        "id": str(row["id"]),
        "input_text": str(row["input_text"]),
        "output_text": str(row["output_text"]),
        "task": "glossary_translation",
        "direction": "eng-wbv",
        "pair_kind": "task_separated_contrast_glossary",
        "source_population": "contrast",
        "source_row_id": str(row["parent_row_id"]),
        "creates_new_target_sentence": False,
        "glossary_pairs": row["glossary_pairs"],
    }
    return annotate_tokens(result, tokenizer)


def stable_cycle(
    rows: list[dict[str, Any]], count: int, *, seed: int, label: str
) -> list[dict[str, Any]]:
    if not rows or count <= 0:
        raise ValueError("stable cycle requires a nonempty population and positive count")
    presentations: list[dict[str, Any]] = []
    cycle = 0
    while len(presentations) < count:
        ordered = list(rows)
        random.Random(seed + cycle * 104729).shuffle(ordered)
        for row in ordered:
            if len(presentations) == count:
                break
            presentations.append(
                {
                    **row,
                    "population_cycle": cycle + 1,
                    "population_presentation": len(presentations) + 1,
                    "schedule_population": label,
                }
            )
        cycle += 1
    return presentations


def schedule_identities(
    row: dict[str, Any], *, schedule_population: str, identity_version: int
) -> dict[str, str]:
    """Separate target-pair identity from format-specific accounting identity."""
    target_pair_parent_id = str(row["source_row_id"])
    if identity_version == 1:
        return {"accounting_parent_id": target_pair_parent_id}
    if identity_version != 2:
        raise ValueError(f"unsupported schedule identity version: {identity_version}")
    return {
        "target_pair_parent_id": target_pair_parent_id,
        "accounting_parent_id": f"{target_pair_parent_id}::{schedule_population}",
    }


def build_schedule(
    arm: str,
    populations: dict[str, list[dict[str, Any]]],
    per_update: dict[str, int],
    *,
    optimizer_updates: int,
    seed: int,
    identity_version: int = 2,
) -> list[dict[str, Any]]:
    expected_per_update = sum(per_update.values())
    queues = {
        name: stable_cycle(
            populations[name],
            optimizer_updates * quota,
            seed=seed + index * 1009,
            label=name,
        )
        for index, (name, quota) in enumerate(sorted(per_update.items()), start=1)
    }
    schedule: list[dict[str, Any]] = []
    offsets = Counter()
    for update in range(1, optimizer_updates + 1):
        block = []
        for name, quota in sorted(per_update.items()):
            start = offsets[name]
            block.extend(queues[name][start : start + quota])
            offsets[name] += quota
        if len(block) != expected_per_update:
            raise AssertionError("incomplete optimizer-update block")
        random.Random(seed + update * 4099).shuffle(block)
        for row in block:
            presentation = len(schedule) + 1
            schedule.append(
                {
                    **row,
                    "id": f"wbv-v3-task-separated:{arm.lower()}:{presentation:06d}",
                    "arm": arm,
                    **schedule_identities(
                        row,
                        schedule_population=str(row["schedule_population"]),
                        identity_version=identity_version,
                    ),
                    "presentation_index": presentation,
                    "optimizer_update": update,
                }
            )
    return schedule


def derive_glossary_schedule(
    plain_schedule: list[dict[str, Any]],
    glossary_by_parent: dict[str, dict[str, Any]],
    *,
    arm: str,
    glossary_per_population_per_update: int,
    seed: int,
    identity_version: int = 2,
) -> list[dict[str, Any]]:
    """Replace matched plain presentations with glossary forms without changing targets."""
    by_update: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in plain_schedule:
        by_update[int(row["optimizer_update"])].append(row)
    result: list[dict[str, Any]] = []
    for update, block in sorted(by_update.items()):
        convert_ids: set[str] = set()
        for population in ("retention_plain", "contrast_plain"):
            candidates = [row for row in block if row["schedule_population"] == population]
            if len(candidates) != glossary_per_population_per_update * 2:
                raise ValueError(
                    f"unexpected {population} quota at update {update}: {len(candidates)}"
                )
            ranked = sorted(
                candidates,
                key=lambda row: hashlib.sha256(
                    f"{seed}:{update}:{population}:{row['source_row_id']}".encode()
                ).hexdigest(),
            )
            convert_ids.update(row["id"] for row in ranked[:glossary_per_population_per_update])
        for row in block:
            source = row
            if row["id"] in convert_ids:
                source = glossary_by_parent[str(row["source_row_id"])]
            presentation = len(result) + 1
            schedule_population = (
                f"{row['source_population']}_glossary"
                if row["id"] in convert_ids
                else f"{row['source_population']}_plain"
            )
            result.append(
                {
                    **source,
                    "id": f"wbv-v3-task-separated:{arm.lower()}:{presentation:06d}",
                    "arm": arm,
                    **schedule_identities(
                        row,
                        schedule_population=schedule_population,
                        identity_version=identity_version,
                    ),
                    "presentation_index": presentation,
                    "optimizer_update": update,
                    "population_cycle": row["population_cycle"],
                    "population_presentation": row["population_presentation"],
                    "schedule_population": schedule_population,
                }
            )
    return result


def validate_accounting_profiles(rows: list[dict[str, Any]]) -> None:
    """Fail before GPU use if one accounting identity has incompatible profiles."""
    profiles: dict[str, tuple[str, str, int, int, int]] = {}
    for row in rows:
        tokens = row["token_accounting"]
        profile = (
            str(row["task"]),
            str(row["pair_kind"]),
            int(tokens["source_tokens_with_specials"]),
            int(tokens["target_tokens_with_specials"]),
            int(tokens["non_padding_tokens_with_specials"]),
        )
        accounting_parent_id = str(row["accounting_parent_id"])
        existing = profiles.get(accounting_parent_id)
        if existing is not None and existing != profile:
            raise ValueError(
                "repeated accounting parent has inconsistent token/task profile: "
                f"id={accounting_parent_id!r}, first={existing}, second={profile}"
            )
        profiles[accounting_parent_id] = profile


def validate_target_exposure_pairing(
    plain: list[dict[str, Any]], glossary: list[dict[str, Any]]
) -> None:
    """Prove that a format intervention leaves ordered target exposure unchanged."""
    if len(plain) != len(glossary):
        raise ValueError("plain and glossary schedules differ in length")
    for index, (plain_row, glossary_row) in enumerate(zip(plain, glossary), start=1):
        plain_identity = str(plain_row.get("target_pair_parent_id") or "")
        glossary_identity = str(glossary_row.get("target_pair_parent_id") or "")
        if not plain_identity or plain_identity != glossary_identity:
            raise ValueError(f"target-pair identity drift at presentation {index}")
        if plain_row["output_text"] != glossary_row["output_text"]:
            raise ValueError(f"target-text drift at presentation {index}")
        plain_target_tokens = plain_row["token_accounting"][
            "target_tokens_with_specials"
        ]
        glossary_target_tokens = glossary_row["token_accounting"][
            "target_tokens_with_specials"
        ]
        if plain_target_tokens != glossary_target_tokens:
            raise ValueError(f"target-token drift at presentation {index}")


def validate_population_separation(
    old_train: list[dict[str, Any]],
    contrast_train: list[dict[str, Any]],
    development: list[dict[str, Any]],
    sealed_test: list[dict[str, Any]],
) -> None:
    old_pairs = {
        (str(row["input_text"]).casefold(), str(row["output_text"]).casefold())
        for row in old_train
    }
    if len(old_pairs) != len(old_train):
        raise ValueError("retention corpus contains duplicate training pairs")
    train_families = {str(row["family_id"]) for row in contrast_train}
    dev_families = {str(row["family_id"]) for row in development}
    test_families = {str(row["family_id"]) for row in sealed_test}
    if train_families & dev_families or train_families & test_families or dev_families & test_families:
        raise ValueError("contrast subject-family split leaks across partitions")
    train_inputs = {str(row["input_text"]).casefold() for row in contrast_train}
    held_inputs = {
        str(row["input_text"]).casefold() for row in [*development, *sealed_test]
    }
    if train_inputs & held_inputs:
        raise ValueError("contrast input leaks into a held partition")
    if old_pairs & {
        (str(row["input_text"]).casefold(), str(row["output_text"]).casefold())
        for row in [*development, *sealed_test]
    }:
        raise ValueError("retention training corpus overlaps held contrast pairs")


def exposure_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    parent_counts = Counter(str(row["accounting_parent_id"]) for row in rows)
    return {
        "presentations": len(rows),
        "unique_parent_rows": len(parent_counts),
        "task_presentations": dict(sorted(Counter(str(row["task"]) for row in rows).items())),
        "population_presentations": dict(
            sorted(Counter(str(row["schedule_population"]) for row in rows).items())
        ),
        "minimum_presentations_per_parent": min(parent_counts.values()),
        "maximum_presentations_per_parent": max(parent_counts.values()),
    }


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    contract_path = args.contract.resolve()
    contract = load_json(contract_path)
    method_id = str(contract.get("method_id") or "")
    if method_id not in SUPPORTED_METHOD_IDS:
        raise ValueError(f"unexpected method ID: {contract.get('method_id')}")
    identity_version = 2 if method_id == METHOD_ID_V2 else 1
    software = verify_software_contract(contract)
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")

    inputs = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }
    old_train = [
        row for row in inputs["controlled_synthetic"] if row.get("split") == "train"
    ]
    expected_old_train = int(contract["design"]["retention_unique_rows"])
    if len(old_train) != expected_old_train:
        raise ValueError(
            f"expected {expected_old_train} retention training rows, got {len(old_train)}"
        )
    validate_population_separation(
        old_train,
        inputs["contrast_training"],
        inputs["contrast_development"],
        inputs["contrast_sealed_test"],
    )

    adapter_dir = (program_root / contract["tokenizer"]["path"]).resolve()
    sentencepiece = adapter_dir / "sentencepiece.bpe.model"
    if sha256_file(sentencepiece) != contract["tokenizer"]["sentencepiece_sha256"]:
        raise ValueError("tokenizer SentencePiece hash mismatch")
    try:
        from transformers import NllbTokenizer
    except ImportError as error:
        raise RuntimeError("transformers is required for token accounting") from error
    tokenizer = NllbTokenizer.from_pretrained(
        adapter_dir,
        src_lang="eng_Latn",
        tgt_lang="wbv_Latn",
        local_files_only=True,
    )
    if len(tokenizer) != int(contract["tokenizer"]["vocabulary_size"]):
        raise ValueError("tokenizer vocabulary-size mismatch")

    retention_plain = [
        plain_training_row(row, tokenizer, population="retention") for row in old_train
    ]
    retention_glossary = [old_glossary_training_row(row, tokenizer) for row in old_train]
    contrast_plain = [
        plain_training_row(row, tokenizer, population="contrast")
        for row in inputs["contrast_training"]
    ]
    contrast_glossary = [
        commissioned_glossary_row(row, tokenizer)
        for row in inputs["contrast_glossary_training"]
    ]
    plain_targets = {
        row["source_row_id"]: row["output_text"] for row in contrast_plain
    }
    glossary_targets = {
        row["source_row_id"]: row["output_text"] for row in contrast_glossary
    }
    if plain_targets != glossary_targets:
        raise ValueError("contrast plain/glossary rows do not preserve identical targets")

    populations = {
        "retention_plain": retention_plain,
        "retention_glossary": retention_glossary,
        "contrast_plain": contrast_plain,
        "contrast_glossary": contrast_glossary,
    }
    design = contract["design"]
    optimizer_updates = int(design["optimizer_updates"])
    seed = int(design["seed"])
    schedules = {
        arm: build_schedule(
            arm,
            populations,
            {name: int(quota) for name, quota in design["arms"][arm]["per_update"].items()},
            optimizer_updates=optimizer_updates,
            seed=seed,
            identity_version=identity_version,
        )
        for arm in ("C3", "P3")
    }
    glossary_by_parent = {
        str(row["source_row_id"]): row
        for row in [*retention_glossary, *contrast_glossary]
    }
    schedules["G3"] = derive_glossary_schedule(
        schedules["P3"],
        glossary_by_parent,
        arm="G3",
        glossary_per_population_per_update=4,
        seed=seed,
        identity_version=identity_version,
    )
    expected_presentations = int(design["presentations_per_arm"])
    if any(len(rows) != expected_presentations for rows in schedules.values()):
        raise ValueError("schedule presentation count mismatch")
    for rows in schedules.values():
        validate_accounting_profiles(rows)
    if identity_version == 2:
        validate_target_exposure_pairing(schedules["P3"], schedules["G3"])

    accounting = {
        arm: schedule_token_accounting(
            rows, physical_batch_size=int(design["physical_batch_size"])
        )
        for arm, rows in schedules.items()
    }
    if (
        accounting["P3"]["target_non_padding_tokens_with_specials"]
        != accounting["G3"]["target_non_padding_tokens_with_specials"]
    ):
        raise ValueError("plain and glossary treatments are not target-token matched")

    output_dir.mkdir(parents=True)
    files: dict[str, list[dict[str, Any]]] = {
        **{f"{arm}-SCHEDULE.jsonl": rows for arm, rows in schedules.items()},
        "RETENTION-PLAIN-UNIQUE.jsonl": retention_plain,
        "RETENTION-GLOSSARY-UNIQUE.jsonl": retention_glossary,
        "CONTRAST-PLAIN-UNIQUE.jsonl": contrast_plain,
        "CONTRAST-GLOSSARY-UNIQUE.jsonl": contrast_glossary,
    }
    for name, rows in files.items():
        write_jsonl_atomic(output_dir / name, rows)
    write_json_atomic(output_dir / "TOKEN-ACCOUNTING.json", accounting)
    report = {
        "schema_version": 1,
        "method_id": method_id,
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_TASK_SEPARATED_SCREENING_SCHEDULES",
        "software": software,
        "design": design,
        "unique_populations": {name: len(rows) for name, rows in populations.items()},
        "arm_exposure": {
            arm: {**exposure_summary(rows), "token_accounting": accounting[arm]}
            for arm, rows in schedules.items()
        },
        "plain_glossary_target_tokens_matched": True,
        "plain_glossary_target_pair_identity_sequence_matched": identity_version == 2,
        "format_specific_accounting_identities": identity_version == 2,
        "plain_glossary_source_tokens_intentionally_unmatched": True,
        "source_token_difference_reason": (
            "Glossary-conditioned inputs expose the supplied lexical evidence. "
            "Target tokens, optimizer updates, batch boundaries, and LR trajectory remain matched."
        ),
        "sealed_test_consumed_for_schedule_selection": False,
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "REPORT.json", report)
    names = [*files, "TOKEN-ACCOUNTING.json", "REPORT.json"]
    manifest = {
        "schema_version": 1,
        "method_id": method_id,
        "created_at_utc": contract["created_at_utc"],
        "software": software,
        "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "contract_path": str(contract_path),
        "contract_sha256": sha256_file(contract_path),
        "files": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
                **(
                    {"rows": len(files[name])}
                    if name in files
                    else {}
                ),
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

#!/usr/bin/env python3
"""Build token-accounted Mi'kmaq sentence schedules with natural lesson data.

This builder keeps the original v1 unprefixed input contract and excludes bare
lexical reconstruction rows from sentence-model training. The two treatment
arms replace 20% or 40% of a fixed 19,200-example retention schedule with
Listuguj lesson translations. Replacement controls are selected by exact NLLB
source/target token lengths where possible, then nearest length, so optimizer
updates and token exposure remain directly auditable.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import unicodedata
from typing import Any, Iterable, Sequence


QUOTE_FOLD = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u02bc": "'",
        "`": "'",
        "\u00b4": "'",
        "\u201c": '"',
        "\u201d": '"',
    }
)
SCREEN_PRESENTATIONS = 19_200
LESSON_SHARES = (0.20, 0.40)
EXPECTED_EXISTING_TRAIN_ROWS = 5_798
EXPECTED_LESSON_TRAIN_TRANSLATIONS = 881
EXPECTED_LESSON_VALIDATION_TRANSLATIONS = 117
EXPECTED_LESSON_VALIDATION_LEXEMES = 103
EXPECTED_LEXICAL_ROWS = 14_438


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--existing-release", type=Path, required=True)
    parser.add_argument("--lessons-release", type=Path, required=True)
    parser.add_argument("--tokenizer-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260721)
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-target-length", type=int, default=192)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_text(value: Any) -> str:
    return " ".join(
        unicodedata.normalize("NFC", str(value or "")).translate(QUOTE_FOLD).split()
    )


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"non-object JSON at {path}:{line_number}")
            rows.append(row)
    return rows


def stable_order(rows: Sequence[dict[str, Any]], seed: int, label: str) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: (
            hashlib.sha256(f"{seed}:{label}:{row['id']}".encode()).hexdigest(),
            str(row["id"]),
        ),
    )


def unique_ids(rows: Sequence[dict[str, Any]], label: str) -> None:
    ids = [str(row.get("id") or "") for row in rows]
    if any(not row_id for row_id in ids):
        raise ValueError(f"{label} has a blank ID")
    if len(ids) != len(set(ids)):
        raise ValueError(f"{label} has duplicate IDs")


def source_text(row: dict[str, Any]) -> str:
    source = model_text(row.get("unconditioned_input_text"))
    if not source:
        source = model_text(row.get("english"))
    if not source:
        source = model_text(row.get("input_text"))
        if source.startswith("<translate> "):
            source = source.removeprefix("<translate> ").strip()
    return source


def sentence_row(row: dict[str, Any], *, origin: str, split: str) -> dict[str, Any]:
    source = source_text(row)
    target = model_text(row.get("output_text") or row.get("migmaq"))
    if not source or not target:
        raise ValueError(f"blank sentence pair: {row.get('id')}")
    if source.startswith("<"):
        raise ValueError(f"sentence source retains a task control: {row.get('id')}")
    return {
        "id": f"{row['id']}:v1-unprefixed",
        "source_record_id": str(row["id"]),
        "direction": "eng-mic",
        "source_lang": "eng_Latn",
        "target_lang": "mic_Latn",
        "input_text": source,
        "unconditioned_input_text": source,
        "output_text": target,
        "translation": {"eng_Latn": source, "mic_Latn": target},
        "task": "translate",
        "task_prefix": None,
        "pair_kind": "attested_sentence_translation",
        "source_origin": origin,
        "source_split": split,
        "lesson_id": row.get("lesson_id"),
        "rights_status": row.get("rights_status"),
        "approved_for_training": bool(row.get("approved_for_training", True)),
    }


def lexical_diagnostic_row(row: dict[str, Any], *, origin: str) -> dict[str, Any]:
    source = source_text(row)
    target = model_text(row.get("output_text") or row.get("migmaq"))
    references = [model_text(value) for value in row.get("accepted_references") or []]
    references = list(dict.fromkeys(value for value in references if value))
    if not references and target:
        references = [target]
    if not source or not references:
        raise ValueError(f"blank lexical diagnostic: {row.get('id')}")
    return {
        **row,
        "id": f"{row['id']}:plain-v1-diagnostic",
        "input_text": source,
        "unconditioned_input_text": source,
        "output_text": references[0],
        "accepted_references": references,
        "task": "lexical_plain_diagnostic",
        "task_prefix": None,
        "pair_kind": "plain_input_lexical_reconstruction_diagnostic",
        "source_origin": origin,
        "promotion_eligible": False,
    }


def filter_lessons(
    rows: Sequence[dict[str, Any]], task: str, *, split: str
) -> list[dict[str, Any]]:
    selected = [
        row
        for row in rows
        if row.get("task") == task
        and row.get("split") == split
        and row.get("approved_for_training") is True
    ]
    unique_ids(selected, f"lesson {split} {task}")
    return selected


def tokenizer_lengths(
    rows: Sequence[dict[str, Any]],
    tokenizer: Any,
    *,
    max_source_length: int,
    max_target_length: int,
    batch_size: int = 512,
) -> dict[str, dict[str, int | bool]]:
    result: dict[str, dict[str, int | bool]] = {}
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        sources = [model_text(row["input_text"]) for row in batch]
        targets = [model_text(row["output_text"]) for row in batch]
        tokenizer.src_lang = "eng_Latn"
        tokenizer.tgt_lang = "mic_Latn"
        source_ids = tokenizer(sources, truncation=False)["input_ids"]
        target_ids = tokenizer(text_target=targets, truncation=False)["input_ids"]
        for row, raw_source_ids, raw_target_ids in zip(
            batch, source_ids, target_ids, strict=True
        ):
            raw_source = len(raw_source_ids)
            raw_target = len(raw_target_ids)
            source = min(raw_source, max_source_length)
            target = min(raw_target, max_target_length)
            result[str(row["id"])] = {
                "source_tokens": source,
                "target_tokens": target,
                "non_padding_tokens": source + target,
                "source_truncated": raw_source > max_source_length,
                "target_truncated": raw_target > max_target_length,
            }
    if len(result) != len(rows):
        raise RuntimeError("token length inventory lost rows")
    return result


def replay(rows: Sequence[dict[str, Any]], count: int, *, seed: int, label: str) -> list[dict[str, Any]]:
    if count < 0 or (count and not rows):
        raise ValueError(f"invalid replay request for {label}: count={count}, pool={len(rows)}")
    ordered = stable_order(rows, seed, label)
    return [ordered[index % len(ordered)] for index in range(count)]


def match_controls_by_token_length(
    old_rows: Sequence[dict[str, Any]],
    lesson_presentations: Sequence[dict[str, Any]],
    token_lengths: dict[str, dict[str, int | bool]],
    *,
    seed: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    groups: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for row in old_rows:
        lengths = token_lengths[str(row["id"])]
        groups[(int(lengths["source_tokens"]), int(lengths["target_tokens"]))].append(row)
    if not groups:
        raise ValueError("old-row token groups are empty")
    for key, members in list(groups.items()):
        groups[key] = stable_order(members, seed, f"length-bucket/{key[0]}/{key[1]}")

    keys = sorted(groups)
    offsets: Counter[tuple[int, int]] = Counter()
    controls: list[dict[str, Any]] = []
    ledger: list[dict[str, Any]] = []
    for index, lesson in enumerate(lesson_presentations):
        lesson_lengths = token_lengths[str(lesson["id"])]
        lesson_source = int(lesson_lengths["source_tokens"])
        lesson_target = int(lesson_lengths["target_tokens"])
        key = min(
            keys,
            key=lambda candidate: (
                abs(candidate[1] - lesson_target),
                abs(candidate[0] - lesson_source),
                abs(sum(candidate) - lesson_source - lesson_target),
                hashlib.sha256(
                    f"{seed}:nearest-length:{index}:{candidate[0]}:{candidate[1]}".encode()
                ).hexdigest(),
            ),
        )
        members = groups[key]
        control = members[offsets[key] % len(members)]
        offsets[key] += 1
        controls.append(control)
        ledger.append(
            {
                "pair_index": index,
                "lesson_source_id": lesson["id"],
                "control_source_id": control["id"],
                "lesson_source_tokens": lesson_source,
                "lesson_target_tokens": lesson_target,
                "control_source_tokens": key[0],
                "control_target_tokens": key[1],
                "source_token_delta": lesson_source - key[0],
                "target_token_delta": lesson_target - key[1],
                "exact_source_and_target_length_match": key == (lesson_source, lesson_target),
            }
        )
    return controls, ledger


def schedule_row(
    selected: dict[str, Any],
    *,
    position: int,
    arm: str,
    control: dict[str, Any],
    lesson: dict[str, Any] | None,
    intervention: bool,
) -> dict[str, Any]:
    return {
        "id": f"migmaq-v3.2-screen-position-{position:05d}",
        "schedule_position": position,
        "schedule_arm": arm,
        "schedule_source_id": selected["id"],
        "control_source_id": control["id"],
        "lesson_source_id": lesson["id"] if lesson else None,
        "natural_lesson_intervention": intervention,
        "direction": "eng-mic",
        "source_lang": "eng_Latn",
        "target_lang": "mic_Latn",
        "input_text": selected["input_text"],
        "unconditioned_input_text": selected["input_text"],
        "output_text": selected["output_text"],
        "task": "translate",
        "task_prefix": None,
        "pair_kind": selected["pair_kind"],
        "source_origin": selected["source_origin"],
        "source_record_id": selected["source_record_id"],
        "lesson_id": selected.get("lesson_id"),
    }


def schedule_token_audit(
    schedule: Sequence[dict[str, Any]], token_lengths: dict[str, dict[str, int | bool]]
) -> dict[str, Any]:
    totals: Counter[str] = Counter()
    by_origin: dict[str, Counter[str]] = defaultdict(Counter)
    source_ids: set[str] = set()
    truncated = Counter()
    for row in schedule:
        source_id = str(row["schedule_source_id"])
        lengths = token_lengths[source_id]
        source_ids.add(source_id)
        counts = {
            "examples": 1,
            "source_tokens": int(lengths["source_tokens"]),
            "target_tokens": int(lengths["target_tokens"]),
            "non_padding_tokens": int(lengths["non_padding_tokens"]),
        }
        totals.update(counts)
        by_origin[str(row["source_origin"])].update(counts)
        truncated["source"] += int(bool(lengths["source_truncated"]))
        truncated["target"] += int(bool(lengths["target_truncated"]))
    return {
        **dict(totals),
        "unique_source_rows": len(source_ids),
        "source_origins": dict(sorted(Counter(str(row["source_origin"]) for row in schedule).items())),
        "by_origin": {label: dict(counts) for label, counts in sorted(by_origin.items())},
        "truncated_presentations": dict(truncated),
    }


def build_schedules(
    old_rows: Sequence[dict[str, Any]],
    lesson_rows: Sequence[dict[str, Any]],
    token_lengths: dict[str, dict[str, int | bool]],
    *,
    seed: int,
    total: int = SCREEN_PRESENTATIONS,
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]], dict[str, Any]]:
    maximum_replacements = round(total * max(LESSON_SHARES))
    lesson_presentations = replay(
        lesson_rows, maximum_replacements, seed=seed, label="lesson-presentations"
    )
    controls, matching_ledger = match_controls_by_token_length(
        old_rows, lesson_presentations, token_lengths, seed=seed
    )
    common_count = total - maximum_replacements
    common = replay(old_rows, common_count, seed=seed, label="common-retention")

    slots: list[dict[str, Any]] = []
    for index, (control, lesson) in enumerate(zip(controls, lesson_presentations, strict=True)):
        slots.append(
            {
                "slot_id": f"replacement-{index:05d}",
                "replacement_index": index,
                "control": control,
                "lesson": lesson,
            }
        )
    for index, control in enumerate(common):
        slots.append(
            {
                "slot_id": f"common-{index:05d}",
                "replacement_index": None,
                "control": control,
                "lesson": None,
            }
        )
    slots = sorted(
        slots,
        key=lambda slot: (
            hashlib.sha256(f"{seed}:schedule-order:{slot['slot_id']}".encode()).hexdigest(),
            str(slot["slot_id"]),
        ),
    )

    arm_limits = {"retention": 0, "lessons20": round(total * 0.20), "lessons40": maximum_replacements}
    schedules: dict[str, list[dict[str, Any]]] = {}
    for arm, limit in arm_limits.items():
        rows: list[dict[str, Any]] = []
        for position, slot in enumerate(slots):
            replacement_index = slot["replacement_index"]
            intervene = replacement_index is not None and int(replacement_index) < limit
            selected = slot["lesson"] if intervene else slot["control"]
            rows.append(
                schedule_row(
                    selected,
                    position=position,
                    arm=arm,
                    control=slot["control"],
                    lesson=slot["lesson"],
                    intervention=intervene,
                )
            )
        unique_ids(rows, arm)
        if len(rows) != total:
            raise RuntimeError(f"{arm} schedule has {len(rows)} rows, expected {total}")
        schedules[arm] = rows

    for position, rows_at_position in enumerate(zip(*schedules.values(), strict=True)):
        if len({row["id"] for row in rows_at_position}) != 1:
            raise RuntimeError(f"arm IDs diverged at position {position}")
        if len({row["schedule_position"] for row in rows_at_position}) != 1:
            raise RuntimeError(f"arm positions diverged at position {position}")

    audits = {arm: schedule_token_audit(rows, token_lengths) for arm, rows in schedules.items()}
    control = audits["retention"]
    deltas: dict[str, Any] = {}
    for arm in ("lessons20", "lessons40"):
        observed = audits[arm]
        metric_deltas = {}
        for metric in ("source_tokens", "target_tokens", "non_padding_tokens"):
            difference = int(observed[metric]) - int(control[metric])
            relative = difference / int(control[metric])
            metric_deltas[metric] = {"absolute": difference, "relative_to_retention": relative}
        deltas[arm] = metric_deltas
        if abs(metric_deltas["target_tokens"]["relative_to_retention"]) > 0.01:
            raise RuntimeError(f"{arm} target-token delta exceeds 1%: {metric_deltas}")
        if abs(metric_deltas["non_padding_tokens"]["relative_to_retention"]) > 0.01:
            raise RuntimeError(f"{arm} total-token delta exceeds 1%: {metric_deltas}")

    pairing = {
        "positions": total,
        "identical_position_ids": True,
        "retention_to_lessons20_changed_positions": arm_limits["lessons20"],
        "retention_to_lessons40_changed_positions": arm_limits["lessons40"],
        "lessons20_is_nested_within_lessons40": True,
        "token_deltas": deltas,
    }
    return schedules, matching_ledger, {"arms": audits, "pairing": pairing}


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def output_record(path: Path, rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    return {
        "path": str(path.resolve()),
        "sha256": sha256(path),
        "rows": len(rows),
        "task_counts": dict(sorted(Counter(str(row.get("task")) for row in rows).items())),
    }


def main() -> None:
    args = parse_args()
    existing = args.existing_release.expanduser().resolve()
    lessons = args.lessons_release.expanduser().resolve()
    tokenizer_dir = args.tokenizer_dir.expanduser().resolve()
    output = args.output_dir.expanduser().resolve()
    if output.exists():
        raise FileExistsError(f"refusing existing output directory: {output}")

    paths = {
        "existing_manifest": existing / "manifest.json",
        "existing_train": existing / "pools/sentence-train.eng-mic.jsonl",
        "existing_validation": existing / "evaluation/sentence-validation.eng-mic.jsonl",
        "existing_opened": existing / "evaluation/sentence-opened-regression.eng-mic.jsonl",
        "lexical_all": existing / "evaluation/lexical-all.eng-mic.jsonl",
        "lessons_manifest": lessons / "manifest.json",
        "lessons_train": lessons / "training/train.eng-mic.jsonl",
        "lessons_validation": lessons / "evaluation/validation.eng-mic.jsonl",
        "tokenizer_json": tokenizer_dir / "tokenizer.json",
    }
    for path in paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)

    old_train_raw = read_jsonl(paths["existing_train"])
    lesson_train_raw = read_jsonl(paths["lessons_train"])
    lesson_validation_raw = read_jsonl(paths["lessons_validation"])
    lexical_raw = read_jsonl(paths["lexical_all"])
    if len(old_train_raw) != EXPECTED_EXISTING_TRAIN_ROWS:
        raise ValueError(f"existing train rows changed: {len(old_train_raw)}")
    lesson_train_selected = filter_lessons(lesson_train_raw, "translate", split="train")
    lesson_validation_translate = filter_lessons(
        lesson_validation_raw, "translate", split="validation"
    )
    lesson_validation_lexeme = filter_lessons(
        lesson_validation_raw, "lexeme", split="validation"
    )
    expected_counts = {
        "lesson train translations": (len(lesson_train_selected), EXPECTED_LESSON_TRAIN_TRANSLATIONS),
        "lesson validation translations": (
            len(lesson_validation_translate),
            EXPECTED_LESSON_VALIDATION_TRANSLATIONS,
        ),
        "lesson validation lexemes": (len(lesson_validation_lexeme), EXPECTED_LESSON_VALIDATION_LEXEMES),
        "lexical census": (len(lexical_raw), EXPECTED_LEXICAL_ROWS),
    }
    for label, (observed, expected) in expected_counts.items():
        if observed != expected:
            raise ValueError(f"{label} changed: {observed} != {expected}")

    old_train = [sentence_row(row, origin="migmaq_online_dictionary_example", split="train") for row in old_train_raw]
    lesson_train = [sentence_row(row, origin="listuguj_lessons", split="train") for row in lesson_train_selected]
    old_validation = [
        sentence_row(row, origin="migmaq_online_dictionary_example", split="validation")
        for row in read_jsonl(paths["existing_validation"])
    ]
    old_opened = [
        sentence_row(row, origin="migmaq_online_dictionary_example", split="opened_regression")
        for row in read_jsonl(paths["existing_opened"])
    ]
    lesson_validation_sentences = [
        sentence_row(row, origin="listuguj_lessons", split="validation")
        for row in lesson_validation_translate
    ]
    lesson_validation_words = [
        lexical_diagnostic_row(row, origin="listuguj_lessons")
        for row in lesson_validation_lexeme
    ]
    lexical_plain = [
        lexical_diagnostic_row(row, origin="migmaq_online_dictionary") for row in lexical_raw
    ]

    all_train = old_train + lesson_train
    unique_ids(all_train, "combined training pools")
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_dir,
        use_fast=True,
        src_lang="eng_Latn",
        tgt_lang="mic_Latn",
        local_files_only=True,
    )
    lengths = tokenizer_lengths(
        all_train,
        tokenizer,
        max_source_length=args.max_source_length,
        max_target_length=args.max_target_length,
    )
    schedules, matching_ledger, schedule_audit = build_schedules(
        old_train, lesson_train, lengths, seed=args.seed
    )

    output.mkdir(parents=True)
    for child in ("schedules", "evaluation", "ledger"):
        (output / child).mkdir()
    outputs: dict[str, Any] = {}
    for arm, rows in schedules.items():
        path = output / "schedules" / f"{arm}-screen-600.eng-mic.jsonl"
        write_jsonl_atomic(path, rows)
        outputs[f"schedules/{arm}-screen-600"] = output_record(path, rows)
    evaluation_rows = {
        "existing-validation-unprefixed": old_validation,
        "existing-opened-regression-unprefixed": old_opened,
        "lesson-validation-sentences": lesson_validation_sentences,
        "lesson-validation-lexemes-plain": lesson_validation_words,
        "lexical-all-plain": lexical_plain,
    }
    for label, rows in evaluation_rows.items():
        path = output / "evaluation" / f"{label}.eng-mic.jsonl"
        write_jsonl_atomic(path, rows)
        outputs[f"evaluation/{label}"] = output_record(path, rows)
    matching_path = output / "ledger" / "token-length-matched-replacements.jsonl"
    write_jsonl_atomic(matching_path, matching_ledger)
    outputs["ledger/token-length-matched-replacements"] = output_record(
        matching_path, matching_ledger
    )

    source_manifest = json.loads(paths["lessons_manifest"].read_text(encoding="utf-8"))
    manifest = {
        "schema_version": 1,
        "dataset_id": "migmaq-v3.2-natural-lessons-schedules-v0.1.0-20260721",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operation": "build_token_accounted_natural_lesson_sentence_schedules",
        "seed": args.seed,
        "direction": "eng-mic",
        "input_contract": "Original v1 unprefixed English sentence input; no task-control strings.",
        "training_contract": {
            "optimizer_updates": 600,
            "effective_batch_size": 32,
            "presentations_per_arm": SCREEN_PRESENTATIONS,
            "arms": {
                "retention": "100% existing source-attested dictionary example sentences",
                "lessons20": "20% Listuguj lesson translations, 80% matched retention",
                "lessons40": "40% Listuguj lesson translations, 60% matched retention",
            },
            "excluded_from_sentence_training": [
                "265 Listuguj lesson lexical rows",
                "all source-dictionary lexical reconstruction rows",
                "all morphology rows",
                "all synthetic rows",
            ],
            "causal_question": (
                "At fixed updates and within 1% target/total token exposure, does replacing retention "
                "replay with independently sourced natural Listuguj lesson translations improve the "
                "new lesson validation domain without materially degrading existing sentence domains?"
            ),
        },
        "token_accounting": {
            "tokenizer_dir": str(tokenizer_dir),
            "tokenizer_json_sha256": sha256(paths["tokenizer_json"]),
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
            label: {"path": str(path), "sha256": sha256(path)} for label, path in paths.items()
        },
        "lesson_source_identity": {
            "repository": source_manifest["source"]["repository"],
            "commit": source_manifest["source"]["commit"],
            "license": source_manifest["source"]["license"]["spdx"],
            "sealed_test_read_by_this_builder": False,
        },
        "evaluation_contract": {
            "existing_validation_rows": len(old_validation),
            "existing_opened_regression_rows": len(old_opened),
            "new_lesson_validation_sentence_rows": len(lesson_validation_sentences),
            "new_lesson_validation_plain_lexeme_rows": len(lesson_validation_words),
            "full_plain_lexical_census_rows": len(lexical_plain),
            "lesson_sealed_test": "not read, copied, inspected, or used for screening",
            "claim_limit": (
                "A screen can select a recipe for multi-seed confirmation only. Lexical diagnostics "
                "cannot authorize or veto the independent sentence-generation gate."
            ),
        },
        "outputs": outputs,
    }
    write_json_atomic(output / "manifest.json", manifest)
    files = sorted(path for path in output.rglob("*") if path.is_file())
    (output / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.relative_to(output)}\n" for path in files),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output_dir": str(output),
                "schedule_audit": schedule_audit,
                "outputs": outputs,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Audit v24 tokenizer behavior and choose near-matched update token budgets."""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--arms", nargs="+", default=["C0", "L1", "L2", "L4"])
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-target-length", type=int, default=208)
    parser.add_argument("--reference-micro-batch-size", type=int, default=8)
    parser.add_argument("--reference-gradient-accumulation", type=int, default=2)
    parser.add_argument("--maximum-micro-batch-size", type=int, default=9)
    parser.add_argument("--maximum-gradient-accumulation", type=int, default=4)
    parser.add_argument("--relative-token-tolerance", type=float, default=0.05)
    parser.add_argument("--planned-max-steps", type=int, default=4_152)
    parser.add_argument("--screen-stop-step", type=int, default=1_384)
    parser.add_argument("--batch-tokenization-size", type=int, default=512)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"expected object at {path}:{line_number}")
            rows.append(row)
    return rows


def chunks(values: list[Any], size: int) -> Iterable[list[Any]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def describe(values: list[int]) -> dict[str, float | int]:
    if not values:
        return {"count": 0, "minimum": 0, "p50": 0, "p95": 0, "maximum": 0, "mean": 0.0}
    ordered = sorted(values)

    def nearest_rank(percent: float) -> int:
        return ordered[max(0, math.ceil(percent * len(ordered)) - 1)]

    return {
        "count": len(values),
        "minimum": ordered[0],
        "p50": nearest_rank(0.50),
        "p95": nearest_rank(0.95),
        "maximum": ordered[-1],
        "mean": statistics.fmean(values),
    }


def choose_update_shape(
    mean_tokens_per_example: float,
    reference_tokens_per_update: float,
    reference_examples_per_update: int,
    maximum_micro_batch_size: int,
    maximum_gradient_accumulation: int,
) -> dict[str, float | int]:
    candidates = []
    for micro_batch_size in range(1, maximum_micro_batch_size + 1):
        for accumulation in range(1, maximum_gradient_accumulation + 1):
            examples = micro_batch_size * accumulation
            tokens = mean_tokens_per_example * examples
            candidates.append(
                (
                    abs(tokens - reference_tokens_per_update),
                    abs(examples - reference_examples_per_update),
                    -micro_batch_size,
                    accumulation,
                    micro_batch_size,
                    examples,
                    tokens,
                )
            )
    _, _, _, accumulation, micro_batch_size, examples, tokens = min(candidates)
    relative_difference = (tokens - reference_tokens_per_update) / reference_tokens_per_update
    return {
        "micro_batch_size": micro_batch_size,
        "gradient_accumulation_steps": accumulation,
        "effective_examples_per_update": examples,
        "estimated_non_padding_tokens_per_update": tokens,
        "relative_difference_from_reference": relative_difference,
    }


def encoded_lengths(
    tokenizer: Any,
    texts: list[str],
    *,
    target: bool,
    maximum: int,
    batch_size: int,
) -> tuple[list[int], list[int]]:
    full_lengths: list[int] = []
    truncated_lengths: list[int] = []
    for batch in chunks(texts, batch_size):
        kwargs = {"text_target": batch} if target else {"text": batch}
        full = tokenizer(**kwargs, truncation=False, padding=False)["input_ids"]
        truncated = tokenizer(**kwargs, truncation=True, max_length=maximum, padding=False)["input_ids"]
        full_lengths.extend(len(token_ids) for token_ids in full)
        truncated_lengths.extend(len(token_ids) for token_ids in truncated)
    return full_lengths, truncated_lengths


def audit_arm(
    tokenizer: Any,
    path: Path,
    max_source_length: int,
    max_target_length: int,
    batch_size: int,
) -> dict[str, Any]:
    rows = read_jsonl(path)
    sources = [" ".join(str(row.get("input_text", "")).split()) for row in rows]
    targets = [" ".join(str(row.get("output_text", "")).split()) for row in rows]
    if any(not text for text in sources) or any(not text for text in targets):
        raise ValueError(f"blank source or target in {path}")
    source_full, source_used = encoded_lengths(
        tokenizer,
        sources,
        target=False,
        maximum=max_source_length,
        batch_size=batch_size,
    )
    target_full, target_used = encoded_lengths(
        tokenizer,
        targets,
        target=True,
        maximum=max_target_length,
        batch_size=batch_size,
    )
    non_padding = [source + target for source, target in zip(source_used, target_used, strict=True)]
    by_task: dict[str, dict[str, list[int]]] = defaultdict(
        lambda: {"source": [], "target": [], "non_padding": []}
    )
    for row, source, target, combined in zip(rows, source_used, target_used, non_padding, strict=True):
        task = str(row.get("pair_kind") or row.get("task") or "unclassified")
        by_task[task]["source"].append(source)
        by_task[task]["target"].append(target)
        by_task[task]["non_padding"].append(combined)
    return {
        "path": str(path.resolve()),
        "sha256": sha256(path),
        "rows": len(rows),
        "source_tokens": describe(source_used),
        "target_tokens": describe(target_used),
        "non_padding_tokens": describe(non_padding),
        "total_non_padding_tokens_per_full_pass": sum(non_padding),
        "source_rows_truncated": sum(full > used for full, used in zip(source_full, source_used, strict=True)),
        "target_rows_truncated": sum(full > used for full, used in zip(target_full, target_used, strict=True)),
        "by_task": {
            task: {
                "source_tokens": describe(values["source"]),
                "target_tokens": describe(values["target"]),
                "non_padding_tokens": describe(values["non_padding"]),
            }
            for task, values in sorted(by_task.items())
        },
    }


def audit_lexicon(tokenizer: Any, path: Path) -> dict[str, Any]:
    rows = read_jsonl(path)
    source_fertility: list[float] = []
    target_fertility: list[float] = []
    target_unknown_tokens = 0
    target_tokens = 0
    for row in rows:
        source = str(row["unconditioned_input_text"])
        target = str(row["output_text"])
        source_ids = tokenizer(source, add_special_tokens=False)["input_ids"]
        target_ids = tokenizer(text_target=target, add_special_tokens=False)["input_ids"]
        source_words = max(1, len(source.split()))
        target_words = max(1, len(target.split()))
        source_fertility.append(len(source_ids) / source_words)
        target_fertility.append(len(target_ids) / target_words)
        target_tokens += len(target_ids)
        target_unknown_tokens += sum(token_id == tokenizer.unk_token_id for token_id in target_ids)
    return {
        "path": str(path.resolve()),
        "sha256": sha256(path),
        "rows": len(rows),
        "source_subwords_per_whitespace_word": {
            "minimum": min(source_fertility),
            "mean": statistics.fmean(source_fertility),
            "maximum": max(source_fertility),
        },
        "target_subwords_per_whitespace_word": {
            "minimum": min(target_fertility),
            "mean": statistics.fmean(target_fertility),
            "maximum": max(target_fertility),
        },
        "target_unknown_tokens": target_unknown_tokens,
        "target_tokens": target_tokens,
        "target_unknown_token_rate": target_unknown_tokens / target_tokens if target_tokens else 0.0,
    }


def write_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, indent=2, ensure_ascii=False, sort_keys=True)
        handle.write("\n")
    try:
        temporary.replace(path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def main() -> None:
    from transformers import AutoTokenizer

    args = parse_args()
    if args.reference_micro_batch_size < 1 or args.reference_gradient_accumulation < 1:
        raise SystemExit("batch and accumulation values must be positive")
    if not 0 <= args.relative_token_tolerance < 1:
        raise SystemExit("--relative-token-tolerance must be in [0, 1)")
    if not 0 < args.screen_stop_step <= args.planned_max_steps:
        raise SystemExit("screen stop step must be positive and no greater than planned max steps")
    if not (args.dataset_root / "BUILD_COMPLETE").is_file():
        raise SystemExit("dataset is not marked BUILD_COMPLETE")

    tokenizer = AutoTokenizer.from_pretrained(
        str(args.tokenizer),
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        local_files_only=True,
    )
    target_lang_id = tokenizer.convert_tokens_to_ids(args.target_lang)
    if target_lang_id == tokenizer.unk_token_id:
        raise SystemExit(f"target language token is absent: {args.target_lang}")

    arms: dict[str, Any] = {}
    for arm in args.arms:
        path = args.dataset_root / "arms" / arm / "train.eng-gvn.jsonl"
        if not path.is_file():
            raise FileNotFoundError(path)
        arms[arm] = audit_arm(
            tokenizer,
            path,
            args.max_source_length,
            args.max_target_length,
            args.batch_tokenization_size,
        )

    reference_arm = args.arms[0]
    reference_mean = float(arms[reference_arm]["non_padding_tokens"]["mean"])
    reference_examples_per_update = (
        args.reference_micro_batch_size * args.reference_gradient_accumulation
    )
    reference_tokens_per_update = (
        reference_mean * reference_examples_per_update
    )
    schedule = {}
    for arm in args.arms:
        selected = choose_update_shape(
            float(arms[arm]["non_padding_tokens"]["mean"]),
            reference_tokens_per_update,
            reference_examples_per_update,
            args.maximum_micro_batch_size,
            args.maximum_gradient_accumulation,
        )
        selected["estimated_non_padding_tokens_at_screen_stop"] = (
            float(selected["estimated_non_padding_tokens_per_update"]) * args.screen_stop_step
        )
        selected["estimated_non_padding_tokens_at_planned_horizon"] = (
            float(selected["estimated_non_padding_tokens_per_update"]) * args.planned_max_steps
        )
        selected["within_relative_tolerance"] = (
            abs(float(selected["relative_difference_from_reference"])) <= args.relative_token_tolerance
        )
        schedule[arm] = selected

    config = json.loads((args.tokenizer / "config.json").read_text(encoding="utf-8"))
    generation_config = json.loads(
        (args.tokenizer / "generation_config.json").read_text(encoding="utf-8")
    )
    result = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if all(item["within_relative_tolerance"] for item in schedule.values()) else "FAIL",
        "dataset": {
            "root": str(args.dataset_root.resolve()),
            "manifest_sha256": sha256(args.dataset_root / "MANIFEST.json"),
        },
        "tokenizer": {
            "root": str(args.tokenizer.resolve()),
            "tokenizer_json_sha256": sha256(args.tokenizer / "tokenizer.json"),
            "source_lang": args.source_lang,
            "target_lang": args.target_lang,
            "target_lang_token_id": target_lang_id,
            "config_forced_bos_token_id": config.get("forced_bos_token_id"),
            "generation_config_forced_bos_token_id": generation_config.get("forced_bos_token_id"),
            "forced_bos_matches_target": (
                config.get("forced_bos_token_id") in (None, target_lang_id)
                and generation_config.get("forced_bos_token_id") == target_lang_id
            ),
            "lexeme_prefix_tokens": tokenizer.tokenize("<lexeme>"),
            "lexeme_prefix_token_ids": tokenizer("<lexeme>", add_special_tokens=False)["input_ids"],
            "lexeme_prefix_is_new_special_token": tokenizer.convert_tokens_to_ids("<lexeme>") != tokenizer.unk_token_id,
        },
        "limits": {
            "max_source_length": args.max_source_length,
            "max_target_length": args.max_target_length,
        },
        "arms": arms,
        "lexicon": audit_lexicon(
            tokenizer,
            args.dataset_root / "lexicon" / "trainable-pairs.eng-gvn.jsonl",
        ),
        "matched_update_schedule": {
            "reference_arm": reference_arm,
            "reference_micro_batch_size": args.reference_micro_batch_size,
            "reference_gradient_accumulation": args.reference_gradient_accumulation,
            "reference_effective_examples_per_update": reference_examples_per_update,
            "maximum_micro_batch_size": args.maximum_micro_batch_size,
            "maximum_gradient_accumulation": args.maximum_gradient_accumulation,
            "reference_non_padding_tokens_per_update": reference_tokens_per_update,
            "planned_max_steps": args.planned_max_steps,
            "screen_stop_step": args.screen_stop_step,
            "relative_token_tolerance": args.relative_token_tolerance,
            "arms": schedule,
            "interpretation": (
                "Estimated from complete post-truncation inventories. The trainer must record actual per-forward "
                "exposure, and the run gate must reject arms outside this tolerance."
            ),
        },
    }
    if not result["tokenizer"]["forced_bos_matches_target"]:
        result["status"] = "FAIL"
    write_atomic(args.output, result)
    print(json.dumps({"status": result["status"], "schedule": schedule}, indent=2))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()

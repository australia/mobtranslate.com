#!/usr/bin/env python3
"""Evaluate one compact NLLB adapter under a frozen, multi-suite screen contract."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import tempfile
import time
import unicodedata
from typing import Any, Callable, Iterable, Sequence


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
TASK_PREFIXES = ("<lexeme>", "<translate>", "<glossary>")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-base-model", type=Path, required=True)
    parser.add_argument("--control-contract", type=Path, required=True)
    parser.add_argument("--expected-control-contract-sha256", required=True)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--training-manifest", type=Path, required=True)
    parser.add_argument("--expected-training-global-step", type=int, required=True)
    parser.add_argument("--tokenizer-extension-manifest", type=Path)
    parser.add_argument("--expected-tokenizer-extension-manifest-sha256")
    parser.add_argument("--token-id-remap", type=Path)
    parser.add_argument("--new-piece-map", type=Path)
    parser.add_argument("--trainable-token-spec", type=Path)
    parser.add_argument("--expected-trainable-token-spec-sha256")
    parser.add_argument("--expected-trainable-token", action="append", default=[])
    parser.add_argument(
        "--suite",
        action="append",
        required=True,
        help="One unique suite name and JSONL path in NAME=PATH form.",
    )
    parser.add_argument("--exposure-ledger", type=Path)
    parser.add_argument("--exposure-population", choices=("C0", "S0", "L0", "J0"))
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--direction", default="eng-wbv")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="wbv_Latn")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--max-source-length", type=int, default=64)
    parser.add_argument("--max-new-tokens", type=int, default=32)
    parser.add_argument(
        "--claim-scope",
        default=(
            "Development-only closed-set reconstruction and controlled synthetic "
            "diagnostics; not independent natural translation evidence."
        ),
    )
    parser.add_argument(
        "--dtype", choices=("float32", "float16", "bfloat16"), default="bfloat16"
    )
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--max-rows-per-suite", type=int)
    parser.add_argument(
        "--progress-jsonl",
        type=Path,
        help=(
            "Optional fsync-backed progress ledger outside the atomic evaluation "
            "output directory. Generation is unchanged."
        ),
    )
    parser.add_argument("--require-cuda", action="store_true")
    parser.add_argument(
        "--require-merge-equivalence",
        action=argparse.BooleanOptionalAction,
        default=True,
    )
    parser.add_argument(
        "--paired-disabled-adapter-baseline",
        action=argparse.BooleanOptionalAction,
        default=True,
        help=(
            "Generate the paired disabled-adapter engineering baseline. Disable only "
            "when an earlier bound run already established this checkpoint's engineering "
            "comparison and the current run is an active-model linguistic census."
        ),
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def count_nonblank_lines(path: Path) -> int:
    with path.open(encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def canonical_json_sha256(value: Any) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def directory_identity(path: Path) -> dict[str, Any]:
    files = {
        item.relative_to(path).as_posix(): {
            "bytes": item.stat().st_size,
            "sha256": sha256_file(item),
        }
        for item in sorted(path.rglob("*"))
        if item.is_file()
    }
    return {
        "algorithm": "sha256(canonical_json_relative_path_to_bytes_and_sha256)",
        "aggregate_sha256": canonical_json_sha256(files),
        "file_count": len(files),
        "total_bytes": sum(row["bytes"] for row in files.values()),
        "files": files,
    }


def normalize(value: Any) -> str:
    text = (
        unicodedata.normalize("NFKC", str(value or "")).translate(QUOTE_FOLD).casefold()
    )
    return " ".join(text.split())


def source_preserving(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def source_without_task_prefix(value: Any) -> str:
    text = source_preserving(value)
    for prefix in TASK_PREFIXES:
        if text == prefix:
            return ""
        if text.startswith(prefix + " "):
            return text[len(prefix) + 1 :]
    return text


def graphemes(value: str) -> list[str]:
    import regex

    return regex.findall(r"\X", value)


def edit_distance(left: Sequence[Any], right: Sequence[Any]) -> int:
    if len(left) > len(right):
        left, right = right, left
    previous = list(range(len(left) + 1))
    for right_index, right_item in enumerate(right, start=1):
        current = [right_index]
        for left_index, left_item in enumerate(left, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[left_index] + 1,
                    previous[left_index - 1] + (left_item != right_item),
                )
            )
        previous = current
    return previous[-1]


def error_rate(prediction: Sequence[Any], reference: Sequence[Any]) -> float:
    return edit_distance(prediction, reference) / max(1, len(reference))


def minimum_error_rate(prediction: str, references: list[str], *, units: str) -> float:
    transform = graphemes if units == "grapheme" else list
    return min(
        error_rate(transform(prediction), transform(reference))
        for reference in references
    )


def classify_surface(prediction: str, references: list[str], source: str) -> str:
    if not prediction:
        return "blank"
    source_candidates = {
        normalize(source),
        normalize(source_without_task_prefix(source)),
    } - {""}
    if prediction in source_candidates:
        return "source_copy"
    if prediction in references:
        return "exact"
    best = min(
        references,
        key=lambda value: error_rate(graphemes(prediction), graphemes(value)),
    )
    ratio = len(graphemes(prediction)) / max(1, len(graphemes(best)))
    distance = error_rate(graphemes(prediction), graphemes(best))
    if prediction in best or ratio < 0.60:
        return "under_generation_surface"
    if best in prediction or ratio > 1.50:
        return "over_generation_surface"
    if distance <= 0.25:
        return "near_surface_form"
    return "different_surface_form"


def contains_repeated_ngram(values: list[int], size: int = 4) -> bool:
    if len(values) < size * 2:
        return False
    seen: set[tuple[int, ...]] = set()
    for index in range(len(values) - size + 1):
        ngram = tuple(values[index : index + size])
        if ngram in seen:
            return True
        seen.add(ngram)
    return False


def parse_suite_arguments(values: list[str]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for value in values:
        name, separator, path_text = value.partition("=")
        name = name.strip()
        if not separator or not name or not path_text.strip():
            raise ValueError(f"invalid --suite value: {value!r}")
        if name in result:
            raise ValueError(f"duplicate suite name: {name!r}")
        result[name] = Path(path_text).expanduser().resolve()
    return result


def accepted_references(row: dict[str, Any]) -> list[str]:
    values = row.get("acceptedReferences") or row.get("accepted_references")
    if values is None:
        values = [row.get("output_text") or row.get("reference")]
    if not isinstance(values, list):
        raise ValueError("accepted references must be a list")
    references = list(
        dict.fromkeys(source_preserving(value) for value in values if value)
    )
    if not references:
        raise ValueError("evaluation row has no reference")
    return references


def read_suite(
    name: str,
    path: Path,
    direction: str,
    max_rows: int | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"suite row is not an object: {path}:{line_number}")
            row_direction = value.get("direction")
            if row_direction is not None and row_direction != direction:
                raise ValueError(f"suite direction drift: {path}:{line_number}")
            row_id = str(value.get("rowId") or value.get("id") or "").strip()
            input_text = str(
                value.get("inputText") or value.get("input_text") or ""
            ).strip()
            if not row_id or not input_text:
                raise ValueError(f"suite row lacks ID or input: {path}:{line_number}")
            rows.append(
                {
                    "evaluation_id": f"{name}:{row_id}",
                    "suite": name,
                    "row_id": row_id,
                    "input_text": input_text,
                    "accepted_references": accepted_references(value),
                    "task": str(value.get("task") or "unspecified"),
                    "pair_kind": str(
                        value.get("pair_kind") or value.get("suiteKey") or name
                    ),
                    "template_id": value.get("template_id"),
                    "construction_family": value.get("construction_family"),
                    "source_record_ids": list(
                        value.get("sourceRecordIds")
                        or value.get("source_record_ids")
                        or []
                    ),
                }
            )
    ids = [row["row_id"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError(f"suite row IDs are not unique: {name}")
    if not rows:
        raise ValueError(f"suite is empty: {name}")
    return rows[:max_rows] if max_rows is not None else rows


def read_exposure_ledger(path: Path, population: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("population") != population:
                continue
            row_id = str(row.get("benchmark_row_id") or "")
            if not row_id or row_id in result:
                raise ValueError(f"invalid exposure row at {path}:{line_number}")
            result[row_id] = {
                "population": population,
                "primary_exposure_class": row["primary_exposure_class"],
                "direct_matching_training_row_count": len(
                    row.get("direct_matching_training_rows") or []
                ),
                "same_prompt_conflict_count": len(
                    row.get("same_prompt_conflicting_training_rows") or []
                ),
                "complete_target_elsewhere_count": len(
                    row.get("complete_target_output_elsewhere_by_reference") or {}
                ),
                "upstream_nllb_pretraining_exposure": row.get(
                    "upstream_nllb_pretraining_exposure"
                ),
            }
    if not result:
        raise ValueError(f"no {population} rows in exposure ledger")
    return result


def join_exposure(rows: list[dict[str, Any]], ledger: dict[str, dict[str, Any]]) -> int:
    joined = 0
    for row in rows:
        exposure = ledger.get(row["row_id"])
        if exposure is None:
            if row["suite"] in {"prompt_group", "source_context"}:
                raise ValueError(
                    f"census row is absent from exposure ledger: {row['row_id']}"
                )
            continue
        row["exposure"] = exposure
        joined += 1
    return joined


def load_expected_trainable_rows(
    args: argparse.Namespace, tokenizer: Any
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if bool(args.trainable_token_spec) != bool(
        args.expected_trainable_token_spec_sha256
    ):
        raise ValueError(
            "trainable-token spec path and expected SHA-256 are required together"
        )
    if args.trainable_token_spec:
        observed = sha256_file(args.trainable_token_spec)
        if observed != args.expected_trainable_token_spec_sha256:
            raise ValueError("trainable-token spec SHA-256 mismatch")
        value = json.loads(args.trainable_token_spec.read_text(encoding="utf-8"))
        rows.extend(
            {
                "token": str(row["token"]),
                "token_id": int(row["token_id"]),
                "selection_source": "hashed_trainable_token_spec",
            }
            for row in value.get("rows") or []
            if row.get("selected_for_gradient_training") is True
        )
    for token in args.expected_trainable_token:
        rows.append(
            {
                "token": token,
                "token_id": int(tokenizer.convert_tokens_to_ids(token)),
                "selection_source": "command_line_contract",
            }
        )
    deduplicated: list[dict[str, Any]] = []
    seen: dict[int, str] = {}
    for row in rows:
        token = row["token"]
        token_id = row["token_id"]
        if tokenizer.convert_ids_to_tokens(token_id) != token:
            raise ValueError(
                f"expected trainable row identity drift: {token!r} ({token_id})"
            )
        if token_id in seen and seen[token_id] != token:
            raise ValueError(f"trainable token ID aliases two strings: {token_id}")
        if token_id not in seen:
            seen[token_id] = token
            deduplicated.append(row)
    if not deduplicated:
        raise ValueError("no expected trainable rows were declared")
    return deduplicated


def verify_training_manifest(path: Path, expected_step: int) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("training_mode") != "lora":
        raise ValueError("training manifest is not a LoRA run")
    observed_step = int(value.get("trainer_state", {}).get("global_step", -1))
    if observed_step != expected_step:
        raise ValueError(
            f"training global step drift: expected={expected_step}, observed={observed_step}"
        )
    adaptation = value.get("token_adaptation") or {}
    gradient = adaptation.get("selective_token_gradient_audit") or {}
    checks = {
        "all_selected_rows_received_nonzero_gradient": gradient.get(
            "all_selected_rows_received_nonzero_gradient"
        )
        is True,
        "all_selected_expected_surfaces_changed": adaptation.get(
            "all_selected_expected_surfaces_changed"
        )
        is True,
        "unselected_selective_surfaces_unchanged": adaptation.get(
            "unselected_selective_surfaces_unchanged"
        )
        is True,
        "selected_rows_missing_expected_updates_empty": not adaptation.get(
            "selected_rows_missing_expected_updates"
        ),
        "selected_rows_with_unexpected_updates_empty": not adaptation.get(
            "selected_rows_with_unexpected_updates"
        ),
    }
    if not all(checks.values()):
        raise ValueError(f"training selective-row hard gate failed: {checks}")
    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "global_step": observed_step,
        "selective_row_checks": checks,
        "actual_training_exposure": value["trainer_state"]["actual_training_exposure"],
        "training_args": value["training_args"],
        "dataset": value["dataset"],
    }


def requested_dtype(name: str, torch: Any) -> Any:
    return {
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }[name]


def content_token_ids(
    sequence: Any,
    *,
    decoder_start_token_id: int,
    target_token_id: int,
    eos_token_id: int,
    pad_token_id: int,
) -> list[int]:
    values = [int(value) for value in sequence.tolist()]
    expected_prefix = [decoder_start_token_id, target_token_id]
    if values[:2] != expected_prefix:
        raise ValueError(
            f"generated sequence has wrong NLLB prefix: expected={expected_prefix}, got={values[:2]}"
        )
    result: list[int] = []
    for value in values[2:]:
        if value in {eos_token_id, pad_token_id}:
            break
        result.append(value)
    return result


def generate_rows(
    model: Any,
    tokenizer: Any,
    rows: list[dict[str, Any]],
    *,
    device: Any,
    batch_size: int,
    max_source_length: int,
    max_new_tokens: int,
    target_token_id: int,
    progress_callback: Callable[[int, int, float], None] | None = None,
) -> tuple[list[dict[str, Any]], float]:
    import torch

    decoder_start_token_id = int(model.config.decoder_start_token_id)
    eos_token_id = int(tokenizer.eos_token_id)
    pad_token_id = int(tokenizer.pad_token_id)
    results: list[dict[str, Any]] = []
    started = time.monotonic()
    for offset in range(0, len(rows), batch_size):
        batch = rows[offset : offset + batch_size]
        encoded = tokenizer(
            [row["input_text"] for row in batch],
            max_length=max_source_length,
            truncation=True,
            padding=True,
            return_tensors="pt",
        ).to(device)
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                forced_bos_token_id=target_token_id,
                do_sample=False,
                num_beams=1,
                max_new_tokens=max_new_tokens,
                no_repeat_ngram_size=0,
                repetition_penalty=1.0,
                length_penalty=1.0,
            )
        decoded = [
            source_preserving(value)
            for value in tokenizer.batch_decode(generated, skip_special_tokens=True)
        ]
        source_lengths = [
            int(value) for value in encoded["attention_mask"].sum(dim=1).tolist()
        ]
        for row, sequence, prediction, source_length in zip(
            batch,
            generated,
            decoded,
            source_lengths,
            strict=True,
        ):
            token_ids = content_token_ids(
                sequence,
                decoder_start_token_id=decoder_start_token_id,
                target_token_id=target_token_id,
                eos_token_id=eos_token_id,
                pad_token_id=pad_token_id,
            )
            normalized_prediction = normalize(prediction)
            normalized_references = [
                normalize(value) for value in row["accepted_references"]
            ]
            strict_prediction = source_preserving(prediction)
            strict_references = [
                source_preserving(value) for value in row["accepted_references"]
            ]
            reference_graphemes = {
                value
                for reference in normalized_references
                for value in graphemes(reference)
                if not value.isspace()
            }
            outside = sorted(
                {
                    value
                    for value in graphemes(normalized_prediction)
                    if not value.isspace() and value not in reference_graphemes
                }
            )
            results.append(
                {
                    **row,
                    "prediction": prediction,
                    "normalized_prediction": normalized_prediction,
                    "normalized_references": normalized_references,
                    "normalized_exact": normalized_prediction in normalized_references,
                    "strict_source_preserved_exact": strict_prediction
                    in strict_references,
                    "grapheme_cluster_error_rate": minimum_error_rate(
                        normalized_prediction,
                        normalized_references,
                        units="grapheme",
                    ),
                    "code_point_character_error_rate": minimum_error_rate(
                        normalized_prediction,
                        normalized_references,
                        units="code_point",
                    ),
                    "surface_class": classify_surface(
                        normalized_prediction,
                        normalized_references,
                        row["input_text"],
                    ),
                    "blank_output": not normalized_prediction,
                    "normalized_source_copy": normalized_prediction
                    in {
                        normalize(row["input_text"]),
                        normalize(source_without_task_prefix(row["input_text"])),
                    }
                    - {""},
                    "repeated_output_token_4gram": contains_repeated_ngram(
                        token_ids, 4
                    ),
                    "outside_reference_graphemes": outside,
                    "source_token_count": source_length,
                    "prediction_token_count": len(token_ids),
                    "minimum_reference_token_count": min(
                        len(tokenizer.encode(value, add_special_tokens=False))
                        for value in row["accepted_references"]
                    ),
                    "generated_content_token_ids": token_ids,
                }
            )
        if progress_callback is not None:
            progress_callback(len(results), len(rows), time.monotonic() - started)
    return results, time.monotonic() - started


def compact_metrics(
    rows: list[dict[str, Any]], *, include_chrf: bool
) -> dict[str, Any]:
    total = len(rows)
    exact = sum(bool(row["normalized_exact"]) for row in rows)
    surface = Counter(row["surface_class"] for row in rows)
    result: dict[str, Any] = {
        "rows": total,
        "normalized_exact_count": exact,
        "normalized_exact_rate": exact / total if total else 0.0,
        "strict_source_preserved_exact_count": sum(
            bool(row["strict_source_preserved_exact"]) for row in rows
        ),
        "mean_grapheme_cluster_error_rate": (
            sum(row["grapheme_cluster_error_rate"] for row in rows) / total
            if total
            else 0.0
        ),
        "mean_code_point_character_error_rate": (
            sum(row["code_point_character_error_rate"] for row in rows) / total
            if total
            else 0.0
        ),
        "blank_output_count": sum(bool(row["blank_output"]) for row in rows),
        "normalized_source_copy_count": sum(
            bool(row["normalized_source_copy"]) for row in rows
        ),
        "repeated_output_token_4gram_count": sum(
            bool(row["repeated_output_token_4gram"]) for row in rows
        ),
        "outside_reference_grapheme_row_count": sum(
            bool(row["outside_reference_graphemes"]) for row in rows
        ),
        "surface_class_counts": dict(sorted(surface.items())),
        "mean_source_tokens": sum(row["source_token_count"] for row in rows) / total
        if total
        else 0.0,
        "mean_prediction_tokens": sum(row["prediction_token_count"] for row in rows)
        / total
        if total
        else 0.0,
        "mean_minimum_reference_tokens": sum(
            row["minimum_reference_token_count"] for row in rows
        )
        / total
        if total
        else 0.0,
    }
    if include_chrf and rows:
        import sacrebleu

        metric = sacrebleu.metrics.CHRF(word_order=2)
        score = metric.corpus_score(
            [row["prediction"] for row in rows],
            [[row["accepted_references"][0] for row in rows]],
        )
        result["chrf_plus_plus_first_declared_reference"] = score.score
        result["chrf_plus_plus_signature"] = str(metric.get_signature())
        result["chrf_reference_policy"] = "first_declared_reference"
    return result


def grouped_metrics(rows: list[dict[str, Any]], key: str) -> dict[str, Any]:
    groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        value: Any = row.get(key)
        if key == "exposure_class":
            value = (row.get("exposure") or {}).get("primary_exposure_class")
        groups[str(value if value is not None else "none")].append(row)
    return {
        name: compact_metrics(group, include_chrf=False)
        for name, group in sorted(groups.items())
    }


def paired_decoder_regression(
    disabled_adapter_rows: list[dict[str, Any]],
    candidate_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    if len(disabled_adapter_rows) != len(candidate_rows):
        raise ValueError("disabled-adapter and candidate row counts differ")

    changed: list[str] = []
    newly_blank: list[str] = []
    resolved_blank: list[str] = []
    newly_repeated: list[str] = []
    resolved_repeated: list[str] = []
    evaluation_ids: list[str] = []
    for baseline, candidate in zip(disabled_adapter_rows, candidate_rows, strict=True):
        evaluation_id = str(candidate["evaluation_id"])
        if str(baseline["evaluation_id"]) != evaluation_id:
            raise ValueError("disabled-adapter and candidate evaluation order differs")
        evaluation_ids.append(evaluation_id)
        if (
            baseline["generated_content_token_ids"]
            != candidate["generated_content_token_ids"]
        ):
            changed.append(evaluation_id)
        if candidate["blank_output"] and not baseline["blank_output"]:
            newly_blank.append(evaluation_id)
        if baseline["blank_output"] and not candidate["blank_output"]:
            resolved_blank.append(evaluation_id)
        if (
            candidate["repeated_output_token_4gram"]
            and not baseline["repeated_output_token_4gram"]
        ):
            newly_repeated.append(evaluation_id)
        if (
            baseline["repeated_output_token_4gram"]
            and not candidate["repeated_output_token_4gram"]
        ):
            resolved_repeated.append(evaluation_id)

    return {
        "schema_version": 1,
        "comparison": "disabled_adapter_baseline_vs_active_adapter",
        "rows": len(candidate_rows),
        "evaluation_order_sha256": canonical_json_sha256(evaluation_ids),
        "token_identical_rows": len(candidate_rows) - len(changed),
        "changed_token_rows": len(changed),
        "changed_evaluation_ids": changed,
        "disabled_adapter_blank_output_count": sum(
            bool(row["blank_output"]) for row in disabled_adapter_rows
        ),
        "candidate_blank_output_count": sum(
            bool(row["blank_output"]) for row in candidate_rows
        ),
        "newly_blank_evaluation_ids": newly_blank,
        "resolved_blank_evaluation_ids": resolved_blank,
        "disabled_adapter_repeated_output_token_4gram_count": sum(
            bool(row["repeated_output_token_4gram"]) for row in disabled_adapter_rows
        ),
        "candidate_repeated_output_token_4gram_count": sum(
            bool(row["repeated_output_token_4gram"]) for row in candidate_rows
        ),
        "newly_repeated_output_token_4gram_evaluation_ids": newly_repeated,
        "resolved_repeated_output_token_4gram_evaluation_ids": resolved_repeated,
        "no_new_blank_outputs": not newly_blank,
        "no_new_repeated_output_token_4grams": not newly_repeated,
        "status": "PASS" if not newly_blank and not newly_repeated else "FAIL",
    }


def merge_prediction_regression(
    adapter_rows: list[dict[str, Any]], merged_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    """Record merge drift without discarding the checkpoint's other evidence."""
    adapter_ids = [row["evaluation_id"] for row in adapter_rows]
    merged_ids = [row["evaluation_id"] for row in merged_rows]
    if adapter_ids != merged_ids:
        raise ValueError("adapter and merged probe evaluation order differs")

    mismatches: list[dict[str, Any]] = []
    for adapter, merged in zip(adapter_rows, merged_rows, strict=True):
        adapter_tokens = list(adapter["generated_content_token_ids"])
        merged_tokens = list(merged["generated_content_token_ids"])
        if adapter_tokens == merged_tokens:
            continue
        mismatches.append(
            {
                "evaluation_id": adapter["evaluation_id"],
                "input_text": adapter["input_text"],
                "adapter_prediction": adapter["prediction"],
                "adapter_generated_content_token_ids": adapter_tokens,
                "merged_prediction": merged["prediction"],
                "merged_generated_content_token_ids": merged_tokens,
            }
        )

    return {
        "status": "PASS" if not mismatches else "FAIL",
        "probe_rows": len(adapter_rows),
        "token_identical": not mismatches,
        "token_identical_rows": len(adapter_rows) - len(mismatches),
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
    }


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


class ProgressReporter:
    """Emit bounded, durable progress without changing model execution."""

    def __init__(
        self,
        path: Path,
        invocation_id: str,
        *,
        minimum_row_delta: int = 100,
    ) -> None:
        self.path = path
        self.invocation_id = invocation_id
        self.minimum_row_delta = minimum_row_delta
        self.last_rows_by_phase: dict[str, int] = {}

    def emit(self, event: str, **values: Any) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "event": event,
            "at": utc_now(),
            "invocation_id": self.invocation_id,
            **values,
        }
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())

    def generation_callback(self, phase: str) -> Callable[[int, int, float], None]:
        def report(
            rows_completed: int, rows_total: int, elapsed_seconds: float
        ) -> None:
            previous = self.last_rows_by_phase.get(phase, 0)
            if (
                rows_completed != rows_total
                and rows_completed - previous < self.minimum_row_delta
            ):
                return
            self.last_rows_by_phase[phase] = rows_completed
            self.emit(
                "GENERATION_PROGRESS",
                phase=phase,
                rows_completed=rows_completed,
                rows_total=rows_total,
                elapsed_seconds=elapsed_seconds,
                rows_per_second=(
                    rows_completed / elapsed_seconds if elapsed_seconds > 0 else None
                ),
            )

        return report


def main() -> None:
    args = parse_args()
    if args.batch_size < 1 or args.max_source_length < 1 or args.max_new_tokens < 1:
        raise SystemExit("batch and length controls must be positive")
    if args.expected_training_global_step < 1:
        raise SystemExit("expected training step must be positive")
    if args.max_rows_per_suite is not None and args.max_rows_per_suite < 1:
        raise SystemExit("max rows per suite must be positive")
    if bool(args.exposure_ledger) != bool(args.exposure_population):
        raise SystemExit("exposure ledger and population are required together")
    extension_values = (
        args.tokenizer_extension_manifest,
        args.expected_tokenizer_extension_manifest_sha256,
        args.token_id_remap,
        args.new_piece_map,
    )
    if any(extension_values) and not all(extension_values):
        raise SystemExit("all tokenizer-extension arguments are required together")
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing evaluation output: {output_dir}")
    progress_path = (
        args.progress_jsonl.expanduser().resolve() if args.progress_jsonl else None
    )
    if progress_path is not None:
        try:
            progress_path.relative_to(output_dir)
        except ValueError:
            pass
        else:
            raise ValueError("progress ledger must be outside atomic output directory")

    suites = parse_suite_arguments(args.suite)
    rows: list[dict[str, Any]] = []
    suite_manifest: dict[str, Any] = {}
    for name, path in suites.items():
        suite_rows = read_suite(name, path, args.direction, args.max_rows_per_suite)
        rows.extend(suite_rows)
        suite_manifest[name] = {
            "path": str(path),
            "sha256": sha256_file(path),
            "full_rows": count_nonblank_lines(path),
            "evaluated_rows": len(suite_rows),
        }
    evaluation_ids = [row["evaluation_id"] for row in rows]
    if len(evaluation_ids) != len(set(evaluation_ids)):
        raise ValueError("evaluation IDs are not globally unique")
    invocation_id = hashlib.sha256(
        f"{utc_now()}|{os.getpid()}|{output_dir}".encode("utf-8")
    ).hexdigest()[:24]
    progress = (
        ProgressReporter(progress_path, invocation_id)
        if progress_path is not None
        else None
    )
    if progress is not None:
        progress.emit(
            "EVALUATOR_STARTED",
            evaluator_sha256=sha256_file(Path(__file__).resolve()),
            output_dir=str(output_dir),
            rows=len(rows),
            suites=sorted(suites),
        )
    exposure_joined = 0
    exposure_identity = None
    if args.exposure_ledger:
        ledger_path = args.exposure_ledger.expanduser().resolve()
        ledger = read_exposure_ledger(ledger_path, args.exposure_population)
        exposure_joined = join_exposure(rows, ledger)
        exposure_identity = {
            "path": str(ledger_path),
            "sha256": sha256_file(ledger_path),
            "population": args.exposure_population,
            "population_rows": len(ledger),
            "evaluation_rows_joined": exposure_joined,
        }

    raw_base = args.raw_base_model.expanduser().resolve()
    control_contract = args.control_contract.expanduser().resolve()
    adapter_dir = args.adapter_dir.expanduser().resolve()
    training_manifest = args.training_manifest.expanduser().resolve()
    for path in (raw_base, control_contract, adapter_dir):
        if not path.is_dir():
            raise FileNotFoundError(path)
    if not training_manifest.is_file():
        raise FileNotFoundError(training_manifest)
    training_audit = verify_training_manifest(
        training_manifest,
        args.expected_training_global_step,
    )
    adapter_identity = directory_identity(adapter_dir)

    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    import torch
    import transformers

    try:
        from .nllb_peft_artifact import (
            canonicalize_nllb_input_embeddings,
            load_control_contract_nllb_adapter,
            trainable_token_wrapper_audit,
        )
    except ImportError:
        from nllb_peft_artifact import (
            canonicalize_nllb_input_embeddings,
            load_control_contract_nllb_adapter,
            trainable_token_wrapper_audit,
        )

    if args.require_cuda and not torch.cuda.is_available():
        raise SystemExit("CUDA is required but unavailable")
    if (
        args.dtype == "bfloat16"
        and torch.cuda.is_available()
        and not torch.cuda.is_bf16_supported()
    ):
        raise SystemExit("bfloat16 was requested but is unsupported")
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
    torch.use_deterministic_algorithms(True)
    dtype = requested_dtype(args.dtype, torch)

    load_started = time.monotonic()
    tokenizer, adapter_model, load_audit = load_control_contract_nllb_adapter(
        raw_base,
        control_contract,
        adapter_dir,
        expected_control_contract_sha256=args.expected_control_contract_sha256,
        source_lang=args.source_lang,
        target_lang=args.target_lang,
        torch_dtype=dtype,
        tokenizer_extension_manifest_path=args.tokenizer_extension_manifest,
        expected_tokenizer_extension_manifest_sha256=(
            args.expected_tokenizer_extension_manifest_sha256
        ),
        token_id_remap_path=args.token_id_remap,
        new_piece_map_path=args.new_piece_map,
        local_files_only=True,
    )
    load_seconds = time.monotonic() - load_started
    if progress is not None:
        progress.emit("MODEL_LOADED", load_seconds=load_seconds)
    expected_rows = load_expected_trainable_rows(args, tokenizer)
    wrapper_audit = trainable_token_wrapper_audit(adapter_model)
    expected_ids = [row["token_id"] for row in expected_rows]
    expected_wrapper_suffixes = {
        "model.shared",
        "model.encoder.embed_tokens",
        "model.decoder.embed_tokens",
        "lm_head",
    }
    observed_suffixes = {
        suffix
        for suffix in expected_wrapper_suffixes
        if any(row["module"].endswith(suffix) for row in wrapper_audit["wrappers"])
    }
    if (
        wrapper_audit["wrapper_count"] != 4
        or not wrapper_audit["all_wrappers_share_one_index_set"]
        or wrapper_audit["unique_token_index_sets"] != [expected_ids]
        or observed_suffixes != expected_wrapper_suffixes
    ):
        raise ValueError(
            "adapter trainable-token topology does not match the frozen rows: "
            f"expected={expected_ids}, observed={wrapper_audit}"
        )

    target_token_id = int(tokenizer.convert_tokens_to_ids(args.target_lang))
    source_token_id = int(tokenizer.convert_tokens_to_ids(args.source_lang))
    if tokenizer.encode(args.target_lang, add_special_tokens=False) != [
        target_token_id
    ]:
        raise ValueError("target language token does not encode as one exact ID")
    if tokenizer.encode(args.source_lang, add_special_tokens=False) != [
        source_token_id
    ]:
        raise ValueError("source language token does not encode as one exact ID")
    decoder_start_token_id = int(adapter_model.config.decoder_start_token_id)
    if decoder_start_token_id != int(tokenizer.eos_token_id):
        raise ValueError("decoder start token is not tokenizer EOS")
    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang
    adapter_model.config.forced_bos_token_id = target_token_id
    adapter_model.generation_config.forced_bos_token_id = target_token_id
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    adapter_model.to(device)
    adapter_model.eval()

    disabled_adapter_predictions: list[dict[str, Any]] = []
    disabled_adapter_generation_seconds: float | None = None
    if args.paired_disabled_adapter_baseline:
        enabled_before = adapter_model.get_model_status().enabled
        with adapter_model.disable_adapter():
            enabled_inside = adapter_model.get_model_status().enabled
            disabled_adapter_predictions, disabled_adapter_generation_seconds = (
                generate_rows(
                    adapter_model,
                    tokenizer,
                    rows,
                    device=device,
                    batch_size=args.batch_size,
                    max_source_length=args.max_source_length,
                    max_new_tokens=args.max_new_tokens,
                    target_token_id=target_token_id,
                    progress_callback=(
                        progress.generation_callback("disabled_adapter")
                        if progress is not None
                        else None
                    ),
                )
            )
        enabled_after = adapter_model.get_model_status().enabled
        disabled_adapter_audit = {
            "status": "PASS",
            "required": True,
            "method": "PeftModel.disable_adapter",
            "enabled_before": enabled_before,
            "enabled_inside": enabled_inside,
            "enabled_after": enabled_after,
            "rows": len(disabled_adapter_predictions),
        }
        if (
            enabled_before is not True
            or enabled_inside is not False
            or enabled_after is not True
        ):
            raise ValueError(
                "disabled-adapter control state transition failed: "
                f"{disabled_adapter_audit}"
            )
    else:
        disabled_adapter_audit = {
            "status": "NOT_RUN",
            "required": False,
            "method": "PeftModel.disable_adapter",
            "reason": "active-model linguistic census only",
            "rows": 0,
        }

    predictions, generation_seconds = generate_rows(
        adapter_model,
        tokenizer,
        rows,
        device=device,
        batch_size=args.batch_size,
        max_source_length=args.max_source_length,
        max_new_tokens=args.max_new_tokens,
        target_token_id=target_token_id,
        progress_callback=(
            progress.generation_callback("active_adapter")
            if progress is not None
            else None
        ),
    )
    if args.paired_disabled_adapter_baseline:
        paired_regression: dict[str, Any] = paired_decoder_regression(
            disabled_adapter_predictions, predictions
        )
    else:
        paired_regression = {
            "schema_version": 1,
            "status": "NOT_RUN",
            "comparison": "disabled_adapter_baseline_vs_active_adapter",
            "reason": "active-model linguistic census only",
            "rows": len(predictions),
            "no_new_blank_outputs": None,
            "no_new_repeated_output_token_4grams": None,
        }

    probes: list[dict[str, Any]] = []
    seen_suites: set[str] = set()
    for row in rows:
        if row["suite"] not in seen_suites:
            probes.append(row)
            seen_suites.add(row["suite"])
        if len(probes) >= 8:
            break
    active_by_evaluation_id = {row["evaluation_id"]: row for row in predictions}
    adapter_probe = [active_by_evaluation_id[row["evaluation_id"]] for row in probes]
    merge_audit: dict[str, Any] = {"required": args.require_merge_equivalence}
    if args.require_merge_equivalence:
        merged = adapter_model.merge_and_unload(safe_merge=True)
        merge_audit["input_alias_canonicalization"] = (
            canonicalize_nllb_input_embeddings(merged)
        )
        merged.config.forced_bos_token_id = target_token_id
        merged.generation_config.forced_bos_token_id = target_token_id
        merged.to(device)
        merged.eval()
        merged_probe, merged_probe_seconds = generate_rows(
            merged,
            tokenizer,
            probes,
            device=device,
            batch_size=min(args.batch_size, len(probes)),
            max_source_length=args.max_source_length,
            max_new_tokens=args.max_new_tokens,
            target_token_id=target_token_id,
            progress_callback=(
                progress.generation_callback("merged_probe")
                if progress is not None
                else None
            ),
        )
        merge_regression = merge_prediction_regression(adapter_probe, merged_probe)
        merge_audit.update(
            {
                **merge_regression,
                "adapter_probe_source": "full_active_adapter_generation",
                "merged_probe_seconds": merged_probe_seconds,
            }
        )
        evaluation_model = merged
    else:
        merge_audit["status"] = "NOT_RUN"
        evaluation_model = adapter_model

    by_suite: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in predictions:
        by_suite[row["suite"]].append(row)
    metrics = {
        "schema_version": 2,
        "status": "PASS",
        "claim_scope": args.claim_scope,
        "overall_diagnostics": compact_metrics(predictions, include_chrf=False),
        "disabled_adapter_diagnostics": (
            compact_metrics(disabled_adapter_predictions, include_chrf=False)
            if args.paired_disabled_adapter_baseline
            else None
        ),
        "paired_decoder_regression": paired_regression,
        "by_suite": {
            name: compact_metrics(group, include_chrf=True)
            for name, group in sorted(by_suite.items())
        },
        "by_task": grouped_metrics(predictions, "task"),
        "by_pair_kind": grouped_metrics(predictions, "pair_kind"),
        "by_exposure_class": grouped_metrics(
            [row for row in predictions if row.get("exposure")],
            "exposure_class",
        ),
        "by_template": grouped_metrics(
            [row for row in predictions if row.get("template_id")],
            "template_id",
        ),
        "hard_gates": {
            "all_candidate_rows_scored": len(predictions) == len(rows),
            "all_candidate_and_disabled_adapter_rows_scored": (
                len(predictions) == len(rows) == len(disabled_adapter_predictions)
                if args.paired_disabled_adapter_baseline
                else None
            ),
            "adapter_merge_token_equivalence": merge_audit.get("token_identical")
            is True
            if args.require_merge_equivalence
            else None,
            "no_new_blank_outputs_vs_disabled_adapter": (
                paired_regression["no_new_blank_outputs"]
                if args.paired_disabled_adapter_baseline
                else None
            ),
            "no_new_repeated_output_token_4grams_vs_disabled_adapter": (
                paired_regression["no_new_repeated_output_token_4grams"]
                if args.paired_disabled_adapter_baseline
                else None
            ),
        },
        "absolute_quality_gates": {
            "zero_blank_outputs": not any(row["blank_output"] for row in predictions),
            "zero_repeated_output_token_4grams": not any(
                row["repeated_output_token_4gram"] for row in predictions
            ),
        },
        "timing": {
            "load_seconds": load_seconds,
            "disabled_adapter_generation_seconds": disabled_adapter_generation_seconds,
            "generation_seconds": generation_seconds,
            "rows_per_second": len(predictions) / generation_seconds,
        },
    }

    environment = {
        "created_at": utc_now(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "transformers": transformers.__version__,
        "cuda": torch.version.cuda,
        "cuda_available": torch.cuda.is_available(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "dtype": str(next(evaluation_model.parameters()).dtype),
        "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
        "cuda_matmul_allow_tf32": torch.backends.cuda.matmul.allow_tf32,
        "cudnn_allow_tf32": torch.backends.cudnn.allow_tf32,
        "packages": {
            name: package_version(name)
            for name in ("peft", "regex", "sacrebleu", "sentencepiece", "tokenizers")
        },
    }
    input_manifest = {
        "schema_version": 1,
        "created_at": utc_now(),
        "evaluator": {
            "path": str(Path(__file__).resolve()),
            "sha256": sha256_file(Path(__file__).resolve()),
        },
        "raw_base_model": str(raw_base),
        "control_contract": {
            "path": str(control_contract / "MANIFEST.json"),
            "sha256": args.expected_control_contract_sha256,
        },
        "adapter": {"path": str(adapter_dir), "identity": adapter_identity},
        "training_manifest": training_audit,
        "tokenizer_extension": {
            "manifest": str(args.tokenizer_extension_manifest)
            if args.tokenizer_extension_manifest
            else None,
            "manifest_sha256": args.expected_tokenizer_extension_manifest_sha256,
            "token_id_remap_sha256": sha256_file(args.token_id_remap)
            if args.token_id_remap
            else None,
            "new_piece_map_sha256": sha256_file(args.new_piece_map)
            if args.new_piece_map
            else None,
        },
        "expected_trainable_rows": expected_rows,
        "suites": suite_manifest,
        "exposure_ledger": exposure_identity,
        "evaluation_contract": {
            "direction": args.direction,
            "source_lang": args.source_lang,
            "target_lang": args.target_lang,
            "batch_size": args.batch_size,
            "max_source_length": args.max_source_length,
            "max_new_tokens": args.max_new_tokens,
            "num_beams": 1,
            "no_repeat_ngram_size": 0,
            "repetition_penalty": 1.0,
            "length_penalty": 1.0,
            "do_sample": False,
            "dtype": args.dtype,
            "seed": args.seed,
            "max_rows_per_suite": args.max_rows_per_suite,
            "independent_final_test_opened": False,
            "disabled_adapter_control": {
                "required": args.paired_disabled_adapter_baseline,
                "method": "PeftModel.disable_adapter",
                "claim": "Paired engineering baseline only; not Wajarri linguistic evidence.",
                "status": (
                    "scheduled"
                    if args.paired_disabled_adapter_baseline
                    else "not_run_active_model_census"
                ),
            },
        },
    }
    load_report = {
        **load_audit,
        "trainable_token_wrapper_audit": wrapper_audit,
        "expected_trainable_rows": expected_rows,
        "merge_equivalence": merge_audit,
        "disabled_adapter_baseline": disabled_adapter_audit,
        "decoder_start_token_id": decoder_start_token_id,
        "source_language_token_id": source_token_id,
        "target_language_token_id": target_token_id,
    }

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=output_dir.parent)
    )
    try:
        if args.paired_disabled_adapter_baseline:
            write_jsonl(
                temporary / "DISABLED-ADAPTER-PREDICTIONS.jsonl",
                disabled_adapter_predictions,
            )
        write_jsonl(temporary / "PREDICTIONS.jsonl", predictions)
        write_json(temporary / "METRICS.json", metrics)
        write_json(temporary / "LOAD-AUDIT.json", load_report)
        write_json(temporary / "INPUT-MANIFEST.json", input_manifest)
        write_json(temporary / "ENVIRONMENT.json", environment)
        write_json(
            temporary / "RUN-COMPLETE.json",
            {
                "status": "PASS",
                "rows": len(predictions),
                "completed_at": utc_now(),
                "hard_gates": metrics["hard_gates"],
                "absolute_quality_gates": metrics["absolute_quality_gates"],
                "claim_scope": metrics["claim_scope"],
            },
        )
        output_files = [
            temporary / name
            for name in (
                "ENVIRONMENT.json",
                "INPUT-MANIFEST.json",
                "LOAD-AUDIT.json",
                "METRICS.json",
                "PREDICTIONS.jsonl",
                "RUN-COMPLETE.json",
            )
        ]
        if args.paired_disabled_adapter_baseline:
            output_files.append(temporary / "DISABLED-ADAPTER-PREDICTIONS.jsonl")
        output_files.sort(key=lambda path: path.name)
        (temporary / "OUTPUT-SHA256SUMS").write_text(
            "".join(f"{sha256_file(path)}  {path.name}\n" for path in output_files),
            encoding="utf-8",
        )
        temporary.rename(output_dir)
        if progress is not None:
            progress.emit(
                "EVALUATOR_COMPLETE",
                rows=len(predictions),
                generation_seconds=generation_seconds,
                output_dir=str(output_dir),
                output_inventory_sha256=sha256_file(output_dir / "OUTPUT-SHA256SUMS"),
            )
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    print(json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

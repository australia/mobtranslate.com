#!/usr/bin/env python3
"""Evaluate one Wajarri adapter over every frozen v2 benchmark row."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import time
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import regex
import sacrebleu

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
TASK_PREFIXES = ("<lexeme>", "<translate>", "<glossary>", "<copy>")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-dir", type=Path, required=True)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--evaluation-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--max-source-length", type=int, default=256)
    parser.add_argument("--max-new-tokens", type=int, default=64)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="wbv_Latn")
    parser.add_argument("--additional-special-token", action="append", default=[])
    parser.add_argument(
        "--expected-additional-special-token-id", action="append", type=int, default=[]
    )
    parser.add_argument("--seed", type=int, default=73)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    return " ".join(text.translate(QUOTE_FOLD).casefold().split())


def preserve(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def decode_preserving_task_tokens(
    tokenizer: Any,
    token_ids: list[int],
    task_token_ids: dict[int, str],
    skipped_special_ids: set[int],
) -> str:
    """Decode ordinary pieces while keeping generated task controls visible."""
    parts: list[str] = []
    segment: list[int] = []

    def flush() -> None:
        if not segment:
            return
        decoded = tokenizer.decode(
            segment,
            skip_special_tokens=False,
            clean_up_tokenization_spaces=True,
        ).strip()
        if decoded:
            parts.append(decoded)
        segment.clear()

    for value in token_ids:
        token_id = int(value)
        if token_id in task_token_ids:
            flush()
            parts.append(task_token_ids[token_id])
        elif token_id in skipped_special_ids:
            flush()
        else:
            segment.append(token_id)
    flush()
    return preserve(" ".join(parts))


def graphemes(value: str) -> list[str]:
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


def error_rate(left: Sequence[Any], right: Sequence[Any]) -> float:
    return edit_distance(left, right) / max(1, len(right))


def strip_task_prefix(value: str) -> str:
    text = preserve(value)
    for prefix in TASK_PREFIXES:
        if text == prefix:
            return ""
        if text.startswith(prefix + " "):
            return text[len(prefix) + 1 :]
    return text


def accepted_references(row: dict[str, Any]) -> list[str]:
    values = row.get("accepted_references") or row.get("acceptedReferences")
    if values is None:
        values = [row.get("output_text") or row.get("reference")]
    if not isinstance(values, list):
        raise TypeError(f"accepted references are not a list for {row.get('id')!r}")
    result = list(dict.fromkeys(preserve(value) for value in values if preserve(value)))
    if not result:
        raise ValueError(f"no accepted reference for {row.get('id')!r}")
    return result


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise TypeError(f"{path}:{line_number} is not an object")
            rows.append(value)
    if not rows:
        raise ValueError(f"empty evaluation suite: {path}")
    return rows


def batched(values: Sequence[Any], size: int) -> Iterable[Sequence[Any]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]


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


def length_bucket(value: int) -> str:
    if value <= 4:
        return "01-04"
    if value <= 8:
        return "05-08"
    if value <= 12:
        return "09-12"
    if value <= 20:
        return "13-20"
    return "21-plus"


def token_bucket(value: int) -> str:
    if value <= 1:
        return "1"
    if value == 2:
        return "2"
    if value <= 4:
        return "3-4"
    return "5-plus"


def classify(
    prediction: str,
    references: list[str],
    source: str,
    known_targets: set[str],
) -> str:
    normalized_prediction = normalize(prediction)
    normalized_references = [normalize(value) for value in references]
    if not normalized_prediction:
        return "blank"
    source_without_prefix = strip_task_prefix(source)
    source_candidates = {normalize(source), normalize(source_without_prefix)} - {""}
    definition_marker = " definition: "
    normalized_source_without_prefix = normalize(source_without_prefix)
    if definition_marker in normalized_source_without_prefix:
        prompt, definition = normalized_source_without_prefix.split(
            definition_marker, 1
        )
        source_candidates.update({prompt, definition})
        source_candidates.discard("")
    if normalized_prediction in source_candidates:
        return "source_copy"
    if normalized_prediction in normalized_references:
        return "exact"
    if normalized_prediction in known_targets:
        return "wrong_known_target"
    best = min(
        normalized_references,
        key=lambda value: error_rate(
            graphemes(normalized_prediction), graphemes(value)
        ),
    )
    distance = error_rate(graphemes(normalized_prediction), graphemes(best))
    ratio = len(graphemes(normalized_prediction)) / max(1, len(graphemes(best)))
    if normalized_prediction in best or ratio < 0.60:
        return "under_generation_surface"
    if best in normalized_prediction or ratio > 1.50:
        return "over_generation_surface"
    if distance <= 0.25:
        return "near_surface_form"
    return "different_surface_form"


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    exact = sum(row["exact"] for row in rows)
    fault_fields = (
        "blank",
        "source_copy",
        "repeated_token_4gram",
        "unresolved_task_token",
    )
    return {
        "rows": len(rows),
        "exact": exact,
        "exact_rate": exact / len(rows),
        "mean_chrf2": sum(row["chrf2"] for row in rows) / len(rows),
        "mean_grapheme_cer": sum(row["grapheme_cer"] for row in rows) / len(rows),
        "surface_classes": dict(
            sorted(Counter(row["surface_class"] for row in rows).items())
        ),
        "faults": {
            field: sum(bool(row[field]) for row in rows) for field in fault_fields
        },
    }


def grouped_summaries(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) or "unspecified")].append(row)
    return {key: summarize_rows(value) for key, value in sorted(groups.items())}


def main() -> None:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    args = parse_args()
    try:
        from .nllb_runtime_token_extension import (
            append_special_tokens_with_decomposition_mean,
            pair_tokens_with_expected_ids,
        )
    except ImportError:
        from nllb_runtime_token_extension import (
            append_special_tokens_with_decomposition_mean,
            pair_tokens_with_expected_ids,
        )
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is required for the frozen Wajarri checkpoint census")
    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)

    suite_paths = {
        "lexical_direct_closed": args.evaluation_dir / "lexical-direct-closed.jsonl",
        "lexical_context_closed": args.evaluation_dir / "lexical-context-closed.jsonl",
        "synthetic_holdout": args.evaluation_dir / "synthetic-holdout.jsonl",
        "historical_holdout": args.evaluation_dir / "historical-holdout.jsonl",
        "retention": args.evaluation_dir / "retention.jsonl",
    }
    suites = {name: load_jsonl(path) for name, path in suite_paths.items()}
    known_targets = {
        normalize(reference)
        for rows in suites.values()
        for row in rows
        for reference in accepted_references(row)
    }

    started = time.monotonic()
    tokenizer = AutoTokenizer.from_pretrained(
        args.base_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        use_fast=False,
    )
    target_id = int(tokenizer.convert_tokens_to_ids(args.target_lang))
    if target_id == tokenizer.unk_token_id:
        raise RuntimeError(f"target language token is unknown: {args.target_lang}")
    base_model = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_dir,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
    )
    runtime_token_extension = append_special_tokens_with_decomposition_mean(
        tokenizer,
        base_model,
        pair_tokens_with_expected_ids(
            args.additional_special_token,
            args.expected_additional_special_token_id,
        ),
    )
    model = PeftModel.from_pretrained(base_model, args.adapter_dir)
    model = model.to("cuda").eval()
    model.config.forced_bos_token_id = target_id
    model.generation_config.forced_bos_token_id = target_id

    output_dir = args.output_dir
    predictions_dir = output_dir / "predictions"
    predictions_dir.mkdir(parents=True, exist_ok=False)
    suite_summaries: dict[str, Any] = {}
    all_predictions: list[dict[str, Any]] = []
    special_ids = {int(value) for value in tokenizer.all_special_ids}
    special_ids.add(int(tokenizer.pad_token_id))
    task_token_ids = {
        int(tokenizer.convert_tokens_to_ids(token)): token
        for token in TASK_PREFIXES
        if int(tokenizer.convert_tokens_to_ids(token)) != int(tokenizer.unk_token_id)
    }
    if len(task_token_ids) != len(TASK_PREFIXES):
        raise RuntimeError("one or more task tokens are unknown at evaluation time")

    for suite_name, rows in suites.items():
        suite_started = time.monotonic()
        predictions: list[dict[str, Any]] = []
        for batch_rows in batched(rows, args.batch_size):
            inputs = [preserve(row["input_text"]) for row in batch_rows]
            encoded = tokenizer(
                inputs,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=args.max_source_length,
            )
            encoded = {key: value.to("cuda") for key, value in encoded.items()}
            with torch.inference_mode():
                generated = model.generate(
                    **encoded,
                    forced_bos_token_id=target_id,
                    max_new_tokens=args.max_new_tokens,
                    num_beams=1,
                    do_sample=False,
                    no_repeat_ngram_size=0,
                    repetition_penalty=1.0,
                    length_penalty=1.0,
                    use_cache=True,
                )
            decoded = [
                decode_preserving_task_tokens(
                    tokenizer,
                    token_ids,
                    task_token_ids,
                    special_ids,
                )
                for token_ids in generated.tolist()
            ]
            for row, prediction, token_ids in zip(
                batch_rows, decoded, generated.tolist()
            ):
                prediction = preserve(prediction)
                references = accepted_references(row)
                normalized_prediction = normalize(prediction)
                normalized_references = [normalize(value) for value in references]
                best_cer = min(
                    error_rate(graphemes(normalized_prediction), graphemes(reference))
                    for reference in normalized_references
                )
                best_chrf = max(
                    sacrebleu.sentence_chrf(
                        prediction,
                        [reference],
                        word_order=2,
                    ).score
                    for reference in references
                )
                reference_token_lengths = [
                    len(tokenizer.encode(reference, add_special_tokens=False))
                    for reference in references
                ]
                clean_token_ids = [
                    value for value in token_ids if value not in special_ids
                ]
                surface_class = classify(
                    prediction,
                    references,
                    row["input_text"],
                    known_targets,
                )
                result = {
                    **row,
                    "suite": suite_name,
                    "prediction": prediction,
                    "prediction_normalized": normalized_prediction,
                    "exact": surface_class == "exact",
                    "surface_class": surface_class,
                    "blank": not bool(normalized_prediction),
                    "source_copy": surface_class == "source_copy",
                    "repeated_token_4gram": contains_repeated_ngram(clean_token_ids),
                    "unresolved_task_token": any(
                        token in prediction for token in TASK_PREFIXES
                    ),
                    "generated_token_count": len(clean_token_ids),
                    "grapheme_cer": best_cer,
                    "chrf2": best_chrf,
                    "reference_grapheme_length_min": min(
                        len(graphemes(value)) for value in normalized_references
                    ),
                    "reference_grapheme_length_bucket": length_bucket(
                        min(len(graphemes(value)) for value in normalized_references)
                    ),
                    "reference_token_length_min": min(reference_token_lengths),
                    "reference_token_length_bucket": token_bucket(
                        min(reference_token_lengths)
                    ),
                }
                predictions.append(result)
                all_predictions.append(result)
        suite_path = predictions_dir / f"{suite_name}.jsonl"
        with suite_path.open("w", encoding="utf-8") as handle:
            for row in predictions:
                handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        summary = summarize_rows(predictions)
        summary.update(
            {
                "duration_seconds": time.monotonic() - suite_started,
                "rows_per_second": len(predictions)
                / max(0.001, time.monotonic() - suite_started),
                "by_ambiguity_class": grouped_summaries(predictions, "ambiguity_class"),
                "by_pair_kind": grouped_summaries(predictions, "pair_kind"),
                "by_construction_family": grouped_summaries(
                    predictions, "construction_family"
                ),
                "by_reference_grapheme_length": grouped_summaries(
                    predictions, "reference_grapheme_length_bucket"
                ),
                "by_reference_token_length": grouped_summaries(
                    predictions, "reference_token_length_bucket"
                ),
            }
        )
        suite_summaries[suite_name] = summary

    direct_one_target = [
        row
        for row in all_predictions
        if row["suite"] == "lexical_direct_closed"
        and row.get("ambiguity_class") == "one_target"
    ]
    faults = {
        "blank": sum(row["blank"] for row in all_predictions),
        "source_copy": sum(row["source_copy"] for row in all_predictions),
        "repeated_token_4gram": sum(
            row["repeated_token_4gram"] for row in all_predictions
        ),
        "unresolved_task_token": sum(
            row["unresolved_task_token"] for row in all_predictions
        ),
    }
    summary = {
        "schema_version": 1,
        "created_at_utc": utc_now(),
        "label": args.label,
        "base_dir": str(args.base_dir),
        "adapter_dir": str(args.adapter_dir),
        "adapter_model_sha256": sha256_file(
            args.adapter_dir / "adapter_model.safetensors"
        ),
        "source_lang": args.source_lang,
        "target_lang": args.target_lang,
        "target_token_id": target_id,
        "runtime_token_extension": runtime_token_extension,
        "decoder": {
            "num_beams": 1,
            "max_new_tokens": args.max_new_tokens,
            "no_repeat_ngram_size": 0,
            "repetition_penalty": 1.0,
            "length_penalty": 1.0,
        },
        "environment": {
            "gpu": torch.cuda.get_device_name(0),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "dtype": "bfloat16",
        },
        "total_rows": len(all_predictions),
        "duration_seconds": time.monotonic() - started,
        "faults": faults,
        "direct_one_target": summarize_rows(direct_one_target),
        "suites": suite_summaries,
        "claim_limits": [
            "Closed lexical reconstruction measures retention of known mappings, not free-form translation reliability.",
            "Synthetic holdout rows test controlled composition under documented templates, not speaker-attested naturalness.",
            "The five historical rows are too small and source-specific to authorize a natural-translation claim.",
            "No automatic score substitutes for independent fluent-speaker review.",
        ],
    }
    (output_dir / "SUMMARY.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    failures = [row for row in all_predictions if not row["exact"]]
    qualitative = {
        "label": args.label,
        "failure_count": len(failures),
        "failure_classes": dict(
            sorted(Counter(row["surface_class"] for row in failures).items())
        ),
        "failure_groups": {
            field: grouped_summaries(failures, field)
            for field in (
                "suite",
                "ambiguity_class",
                "pair_kind",
                "construction_family",
                "reference_grapheme_length_bucket",
                "reference_token_length_bucket",
            )
        },
    }
    (output_dir / "QUALITATIVE-FAILURES.json").write_text(
        json.dumps(qualitative, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))

    del model
    del base_model
    del tokenizer
    gc.collect()
    torch.cuda.empty_cache()


if __name__ == "__main__":
    main()

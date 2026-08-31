#!/usr/bin/env python3
"""Evaluate Wajarri composition, supplied-term uptake, and copy mechanics."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SENTENCE_ENDPOINTS = {
    "composition_plain",
    "composition_inline",
    "held_lexeme_plain",
    "held_lexeme_inline",
}
COPY_ENDPOINTS = {
    "copy_screen",
    "copy_confirmation",
    "neutral_single_copy_screen",
    "neutral_single_copy_confirmation",
    "neutral_dual_copy_screen",
    "neutral_dual_copy_confirmation",
}
SUPPORTED_ENDPOINTS = SENTENCE_ENDPOINTS | COPY_ENDPOINTS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-dir", type=Path, required=True)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--evaluation-file", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--batch-sizes", default="16")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="wbv_Latn")
    parser.add_argument("--additional-special-token", action="append", default=[])
    parser.add_argument(
        "--expected-additional-special-token-id", action="append", type=int, default=[]
    )
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--dtype", choices=("bfloat16", "float32"), default="bfloat16")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(payload).hexdigest()


def preserve(value: Any) -> str:
    return " ".join(str(value or "").split())


def normalize(value: Any) -> str:
    return preserve(value).casefold().strip(" .?!,;:")


def surface_tokens(value: Any) -> list[str]:
    return normalize(value).split()


def row_id(row: dict[str, Any]) -> str:
    value = row.get("id")
    if isinstance(value, str) and value:
        return value
    raise ValueError("evaluation row has no stable identifier")


def load_rows(path: Path, expected_rows: int) -> list[dict[str, Any]]:
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]
    if expected_rows <= 0 or len(rows) != expected_rows:
        raise ValueError(f"expected {expected_rows} rows, got {len(rows)}")
    identifiers = [row_id(row) for row in rows]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("duplicate evaluation row identifier")
    for row in rows:
        required = {"evaluation_endpoint", "input_text", "output_text", "source_text"}
        missing = sorted(required - row.keys())
        if missing:
            raise ValueError(f"evaluation row {row_id(row)!r} lacks fields: {missing}")
        endpoint = str(row["evaluation_endpoint"])
        if endpoint not in SUPPORTED_ENDPOINTS:
            raise ValueError(f"unsupported endpoint on {row_id(row)}: {endpoint}")
        if endpoint in SENTENCE_ENDPOINTS:
            if len(surface_tokens(row["output_text"])) != 2:
                raise ValueError(f"sentence endpoint is not a two-slot clause: {row_id(row)}")
            sentence_fields = {"subject_id", "predicate_id", "contrast_family"}
            if sentence_fields - row.keys():
                raise ValueError(f"sentence endpoint lacks slot metadata: {row_id(row)}")
    return sorted(rows, key=row_id)


def parse_batch_sizes(value: str) -> list[int]:
    sizes = [int(item.strip()) for item in value.split(",") if item.strip()]
    if not sizes or any(size <= 0 for size in sizes) or len(set(sizes)) != len(sizes):
        raise ValueError("batch sizes must be distinct positive integers")
    return sizes


def batched(rows: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [rows[start : start + size] for start in range(0, len(rows), size)]


def repeated_ngram(token_ids: list[int], special_ids: set[int], size: int = 4) -> bool:
    values = [value for value in token_ids if value not in special_ids]
    seen = set()
    for index in range(len(values) - size + 1):
        ngram = tuple(values[index : index + size])
        if ngram in seen:
            return True
        seen.add(ngram)
    return False


def score_row(
    row: dict[str, Any],
    prediction: str,
    token_ids: list[int],
    special_ids: set[int],
    known_subjects: set[str],
    known_predicates: set[str],
) -> dict[str, Any]:
    import sacrebleu

    endpoint = str(row["evaluation_endpoint"])
    reference = str(row["output_text"])
    prediction_normalized = normalize(prediction)
    reference_normalized = normalize(reference)
    predicted_tokens = surface_tokens(prediction)
    sentence_endpoint = endpoint in SENTENCE_ENDPOINTS
    expected_subject = None
    expected_predicate = None
    subject_present = None
    predicate_present = None
    observed_subjects: list[str] = []
    observed_predicates: list[str] = []
    if sentence_endpoint:
        expected_subject, expected_predicate = surface_tokens(reference)
        subject_present = expected_subject in predicted_tokens
        predicate_present = expected_predicate in predicted_tokens
        observed_subjects = sorted(set(predicted_tokens) & known_subjects)
        observed_predicates = sorted(set(predicted_tokens) & known_predicates)
    exact = prediction_normalized == reference_normalized
    blank = not prediction_normalized
    source_copy = prediction_normalized == normalize(row["source_text"])
    repeated = repeated_ngram(token_ids, special_ids)
    unresolved_bracket = "[" in prediction or "]" in prediction
    copy_surface_present = (
        reference_normalized in prediction_normalized if endpoint in COPY_ENDPOINTS else None
    )
    failure_codes = []
    if not exact:
        if blank:
            failure_codes.append("blank_output")
        if source_copy:
            failure_codes.append("source_copy")
        if repeated:
            failure_codes.append("repeated_token_4gram")
        if unresolved_bracket:
            failure_codes.append("unresolved_bracket")
        if sentence_endpoint:
            if not subject_present:
                failure_codes.append("expected_subject_missing")
            if not predicate_present:
                failure_codes.append("expected_predicate_missing")
            if observed_subjects and not subject_present:
                failure_codes.append("known_subject_substitution")
            if observed_predicates and not predicate_present:
                failure_codes.append("known_predicate_substitution")
        elif not copy_surface_present:
            failure_codes.append("supplied_surface_missing")
    return {
        "schema_version": 1,
        "row_id": row_id(row),
        "evaluation_endpoint": endpoint,
        "evaluation_condition": row.get("evaluation_condition"),
        "family_id": row.get("family_id"),
        "contrast_family": row.get("contrast_family"),
        "subject_id": row.get("subject_id"),
        "predicate_id": row.get("predicate_id"),
        "input_text": row["input_text"],
        "source_text": row["source_text"],
        "reference": reference,
        "prediction": preserve(prediction),
        "exact": exact,
        "expected_subject": expected_subject,
        "expected_predicate": expected_predicate,
        "expected_subject_present": subject_present,
        "expected_predicate_present": predicate_present,
        "both_expected_slots_present": (
            bool(subject_present and predicate_present) if sentence_endpoint else None
        ),
        "copy_surface_present": copy_surface_present,
        "observed_known_subjects": observed_subjects,
        "observed_known_predicates": observed_predicates,
        "blank": blank,
        "source_copy": source_copy,
        "repeated_token_4gram": repeated,
        "unresolved_bracket": unresolved_bracket,
        "chrf2": sacrebleu.sentence_chrf(
            preserve(prediction), [reference], word_order=2
        ).score,
        "failure_codes": failure_codes,
    }


def core_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    sentence_rows = [row for row in rows if row["evaluation_endpoint"] in SENTENCE_ENDPOINTS]
    copy_rows = [row for row in rows if row["evaluation_endpoint"] in COPY_ENDPOINTS]
    predictions = Counter(normalize(row["prediction"]) for row in rows)
    failures = Counter(code for row in rows for code in row["failure_codes"])
    exact = sum(bool(row["exact"]) for row in rows)
    return {
        "rows": len(rows),
        "exact": exact,
        "exact_rate": exact / len(rows),
        "sentence_rows": len(sentence_rows),
        "subject_present": sum(bool(row["expected_subject_present"]) for row in sentence_rows),
        "predicate_present": sum(
            bool(row["expected_predicate_present"]) for row in sentence_rows
        ),
        "both_slots_present": sum(
            bool(row["both_expected_slots_present"]) for row in sentence_rows
        ),
        "copy_rows": len(copy_rows),
        "copy_surface_present": sum(bool(row["copy_surface_present"]) for row in copy_rows),
        "mean_chrf2": sum(float(row["chrf2"]) for row in rows) / len(rows),
        "faults": {
            field: sum(bool(row[field]) for row in rows)
            for field in (
                "blank",
                "source_copy",
                "repeated_token_4gram",
                "unresolved_bracket",
            )
        },
        "failure_codes": dict(sorted(failures.items())),
        "prediction_collapses": [
            {"prediction": prediction, "rows": count}
            for prediction, count in sorted(
                predictions.items(), key=lambda item: (-item[1], item[0])
            )
            if count > 1
        ],
    }


def grouped_summary(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    values = sorted({str(row.get(field)) for row in rows if row.get(field) is not None})
    return {
        value: core_summary([row for row in rows if str(row.get(field)) == value])
        for value in values
    }


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    endpoint_summaries = {}
    for endpoint in sorted({str(row["evaluation_endpoint"]) for row in rows}):
        group = [row for row in rows if row["evaluation_endpoint"] == endpoint]
        endpoint_summaries[endpoint] = {
            **core_summary(group),
            "by_contrast_family": grouped_summary(group, "contrast_family"),
            "by_predicate": grouped_summary(group, "predicate_id"),
            "by_subject": grouped_summary(group, "subject_id"),
        }
    return {
        **core_summary(rows),
        "by_endpoint": endpoint_summaries,
        "by_contrast_family": grouped_summary(rows, "contrast_family"),
        "by_predicate": grouped_summary(rows, "predicate_id"),
        "by_subject": grouped_summary(rows, "subject_id"),
    }


def compare_batches(predictions_by_batch: dict[int, list[dict[str, Any]]]) -> dict[str, Any]:
    sizes = list(predictions_by_batch)
    reference_size = sizes[0]
    reference = {
        row["row_id"]: normalize(row["prediction"])
        for row in predictions_by_batch[reference_size]
    }
    comparisons = {}
    all_identical = True
    for size in sizes[1:]:
        candidate = {
            row["row_id"]: normalize(row["prediction"])
            for row in predictions_by_batch[size]
        }
        mismatches = sorted(key for key in reference if reference[key] != candidate[key])
        comparisons[str(size)] = {
            "mismatch_count": len(mismatches),
            "mismatch_row_ids": mismatches,
        }
        all_identical &= not mismatches
    return {
        "reference_batch_size": reference_size,
        "all_outputs_identical": all_identical,
        "comparisons": comparisons,
    }


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> None:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

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

    args = parse_args()
    batch_sizes = parse_batch_sizes(args.batch_sizes)
    rows = load_rows(args.evaluation_file, args.expected_rows)
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    sentence_rows = [row for row in rows if row["evaluation_endpoint"] in SENTENCE_ENDPOINTS]
    known_subjects = {surface_tokens(row["output_text"])[0] for row in sentence_rows}
    known_predicates = {surface_tokens(row["output_text"])[1] for row in sentence_rows}

    started = time.monotonic()
    tokenizer = AutoTokenizer.from_pretrained(
        args.base_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        use_fast=False,
        local_files_only=True,
    )
    target_id = int(tokenizer.convert_tokens_to_ids(args.target_lang))
    if target_id == tokenizer.unk_token_id:
        raise RuntimeError(f"target language token is unknown: {args.target_lang}")
    dtype = torch.bfloat16 if args.dtype == "bfloat16" else torch.float32
    base = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_dir,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
        local_files_only=True,
    )
    runtime_token_extension = append_special_tokens_with_decomposition_mean(
        tokenizer,
        base,
        pair_tokens_with_expected_ids(
            args.additional_special_token,
            args.expected_additional_special_token_id,
        ),
    )
    model = PeftModel.from_pretrained(base, args.adapter_dir, local_files_only=True)
    model = model.to("cuda").eval()
    special_ids = {int(value) for value in tokenizer.all_special_ids}
    special_ids.add(int(tokenizer.pad_token_id))

    predictions_by_batch: dict[int, list[dict[str, Any]]] = {}
    for batch_size in batch_sizes:
        predictions = []
        for batch in batched(rows, batch_size):
            encoded = tokenizer(
                [row["input_text"] for row in batch],
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=256,
            )
            encoded = {key: value.to("cuda") for key, value in encoded.items()}
            with torch.inference_mode():
                generated = model.generate(
                    **encoded,
                    forced_bos_token_id=target_id,
                    max_new_tokens=64,
                    num_beams=1,
                    do_sample=False,
                    no_repeat_ngram_size=0,
                    repetition_penalty=1.0,
                    length_penalty=1.0,
                    use_cache=True,
                )
            decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
            predictions.extend(
                score_row(
                    row,
                    prediction,
                    token_ids,
                    special_ids,
                    known_subjects,
                    known_predicates,
                )
                for row, prediction, token_ids in zip(
                    batch, decoded, generated.tolist(), strict=True
                )
            )
        predictions_by_batch[batch_size] = predictions

    output_dir.mkdir(parents=True)
    primary_size = batch_sizes[0]
    for batch_size, predictions in predictions_by_batch.items():
        write_jsonl(output_dir / f"PREDICTIONS.batch-{batch_size}.jsonl", predictions)
    write_jsonl(output_dir / "PREDICTIONS.jsonl", predictions_by_batch[primary_size])
    summary = {
        "schema_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "label": args.label,
        "base_dir": str(args.base_dir.resolve()),
        "adapter_dir": str(args.adapter_dir.resolve()),
        "adapter_weight_sha256": sha256_file(
            args.adapter_dir / "adapter_model.safetensors"
        ),
        "runtime_token_extension": runtime_token_extension,
        "evaluation_file": str(args.evaluation_file.resolve()),
        "evaluation_sha256": sha256_file(args.evaluation_file),
        "dtype": args.dtype,
        "decoder": {
            "num_beams": 1,
            "do_sample": False,
            "no_repeat_ngram_size": 0,
            "repetition_penalty": 1.0,
            "length_penalty": 1.0,
            "max_new_tokens": 64,
        },
        "primary_batch_size": primary_size,
        "metrics": summarize(predictions_by_batch[primary_size]),
        "metrics_by_batch_size": {
            str(size): summarize(predictions)
            for size, predictions in predictions_by_batch.items()
        },
        "prediction_sha256_by_batch_size": {
            str(size): sha256_json(
                [(row["row_id"], normalize(row["prediction"])) for row in predictions]
            )
            for size, predictions in predictions_by_batch.items()
        },
        "batch_invariance": compare_batches(predictions_by_batch),
        "duration_seconds": time.monotonic() - started,
        "claim_limit": "Controlled composition, supplied-term uptake, and nonlinguistic copy-mechanics evidence only; not natural-language reliability, speaker validation, or release authorization.",
    }
    (output_dir / "SUMMARY.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

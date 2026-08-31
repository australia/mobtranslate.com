#!/usr/bin/env python3
"""Evaluate raw and deterministically rendered Wajarri subject-slot outputs."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SLOT_TOKEN = "<copy>"
ORDINARY_ENDPOINTS = {
    "composition_plain",
    "composition_inline",
    "held_lexeme_plain",
    "held_lexeme_inline",
}
SLOT_ENDPOINTS = {
    "slot_composition_masked",
    "slot_composition_declared",
    "slot_held_masked",
    "slot_held_declared",
}
SUPPORTED_ENDPOINTS = ORDINARY_ENDPOINTS | SLOT_ENDPOINTS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-dir", type=Path, required=True)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--evaluation-file", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--batch-sizes", default="16")
    parser.add_argument(
        "--include-endpoint",
        action="append",
        default=[],
        help="Evaluate only this endpoint after validating the complete bound file.",
    )
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="wbv_Latn")
    parser.add_argument("--additional-special-token", action="append", default=[])
    parser.add_argument(
        "--expected-additional-special-token-id", action="append", type=int, default=[]
    )
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--dtype", choices=("bfloat16", "float32"), default="bfloat16")
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument(
        "--force-slot-after-target-lang",
        action="store_true",
        help="Force the nonlinguistic slot token immediately after the target language token.",
    )
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
        required = {
            "evaluation_endpoint",
            "input_text",
            "output_text",
            "source_text",
            "subject_id",
            "predicate_id",
            "contrast_family",
        }
        missing = sorted(required - row.keys())
        if missing:
            raise ValueError(f"evaluation row {row_id(row)!r} lacks fields: {missing}")
        endpoint = str(row["evaluation_endpoint"])
        if endpoint not in SUPPORTED_ENDPOINTS:
            raise ValueError(f"unsupported endpoint on {row_id(row)}: {endpoint}")
        if endpoint in ORDINARY_ENDPOINTS:
            if len(surface_tokens(row["output_text"])) != 2:
                raise ValueError(f"ordinary endpoint is not a two-slot clause: {row_id(row)}")
        else:
            slot_required = {
                "rendered_output_text",
                "slot_binding",
                "predicate_binding",
                "slot_token",
            }
            if slot_required - row.keys():
                raise ValueError(f"slot endpoint lacks renderer metadata: {row_id(row)}")
            if row["slot_token"] != SLOT_TOKEN:
                raise ValueError(f"slot token changed on {row_id(row)}")
            if str(row["output_text"]).count(SLOT_TOKEN) != 1:
                raise ValueError(f"slot reference has wrong marker count: {row_id(row)}")
    return sorted(rows, key=row_id)


def parse_batch_sizes(value: str) -> list[int]:
    sizes = [int(item.strip()) for item in value.split(",") if item.strip()]
    if not sizes or any(size <= 0 for size in sizes) or len(set(sizes)) != len(sizes):
        raise ValueError("batch sizes must be distinct positive integers")
    return sizes


def resolve_device(requested: str, cuda_available: bool) -> str:
    if requested == "auto":
        return "cuda" if cuda_available else "cpu"
    if requested == "cuda" and not cuda_available:
        raise RuntimeError("CUDA was requested but is not available")
    return requested


def filter_rows_by_endpoint(
    rows: list[dict[str, Any]], included_endpoints: list[str]
) -> list[dict[str, Any]]:
    if not included_endpoints:
        return rows
    requested = set(included_endpoints)
    if len(requested) != len(included_endpoints):
        raise ValueError("included endpoints must be distinct")
    unsupported = sorted(requested - SUPPORTED_ENDPOINTS)
    if unsupported:
        raise ValueError(f"unsupported included endpoints: {unsupported}")
    selected = [
        row for row in rows if str(row["evaluation_endpoint"]) in requested
    ]
    observed = {str(row["evaluation_endpoint"]) for row in selected}
    missing = sorted(requested - observed)
    if missing:
        raise ValueError(f"included endpoints have no rows: {missing}")
    return selected


def batched(rows: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [rows[start : start + size] for start in range(0, len(rows), size)]


def generation_kwargs(
    *, target_id: int, slot_token_id: int, force_slot_after_target_lang: bool
) -> dict[str, Any]:
    values: dict[str, Any] = {
        "forced_bos_token_id": target_id,
        "max_new_tokens": 64,
        "num_beams": 1,
        "do_sample": False,
        "no_repeat_ngram_size": 0,
        "repetition_penalty": 1.0,
        "length_penalty": 1.0,
        "use_cache": True,
    }
    return values


def decoder_prefix_token_ids(
    *,
    decoder_start_id: int,
    target_id: int,
    slot_token_id: int,
    force_slot_after_target_lang: bool,
) -> list[int] | None:
    if not force_slot_after_target_lang:
        return None
    return [decoder_start_id, target_id, slot_token_id]


def repeated_ngram(token_ids: list[int], special_ids: set[int], size: int = 4) -> bool:
    values = [value for value in token_ids if value not in special_ids]
    seen = set()
    for index in range(len(values) - size + 1):
        ngram = tuple(values[index : index + size])
        if ngram in seen:
            return True
        seen.add(ngram)
    return False


def decode_preserving_slot(
    tokenizer: Any,
    token_ids: list[int],
    *,
    slot_token_id: int,
    skipped_special_ids: set[int],
) -> str:
    """Decode all ordinary pieces while retaining the one output-slot token."""
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

    for token_id in token_ids:
        token_id = int(token_id)
        if token_id == slot_token_id:
            flush()
            parts.append(SLOT_TOKEN)
        elif token_id in skipped_special_ids:
            flush()
        else:
            segment.append(token_id)
    flush()
    return preserve(" ".join(parts))


def render_slot(prediction: str, slot_surface: str) -> tuple[str | None, int]:
    count = prediction.count(SLOT_TOKEN)
    if count != 1 or not normalize(slot_surface):
        return None, count
    rendered = prediction.replace(SLOT_TOKEN, preserve(slot_surface), 1)
    if SLOT_TOKEN in rendered:
        return None, count
    return preserve(rendered), count


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
    is_slot = endpoint in SLOT_ENDPOINTS
    raw_reference = str(row["output_text"])
    raw_exact = normalize(prediction) == normalize(raw_reference)
    blank = not normalize(prediction)
    source_copy = normalize(prediction) == normalize(row["source_text"])
    repeated = repeated_ngram(token_ids, special_ids)
    unresolved_bracket = "[" in prediction or "]" in prediction
    predicted_tokens = surface_tokens(prediction)

    if is_slot:
        expected_subject = normalize(row["slot_binding"]["wajarri_surface"])
        expected_predicate = normalize(row["predicate_binding"]["wajarri_surface"])
        rendered_prediction, slot_count = render_slot(
            prediction, row["slot_binding"]["wajarri_surface"]
        )
        rendered_reference = str(row["rendered_output_text"])
        rendered_exact = (
            rendered_prediction is not None
            and normalize(rendered_prediction) == normalize(rendered_reference)
        )
        slot_position_valid = bool(predicted_tokens and predicted_tokens[0] == SLOT_TOKEN)
        predicate_present = expected_predicate in predicted_tokens
        subject_present_raw = expected_subject in predicted_tokens
        observed_subjects = sorted(set(predicted_tokens) & known_subjects)
        observed_predicates = sorted(set(predicted_tokens) & known_predicates)
    else:
        expected_subject, expected_predicate = surface_tokens(raw_reference)
        rendered_prediction = None
        rendered_reference = None
        rendered_exact = None
        slot_count = prediction.count(SLOT_TOKEN)
        slot_position_valid = None
        predicate_present = expected_predicate in predicted_tokens
        subject_present_raw = expected_subject in predicted_tokens
        observed_subjects = sorted(set(predicted_tokens) & known_subjects)
        observed_predicates = sorted(set(predicted_tokens) & known_predicates)

    failure_codes = []
    if blank:
        failure_codes.append("blank_output")
    if source_copy:
        failure_codes.append("source_copy")
    if repeated:
        failure_codes.append("repeated_token_4gram")
    if unresolved_bracket:
        failure_codes.append("unresolved_bracket")
    if is_slot:
        if slot_count == 0:
            failure_codes.append("slot_missing")
        elif slot_count > 1:
            failure_codes.append("extra_slot")
        if slot_count == 1 and not slot_position_valid:
            failure_codes.append("slot_position_wrong")
        if not predicate_present:
            failure_codes.append("expected_predicate_missing")
        if subject_present_raw:
            failure_codes.append("subject_generated_inside_raw_template")
        if observed_predicates and not predicate_present:
            failure_codes.append("known_predicate_substitution")
        if not rendered_exact:
            failure_codes.append("rendered_reference_mismatch")
    else:
        if slot_count:
            failure_codes.append("unresolved_slot_in_ordinary_output")
        if not subject_present_raw:
            failure_codes.append("expected_subject_missing")
        if not predicate_present:
            failure_codes.append("expected_predicate_missing")
        if observed_subjects and not subject_present_raw:
            failure_codes.append("known_subject_substitution")
        if observed_predicates and not predicate_present:
            failure_codes.append("known_predicate_substitution")

    chrf_reference = rendered_reference if is_slot else raw_reference
    chrf_prediction = rendered_prediction if rendered_prediction is not None else prediction
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
        "raw_reference": raw_reference,
        "prediction": preserve(prediction),
        "raw_exact": raw_exact,
        "is_slot_endpoint": is_slot,
        "slot_count": slot_count,
        "slot_position_valid": slot_position_valid,
        "slot_surface": row.get("slot_binding", {}).get("wajarri_surface"),
        "rendered_reference": rendered_reference,
        "rendered_prediction": rendered_prediction,
        "rendered_exact": rendered_exact,
        "expected_subject": expected_subject,
        "expected_predicate": expected_predicate,
        "expected_subject_present_raw": subject_present_raw,
        "expected_predicate_present": predicate_present,
        "observed_known_subjects": observed_subjects,
        "observed_known_predicates": observed_predicates,
        "blank": blank,
        "source_copy": source_copy,
        "repeated_token_4gram": repeated,
        "unresolved_bracket": unresolved_bracket,
        "unresolved_slot": slot_count != (1 if is_slot else 0),
        "chrf2": sacrebleu.sentence_chrf(
            preserve(chrf_prediction), [str(chrf_reference)], word_order=2
        ).score,
        "failure_codes": failure_codes,
    }


def core_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    slot_rows = [row for row in rows if row["is_slot_endpoint"]]
    ordinary_rows = [row for row in rows if not row["is_slot_endpoint"]]
    failures = Counter(code for row in rows for code in row["failure_codes"])
    predictions = Counter(normalize(row["prediction"]) for row in rows)
    raw_exact = sum(bool(row["raw_exact"]) for row in rows)
    rendered_exact = sum(bool(row["rendered_exact"]) for row in slot_rows)
    return {
        "rows": len(rows),
        "raw_exact": raw_exact,
        "raw_exact_rate": raw_exact / len(rows),
        "ordinary_rows": len(ordinary_rows),
        "ordinary_exact": sum(bool(row["raw_exact"]) for row in ordinary_rows),
        "slot_rows": len(slot_rows),
        "slot_raw_exact": sum(bool(row["raw_exact"]) for row in slot_rows),
        "slot_rendered_exact": rendered_exact,
        "slot_rendered_exact_rate": rendered_exact / len(slot_rows) if slot_rows else None,
        "slot_count_valid": sum(row["slot_count"] == 1 for row in slot_rows),
        "slot_position_valid": sum(bool(row["slot_position_valid"]) for row in slot_rows),
        "predicate_present": sum(bool(row["expected_predicate_present"]) for row in rows),
        "mean_chrf2": sum(float(row["chrf2"]) for row in rows) / len(rows),
        "faults": {
            field: sum(bool(row[field]) for row in rows)
            for field in (
                "blank",
                "source_copy",
                "repeated_token_4gram",
                "unresolved_bracket",
                "unresolved_slot",
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
    return {
        **core_summary(rows),
        "by_endpoint": {
            endpoint: {
                **core_summary(
                    [row for row in rows if row["evaluation_endpoint"] == endpoint]
                ),
                "by_predicate": grouped_summary(
                    [row for row in rows if row["evaluation_endpoint"] == endpoint],
                    "predicate_id",
                ),
            }
            for endpoint in sorted({str(row["evaluation_endpoint"]) for row in rows})
        },
        "by_contrast_family": grouped_summary(rows, "contrast_family"),
        "by_predicate": grouped_summary(rows, "predicate_id"),
        "by_subject": grouped_summary(rows, "subject_id"),
    }


def compare_batches(predictions_by_batch: dict[int, list[dict[str, Any]]]) -> dict[str, Any]:
    sizes = list(predictions_by_batch)
    reference_size = sizes[0]
    reference = {
        row["row_id"]: (normalize(row["prediction"]), normalize(row["rendered_prediction"]))
        for row in predictions_by_batch[reference_size]
    }
    comparisons = {}
    all_identical = True
    for size in sizes[1:]:
        candidate = {
            row["row_id"]: (
                normalize(row["prediction"]),
                normalize(row["rendered_prediction"]),
            )
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
    bound_rows = load_rows(args.evaluation_file, args.expected_rows)
    rows = filter_rows_by_endpoint(bound_rows, args.include_endpoint)
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    device = resolve_device(args.device, torch.cuda.is_available())

    ordinary_rows = [
        row
        for row in bound_rows
        if row["evaluation_endpoint"] in ORDINARY_ENDPOINTS
    ]
    known_subjects = {surface_tokens(row["output_text"])[0] for row in ordinary_rows}
    known_predicates = {surface_tokens(row["output_text"])[1] for row in ordinary_rows}
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
    slot_token_id = int(tokenizer.convert_tokens_to_ids(SLOT_TOKEN))
    if slot_token_id == tokenizer.unk_token_id:
        raise RuntimeError("slot token is unknown after runtime extension")
    model = PeftModel.from_pretrained(base, args.adapter_dir, local_files_only=True)
    model = model.to(device).eval()
    skipped_special_ids = {int(value) for value in tokenizer.all_special_ids}
    skipped_special_ids.discard(slot_token_id)
    skipped_special_ids.add(int(tokenizer.pad_token_id))
    repeated_ngram_special_ids = set(skipped_special_ids) | {slot_token_id}

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
            encoded = {key: value.to(device) for key, value in encoded.items()}
            generate_values = generation_kwargs(
                target_id=target_id,
                slot_token_id=slot_token_id,
                force_slot_after_target_lang=args.force_slot_after_target_lang,
            )
            decoder_prefix = decoder_prefix_token_ids(
                decoder_start_id=int(base.config.decoder_start_token_id),
                target_id=target_id,
                slot_token_id=slot_token_id,
                force_slot_after_target_lang=args.force_slot_after_target_lang,
            )
            if decoder_prefix is not None:
                generate_values["decoder_input_ids"] = torch.tensor(
                    [decoder_prefix] * len(batch), dtype=torch.long, device=device
                )
            with torch.inference_mode():
                generated = model.generate(
                    **encoded,
                    **generate_values,
                )
            decoded = [
                decode_preserving_slot(
                    tokenizer,
                    token_ids,
                    slot_token_id=slot_token_id,
                    skipped_special_ids=skipped_special_ids,
                )
                for token_ids in generated.tolist()
            ]
            predictions.extend(
                score_row(
                    row,
                    prediction,
                    token_ids,
                    repeated_ngram_special_ids,
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
        "slot_token": SLOT_TOKEN,
        "slot_token_id": slot_token_id,
        "evaluation_file": str(args.evaluation_file.resolve()),
        "evaluation_sha256": sha256_file(args.evaluation_file),
        "bound_evaluation_rows": len(bound_rows),
        "included_endpoints": sorted(set(args.include_endpoint)),
        "evaluated_rows": len(rows),
        "evaluated_row_ids_sha256": sha256_json([row_id(row) for row in rows]),
        "dtype": args.dtype,
        "device": device,
        "decoder": {
            "num_beams": 1,
            "do_sample": False,
            "no_repeat_ngram_size": 0,
            "repetition_penalty": 1.0,
            "length_penalty": 1.0,
            "max_new_tokens": 64,
            "force_slot_after_target_lang": args.force_slot_after_target_lang,
            "decoder_prefix_token_ids": decoder_prefix_token_ids(
                decoder_start_id=int(base.config.decoder_start_token_id),
                target_id=target_id,
                slot_token_id=slot_token_id,
                force_slot_after_target_lang=args.force_slot_after_target_lang,
            ),
        },
        "primary_batch_size": primary_size,
        "metrics": summarize(predictions_by_batch[primary_size]),
        "metrics_by_batch_size": {
            str(size): summarize(predictions)
            for size, predictions in predictions_by_batch.items()
        },
        "prediction_sha256_by_batch_size": {
            str(size): sha256_json(
                [
                    (
                        row["row_id"],
                        normalize(row["prediction"]),
                        normalize(row["rendered_prediction"]),
                    )
                    for row in predictions
                ]
            )
            for size, predictions in predictions_by_batch.items()
        },
        "batch_invariance": compare_batches(predictions_by_batch),
        "duration_seconds": time.monotonic() - started,
        "claim_limit": "Raw slot-template and deterministic rendered-clause evidence over six source-bound predicates only; not natural-language reliability, speaker validation, or release authorization.",
    }
    (output_dir / "SUMMARY.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

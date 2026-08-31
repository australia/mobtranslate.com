#!/usr/bin/env python3
"""Evaluate one Wajarri adapter on a contract-bound composition development suite."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-dir", type=Path, required=True)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--development-file", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="wbv_Latn")
    parser.add_argument("--seed", type=int, default=17)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def preserve(value: Any) -> str:
    return " ".join(str(value or "").split())


def normalize(value: Any) -> str:
    return preserve(value).casefold().strip(" .?!,;:")


def surface_tokens(value: Any) -> list[str]:
    return normalize(value).split()


def load_rows(path: Path, expected_rows: int) -> list[dict[str, Any]]:
    if expected_rows <= 0:
        raise ValueError("expected development row count must be positive")
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]
    if len(rows) != expected_rows:
        raise ValueError(f"expected {expected_rows} development rows, got {len(rows)}")
    if len({row["cell_id"] for row in rows}) != len(rows):
        raise ValueError("duplicate development cell")
    for row in rows:
        missing = sorted(
            {
                "cell_id",
                "subject_id",
                "predicate_id",
                "source_text",
                "input_text",
                "output_text",
            }
            - row.keys()
        )
        if missing:
            raise ValueError(
                f"development cell {row.get('cell_id')!r} lacks fields: {missing}"
            )
        if len(surface_tokens(row["output_text"])) != 2:
            raise ValueError(
                f"development cell is not a two-slot clause: {row['cell_id']}"
            )
    return rows


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

    reference = row["output_text"]
    expected_subject, expected_predicate = surface_tokens(reference)
    predicted_tokens = surface_tokens(prediction)
    subject_present = expected_subject in predicted_tokens
    predicate_present = expected_predicate in predicted_tokens
    exact = normalize(prediction) == normalize(reference)
    blank = not normalize(prediction)
    source_copy = normalize(prediction) == normalize(row["source_text"])
    repeated = repeated_ngram(token_ids, special_ids)
    observed_subjects = sorted(set(predicted_tokens) & known_subjects)
    observed_predicates = sorted(set(predicted_tokens) & known_predicates)
    failure_codes = []
    if not exact:
        if blank:
            failure_codes.append("blank_output")
        if source_copy:
            failure_codes.append("source_copy")
        if not subject_present:
            failure_codes.append("expected_subject_missing")
        if not predicate_present:
            failure_codes.append("expected_predicate_missing")
        if observed_subjects and not subject_present:
            failure_codes.append("known_subject_substitution")
        if observed_predicates and not predicate_present:
            failure_codes.append("known_predicate_substitution")
        if repeated:
            failure_codes.append("repeated_token_4gram")
    return {
        "schema_version": 1,
        "cell_id": row["cell_id"],
        "subject_id": row["subject_id"],
        "predicate_id": row["predicate_id"],
        "input_text": row["input_text"],
        "source_text": row["source_text"],
        "reference": reference,
        "prediction": preserve(prediction),
        "exact": exact,
        "expected_subject": expected_subject,
        "expected_predicate": expected_predicate,
        "expected_subject_present": subject_present,
        "expected_predicate_present": predicate_present,
        "both_expected_slots_present": subject_present and predicate_present,
        "observed_known_subjects": observed_subjects,
        "observed_known_predicates": observed_predicates,
        "blank": blank,
        "source_copy": source_copy,
        "repeated_token_4gram": repeated,
        "chrf2": sacrebleu.sentence_chrf(
            preserve(prediction), [reference], word_order=2
        ).score,
        "failure_codes": failure_codes,
    }


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    predictions = Counter(normalize(row["prediction"]) for row in rows)
    return {
        "rows": len(rows),
        "exact": sum(row["exact"] for row in rows),
        "subject_present": sum(row["expected_subject_present"] for row in rows),
        "predicate_present": sum(row["expected_predicate_present"] for row in rows),
        "both_slots_present": sum(row["both_expected_slots_present"] for row in rows),
        "mean_chrf2": sum(row["chrf2"] for row in rows) / len(rows),
        "faults": {
            field: sum(row[field] for row in rows)
            for field in ("blank", "source_copy", "repeated_token_4gram")
        },
        "by_subject": {
            key: {
                "rows": len(group),
                "exact": sum(row["exact"] for row in group),
                "both_slots_present": sum(
                    row["both_expected_slots_present"] for row in group
                ),
            }
            for key in sorted({row["subject_id"] for row in rows})
            for group in [[row for row in rows if row["subject_id"] == key]]
        },
        "by_predicate": {
            key: {
                "rows": len(group),
                "exact": sum(row["exact"] for row in group),
                "both_slots_present": sum(
                    row["both_expected_slots_present"] for row in group
                ),
            }
            for key in sorted({row["predicate_id"] for row in rows})
            for group in [[row for row in rows if row["predicate_id"] == key]]
        },
        "prediction_collapses": [
            {"prediction": prediction, "rows": count}
            for prediction, count in sorted(
                predictions.items(), key=lambda item: (-item[1], item[0])
            )
            if count > 1
        ],
    }


def main() -> None:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    args = parse_args()
    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    rows = sorted(
        load_rows(args.development_file, args.expected_rows),
        key=lambda row: row["cell_id"],
    )
    known_subjects = {surface_tokens(row["output_text"])[0] for row in rows}
    known_predicates = {surface_tokens(row["output_text"])[1] for row in rows}

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
    base = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_dir,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
        local_files_only=True,
    )
    model = PeftModel.from_pretrained(base, args.adapter_dir, local_files_only=True)
    model = model.to("cuda").eval()
    special_ids = {int(value) for value in tokenizer.all_special_ids}
    special_ids.add(int(tokenizer.pad_token_id))
    predictions = []
    for batch in batched(rows, args.batch_size):
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
            for row, prediction, token_ids in zip(batch, decoded, generated.tolist())
        )

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=False)
    summary = {
        "schema_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "label": args.label,
        "base_dir": str(args.base_dir.resolve()),
        "adapter_dir": str(args.adapter_dir.resolve()),
        "adapter_weight_sha256": sha256_file(
            args.adapter_dir / "adapter_model.safetensors"
        ),
        "development_file": str(args.development_file.resolve()),
        "development_sha256": sha256_file(args.development_file),
        "decoder": {
            "num_beams": 1,
            "do_sample": False,
            "no_repeat_ngram_size": 0,
            "repetition_penalty": 1.0,
            "length_penalty": 1.0,
            "max_new_tokens": 64,
        },
        "metrics": summarize(predictions),
        "duration_seconds": time.monotonic() - started,
        "claim_limit": "Development-consumed controlled synthesis; not natural-language reliability evidence.",
    }
    with (output_dir / "PREDICTIONS.jsonl").open("w", encoding="utf-8") as handle:
        for row in predictions:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    (output_dir / "SUMMARY.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

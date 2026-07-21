#!/usr/bin/env python3
"""Fail-closed generation-equivalence check for a compact NLLB PEFT adapter."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, set_seed

from merge_nllb_lora import canonicalize_merged_embeddings
from nllb_peft_artifact import initialize_added_rows, language_id


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--adapter-dir", required=True)
    parser.add_argument("--merged-model-dir", required=True)
    parser.add_argument("--data-file", action="append", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--direction", default="eng-mic")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="mic_Latn")
    parser.add_argument("--expected-target-token-id", type=int, required=True)
    parser.add_argument("--task-token", action="append", default=[])
    parser.add_argument("--rows-per-file", type=int, default=16)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-new-tokens", type=int, default=192)
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=3)
    parser.add_argument("--repetition-penalty", type=float, default=1.1)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--dtype",
        choices=("auto", "float32", "float16", "bfloat16"),
        default="auto",
    )
    parser.add_argument(
        "--require-cuda", action=argparse.BooleanOptionalAction, default=True
    )
    return parser.parse_args()


def requested_dtype(name: str) -> torch.dtype | None:
    if name == "auto":
        return (
            torch.bfloat16
            if torch.cuda.is_available() and torch.cuda.is_bf16_supported()
            else None
        )
    return {
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }[name]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalize(text: Any) -> str:
    return " ".join(str(text).split())


def read_rows(
    files: list[str], direction: str, rows_per_file: int
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for file in files:
        selected = 0
        with open(file, "r", encoding="utf-8") as handle:
            for line in handle:
                row = json.loads(line)
                if row.get("direction") != direction:
                    continue
                rows.append(row)
                selected += 1
                if selected >= rows_per_file:
                    break
        if selected != rows_per_file:
            raise RuntimeError(
                f"Expected {rows_per_file} rows from {file}, found {selected}"
            )
    return rows


def configure_generation(model: Any, target_id: int, args: argparse.Namespace) -> None:
    model.config.forced_bos_token_id = target_id
    model.generation_config.forced_bos_token_id = target_id
    model.generation_config.num_beams = args.num_beams
    model.generation_config.no_repeat_ngram_size = args.no_repeat_ngram_size
    model.generation_config.repetition_penalty = args.repetition_penalty
    model.generation_config.length_penalty = args.length_penalty


def generate_ids(
    model: Any,
    tokenizer: Any,
    rows: list[dict[str, Any]],
    args: argparse.Namespace,
) -> list[list[int]]:
    device = next(model.parameters()).device
    generated: list[list[int]] = []
    for offset in range(0, len(rows), args.batch_size):
        batch = rows[offset : offset + args.batch_size]
        encoded = tokenizer(
            [normalize(row["input_text"]) for row in batch],
            padding=True,
            truncation=True,
            max_length=args.max_source_length,
            return_tensors="pt",
        ).to(device)
        with torch.no_grad():
            output = model.generate(
                **encoded,
                max_new_tokens=args.max_new_tokens,
                num_beams=args.num_beams,
                do_sample=False,
                no_repeat_ngram_size=args.no_repeat_ngram_size,
                repetition_penalty=args.repetition_penalty,
                length_penalty=args.length_penalty,
            )
        generated.extend(
            [
                [int(token_id) for token_id in sequence]
                for sequence in output.cpu().tolist()
            ]
        )
    return generated


def input_rows(
    model: Any, token_records: list[dict[str, Any]]
) -> dict[str, torch.Tensor]:
    weight = model.get_input_embeddings().weight.detach().float().cpu()
    return {
        record["token"]: weight[int(record["token_id"])].clone()
        for record in token_records
    }


def main() -> None:
    args = parse_args()
    if args.rows_per_file < 1 or args.batch_size < 1:
        raise SystemExit("--rows-per-file and --batch-size must be positive")
    if args.require_cuda and not torch.cuda.is_available():
        raise SystemExit("CUDA is required by this verification contract")
    if args.dtype == "float16" and not torch.cuda.is_available():
        raise SystemExit("float16 verification requires CUDA")
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    dtype = requested_dtype(args.dtype)

    base_dir = Path(args.base_model).resolve()
    adapter_dir = Path(args.adapter_dir).resolve()
    merged_dir = Path(args.merged_model_dir).resolve()
    output_path = Path(args.output_json).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = read_rows(args.data_file, args.direction, args.rows_per_file)

    base_tokenizer = AutoTokenizer.from_pretrained(
        base_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        adapter_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
    )
    target_id = language_id(tokenizer, args.target_lang)
    source_id = language_id(tokenizer, args.source_lang)
    if target_id != args.expected_target_token_id:
        raise RuntimeError(
            f"Target token ID mismatch: expected={args.expected_target_token_id}, observed={target_id}"
        )
    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang

    base = AutoModelForSeq2SeqLM.from_pretrained(base_dir, torch_dtype=dtype)
    token_records = initialize_added_rows(
        base, base_tokenizer, tokenizer, args.task_token
    )
    adapter_model = PeftModel.from_pretrained(base, adapter_dir)
    configure_generation(adapter_model, target_id, args)
    adapter_model.to(device).eval()
    adapter_predictions = generate_ids(adapter_model, tokenizer, rows, args)

    in_memory_merged = adapter_model.merge_and_unload(safe_merge=True)
    canonicalization = canonicalize_merged_embeddings(in_memory_merged)
    configure_generation(in_memory_merged, target_id, args)
    in_memory_merged.eval()
    in_memory_predictions = generate_ids(in_memory_merged, tokenizer, rows, args)
    in_memory_rows = input_rows(in_memory_merged, token_records)
    del in_memory_merged, adapter_model, base
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    merged_tokenizer = AutoTokenizer.from_pretrained(
        merged_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
    )
    merged_target_id = language_id(merged_tokenizer, args.target_lang)
    if merged_target_id != target_id:
        raise RuntimeError(
            f"Merged tokenizer target ID changed: {merged_target_id} != {target_id}"
        )
    saved_merged = AutoModelForSeq2SeqLM.from_pretrained(merged_dir, torch_dtype=dtype)
    configure_generation(saved_merged, target_id, args)
    saved_merged.to(device).eval()
    saved_predictions = generate_ids(saved_merged, merged_tokenizer, rows, args)
    saved_rows = input_rows(saved_merged, token_records)

    adapter_equals_memory = adapter_predictions == in_memory_predictions
    memory_equals_saved = in_memory_predictions == saved_predictions
    row_equivalence = {
        token: {
            "exact": bool(torch.equal(in_memory_rows[token], saved_rows[token])),
            "max_abs_difference": float(
                (in_memory_rows[token] - saved_rows[token]).abs().max().item()
            ),
        }
        for token in in_memory_rows
    }
    passed = (
        adapter_equals_memory
        and memory_equals_saved
        and all(row["exact"] for row in row_equivalence.values())
    )
    report = {
        "passed": passed,
        "claim_limit": (
            "This verifies artifact equivalence on fixed inputs; it does not measure translation quality."
        ),
        "rows": len(rows),
        "direction": args.direction,
        "source_lang": args.source_lang,
        "target_lang": args.target_lang,
        "source_lang_token_id": source_id,
        "target_lang_token_id": target_id,
        "task_tokens": token_records,
        "dtype": str(dtype) if dtype is not None else "model-default",
        "generation": {
            "num_beams": args.num_beams,
            "no_repeat_ngram_size": args.no_repeat_ngram_size,
            "repetition_penalty": args.repetition_penalty,
            "length_penalty": args.length_penalty,
            "max_new_tokens": args.max_new_tokens,
        },
        "equivalence": {
            "adapter_equals_in_memory_merge": adapter_equals_memory,
            "in_memory_merge_equals_saved_merge": memory_equals_saved,
            "task_input_rows": row_equivalence,
        },
        "merge_canonicalization": canonicalization,
        "inputs": {
            "base_model_safetensors_sha256": sha256_file(
                base_dir / "model.safetensors"
            ),
            "base_tokenizer_json_sha256": sha256_file(base_dir / "tokenizer.json"),
            "adapter_safetensors_sha256": sha256_file(
                adapter_dir / "adapter_model.safetensors"
            ),
            "adapter_tokenizer_json_sha256": sha256_file(
                adapter_dir / "tokenizer.json"
            ),
            "merged_model_safetensors_sha256": sha256_file(
                merged_dir / "model.safetensors"
            ),
            "merged_tokenizer_json_sha256": sha256_file(merged_dir / "tokenizer.json"),
            "data_files": [
                {
                    "path": str(Path(file).resolve()),
                    "sha256": sha256_file(Path(file).resolve()),
                }
                for file in args.data_file
            ],
        },
        "predictions": [
            {
                "id": row.get("id"),
                "input_text": normalize(row.get("input_text")),
                "adapter_token_ids": adapter_ids,
                "merged_token_ids": saved_ids,
                "text": normalize(
                    merged_tokenizer.decode(saved_ids, skip_special_tokens=True)
                ),
            }
            for row, adapter_ids, saved_ids in zip(
                rows, adapter_predictions, saved_predictions, strict=True
            )
        ],
    }
    output_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {key: value for key, value in report.items() if key != "predictions"},
            indent=2,
        )
    )
    if not passed:
        raise SystemExit("Adapter/merge equivalence verification failed")


if __name__ == "__main__":
    main()

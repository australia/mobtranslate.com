#!/usr/bin/env python3
"""Evaluate a generic seq2seq model directory on MobTranslate JSONL rows."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import sacrebleu
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--base-model")
    parser.add_argument("--adapter-dir")
    parser.add_argument("--task-token", action="append", default=[])
    parser.add_argument("--data-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="mic_Latn")
    parser.add_argument("--max-source-length", type=int, default=384)
    parser.add_argument("--max-new-tokens", type=int, default=384)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--num-beams", type=int, default=1)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=0)
    parser.add_argument("--repetition-penalty", type=float, default=1.0)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    parser.add_argument("--max-rows", type=int)
    parser.add_argument("--dtype", choices=("float32", "float16", "bfloat16"), default="bfloat16")
    return parser.parse_args()


def read_rows(file: str, direction: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(file, "r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if row.get("direction") == direction:
                rows.append(row)
    return rows


def chunks(rows: list[dict[str, Any]], size: int):
    for index in range(0, len(rows), size):
        yield rows[index : index + size]


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


def main() -> None:
    args = parse_args()
    if bool(args.base_model) != bool(args.adapter_dir):
        raise SystemExit("--base-model and --adapter-dir must be supplied together")
    dtype = {
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }[args.dtype]
    if args.adapter_dir:
        from nllb_peft_artifact import load_compact_nllb_adapter

        tokenizer, model, _task_tokens = load_compact_nllb_adapter(
            args.base_model,
            args.adapter_dir,
            source_lang=args.source_lang,
            target_lang=args.target_lang,
            task_tokens=args.task_token,
            torch_dtype=dtype,
            local_files_only=True,
        )
    else:
        tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
        model = AutoModelForSeq2SeqLM.from_pretrained(args.model_dir, torch_dtype=dtype)
    model.generation_config.no_repeat_ngram_size = args.no_repeat_ngram_size
    model.generation_config.repetition_penalty = args.repetition_penalty
    model.generation_config.length_penalty = args.length_penalty

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    rows = read_rows(args.data_file, args.direction)
    if args.max_rows is not None:
        rows = rows[: args.max_rows]

    predictions: list[dict[str, Any]] = []
    refs: list[str] = []
    preds: list[str] = []
    for batch in chunks(rows, args.batch_size):
        inputs = tokenizer(
            [normalize_text(row["input_text"]) for row in batch],
            max_length=args.max_source_length,
            truncation=True,
            padding=True,
            return_tensors="pt",
        ).to(device)
        with torch.no_grad():
            generated = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                num_beams=args.num_beams,
                no_repeat_ngram_size=args.no_repeat_ngram_size,
                repetition_penalty=args.repetition_penalty,
                length_penalty=args.length_penalty,
            )
        decoded = [normalize_text(text) for text in tokenizer.batch_decode(generated, skip_special_tokens=True)]
        for row, pred in zip(batch, decoded):
            ref = normalize_text(row["output_text"])
            refs.append(ref)
            preds.append(pred)
            predictions.append({**row, "prediction": pred, "reference": ref})

    metrics = {
        "bleu": sacrebleu.corpus_bleu(preds, [refs]).score if preds else 0.0,
        "chrf": sacrebleu.corpus_chrf(preds, [refs], word_order=2).score if preds else 0.0,
        "rows": len(preds),
        "num_beams": args.num_beams,
        "no_repeat_ngram_size": args.no_repeat_ngram_size,
        "repetition_penalty": args.repetition_penalty,
        "length_penalty": args.length_penalty,
        "dtype": args.dtype,
        "artifact_kind": "compact_peft_adapter" if args.adapter_dir else "merged_model",
    }
    out = {"metrics": metrics, "predictions": predictions}
    Path(args.output_file).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()

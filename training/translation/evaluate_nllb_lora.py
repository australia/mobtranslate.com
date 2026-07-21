#!/usr/bin/env python3
"""Evaluate a merged MobTranslate NLLB model directory on JSONL rows."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import sacrebleu
import torch
import transformers
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--model-revision", default="")
    parser.add_argument("--adapter-dir", default="", help="Optional PEFT adapter; --model-dir is then the base model.")
    parser.add_argument("--data-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument(
        "--use-fast-tokenizer",
        action=argparse.BooleanOptionalAction,
        default=True,
    )
    parser.add_argument("--target-lang-init-from", default="")
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-new-tokens", type=int, default=192)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=0)
    parser.add_argument("--repetition-penalty", type=float, default=1.0)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    parser.add_argument("--dtype", choices=("auto", "float32", "float16", "bfloat16"), default="auto")
    parser.add_argument("--require-cuda", action="store_true")
    parser.add_argument("--deterministic", action="store_true")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--max-rows", type=int)
    return parser.parse_args()


def add_lang_code(tokenizer: Any, model: Any, lang_code: str, init_from: str | None = None) -> int:
    token_id = tokenizer.convert_tokens_to_ids(lang_code)
    if token_id == tokenizer.unk_token_id:
        init_input_embedding = None
        init_output_embedding = None
        if init_from:
            init_id = tokenizer.convert_tokens_to_ids(init_from)
            if init_id != tokenizer.unk_token_id:
                init_input_embedding = model.get_input_embeddings().weight.detach()[init_id].clone()
                output_embeddings = model.get_output_embeddings()
                if output_embeddings is not None:
                    init_output_embedding = output_embeddings.weight.detach()[init_id].clone()
        tokenizer.add_special_tokens({"additional_special_tokens": [lang_code]})
        model.resize_token_embeddings(len(tokenizer))
        token_id = tokenizer.convert_tokens_to_ids(lang_code)
        if init_input_embedding is not None:
            with torch.no_grad():
                model.get_input_embeddings().weight[token_id].copy_(init_input_embedding)
                output_embeddings = model.get_output_embeddings()
                if output_embeddings is not None and init_output_embedding is not None:
                    output_embeddings.weight[token_id].copy_(init_output_embedding)
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[lang_code] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = lang_code
    return token_id


def read_rows(file: str, direction: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(file, "r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if row.get("direction") == direction:
                rows.append(row)
    return rows


def chunks(rows: list[dict[str, Any]], size: int):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def normalize_text(text: str) -> str:
    return " ".join(text.split())


def requested_dtype(name: str) -> torch.dtype | None:
    if name == "auto":
        return torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else None
    return {
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }[name]


def main() -> None:
    args = parse_args()
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    if args.require_cuda and not torch.cuda.is_available():
        raise SystemExit("CUDA is required for this evaluation but torch.cuda.is_available() is false")
    if args.dtype == "bfloat16" and torch.cuda.is_available() and not torch.cuda.is_bf16_supported():
        raise SystemExit("bfloat16 was requested but the CUDA device does not report bfloat16 support")
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
    if args.deterministic:
        torch.use_deterministic_algorithms(True)

    tokenizer_source = args.adapter_dir or args.model_dir
    tokenizer_revision = None if args.adapter_dir else (args.model_revision or None)
    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_source,
        revision=tokenizer_revision,
        use_fast=args.use_fast_tokenizer,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(
        args.model_dir,
        revision=args.model_revision or None,
        torch_dtype=requested_dtype(args.dtype),
    )
    if args.adapter_dir:
        from peft import PeftModel

        model.resize_token_embeddings(len(tokenizer))
        model = PeftModel.from_pretrained(model, args.adapter_dir)
    else:
        from evaluate_migmaq_lexical_baseline import restore_serialized_nllb_input_aliases

        restore_serialized_nllb_input_aliases(model)
    target_id = add_lang_code(tokenizer, model, args.target_lang, args.target_lang_init_from or None)
    add_lang_code(tokenizer, model, args.source_lang)
    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang
    model.config.forced_bos_token_id = target_id
    model.generation_config.forced_bos_token_id = target_id
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
                forced_bos_token_id=target_id,
                max_new_tokens=args.max_new_tokens,
                num_beams=args.num_beams,
                no_repeat_ngram_size=args.no_repeat_ngram_size,
                repetition_penalty=args.repetition_penalty,
                length_penalty=args.length_penalty,
                do_sample=False,
            )
        decoded = [normalize_text(text) for text in tokenizer.batch_decode(generated, skip_special_tokens=True)]
        for row, pred in zip(batch, decoded):
            ref = normalize_text(row["output_text"])
            refs.append(ref)
            preds.append(pred)
            predictions.append({**row, "prediction": pred, "reference": ref})

    bleu_metric = sacrebleu.metrics.BLEU()
    chrf_metric = sacrebleu.metrics.CHRF(word_order=2)
    bleu_score = bleu_metric.corpus_score(preds, [refs]) if preds else None
    chrf_score = chrf_metric.corpus_score(preds, [refs]) if preds else None
    metrics = {
        "bleu": bleu_score.score if bleu_score else 0.0,
        "bleu_signature": str(bleu_metric.get_signature()) if bleu_score else None,
        "chrf": chrf_score.score if chrf_score else 0.0,
        "chrf_signature": str(chrf_metric.get_signature()) if chrf_score else None,
        "exact_match": sum(pred == ref for pred, ref in zip(preds, refs)) / len(preds) if preds else 0.0,
        "empty_outputs": sum(not pred for pred in preds),
        "source_copy_outputs": sum(
            pred == normalize_text(row["input_text"]) for pred, row in zip(preds, rows)
        ),
        "mean_prediction_characters": sum(len(pred) for pred in preds) / len(preds) if preds else 0.0,
        "mean_reference_characters": sum(len(ref) for ref in refs) / len(refs) if refs else 0.0,
        "rows": len(preds),
        "direction": args.direction,
        "source_lang": args.source_lang,
        "target_lang": args.target_lang,
        "use_fast_tokenizer": args.use_fast_tokenizer,
        "batch_size": args.batch_size,
        "max_source_length": args.max_source_length,
        "max_new_tokens": args.max_new_tokens,
        "num_beams": args.num_beams,
        "no_repeat_ngram_size": args.no_repeat_ngram_size,
        "repetition_penalty": args.repetition_penalty,
        "length_penalty": args.length_penalty,
        "do_sample": False,
        "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
        "seed": args.seed,
        "cuda_matmul_allow_tf32": torch.backends.cuda.matmul.allow_tf32,
        "cudnn_allow_tf32": torch.backends.cudnn.allow_tf32,
        "device": str(device),
        "dtype": str(next(model.parameters()).dtype),
        "torch_version": torch.__version__,
        "transformers_version": transformers.__version__,
        "cuda_version": torch.version.cuda,
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }

    out = {"metrics": metrics, "predictions": predictions}
    Path(args.output_file).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()

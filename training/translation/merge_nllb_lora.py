#!/usr/bin/env python3
"""Merge a saved MobTranslate NLLB LoRA adapter into a standalone model."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--base-model", default="facebook/nllb-200-distilled-600M")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=4)
    parser.add_argument("--repetition-penalty", type=float, default=1.15)
    parser.add_argument("--length-penalty", type=float, default=0.8)
    parser.add_argument("--trust-remote-code", action=argparse.BooleanOptionalAction, default=False)
    return parser.parse_args()


def add_lang_code(tokenizer: Any, model: Any, lang_code: str) -> int:
    token_id = tokenizer.convert_tokens_to_ids(lang_code)
    if token_id == tokenizer.unk_token_id:
        tokenizer.add_special_tokens({"additional_special_tokens": [lang_code]})
        model.resize_token_embeddings(len(tokenizer))
        token_id = tokenizer.convert_tokens_to_ids(lang_code)
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[lang_code] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = lang_code
    return token_id


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(
        args.adapter_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        trust_remote_code=args.trust_remote_code,
    )
    dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else None
    base = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_model,
        torch_dtype=dtype,
        trust_remote_code=args.trust_remote_code,
    )
    base.resize_token_embeddings(len(tokenizer))
    add_lang_code(tokenizer, base, args.source_lang)
    target_id = add_lang_code(tokenizer, base, args.target_lang)

    model = PeftModel.from_pretrained(base, args.adapter_dir)
    merged = model.merge_and_unload()
    if hasattr(merged, "tie_weights"):
        merged.tie_weights()
    merged.config.forced_bos_token_id = target_id
    merged.generation_config.forced_bos_token_id = target_id
    merged.generation_config.num_beams = args.num_beams
    merged.generation_config.no_repeat_ngram_size = args.no_repeat_ngram_size
    merged.generation_config.repetition_penalty = args.repetition_penalty
    merged.generation_config.length_penalty = args.length_penalty

    merged.save_pretrained(str(output_dir), safe_serialization=True)
    tokenizer.save_pretrained(str(output_dir))
    print(f"saved {output_dir}")


if __name__ == "__main__":
    main()

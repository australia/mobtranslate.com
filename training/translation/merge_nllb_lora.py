#!/usr/bin/env python3
"""Merge a saved MobTranslate NLLB LoRA adapter into a standalone model."""

from __future__ import annotations

import argparse
import json
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
    parser.add_argument("--base-model-revision", default="")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--target-lang-init-from", default="")
    parser.add_argument(
        "--dtype",
        choices=("auto", "float32", "float16", "bfloat16"),
        default="auto",
        help="Precision used while applying the LoRA delta before serialization.",
    )
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=4)
    parser.add_argument("--repetition-penalty", type=float, default=1.15)
    parser.add_argument("--length-penalty", type=float, default=0.8)
    parser.add_argument("--max-new-tokens", type=int, default=192)
    parser.add_argument(
        "--trust-remote-code", action=argparse.BooleanOptionalAction, default=False
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


def initialize_input_language_embedding(
    tokenizer: Any, model: Any, lang_code: str, init_from: str
) -> None:
    if not init_from:
        return
    token_id = tokenizer.convert_tokens_to_ids(lang_code)
    init_id = tokenizer.convert_tokens_to_ids(init_from)
    if token_id == tokenizer.unk_token_id or init_id == tokenizer.unk_token_id:
        raise ValueError(
            f"Cannot initialize {lang_code} from missing token {init_from}"
        )
    with torch.no_grad():
        model.get_input_embeddings().weight[token_id].copy_(
            model.get_input_embeddings().weight[init_id]
        )


def canonicalize_merged_embeddings(model: Any) -> dict[str, Any]:
    inner = model.model
    encoder_embeddings = inner.encoder.embed_tokens
    decoder_embeddings = inner.decoder.embed_tokens
    shared_embeddings = inner.shared
    encoder_decoder_tied_before = (
        encoder_embeddings.weight.data_ptr() == decoder_embeddings.weight.data_ptr()
    )
    encoder_decoder_values_equal = encoder_decoder_tied_before or torch.equal(
        encoder_embeddings.weight.detach(), decoder_embeddings.weight.detach()
    )
    if not encoder_decoder_values_equal:
        raise RuntimeError(
            "NLLB encoder and decoder embedding values diverged before serialization"
        )
    shared_was_runtime = (
        shared_embeddings.weight.data_ptr() == decoder_embeddings.weight.data_ptr()
    )
    shared_values_equal_runtime = shared_was_runtime or torch.equal(
        shared_embeddings.weight.detach(), decoder_embeddings.weight.detach()
    )
    inner.shared = decoder_embeddings
    inner.encoder.embed_tokens = decoder_embeddings
    inner.decoder.embed_tokens = decoder_embeddings
    output_embeddings = model.get_output_embeddings()
    model.config.tie_word_embeddings = (
        output_embeddings is not None
        and output_embeddings.weight.data_ptr() == decoder_embeddings.weight.data_ptr()
    )
    return {
        "shared_was_runtime_embedding": shared_was_runtime,
        "shared_values_equal_runtime_before": shared_values_equal_runtime,
        "canonicalized_shared_from_decoder": not shared_was_runtime,
        "encoder_decoder_tied_before": encoder_decoder_tied_before,
        "encoder_decoder_values_equal_before": encoder_decoder_values_equal,
        "encoder_decoder_tied": True,
        "output_head_tied": model.config.tie_word_embeddings,
    }


def standalone_serialization_state_dict(model: Any) -> dict[str, torch.Tensor]:
    state = model.state_dict()
    runtime_embedding = model.model.decoder.embed_tokens.weight.detach().cpu()
    for key in (
        "model.shared.weight",
        "model.encoder.embed_tokens.weight",
        "model.decoder.embed_tokens.weight",
    ):
        if key not in state:
            raise RuntimeError(
                f"Expected embedding key is absent from merged state: {key}"
            )
        state[key] = runtime_embedding.clone()
    return state


def main() -> None:
    args = parse_args()
    if (
        args.dtype == "bfloat16"
        and torch.cuda.is_available()
        and not torch.cuda.is_bf16_supported()
    ):
        raise SystemExit(
            "bfloat16 was requested but the CUDA device does not report bfloat16 support"
        )
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(
        args.adapter_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        trust_remote_code=args.trust_remote_code,
    )
    base = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_model,
        revision=args.base_model_revision or None,
        torch_dtype=requested_dtype(args.dtype),
        trust_remote_code=args.trust_remote_code,
    )
    base.resize_token_embeddings(len(tokenizer))
    add_lang_code(tokenizer, base, args.source_lang)
    target_id = add_lang_code(tokenizer, base, args.target_lang)
    initialize_input_language_embedding(
        tokenizer, base, args.target_lang, args.target_lang_init_from
    )

    model = PeftModel.from_pretrained(base, args.adapter_dir)
    merged = model.merge_and_unload(safe_merge=True)
    canonicalize_merged_embeddings(merged)
    merged.config.forced_bos_token_id = target_id
    merged.generation_config.forced_bos_token_id = target_id
    merged.generation_config.num_beams = args.num_beams
    merged.generation_config.no_repeat_ngram_size = args.no_repeat_ngram_size
    merged.generation_config.repetition_penalty = args.repetition_penalty
    merged.generation_config.length_penalty = args.length_penalty

    merged.save_pretrained(
        str(output_dir),
        state_dict=standalone_serialization_state_dict(merged),
        safe_serialization=True,
    )
    tokenizer.save_pretrained(str(output_dir))
    generation_path = output_dir / "generation_config.json"
    generation = json.loads(generation_path.read_text(encoding="utf-8"))
    generation.update(
        {
            "do_sample": False,
            "forced_bos_token_id": target_id,
            "length_penalty": args.length_penalty,
            "max_new_tokens": args.max_new_tokens,
            "no_repeat_ngram_size": args.no_repeat_ngram_size,
            "num_beams": args.num_beams,
            "repetition_penalty": args.repetition_penalty,
        }
    )
    generation_path.write_text(
        json.dumps(generation, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"saved {output_dir}")


if __name__ == "__main__":
    main()

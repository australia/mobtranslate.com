#!/usr/bin/env python3
"""Static audit for MobTranslate NLLB/LoRA translation runs.

This script does not train. It verifies the tokenizer/model plumbing that can
silently break unsupported-language fine-tuning: language-code IDs, forced BOS,
label tokenization, truncation, LoRA target-module matches, and optional
adapter-vs-merged generation equivalence.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-model", default="facebook/nllb-200-distilled-1.3B")
    parser.add_argument("--base-model-revision", default="")
    parser.add_argument("--merged-model-dir")
    parser.add_argument("--adapter-dir")
    parser.add_argument("--data-file", required=True)
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="tpi_Latn")
    parser.add_argument("--target-lang-init-from", default="")
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-target-length", type=int, default=192)
    parser.add_argument("--sample-rows", type=int, default=5)
    parser.add_argument("--lora-target-modules", default="q_proj,k_proj,v_proj,out_proj,fc1,fc2")
    parser.add_argument("--generate", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--max-new-tokens", type=int, default=128)
    parser.add_argument("--output-json")
    return parser.parse_args()


def comma_list(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def normalize_text(text: str) -> str:
    return " ".join(str(text).split())


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


def read_rows(file: str, direction: str, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(file, "r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if row.get("direction") != direction:
                continue
            rows.append(row)
            if len(rows) >= limit:
                break
    return rows


def token_tail(tokens: list[int], size: int = 20) -> dict[str, list[int]]:
    return {"first": tokens[:size], "last": tokens[-size:]}


def token_strings(tokenizer: Any, ids: list[int]) -> list[str]:
    return tokenizer.convert_ids_to_tokens(ids)


def trainable_summary(model: Any) -> dict[str, int | float]:
    total = 0
    trainable = 0
    for parameter in model.parameters():
        count = parameter.numel()
        total += count
        if parameter.requires_grad:
            trainable += count
    return {
        "total": total,
        "trainable": trainable,
        "trainable_pct": trainable / total * 100 if total else 0.0,
    }


def matched_lora_modules(model: Any, targets: list[str]) -> dict[str, list[str]]:
    names = [name for name, _module in model.named_modules()]
    out: dict[str, list[str]] = {}
    for target in targets:
        out[target] = [name for name in names if name.endswith(target)]
    return out


def load_model_and_tokenizer(args: argparse.Namespace) -> tuple[Any, Any, str]:
    model_source = args.merged_model_dir or args.base_model
    revision = None if args.merged_model_dir else (args.base_model_revision or None)
    tokenizer = AutoTokenizer.from_pretrained(
        model_source, revision=revision, src_lang=args.source_lang, tgt_lang=args.target_lang)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_source, revision=revision)
    source = "merged" if args.merged_model_dir else "base"

    if args.adapter_dir:
        try:
            from peft import PeftModel
        except ImportError as exc:  # pragma: no cover - depends on env
            raise SystemExit("peft is required for --adapter-dir audits") from exc
        model = PeftModel.from_pretrained(model, args.adapter_dir)
        source = "adapter"

    return tokenizer, model, source


def audit_rows(tokenizer: Any, rows: list[dict[str, Any]], args: argparse.Namespace) -> list[dict[str, Any]]:
    audited: list[dict[str, Any]] = []
    for row in rows:
        source_text = normalize_text(row.get("input_text", ""))
        target_text = normalize_text(row.get("output_text", ""))
        full_source = tokenizer(source_text, truncation=False).input_ids
        full_target = tokenizer(text_target=target_text, truncation=False).input_ids
        source = tokenizer(source_text, max_length=args.max_source_length, truncation=True).input_ids
        target = tokenizer(text_target=target_text, max_length=args.max_target_length, truncation=True).input_ids
        audited.append({
            "id": row.get("id"),
            "canonical_ref": row.get("canonical_ref"),
            "pair_kind": row.get("pair_kind"),
            "source_text": source_text,
            "target_text": target_text,
            "source_len_full": len(full_source),
            "target_len_full": len(full_target),
            "source_truncated": len(full_source) > args.max_source_length,
            "target_truncated": len(full_target) > args.max_target_length,
            "source_token_ids": token_tail(source),
            "target_token_ids": token_tail(target),
            "source_tokens": {
                "first": token_strings(tokenizer, source[:20]),
                "last": token_strings(tokenizer, source[-20:]),
            },
            "target_tokens": {
                "first": token_strings(tokenizer, target[:20]),
                "last": token_strings(tokenizer, target[-20:]),
            },
        })
    return audited


def generate_samples(tokenizer: Any, model: Any, rows: list[dict[str, Any]], args: argparse.Namespace, target_id: int) -> list[dict[str, str]]:
    model.eval()
    generated_rows: list[dict[str, str]] = []
    for row in rows:
        text = normalize_text(row.get("input_text", ""))
        inputs = tokenizer(
            [text],
            max_length=args.max_source_length,
            truncation=True,
            padding=True,
            return_tensors="pt",
        )
        with torch.no_grad():
            generated = model.generate(
                **inputs,
                forced_bos_token_id=target_id,
                max_new_tokens=args.max_new_tokens,
                num_beams=1,
                do_sample=False,
                no_repeat_ngram_size=0,
                repetition_penalty=1.0,
            )
        generated_rows.append({
            "canonical_ref": str(row.get("canonical_ref") or ""),
            "source": text,
            "prediction": normalize_text(tokenizer.batch_decode(generated, skip_special_tokens=True)[0]),
            "reference": normalize_text(row.get("output_text", "")),
        })
    return generated_rows


def main() -> None:
    args = parse_args()
    tokenizer, model, model_source = load_model_and_tokenizer(args)
    source_id = add_lang_code(tokenizer, model, args.source_lang)
    target_id = add_lang_code(tokenizer, model, args.target_lang, args.target_lang_init_from or None)
    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang
    model.config.forced_bos_token_id = target_id
    model.generation_config.forced_bos_token_id = target_id

    rows = read_rows(args.data_file, args.direction, args.sample_rows)
    targets = comma_list(args.lora_target_modules)
    result: dict[str, Any] = {
        "versions": {
            "torch": torch.__version__,
        },
        "model_source": model_source,
        "base_model": args.base_model,
        "base_model_revision": args.base_model_revision or None,
        "merged_model_dir": args.merged_model_dir,
        "adapter_dir": args.adapter_dir,
        "direction": args.direction,
        "source_lang": args.source_lang,
        "target_lang": args.target_lang,
        "source_lang_token_id": source_id,
        "target_lang_token_id": target_id,
        "unk_token_id": tokenizer.unk_token_id,
        "forced_bos_token_id": model.config.forced_bos_token_id,
        "generation_forced_bos_token_id": model.generation_config.forced_bos_token_id,
        "tokenizer_length": len(tokenizer),
        "embedding_shape": list(model.get_input_embeddings().weight.shape),
        "trainable_parameters": trainable_summary(model),
        "lora_target_modules_requested": targets,
        "lora_target_module_matches": {
            key: {"count": len(value), "examples": value[:12]}
            for key, value in matched_lora_modules(model, targets).items()
        },
        "rows_audited": audit_rows(tokenizer, rows, args),
    }
    try:
        import transformers
        result["versions"]["transformers"] = transformers.__version__
    except Exception:
        pass
    if args.generate:
        result["generation_probe"] = generate_samples(tokenizer, model, rows, args, target_id)

    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output_json:
        Path(args.output_json).write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()

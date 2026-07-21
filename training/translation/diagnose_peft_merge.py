#!/usr/bin/env python3
"""Compare PEFT adapter, in-memory merge, and saved/reloaded merge behavior."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--base-model-revision", default="")
    parser.add_argument("--adapter-dir", required=True)
    parser.add_argument("--data-file", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="mic_Latn")
    parser.add_argument("--rows", type=int, default=8)
    parser.add_argument("--canonicalize-runtime-embeddings", action=argparse.BooleanOptionalAction, default=False)
    return parser.parse_args()


def language_id(tokenizer: Any, language: str) -> int:
    token_id = tokenizer.convert_tokens_to_ids(language)
    if token_id == tokenizer.unk_token_id:
        raise ValueError(f"Language token is missing from adapter tokenizer: {language}")
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[language] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = language
    return token_id


def read_rows(file: str, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(file, "r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if row.get("direction") == "eng-mic":
                rows.append(row)
            if len(rows) >= limit:
                break
    return rows


def generate(model: Any, tokenizer: Any, rows: list[dict[str, Any]], target_id: int) -> list[str]:
    device = next(model.parameters()).device
    encoded = tokenizer(
        [" ".join(str(row["input_text"]).split()) for row in rows],
        padding=True,
        truncation=True,
        max_length=192,
        return_tensors="pt",
    ).to(device)
    with torch.no_grad():
        generated = model.generate(
            **encoded,
            forced_bos_token_id=target_id,
            max_new_tokens=128,
            num_beams=1,
            do_sample=False,
        )
    return [" ".join(text.split()) for text in tokenizer.batch_decode(generated, skip_special_tokens=True)]


def tensor_stats(left: torch.Tensor, right: torch.Tensor) -> dict[str, Any]:
    left = left.detach().float().cpu()
    right = right.detach().float().cpu()
    difference = (left - right).abs()
    return {
        "shape": list(left.shape),
        "allclose": bool(torch.allclose(left, right, atol=1e-5, rtol=1e-5)),
        "max_abs_difference": float(difference.max()),
        "mean_abs_difference": float(difference.mean()),
    }


def state_dict_differences(left: Any, right: Any) -> dict[str, Any]:
    left_state = left.state_dict()
    right_state = right.state_dict()
    missing_left = sorted(set(right_state) - set(left_state))
    missing_right = sorted(set(left_state) - set(right_state))
    differences: list[dict[str, Any]] = []
    for name in sorted(set(left_state) & set(right_state)):
        left_tensor = left_state[name].detach().float().cpu()
        right_tensor = right_state[name].detach().float().cpu()
        if left_tensor.shape != right_tensor.shape:
            differences.append({"name": name, "shape_left": list(left_tensor.shape), "shape_right": list(right_tensor.shape)})
            continue
        maximum = float((left_tensor - right_tensor).abs().max())
        if maximum > 1e-5:
            differences.append({"name": name, "max_abs_difference": maximum})
    differences.sort(key=lambda item: float(item.get("max_abs_difference", float("inf"))), reverse=True)
    return {
        "left_keys": len(left_state),
        "right_keys": len(right_state),
        "missing_left": missing_left,
        "missing_right": missing_right,
        "different_count": len(differences),
        "largest_differences": differences[:30],
    }


def canonicalize_runtime_embeddings(model: Any) -> None:
    runtime_embeddings = model.model.decoder.embed_tokens
    if model.model.encoder.embed_tokens.weight.data_ptr() != runtime_embeddings.weight.data_ptr():
        raise RuntimeError("Encoder and decoder embeddings are unexpectedly distinct")
    model.model.shared = runtime_embeddings
    model.model.encoder.embed_tokens = runtime_embeddings
    model.model.decoder.embed_tokens = runtime_embeddings
    output_embeddings = model.get_output_embeddings()
    model.config.tie_word_embeddings = (
        output_embeddings is not None
        and output_embeddings.weight.data_ptr() == runtime_embeddings.weight.data_ptr()
    )


def serialization_state_dict(model: Any) -> dict[str, torch.Tensor]:
    state = model.state_dict()
    runtime_embedding = model.model.decoder.embed_tokens.weight.detach().cpu()
    for key in (
        "model.shared.weight",
        "model.encoder.embed_tokens.weight",
        "model.decoder.embed_tokens.weight",
    ):
        state[key] = runtime_embedding.clone()
    return state


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(
        args.adapter_dir, src_lang=args.source_lang, tgt_lang=args.target_lang)
    base = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_model,
        revision=args.base_model_revision or None,
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else None,
    )
    base.resize_token_embeddings(len(tokenizer))
    model = PeftModel.from_pretrained(base, args.adapter_dir)
    target_id = language_id(tokenizer, args.target_lang)
    language_id(tokenizer, args.source_lang)
    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang
    model.config.forced_bos_token_id = target_id
    model.generation_config.forced_bos_token_id = target_id
    model.to(torch.device("cuda" if torch.cuda.is_available() else "cpu"))
    model.eval()

    rows = read_rows(args.data_file, args.rows)
    adapter_predictions = generate(model, tokenizer, rows, target_id)
    shared_before = copy.deepcopy(model.base_model.model.model.shared.modules_to_save.default.weight.detach().cpu())
    lm_head_before = copy.deepcopy(model.base_model.model.lm_head.modules_to_save.default.weight.detach().cpu())

    merged = model.merge_and_unload(safe_merge=True)
    merged.config.forced_bos_token_id = target_id
    merged.generation_config.forced_bos_token_id = target_id
    merged.eval()
    in_memory_predictions = generate(merged, tokenizer, rows, target_id)
    shared_after = merged.model.shared.weight.detach().cpu()
    lm_head_after = merged.lm_head.weight.detach().cpu()
    if args.canonicalize_runtime_embeddings:
        canonicalize_runtime_embeddings(merged)
    merged.save_pretrained(
        output_dir,
        state_dict=serialization_state_dict(merged) if args.canonicalize_runtime_embeddings else None,
        safe_serialization=True,
    )
    tokenizer.save_pretrained(output_dir)

    reloaded = AutoModelForSeq2SeqLM.from_pretrained(
        output_dir,
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else None,
    )
    reloaded.to(torch.device("cuda" if torch.cuda.is_available() else "cpu"))
    reloaded.eval()
    reloaded_predictions = generate(reloaded, tokenizer, rows, target_id)
    state_comparison = state_dict_differences(merged, reloaded)

    result = {
        "target_id": target_id,
        "canonicalize_runtime_embeddings": args.canonicalize_runtime_embeddings,
        "config_after_merge": {
            "tie_word_embeddings": merged.config.tie_word_embeddings,
            "forced_bos_token_id": merged.config.forced_bos_token_id,
            "generation_forced_bos_token_id": merged.generation_config.forced_bos_token_id,
        },
        "weights": {
            "shared_adapter_to_merged": tensor_stats(shared_before, shared_after),
            "lm_head_adapter_to_merged": tensor_stats(lm_head_before, lm_head_after),
            "shared_to_lm_head_after_merge": tensor_stats(shared_after, lm_head_after),
            "custom_shared_row_adapter_to_merged": tensor_stats(shared_before[target_id], shared_after[target_id]),
            "custom_lm_head_row_adapter_to_merged": tensor_stats(lm_head_before[target_id], lm_head_after[target_id]),
        },
        "merged_to_reloaded_state": state_comparison,
        "config_difference": {
            key: {"merged": value, "reloaded": reloaded.config.to_dict().get(key)}
            for key, value in merged.config.to_dict().items()
            if value != reloaded.config.to_dict().get(key)
        },
        "predictions": [
            {
                "id": row.get("id"),
                "reference": row.get("output_text"),
                "adapter": adapter_prediction,
                "in_memory_merged": merged_prediction,
                "reloaded_merged": reloaded_prediction,
            }
            for row, adapter_prediction, merged_prediction, reloaded_prediction in zip(
                rows, adapter_predictions, in_memory_predictions, reloaded_predictions)
        ],
        "prediction_equivalence": {
            "adapter_equals_in_memory_merge": adapter_predictions == in_memory_predictions,
            "in_memory_equals_reloaded_merge": in_memory_predictions == reloaded_predictions,
        },
    }
    (output_dir / "merge-diagnostic.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

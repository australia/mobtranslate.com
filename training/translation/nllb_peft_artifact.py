"""Load compact MobTranslate NLLB adapters with reproducible vocabulary extension."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def language_id(tokenizer: Any, language: str) -> int:
    token_id = int(tokenizer.convert_tokens_to_ids(language))
    if token_id == tokenizer.unk_token_id:
        raise RuntimeError(f"Language token is absent: {language}")
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[language] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = language
    return token_id


def canonicalize_nllb_input_embeddings(model: Any) -> dict[str, Any]:
    """Restore NLLB's shared input-embedding topology after dtype conversion.

    Transformers can materialize the serialized shared, encoder, and decoder
    tensors separately when loading directly into BF16 even though their values
    are identical.  They are frozen for these adapters, so aliasing them again
    preserves the function while making the runtime independent of load dtype.
    """
    inner = model.model
    shared = inner.shared
    encoder = inner.encoder.embed_tokens
    decoder = inner.decoder.embed_tokens
    before = {
        "encoder_shared_tied": encoder.weight.data_ptr() == shared.weight.data_ptr(),
        "decoder_shared_tied": decoder.weight.data_ptr() == shared.weight.data_ptr(),
        "encoder_shared_values_equal": torch.equal(encoder.weight, shared.weight),
        "decoder_shared_values_equal": torch.equal(decoder.weight, shared.weight),
    }
    if not before["encoder_shared_values_equal"] or not before["decoder_shared_values_equal"]:
        raise RuntimeError(f"NLLB input embeddings diverged before adapter load: {before}")

    model.set_input_embeddings(shared)
    after = {
        "encoder_shared_tied": inner.encoder.embed_tokens.weight.data_ptr()
        == inner.shared.weight.data_ptr(),
        "decoder_shared_tied": inner.decoder.embed_tokens.weight.data_ptr()
        == inner.shared.weight.data_ptr(),
    }
    if not all(after.values()):
        raise RuntimeError(f"Could not restore NLLB input-embedding aliases: {after}")
    return {"before": before, "after": after}


def initialize_added_rows(
    model: Any,
    base_tokenizer: Any,
    adapter_tokenizer: Any,
    task_tokens: list[str],
) -> list[dict[str, Any]]:
    vocabulary_delta = len(adapter_tokenizer) - len(base_tokenizer)
    if vocabulary_delta < 0:
        raise RuntimeError("Adapter tokenizer is smaller than the frozen base tokenizer")
    if vocabulary_delta == 0:
        if task_tokens:
            raise RuntimeError("Task tokens were requested but the adapter tokenizer does not extend the base")
        return []
    if vocabulary_delta != len(task_tokens):
        raise RuntimeError(
            "Every appended vocabulary row must have one declared task token: "
            f"vocabulary_delta={vocabulary_delta}, task_tokens={task_tokens}"
        )

    input_weight = model.get_input_embeddings().weight.detach()
    output_embeddings = model.get_output_embeddings()
    if output_embeddings is None:
        raise RuntimeError("Base model does not expose an output head")
    initializers: list[tuple[str, int, list[int], torch.Tensor, torch.Tensor]] = []
    for token in task_tokens:
        adapter_id = int(adapter_tokenizer.convert_tokens_to_ids(token))
        encoded = adapter_tokenizer.encode(token, add_special_tokens=False)
        if encoded != [adapter_id] or adapter_id not in adapter_tokenizer.all_special_ids:
            raise RuntimeError(f"Task token is not one registered special ID: {token} -> {encoded}")
        decomposition = [int(item) for item in base_tokenizer.encode(token, add_special_tokens=False)]
        if not decomposition or base_tokenizer.unk_token_id in decomposition:
            raise RuntimeError(f"Base-tokenizer decomposition is invalid for {token}: {decomposition}")
        initializers.append(
            (
                token,
                adapter_id,
                decomposition,
                input_weight[decomposition].float().mean(dim=0).clone(),
                output_embeddings.weight.detach()[decomposition].float().mean(dim=0).clone(),
            )
        )

    model.resize_token_embeddings(len(adapter_tokenizer), mean_resizing=False)
    with torch.no_grad():
        input_embeddings = model.get_input_embeddings()
        output_embeddings = model.get_output_embeddings()
        if output_embeddings is None:
            raise RuntimeError("Resized model does not expose an output head")
        for _token, token_id, _decomposition, input_mean, output_mean in initializers:
            input_embeddings.weight[token_id].copy_(
                input_mean.to(input_embeddings.weight.device, input_embeddings.weight.dtype)
            )
            output_embeddings.weight[token_id].copy_(
                output_mean.to(output_embeddings.weight.device, output_embeddings.weight.dtype)
            )

    return [
        {
            "token": token,
            "token_id": token_id,
            "base_decomposition_ids": decomposition,
            "base_decomposition_tokens": base_tokenizer.convert_ids_to_tokens(decomposition),
        }
        for token, token_id, decomposition, _input_mean, _output_mean in initializers
    ]


def load_compact_nllb_adapter(
    base_model: str | Path,
    adapter_dir: str | Path,
    *,
    source_lang: str,
    target_lang: str,
    task_tokens: list[str],
    torch_dtype: torch.dtype | None,
    local_files_only: bool = True,
) -> tuple[Any, Any, list[dict[str, Any]]]:
    base_model = str(Path(base_model).resolve())
    adapter_dir = str(Path(adapter_dir).resolve())
    base_tokenizer = AutoTokenizer.from_pretrained(
        base_model,
        src_lang=source_lang,
        tgt_lang=target_lang,
        local_files_only=local_files_only,
    )
    adapter_tokenizer = AutoTokenizer.from_pretrained(
        adapter_dir,
        src_lang=source_lang,
        tgt_lang=target_lang,
        local_files_only=local_files_only,
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(
        base_model,
        torch_dtype=torch_dtype,
        local_files_only=local_files_only,
    )
    canonicalize_nllb_input_embeddings(model)
    token_records = initialize_added_rows(model, base_tokenizer, adapter_tokenizer, task_tokens)
    model = PeftModel.from_pretrained(model, adapter_dir, local_files_only=local_files_only)
    language_id(adapter_tokenizer, source_lang)
    language_id(adapter_tokenizer, target_lang)
    adapter_tokenizer.src_lang = source_lang
    adapter_tokenizer.tgt_lang = target_lang
    return adapter_tokenizer, model, token_records


def compact_adapter_topology_audit(model: Any) -> dict[str, Any]:
    base = model.get_base_model()
    inner = base.model
    encoder_embeddings = inner.encoder.embed_tokens
    decoder_embeddings = inner.decoder.embed_tokens
    shared_embeddings = base.get_input_embeddings()
    output_embeddings = model.get_output_embeddings()
    if output_embeddings is None:
        raise RuntimeError("Adapter model does not expose an output head")
    trainable_wrappers = [
        name
        for name, module in model.named_modules(remove_duplicate=False)
        if module.__class__.__name__ == "TrainableTokensWrapper"
    ]
    return {
        "encoder_embedding_class": encoder_embeddings.__class__.__name__,
        "decoder_embedding_class": decoder_embeddings.__class__.__name__,
        "shared_embedding_class": shared_embeddings.__class__.__name__,
        "output_embedding_class": output_embeddings.__class__.__name__,
        "trainable_token_wrapper_modules": trainable_wrappers,
        "encoder_shared_base_weight_tied": (
            encoder_embeddings.weight.data_ptr() == shared_embeddings.weight.data_ptr()
        ),
        "decoder_shared_base_weight_tied": (
            decoder_embeddings.weight.data_ptr() == shared_embeddings.weight.data_ptr()
        ),
        "encoder_shared_values_equal": torch.equal(
            encoder_embeddings.weight, shared_embeddings.weight
        ),
        "decoder_shared_values_equal": torch.equal(
            decoder_embeddings.weight, shared_embeddings.weight
        ),
        "output_head_tied_to_shared": (
            output_embeddings.weight.data_ptr() == shared_embeddings.weight.data_ptr()
        ),
        "config_tie_word_embeddings": bool(base.config.tie_word_embeddings),
        "vocabulary_size": int(shared_embeddings.weight.shape[0]),
    }

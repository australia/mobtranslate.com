"""Load compact MobTranslate NLLB adapters with reproducible vocabulary extension."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

try:
    from .materialize_nllb_control_model import (
        initialize_control_rows,
        tokenizer_bundle_identity,
    )
    from .nllb_tokenizer_remap import remap_nllb_for_tokenizer_extension
except ImportError:
    from materialize_nllb_control_model import (
        initialize_control_rows,
        tokenizer_bundle_identity,
    )
    from nllb_tokenizer_remap import remap_nllb_for_tokenizer_extension


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_control_contract_bundle(
    raw_base_model: Path,
    control_contract_dir: Path,
    expected_manifest_sha256: str,
) -> dict[str, Any]:
    manifest_path = control_contract_dir / "MANIFEST.json"
    observed_manifest_sha256 = sha256_file(manifest_path)
    if observed_manifest_sha256 != expected_manifest_sha256:
        raise RuntimeError(
            "Control-tokenizer contract SHA-256 mismatch: "
            f"expected={expected_manifest_sha256}, observed={observed_manifest_sha256}"
        )
    contract = json.loads(manifest_path.read_text(encoding="utf-8"))
    if contract.get("status") != "PASS":
        raise RuntimeError("Control-tokenizer contract is not PASS")
    for relative, expected in sorted(contract["base"]["bundle"]["files"].items()):
        path = raw_base_model / relative
        if not path.is_file() or sha256_file(path) != expected:
            raise RuntimeError(f"Raw base-model bundle drift: {relative}")
    observed_tokenizer_bundle = tokenizer_bundle_identity(control_contract_dir / "tokenizer")
    if observed_tokenizer_bundle != contract["tokenizer_bundle"]:
        raise RuntimeError("Control tokenizer no longer matches its frozen bundle identity")
    return contract


def _verify_extension_artifacts(
    adapter_dir: Path,
    manifest_path: Path,
    expected_manifest_sha256: str,
    token_id_remap_path: Path,
    new_piece_map_path: Path,
) -> dict[str, Any]:
    observed_manifest_sha256 = sha256_file(manifest_path)
    if observed_manifest_sha256 != expected_manifest_sha256:
        raise RuntimeError(
            "Tokenizer-extension manifest SHA-256 mismatch: "
            f"expected={expected_manifest_sha256}, observed={observed_manifest_sha256}"
        )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("result", {}).get("status") != "PASS":
        raise RuntimeError("Tokenizer-extension manifest is not PASS")
    hashes = manifest.get("artifact_sha256") or {}
    for path, key in (
        (token_id_remap_path, "token-id-remap.jsonl"),
        (new_piece_map_path, "new-piece-map.jsonl"),
    ):
        if not path.is_file() or sha256_file(path) != hashes.get(key):
            raise RuntimeError(f"Tokenizer-extension artifact drift: {key}")
    for relative, expected in sorted(hashes.items()):
        if not str(relative).startswith("tokenizer/"):
            continue
        source_file = manifest_path.parent / relative
        if not source_file.is_file() or sha256_file(source_file) != expected:
            raise RuntimeError(f"Frozen tokenizer-extension source drift: {relative}")
        name = Path(relative).name
        if name not in {"sentencepiece.bpe.model", "added_tokens.json"}:
            continue
        adapter_file = adapter_dir / name
        if not adapter_file.is_file() or sha256_file(adapter_file) != expected:
            raise RuntimeError(f"Serialized adapter tokenizer lexical artifact drift: {relative}")
    return manifest


def tokenizer_behavior_identity(
    reference_tokenizer: Any,
    serialized_tokenizer: Any,
    required_special_tokens: list[str],
) -> dict[str, Any]:
    reference_vocab = {
        str(token): int(token_id) for token, token_id in reference_tokenizer.get_vocab().items()
    }
    serialized_vocab = {
        str(token): int(token_id) for token, token_id in serialized_tokenizer.get_vocab().items()
    }
    if reference_vocab != serialized_vocab:
        raise RuntimeError("Serialized adapter tokenizer vocabulary differs from the frozen tokenizer")
    if sorted(reference_tokenizer.all_special_ids) != sorted(serialized_tokenizer.all_special_ids):
        raise RuntimeError("Serialized adapter tokenizer special-ID registry differs")
    required: list[dict[str, Any]] = []
    for token in list(dict.fromkeys(required_special_tokens)):
        reference_id = int(reference_tokenizer.convert_tokens_to_ids(token))
        serialized_id = int(serialized_tokenizer.convert_tokens_to_ids(token))
        reference_encoded = [
            int(value) for value in reference_tokenizer.encode(token, add_special_tokens=False)
        ]
        serialized_encoded = [
            int(value) for value in serialized_tokenizer.encode(token, add_special_tokens=False)
        ]
        if (
            reference_id != serialized_id
            or reference_encoded != [reference_id]
            or serialized_encoded != [serialized_id]
            or reference_id not in reference_tokenizer.all_special_ids
            or serialized_id not in serialized_tokenizer.all_special_ids
        ):
            raise RuntimeError(
                f"Serialized adapter tokenizer changed required special-token behavior: {token!r}"
            )
        required.append({"token": token, "token_id": reference_id})
    return {
        "status": "PASS",
        "vocabulary_size": len(reference_vocab),
        "vocabulary_exact": True,
        "special_id_registry_exact": True,
        "required_special_tokens": required,
    }


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


def load_control_contract_nllb_adapter(
    raw_base_model: str | Path,
    control_contract_dir: str | Path,
    adapter_dir: str | Path,
    *,
    expected_control_contract_sha256: str,
    source_lang: str,
    target_lang: str,
    torch_dtype: torch.dtype | None,
    tokenizer_extension_manifest_path: str | Path | None = None,
    expected_tokenizer_extension_manifest_sha256: str | None = None,
    token_id_remap_path: str | Path | None = None,
    new_piece_map_path: str | Path | None = None,
    local_files_only: bool = True,
) -> tuple[Any, Any, dict[str, Any]]:
    """Rebuild a compact adapter from one immutable raw base and tokenizer contract.

    The control rows are always materialized in float32, matching the standalone
    control-model builder. A train-only tokenizer extension is then applied after
    the requested dtype conversion, matching the trainer's load/remap order.
    """
    raw_base_model = Path(raw_base_model).expanduser().resolve()
    control_contract_dir = Path(control_contract_dir).expanduser().resolve()
    adapter_dir = Path(adapter_dir).expanduser().resolve()
    extension_values = (
        tokenizer_extension_manifest_path,
        expected_tokenizer_extension_manifest_sha256,
        token_id_remap_path,
        new_piece_map_path,
    )
    if any(value is not None for value in extension_values) and not all(
        value is not None for value in extension_values
    ):
        raise RuntimeError(
            "Tokenizer-extension reload requires manifest path/hash, token-ID remap, "
            "and new-piece map together"
        )

    contract = _verify_control_contract_bundle(
        raw_base_model,
        control_contract_dir,
        expected_control_contract_sha256,
    )
    extension_manifest = None
    extension_manifest_path = None
    remap_path = None
    piece_map_path = None
    if all(value is not None for value in extension_values):
        extension_manifest_path = Path(tokenizer_extension_manifest_path).resolve()
        remap_path = Path(token_id_remap_path).resolve()
        piece_map_path = Path(new_piece_map_path).resolve()
        extension_manifest = _verify_extension_artifacts(
            adapter_dir,
            extension_manifest_path,
            str(expected_tokenizer_extension_manifest_sha256),
            remap_path,
            piece_map_path,
        )
    base_tokenizer = AutoTokenizer.from_pretrained(
        raw_base_model,
        use_fast=False,
        src_lang=source_lang,
        local_files_only=local_files_only,
    )
    control_tokenizer = AutoTokenizer.from_pretrained(
        control_contract_dir / "tokenizer",
        use_fast=False,
        src_lang=source_lang,
        tgt_lang=target_lang,
        local_files_only=local_files_only,
    )
    adapter_tokenizer = AutoTokenizer.from_pretrained(
        adapter_dir,
        use_fast=False,
        src_lang=source_lang,
        tgt_lang=target_lang,
        local_files_only=local_files_only,
    )
    tokenizer_serialization_audit = None
    if extension_manifest is not None:
        reference_extension_tokenizer = AutoTokenizer.from_pretrained(
            extension_manifest_path.parent / "tokenizer",
            use_fast=False,
            src_lang=source_lang,
            tgt_lang=target_lang,
            local_files_only=local_files_only,
        )
        tokenizer_serialization_audit = tokenizer_behavior_identity(
            reference_extension_tokenizer,
            adapter_tokenizer,
            [
                source_lang,
                target_lang,
                *list(extension_manifest.get("control_tokens") or []),
            ],
        )
    model = AutoModelForSeq2SeqLM.from_pretrained(
        raw_base_model,
        torch_dtype=torch.float32,
        local_files_only=local_files_only,
    )
    initial_alias_audit = canonicalize_nllb_input_embeddings(model)
    control_row_audit = initialize_control_rows(
        model,
        base_tokenizer,
        control_tokenizer,
        contract["extension"],
    )
    if torch_dtype is not None and torch_dtype != torch.float32:
        model.to(dtype=torch_dtype)
    post_dtype_alias_audit = canonicalize_nllb_input_embeddings(model)

    extension_plan = None
    extension_audit = None
    if extension_manifest is not None:
        extension_plan, extension_audit = remap_nllb_for_tokenizer_extension(
            model,
            control_tokenizer,
            adapter_tokenizer,
            token_id_remap_path=remap_path,
            new_piece_map_path=piece_map_path,
            control_tokens=list(extension_manifest.get("control_tokens") or []),
        )
        extension_audit["manifest"] = {
            "path": str(extension_manifest_path),
            "sha256": str(expected_tokenizer_extension_manifest_sha256),
        }
    else:
        if adapter_tokenizer.get_vocab() != control_tokenizer.get_vocab():
            raise RuntimeError("T0 adapter tokenizer vocabulary differs from its control contract")
        if sorted(adapter_tokenizer.all_special_ids) != sorted(control_tokenizer.all_special_ids):
            raise RuntimeError("T0 adapter tokenizer special-token registry drifted")

    model = PeftModel.from_pretrained(
        model,
        adapter_dir,
        local_files_only=local_files_only,
    )
    source_id = language_id(adapter_tokenizer, source_lang)
    target_id = language_id(adapter_tokenizer, target_lang)
    adapter_tokenizer.src_lang = source_lang
    adapter_tokenizer.tgt_lang = target_lang
    return adapter_tokenizer, model, {
        "schema_version": 1,
        "status": "PASS",
        "raw_base_model": str(raw_base_model),
        "control_contract": {
            "path": str(control_contract_dir / "MANIFEST.json"),
            "sha256": expected_control_contract_sha256,
            "contract_id": contract.get("contract_id"),
        },
        "initial_alias_audit": initial_alias_audit,
        "control_row_audit": control_row_audit,
        "post_dtype_alias_audit": post_dtype_alias_audit,
        "tokenizer_serialization_audit": tokenizer_serialization_audit,
        "tokenizer_extension_plan": extension_plan,
        "tokenizer_extension_audit": extension_audit,
        "source_language_token_id": source_id,
        "target_language_token_id": target_id,
        "adapter_topology": compact_adapter_topology_audit(model),
    }


def trainable_token_wrapper_audit(model: Any) -> dict[str, Any]:
    wrappers: list[dict[str, Any]] = []
    for name, module in model.named_modules(remove_duplicate=False):
        if module.__class__.__name__ != "TrainableTokensWrapper":
            continue
        indices = {
            str(adapter): [int(value) for value in values]
            for adapter, values in module.token_adapter.token_indices.items()
        }
        wrappers.append(
            {
                "module": name,
                "adapter_token_indices": indices,
                "tied_to_another_token_adapter": bool(module.token_adapter.tied_adapter),
            }
        )
    unique_index_sets = sorted(
        {
            tuple(values)
            for wrapper in wrappers
            for values in wrapper["adapter_token_indices"].values()
        }
    )
    return {
        "wrapper_count": len(wrappers),
        "wrappers": wrappers,
        "unique_token_index_sets": [list(values) for values in unique_index_sets],
        "all_wrappers_share_one_index_set": len(unique_index_sets) == 1,
    }


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

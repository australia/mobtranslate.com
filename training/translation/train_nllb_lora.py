#!/usr/bin/env python3
"""Fine-tune NLLB with full updates or LoRA for a MobTranslate corpus export."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import importlib.metadata
import json
import os
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import sacrebleu
import torch
from datasets import DatasetDict, load_dataset
from peft import LoraConfig, TaskType, get_peft_model
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    TrainerCallback,
    set_seed,
)

try:
    from .nllb_tokenizer_remap import remap_nllb_for_tokenizer_extension
except ImportError:  # Direct execution from a staged RunPod code directory.
    from nllb_tokenizer_remap import remap_nllb_for_tokenizer_extension


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-file", required=True)
    parser.add_argument("--validation-file", required=True)
    parser.add_argument("--test-file")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model-id", default="mobtranslate/kuku-yalanji-nllb-lora")
    parser.add_argument("--model-version", default="0.1.0")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--dataset-id", default="")
    parser.add_argument("--dataset-release-sha256", default="")
    parser.add_argument("--license", default="")
    parser.add_argument("--base-model", default="facebook/nllb-200-distilled-600M")
    parser.add_argument("--base-model-revision", default="", help="Immutable Hugging Face commit or revision for the base model.")
    parser.add_argument(
        "--tokenizer-path",
        default="",
        help="Optional extended tokenizer. Requires the complete remap contract below.",
    )
    parser.add_argument("--token-id-remap", default="")
    parser.add_argument("--new-piece-map", default="")
    parser.add_argument("--tokenizer-extension-manifest", default="")
    parser.add_argument("--expected-tokenizer-extension-manifest-sha256", default="")
    parser.add_argument(
        "--extension-control-token",
        action="append",
        default=[],
        help="Candidate-only registered control initialized from its base decomposition.",
    )
    parser.add_argument("--training-mode", choices=("lora", "full"), default="lora")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument(
        "--use-fast-tokenizer",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Use the fast base tokenizer. Tokenizer extensions always require the slow tokenizer.",
    )
    parser.add_argument("--target-lang-init-from", default="", help="Existing tokenizer token used to initialize a newly added target language code.")
    parser.add_argument(
        "--additional-special-token",
        action="append",
        default=[],
        help=(
            "Register an additional one-token control. Repeat for multiple controls. "
            "A newly appended row is initialized from the mean of its pre-addition decomposition."
        ),
    )
    parser.add_argument(
        "--trainable-token",
        action="append",
        default=[],
        help=(
            "Tokenizer token whose tied input/output embedding row is trained selectively by PEFT. "
            "Repeat for multiple rows; unknown or non-round-tripping tokens fail closed."
        ),
    )
    parser.add_argument(
        "--audited-control-string",
        action="append",
        default=[],
        help=(
            "Record the exact tokenizer decomposition of an ordinary model-visible control string. "
            "Unlike --additional-special-token, this does not alter the tokenizer."
        ),
    )
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-target-length", type=int, default=192)
    parser.add_argument("--max-train-samples", type=int)
    parser.add_argument("--max-validation-samples", type=int)
    parser.add_argument("--max-test-samples", type=int)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--epochs", type=float, default=8)
    parser.add_argument(
        "--max-steps",
        type=int,
        default=-1,
        help="Exact optimizer-update horizon. A positive value overrides --epochs; -1 keeps epoch scheduling.",
    )
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=4)
    parser.add_argument(
        "--optimizer",
        choices=("adamw_torch", "adafactor"),
        default="adamw_torch",
        help="Optimizer implementation recorded in the run manifest.",
    )
    parser.add_argument(
        "--lr-scheduler-type",
        default="linear",
        help="Transformers learning-rate scheduler name.",
    )
    parser.add_argument("--warmup-ratio", type=float, default=0.08)
    parser.add_argument(
        "--warmup-steps",
        type=int,
        default=0,
        help="Exact warmup update count. A positive value overrides --warmup-ratio.",
    )
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--label-smoothing-factor", type=float, default=0.0)
    parser.add_argument("--max-grad-norm", type=float, default=1.0)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.08)
    parser.add_argument("--lora-target-modules", default="q_proj,v_proj")
    parser.add_argument("--modules-to-save", default="")
    parser.add_argument("--save-steps", type=int, default=200)
    parser.add_argument("--save-total-limit", type=int, default=3)
    parser.add_argument("--eval-steps", type=int, default=100)
    parser.add_argument("--logging-steps", type=int, default=20)
    parser.add_argument("--generation-num-beams", type=int, default=4)
    parser.add_argument("--generation-no-repeat-ngram-size", type=int, default=0)
    parser.add_argument("--generation-repetition-penalty", type=float, default=1.0)
    parser.add_argument("--generation-length-penalty", type=float, default=1.0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--shuffle-before-cap", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--merge-full-model", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--trust-remote-code", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--ensure-weight-tying", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--gradient-checkpointing", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--full-determinism", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--resume-from-checkpoint", default="")
    parser.add_argument(
        "--stop-after-steps",
        type=int,
        default=0,
        help="Stop immediately after this global optimizer step while preserving the originally scheduled horizon.",
    )
    parser.add_argument("--load-best-model-at-end", action=argparse.BooleanOptionalAction, default=True)
    return parser.parse_args()


def comma_list(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def unique_nonempty(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value.strip()))


def add_special_tokens_with_decomposition_mean(
    tokenizer: Any,
    model: Any,
    token_strings: list[str],
) -> list[dict[str, Any]]:
    """Register controls and initialize genuinely new rows from their old decomposition."""
    requested = unique_nonempty(token_strings)
    if not requested:
        return []

    existing_specials = set(tokenizer.all_special_tokens)
    registrations: list[str] = []
    initialization: dict[str, dict[str, Any]] = {}
    input_embeddings = model.get_input_embeddings()
    output_embeddings = model.get_output_embeddings()

    for token in requested:
        token_id = tokenizer.convert_tokens_to_ids(token)
        known = token_id != tokenizer.unk_token_id
        if token not in existing_specials:
            registrations.append(token)
        if known:
            initialization[token] = {
                "status": "existing_token",
                "old_token_id": int(token_id),
                "decomposition_ids": [int(token_id)],
                "decomposition_tokens": [tokenizer.convert_ids_to_tokens(int(token_id))],
            }
            continue

        decomposition_ids = [
            int(item)
            for item in tokenizer.encode(token, add_special_tokens=False)
        ]
        if not decomposition_ids or tokenizer.unk_token_id in decomposition_ids:
            raise RuntimeError(
                f"Cannot initialize additional special token {token!r}: "
                f"pre-addition decomposition is empty or contains the unknown token: {decomposition_ids}"
            )
        input_mean = input_embeddings.weight.detach()[decomposition_ids].float().mean(dim=0).clone()
        output_mean = None
        if output_embeddings is not None:
            output_mean = output_embeddings.weight.detach()[decomposition_ids].float().mean(dim=0).clone()
        initialization[token] = {
            "status": "new_token_decomposition_mean",
            "old_token_id": None,
            "decomposition_ids": decomposition_ids,
            "decomposition_tokens": tokenizer.convert_ids_to_tokens(decomposition_ids),
            "input_mean": input_mean,
            "output_mean": output_mean,
        }

    old_length = len(tokenizer)
    if registrations:
        tokenizer.add_special_tokens(
            {"additional_special_tokens": registrations},
            replace_additional_special_tokens=False,
        )
    if len(tokenizer) != old_length:
        model.resize_token_embeddings(len(tokenizer))

    records: list[dict[str, Any]] = []
    with torch.no_grad():
        input_embeddings = model.get_input_embeddings()
        output_embeddings = model.get_output_embeddings()
        for token in requested:
            token_id = int(tokenizer.convert_tokens_to_ids(token))
            details = initialization[token]
            if details["status"] == "new_token_decomposition_mean":
                input_embeddings.weight[token_id].copy_(
                    details.pop("input_mean").to(
                        device=input_embeddings.weight.device,
                        dtype=input_embeddings.weight.dtype,
                    )
                )
                if output_embeddings is not None:
                    output_mean = details.pop("output_mean")
                    if output_mean is None:
                        raise RuntimeError(f"Missing output-row initialization for {token!r}")
                    output_embeddings.weight[token_id].copy_(
                        output_mean.to(
                            device=output_embeddings.weight.device,
                            dtype=output_embeddings.weight.dtype,
                        )
                    )
            else:
                details.pop("input_mean", None)
                details.pop("output_mean", None)

            if token_id == tokenizer.unk_token_id:
                raise RuntimeError(f"Additional special token resolved to unknown after registration: {token!r}")
            round_trip = tokenizer.convert_ids_to_tokens(token_id) == token
            single_id = tokenizer.encode(token, add_special_tokens=False) == [token_id]
            is_special = token_id in tokenizer.all_special_ids
            if not (round_trip and single_id and is_special):
                raise RuntimeError(
                    f"Additional special token invariant failed for {token!r}: "
                    f"round_trip={round_trip}, single_id={single_id}, is_special={is_special}"
                )
            records.append(
                {
                    "token": token,
                    "token_id": token_id,
                    "round_trip": round_trip,
                    "single_encoded_id": single_id,
                    "is_special": is_special,
                    **details,
                }
            )
    return records


def resolve_trainable_tokens(tokenizer: Any, token_strings: list[str]) -> tuple[list[int], list[dict[str, Any]]]:
    token_ids: list[int] = []
    records: list[dict[str, Any]] = []
    for token in unique_nonempty(token_strings):
        token_id = int(tokenizer.convert_tokens_to_ids(token))
        round_trip = token_id != tokenizer.unk_token_id and tokenizer.convert_ids_to_tokens(token_id) == token
        single_id = tokenizer.encode(token, add_special_tokens=False) == [token_id]
        if not (round_trip and single_id):
            raise RuntimeError(
                f"Trainable token must exist and encode as its single exact ID: {token!r}; "
                f"id={token_id}, round_trip={round_trip}, single_id={single_id}"
            )
        if token_id not in token_ids:
            token_ids.append(token_id)
            records.append({"token": token, "token_id": token_id})
    return token_ids, records


def audit_control_strings(tokenizer: Any, control_strings: list[str]) -> list[dict[str, Any]]:
    """Freeze how ordinary task controls are represented without changing vocabulary."""
    records: list[dict[str, Any]] = []
    for control in unique_nonempty(control_strings):
        token_ids = [int(item) for item in tokenizer.encode(control, add_special_tokens=False)]
        if not token_ids or tokenizer.unk_token_id in token_ids:
            raise RuntimeError(
                f"Audited control string must have a nonempty, unknown-free decomposition: "
                f"{control!r} -> {token_ids}"
            )
        records.append(
            {
                "control": control,
                "token_ids": token_ids,
                "tokens": tokenizer.convert_ids_to_tokens(token_ids),
                "decoded": tokenizer.decode(token_ids, skip_special_tokens=False),
                "registered_as_special": all(token_id in tokenizer.all_special_ids for token_id in token_ids),
            }
        )
    return records


def snapshot_embedding_rows(model: Any, token_records: list[dict[str, Any]]) -> dict[str, dict[str, torch.Tensor]]:
    input_weight = model.get_input_embeddings().weight.detach()
    output_embeddings = model.get_output_embeddings()
    snapshots: dict[str, dict[str, torch.Tensor]] = {}
    for record in token_records:
        token_id = int(record["token_id"])
        row = {"input": input_weight[token_id].float().cpu().clone()}
        if output_embeddings is not None:
            row["output"] = output_embeddings.weight.detach()[token_id].float().cpu().clone()
        snapshots[str(record["token"])] = row
    return snapshots


def resolve_source_embedding_module_name(model: Any) -> str:
    """Return the exact PEFT target for the encoder embedding used on source text."""
    encoder = model.get_encoder()
    source_embeddings = getattr(encoder, "embed_tokens", None)
    if source_embeddings is None:
        raise RuntimeError("Model encoder does not expose embed_tokens")

    names = [
        name
        for name, module in model.named_modules(remove_duplicate=False)
        if module is source_embeddings
    ]
    preferred = [name for name in names if name.endswith("model.encoder.embed_tokens")]
    if len(preferred) == 1:
        return preferred[0]
    if len(names) == 1:
        return names[0]
    raise RuntimeError(
        "Could not resolve one exact source-embedding module name for selective token training: "
        f"candidates={names}"
    )


def snapshot_nllb_embedding_surface_rows(
    model: Any,
    token_records: list[dict[str, Any]],
) -> dict[str, dict[str, torch.Tensor]]:
    """Snapshot NLLB's source, decoder, shared, and output embedding surfaces."""
    encoder_embeddings = getattr(model.get_encoder(), "embed_tokens", None)
    decoder_embeddings = getattr(model.get_decoder(), "embed_tokens", None)
    shared_embeddings = model.get_input_embeddings()
    output_embeddings = model.get_output_embeddings()
    surfaces = {
        "encoder_input": encoder_embeddings,
        "decoder_input": decoder_embeddings,
        "shared_input": shared_embeddings,
        "output_head": output_embeddings,
    }
    absent = [name for name, module in surfaces.items() if module is None]
    if absent:
        raise RuntimeError(f"Model is missing required NLLB embedding surfaces: {absent}")

    snapshots: dict[str, dict[str, torch.Tensor]] = {}
    for record in token_records:
        token_id = int(record["token_id"])
        snapshots[str(record["token"])] = {
            name: module.weight.detach()[token_id].float().cpu().clone()
            for name, module in surfaces.items()
        }
    return snapshots


def embedding_row_delta_audit(
    before: dict[str, dict[str, torch.Tensor]],
    after: dict[str, dict[str, torch.Tensor]],
    selected_tokens: set[str],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for token in sorted(before):
        row: dict[str, Any] = {"token": token, "selected_for_training": token in selected_tokens}
        for kind, initial in before[token].items():
            final = after[token][kind]
            delta = final - initial
            row[f"{kind}_delta_l2"] = float(torch.linalg.vector_norm(delta).item())
            row[f"{kind}_delta_max_abs"] = float(delta.abs().max().item())
            row[f"{kind}_changed"] = bool(torch.count_nonzero(delta).item())
        records.append(row)
    return records


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

    # NLLB tokenizers keep language-code maps that generation uses for BOS forcing.
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[lang_code] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = lang_code
    return token_id


def load_json_dataset(train_file: str, validation_file: str, test_file: str | None) -> DatasetDict:
    data_files: dict[str, str] = {"train": train_file, "validation": validation_file}
    if test_file:
        data_files["test"] = test_file
    model_columns = ("direction", "id", "input_text", "output_text", "pair_kind", "task")
    result = DatasetDict()
    for split, path in data_files.items():
        rows = load_dataset("json", data_files=path, split="train")
        missing = [column for column in model_columns if column not in rows.column_names]
        if missing:
            raise ValueError(f"{split} split is missing model-facing columns: {missing}")
        result[split] = rows.select_columns(model_columns)
    return result


def normalize_text(text: str) -> str:
    return " ".join(text.split())


def sha256_file(file: str | None) -> str | None:
    if not file:
        return None
    digest = hashlib.sha256()
    with open(file, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_exposure_ledger(path: Path, presentations: Counter[str]) -> dict[str, Any]:
    """Persist exact row-level presentation counts for post-training causal audits."""
    with path.open("w", encoding="utf-8") as handle:
        for row_id, count in sorted(presentations.items()):
            handle.write(json.dumps({"id": row_id, "presentations": count}, ensure_ascii=False) + "\n")
    return {
        "path": str(path),
        "sha256": sha256_file(str(path)),
        "rows": len(presentations),
        "presentations": sum(presentations.values()),
    }


def package_version(package: str) -> str | None:
    try:
        return importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        return None


def canonicalize_merged_embeddings(model: Any) -> dict[str, Any]:
    """Preserve the embedding object actually used by NLLB before serialization.

    PEFT can replace ``model.shared`` for modules_to_save while the encoder and
    decoder retain their original embedding reference. ``save_pretrained`` then
    serializes the replacement shared matrix and reload ties the decoder to it,
    changing model behavior. Make the runtime encoder/decoder matrix canonical
    and retain the independently trained lm_head.
    """
    inner = getattr(model, "model", None)
    encoder = getattr(inner, "encoder", None)
    decoder = getattr(inner, "decoder", None)
    shared = getattr(inner, "shared", None)
    encoder_embeddings = getattr(encoder, "embed_tokens", None)
    decoder_embeddings = getattr(decoder, "embed_tokens", None)
    if any(item is None for item in (inner, shared, encoder_embeddings, decoder_embeddings)):
        raise RuntimeError("Merged model does not expose the expected NLLB shared/encoder/decoder embeddings")
    encoder_decoder_tied_before = (
        encoder_embeddings.weight.data_ptr() == decoder_embeddings.weight.data_ptr()
    )
    encoder_decoder_values_equal = encoder_decoder_tied_before or torch.equal(
        encoder_embeddings.weight.detach(),
        decoder_embeddings.weight.detach(),
    )
    if not encoder_decoder_values_equal:
        raise RuntimeError(
            "NLLB encoder and decoder embedding values diverged before serialization"
        )

    shared_was_runtime = shared.weight.data_ptr() == decoder_embeddings.weight.data_ptr()
    shared_values_equal_runtime = shared_was_runtime or torch.equal(
        shared.weight.detach(),
        decoder_embeddings.weight.detach(),
    )
    inner.shared = decoder_embeddings
    encoder.embed_tokens = decoder_embeddings
    decoder.embed_tokens = decoder_embeddings
    output_embeddings = model.get_output_embeddings()
    output_is_runtime = (
        output_embeddings is not None
        and output_embeddings.weight.data_ptr() == decoder_embeddings.weight.data_ptr()
    )
    model.config.tie_word_embeddings = output_is_runtime
    return {
        "shared_was_runtime_embedding": shared_was_runtime,
        "shared_values_equal_runtime_before": shared_values_equal_runtime,
        "canonicalized_shared_from_decoder": not shared_was_runtime,
        "encoder_decoder_tied_before": encoder_decoder_tied_before,
        "encoder_decoder_values_equal_before": encoder_decoder_values_equal,
        "encoder_decoder_tied": True,
        "output_head_tied": output_is_runtime,
    }


def standalone_serialization_state_dict(model: Any) -> tuple[dict[str, torch.Tensor], list[str]]:
    """Materialize all NLLB embedding aliases so reload cannot choose a stale alias."""
    state = model.state_dict()
    runtime_embedding = model.model.decoder.embed_tokens.weight.detach().cpu()
    keys = [
        "model.shared.weight",
        "model.encoder.embed_tokens.weight",
        "model.decoder.embed_tokens.weight",
    ]
    for key in keys:
        if key not in state:
            raise RuntimeError(f"Expected embedding key is absent from merged state: {key}")
        state[key] = runtime_embedding.clone()
    return state, keys


def cap_split(dataset: DatasetDict, split: str, max_samples: int | None, *, seed: int, shuffle: bool) -> None:
    if max_samples is None or split not in dataset:
        return
    rows = dataset[split]
    if shuffle:
        rows = rows.shuffle(seed=seed)
    dataset[split] = rows.select(range(min(max_samples, len(rows))))


class StopAfterStepsCallback(TrainerCallback):
    """End a resumed trajectory at an exact global step without changing its LR horizon."""

    def __init__(self, stop_after_steps: int) -> None:
        self.stop_after_steps = stop_after_steps

    def on_step_end(self, args: Any, state: Any, control: Any, **kwargs: Any) -> Any:
        if self.stop_after_steps > 0 and state.global_step >= self.stop_after_steps:
            control.should_training_stop = True
        return control


class SelectiveTokenGradientAudit:
    """Record whether each selectively trainable token row receives gradients."""

    def __init__(self, model: Any, token_records: list[dict[str, Any]]) -> None:
        self.tokens = [str(record["token"]) for record in token_records]
        self.parameter_name: str | None = None
        self.nonzero_backward_calls = [0 for _ in self.tokens]
        self.total_l2 = [0.0 for _ in self.tokens]
        self.maximum_l2 = [0.0 for _ in self.tokens]
        self.maximum_absolute = [0.0 for _ in self.tokens]
        self._handle: Any = None

        if not self.tokens:
            return
        candidates = [
            (name, parameter)
            for name, parameter in model.named_parameters()
            if "trainable_tokens_delta" in name and parameter.requires_grad
        ]
        if len(candidates) != 1:
            raise RuntimeError(
                "Expected exactly one trainable-token delta parameter for source controls: "
                f"observed={[name for name, _ in candidates]}"
            )
        self.parameter_name, parameter = candidates[0]
        if parameter.ndim != 2 or parameter.shape[0] != len(self.tokens):
            raise RuntimeError(
                "Trainable-token delta shape does not match selected controls: "
                f"parameter={self.parameter_name}, shape={tuple(parameter.shape)}, tokens={self.tokens}"
            )
        self._handle = parameter.register_hook(self._record)

    def _record(self, gradient: torch.Tensor) -> torch.Tensor:
        rows = gradient.detach().float()
        for index in range(len(self.tokens)):
            row = rows[index]
            l2 = float(torch.linalg.vector_norm(row).item())
            maximum = float(row.abs().max().item())
            if maximum > 0.0:
                self.nonzero_backward_calls[index] += 1
            self.total_l2[index] += l2
            self.maximum_l2[index] = max(self.maximum_l2[index], l2)
            self.maximum_absolute[index] = max(self.maximum_absolute[index], maximum)
        return gradient

    def close(self) -> None:
        if self._handle is not None:
            self._handle.remove()
            self._handle = None

    def summary(self) -> dict[str, Any]:
        rows = [
            {
                "token": token,
                "nonzero_backward_calls": self.nonzero_backward_calls[index],
                "gradient_l2_sum": self.total_l2[index],
                "gradient_l2_max": self.maximum_l2[index],
                "gradient_max_abs": self.maximum_absolute[index],
            }
            for index, token in enumerate(self.tokens)
        ]
        return {
            "parameter_name": self.parameter_name,
            "rows": rows,
            "all_selected_rows_received_nonzero_gradient": all(
                row["nonzero_backward_calls"] > 0 for row in rows
            ) if rows else None,
        }


def task_label(row: dict[str, Any]) -> str:
    """Return the dataset's declared task without guessing from natural-language text."""
    for field in ("pair_kind", "task", "task_id"):
        value = row.get(field)
        if value is not None and str(value).strip():
            return str(value).strip()
    return "unclassified"


def row_identity(row: dict[str, Any], split: str, index: int) -> str:
    value = row.get("id")
    return str(value) if value is not None and str(value).strip() else f"{split}:{index}"


def add_accounting_columns(dataset: DatasetDict, tokenized: DatasetDict) -> None:
    for split in tokenized:
        rows = dataset[split]
        tokenized[split] = tokenized[split].add_column(
            "_task_label",
            [task_label(row) for row in rows],
        )
        tokenized[split] = tokenized[split].add_column(
            "_row_id",
            [row_identity(row, split, index) for index, row in enumerate(rows)],
        )


def token_inventory(tokenized: DatasetDict) -> dict[str, Any]:
    """Describe the post-truncation tokens available to each split and task."""
    inventory: dict[str, Any] = {}
    for split, rows in tokenized.items():
        totals = {"examples": 0, "source_tokens": 0, "target_tokens": 0, "non_padding_tokens": 0}
        by_task: dict[str, dict[str, int]] = defaultdict(
            lambda: {"examples": 0, "source_tokens": 0, "target_tokens": 0, "non_padding_tokens": 0}
        )
        for row in rows:
            source_tokens = len(row["input_ids"])
            target_tokens = len(row["labels"])
            label = row["_task_label"]
            for counters in (totals, by_task[label]):
                counters["examples"] += 1
                counters["source_tokens"] += source_tokens
                counters["target_tokens"] += target_tokens
                counters["non_padding_tokens"] += source_tokens + target_tokens
        inventory[split] = {
            **totals,
            "counts_are_post_truncation": True,
            "by_task": dict(sorted(by_task.items())),
        }
    return inventory


class AccountingDataCollator:
    """Keep provenance labels out of the model batch while exposing them to the trainer."""

    def __init__(self, delegate: Any) -> None:
        self.delegate = delegate

    def __call__(self, features: list[dict[str, Any]]) -> dict[str, Any]:
        clean_features: list[dict[str, Any]] = []
        task_labels: list[str] = []
        row_ids: list[str] = []
        for feature in features:
            clean = dict(feature)
            task_labels.append(str(clean.pop("_task_label")))
            row_ids.append(str(clean.pop("_row_id")))
            clean_features.append(clean)
        batch = self.delegate(clean_features)
        batch["_task_labels"] = task_labels
        batch["_row_ids"] = row_ids
        return batch


class ExposureAccountingTrainer(Seq2SeqTrainer):
    """Count the exact examples and non-padding tokens consumed by training forwards."""

    def __init__(self, *args: Any, exposure_pad_token_id: int, **kwargs: Any) -> None:
        self.exposure_pad_token_id = exposure_pad_token_id
        self.exposure_totals: Counter[str] = Counter()
        self.exposure_by_task: dict[str, Counter[str]] = defaultdict(Counter)
        self.exposure_row_presentations: Counter[str] = Counter()
        super().__init__(*args, **kwargs)

    def compute_loss(
        self,
        model: Any,
        inputs: dict[str, Any],
        return_outputs: bool = False,
        **kwargs: Any,
    ) -> Any:
        task_labels = inputs.pop("_task_labels", [])
        row_ids = inputs.pop("_row_ids", [])
        if model.training and task_labels:
            source_counts = (inputs["input_ids"] != self.exposure_pad_token_id).sum(dim=1).tolist()
            target_counts = (inputs["labels"] != -100).sum(dim=1).tolist()
            for label, row_id, source_tokens, target_tokens in zip(
                task_labels,
                row_ids,
                source_counts,
                target_counts,
                strict=True,
            ):
                counts = {
                    "examples": 1,
                    "source_tokens": int(source_tokens),
                    "target_tokens": int(target_tokens),
                    "non_padding_tokens": int(source_tokens) + int(target_tokens),
                }
                self.exposure_totals.update(counts)
                self.exposure_by_task[str(label)].update(counts)
                self.exposure_row_presentations[str(row_id)] += 1
        if self.label_smoother is not None and "labels" in inputs:
            # M2M100 has no prepare_decoder_input_ids_from_labels hook. Keep labels
            # in the model call so NLLB shifts them, then smooth the returned logits.
            labels = inputs["labels"]
            outputs = model(**inputs)
            loss = self.label_smoother(outputs, labels)
            return (loss, outputs) if return_outputs else loss
        return super().compute_loss(model, inputs, return_outputs=return_outputs, **kwargs)

    def prediction_step(self, model: Any, inputs: dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        inputs = dict(inputs)
        inputs.pop("_task_labels", None)
        inputs.pop("_row_ids", None)
        return super().prediction_step(model, inputs, *args, **kwargs)

    def exposure_summary(self) -> dict[str, Any]:
        presentations = list(self.exposure_row_presentations.values())
        return {
            **dict(self.exposure_totals),
            "by_task": {
                label: dict(counts)
                for label, counts in sorted(self.exposure_by_task.items())
            },
            "unique_rows_seen": len(presentations),
            "presentations_per_seen_row": {
                "minimum": min(presentations) if presentations else 0,
                "maximum": max(presentations) if presentations else 0,
                "mean": (sum(presentations) / len(presentations)) if presentations else 0.0,
            },
            "accounting_scope": "current trainer process",
        }


def main() -> None:
    args = parse_args()
    if args.stop_after_steps < 0:
        raise SystemExit("--stop-after-steps cannot be negative")
    if args.max_steps == 0 or args.max_steps < -1:
        raise SystemExit("--max-steps must be -1 or a positive integer")
    if args.max_steps > 0 and args.stop_after_steps > args.max_steps:
        raise SystemExit("--stop-after-steps cannot exceed --max-steps")
    if args.warmup_steps < 0:
        raise SystemExit("--warmup-steps cannot be negative")
    if not 0.0 <= args.warmup_ratio <= 1.0:
        raise SystemExit("--warmup-ratio must be between 0 and 1")
    if not 0.0 <= args.label_smoothing_factor < 1.0:
        raise SystemExit("--label-smoothing-factor must be in [0, 1)")
    if args.max_grad_norm <= 0:
        raise SystemExit("--max-grad-norm must be positive")
    extension_values = {
        "tokenizer_path": args.tokenizer_path,
        "token_id_remap": args.token_id_remap,
        "new_piece_map": args.new_piece_map,
        "tokenizer_extension_manifest": args.tokenizer_extension_manifest,
        "expected_tokenizer_extension_manifest_sha256": (
            args.expected_tokenizer_extension_manifest_sha256
        ),
    }
    if any(extension_values.values()) and not all(extension_values.values()):
        raise SystemExit(
            "Tokenizer extension requires --tokenizer-path, --token-id-remap, --new-piece-map, "
            "--tokenizer-extension-manifest, and "
            "--expected-tokenizer-extension-manifest-sha256 together"
        )
    if args.extension_control_token and not args.tokenizer_path:
        raise SystemExit("--extension-control-token requires --tokenizer-path")
    if args.training_mode == "full" and args.trainable_token:
        raise SystemExit("--trainable-token is a PEFT control and cannot be used in full mode")
    if args.training_mode == "full" and not args.merge_full_model:
        raise SystemExit("full training requires --merge-full-model")
    set_seed(args.seed)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    effective_use_fast_tokenizer = args.use_fast_tokenizer and not bool(args.tokenizer_path)
    base_tokenizer = AutoTokenizer.from_pretrained(
        args.base_model,
        revision=args.base_model_revision or None,
        use_fast=effective_use_fast_tokenizer,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        trust_remote_code=args.trust_remote_code,
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_model,
        revision=args.base_model_revision or None,
        trust_remote_code=args.trust_remote_code,
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else None,
    )

    tokenizer_extension_audit = None
    if args.tokenizer_path:
        manifest_sha256 = sha256_file(args.tokenizer_extension_manifest)
        if manifest_sha256 != args.expected_tokenizer_extension_manifest_sha256:
            raise RuntimeError(
                "Tokenizer-extension manifest SHA-256 mismatch: "
                f"expected={args.expected_tokenizer_extension_manifest_sha256}, "
                f"observed={manifest_sha256}"
            )
        extension_manifest = json.loads(
            Path(args.tokenizer_extension_manifest).read_text(encoding="utf-8")
        )
        if extension_manifest.get("result", {}).get("status") != "PASS":
            raise RuntimeError("Tokenizer-extension manifest is not PASS")
        declared_controls = list(extension_manifest.get("control_tokens") or [])
        requested_controls = unique_nonempty(args.extension_control_token)
        if requested_controls != declared_controls:
            raise RuntimeError(
                "Extension controls do not reproduce the tokenizer manifest order: "
                f"requested={requested_controls}, declared={declared_controls}"
            )
        artifact_sha256 = extension_manifest.get("artifact_sha256") or {}
        for path, key in (
            (args.token_id_remap, "token-id-remap.jsonl"),
            (args.new_piece_map, "new-piece-map.jsonl"),
        ):
            observed = sha256_file(path)
            if observed != artifact_sha256.get(key):
                raise RuntimeError(
                    f"Tokenizer-extension artifact SHA-256 mismatch for {key}: "
                    f"expected={artifact_sha256.get(key)}, observed={observed}"
                )
        tokenizer_root = Path(args.tokenizer_path).resolve()
        for relative, expected in sorted(artifact_sha256.items()):
            if not str(relative).startswith("tokenizer/"):
                continue
            tokenizer_file = tokenizer_root / Path(relative).relative_to("tokenizer")
            observed = sha256_file(str(tokenizer_file))
            if observed != expected:
                raise RuntimeError(
                    f"Extended-tokenizer SHA-256 mismatch for {relative}: "
                    f"expected={expected}, observed={observed}"
                )
        tokenizer = AutoTokenizer.from_pretrained(
            args.tokenizer_path,
            use_fast=False,
            src_lang=args.source_lang,
            tgt_lang=args.target_lang,
            trust_remote_code=args.trust_remote_code,
        )
        _plan, tokenizer_extension_audit = remap_nllb_for_tokenizer_extension(
            model,
            base_tokenizer,
            tokenizer,
            token_id_remap_path=args.token_id_remap,
            new_piece_map_path=args.new_piece_map,
            control_tokens=requested_controls,
        )
        tokenizer_extension_audit["manifest"] = {
            "path": str(Path(args.tokenizer_extension_manifest).resolve()),
            "sha256": manifest_sha256,
        }
    else:
        tokenizer = base_tokenizer

    source_lang_id = add_lang_code(tokenizer, model, args.source_lang)
    target_lang_id = add_lang_code(tokenizer, model, args.target_lang, init_from=args.target_lang_init_from or None)
    additional_special_token_records = add_special_tokens_with_decomposition_mean(
        tokenizer,
        model,
        args.additional_special_token,
    )
    trainable_token_ids, trainable_token_records = resolve_trainable_tokens(tokenizer, args.trainable_token)
    audited_control_strings = audit_control_strings(tokenizer, args.audited_control_string)

    audit_token_names = unique_nonempty(
        [
            *[record["token"] for record in trainable_token_records],
            *[record["token"] for record in additional_special_token_records],
            args.source_lang,
            args.target_lang,
            tokenizer.pad_token or "",
            tokenizer.eos_token or "",
        ]
    )
    _, audit_token_records = resolve_trainable_tokens(tokenizer, audit_token_names)
    embedding_rows_before = snapshot_nllb_embedding_surface_rows(model, audit_token_records)

    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang
    model.config.forced_bos_token_id = target_lang_id
    if args.gradient_checkpointing:
        model.config.use_cache = False
        model.gradient_checkpointing_enable()
    model.generation_config.forced_bos_token_id = target_lang_id
    model.generation_config.num_beams = args.generation_num_beams
    model.generation_config.no_repeat_ngram_size = args.generation_no_repeat_ngram_size
    model.generation_config.repetition_penalty = args.generation_repetition_penalty
    model.generation_config.length_penalty = args.generation_length_penalty

    dataset = load_json_dataset(args.train_file, args.validation_file, args.test_file)
    dataset = dataset.filter(lambda row: row.get("direction") == args.direction)
    cap_split(dataset, "train", args.max_train_samples, seed=args.seed, shuffle=args.shuffle_before_cap)
    cap_split(dataset, "validation", args.max_validation_samples, seed=args.seed + 1, shuffle=args.shuffle_before_cap)
    cap_split(dataset, "test", args.max_test_samples, seed=args.seed + 2, shuffle=args.shuffle_before_cap)
    split_rows = {split: len(rows) for split, rows in dataset.items()}

    def preprocess(batch: dict[str, list[str]]) -> dict[str, Any]:
        tokenizer.src_lang = args.source_lang
        tokenizer.tgt_lang = args.target_lang
        model_inputs = tokenizer(
            [normalize_text(text) for text in batch["input_text"]],
            max_length=args.max_source_length,
            truncation=True,
        )
        labels = tokenizer(
            text_target=[normalize_text(text) for text in batch["output_text"]],
            max_length=args.max_target_length,
            truncation=True,
        )
        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    tokenized = dataset.map(
        preprocess,
        batched=True,
        remove_columns=dataset["train"].column_names,
        desc="Tokenizing",
    )
    add_accounting_columns(dataset, tokenized)
    dataset_token_inventory = token_inventory(tokenized)

    lora_target_modules = comma_list(args.lora_target_modules)
    modules_to_save = comma_list(args.modules_to_save)
    trainable_token_target_modules: dict[str, list[int]] | None = None
    if trainable_token_ids:
        source_embedding_module_name = resolve_source_embedding_module_name(model)
        trainable_token_target_modules = {
            source_embedding_module_name: trainable_token_ids,
        }
    effective_ensure_weight_tying: bool | None = args.ensure_weight_tying
    if effective_ensure_weight_tying and modules_to_save:
        embedding_modules = {"model.shared", "shared", "lm_head"}
        if any(module in embedding_modules for module in modules_to_save):
            effective_ensure_weight_tying = False
    if args.training_mode == "lora":
        lora = LoraConfig(
            task_type=TaskType.SEQ_2_SEQ_LM,
            r=args.lora_r,
            lora_alpha=args.lora_alpha,
            lora_dropout=args.lora_dropout,
            target_modules=lora_target_modules,
            modules_to_save=modules_to_save or None,
            trainable_token_indices=trainable_token_target_modules,
            ensure_weight_tying=bool(effective_ensure_weight_tying),
        )
        model = get_peft_model(model, lora)
        trainable_token_wrapper_modules = [
            name
            for name, module in model.named_modules(remove_duplicate=False)
            if module.__class__.__name__ == "TrainableTokensWrapper"
        ]
        if trainable_token_ids:
            expected_source_module = next(iter(trainable_token_target_modules or {}))
            if not any(name.endswith(expected_source_module) for name in trainable_token_wrapper_modules):
                raise RuntimeError(
                    "Selective token training did not wrap NLLB's source encoder embedding: "
                    f"expected={expected_source_module}, observed={trainable_token_wrapper_modules}"
                )
    else:
        effective_ensure_weight_tying = None
        trainable_token_wrapper_modules = []
    selective_token_gradient_audit = SelectiveTokenGradientAudit(model, trainable_token_records)
    if hasattr(model, "print_trainable_parameters"):
        model.print_trainable_parameters()
    else:
        trainable_parameters = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
        total_parameters = sum(parameter.numel() for parameter in model.parameters())
        print(
            f"trainable params: {trainable_parameters:,d} || all params: {total_parameters:,d} || "
            f"trainable%: {100 * trainable_parameters / total_parameters:.6f}"
        )

    data_collator = AccountingDataCollator(
        DataCollatorForSeq2Seq(tokenizer=tokenizer, model=model, label_pad_token_id=-100)
    )

    def compute_metrics(eval_pred: Any) -> dict[str, float]:
        preds, labels = eval_pred
        if isinstance(preds, tuple):
            preds = preds[0]
        preds = np.asarray(preds)
        # Seq2SeqTrainer can surface sentinel/invalid ids in padded generated
        # predictions. Tokenizer decode expects non-negative vocab ids.
        preds = np.where((preds >= 0) & (preds < len(tokenizer)), preds, tokenizer.pad_token_id)
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)
        decoded_preds = [normalize_text(text) for text in tokenizer.batch_decode(preds, skip_special_tokens=True)]
        decoded_labels = [normalize_text(text) for text in tokenizer.batch_decode(labels, skip_special_tokens=True)]
        bleu = sacrebleu.corpus_bleu(decoded_preds, [decoded_labels]).score
        chrf = sacrebleu.corpus_chrf(decoded_preds, [decoded_labels], word_order=2).score
        return {"bleu": bleu, "chrf": chrf}

    bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    training_args = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        overwrite_output_dir=True,
        eval_strategy="steps",
        save_strategy="steps",
        eval_steps=args.eval_steps,
        save_steps=args.save_steps,
        logging_steps=args.logging_steps,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        optim=args.optimizer,
        lr_scheduler_type=args.lr_scheduler_type,
        warmup_ratio=args.warmup_ratio,
        warmup_steps=args.warmup_steps,
        weight_decay=args.weight_decay,
        label_smoothing_factor=args.label_smoothing_factor,
        max_grad_norm=args.max_grad_norm,
        predict_with_generate=True,
        generation_max_length=args.max_target_length,
        generation_num_beams=args.generation_num_beams,
        fp16=torch.cuda.is_available() and not bf16,
        bf16=bf16,
        report_to="tensorboard",
        load_best_model_at_end=args.load_best_model_at_end,
        metric_for_best_model="chrf",
        greater_is_better=True,
        save_total_limit=args.save_total_limit,
        gradient_checkpointing=args.gradient_checkpointing,
        full_determinism=args.full_determinism,
        remove_unused_columns=False,
    )

    trainer = ExposureAccountingTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[StopAfterStepsCallback(args.stop_after_steps)] if args.stop_after_steps else None,
        exposure_pad_token_id=tokenizer.pad_token_id,
    )

    train_result = trainer.train(resume_from_checkpoint=args.resume_from_checkpoint or None)
    expected_global_step = args.stop_after_steps or (args.max_steps if args.max_steps > 0 else None)
    if expected_global_step is not None and trainer.state.global_step != expected_global_step:
        raise RuntimeError(
            f"Exact-step contract failed: expected global step {expected_global_step}, "
            f"observed {trainer.state.global_step}"
        )
    adapter_dir = output_dir / "adapter"
    if args.training_mode == "lora":
        trainer.save_model(str(adapter_dir))
        if trainable_token_records:
            trainer.model.save_pretrained(
                str(adapter_dir),
                safe_serialization=True,
                save_embedding_layers=False,
            )
        tokenizer.save_pretrained(str(adapter_dir))

    metrics = {"train": train_result.metrics, "validation": trainer.evaluate(tokenized["validation"])}
    if "test" in tokenized:
        metrics["test"] = trainer.evaluate(tokenized["test"], metric_key_prefix="test")

    selective_token_gradient_audit.close()
    selective_token_gradient_summary = selective_token_gradient_audit.summary()
    if (
        trainable_token_records
        and not selective_token_gradient_summary["all_selected_rows_received_nonzero_gradient"]
    ):
        missing_gradient_rows = [
            row["token"]
            for row in selective_token_gradient_summary["rows"]
            if row["nonzero_backward_calls"] == 0
        ]
        raise RuntimeError(
            "Selected source-control rows received no nonzero gradient: "
            f"{missing_gradient_rows}"
        )

    embedding_rows_after = snapshot_nllb_embedding_surface_rows(trainer.model, audit_token_records)
    embedding_row_audit = embedding_row_delta_audit(
        embedding_rows_before,
        embedding_rows_after,
        {record["token"] for record in trainable_token_records},
    )
    changed_unselected_rows = [
        row["token"]
        for row in embedding_row_audit
        if not row["selected_for_training"]
        and any(
            row.get(f"{surface}_changed", False)
            for surface in ("encoder_input", "decoder_input", "shared_input")
        )
    ]
    selective_token_isolation_enforced = bool(trainable_token_records)
    if selective_token_isolation_enforced and changed_unselected_rows:
        raise RuntimeError(
            "Selective token training changed unselected embedding audit rows: "
            f"{changed_unselected_rows}"
        )
    unchanged_selected_source_rows = [
        row["token"]
        for row in embedding_row_audit
        if row["selected_for_training"] and not row.get("encoder_input_changed", False)
    ]
    selected_row_change_required = selective_token_isolation_enforced and args.stop_after_steps == 0
    if selected_row_change_required and unchanged_selected_source_rows:
        raise RuntimeError(
            "Selected source-control embedding rows received no update: "
            f"{unchanged_selected_source_rows}"
        )
    changed_selected_non_source_rows = [
        row["token"]
        for row in embedding_row_audit
        if row["selected_for_training"]
        and any(
            row.get(f"{surface}_changed", False)
            for surface in ("decoder_input", "shared_input")
        )
    ]
    if selective_token_isolation_enforced and changed_selected_non_source_rows:
        raise RuntimeError(
            "Source-only selective token training changed non-source input surfaces before merge: "
            f"{changed_selected_non_source_rows}"
        )

    merge_embedding_canonicalization = None
    if args.merge_full_model:
        merged = (
            trainer.model.merge_and_unload()
            if args.training_mode == "lora"
            else trainer.model
        )
        merge_embedding_canonicalization = canonicalize_merged_embeddings(merged)
        merged.generation_config.forced_bos_token_id = target_lang_id
        merged.generation_config.num_beams = args.generation_num_beams
        merged.generation_config.no_repeat_ngram_size = args.generation_no_repeat_ngram_size
        merged.generation_config.repetition_penalty = args.generation_repetition_penalty
        merged.generation_config.length_penalty = args.generation_length_penalty
        serialization_state, materialized_embedding_keys = standalone_serialization_state_dict(merged)
        merge_embedding_canonicalization["materialized_serialization_keys"] = materialized_embedding_keys
        merged.save_pretrained(
            str(output_dir / "merged"),
            state_dict=serialization_state,
            safe_serialization=True,
        )
        tokenizer.save_pretrained(str(output_dir / "merged"))

    exposure_ledger = write_exposure_ledger(
        output_dir / "exposure-row-presentations.jsonl",
        trainer.exposure_row_presentations,
    )

    manifest = {
        "model_id": args.model_id,
        "version": args.model_version,
        "run_id": args.run_id or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "base_model": args.base_model,
        "base_model_revision": args.base_model_revision or None,
        "license": args.license or None,
        "direction": args.direction,
        "source_lang": args.source_lang,
        "target_lang": args.target_lang,
        "target_lang_init_from": args.target_lang_init_from or None,
        "source_lang_token_id": source_lang_id,
        "target_lang_token_id": target_lang_id,
        "training_mode": args.training_mode,
        "tokenizer_extension": tokenizer_extension_audit,
        "token_adaptation": {
            "additional_special_tokens": additional_special_token_records,
            "ordinary_control_strings": audited_control_strings,
            "trainable_tokens": trainable_token_records,
            "trainable_token_target_modules": trainable_token_target_modules,
            "trainable_token_wrapper_modules": trainable_token_wrapper_modules,
            "selective_token_gradient_audit": selective_token_gradient_summary,
            "embedding_row_delta_audit": embedding_row_audit,
            "selective_token_isolation_enforced": selective_token_isolation_enforced,
            "selected_row_change_required": selected_row_change_required,
            "all_selected_source_rows_changed": (
                not unchanged_selected_source_rows if selective_token_isolation_enforced else None
            ),
            "unselected_audit_rows_unchanged": (
                not changed_unselected_rows if selective_token_isolation_enforced else None
            ),
        },
        "dataset": {
            "dataset_id": args.dataset_id or None,
            "release_sha256": args.dataset_release_sha256 or None,
            "train_file": os.path.abspath(args.train_file),
            "validation_file": os.path.abspath(args.validation_file),
            "test_file": os.path.abspath(args.test_file) if args.test_file else None,
            "file_sha256": {
                "train": sha256_file(args.train_file),
                "validation": sha256_file(args.validation_file),
                "test": sha256_file(args.test_file),
            },
            "split_rows": split_rows,
            "token_inventory": dataset_token_inventory,
            "max_train_samples": args.max_train_samples,
            "max_validation_samples": args.max_validation_samples,
            "max_test_samples": args.max_test_samples,
            "shuffle_before_cap": args.shuffle_before_cap,
        },
        "training_args": {
            "training_mode": args.training_mode,
            "epochs": args.epochs,
            "max_steps": args.max_steps if args.max_steps > 0 else None,
            "batch_size": args.batch_size,
            "gradient_accumulation_steps": args.gradient_accumulation_steps,
            "learning_rate": args.learning_rate,
            "optimizer": args.optimizer,
            "lr_scheduler_type": args.lr_scheduler_type,
            "warmup_ratio": args.warmup_ratio,
            "warmup_steps": args.warmup_steps,
            "weight_decay": args.weight_decay,
            "label_smoothing_factor": args.label_smoothing_factor,
            "max_grad_norm": args.max_grad_norm,
            "lora_r": args.lora_r,
            "lora_alpha": args.lora_alpha,
            "lora_dropout": args.lora_dropout,
            "lora_target_modules": lora_target_modules,
            "modules_to_save": modules_to_save,
            "additional_special_tokens": unique_nonempty(args.additional_special_token),
            "requested_use_fast_tokenizer": args.use_fast_tokenizer,
            "effective_use_fast_tokenizer": effective_use_fast_tokenizer,
            "audited_control_strings": unique_nonempty(args.audited_control_string),
            "trainable_tokens": trainable_token_records,
            "trainable_token_target_modules": trainable_token_target_modules,
            "seed": args.seed,
            "ensure_weight_tying": args.ensure_weight_tying,
            "effective_ensure_weight_tying": effective_ensure_weight_tying,
            "generation_num_beams": args.generation_num_beams,
            "generation_no_repeat_ngram_size": args.generation_no_repeat_ngram_size,
            "generation_repetition_penalty": args.generation_repetition_penalty,
            "generation_length_penalty": args.generation_length_penalty,
            "save_total_limit": args.save_total_limit,
            "gradient_checkpointing": args.gradient_checkpointing,
            "full_determinism": args.full_determinism,
            "resume_from_checkpoint": os.path.abspath(args.resume_from_checkpoint) if args.resume_from_checkpoint else None,
            "stop_after_steps": args.stop_after_steps or None,
            "load_best_model_at_end": args.load_best_model_at_end,
        },
        "metrics": metrics,
        "trainer_state": {
            "best_model_checkpoint": trainer.state.best_model_checkpoint,
            "best_metric": trainer.state.best_metric,
            "global_step": trainer.state.global_step,
            "epoch": trainer.state.epoch,
            "log_history": trainer.state.log_history,
            "actual_training_exposure": {
                **trainer.exposure_summary(),
                "world_size": trainer.args.world_size,
            },
        },
        "artifacts": {
            "adapter_dir": str(output_dir / "adapter") if args.training_mode == "lora" else None,
            "merged_dir": str(output_dir / "merged") if args.merge_full_model else None,
            "merge_embedding_canonicalization": merge_embedding_canonicalization,
            "exposure_ledger": exposure_ledger,
        },
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "cuda_available": torch.cuda.is_available(),
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "packages": {
                package: package_version(package)
                for package in ("accelerate", "datasets", "peft", "sacrebleu", "sentencepiece", "transformers")
            },
        },
    }
    (output_dir / "model_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()

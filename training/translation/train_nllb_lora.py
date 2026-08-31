#!/usr/bin/env python3
"""Fine-tune NLLB with full updates or LoRA for a MobTranslate corpus export."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import sacrebleu
import torch
from datasets import DatasetDict, load_dataset
from peft import LoraConfig, PeftModel, TaskType, get_peft_model
from torch.utils.data import SequentialSampler
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
    from .nllb_initial_adapter import validate_initial_adapter
    from .nllb_language_sequences import audit_nllb_language_sequences
    from .nllb_tokenizer_remap import remap_nllb_for_tokenizer_extension
except ImportError:  # Direct execution from a staged RunPod code directory.
    from nllb_initial_adapter import validate_initial_adapter
    from nllb_language_sequences import audit_nllb_language_sequences
    from nllb_tokenizer_remap import remap_nllb_for_tokenizer_extension


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-file", required=True)
    parser.add_argument(
        "--validation-file",
        default="",
        help=(
            "Optional monitor split. When omitted, training requires a positive --max-steps "
            "and --no-load-best-model-at-end; evaluation must be run separately."
        ),
    )
    parser.add_argument("--test-file")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--model-version", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--dataset-id", required=True)
    parser.add_argument("--dataset-release-sha256", required=True)
    parser.add_argument("--license", required=True)
    parser.add_argument("--base-model", default="facebook/nllb-200-distilled-600M")
    parser.add_argument(
        "--base-model-revision",
        default="",
        help="Immutable Hugging Face commit or revision for the base model.",
    )
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
    parser.add_argument(
        "--initial-adapter",
        default="",
        help=(
            "Optional PEFT adapter to continue training against the exact --base-model. "
            "Its immutable weight hash and LoRA topology must match the requested contract."
        ),
    )
    parser.add_argument(
        "--expected-initial-adapter-sha256",
        default="",
        help="Required adapter_model.safetensors SHA-256 when --initial-adapter is supplied.",
    )
    parser.add_argument("--source-lang", required=True)
    parser.add_argument("--target-lang", required=True)
    parser.add_argument(
        "--use-fast-tokenizer",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Use the fast base tokenizer. Tokenizer extensions always require the slow tokenizer.",
    )
    parser.add_argument(
        "--target-lang-init-from",
        default="",
        help="Existing tokenizer token used to initialize a newly added target language code.",
    )
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
            "Tokenizer token whose embedding row is trained selectively by PEFT. Repeat for multiple rows; "
            "unknown or non-round-tripping tokens fail closed. --trainable-token-scope controls which "
            "NLLB embedding surfaces receive the update."
        ),
    )
    parser.add_argument(
        "--required-trainable-token-update",
        action="append",
        default=None,
        help=(
            "Trainable token whose row must receive a nonzero gradient and change during this run. "
            "Repeat for multiple rows. When omitted, every --trainable-token row is required. This "
            "permits continued adapters to load inherited selective-token rows that are intentionally "
            "absent from a task-separated arm without weakening isolation audits."
        ),
    )
    parser.add_argument(
        "--trainable-token-spec",
        default="",
        help=(
            "Optional hashed JSON activation report selecting exact tokenizer rows. "
            "Ordinary rows are accepted only when the verified tokenizer-extension "
            "remap declares the same token and ID."
        ),
    )
    parser.add_argument(
        "--expected-trainable-token-spec-sha256",
        default="",
        help="Required exact SHA-256 when --trainable-token-spec is supplied.",
    )
    parser.add_argument(
        "--trainable-token-scope",
        choices=("source", "tied"),
        default="source",
        help=(
            "source preserves the historical source-control behavior by updating only encoder input rows; "
            "tied updates one shared adapter across NLLB's tied encoder, decoder, shared, and output rows."
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
    parser.add_argument("--direction", required=True)
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
    parser.add_argument(
        "--adapter-snapshot-steps",
        default="",
        help=(
            "Optional comma-separated optimizer steps at which to save compact adapter-only "
            "snapshots with cumulative exposure ledgers. This disables resumable Trainer "
            "checkpoints and is intended for bounded screening trajectories."
        ),
    )
    parser.add_argument("--eval-steps", type=int, default=100)
    parser.add_argument("--logging-steps", type=int, default=20)
    parser.add_argument("--generation-num-beams", type=int, default=4)
    parser.add_argument("--generation-no-repeat-ngram-size", type=int, default=0)
    parser.add_argument("--generation-repetition-penalty", type=float, default=1.0)
    parser.add_argument("--generation-length-penalty", type=float, default=1.0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--shuffle-before-cap", action=argparse.BooleanOptionalAction, default=True
    )
    parser.add_argument(
        "--training-order",
        choices=("random", "sequential"),
        default="random",
        help=(
            "Training sampler order. sequential is reserved for a frozen, precomputed "
            "presentation schedule whose row order is part of the experiment contract."
        ),
    )
    parser.add_argument(
        "--accounting-row-id-field",
        default="id",
        help=(
            "Dataset field used for exposure accounting. A presentation schedule can keep "
            "unique transport ids while aggregating exposure under an immutable parent-row id."
        ),
    )
    parser.add_argument(
        "--allow-duplicate-train-pairs",
        action=argparse.BooleanOptionalAction,
        default=False,
        help=(
            "Permit exact normalized duplicate pairs only inside the training split. "
            "The audit records them; cross-split duplicates always fail."
        ),
    )
    parser.add_argument(
        "--allow-cross-split-source-overlap",
        action=argparse.BooleanOptionalAction,
        default=False,
        help=(
            "Permit the same normalized model-visible source in more than one split. "
            "Exact source-target pair leakage still fails."
        ),
    )
    parser.add_argument(
        "--split-group-field",
        default="",
        help=(
            "Optional required corpus column whose family/source/document IDs must be disjoint across "
            "train, validation, and test (for example lexeme_family_id or source_document_id)."
        ),
    )
    parser.add_argument(
        "--merge-full-model", action=argparse.BooleanOptionalAction, default=True
    )
    parser.add_argument(
        "--trust-remote-code", action=argparse.BooleanOptionalAction, default=False
    )
    parser.add_argument(
        "--ensure-weight-tying", action=argparse.BooleanOptionalAction, default=True
    )
    parser.add_argument(
        "--gradient-checkpointing", action=argparse.BooleanOptionalAction, default=False
    )
    parser.add_argument(
        "--full-determinism", action=argparse.BooleanOptionalAction, default=False
    )
    parser.add_argument("--resume-from-checkpoint", default="")
    parser.add_argument(
        "--stop-after-steps",
        type=int,
        default=0,
        help="Stop immediately after this global optimizer step while preserving the originally scheduled horizon.",
    )
    parser.add_argument(
        "--load-best-model-at-end", action=argparse.BooleanOptionalAction, default=True
    )
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
                "decomposition_tokens": [
                    tokenizer.convert_ids_to_tokens(int(token_id))
                ],
            }
            continue

        decomposition_ids = [
            int(item) for item in tokenizer.encode(token, add_special_tokens=False)
        ]
        if not decomposition_ids or tokenizer.unk_token_id in decomposition_ids:
            raise RuntimeError(
                f"Cannot initialize additional special token {token!r}: "
                f"pre-addition decomposition is empty or contains the unknown token: {decomposition_ids}"
            )
        input_mean = (
            input_embeddings.weight.detach()[decomposition_ids]
            .float()
            .mean(dim=0)
            .clone()
        )
        output_mean = None
        if output_embeddings is not None:
            output_mean = (
                output_embeddings.weight.detach()[decomposition_ids]
                .float()
                .mean(dim=0)
                .clone()
            )
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
                        raise RuntimeError(
                            f"Missing output-row initialization for {token!r}"
                        )
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
                raise RuntimeError(
                    f"Additional special token resolved to unknown after registration: {token!r}"
                )
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


def resolve_trainable_tokens(
    tokenizer: Any, token_strings: list[str]
) -> tuple[list[int], list[dict[str, Any]]]:
    token_ids: list[int] = []
    records: list[dict[str, Any]] = []
    for token in unique_nonempty(token_strings):
        token_id = int(tokenizer.convert_tokens_to_ids(token))
        round_trip = (
            token_id != tokenizer.unk_token_id
            and tokenizer.convert_ids_to_tokens(token_id) == token
        )
        single_id = tokenizer.encode(token, add_special_tokens=False) == [token_id]
        is_special = token_id in tokenizer.all_special_ids
        if not (round_trip and single_id and is_special):
            raise RuntimeError(
                "Trainable token must be a registered special token and encode as its single exact ID: "
                f"{token!r}; id={token_id}, round_trip={round_trip}, "
                f"single_id={single_id}, is_special={is_special}"
            )
        if token_id not in token_ids:
            token_ids.append(token_id)
            records.append(
                {
                    "token": token,
                    "token_id": token_id,
                    "is_special": is_special,
                    "single_encoded_id": single_id,
                    "selection_source": "cli_registered_special_token",
                }
            )
    return token_ids, records


def resolve_trainable_token_spec(
    tokenizer: Any,
    spec_path: str,
    expected_sha256: str,
    allowed_extension_rows: dict[int, str],
) -> tuple[list[int], list[dict[str, Any]], dict[str, Any] | None]:
    """Resolve a hashed row activation report against an audited tokenizer remap."""
    if not spec_path:
        if expected_sha256:
            raise ValueError(
                "--expected-trainable-token-spec-sha256 requires --trainable-token-spec"
            )
        return [], [], None
    if not expected_sha256:
        raise ValueError(
            "--trainable-token-spec requires --expected-trainable-token-spec-sha256"
        )
    observed_sha256 = sha256_file(spec_path)
    if observed_sha256 != expected_sha256:
        raise ValueError(
            "Trainable-token spec SHA-256 mismatch: "
            f"expected={expected_sha256}, observed={observed_sha256}"
        )
    value = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("Trainable-token spec must be a schema-version-1 JSON object")
    rows = value.get("rows")
    if not isinstance(rows, list) or not rows:
        raise ValueError("Trainable-token spec has no rows")

    selected_ids: list[int] = []
    selected_records: list[dict[str, Any]] = []
    declared_records: list[dict[str, Any]] = []
    seen_declared_ids: set[int] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"Trainable-token spec row {index} is not an object")
        token = str(row.get("token") or "")
        token_id = row.get("token_id")
        selected = row.get("selected_for_gradient_training")
        if not token or not isinstance(token_id, int) or not isinstance(selected, bool):
            raise ValueError(
                f"Trainable-token spec row {index} lacks exact token, token_id, or selection flag"
            )
        if token_id in seen_declared_ids:
            raise ValueError(f"Duplicate token ID in trainable-token spec: {token_id}")
        seen_declared_ids.add(token_id)
        if token_id < 0 or token_id >= len(tokenizer):
            raise ValueError(
                f"Trainable-token spec ID is outside tokenizer: {token_id}"
            )
        observed_token = tokenizer.convert_ids_to_tokens(token_id)
        if observed_token != token:
            raise ValueError(
                "Trainable-token spec identity mismatch: "
                f"declared=({token!r}, {token_id}), observed={observed_token!r}"
            )
        is_special = token_id in tokenizer.all_special_ids
        encoded_ids = [
            int(value) for value in tokenizer.encode(token, add_special_tokens=False)
        ]
        single_id = encoded_ids == [token_id]
        declared_extension_piece = allowed_extension_rows.get(token_id) == token
        if is_special:
            if not single_id:
                raise ValueError(
                    f"Declared special token does not encode as its exact ID: {token!r}"
                )
        elif not declared_extension_piece:
            raise ValueError(
                "Declared ordinary token is not an exact row in the verified tokenizer "
                f"extension plan: {token!r} ({token_id})"
            )
        declared_record = {
            "token": token,
            "token_id": token_id,
            "is_special": is_special,
            "single_encoded_id": single_id,
            "declared_extension_piece": declared_extension_piece,
            "selected_for_gradient_training": selected,
            "selection_source": "hashed_trainable_token_spec",
        }
        declared_records.append(declared_record)
        if not selected:
            continue
        selected_ids.append(token_id)
        selected_records.append(dict(declared_record))
    if not selected_records:
        raise ValueError("Trainable-token spec selects zero rows")
    return (
        selected_ids,
        selected_records,
        {
            "path": str(Path(spec_path).resolve()),
            "sha256": observed_sha256,
            "declared_rows": len(rows),
            "selected_rows": len(selected_records),
            "selected_token_ids": selected_ids,
            "declared_token_rows": declared_records,
        },
    )


def merge_trainable_token_records(
    *groups: tuple[list[int], list[dict[str, Any]]],
) -> tuple[list[int], list[dict[str, Any]]]:
    """Merge independently authorized selections without token/ID aliasing."""
    records_by_id: dict[int, dict[str, Any]] = {}
    id_by_token: dict[str, int] = {}
    ordered_ids: list[int] = []
    for token_ids, records in groups:
        if token_ids != [int(record["token_id"]) for record in records]:
            raise ValueError("Trainable-token IDs and records disagree")
        for record in records:
            token_id = int(record["token_id"])
            token = str(record["token"])
            if token in id_by_token and id_by_token[token] != token_id:
                raise ValueError(f"Trainable token aliases multiple IDs: {token!r}")
            id_by_token[token] = token_id
            existing = records_by_id.get(token_id)
            if existing is not None:
                if existing["token"] != token:
                    raise ValueError(
                        f"Trainable token ID aliases multiple tokens: {token_id}"
                    )
                sources = sorted(
                    {
                        str(existing.get("selection_source") or ""),
                        str(record.get("selection_source") or ""),
                    }
                    - {""}
                )
                existing["selection_source"] = "+".join(sources)
                continue
            ordered_ids.append(token_id)
            records_by_id[token_id] = dict(record)
    return ordered_ids, [records_by_id[token_id] for token_id in ordered_ids]


def resolve_required_trainable_token_updates(
    trainable_token_records: list[dict[str, Any]], requested: list[str] | None
) -> list[str]:
    """Resolve the subset that must update while preserving inherited selected rows."""
    selected = [str(record["token"]) for record in trainable_token_records]
    if requested is None:
        return selected
    if len(requested) != len(set(requested)):
        raise ValueError("Required trainable-token updates contain duplicates")
    unknown = sorted(set(requested) - set(selected))
    if unknown:
        raise ValueError(
            "Required trainable-token updates are not selected trainable rows: "
            f"{unknown}"
        )
    return list(requested)


def audit_control_strings(
    tokenizer: Any, control_strings: list[str]
) -> list[dict[str, Any]]:
    """Freeze how ordinary task controls are represented without changing vocabulary."""
    records: list[dict[str, Any]] = []
    for control in unique_nonempty(control_strings):
        token_ids = [
            int(item) for item in tokenizer.encode(control, add_special_tokens=False)
        ]
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
                "registered_as_special": all(
                    token_id in tokenizer.all_special_ids for token_id in token_ids
                ),
            }
        )
    return records


def snapshot_embedding_rows(
    model: Any, token_records: list[dict[str, Any]]
) -> dict[str, dict[str, torch.Tensor]]:
    input_weight = model.get_input_embeddings().weight.detach()
    output_embeddings = model.get_output_embeddings()
    snapshots: dict[str, dict[str, torch.Tensor]] = {}
    for record in token_records:
        token_id = int(record["token_id"])
        row = {"input": input_weight[token_id].float().cpu().clone()}
        if output_embeddings is not None:
            row["output"] = (
                output_embeddings.weight.detach()[token_id].float().cpu().clone()
            )
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


def build_trainable_token_targets(
    model: Any,
    token_ids: list[int],
    scope: str,
) -> list[int] | dict[str, list[int]] | None:
    """Build the PEFT target shape for source-only controls or tied NLLB rows."""
    if not token_ids:
        return None
    if scope == "tied":
        # PEFT's list form starts at get_input_embeddings() and propagates the
        # same TrainableTokens adapter to every tied embedding/output alias.
        return list(token_ids)
    if scope == "source":
        return {resolve_source_embedding_module_name(model): list(token_ids)}
    raise ValueError(f"Unsupported trainable-token scope: {scope!r}")


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
        raise RuntimeError(
            f"Model is missing required NLLB embedding surfaces: {absent}"
        )

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
        row: dict[str, Any] = {
            "token": token,
            "selected_for_training": token in selected_tokens,
        }
        for kind, initial in before[token].items():
            final = after[token][kind]
            delta = final - initial
            row[f"{kind}_delta_l2"] = float(torch.linalg.vector_norm(delta).item())
            row[f"{kind}_delta_max_abs"] = float(delta.abs().max().item())
            row[f"{kind}_changed"] = bool(torch.count_nonzero(delta).item())
        records.append(row)
    return records


def snapshot_lora_b_parameters(model: Any) -> dict[str, torch.Tensor]:
    """Snapshot every trainable LoRA-B matrix before or after adaptation."""
    snapshots = {
        name: parameter.detach().float().cpu().clone()
        for name, parameter in model.named_parameters()
        if "lora_B" in name and parameter.requires_grad
    }
    if not snapshots:
        raise RuntimeError("LoRA training exposed no trainable LoRA-B parameters")
    return snapshots


def lora_b_parameter_delta_audit(
    before: dict[str, torch.Tensor],
    after: dict[str, torch.Tensor],
) -> dict[str, Any]:
    """Summarize whether the active LoRA-B path received an update."""
    if set(before) != set(after):
        raise RuntimeError(
            "LoRA-B parameter inventory changed during training: "
            f"before_only={sorted(set(before) - set(after))}, "
            f"after_only={sorted(set(after) - set(before))}"
        )

    initial_nonzero_elements = 0
    final_nonzero_elements = 0
    changed_elements = 0
    changed_parameters: list[str] = []
    squared_l2 = 0.0
    maximum_absolute = 0.0
    all_finite = True
    element_count = 0
    for name in sorted(before):
        initial = before[name]
        final = after[name]
        if initial.shape != final.shape:
            raise RuntimeError(
                f"LoRA-B parameter shape changed for {name!r}: {tuple(initial.shape)} -> {tuple(final.shape)}"
            )
        delta = final - initial
        initial_nonzero_elements += int(torch.count_nonzero(initial).item())
        final_nonzero_elements += int(torch.count_nonzero(final).item())
        nonzero_delta = int(torch.count_nonzero(delta).item())
        changed_elements += nonzero_delta
        if nonzero_delta:
            changed_parameters.append(name)
        squared_l2 += float(torch.sum(delta.double().square()).item())
        maximum_absolute = max(maximum_absolute, float(delta.abs().max().item()))
        all_finite = (
            all_finite
            and bool(torch.isfinite(initial).all())
            and bool(torch.isfinite(final).all())
        )
        element_count += int(delta.numel())

    return {
        "parameter_count": len(before),
        "parameter_names_sha256": canonical_json_sha256(sorted(before)),
        "element_count": element_count,
        "initial_nonzero_elements": initial_nonzero_elements,
        "final_nonzero_elements": final_nonzero_elements,
        "changed_parameter_count": len(changed_parameters),
        "changed_parameter_names_sha256": canonical_json_sha256(changed_parameters),
        "changed_elements": changed_elements,
        "delta_l2": squared_l2**0.5,
        "delta_max_abs": maximum_absolute,
        "all_finite": all_finite,
    }


def validate_lora_b_training_audit(
    audit: dict[str, Any],
    *,
    initial_adapter_bound: bool,
    positive_learning_rate_update_count: int,
) -> None:
    """Enforce the appropriate LoRA-B contract for fresh or continued training."""
    if not audit["all_finite"]:
        raise RuntimeError(f"LoRA-B parameter audit contains nonfinite values: {audit}")
    if not initial_adapter_bound and audit["initial_nonzero_elements"] != 0:
        raise RuntimeError(
            f"Fresh LoRA-B parameters were not zero-initialized: {audit}"
        )
    if initial_adapter_bound and audit["initial_nonzero_elements"] == 0:
        raise RuntimeError(
            f"The bound pretrained adapter exposed no nonzero LoRA-B values: {audit}"
        )
    if positive_learning_rate_update_count > 0 and audit["changed_elements"] == 0:
        raise RuntimeError(
            "LoRA-B parameters did not change after a positive-learning-rate "
            f"optimizer step: {audit}"
        )


def add_lang_code(
    tokenizer: Any, model: Any, lang_code: str, init_from: str | None = None
) -> int:
    token_id = tokenizer.convert_tokens_to_ids(lang_code)
    if token_id == tokenizer.unk_token_id:
        init_input_embedding = None
        init_output_embedding = None
        if init_from:
            init_id = tokenizer.convert_tokens_to_ids(init_from)
            if init_id != tokenizer.unk_token_id:
                init_input_embedding = (
                    model.get_input_embeddings().weight.detach()[init_id].clone()
                )
                output_embeddings = model.get_output_embeddings()
                if output_embeddings is not None:
                    init_output_embedding = output_embeddings.weight.detach()[
                        init_id
                    ].clone()

        tokenizer.add_special_tokens({"additional_special_tokens": [lang_code]})
        model.resize_token_embeddings(len(tokenizer))
        token_id = tokenizer.convert_tokens_to_ids(lang_code)
        if init_input_embedding is not None:
            with torch.no_grad():
                model.get_input_embeddings().weight[token_id].copy_(
                    init_input_embedding
                )
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


def load_json_dataset(
    train_file: str,
    validation_file: str | None,
    test_file: str | None,
    extra_columns: list[str] | None = None,
) -> DatasetDict:
    data_files: dict[str, str] = {"train": train_file}
    if validation_file:
        data_files["validation"] = validation_file
    if test_file:
        data_files["test"] = test_file
    model_columns = list(
        dict.fromkeys(
            [
                "direction",
                "id",
                "input_text",
                "output_text",
                "pair_kind",
                "task",
                *(extra_columns or []),
            ]
        )
    )
    result = DatasetDict()
    for split, path in data_files.items():
        rows = load_dataset("json", data_files=path, split="train")
        missing = [
            column for column in model_columns if column not in rows.column_names
        ]
        if missing:
            raise ValueError(
                f"{split} split is missing model-facing columns: {missing}"
            )
        result[split] = rows.select_columns(model_columns)
    return result


def evaluation_strategy(
    *,
    validation_file: str | None,
    max_steps: int,
    load_best_model_at_end: bool,
) -> str:
    """Keep train-only trajectories fixed-step and independent of checkpoint selection."""
    if validation_file:
        return "steps"
    if max_steps <= 0:
        raise ValueError(
            "Training without --validation-file requires a positive --max-steps horizon"
        )
    if load_best_model_at_end:
        raise ValueError(
            "Training without --validation-file requires --no-load-best-model-at-end"
        )
    return "no"


def normalize_text(text: str) -> str:
    return " ".join(text.split())


def audit_dataset_integrity(
    dataset: Any,
    *,
    allow_duplicate_train_pairs: bool,
    allow_cross_split_source_overlap: bool,
    split_group_field: str | None = None,
) -> dict[str, Any]:
    """Fail closed on empty rows, duplicate identities, and split leakage."""
    row_owners: dict[str, tuple[str, int]] = {}
    pair_owners: dict[tuple[str, str, str], list[tuple[str, str]]] = defaultdict(list)
    source_owners: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
    split_group_owners: dict[str, set[str]] = defaultdict(set)
    split_rows: dict[str, int] = {}

    for split, rows in dataset.items():
        split_rows[str(split)] = len(rows)
        if len(rows) == 0:
            raise ValueError(f"Filtered dataset split is empty: {split}")
        for index, row in enumerate(rows):
            row_id = str(row.get("id") or "").strip()
            if not row_id:
                raise ValueError(
                    f"Dataset row has no stable id: split={split}, index={index}"
                )
            if row_id in row_owners:
                owner_split, owner_index = row_owners[row_id]
                raise ValueError(
                    "Dataset row id is not globally unique: "
                    f"id={row_id!r}, first={owner_split}:{owner_index}, second={split}:{index}"
                )
            row_owners[row_id] = (str(split), index)

            direction = str(row.get("direction") or "").strip()
            pair_kind = str(row.get("pair_kind") or "").strip()
            task = str(row.get("task") or "").strip()
            source = normalize_text(str(row.get("input_text") or ""))
            target = normalize_text(str(row.get("output_text") or ""))
            missing = [
                name
                for name, value in (
                    ("direction", direction),
                    ("pair_kind", pair_kind),
                    ("task", task),
                    ("input_text", source),
                    ("output_text", target),
                )
                if not value
            ]
            if missing:
                raise ValueError(
                    f"Dataset row has empty model/audit fields: id={row_id!r}, fields={missing}"
                )

            # pair_kind/task are audit metadata, not necessarily model-visible.
            # Split leakage is therefore keyed only by direction and normalized
            # input text; a real task prefix must already be present in input_text.
            source_key = (direction, source)
            pair_key = (*source_key, target)
            source_owners[source_key].append((str(split), row_id))
            pair_owners[pair_key].append((str(split), row_id))
            if split_group_field:
                split_group = str(row.get(split_group_field) or "").strip()
                if not split_group:
                    raise ValueError(
                        f"Dataset row has no {split_group_field!r}: id={row_id!r}"
                    )
                split_group_owners[split_group].add(str(split))

    duplicate_pair_groups = [
        owners for owners in pair_owners.values() if len(owners) > 1
    ]
    disallowed_pair_groups: list[list[tuple[str, str]]] = []
    for owners in duplicate_pair_groups:
        owner_splits = {split for split, _row_id in owners}
        intentional_train_replay = (
            owner_splits == {"train"} and allow_duplicate_train_pairs
        )
        if not intentional_train_replay:
            disallowed_pair_groups.append(owners)
    if disallowed_pair_groups:
        raise ValueError(
            "Exact normalized source-target pairs are duplicated without authorization: "
            f"groups={disallowed_pair_groups[:10]}, total={len(disallowed_pair_groups)}"
        )

    cross_split_source_groups = [
        owners
        for owners in source_owners.values()
        if len({split for split, _row_id in owners}) > 1
    ]
    if cross_split_source_groups and not allow_cross_split_source_overlap:
        raise ValueError(
            "Normalized model-visible sources cross dataset splits: "
            f"groups={cross_split_source_groups[:10]}, total={len(cross_split_source_groups)}"
        )

    cross_split_family_groups = [
        group_id for group_id, splits in split_group_owners.items() if len(splits) > 1
    ]
    if cross_split_family_groups:
        raise ValueError(
            "Declared split families cross dataset splits: "
            f"field={split_group_field!r}, groups={cross_split_family_groups[:10]}, "
            f"total={len(cross_split_family_groups)}"
        )

    return {
        "status": "PASS",
        "split_rows": split_rows,
        "globally_unique_row_ids": len(row_owners),
        "unique_model_visible_source_keys": len(source_owners),
        "unique_source_target_pairs": len(pair_owners),
        "duplicate_pair_groups": len(duplicate_pair_groups),
        "duplicate_train_pairs_authorized": allow_duplicate_train_pairs,
        "cross_split_source_groups": len(cross_split_source_groups),
        "cross_split_source_overlap_authorized": allow_cross_split_source_overlap,
        "split_group_field": split_group_field,
        "unique_split_groups": len(split_group_owners) if split_group_field else None,
        "cross_split_family_groups": len(cross_split_family_groups),
        "normalization": "Unicode preserved; whitespace collapsed",
        "scope": "direction-filtered pre-cap dataset",
    }


def validate_output_directory(output_dir: Path, resume_from_checkpoint: str) -> None:
    """Prevent a new experiment from silently overwriting an existing run tree."""
    if resume_from_checkpoint and not Path(resume_from_checkpoint).is_dir():
        raise ValueError(
            f"Resume checkpoint is not a directory: {resume_from_checkpoint}"
        )
    if output_dir.exists() and any(output_dir.iterdir()) and not resume_from_checkpoint:
        raise ValueError(
            f"Refusing nonempty output directory without --resume-from-checkpoint: {output_dir}"
        )
    output_dir.mkdir(parents=True, exist_ok=True)


def conflicting_tied_token_modules(modules_to_save: list[str]) -> list[str]:
    """Return full-row embedding requests that conflict with tied selective rows."""
    conflicting_leaf_names = {"shared", "embed_tokens", "lm_head"}
    return [
        module
        for module in modules_to_save
        if module.rsplit(".", 1)[-1] in conflicting_leaf_names
    ]


NLLB_EMBEDDING_SURFACES = (
    "encoder_input",
    "decoder_input",
    "shared_input",
    "output_head",
)


def selective_embedding_surface_contract(
    modules_to_save: list[str],
    trainable_token_scope: str,
    has_selective_tokens: bool,
) -> dict[str, Any]:
    """Separate selectively audited rows from intentionally full-row surfaces."""
    full_row_modules = conflicting_tied_token_modules(modules_to_save)
    full_row_surfaces: list[str] = []
    if has_selective_tokens and trainable_token_scope == "tied" and full_row_modules:
        raise RuntimeError(
            "Tied selective-token rows cannot be combined with full embedding/lm_head "
            f"modules_to_save: {full_row_modules}"
        )
    if has_selective_tokens and trainable_token_scope == "source":
        unsupported = [
            module
            for module in full_row_modules
            if module.rsplit(".", 1)[-1] != "lm_head"
        ]
        if unsupported:
            raise RuntimeError(
                "Source-scoped selective-token rows support a full lm_head only; "
                f"shared/embed_tokens modules would invalidate source-row isolation: {unsupported}"
            )
        if any(module.rsplit(".", 1)[-1] == "lm_head" for module in full_row_modules):
            full_row_surfaces.append("output_head")
    return {
        "full_row_modules": full_row_modules,
        "full_row_surfaces": full_row_surfaces,
        "selective_isolation_surfaces": [
            surface
            for surface in NLLB_EMBEDDING_SURFACES
            if surface not in full_row_surfaces
        ],
    }


def sha256_file(file: str | None) -> str | None:
    if not file:
        return None
    digest = hashlib.sha256()
    with open(file, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_sha256(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def seal_json_contract(value: dict[str, Any]) -> dict[str, Any]:
    """Attach an identity that changes when any nested contract field changes."""
    return {**value, "contract_sha256": canonical_json_sha256(value)}


def directory_artifact_manifest(
    root: Path,
    *,
    excluded_relative_paths: tuple[str, ...] = (),
) -> dict[str, Any]:
    """Hash every regular artifact file and one canonical aggregate inventory."""
    if not root.is_dir():
        raise ValueError(f"Artifact directory does not exist: {root}")
    excluded = set(excluded_relative_paths)
    files: list[dict[str, Any]] = []
    aggregate = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Artifact directory contains a symlink: {path}")
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        if relative in excluded:
            continue
        digest = sha256_file(str(path))
        size = path.stat().st_size
        aggregate.update(f"{digest}  {size}  {relative}\n".encode("utf-8"))
        files.append({"path": relative, "bytes": size, "sha256": digest})
    if not files:
        raise ValueError(f"Artifact directory contains no files: {root}")
    return {
        "root": str(root.resolve()),
        "files": files,
        "file_count": len(files),
        "total_bytes": sum(int(row["bytes"]) for row in files),
        "aggregate_sha256": aggregate.hexdigest(),
        "aggregate_format": "sha256__two_spaces__bytes__two_spaces__relative_path__newline",
        "excluded_relative_paths": sorted(excluded),
    }


def verify_directory_artifact_manifest(
    root: Path,
    expected: dict[str, Any],
) -> dict[str, Any]:
    """Re-hash an artifact tree and reject any added, removed, or changed file."""
    excluded = tuple(
        str(path) for path in expected.get("excluded_relative_paths") or []
    )
    observed = directory_artifact_manifest(
        root,
        excluded_relative_paths=excluded,
    )
    identity_fields = (
        "files",
        "file_count",
        "total_bytes",
        "aggregate_sha256",
        "aggregate_format",
        "excluded_relative_paths",
    )
    mismatches = {
        field: {"expected": expected.get(field), "observed": observed.get(field)}
        for field in identity_fields
        if expected.get(field) != observed.get(field)
    }
    if mismatches:
        raise ValueError(
            f"Artifact directory identity mismatch for {root}: {mismatches}"
        )
    return observed


def tokenizer_identity(tokenizer: Any) -> dict[str, Any]:
    """Hash the complete model-visible vocabulary, special rows, and language maps."""
    language_maps = {}
    for attribute in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attribute, None)
        if isinstance(mapping, dict):
            language_maps[attribute] = {
                str(token): int(token_id) for token, token_id in sorted(mapping.items())
            }
    payload = {
        "tokenizer_class": type(tokenizer).__name__,
        "tokenizer_length": len(tokenizer),
        "vocabulary": {
            str(token): int(token_id)
            for token, token_id in sorted(tokenizer.get_vocab().items())
        },
        "all_special_tokens": [str(token) for token in tokenizer.all_special_tokens],
        "all_special_ids": [int(token_id) for token_id in tokenizer.all_special_ids],
        "language_maps": language_maps,
    }
    return {
        "tokenizer_class": payload["tokenizer_class"],
        "tokenizer_length": payload["tokenizer_length"],
        "vocabulary_rows": len(payload["vocabulary"]),
        "vocabulary_sha256": canonical_json_sha256(payload["vocabulary"]),
        "special_tokens_sha256": canonical_json_sha256(
            {
                "tokens": payload["all_special_tokens"],
                "ids": payload["all_special_ids"],
            }
        ),
        "language_maps_sha256": canonical_json_sha256(language_maps),
        "contract_sha256": canonical_json_sha256(payload),
    }


def model_source_identity(
    reference: str,
    revision: str,
    model: Any,
    tokenizer: Any,
) -> dict[str, Any]:
    """Resolve an exact upstream commit or hash a complete local base bundle."""
    model_commit = getattr(model.config, "_commit_hash", None)
    tokenizer_commit = getattr(tokenizer, "init_kwargs", {}).get("_commit_hash")
    if model_commit and tokenizer_commit and model_commit != tokenizer_commit:
        raise RuntimeError(
            "Base model and tokenizer resolved to different commits: "
            f"model={model_commit}, tokenizer={tokenizer_commit}"
        )
    local_path = Path(reference).expanduser()
    local_inventory = None
    if local_path.is_dir():
        inventory = directory_artifact_manifest(local_path.resolve())
        local_inventory = {
            "file_count": inventory["file_count"],
            "total_bytes": inventory["total_bytes"],
            "aggregate_sha256": inventory["aggregate_sha256"],
            "aggregate_format": inventory["aggregate_format"],
        }
    resolved_commit = model_commit or tokenizer_commit
    if local_inventory is None and not resolved_commit:
        raise RuntimeError(
            "Remote base model did not expose an immutable resolved commit; "
            "supply an immutable Hugging Face revision or a local checksummed bundle"
        )
    identity = {
        "reference": reference,
        "requested_revision": revision or None,
        "resolved_commit": resolved_commit,
        "local_bundle": local_inventory,
        "config_sha256": canonical_json_sha256(model.config.to_dict()),
        "tokenizer": tokenizer_identity(tokenizer),
    }
    return seal_json_contract(identity)


def tokenizer_serialization_expectations(
    tokenizer: Any,
    token_records: list[dict[str, Any]],
    control_records: list[dict[str, Any]],
    *,
    source_lang: str,
    target_lang: str,
) -> dict[str, Any]:
    """Freeze token identities and ordinary control decompositions before save."""
    tokens = []
    for record in token_records:
        token = str(record["token"])
        token_id = int(record["token_id"])
        tokens.append(
            {
                "token": token,
                "token_id": token_id,
                "encoded_ids": [
                    int(item)
                    for item in tokenizer.encode(token, add_special_tokens=False)
                ],
                "is_special": token_id in tokenizer.all_special_ids,
            }
        )
    controls = [
        {
            "control": str(record["control"]),
            "token_ids": [int(item) for item in record["token_ids"]],
        }
        for record in control_records
    ]
    return {
        "tokenizer_length": len(tokenizer),
        "tokens": tokens,
        "ordinary_controls": controls,
        "language_sequence": audit_nllb_language_sequences(
            tokenizer,
            source_lang=source_lang,
            target_lang=target_lang,
        ),
    }


def audit_serialized_tokenizer(
    path: Path,
    *,
    source_lang: str,
    target_lang: str,
    use_fast: bool,
    expected: dict[str, Any],
) -> dict[str, Any]:
    """Reload a saved tokenizer and fail if model-visible identities changed."""
    reloaded = AutoTokenizer.from_pretrained(
        path,
        use_fast=use_fast,
        src_lang=source_lang,
        tgt_lang=target_lang,
    )
    if len(reloaded) != expected["tokenizer_length"]:
        raise RuntimeError(
            "Serialized tokenizer length changed on reload: "
            f"expected={expected['tokenizer_length']}, observed={len(reloaded)}"
        )
    token_audit = []
    for record in expected["tokens"]:
        token = record["token"]
        observed_id = int(reloaded.convert_tokens_to_ids(token))
        observed_encoded_ids = [
            int(item) for item in reloaded.encode(token, add_special_tokens=False)
        ]
        observed_is_special = observed_id in reloaded.all_special_ids
        if (
            observed_id != record["token_id"]
            or observed_encoded_ids != record["encoded_ids"]
            or observed_is_special != record["is_special"]
            or reloaded.convert_ids_to_tokens(observed_id) != token
        ):
            raise RuntimeError(
                "Serialized tokenizer token identity changed on reload: "
                f"token={token!r}, expected={record}, observed_id={observed_id}, "
                f"observed_encoded_ids={observed_encoded_ids}, observed_is_special={observed_is_special}"
            )
        token_audit.append({**record, "status": "PASS"})

    control_audit = []
    for record in expected["ordinary_controls"]:
        observed_ids = [
            int(item)
            for item in reloaded.encode(record["control"], add_special_tokens=False)
        ]
        if observed_ids != record["token_ids"]:
            raise RuntimeError(
                "Serialized tokenizer control decomposition changed on reload: "
                f"control={record['control']!r}, expected={record['token_ids']}, observed={observed_ids}"
            )
        control_audit.append({**record, "status": "PASS"})

    language_sequence_audit = audit_nllb_language_sequences(
        reloaded,
        source_lang=source_lang,
        target_lang=target_lang,
    )
    if language_sequence_audit != expected["language_sequence"]:
        raise RuntimeError(
            "Serialized tokenizer changed the NLLB language-sequence contract: "
            f"expected={expected['language_sequence']}, observed={language_sequence_audit}"
        )

    language_maps = {}
    for attribute in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(reloaded, attribute, None)
        if isinstance(mapping, dict):
            language_maps[attribute] = {
                source_lang: mapping.get(source_lang),
                target_lang: mapping.get(target_lang),
            }
            for language in (source_lang, target_lang):
                expected_id = int(reloaded.convert_tokens_to_ids(language))
                if mapping.get(language) != expected_id:
                    raise RuntimeError(
                        f"Serialized tokenizer language map lost {language!r}: "
                        f"attribute={attribute}, mapped={mapping.get(language)}, token_id={expected_id}"
                    )
    return {
        "status": "PASS",
        "path": str(path.resolve()),
        "tokenizer_class": type(reloaded).__name__,
        "use_fast": use_fast,
        "tokenizer_length": len(reloaded),
        "tokens": token_audit,
        "ordinary_controls": control_audit,
        "language_sequence_audit": language_sequence_audit,
        "language_maps": language_maps,
    }


def write_exposure_ledger(path: Path, presentations: Counter[str]) -> dict[str, Any]:
    """Persist exact row-level presentation counts for post-training causal audits."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row_id, count in sorted(presentations.items()):
            if not row_id or not isinstance(count, int) or count <= 0:
                raise ValueError(
                    f"Exposure rows require a stable id and positive integer count: "
                    f"id={row_id!r}, presentations={count!r}"
                )
            handle.write(
                json.dumps({"id": row_id, "presentations": count}, ensure_ascii=False)
                + "\n"
            )
    return {
        "path": str(path),
        "sha256": sha256_file(str(path)),
        "rows": len(presentations),
        "presentations": sum(presentations.values()),
    }


def load_exposure_ledger(
    path: Path,
    *,
    known_row_ids: set[str],
) -> tuple[Counter[str], dict[str, Any]]:
    """Load one cumulative checkpoint ledger and bind it to the current train rows."""
    presentations: Counter[str] = Counter()
    with path.open(encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, start=1):
            if not raw.strip():
                continue
            row = json.loads(raw)
            row_id = str(row.get("id") or "").strip()
            count = row.get("presentations")
            if (
                not row_id
                or isinstance(count, bool)
                or not isinstance(count, int)
                or count <= 0
            ):
                raise ValueError(
                    f"Invalid exposure-ledger row at {path}:{line_number}: "
                    f"id={row_id!r}, presentations={count!r}"
                )
            if row_id in presentations:
                raise ValueError(
                    f"Duplicate row id in exposure ledger {path}: {row_id!r}"
                )
            if row_id not in known_row_ids:
                raise ValueError(
                    f"Exposure ledger references a row outside the current capped training split: {row_id!r}"
                )
            presentations[row_id] = count
    if not presentations:
        raise ValueError(f"Exposure ledger is empty: {path}")
    return presentations, {
        "path": str(path.resolve()),
        "sha256": sha256_file(str(path)),
        "rows": len(presentations),
        "presentations": sum(presentations.values()),
    }


def exposure_row_profiles(rows: Any) -> dict[str, dict[str, int | str]]:
    """Index immutable token/task accounting attributes for each capped train row."""
    profiles: dict[str, dict[str, int | str]] = {}
    for row in rows:
        row_id = str(row["_row_id"])
        source_tokens = len(row["input_ids"])
        target_tokens = len(row["labels"])
        profile = {
            "task": str(row["_task_label"]),
            "pair_kind": str(row["_pair_kind_label"]),
            "source_tokens": source_tokens,
            "target_tokens": target_tokens,
            "non_padding_tokens": source_tokens + target_tokens,
        }
        existing = profiles.get(row_id)
        if existing is not None and existing != profile:
            raise ValueError(
                "Repeated accounting row id has inconsistent token/task profile: "
                f"id={row_id!r}, first={existing}, second={profile}"
            )
        profiles[row_id] = profile
    return profiles


def exposure_profile_sha256(profiles: dict[str, dict[str, int | str]]) -> str:
    """Hash capped row identities, tasks, and post-truncation token lengths."""
    payload = json.dumps(
        profiles, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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
    if any(
        item is None for item in (inner, shared, encoder_embeddings, decoder_embeddings)
    ):
        raise RuntimeError(
            "Merged model does not expose the expected NLLB shared/encoder/decoder embeddings"
        )
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

    shared_was_runtime = (
        shared.weight.data_ptr() == decoder_embeddings.weight.data_ptr()
    )
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


def standalone_serialization_state_dict(
    model: Any,
) -> tuple[dict[str, torch.Tensor], list[str]]:
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
            raise RuntimeError(
                f"Expected embedding key is absent from merged state: {key}"
            )
        state[key] = runtime_embedding.clone()
    return state, keys


def cap_split(
    dataset: DatasetDict,
    split: str,
    max_samples: int | None,
    *,
    seed: int,
    shuffle: bool,
) -> None:
    if max_samples is None or split not in dataset:
        return
    rows = dataset[split]
    if shuffle:
        rows = rows.shuffle(seed=seed)
    dataset[split] = rows.select(range(min(max_samples, len(rows))))


def validate_resume_step_contract(
    state_step: int,
    *,
    max_steps: int,
    stop_after_steps: int,
) -> None:
    """Reject a resume boundary that cannot preserve the frozen trajectory."""
    if state_step < 0:
        raise ValueError(f"Resume state has an invalid global step: {state_step}")
    if max_steps > 0 and state_step > max_steps:
        raise ValueError(
            "Resume checkpoint is beyond the frozen optimizer horizon: "
            f"checkpoint={state_step}, max_steps={max_steps}"
        )
    if stop_after_steps > 0 and stop_after_steps <= state_step:
        raise ValueError(
            "--stop-after-steps must be later than the resume checkpoint: "
            f"checkpoint={state_step}, stop_after_steps={stop_after_steps}"
        )


class StopAfterStepsCallback(TrainerCallback):
    """End a resumed trajectory at an exact global step without changing its LR horizon."""

    def __init__(self, stop_after_steps: int) -> None:
        self.stop_after_steps = stop_after_steps

    def on_step_end(self, args: Any, state: Any, control: Any, **kwargs: Any) -> Any:
        if self.stop_after_steps > 0 and state.global_step >= self.stop_after_steps:
            control.should_training_stop = True
        return control


EXPOSURE_CHECKPOINT_AUXILIARY_FILES = (
    "exposure-checkpoint.json",
    "exposure-row-presentations.jsonl",
)


class ExposureLedgerCheckpointCallback(TrainerCallback):
    """Write the cumulative row ledger into every resumable checkpoint."""

    def __init__(self, presentations: Counter[str], binding: dict[str, Any]) -> None:
        self.presentations = presentations
        self.binding = binding

    def on_save(self, args: Any, state: Any, control: Any, **kwargs: Any) -> Any:
        if not args.should_save:
            return control
        checkpoint = Path(args.output_dir) / f"checkpoint-{state.global_step}"
        ledger = write_exposure_ledger(
            checkpoint / "exposure-row-presentations.jsonl",
            self.presentations,
        )
        checkpoint_artifacts = directory_artifact_manifest(
            checkpoint,
            excluded_relative_paths=EXPOSURE_CHECKPOINT_AUXILIARY_FILES,
        )
        manifest = {
            "schema_version": 2,
            "global_step": int(state.global_step),
            "accounting_scope": "cumulative_through_checkpoint",
            "binding": self.binding,
            "ledger": ledger,
            "checkpoint_artifacts": checkpoint_artifacts,
        }
        (checkpoint / "exposure-checkpoint.json").write_text(
            json.dumps(manifest, indent=2) + "\n",
            encoding="utf-8",
        )
        return control


ADAPTER_SNAPSHOT_MANIFEST = "snapshot-manifest.json"


def parse_adapter_snapshot_steps(value: str) -> list[int]:
    raw = [item.strip() for item in value.split(",") if item.strip()]
    if not raw:
        return []
    try:
        steps = [int(item) for item in raw]
    except ValueError as error:
        raise ValueError("adapter snapshot steps must be integers") from error
    if any(step <= 0 for step in steps):
        raise ValueError("adapter snapshot steps must be positive")
    if len(set(steps)) != len(steps):
        raise ValueError("adapter snapshot steps must be distinct")
    if steps != sorted(steps):
        raise ValueError("adapter snapshot steps must be sorted")
    return steps


class AdapterSnapshotCallback(TrainerCallback):
    """Save compact, non-resumable PEFT snapshots at an explicit step set."""

    def __init__(
        self,
        steps: list[int],
        tokenizer: Any,
        presentations: Counter[str],
        binding: dict[str, Any],
    ) -> None:
        self.steps = tuple(steps)
        self.tokenizer = tokenizer
        self.presentations = presentations
        self.binding = binding
        self.written_steps: list[int] = []

    def on_step_end(
        self, args: Any, state: Any, control: Any, model: Any = None, **kwargs: Any
    ) -> Any:
        del kwargs
        step = int(state.global_step)
        if step not in self.steps or step in self.written_steps:
            return control
        if not args.should_save:
            raise RuntimeError("adapter snapshot step reached on a process that cannot save")
        if model is None:
            raise RuntimeError("adapter snapshot callback did not receive the model")
        snapshot = Path(args.output_dir) / "adapter-snapshots" / f"step-{step}"
        if snapshot.exists():
            raise RuntimeError(f"refusing existing adapter snapshot: {snapshot}")
        snapshot.mkdir(parents=True)
        model.save_pretrained(
            str(snapshot), safe_serialization=True, save_embedding_layers=False
        )
        self.tokenizer.save_pretrained(str(snapshot))
        ledger = write_exposure_ledger(
            snapshot / "exposure-row-presentations.jsonl", self.presentations
        )
        artifacts = directory_artifact_manifest(
            snapshot, excluded_relative_paths=(ADAPTER_SNAPSHOT_MANIFEST,)
        )
        (snapshot / ADAPTER_SNAPSHOT_MANIFEST).write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "global_step": step,
                    "resumable": False,
                    "binding": self.binding,
                    "ledger": ledger,
                    "artifacts": artifacts,
                },
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        self.written_steps.append(step)
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
                "Expected exactly one trainable-token delta parameter for the selected rows: "
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
            )
            if rows
            else None,
        }


class OptimizerLearningRateAudit(TrainerCallback):
    """Record the learning rate actually applied by each optimizer update."""

    def __init__(self) -> None:
        self.applied_updates: list[dict[str, Any]] = []
        self.post_scheduler_updates: list[dict[str, Any]] = []

    @staticmethod
    def _learning_rates(optimizer: Any) -> list[float]:
        if optimizer is None or not getattr(optimizer, "param_groups", None):
            raise RuntimeError(
                "Optimizer learning-rate audit received no parameter groups"
            )
        return [float(group["lr"]) for group in optimizer.param_groups]

    def on_pre_optimizer_step(
        self,
        args: Any,
        state: Any,
        control: Any,
        optimizer: Any = None,
        **kwargs: Any,
    ) -> Any:
        self.applied_updates.append(
            {
                "optimizer_step": int(state.global_step) + 1,
                "learning_rates": self._learning_rates(optimizer),
            }
        )
        return control

    def on_step_end(
        self,
        args: Any,
        state: Any,
        control: Any,
        optimizer: Any = None,
        **kwargs: Any,
    ) -> Any:
        self.post_scheduler_updates.append(
            {
                "completed_optimizer_step": int(state.global_step),
                "learning_rates": self._learning_rates(optimizer),
            }
        )
        return control

    def summary(self) -> dict[str, Any]:
        positive_updates = [
            row["optimizer_step"]
            for row in self.applied_updates
            if any(learning_rate > 0.0 for learning_rate in row["learning_rates"])
        ]
        return {
            "applied_updates": self.applied_updates,
            "post_scheduler_updates": self.post_scheduler_updates,
            "applied_update_count": len(self.applied_updates),
            "positive_learning_rate_update_count": len(positive_updates),
            "positive_learning_rate_optimizer_steps": positive_updates,
        }


def task_label(row: dict[str, Any]) -> str:
    """Return the declared model task without inferring it from natural-language text."""
    for field in ("task", "task_id"):
        value = row.get(field)
        if value is not None and str(value).strip():
            return str(value).strip()
    return "unclassified"


def pair_kind_label(row: dict[str, Any]) -> str:
    """Return the declared evidence/pair class independently of the model task."""
    value = row.get("pair_kind")
    if value is not None and str(value).strip():
        return str(value).strip()
    return "unclassified"


def row_identity(
    row: dict[str, Any],
    split: str,
    index: int,
    field: str = "id",
) -> str:
    value = row.get(field)
    if value is not None and str(value).strip():
        return str(value).strip()
    raise ValueError(
        f"Dataset row has no accounting identity: split={split}, index={index}, field={field!r}"
    )


def add_accounting_columns(
    dataset: DatasetDict,
    tokenized: DatasetDict,
    accounting_row_id_field: str = "id",
) -> None:
    for split in tokenized:
        rows = dataset[split]
        tokenized[split] = tokenized[split].add_column(
            "_task_label",
            [task_label(row) for row in rows],
        )
        tokenized[split] = tokenized[split].add_column(
            "_pair_kind_label",
            [pair_kind_label(row) for row in rows],
        )
        tokenized[split] = tokenized[split].add_column(
            "_row_id",
            [
                row_identity(row, split, index, accounting_row_id_field)
                for index, row in enumerate(rows)
            ],
        )


def token_inventory(tokenized: DatasetDict) -> dict[str, Any]:
    """Describe the post-truncation tokens available to each split and task."""
    inventory: dict[str, Any] = {}
    for split, rows in tokenized.items():
        totals = {
            "examples": 0,
            "source_tokens": 0,
            "target_tokens": 0,
            "non_padding_tokens": 0,
        }
        by_task: dict[str, dict[str, int]] = defaultdict(
            lambda: {
                "examples": 0,
                "source_tokens": 0,
                "target_tokens": 0,
                "non_padding_tokens": 0,
            }
        )
        by_pair_kind: dict[str, dict[str, int]] = defaultdict(
            lambda: {
                "examples": 0,
                "source_tokens": 0,
                "target_tokens": 0,
                "non_padding_tokens": 0,
            }
        )
        for row in rows:
            source_tokens = len(row["input_ids"])
            target_tokens = len(row["labels"])
            task = row["_task_label"]
            pair_kind = row["_pair_kind_label"]
            for counters in (totals, by_task[task], by_pair_kind[pair_kind]):
                counters["examples"] += 1
                counters["source_tokens"] += source_tokens
                counters["target_tokens"] += target_tokens
                counters["non_padding_tokens"] += source_tokens + target_tokens
        inventory[split] = {
            **totals,
            "counts_are_post_truncation": True,
            "by_task": dict(sorted(by_task.items())),
            "by_pair_kind": dict(sorted(by_pair_kind.items())),
        }
    return inventory


class AccountingDataCollator:
    """Keep provenance labels out of the model batch while exposing them to the trainer."""

    def __init__(self, delegate: Any) -> None:
        self.delegate = delegate

    def __call__(self, features: list[dict[str, Any]]) -> dict[str, Any]:
        clean_features: list[dict[str, Any]] = []
        task_labels: list[str] = []
        pair_kind_labels: list[str] = []
        row_ids: list[str] = []
        for feature in features:
            clean = dict(feature)
            task_labels.append(str(clean.pop("_task_label")))
            pair_kind_labels.append(str(clean.pop("_pair_kind_label")))
            row_ids.append(str(clean.pop("_row_id")))
            clean_features.append(clean)
        batch = self.delegate(clean_features)
        batch["_task_labels"] = task_labels
        batch["_pair_kind_labels"] = pair_kind_labels
        batch["_row_ids"] = row_ids
        return batch


class ExposureAccountingTrainer(Seq2SeqTrainer):
    """Count the exact examples and non-padding tokens consumed by training forwards."""

    def __init__(
        self,
        *args: Any,
        exposure_pad_token_id: int,
        exposure_profiles: dict[str, dict[str, int | str]],
        initial_exposure_presentations: Counter[str] | None = None,
        training_order: str = "random",
        **kwargs: Any,
    ) -> None:
        if training_order not in {"random", "sequential"}:
            raise ValueError(f"Unsupported training order: {training_order!r}")
        self.training_order = training_order
        self.exposure_pad_token_id = exposure_pad_token_id
        self.exposure_totals: Counter[str] = Counter()
        self.exposure_by_task: dict[str, Counter[str]] = defaultdict(Counter)
        self.exposure_by_pair_kind: dict[str, Counter[str]] = defaultdict(Counter)
        self.exposure_row_presentations: Counter[str] = Counter(
            initial_exposure_presentations or {}
        )
        self.initial_exposure_presentations = sum(
            self.exposure_row_presentations.values()
        )
        for row_id, presentations in self.exposure_row_presentations.items():
            profile = exposure_profiles.get(row_id)
            if profile is None:
                raise ValueError(
                    f"No token accounting profile for resumed row: {row_id!r}"
                )
            counts = {
                "examples": presentations,
                "source_tokens": presentations * int(profile["source_tokens"]),
                "target_tokens": presentations * int(profile["target_tokens"]),
                "non_padding_tokens": presentations
                * int(profile["non_padding_tokens"]),
            }
            self.exposure_totals.update(counts)
            self.exposure_by_task[str(profile["task"])].update(counts)
            self.exposure_by_pair_kind[str(profile["pair_kind"])].update(counts)
        super().__init__(*args, **kwargs)

    def _get_train_sampler(self) -> Any:
        if self.training_order == "sequential":
            if self.train_dataset is None:
                return None
            return SequentialSampler(self.train_dataset)
        return super()._get_train_sampler()

    def compute_loss(
        self,
        model: Any,
        inputs: dict[str, Any],
        return_outputs: bool = False,
        **kwargs: Any,
    ) -> Any:
        task_labels = inputs.pop("_task_labels", [])
        pair_kind_labels = inputs.pop("_pair_kind_labels", [])
        row_ids = inputs.pop("_row_ids", [])
        if model.training and task_labels:
            if len(pair_kind_labels) != len(task_labels):
                raise ValueError(
                    "task and pair-kind accounting labels have different lengths"
                )
            source_counts = (
                (inputs["input_ids"] != self.exposure_pad_token_id).sum(dim=1).tolist()
            )
            target_counts = (inputs["labels"] != -100).sum(dim=1).tolist()
            for task, pair_kind, row_id, source_tokens, target_tokens in zip(
                task_labels,
                pair_kind_labels,
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
                self.exposure_by_task[str(task)].update(counts)
                self.exposure_by_pair_kind[str(pair_kind)].update(counts)
                self.exposure_row_presentations[str(row_id)] += 1
        if self.label_smoother is not None and "labels" in inputs:
            # M2M100 has no prepare_decoder_input_ids_from_labels hook. Keep labels
            # in the model call so NLLB shifts them, then smooth the returned logits.
            labels = inputs["labels"]
            outputs = model(**inputs)
            loss = self.label_smoother(outputs, labels)
            return (loss, outputs) if return_outputs else loss
        return super().compute_loss(
            model, inputs, return_outputs=return_outputs, **kwargs
        )

    def prediction_step(
        self, model: Any, inputs: dict[str, Any], *args: Any, **kwargs: Any
    ) -> Any:
        inputs = dict(inputs)
        inputs.pop("_task_labels", None)
        inputs.pop("_pair_kind_labels", None)
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
            "by_pair_kind": {
                label: dict(counts)
                for label, counts in sorted(self.exposure_by_pair_kind.items())
            },
            "unique_rows_seen": len(presentations),
            "presentations_per_seen_row": {
                "minimum": min(presentations) if presentations else 0,
                "maximum": max(presentations) if presentations else 0,
                "mean": (sum(presentations) / len(presentations))
                if presentations
                else 0.0,
            },
            "initial_resumed_presentations": self.initial_exposure_presentations,
            "accounting_scope": "cumulative_current_process_and_validated_resume_prefix",
        }


def main() -> None:
    args = parse_args()
    try:
        adapter_snapshot_steps = parse_adapter_snapshot_steps(
            args.adapter_snapshot_steps
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    for name in (
        "model_id",
        "model_version",
        "run_id",
        "dataset_id",
        "license",
        "direction",
        "source_lang",
        "target_lang",
    ):
        if not str(getattr(args, name)).strip():
            raise SystemExit(f"--{name.replace('_', '-')} cannot be blank")
    if args.stop_after_steps < 0:
        raise SystemExit("--stop-after-steps cannot be negative")
    if args.max_steps == 0 or args.max_steps < -1:
        raise SystemExit("--max-steps must be -1 or a positive integer")
    if args.max_steps > 0 and args.stop_after_steps > args.max_steps:
        raise SystemExit("--stop-after-steps cannot exceed --max-steps")
    snapshot_horizon = args.stop_after_steps or args.max_steps
    if adapter_snapshot_steps:
        if args.training_mode != "lora":
            raise SystemExit("--adapter-snapshot-steps requires --training-mode lora")
        if args.resume_from_checkpoint:
            raise SystemExit(
                "--adapter-snapshot-steps is non-resumable and cannot be combined with "
                "--resume-from-checkpoint"
            )
        if snapshot_horizon <= 0:
            raise SystemExit(
                "--adapter-snapshot-steps requires a positive fixed training horizon"
            )
        if adapter_snapshot_steps[-1] > snapshot_horizon:
            raise SystemExit("adapter snapshot step exceeds the training horizon")
    validation_file = args.validation_file.strip() or None
    try:
        effective_evaluation_strategy = evaluation_strategy(
            validation_file=validation_file,
            max_steps=args.max_steps,
            load_best_model_at_end=args.load_best_model_at_end,
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
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
    if bool(args.trainable_token_spec) != bool(
        args.expected_trainable_token_spec_sha256
    ):
        raise SystemExit(
            "--trainable-token-spec and "
            "--expected-trainable-token-spec-sha256 must be supplied together"
        )
    if args.trainable_token_spec and not args.tokenizer_path:
        raise SystemExit("--trainable-token-spec requires --tokenizer-path")
    if args.training_mode == "full" and (
        args.trainable_token
        or args.trainable_token_spec
        or args.required_trainable_token_update
    ):
        raise SystemExit(
            "--trainable-token is a PEFT control and cannot be used in full mode"
        )
    if args.training_mode != "lora" and args.initial_adapter:
        raise SystemExit("--initial-adapter is supported only in LoRA mode")
    if bool(args.initial_adapter) != bool(args.expected_initial_adapter_sha256):
        raise SystemExit(
            "--initial-adapter and --expected-initial-adapter-sha256 must be supplied together"
        )
    if args.training_mode == "full" and not args.merge_full_model:
        raise SystemExit("full training requires --merge-full-model")
    accounting_row_id_field = args.accounting_row_id_field.strip()
    if not accounting_row_id_field:
        raise SystemExit("--accounting-row-id-field cannot be blank")
    for name in ("max_train_samples", "max_validation_samples", "max_test_samples"):
        value = getattr(args, name)
        if value is not None and value <= 0:
            raise SystemExit(
                f"--{name.replace('_', '-')} must be positive when supplied"
            )
    if args.dataset_release_sha256 and (
        len(args.dataset_release_sha256) != 64
        or any(
            character not in "0123456789abcdef"
            for character in args.dataset_release_sha256
        )
    ):
        raise SystemExit(
            "--dataset-release-sha256 must be one lowercase SHA-256 digest"
        )
    output_dir = Path(args.output_dir)
    validate_output_directory(output_dir, args.resume_from_checkpoint)

    # Validate corpus identity and split isolation before allocating model/GPU memory.
    dataset_file_sha256 = {
        "train": sha256_file(args.train_file),
        "validation": sha256_file(validation_file),
        "test": sha256_file(args.test_file),
    }
    extra_columns = unique_nonempty(
        [
            args.split_group_field,
            accounting_row_id_field if accounting_row_id_field != "id" else "",
        ]
    )
    dataset = load_json_dataset(
        args.train_file,
        validation_file,
        args.test_file,
        extra_columns or None,
    )
    dataset = dataset.filter(lambda row: row.get("direction") == args.direction)
    dataset_integrity = audit_dataset_integrity(
        dataset,
        allow_duplicate_train_pairs=args.allow_duplicate_train_pairs,
        allow_cross_split_source_overlap=args.allow_cross_split_source_overlap,
        split_group_field=args.split_group_field or None,
    )
    cap_split(
        dataset,
        "train",
        args.max_train_samples,
        seed=args.seed,
        shuffle=args.shuffle_before_cap,
    )
    cap_split(
        dataset,
        "validation",
        args.max_validation_samples,
        seed=args.seed + 1,
        shuffle=args.shuffle_before_cap,
    )
    cap_split(
        dataset,
        "test",
        args.max_test_samples,
        seed=args.seed + 2,
        shuffle=args.shuffle_before_cap,
    )
    split_rows = {split: len(rows) for split, rows in dataset.items()}
    dataset_file_sha256_after_load = {
        "train": sha256_file(args.train_file),
        "validation": sha256_file(validation_file),
        "test": sha256_file(args.test_file),
    }
    if dataset_file_sha256_after_load != dataset_file_sha256:
        raise RuntimeError(
            "A dataset file changed while it was being validated: "
            f"before={dataset_file_sha256}, after={dataset_file_sha256_after_load}"
        )

    # Seed only after the corpus has passed all non-model integrity checks.
    set_seed(args.seed)

    effective_use_fast_tokenizer = args.use_fast_tokenizer and not bool(
        args.tokenizer_path
    )
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
        torch_dtype=torch.bfloat16
        if torch.cuda.is_available() and torch.cuda.is_bf16_supported()
        else None,
    )
    base_source_identity = model_source_identity(
        args.base_model,
        args.base_model_revision,
        model,
        base_tokenizer,
    )

    tokenizer_extension_audit = None
    tokenizer_extension_plan = None
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
        tokenizer_extension_plan, tokenizer_extension_audit = (
            remap_nllb_for_tokenizer_extension(
                model,
                base_tokenizer,
                tokenizer,
                token_id_remap_path=args.token_id_remap,
                new_piece_map_path=args.new_piece_map,
                control_tokens=requested_controls,
            )
        )
        tokenizer_extension_audit["manifest"] = {
            "path": str(Path(args.tokenizer_extension_manifest).resolve()),
            "sha256": manifest_sha256,
        }
    else:
        tokenizer = base_tokenizer

    source_lang_id = add_lang_code(tokenizer, model, args.source_lang)
    target_lang_id = add_lang_code(
        tokenizer, model, args.target_lang, init_from=args.target_lang_init_from or None
    )
    additional_special_token_records = add_special_tokens_with_decomposition_mean(
        tokenizer,
        model,
        args.additional_special_token,
    )
    cli_trainable_ids, cli_trainable_records = resolve_trainable_tokens(
        tokenizer, args.trainable_token
    )
    allowed_extension_rows = {
        int(row["new_id"]): str(row["token"])
        for row in (tokenizer_extension_plan or {}).get("initialized_rows", [])
        if row.get("initialization_kind") == "sentencepiece_decomposition_mean"
    }
    try:
        spec_trainable_ids, spec_trainable_records, trainable_token_spec_identity = (
            resolve_trainable_token_spec(
                tokenizer,
                args.trainable_token_spec,
                args.expected_trainable_token_spec_sha256,
                allowed_extension_rows,
            )
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    trainable_token_ids, trainable_token_records = merge_trainable_token_records(
        (cli_trainable_ids, cli_trainable_records),
        (spec_trainable_ids, spec_trainable_records),
    )
    try:
        required_trainable_token_updates = resolve_required_trainable_token_updates(
            trainable_token_records,
            args.required_trainable_token_update,
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    required_trainable_token_update_set = set(required_trainable_token_updates)
    audited_control_strings = audit_control_strings(
        tokenizer, args.audited_control_string
    )

    audit_special_names = unique_nonempty(
        [
            *[record["token"] for record in additional_special_token_records],
            args.source_lang,
            args.target_lang,
            tokenizer.pad_token or "",
            tokenizer.eos_token or "",
        ]
    )
    audit_special_ids, audit_special_records = resolve_trainable_tokens(
        tokenizer, audit_special_names
    )
    spec_declared_records = list(
        (trainable_token_spec_identity or {}).get("declared_token_rows") or []
    )
    spec_declared_ids = [int(record["token_id"]) for record in spec_declared_records]
    _, audit_token_records = merge_trainable_token_records(
        (trainable_token_ids, trainable_token_records),
        (audit_special_ids, audit_special_records),
        (spec_declared_ids, spec_declared_records),
    )
    embedding_rows_before = snapshot_nllb_embedding_surface_rows(
        model, audit_token_records
    )
    tokenizer_expectations = tokenizer_serialization_expectations(
        tokenizer,
        audit_token_records,
        audited_control_strings,
        source_lang=args.source_lang,
        target_lang=args.target_lang,
    )

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
    add_accounting_columns(dataset, tokenized, accounting_row_id_field)
    dataset_token_inventory = token_inventory(tokenized)
    split_exposure_profiles = {
        split: exposure_row_profiles(rows) for split, rows in tokenized.items()
    }
    train_exposure_profiles = split_exposure_profiles["train"]

    lora_target_modules = comma_list(args.lora_target_modules)
    modules_to_save = comma_list(args.modules_to_save)
    trainable_token_targets = build_trainable_token_targets(
        model,
        trainable_token_ids,
        args.trainable_token_scope,
    )
    try:
        initial_adapter_identity = validate_initial_adapter(
            args.initial_adapter,
            args.expected_initial_adapter_sha256,
            lora_r=args.lora_r,
            lora_alpha=args.lora_alpha,
            lora_dropout=args.lora_dropout,
            target_modules=lora_target_modules,
            expected_trainable_token_indices=trainable_token_targets,
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    embedding_surface_contract = selective_embedding_surface_contract(
        modules_to_save,
        args.trainable_token_scope,
        bool(trainable_token_ids),
    )
    effective_ensure_weight_tying: bool | None = args.ensure_weight_tying
    if trainable_token_ids and args.trainable_token_scope == "source":
        # Source controls intentionally use a distinct encoder wrapper; asking
        # PEFT to preserve tied decoder/output aliases would contradict scope.
        effective_ensure_weight_tying = False
    if (
        trainable_token_ids
        and args.trainable_token_scope == "tied"
        and not effective_ensure_weight_tying
    ):
        raise RuntimeError(
            "Tied selective-token training requires --ensure-weight-tying"
        )
    if effective_ensure_weight_tying and embedding_surface_contract["full_row_modules"]:
        effective_ensure_weight_tying = False

    bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    tokenizer_source_bundle = None
    if args.tokenizer_path:
        tokenizer_source_inventory = directory_artifact_manifest(
            Path(args.tokenizer_path).resolve()
        )
        tokenizer_source_bundle = {
            "file_count": tokenizer_source_inventory["file_count"],
            "total_bytes": tokenizer_source_inventory["total_bytes"],
            "aggregate_sha256": tokenizer_source_inventory["aggregate_sha256"],
            "aggregate_format": tokenizer_source_inventory["aggregate_format"],
        }
    remap_source = Path(remap_nllb_for_tokenizer_extension.__code__.co_filename)
    exposure_binding = seal_json_contract(
        {
            "schema_version": 2,
            "code": {
                "trainer_sha256": sha256_file(str(Path(__file__).resolve())),
                "tokenizer_remap_sha256": sha256_file(str(remap_source.resolve())),
            },
            "dataset": {
                "dataset_id": args.dataset_id or None,
                "release_sha256": args.dataset_release_sha256 or None,
                "direction": args.direction,
                "file_sha256": dataset_file_sha256,
                "capped_rows": {split: len(rows) for split, rows in tokenized.items()},
                "row_profile_sha256": {
                    split: exposure_profile_sha256(profiles)
                    for split, profiles in split_exposure_profiles.items()
                },
                "max_samples": {
                    "train": args.max_train_samples,
                    "validation": args.max_validation_samples,
                    "test": args.max_test_samples,
                },
                "shuffle_before_cap": args.shuffle_before_cap,
                "seed": args.seed,
                "allow_duplicate_train_pairs": args.allow_duplicate_train_pairs,
                "allow_cross_split_source_overlap": args.allow_cross_split_source_overlap,
                "split_group_field": args.split_group_field or None,
                "integrity_audit_sha256": canonical_json_sha256(dataset_integrity),
            },
            "base": base_source_identity,
            "tokenizer_and_languages": {
                "effective_tokenizer": tokenizer_identity(tokenizer),
                "tokenizer_source_bundle": tokenizer_source_bundle,
                "tokenizer_extension_manifest_sha256": (
                    tokenizer_extension_audit.get("manifest", {}).get("sha256")
                    if tokenizer_extension_audit
                    else None
                ),
                "token_id_remap_sha256": sha256_file(args.token_id_remap),
                "new_piece_map_sha256": sha256_file(args.new_piece_map),
                "source_lang": args.source_lang,
                "target_lang": args.target_lang,
                "target_lang_init_from": args.target_lang_init_from or None,
                "source_lang_token_id": source_lang_id,
                "target_lang_token_id": target_lang_id,
                "additional_special_tokens": additional_special_token_records,
                "audited_control_strings": audited_control_strings,
                "serialization_expectations_sha256": canonical_json_sha256(
                    tokenizer_expectations
                ),
            },
            "adaptation": {
                "training_mode": args.training_mode,
                "initial_adapter": initial_adapter_identity,
                "trainable_tokens": trainable_token_records,
                "trainable_token_spec": trainable_token_spec_identity,
                "trainable_token_scope": args.trainable_token_scope,
                "trainable_token_targets": trainable_token_targets,
                "embedding_surface_contract": embedding_surface_contract,
                "lora_r": args.lora_r,
                "lora_alpha": args.lora_alpha,
                "lora_dropout": args.lora_dropout,
                "lora_target_modules": lora_target_modules,
                "modules_to_save": modules_to_save,
                "requested_ensure_weight_tying": args.ensure_weight_tying,
                "effective_ensure_weight_tying": effective_ensure_weight_tying,
            },
            "optimization": {
                "trainer_seed": args.seed,
                "trainer_data_seed": args.seed,
                "learning_rate": args.learning_rate,
                "epochs": args.epochs,
                "max_steps": args.max_steps,
                "batch_size": args.batch_size,
                "gradient_accumulation_steps": args.gradient_accumulation_steps,
                "optimizer": args.optimizer,
                "lr_scheduler_type": args.lr_scheduler_type,
                "warmup_ratio": args.warmup_ratio,
                "warmup_steps": args.warmup_steps,
                "weight_decay": args.weight_decay,
                "label_smoothing_factor": args.label_smoothing_factor,
                "max_grad_norm": args.max_grad_norm,
                "gradient_checkpointing": args.gradient_checkpointing,
                "full_determinism": args.full_determinism,
                "fp16": torch.cuda.is_available() and not bf16,
                "bf16": bf16,
            },
            "evaluation_and_serialization": {
                "max_source_length": args.max_source_length,
                "max_target_length": args.max_target_length,
                "eval_steps": args.eval_steps,
                "save_steps": args.save_steps,
                "logging_steps": args.logging_steps,
                "save_total_limit": args.save_total_limit,
                "load_best_model_at_end": args.load_best_model_at_end,
                "metric_for_best_model": "chrf",
                "generation_num_beams": args.generation_num_beams,
                "generation_no_repeat_ngram_size": args.generation_no_repeat_ngram_size,
                "generation_repetition_penalty": args.generation_repetition_penalty,
                "generation_length_penalty": args.generation_length_penalty,
                "merge_full_model": args.merge_full_model,
            },
            "runtime": {
                "python": platform.python_version(),
                "platform": platform.platform(),
                "torch": torch.__version__,
                "cuda_runtime": torch.version.cuda,
                "gpu": torch.cuda.get_device_name(0)
                if torch.cuda.is_available()
                else None,
                "packages": {
                    name: package_version(name)
                    for name in (
                        "accelerate",
                        "datasets",
                        "peft",
                        "sacrebleu",
                        "sentencepiece",
                        "transformers",
                    )
                },
            },
        }
    )

    resume_exposure_manifest = None
    initial_exposure_presentations: Counter[str] = Counter()
    if args.resume_from_checkpoint:
        checkpoint = Path(args.resume_from_checkpoint).resolve()
        try:
            checkpoint.relative_to(output_dir.resolve())
        except ValueError as exc:
            raise ValueError(
                f"Resume checkpoint must be inside the declared output directory: {checkpoint}"
            ) from exc
        checkpoint_state_path = checkpoint / "trainer_state.json"
        checkpoint_exposure_path = checkpoint / "exposure-checkpoint.json"
        checkpoint_ledger_path = checkpoint / "exposure-row-presentations.jsonl"
        for required in (
            checkpoint_state_path,
            checkpoint_exposure_path,
            checkpoint_ledger_path,
        ):
            if not required.is_file():
                raise ValueError(
                    "Resume requires a checkpoint with complete exposure accounting; "
                    f"missing={required}"
                )
        checkpoint_state = json.loads(checkpoint_state_path.read_text(encoding="utf-8"))
        checkpoint_exposure = json.loads(
            checkpoint_exposure_path.read_text(encoding="utf-8")
        )
        if checkpoint_exposure.get("schema_version") != 2:
            raise ValueError(
                "Resume checkpoint uses an unsupported exposure-accounting schema"
            )
        state_step = int(checkpoint_state.get("global_step", -1))
        exposure_step = int(checkpoint_exposure.get("global_step", -2))
        if (
            state_step < 0
            or exposure_step != state_step
            or checkpoint.name != f"checkpoint-{state_step}"
        ):
            raise ValueError(
                "Resume checkpoint state/exposure identity mismatch: "
                f"directory={checkpoint.name!r}, state_step={state_step}, exposure_step={exposure_step}"
            )
        validate_resume_step_contract(
            state_step,
            max_steps=args.max_steps,
            stop_after_steps=args.stop_after_steps,
        )
        if checkpoint_exposure.get("binding") != exposure_binding:
            raise ValueError(
                "Resume checkpoint binding does not match the current corpus, model, tokenizer, or trajectory"
            )
        declared_checkpoint_artifacts = checkpoint_exposure.get("checkpoint_artifacts")
        if not isinstance(declared_checkpoint_artifacts, dict):
            raise ValueError(
                "Resume checkpoint does not declare its artifact inventory"
            )
        verified_checkpoint_artifacts = verify_directory_artifact_manifest(
            checkpoint,
            declared_checkpoint_artifacts,
        )
        initial_exposure_presentations, loaded_ledger = load_exposure_ledger(
            checkpoint_ledger_path,
            known_row_ids=set(train_exposure_profiles),
        )
        declared_ledger = checkpoint_exposure.get("ledger") or {}
        if (
            declared_ledger.get("sha256") != loaded_ledger["sha256"]
            or int(declared_ledger.get("presentations", -1))
            != loaded_ledger["presentations"]
            or int(declared_ledger.get("rows", -1)) != loaded_ledger["rows"]
        ):
            raise ValueError(
                "Resume exposure ledger does not match its checkpoint manifest"
            )
        resume_exposure_manifest = {
            "checkpoint": str(checkpoint),
            "global_step": state_step,
            "checkpoint_state_sha256": sha256_file(str(checkpoint_state_path)),
            "checkpoint_exposure_sha256": sha256_file(str(checkpoint_exposure_path)),
            "checkpoint_artifacts": verified_checkpoint_artifacts,
            "ledger": loaded_ledger,
        }

    if args.training_mode == "lora":
        if initial_adapter_identity:
            model = PeftModel.from_pretrained(
                model,
                initial_adapter_identity["path"],
                is_trainable=True,
            )
        else:
            lora = LoraConfig(
                task_type=TaskType.SEQ_2_SEQ_LM,
                r=args.lora_r,
                lora_alpha=args.lora_alpha,
                lora_dropout=args.lora_dropout,
                target_modules=lora_target_modules,
                modules_to_save=modules_to_save or None,
                trainable_token_indices=trainable_token_targets,
                ensure_weight_tying=bool(effective_ensure_weight_tying),
            )
            model = get_peft_model(model, lora)
        trainable_token_wrapper_modules = [
            name
            for name, module in model.named_modules(remove_duplicate=False)
            if module.__class__.__name__ == "TrainableTokensWrapper"
        ]
        if trainable_token_ids:
            if args.trainable_token_scope == "source":
                if not isinstance(trainable_token_targets, dict):
                    raise RuntimeError(
                        "Source-scoped selective tokens require an explicit embedding-module target"
                    )
                expected_source_module = next(iter(trainable_token_targets))
                if not any(
                    name.endswith(expected_source_module)
                    for name in trainable_token_wrapper_modules
                ):
                    raise RuntimeError(
                        "Selective token training did not wrap NLLB's source encoder embedding: "
                        f"expected={expected_source_module}, observed={trainable_token_wrapper_modules}"
                    )
            else:
                expected_tied_modules = (
                    "model.shared",
                    "model.encoder.embed_tokens",
                    "model.decoder.embed_tokens",
                    "lm_head",
                )
                missing_tied_modules = [
                    expected
                    for expected in expected_tied_modules
                    if not any(
                        name.endswith(expected)
                        for name in trainable_token_wrapper_modules
                    )
                ]
                if missing_tied_modules:
                    raise RuntimeError(
                        "Tied selective-token training did not wrap every NLLB embedding surface: "
                        f"missing={missing_tied_modules}, observed={trainable_token_wrapper_modules}"
                    )
    else:
        effective_ensure_weight_tying = None
        trainable_token_wrapper_modules = []
    selective_token_gradient_audit = SelectiveTokenGradientAudit(
        model, trainable_token_records
    )
    lora_b_parameters_before = (
        snapshot_lora_b_parameters(model) if args.training_mode == "lora" else None
    )
    lora_b_initial_state_audit = None
    if lora_b_parameters_before is not None:
        lora_b_initial_state_audit = lora_b_parameter_delta_audit(
            lora_b_parameters_before, lora_b_parameters_before
        )
        validate_lora_b_training_audit(
            lora_b_initial_state_audit,
            initial_adapter_bound=initial_adapter_identity is not None,
            positive_learning_rate_update_count=0,
        )
        print(
            json.dumps(
                {
                    "lora_b_initialization_contract": (
                        "bound_pretrained_adapter"
                        if initial_adapter_identity
                        else "fresh_peft_zero_initialization"
                    ),
                    "lora_b_initial_state": lora_b_initial_state_audit,
                },
                sort_keys=True,
            )
        )
    optimizer_learning_rate_audit = OptimizerLearningRateAudit()
    if hasattr(model, "print_trainable_parameters"):
        model.print_trainable_parameters()
    else:
        trainable_parameters = sum(
            parameter.numel()
            for parameter in model.parameters()
            if parameter.requires_grad
        )
        total_parameters = sum(parameter.numel() for parameter in model.parameters())
        print(
            f"trainable params: {trainable_parameters:,d} || all params: {total_parameters:,d} || "
            f"trainable%: {100 * trainable_parameters / total_parameters:.6f}"
        )

    data_collator = AccountingDataCollator(
        DataCollatorForSeq2Seq(
            tokenizer=tokenizer, model=model, label_pad_token_id=-100
        )
    )

    def compute_metrics(eval_pred: Any) -> dict[str, float]:
        preds, labels = eval_pred
        if isinstance(preds, tuple):
            preds = preds[0]
        preds = np.asarray(preds)
        # Seq2SeqTrainer can surface sentinel/invalid ids in padded generated
        # predictions. Tokenizer decode expects non-negative vocab ids.
        preds = np.where(
            (preds >= 0) & (preds < len(tokenizer)), preds, tokenizer.pad_token_id
        )
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)
        decoded_preds = [
            normalize_text(text)
            for text in tokenizer.batch_decode(preds, skip_special_tokens=True)
        ]
        decoded_labels = [
            normalize_text(text)
            for text in tokenizer.batch_decode(labels, skip_special_tokens=True)
        ]
        bleu = sacrebleu.corpus_bleu(decoded_preds, [decoded_labels]).score
        chrf = sacrebleu.corpus_chrf(
            decoded_preds, [decoded_labels], word_order=2
        ).score
        return {"bleu": bleu, "chrf": chrf}

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        overwrite_output_dir=False,
        eval_strategy=effective_evaluation_strategy,
        save_strategy="no" if adapter_snapshot_steps else "steps",
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
        seed=args.seed,
        data_seed=args.seed,
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

    callbacks: list[TrainerCallback] = [optimizer_learning_rate_audit]
    if args.stop_after_steps:
        callbacks.append(StopAfterStepsCallback(args.stop_after_steps))
    trainer = ExposureAccountingTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized.get("validation"),
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=callbacks,
        exposure_pad_token_id=tokenizer.pad_token_id,
        exposure_profiles=train_exposure_profiles,
        initial_exposure_presentations=initial_exposure_presentations,
        training_order=args.training_order,
    )
    if int(trainer.args.seed) != args.seed or int(trainer.args.data_seed) != args.seed:
        raise RuntimeError(
            "Trainer seed contract changed: "
            f"requested={args.seed}, trainer_seed={trainer.args.seed}, "
            f"trainer_data_seed={trainer.args.data_seed}"
        )
    if trainer.args.world_size != 1:
        raise RuntimeError(
            "Exposure accounting currently requires exactly one trainer process; "
            f"observed world_size={trainer.args.world_size}"
        )
    adapter_snapshot_callback = None
    if adapter_snapshot_steps:
        adapter_snapshot_callback = AdapterSnapshotCallback(
            adapter_snapshot_steps,
            tokenizer,
            trainer.exposure_row_presentations,
            exposure_binding,
        )
        trainer.add_callback(adapter_snapshot_callback)
    else:
        trainer.add_callback(
            ExposureLedgerCheckpointCallback(
                trainer.exposure_row_presentations,
                exposure_binding,
            )
        )

    train_result = trainer.train(
        resume_from_checkpoint=args.resume_from_checkpoint or None
    )
    expected_global_step = args.stop_after_steps or (
        args.max_steps if args.max_steps > 0 else None
    )
    if (
        expected_global_step is not None
        and trainer.state.global_step != expected_global_step
    ):
        raise RuntimeError(
            f"Exact-step contract failed: expected global step {expected_global_step}, "
            f"observed {trainer.state.global_step}"
        )
    if adapter_snapshot_callback is not None and (
        adapter_snapshot_callback.written_steps != adapter_snapshot_steps
    ):
        raise RuntimeError(
            "Adapter snapshot contract failed: "
            f"expected={adapter_snapshot_steps}, "
            f"observed={adapter_snapshot_callback.written_steps}"
        )
    adapter_dir = output_dir / "adapter"
    adapter_tokenizer_reload_audit = None
    if args.training_mode == "lora":
        trainer.save_model(str(adapter_dir))
        if trainable_token_records:
            trainer.model.save_pretrained(
                str(adapter_dir),
                safe_serialization=True,
                save_embedding_layers=False,
            )
        tokenizer.save_pretrained(str(adapter_dir))
        adapter_tokenizer_reload_audit = audit_serialized_tokenizer(
            adapter_dir,
            source_lang=args.source_lang,
            target_lang=args.target_lang,
            use_fast=effective_use_fast_tokenizer,
            expected=tokenizer_expectations,
        )

    metrics = {"train": train_result.metrics}
    if "validation" in tokenized:
        metrics["validation"] = trainer.evaluate(tokenized["validation"])
    if "test" in tokenized:
        metrics["test"] = trainer.evaluate(tokenized["test"], metric_key_prefix="test")

    selective_token_gradient_audit.close()
    selective_token_gradient_summary = selective_token_gradient_audit.summary()
    selected_rows_missing_nonzero_gradient = [
        row["token"]
        for row in selective_token_gradient_summary["rows"]
        if row["nonzero_backward_calls"] == 0
    ]
    required_rows_missing_nonzero_gradient = [
        token
        for token in selected_rows_missing_nonzero_gradient
        if token in required_trainable_token_update_set
    ]
    optimizer_learning_rate_summary = optimizer_learning_rate_audit.summary()
    embedding_rows_after = snapshot_nllb_embedding_surface_rows(
        trainer.model, audit_token_records
    )
    embedding_row_audit = embedding_row_delta_audit(
        embedding_rows_before,
        embedding_rows_after,
        {record["token"] for record in trainable_token_records},
    )
    embedding_surfaces = NLLB_EMBEDDING_SURFACES
    selective_isolation_surfaces = tuple(
        embedding_surface_contract["selective_isolation_surfaces"]
    )
    changed_unselected_rows = [
        row["token"]
        for row in embedding_row_audit
        if not row["selected_for_training"]
        and any(
            row.get(f"{surface}_changed", False)
            for surface in selective_isolation_surfaces
        )
    ]
    selective_token_isolation_enforced = bool(trainable_token_records)
    expected_selected_surfaces = (
        embedding_surfaces
        if args.trainable_token_scope == "tied"
        else ("encoder_input",)
    )
    unexpected_selected_surfaces = tuple(
        surface
        for surface in selective_isolation_surfaces
        if surface not in expected_selected_surfaces
    )
    selected_rows_missing_expected_updates = [
        {
            "token": row["token"],
            "surfaces": [
                surface
                for surface in expected_selected_surfaces
                if not row.get(f"{surface}_changed", False)
            ],
        }
        for row in embedding_row_audit
        if row["selected_for_training"]
        and any(
            not row.get(f"{surface}_changed", False)
            for surface in expected_selected_surfaces
        )
    ]
    required_rows_missing_expected_updates = [
        row
        for row in selected_rows_missing_expected_updates
        if row["token"] in required_trainable_token_update_set
    ]
    selected_row_change_required = (
        selective_token_isolation_enforced
        and optimizer_learning_rate_summary["positive_learning_rate_update_count"] > 0
    )
    selected_rows_with_unexpected_updates = [
        {
            "token": row["token"],
            "surfaces": [
                surface
                for surface in unexpected_selected_surfaces
                if row.get(f"{surface}_changed", False)
            ],
        }
        for row in embedding_row_audit
        if row["selected_for_training"]
        and any(
            row.get(f"{surface}_changed", False)
            for surface in unexpected_selected_surfaces
        )
    ]

    lora_b_delta_audit = None
    if lora_b_parameters_before is not None:
        lora_b_delta_audit = lora_b_parameter_delta_audit(
            lora_b_parameters_before,
            snapshot_lora_b_parameters(trainer.model),
        )

    mechanism_audit = {
        "schema_version": 1,
        "global_step": int(trainer.state.global_step),
        "lora_b_initialization_contract": (
            "bound_pretrained_adapter"
            if initial_adapter_identity
            else "fresh_peft_zero_initialization"
        )
        if args.training_mode == "lora"
        else None,
        "optimizer_learning_rate_audit": optimizer_learning_rate_summary,
        "selective_token_gradient_audit": selective_token_gradient_summary,
        "required_trainable_token_updates": required_trainable_token_updates,
        "selected_rows_missing_nonzero_gradient": selected_rows_missing_nonzero_gradient,
        "required_rows_missing_nonzero_gradient": required_rows_missing_nonzero_gradient,
        "embedding_row_delta_audit": embedding_row_audit,
        "selected_row_change_required": selected_row_change_required,
        "changed_unselected_rows": changed_unselected_rows,
        "selected_rows_missing_expected_updates": selected_rows_missing_expected_updates,
        "required_rows_missing_expected_updates": required_rows_missing_expected_updates,
        "selected_rows_with_unexpected_updates": selected_rows_with_unexpected_updates,
        "lora_b_parameter_delta_audit": lora_b_delta_audit,
        "lora_b_initial_state_audit": lora_b_initial_state_audit,
    }
    mechanism_audit_path = output_dir / "TRAINING-MECHANISM-AUDIT.json"
    mechanism_audit_path.write_text(
        json.dumps(mechanism_audit, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    if (
        optimizer_learning_rate_summary["applied_update_count"]
        != trainer.state.global_step
    ):
        raise RuntimeError(
            "Optimizer learning-rate audit did not observe every completed update: "
            f"global_step={trainer.state.global_step}, audit={optimizer_learning_rate_summary}"
        )
    if (
        len(optimizer_learning_rate_summary["post_scheduler_updates"])
        != trainer.state.global_step
    ):
        raise RuntimeError(
            "Optimizer learning-rate audit did not observe every scheduler update: "
            f"global_step={trainer.state.global_step}, audit={optimizer_learning_rate_summary}"
        )
    observed_learning_rates = [
        learning_rate
        for stage in ("applied_updates", "post_scheduler_updates")
        for row in optimizer_learning_rate_summary[stage]
        for learning_rate in row["learning_rates"]
    ]
    if not observed_learning_rates or not all(
        np.isfinite(value) and value >= 0.0 for value in observed_learning_rates
    ):
        raise RuntimeError(
            f"Optimizer learning-rate audit contains missing, negative, or nonfinite values: {optimizer_learning_rate_summary}"
        )
    if required_rows_missing_nonzero_gradient:
        raise RuntimeError(
            "Required trainable-token rows received no nonzero gradient: "
            f"{required_rows_missing_nonzero_gradient}"
        )
    if selective_token_isolation_enforced and changed_unselected_rows:
        raise RuntimeError(
            "Selective token training changed unselected embedding audit rows: "
            f"{changed_unselected_rows}"
        )
    if selected_row_change_required and required_rows_missing_expected_updates:
        raise RuntimeError(
            "Required embedding rows are missing updates after a positive-learning-rate optimizer step: "
            f"scope={args.trainable_token_scope}, missing={required_rows_missing_expected_updates}"
        )
    if selective_token_isolation_enforced and selected_rows_with_unexpected_updates:
        raise RuntimeError(
            "Selective token training changed embedding surfaces outside its configured scope: "
            f"scope={args.trainable_token_scope}, changed={selected_rows_with_unexpected_updates}"
        )
    if lora_b_delta_audit is not None:
        validate_lora_b_training_audit(
            lora_b_delta_audit,
            initial_adapter_bound=initial_adapter_identity is not None,
            positive_learning_rate_update_count=optimizer_learning_rate_summary[
                "positive_learning_rate_update_count"
            ],
        )

    merge_embedding_canonicalization = None
    merged_tokenizer_reload_audit = None
    if args.merge_full_model:
        merged = (
            trainer.model.merge_and_unload()
            if args.training_mode == "lora"
            else trainer.model
        )
        merge_embedding_canonicalization = canonicalize_merged_embeddings(merged)
        merged.generation_config.forced_bos_token_id = target_lang_id
        merged.generation_config.num_beams = args.generation_num_beams
        merged.generation_config.no_repeat_ngram_size = (
            args.generation_no_repeat_ngram_size
        )
        merged.generation_config.repetition_penalty = args.generation_repetition_penalty
        merged.generation_config.length_penalty = args.generation_length_penalty
        serialization_state, materialized_embedding_keys = (
            standalone_serialization_state_dict(merged)
        )
        merge_embedding_canonicalization["materialized_serialization_keys"] = (
            materialized_embedding_keys
        )
        merged.save_pretrained(
            str(output_dir / "merged"),
            state_dict=serialization_state,
            safe_serialization=True,
        )
        tokenizer.save_pretrained(str(output_dir / "merged"))
        merged_tokenizer_reload_audit = audit_serialized_tokenizer(
            output_dir / "merged",
            source_lang=args.source_lang,
            target_lang=args.target_lang,
            use_fast=effective_use_fast_tokenizer,
            expected=tokenizer_expectations,
        )

    exposure_ledger = write_exposure_ledger(
        output_dir / "exposure-row-presentations.jsonl",
        trainer.exposure_row_presentations,
    )
    adapter_artifact_manifest = (
        directory_artifact_manifest(adapter_dir)
        if args.training_mode == "lora"
        else None
    )
    merged_artifact_manifest = (
        directory_artifact_manifest(output_dir / "merged")
        if args.merge_full_model
        else None
    )
    adapter_snapshot_manifests = {
        str(step): json.loads(
            (
                output_dir
                / "adapter-snapshots"
                / f"step-{step}"
                / ADAPTER_SNAPSHOT_MANIFEST
            ).read_text(encoding="utf-8")
        )
        for step in adapter_snapshot_steps
    }

    manifest = {
        "model_id": args.model_id,
        "version": args.model_version,
        "run_id": args.run_id or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "base_model": args.base_model,
        "base_model_revision": args.base_model_revision or None,
        "base_model_identity": base_source_identity,
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
            "required_trainable_token_updates": required_trainable_token_updates,
            "trainable_token_spec": trainable_token_spec_identity,
            "trainable_token_scope": args.trainable_token_scope,
            "trainable_token_targets": trainable_token_targets,
            "trainable_token_wrapper_modules": trainable_token_wrapper_modules,
            "selective_token_gradient_audit": selective_token_gradient_summary,
            "embedding_row_delta_audit": embedding_row_audit,
            "selective_token_isolation_enforced": selective_token_isolation_enforced,
            "embedding_surface_contract": embedding_surface_contract,
            "selected_row_change_required": selected_row_change_required,
            "expected_selected_surfaces": list(expected_selected_surfaces),
            "all_selected_expected_surfaces_changed": (
                not selected_rows_missing_expected_updates
                if selective_token_isolation_enforced
                else None
            ),
            "all_required_expected_surfaces_changed": (
                not required_rows_missing_expected_updates
                if required_trainable_token_updates
                else None
            ),
            "selected_rows_missing_expected_updates": selected_rows_missing_expected_updates,
            "required_rows_missing_expected_updates": required_rows_missing_expected_updates,
            "selected_rows_with_unexpected_updates": selected_rows_with_unexpected_updates,
            "unselected_selective_surfaces_unchanged": (
                not changed_unselected_rows
                if selective_token_isolation_enforced
                else None
            ),
            "lora_b_parameter_delta_audit": lora_b_delta_audit,
        },
        "dataset": {
            "dataset_id": args.dataset_id or None,
            "release_sha256": args.dataset_release_sha256 or None,
            "train_file": os.path.abspath(args.train_file),
            "validation_file": os.path.abspath(validation_file)
            if validation_file
            else None,
            "test_file": os.path.abspath(args.test_file) if args.test_file else None,
            "file_sha256": dataset_file_sha256,
            "split_rows": split_rows,
            "row_profile_sha256": {
                split: exposure_profile_sha256(profiles)
                for split, profiles in split_exposure_profiles.items()
            },
            "token_inventory": dataset_token_inventory,
            "max_train_samples": args.max_train_samples,
            "max_validation_samples": args.max_validation_samples,
            "max_test_samples": args.max_test_samples,
            "shuffle_before_cap": args.shuffle_before_cap,
            "training_order": args.training_order,
            "accounting_row_id_field": accounting_row_id_field,
            "integrity_audit": dataset_integrity,
            "allow_duplicate_train_pairs": args.allow_duplicate_train_pairs,
            "allow_cross_split_source_overlap": args.allow_cross_split_source_overlap,
            "split_group_field": args.split_group_field or None,
        },
        "training_args": {
            "training_mode": args.training_mode,
            "initial_adapter": initial_adapter_identity,
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
            "required_trainable_token_updates": required_trainable_token_updates,
            "trainable_token_spec": trainable_token_spec_identity,
            "trainable_token_scope": args.trainable_token_scope,
            "trainable_token_targets": trainable_token_targets,
            "seed": args.seed,
            "training_order": args.training_order,
            "accounting_row_id_field": accounting_row_id_field,
            "ensure_weight_tying": args.ensure_weight_tying,
            "effective_ensure_weight_tying": effective_ensure_weight_tying,
            "generation_num_beams": args.generation_num_beams,
            "generation_no_repeat_ngram_size": args.generation_no_repeat_ngram_size,
            "generation_repetition_penalty": args.generation_repetition_penalty,
            "generation_length_penalty": args.generation_length_penalty,
            "save_total_limit": args.save_total_limit,
            "adapter_snapshot_steps": adapter_snapshot_steps,
            "gradient_checkpointing": args.gradient_checkpointing,
            "full_determinism": args.full_determinism,
            "resume_from_checkpoint": os.path.abspath(args.resume_from_checkpoint)
            if args.resume_from_checkpoint
            else None,
            "stop_after_steps": args.stop_after_steps or None,
            "load_best_model_at_end": args.load_best_model_at_end,
        },
        "metrics": metrics,
        "trainer_state": {
            "seed": int(trainer.args.seed),
            "data_seed": int(trainer.args.data_seed),
            "best_model_checkpoint": trainer.state.best_model_checkpoint,
            "best_metric": trainer.state.best_metric,
            "global_step": trainer.state.global_step,
            "epoch": trainer.state.epoch,
            "log_history": trainer.state.log_history,
            "optimizer_learning_rate_audit": optimizer_learning_rate_summary,
            "actual_training_exposure": {
                **trainer.exposure_summary(),
                "world_size": trainer.args.world_size,
                "binding": exposure_binding,
                "resume_prefix": resume_exposure_manifest,
            },
        },
        "artifacts": {
            "adapter_dir": str(output_dir / "adapter")
            if args.training_mode == "lora"
            else None,
            "merged_dir": str(output_dir / "merged") if args.merge_full_model else None,
            "adapter_inventory": adapter_artifact_manifest,
            "adapter_snapshot_manifests": adapter_snapshot_manifests,
            "merged_inventory": merged_artifact_manifest,
            "adapter_tokenizer_reload_audit": adapter_tokenizer_reload_audit,
            "merged_tokenizer_reload_audit": merged_tokenizer_reload_audit,
            "merge_embedding_canonicalization": merge_embedding_canonicalization,
            "exposure_ledger": exposure_ledger,
            "training_mechanism_audit": {
                "path": str(mechanism_audit_path),
                "bytes": mechanism_audit_path.stat().st_size,
                "sha256": sha256_file(str(mechanism_audit_path)),
            },
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
                for package in (
                    "accelerate",
                    "datasets",
                    "peft",
                    "sacrebleu",
                    "sentencepiece",
                    "transformers",
                )
            },
        },
    }
    (output_dir / "model_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()

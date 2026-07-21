"""Remap NLLB embeddings after a collision-free SentencePiece extension.

NLLB stores language identifiers immediately after its SentencePiece range.  Adding
SentencePiece rows therefore relocates those identifiers.  A plain
``resize_token_embeddings`` preserves rows by integer position and silently assigns
the old language embeddings to the wrong tokens.  This module remaps every shared
token by identity and initializes genuinely new rows from their decomposition under
the frozen base tokenizer.
"""

from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

import torch


def sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with Path(path).open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"expected an object at {path}:{line_number}")
            rows.append(row)
    return rows


def _unique_ids(vocabulary: dict[str, int], label: str) -> None:
    counts = Counter(int(token_id) for token_id in vocabulary.values())
    duplicates = sorted(token_id for token_id, count in counts.items() if count > 1)
    if duplicates:
        raise RuntimeError(f"{label} tokenizer has duplicate vocabulary IDs: {duplicates[:20]}")


def _validated_decomposition(
    base_tokenizer: Any,
    token: str,
    declared_ids: Iterable[int] | None = None,
) -> list[int]:
    observed = [int(token_id) for token_id in base_tokenizer.encode(token, add_special_tokens=False)]
    if not observed or int(base_tokenizer.unk_token_id) in observed:
        raise RuntimeError(f"new token has no valid base decomposition: {token!r} -> {observed}")
    if declared_ids is not None:
        declared = [int(token_id) for token_id in declared_ids]
        if declared != observed:
            raise RuntimeError(
                f"declared base decomposition does not reproduce for {token!r}: "
                f"declared={declared}, observed={observed}"
            )
    return observed


def build_embedding_remap_plan(
    base_tokenizer: Any,
    candidate_tokenizer: Any,
    token_id_remap_rows: list[dict[str, Any]],
    new_piece_rows: list[dict[str, Any]],
    control_tokens: list[str],
) -> dict[str, Any]:
    """Validate the tokenizer artifacts and return a complete row-assignment plan."""
    base_vocab = {str(token): int(token_id) for token, token_id in base_tokenizer.get_vocab().items()}
    candidate_vocab = {
        str(token): int(token_id) for token, token_id in candidate_tokenizer.get_vocab().items()
    }
    _unique_ids(base_vocab, "base")
    _unique_ids(candidate_vocab, "candidate")
    if set(candidate_vocab.values()) != set(range(len(candidate_tokenizer))):
        raise RuntimeError("candidate tokenizer vocabulary IDs are not one contiguous range")

    expected_common = set(base_vocab) & set(candidate_vocab)
    remap_by_token: dict[str, tuple[int, int]] = {}
    for row in token_id_remap_rows:
        token = str(row.get("token") or "")
        old_id = int(row["old_id"])
        new_id = int(row["new_id"])
        if not token or token in remap_by_token:
            raise RuntimeError(f"duplicate or blank token in token-ID remap: {token!r}")
        if base_vocab.get(token) != old_id or candidate_vocab.get(token) != new_id:
            raise RuntimeError(
                f"token-ID remap disagrees with tokenizers for {token!r}: "
                f"declared=({old_id}, {new_id}), "
                f"observed=({base_vocab.get(token)}, {candidate_vocab.get(token)})"
            )
        remap_by_token[token] = (old_id, new_id)
    if set(remap_by_token) != expected_common:
        missing = sorted(expected_common - set(remap_by_token))
        extra = sorted(set(remap_by_token) - expected_common)
        raise RuntimeError(
            "token-ID remap does not cover the exact common vocabulary: "
            f"missing={missing[:20]}, extra={extra[:20]}"
        )

    candidate_only = set(candidate_vocab) - set(base_vocab)
    initializer_by_token: dict[str, dict[str, Any]] = {}
    for row in new_piece_rows:
        token = str(row.get("token") or "")
        if not token or token in initializer_by_token:
            raise RuntimeError(f"duplicate or blank token in new-piece map: {token!r}")
        if token not in candidate_only:
            raise RuntimeError(f"new-piece token is not candidate-only: {token!r}")
        token_id = int(row["token_id"])
        if candidate_vocab[token] != token_id:
            raise RuntimeError(
                f"new-piece ID disagrees with candidate tokenizer for {token!r}: "
                f"declared={token_id}, observed={candidate_vocab[token]}"
            )
        surface = str(row.get("surface_for_initialization") or "")
        if not surface:
            raise RuntimeError(f"new-piece initializer surface is blank: {token!r}")
        decomposition = _validated_decomposition(
            base_tokenizer,
            surface,
            row.get("old_decomposition_ids") or [],
        )
        initializer_by_token[token] = {
            "token": token,
            "new_id": token_id,
            "base_decomposition_ids": decomposition,
            "base_decomposition_tokens": base_tokenizer.convert_ids_to_tokens(decomposition),
            "initialization_kind": "sentencepiece_decomposition_mean",
            "surface": surface,
        }

    controls = list(dict.fromkeys(str(token).strip() for token in control_tokens if str(token).strip()))
    for token in controls:
        if token not in candidate_only:
            raise RuntimeError(f"declared control is not a candidate-only token: {token!r}")
        if token in initializer_by_token:
            raise RuntimeError(f"declared control collides with a new SentencePiece row: {token!r}")
        token_id = candidate_vocab[token]
        encoded = [int(value) for value in candidate_tokenizer.encode(token, add_special_tokens=False)]
        if encoded != [token_id] or token_id not in candidate_tokenizer.all_special_ids:
            raise RuntimeError(
                f"declared control is not one registered candidate special token: "
                f"{token!r} -> {encoded}"
            )
        decomposition = _validated_decomposition(base_tokenizer, token)
        initializer_by_token[token] = {
            "token": token,
            "new_id": token_id,
            "base_decomposition_ids": decomposition,
            "base_decomposition_tokens": base_tokenizer.convert_ids_to_tokens(decomposition),
            "initialization_kind": "control_decomposition_mean",
            "surface": token,
        }

    if set(initializer_by_token) != candidate_only:
        missing = sorted(candidate_only - set(initializer_by_token))
        extra = sorted(set(initializer_by_token) - candidate_only)
        raise RuntimeError(
            "initializers do not cover the exact candidate-only vocabulary: "
            f"missing={missing[:20]}, extra={extra[:20]}"
        )

    common_rows = [
        {"token": token, "old_id": old_id, "new_id": new_id}
        for token, (old_id, new_id) in sorted(
            remap_by_token.items(), key=lambda item: (item[1][1], item[0])
        )
    ]
    initialized_rows = sorted(initializer_by_token.values(), key=lambda row: row["new_id"])
    covered_ids = {row["new_id"] for row in common_rows} | {
        row["new_id"] for row in initialized_rows
    }
    if covered_ids != set(range(len(candidate_tokenizer))):
        raise RuntimeError("embedding remap plan does not assign every candidate vocabulary row")

    return {
        "base_vocabulary_size": len(base_tokenizer),
        "candidate_vocabulary_size": len(candidate_tokenizer),
        "common_rows": common_rows,
        "initialized_rows": initialized_rows,
        "common_row_count": len(common_rows),
        "moved_common_row_count": sum(row["old_id"] != row["new_id"] for row in common_rows),
        "initialized_row_count": len(initialized_rows),
        "control_row_count": sum(
            row["initialization_kind"] == "control_decomposition_mean"
            for row in initialized_rows
        ),
    }


def remap_embedding_matrix(old_weight: torch.Tensor, plan: dict[str, Any]) -> torch.Tensor:
    """Create one fully assigned candidate matrix from a frozen base matrix."""
    expected_old_rows = int(plan["base_vocabulary_size"])
    if old_weight.ndim != 2 or old_weight.shape[0] != expected_old_rows:
        raise RuntimeError(
            f"base embedding shape does not match plan: {tuple(old_weight.shape)} vs {expected_old_rows}"
        )
    result = old_weight.new_empty((int(plan["candidate_vocabulary_size"]), old_weight.shape[1]))
    common = plan["common_rows"]
    old_ids = torch.tensor([row["old_id"] for row in common], device=old_weight.device)
    new_ids = torch.tensor([row["new_id"] for row in common], device=old_weight.device)
    result.index_copy_(0, new_ids, old_weight.index_select(0, old_ids))
    for row in plan["initialized_rows"]:
        decomposition = torch.tensor(row["base_decomposition_ids"], device=old_weight.device)
        result[int(row["new_id"])].copy_(
            old_weight.index_select(0, decomposition).float().mean(dim=0).to(old_weight.dtype)
        )
    return result


def _nllb_input_topology(model: Any) -> dict[str, Any]:
    inner = model.model
    shared = inner.shared
    encoder = inner.encoder.embed_tokens
    decoder = inner.decoder.embed_tokens
    return {
        "encoder_shared_tied": encoder.weight.data_ptr() == shared.weight.data_ptr(),
        "decoder_shared_tied": decoder.weight.data_ptr() == shared.weight.data_ptr(),
        "encoder_shared_values_equal": torch.equal(encoder.weight, shared.weight),
        "decoder_shared_values_equal": torch.equal(decoder.weight, shared.weight),
    }


def apply_embedding_remap(model: Any, plan: dict[str, Any]) -> dict[str, Any]:
    """Apply a validated plan to an NLLB model and verify every invariant."""
    before_topology = _nllb_input_topology(model)
    if not before_topology["encoder_shared_values_equal"] or not before_topology[
        "decoder_shared_values_equal"
    ]:
        raise RuntimeError(f"NLLB input embeddings diverged before remap: {before_topology}")
    model.set_input_embeddings(model.model.shared)
    input_module = model.get_input_embeddings()
    output_module = model.get_output_embeddings()
    if output_module is None:
        raise RuntimeError("NLLB model does not expose an output embedding head")
    output_was_tied = output_module.weight.data_ptr() == input_module.weight.data_ptr()
    old_input = input_module.weight.detach().clone()
    old_output = output_module.weight.detach().clone()

    remapped_input = remap_embedding_matrix(old_input, plan)
    remapped_output = remap_embedding_matrix(old_output, plan)
    model.resize_token_embeddings(int(plan["candidate_vocabulary_size"]), mean_resizing=False)
    with torch.no_grad():
        model.get_input_embeddings().weight.copy_(remapped_input)
        resized_output = model.get_output_embeddings()
        if resized_output is None:
            raise RuntimeError("NLLB output embedding head disappeared after resize")
        resized_output.weight.copy_(remapped_output)
    model.set_input_embeddings(model.get_input_embeddings())
    if output_was_tied:
        model.tie_weights()

    after_topology = _nllb_input_topology(model)
    output_after = model.get_output_embeddings()
    if output_after is None:
        raise RuntimeError("NLLB output embedding head is absent after remap")
    output_is_tied = output_after.weight.data_ptr() == model.get_input_embeddings().weight.data_ptr()
    checks = {
        "candidate_input_shape": list(model.get_input_embeddings().weight.shape),
        "candidate_output_shape": list(output_after.weight.shape),
        "config_vocabulary_size": int(model.config.vocab_size),
        "all_common_input_rows_exact": torch.equal(
            model.get_input_embeddings().weight[
                torch.tensor([row["new_id"] for row in plan["common_rows"]], device=old_input.device)
            ],
            old_input[
                torch.tensor([row["old_id"] for row in plan["common_rows"]], device=old_input.device)
            ],
        ),
        "all_common_output_rows_exact": torch.equal(
            output_after.weight[
                torch.tensor([row["new_id"] for row in plan["common_rows"]], device=old_output.device)
            ],
            old_output[
                torch.tensor([row["old_id"] for row in plan["common_rows"]], device=old_output.device)
            ],
        ),
        "encoder_shared_tied": after_topology["encoder_shared_tied"],
        "decoder_shared_tied": after_topology["decoder_shared_tied"],
        "output_tying_preserved": output_is_tied == output_was_tied,
    }
    expected_shape = [int(plan["candidate_vocabulary_size"]), int(old_input.shape[1])]
    passed = (
        checks["candidate_input_shape"] == expected_shape
        and checks["candidate_output_shape"] == expected_shape
        and checks["config_vocabulary_size"] == expected_shape[0]
        and all(
            bool(checks[name])
            for name in (
                "all_common_input_rows_exact",
                "all_common_output_rows_exact",
                "encoder_shared_tied",
                "decoder_shared_tied",
                "output_tying_preserved",
            )
        )
    )
    if not passed:
        raise RuntimeError(f"NLLB embedding remap failed postconditions: {checks}")
    return {
        "status": "PASS",
        "before_topology": before_topology,
        "after_topology": after_topology,
        "output_head_tied_before": output_was_tied,
        "output_head_tied_after": output_is_tied,
        "checks": checks,
        "common_row_count": int(plan["common_row_count"]),
        "moved_common_row_count": int(plan["moved_common_row_count"]),
        "initialized_row_count": int(plan["initialized_row_count"]),
        "control_row_count": int(plan["control_row_count"]),
    }


def remap_nllb_for_tokenizer_extension(
    model: Any,
    base_tokenizer: Any,
    candidate_tokenizer: Any,
    *,
    token_id_remap_path: str | Path,
    new_piece_map_path: str | Path,
    control_tokens: list[str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    plan = build_embedding_remap_plan(
        base_tokenizer,
        candidate_tokenizer,
        read_jsonl(token_id_remap_path),
        read_jsonl(new_piece_map_path),
        control_tokens,
    )
    audit = apply_embedding_remap(model, plan)
    audit["artifacts"] = {
        "token_id_remap_path": str(Path(token_id_remap_path).resolve()),
        "token_id_remap_sha256": sha256(token_id_remap_path),
        "new_piece_map_path": str(Path(new_piece_map_path).resolve()),
        "new_piece_map_sha256": sha256(new_piece_map_path),
    }
    return plan, audit

"""Deterministically extend an NLLB base before loading a selective-token adapter."""

from __future__ import annotations

from typing import Any


def pair_tokens_with_expected_ids(
    tokens: list[str], expected_ids: list[int]
) -> list[tuple[str, int]]:
    normalized = [str(token).strip() for token in tokens]
    if not normalized or any(not token for token in normalized):
        if normalized:
            raise ValueError("additional special tokens must be nonempty")
        return []
    if len(normalized) != len(set(normalized)):
        raise ValueError("additional special tokens contain duplicates")
    if len(normalized) != len(expected_ids):
        raise ValueError(
            "every additional special token requires one expected appended token ID"
        )
    if len(expected_ids) != len(set(expected_ids)):
        raise ValueError("expected appended token IDs contain duplicates")
    return list(zip(normalized, [int(value) for value in expected_ids], strict=True))


def append_special_tokens_with_decomposition_mean(
    tokenizer: Any,
    model: Any,
    tokens_and_ids: list[tuple[str, int]],
) -> list[dict[str, Any]]:
    """Reproduce the trainer's float32 decomposition-mean initialization."""
    if not tokens_and_ids:
        return []
    import torch

    input_embeddings = model.get_input_embeddings()
    output_embeddings = model.get_output_embeddings()
    prepared = []
    for token, expected_id in tokens_and_ids:
        if int(tokenizer.convert_tokens_to_ids(token)) != int(tokenizer.unk_token_id):
            raise ValueError(f"runtime-appended token already exists: {token!r}")
        if len(tokenizer) != expected_id:
            raise ValueError(
                f"runtime-appended token ID changed for {token!r}: "
                f"base_length={len(tokenizer)} expected={expected_id}"
            )
        decomposition_ids = [
            int(value) for value in tokenizer.encode(token, add_special_tokens=False)
        ]
        if not decomposition_ids or int(tokenizer.unk_token_id) in decomposition_ids:
            raise ValueError(f"invalid base decomposition for {token!r}: {decomposition_ids}")
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
        prepared.append(
            {
                "token": token,
                "token_id": expected_id,
                "decomposition_ids": decomposition_ids,
                "decomposition_tokens": tokenizer.convert_ids_to_tokens(
                    decomposition_ids
                ),
                "input_mean": input_mean,
                "output_mean": output_mean,
            }
        )
        tokenizer.add_special_tokens(
            {"additional_special_tokens": [token]},
            replace_additional_special_tokens=False,
        )
    model.resize_token_embeddings(len(tokenizer))
    with torch.no_grad():
        input_embeddings = model.get_input_embeddings()
        output_embeddings = model.get_output_embeddings()
        for record in prepared:
            token = record["token"]
            token_id = int(tokenizer.convert_tokens_to_ids(token))
            if token_id != int(record["token_id"]):
                raise ValueError(
                    f"runtime-appended token ID changed for {token!r}: "
                    f"{token_id} != {record['token_id']}"
                )
            input_embeddings.weight[token_id].copy_(
                record.pop("input_mean").to(
                    input_embeddings.weight.device, input_embeddings.weight.dtype
                )
            )
            output_mean = record.pop("output_mean")
            if output_embeddings is not None:
                if output_mean is None:
                    raise RuntimeError(f"missing output initialization for {token!r}")
                output_embeddings.weight[token_id].copy_(
                    output_mean.to(
                        output_embeddings.weight.device,
                        output_embeddings.weight.dtype,
                    )
                )
            if tokenizer.encode(token, add_special_tokens=False) != [token_id]:
                raise RuntimeError(f"runtime-appended token is not one exact ID: {token!r}")
            if token_id not in tokenizer.all_special_ids:
                raise RuntimeError(f"runtime-appended token is not special: {token!r}")
            record["initialization"] = "base_decomposition_mean_float32"
    return prepared

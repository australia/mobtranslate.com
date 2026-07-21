#!/usr/bin/env python3
"""Audit NLLB language-token embeddings and serialization-relevant tying."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--require-cuda", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, indent=2, ensure_ascii=False, sort_keys=True)
        handle.write("\n")
    try:
        temporary.replace(path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def main() -> None:
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    args = parse_args()
    if args.require_cuda and not torch.cuda.is_available():
        raise SystemExit("CUDA is required")
    tokenizer = AutoTokenizer.from_pretrained(
        str(args.model_dir),
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        local_files_only=True,
    )
    dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else None
    model = AutoModelForSeq2SeqLM.from_pretrained(
        str(args.model_dir), torch_dtype=dtype, local_files_only=True
    )
    source_id = tokenizer.convert_tokens_to_ids(args.source_lang)
    target_id = tokenizer.convert_tokens_to_ids(args.target_lang)
    unknown_id = tokenizer.unk_token_id
    inner = model.model
    shared = inner.shared.weight
    encoder = inner.encoder.embed_tokens.weight
    decoder = inner.decoder.embed_tokens.weight
    input_embedding = model.get_input_embeddings().weight
    output_embedding = model.get_output_embeddings().weight

    def row_stats(weight: Any, token_id: int) -> dict[str, Any]:
        row = weight[token_id].detach().float().cpu()
        return {
            "shape": list(row.shape),
            "finite": bool(torch.isfinite(row).all()),
            "nonzero": bool(torch.count_nonzero(row)),
            "l2_norm": float(torch.linalg.vector_norm(row)),
            "mean": float(row.mean()),
            "standard_deviation": float(row.std()),
        }

    pointers = {
        "shared": shared.data_ptr(),
        "encoder": encoder.data_ptr(),
        "decoder": decoder.data_ptr(),
        "input": input_embedding.data_ptr(),
        "output": output_embedding.data_ptr(),
    }
    generation_id = model.generation_config.forced_bos_token_id
    checks = {
        "source_language_token_exists": source_id != unknown_id,
        "target_language_token_exists": target_id != unknown_id,
        "target_id_within_all_embedding_matrices": all(
            target_id < weight.shape[0]
            for weight in (shared, encoder, decoder, input_embedding, output_embedding)
        ),
        "shared_encoder_decoder_input_are_same_runtime_tensor": len(
            {pointers["shared"], pointers["encoder"], pointers["decoder"], pointers["input"]}
        )
        == 1,
        "generation_forced_bos_is_target": generation_id == target_id,
        "tokenizer_and_model_vocab_agree": len(tokenizer) == input_embedding.shape[0],
        "target_input_row_finite_nonzero": False,
        "target_output_row_finite_nonzero": False,
    }
    input_stats = row_stats(input_embedding, target_id)
    output_stats = row_stats(output_embedding, target_id)
    checks["target_input_row_finite_nonzero"] = input_stats["finite"] and input_stats["nonzero"]
    checks["target_output_row_finite_nonzero"] = output_stats["finite"] and output_stats["nonzero"]
    result = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if all(checks.values()) else "FAIL",
        "model_dir": str(args.model_dir.resolve()),
        "model_sha256": sha256(args.model_dir / "model.safetensors"),
        "tokenizer_sha256": sha256(args.model_dir / "tokenizer.json"),
        "source_lang": args.source_lang,
        "source_lang_token_id": source_id,
        "target_lang": args.target_lang,
        "target_lang_token_id": target_id,
        "tokenizer_length": len(tokenizer),
        "config_vocab_size": model.config.vocab_size,
        "generation_forced_bos_token_id": generation_id,
        "config_forced_bos_token_id": getattr(model.config, "forced_bos_token_id", None),
        "config_tie_word_embeddings": getattr(model.config, "tie_word_embeddings", None),
        "runtime_tying": {
            "shared_encoder_decoder_input_tied": checks[
                "shared_encoder_decoder_input_are_same_runtime_tensor"
            ],
            "output_tied_to_input": pointers["output"] == pointers["input"],
        },
        "target_rows": {"input": input_stats, "output": output_stats},
        "checks": checks,
        "interpretation": (
            "An independent output head is permitted when serialized intentionally; the required invariants are "
            "a persisted finite custom row, tied shared encoder/decoder input embeddings, and forced target BOS."
        ),
    }
    write_atomic(args.output, result)
    print(json.dumps(result, indent=2))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()

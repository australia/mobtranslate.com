#!/usr/bin/env python3
"""Materialize and reload-audit an untrained NLLB control model."""

from __future__ import annotations

import argparse
import gc
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import shutil
import tempfile
import time
from typing import Any


TOKENIZER_BUNDLE_NAMES = (
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-model", type=Path, required=True)
    parser.add_argument("--tokenizer-contract", type=Path, required=True)
    parser.add_argument("--expected-tokenizer-contract-sha256", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--artifact-id", required=True)
    parser.add_argument("--probe", action="append", default=[])
    parser.add_argument("--max-new-tokens", type=int, default=24)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tensor_sha256(tensor: Any, *, rows: int | None = None, chunk_rows: int = 1024) -> str:
    digest = hashlib.sha256()
    value = tensor.detach()
    limit = int(value.shape[0]) if rows is None else rows
    if limit < 0 or limit > int(value.shape[0]):
        raise ValueError(f"invalid tensor hash row limit: {limit} for {tuple(value.shape)}")
    for start in range(0, limit, chunk_rows):
        chunk = value[start : min(limit, start + chunk_rows)].float().cpu().contiguous()
        digest.update(chunk.numpy().tobytes(order="C"))
    return digest.hexdigest()


def row_sha256(tensor: Any, row_id: int) -> str:
    return tensor_sha256(tensor[row_id : row_id + 1])


def tokenizer_bundle_identity(root: Path) -> dict[str, Any]:
    files = [root / name for name in TOKENIZER_BUNDLE_NAMES if (root / name).is_file()]
    if not files:
        raise FileNotFoundError(f"no tokenizer files under {root}")
    digest = hashlib.sha256()
    hashes: dict[str, str] = {}
    for path in files:
        file_hash = sha256_file(path)
        hashes[path.name] = file_hash
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(file_hash))
    return {
        "algorithm": "sha256(relative_name_nul_file_sha256_bytes)",
        "sha256": digest.hexdigest(),
        "files": hashes,
    }


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def embedding_topology(model: Any) -> dict[str, Any]:
    tensors = {
        "shared_input": model.get_input_embeddings().weight,
        "encoder_input": model.model.encoder.embed_tokens.weight,
        "decoder_input": model.model.decoder.embed_tokens.weight,
        "output_head": model.get_output_embeddings().weight,
    }
    pointers = {name: int(value.data_ptr()) for name, value in tensors.items()}
    return {
        "pointers": pointers,
        "shapes": {name: list(value.shape) for name, value in tensors.items()},
        "shared_encoder_decoder_tied": len(
            {pointers["shared_input"], pointers["encoder_input"], pointers["decoder_input"]}
        )
        == 1,
        "output_head_tied_to_shared": pointers["output_head"] == pointers["shared_input"],
        "config_tie_word_embeddings": bool(model.config.tie_word_embeddings),
    }


def canonicalize_input_aliases(model: Any) -> dict[str, Any]:
    import torch

    before = embedding_topology(model)
    shared = model.get_input_embeddings().weight
    equality = {
        "shared_encoder": bool(torch.equal(shared, model.model.encoder.embed_tokens.weight)),
        "shared_decoder": bool(torch.equal(shared, model.model.decoder.embed_tokens.weight)),
        "encoder_decoder": bool(
            torch.equal(
                model.model.encoder.embed_tokens.weight,
                model.model.decoder.embed_tokens.weight,
            )
        ),
    }
    if not all(equality.values()):
        raise RuntimeError(f"NLLB input embeddings have divergent values: {equality}")
    if not before["shared_encoder_decoder_tied"]:
        model.set_input_embeddings(model.get_input_embeddings())
    after = embedding_topology(model)
    if not after["shared_encoder_decoder_tied"]:
        raise RuntimeError(f"could not restore NLLB input aliases: {after}")
    return {"before": before, "value_equality": equality, "after": after}


def register_language(tokenizer: Any, token: str, token_id: int) -> None:
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = token


def initialize_control_rows(
    model: Any,
    base_tokenizer: Any,
    control_tokenizer: Any,
    extension: dict[str, Any],
) -> dict[str, Any]:
    import torch

    expected_size = int(extension["extended_named_vocabulary_size"])
    if len(control_tokenizer) != expected_size:
        raise ValueError(f"control tokenizer size changed: {len(control_tokenizer)} != {expected_size}")
    base_named_size = int(extension["base_named_vocabulary_size"])
    input_weight = model.get_input_embeddings().weight.detach()
    output_weight = model.get_output_embeddings().weight.detach()
    named_prefix_before = {
        "input": tensor_sha256(input_weight, rows=base_named_size),
        "output": tensor_sha256(output_weight, rows=base_named_size),
    }

    prepared: list[dict[str, Any]] = []
    for row in extension["ordered_extension_rows"]:
        token = str(row["token"])
        token_id = int(row["token_id"])
        if int(control_tokenizer.convert_tokens_to_ids(token)) != token_id:
            raise ValueError(f"control token ID changed: {token!r}")
        initialization = row["initialization"]
        strategy = initialization["strategy"]
        if strategy == "copy_existing_input_and_output_rows":
            source_id = int(initialization["source_token_id"])
            if int(base_tokenizer.convert_tokens_to_ids(initialization["source_token"])) != source_id:
                raise ValueError(f"initialization source token changed for {token!r}")
            input_value = input_weight[source_id].float().cpu().clone()
            output_value = output_weight[source_id].float().cpu().clone()
        elif strategy == "base_decomposition_mean_input_and_output_rows":
            ids = [int(item) for item in initialization["base_decomposition_ids"]]
            observed = [int(item) for item in base_tokenizer.encode(token, add_special_tokens=False)]
            if observed != ids:
                raise ValueError(f"base decomposition changed for {token!r}: {observed} != {ids}")
            input_value = input_weight[ids].float().mean(dim=0).cpu().clone()
            output_value = output_weight[ids].float().mean(dim=0).cpu().clone()
        else:
            raise ValueError(f"unsupported row initializer: {strategy!r}")
        prepared.append(
            {
                "token": token,
                "token_id": token_id,
                "strategy": strategy,
                "input_value": input_value,
                "output_value": output_value,
            }
        )

    model.resize_token_embeddings(expected_size, mean_resizing=False)
    alias_audit = canonicalize_input_aliases(model)
    with torch.no_grad():
        input_embeddings = model.get_input_embeddings().weight
        output_embeddings = model.get_output_embeddings().weight
        for row in prepared:
            token_id = int(row["token_id"])
            input_embeddings[token_id].copy_(
                row["input_value"].to(input_embeddings.device, input_embeddings.dtype)
            )
            output_embeddings[token_id].copy_(
                row["output_value"].to(output_embeddings.device, output_embeddings.dtype)
            )

    named_prefix_after = {
        "input": tensor_sha256(model.get_input_embeddings().weight, rows=base_named_size),
        "output": tensor_sha256(model.get_output_embeddings().weight, rows=base_named_size),
    }
    if named_prefix_after != named_prefix_before:
        raise RuntimeError(
            "control-row materialization changed upstream named rows: "
            f"before={named_prefix_before}, after={named_prefix_after}"
        )
    rows: list[dict[str, Any]] = []
    for row in prepared:
        token_id = int(row["token_id"])
        expected_input = row["input_value"].to(
            model.get_input_embeddings().weight.dtype
        )
        expected_output = row["output_value"].to(
            model.get_output_embeddings().weight.dtype
        )
        actual_input = model.get_input_embeddings().weight[token_id].detach().cpu()
        actual_output = model.get_output_embeddings().weight[token_id].detach().cpu()
        if not torch.equal(actual_input, expected_input) or not torch.equal(
            actual_output, expected_output
        ):
            raise RuntimeError(f"initialized row failed exact verification: {row['token']!r}")
        rows.append(
            {
                "token": row["token"],
                "token_id": token_id,
                "strategy": row["strategy"],
                "input_row_sha256": row_sha256(model.get_input_embeddings().weight, token_id),
                "output_row_sha256": row_sha256(model.get_output_embeddings().weight, token_id),
            }
        )
    return {
        "status": "PASS",
        "named_prefix_sha256_before": named_prefix_before,
        "named_prefix_sha256_after": named_prefix_after,
        "input_alias_audit": alias_audit,
        "rows": rows,
    }


def configure_control_generation(model: Any, tokenizer: Any, extension: dict[str, Any]) -> int:
    source = extension["source_language"]
    target = extension["target_language"]
    source_id = int(source["token_id"])
    target_id = int(target["token_id"])
    register_language(tokenizer, str(source["token"]), source_id)
    register_language(tokenizer, str(target["token"]), target_id)
    tokenizer.src_lang = str(source["token"])
    tokenizer.tgt_lang = str(target["token"])
    model.config.decoder_start_token_id = int(tokenizer.eos_token_id)
    model.config.forced_bos_token_id = target_id
    model.generation_config.decoder_start_token_id = int(tokenizer.eos_token_id)
    model.generation_config.forced_bos_token_id = target_id
    return target_id


def generation_probe(
    model: Any,
    tokenizer: Any,
    prompts: list[str],
    target_id: int,
    max_new_tokens: int,
) -> list[dict[str, Any]]:
    import torch

    encoded = tokenizer(prompts, padding=True, return_tensors="pt")
    with torch.inference_mode():
        generated = model.generate(
            **encoded,
            forced_bos_token_id=target_id,
            max_new_tokens=max_new_tokens,
            num_beams=1,
            do_sample=False,
        )
    return [
        {
            "input": prompt,
            "output": tokenizer.decode(tokens, skip_special_tokens=True),
            "token_ids": [int(item) for item in tokens.tolist()],
        }
        for prompt, tokens in zip(prompts, generated, strict=True)
    ]


def copy_tokenizer_bundle(source: Path, destination: Path) -> None:
    for name in TOKENIZER_BUNDLE_NAMES:
        path = source / name
        if path.is_file():
            shutil.copy2(path, destination / name)


def main() -> None:
    args = parse_args()
    if args.max_new_tokens < 1:
        raise ValueError("--max-new-tokens must be positive")
    base_model = args.base_model.expanduser().resolve()
    contract_root = args.tokenizer_contract.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing to overwrite control model: {output_dir}")
    manifest_path = contract_root / "MANIFEST.json"
    observed_contract_hash = sha256_file(manifest_path)
    if observed_contract_hash != args.expected_tokenizer_contract_sha256:
        raise ValueError(
            f"tokenizer contract hash mismatch: {observed_contract_hash} != "
            f"{args.expected_tokenizer_contract_sha256}"
        )
    contract = json.loads(manifest_path.read_text(encoding="utf-8"))
    if contract.get("status") != "PASS":
        raise ValueError("tokenizer contract is not PASS")
    tokenizer_root = contract_root / "tokenizer"
    observed_tokenizer_bundle = tokenizer_bundle_identity(tokenizer_root)
    if observed_tokenizer_bundle != contract["tokenizer_bundle"]:
        raise ValueError("tokenizer bundle no longer matches its contract")
    extension = contract["extension"]
    source_lang = str(extension["source_language"]["token"])
    target_lang = str(extension["target_language"]["token"])
    prompts = args.probe or ["<lexeme> water", "<lexeme> woman", "<translate> I see water."]

    started = time.monotonic()
    import torch
    import transformers
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    torch.manual_seed(0)
    torch.use_deterministic_algorithms(True)
    base_tokenizer = AutoTokenizer.from_pretrained(
        base_model,
        use_fast=False,
        src_lang=source_lang,
        local_files_only=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_root,
        use_fast=False,
        src_lang=source_lang,
        tgt_lang=target_lang,
        local_files_only=True,
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(
        base_model,
        torch_dtype=torch.float32,
        local_files_only=True,
    )
    initial_topology = canonicalize_input_aliases(model)
    initialization_audit = initialize_control_rows(
        model,
        base_tokenizer,
        tokenizer,
        extension,
    )
    target_id = configure_control_generation(model, tokenizer, extension)
    model.eval()
    probe_before = generation_probe(
        model,
        tokenizer,
        prompts,
        target_id,
        args.max_new_tokens,
    )

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=output_dir.parent))
    try:
        model.save_pretrained(temporary, safe_serialization=True, max_shard_size="5GB")
        copy_tokenizer_bundle(tokenizer_root, temporary)
        del model, tokenizer, base_tokenizer
        gc.collect()

        reloaded_tokenizer = AutoTokenizer.from_pretrained(
            temporary,
            use_fast=False,
            src_lang=source_lang,
            tgt_lang=target_lang,
            local_files_only=True,
        )
        reloaded = AutoModelForSeq2SeqLM.from_pretrained(
            temporary,
            torch_dtype=torch.float32,
            local_files_only=True,
        )
        reload_alias_audit = canonicalize_input_aliases(reloaded)
        reloaded_target_id = configure_control_generation(reloaded, reloaded_tokenizer, extension)
        reloaded.eval()
        prefix_rows = int(extension["base_named_vocabulary_size"])
        reloaded_prefix = {
            "input": tensor_sha256(reloaded.get_input_embeddings().weight, rows=prefix_rows),
            "output": tensor_sha256(reloaded.get_output_embeddings().weight, rows=prefix_rows),
        }
        if reloaded_prefix != initialization_audit["named_prefix_sha256_after"]:
            raise RuntimeError("serialized control model changed upstream named embedding rows")
        reloaded_rows = [
            {
                "token": row["token"],
                "token_id": int(row["token_id"]),
                "input_row_sha256": row_sha256(
                    reloaded.get_input_embeddings().weight, int(row["token_id"])
                ),
                "output_row_sha256": row_sha256(
                    reloaded.get_output_embeddings().weight, int(row["token_id"])
                ),
            }
            for row in initialization_audit["rows"]
        ]
        expected_rows = [
            {
                "token": row["token"],
                "token_id": int(row["token_id"]),
                "input_row_sha256": row["input_row_sha256"],
                "output_row_sha256": row["output_row_sha256"],
            }
            for row in initialization_audit["rows"]
        ]
        if reloaded_rows != expected_rows:
            raise RuntimeError("serialized control rows changed on reload")
        probe_after = generation_probe(
            reloaded,
            reloaded_tokenizer,
            prompts,
            reloaded_target_id,
            args.max_new_tokens,
        )
        if probe_after != probe_before:
            raise RuntimeError("control-model generation changed after serialization")
        weights = sorted(temporary.glob("*.safetensors"))
        if not weights:
            raise FileNotFoundError("materialized model has no safetensors weights")
        artifact_files = {
            path.name: {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
            for path in sorted(
                [*weights, temporary / "config.json", temporary / "generation_config.json"]
            )
        }
        manifest = {
            "schema_version": 1,
            "artifact_id": args.artifact_id,
            "created_at": utc_now(),
            "status": "PASS",
            "artifact_kind": "untrained_nllb_control_model",
            "base": contract["base"],
            "tokenizer_contract": {
                "contract_id": contract["contract_id"],
                "manifest_sha256": observed_contract_hash,
                "tokenizer_bundle": observed_tokenizer_bundle,
            },
            "extension": extension,
            "initial_topology": initial_topology,
            "initialization_audit": initialization_audit,
            "reload_audit": {
                "status": "PASS",
                "input_aliases": reload_alias_audit,
                "named_prefix_sha256": reloaded_prefix,
                "rows": reloaded_rows,
                "generation_exactly_reproduced": True,
            },
            "generation_probe": probe_after,
            "artifact_files": artifact_files,
            "environment": {
                "platform": platform.platform(),
                "python": platform.python_version(),
                "torch": torch.__version__,
                "transformers": transformers.__version__,
                "sentencepiece": package_version("sentencepiece"),
                "protobuf": package_version("protobuf"),
                "device": "cpu",
                "dtype": "float32",
                "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
            },
            "duration_seconds": time.monotonic() - started,
            "claim_limit": (
                "This is an untrained plumbing and upstream-prior control. Its outputs are not "
                "Wajarri evidence and cannot establish lexical or translation ability."
            ),
            "builder": {
                "path": str(Path(__file__).resolve()),
                "sha256": sha256_file(Path(__file__).resolve()),
            },
        }
        (temporary / "CONTROL-MODEL-MANIFEST.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary.rename(output_dir)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build a checksum-bound replacement row for a newly appended NLLB token."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
from safetensors import safe_open
from safetensors.numpy import load_file, save_file


METHOD_ID = "nllb-appended-token-row-evidence-v1"
OUTPUT_TENSOR_KEY = "base_replacement_rows"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--base-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def array_sha256(value: np.ndarray) -> str:
    return hashlib.sha256(memoryview(np.ascontiguousarray(value)).cast("B")).hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"JSON document is not an object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def verify(path: Path, expected: str) -> None:
    observed = sha256_file(path)
    if observed != expected:
        raise ValueError(f"SHA-256 mismatch for {path}: {observed} != {expected}")


def decomposition_mean(rows: np.ndarray) -> np.ndarray:
    if rows.ndim != 2 or rows.shape[0] < 1:
        raise ValueError(f"expected at least one two-dimensional source row: {rows.shape}")
    # Match the trainer: convert source rows to float32, then average.
    return rows.astype(np.float32).mean(axis=0, keepdims=True, dtype=np.float32)


def validate_token_plan(
    tokenizer: Any,
    *,
    token: str,
    expected_token_id: int,
    expected_decomposition_ids: list[int],
) -> dict[str, Any]:
    if int(tokenizer.convert_tokens_to_ids(token)) != int(tokenizer.unk_token_id):
        raise ValueError(f"appended token unexpectedly exists in base tokenizer: {token!r}")
    if len(tokenizer) != expected_token_id:
        raise ValueError(
            f"expected appended token ID {expected_token_id}, base length is {len(tokenizer)}"
        )
    decomposition_ids = [
        int(value) for value in tokenizer.encode(token, add_special_tokens=False)
    ]
    if decomposition_ids != expected_decomposition_ids:
        raise ValueError(
            f"base decomposition changed for {token!r}: "
            f"{decomposition_ids} != {expected_decomposition_ids}"
        )
    if not decomposition_ids or int(tokenizer.unk_token_id) in decomposition_ids:
        raise ValueError(f"invalid decomposition for {token!r}: {decomposition_ids}")
    tokenizer.add_special_tokens(
        {"additional_special_tokens": [token]},
        replace_additional_special_tokens=False,
    )
    token_id = int(tokenizer.convert_tokens_to_ids(token))
    if token_id != expected_token_id:
        raise ValueError(f"appended token ID changed: {token_id} != {expected_token_id}")
    if tokenizer.encode(token, add_special_tokens=False) != [expected_token_id]:
        raise ValueError(f"appended token is not one exact tokenizer ID: {token!r}")
    if expected_token_id not in tokenizer.all_special_ids:
        raise ValueError(f"appended token is not special: {token!r}")
    return {
        "token": token,
        "token_id": expected_token_id,
        "base_decomposition_ids": decomposition_ids,
        "base_decomposition_tokens": tokenizer.convert_ids_to_tokens(
            decomposition_ids
        ),
        "initialization": "base_decomposition_mean_float32",
    }


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    contract = read_json(contract_path)
    if contract.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method_id: {contract.get('method_id')}")
    base_dir = args.base_dir.resolve()
    output_dir = args.output_dir.resolve()
    if not base_dir.is_dir():
        raise ValueError(f"base directory does not exist: {base_dir}")
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    temporary = output_dir.with_name(f".{output_dir.name}.tmp")
    if temporary.exists():
        raise SystemExit(f"refusing existing temporary directory: {temporary}")

    for relative_path, expected in contract["base_release"]["files"].items():
        verify(base_dir / relative_path, expected)
    observed_software = {
        package: importlib.metadata.version(package)
        for package in sorted(contract["software_lock"])
    }
    if observed_software != dict(sorted(contract["software_lock"].items())):
        raise ValueError(
            f"software lock mismatch: expected={contract['software_lock']} "
            f"observed={observed_software}"
        )

    # Keep tokenizer-only validation from importing a model runtime.
    os.environ.setdefault("USE_TORCH", "0")
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(
        base_dir,
        use_fast=False,
        src_lang=contract["source_language"],
        tgt_lang=contract["target_language"],
        local_files_only=True,
    )
    token_contract = contract["token"]
    token_plan = validate_token_plan(
        tokenizer,
        token=str(token_contract["token"]),
        expected_token_id=int(token_contract["token_id"]),
        expected_decomposition_ids=[
            int(value) for value in token_contract["base_decomposition_ids"]
        ],
    )
    expected_decomposition_tokens = list(
        token_contract["base_decomposition_tokens"]
    )
    if token_plan["base_decomposition_tokens"] != expected_decomposition_tokens:
        raise ValueError(
            "base decomposition token strings changed: "
            f"{token_plan['base_decomposition_tokens']} != {expected_decomposition_tokens}"
        )

    model_path = base_dir / contract["model_path"]
    tensor_key = contract["model_tensor_key"]
    decomposition_ids = token_plan["base_decomposition_ids"]
    with safe_open(model_path, framework="np") as handle:
        if tensor_key not in handle.keys():
            raise ValueError(f"model lacks embedding tensor: {tensor_key}")
        tensor_slice = handle.get_slice(tensor_key)
        shape = tensor_slice.get_shape()
        if len(shape) != 2 or max(decomposition_ids) >= shape[0]:
            raise ValueError(
                f"invalid embedding shape for decomposition IDs: {shape}"
            )
        source_rows = np.concatenate(
            [
                np.asarray(tensor_slice[token_id : token_id + 1])
                for token_id in decomposition_ids
            ],
            axis=0,
        )
    replacement_row = decomposition_mean(source_rows)

    temporary.mkdir(parents=True)
    save_file(
        {OUTPUT_TENSOR_KEY: replacement_row},
        temporary / "BASE-TOKEN-ROWS.safetensors",
        metadata={
            "format": "np",
            "model_tensor_key": tensor_key,
            "token": token_plan["token"],
            "token_id": str(token_plan["token_id"]),
            "base_decomposition_ids": ",".join(
                str(value) for value in decomposition_ids
            ),
        },
    )
    rebuilt = load_file(temporary / "BASE-TOKEN-ROWS.safetensors")[
        OUTPUT_TENSOR_KEY
    ]
    if not np.array_equal(rebuilt, replacement_row):
        raise RuntimeError("replacement row changed during evidence serialization")
    audit = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "evidence_id": contract["evidence_id"],
        "contract_sha256": sha256_file(contract_path),
        "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "base_release": contract["base_release"],
        "model_tensor_key": tensor_key,
        "base_embedding_shape": shape,
        "token": {
            **token_plan,
            "source_row_shape": list(source_rows.shape),
            "source_rows_sha256": array_sha256(source_rows),
            "replacement_row_sha256": array_sha256(replacement_row),
        },
        "output": {
            "path": "BASE-TOKEN-ROWS.safetensors",
            "tensor_key": OUTPUT_TENSOR_KEY,
            "shape": list(replacement_row.shape),
            "dtype": str(replacement_row.dtype),
            "array_sha256": array_sha256(replacement_row),
            "file_sha256": sha256_file(
                temporary / "BASE-TOKEN-ROWS.safetensors"
            ),
        },
        "software": observed_software,
        "claim_limit": contract["claim_limit"],
    }
    write_json(temporary / "AUDIT.json", audit)
    manifest = {
        "schema_version": 1,
        "evidence_id": contract["evidence_id"],
        "contract_sha256": sha256_file(contract_path),
        "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "files": {
            path.name: {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
            for path in sorted(temporary.iterdir())
            if path.is_file()
        },
    }
    write_json(temporary / "MANIFEST.json", manifest)
    checksum_files = [path for path in sorted(temporary.iterdir()) if path.is_file()]
    (temporary / "SHA256SUMS").write_text(
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in checksum_files),
        encoding="utf-8",
    )
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    os.replace(temporary, output_dir)
    print(
        json.dumps(
            {
                "status": "PASS_APPENDED_TOKEN_ROW_EVIDENCE_BUILT",
                "evidence_id": contract["evidence_id"],
                "token": token_plan["token"],
                "token_id": token_plan["token_id"],
                "decomposition_ids": decomposition_ids,
                "row_file_sha256": sha256_file(
                    output_dir / "BASE-TOKEN-ROWS.safetensors"
                ),
                "audit_sha256": sha256_file(output_dir / "AUDIT.json"),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

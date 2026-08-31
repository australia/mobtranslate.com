#!/usr/bin/env python3
"""Extract checksum-bound NLLB base embedding rows for PEFT token initialization."""

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


METHOD_ID = "nllb-base-token-row-evidence-v1"
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
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
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


def validate_token_bindings(
    added_tokens: dict[str, Any], tokens: list[dict[str, Any]]
) -> list[int]:
    ids = [int(entry["token_id"]) for entry in tokens]
    if len(ids) != len(set(ids)):
        raise ValueError("requested token IDs contain duplicates")
    for entry, token_id in zip(tokens, ids, strict=True):
        observed = added_tokens.get(entry["token"])
        if observed != token_id:
            raise ValueError(
                f"token ID mismatch for {entry['token']!r}: "
                f"expected={token_id} observed={observed}"
            )
    return ids


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    contract = read_json(contract_path)
    if contract.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method_id: {contract.get('method_id')}")
    base_dir = args.base_dir.resolve()
    if not base_dir.is_dir():
        raise ValueError(f"base directory does not exist: {base_dir}")
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    temporary = output_dir.with_name(f".{output_dir.name}.tmp")
    if temporary.exists():
        raise SystemExit(f"refusing existing temporary directory: {temporary}")

    for relative_path, expected in contract["base_release"]["files"].items():
        verify(base_dir / relative_path, expected)
    observed_software = {
        name: importlib.metadata.version(name)
        for name in sorted(contract["software_lock"])
    }
    if observed_software != dict(sorted(contract["software_lock"].items())):
        raise ValueError(
            f"software lock mismatch: expected={contract['software_lock']} "
            f"observed={observed_software}"
        )

    added_tokens = read_json(base_dir / contract["tokenizer_added_tokens_path"])
    tokens = contract["tokens"]
    token_ids = validate_token_bindings(added_tokens, tokens)
    model_path = base_dir / contract["model_path"]
    model_tensor_key = contract["model_tensor_key"]
    with safe_open(model_path, framework="np") as handle:
        if model_tensor_key not in handle.keys():
            raise ValueError(f"model lacks embedding tensor: {model_tensor_key}")
        tensor_slice = handle.get_slice(model_tensor_key)
        shape = tensor_slice.get_shape()
        if len(shape) != 2 or max(token_ids) >= shape[0]:
            raise ValueError(f"invalid base embedding shape for token IDs: {shape}")
        rows = np.concatenate(
            [np.asarray(tensor_slice[token_id : token_id + 1]) for token_id in token_ids],
            axis=0,
        )

    temporary.mkdir(parents=True)
    save_file(
        {OUTPUT_TENSOR_KEY: rows},
        temporary / "BASE-TOKEN-ROWS.safetensors",
        metadata={
            "format": "np",
            "model_tensor_key": model_tensor_key,
            "token_ids": ",".join(str(value) for value in token_ids),
        },
    )
    rebuilt = load_file(temporary / "BASE-TOKEN-ROWS.safetensors")[OUTPUT_TENSOR_KEY]
    if not np.array_equal(rebuilt, rows):
        raise RuntimeError("base token rows changed during evidence serialization")
    audit = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "evidence_id": contract["evidence_id"],
        "contract_sha256": sha256_file(contract_path),
        "extractor_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "base_release": contract["base_release"],
        "model_tensor_key": model_tensor_key,
        "base_embedding_shape": shape,
        "tokens": [
            {
                **entry,
                "row_position": position,
                "row_sha256": array_sha256(rows[position]),
            }
            for position, entry in enumerate(tokens)
        ],
        "output": {
            "path": "BASE-TOKEN-ROWS.safetensors",
            "tensor_key": OUTPUT_TENSOR_KEY,
            "shape": list(rows.shape),
            "dtype": str(rows.dtype),
            "array_sha256": array_sha256(rows),
            "file_sha256": sha256_file(temporary / "BASE-TOKEN-ROWS.safetensors"),
        },
        "software": observed_software,
        "claim_limit": contract["claim_limit"],
    }
    write_json(temporary / "AUDIT.json", audit)
    manifest = {
        "schema_version": 1,
        "evidence_id": contract["evidence_id"],
        "contract_sha256": sha256_file(contract_path),
        "extractor_implementation_sha256": sha256_file(Path(__file__).resolve()),
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
                "status": "PASS_BASE_TOKEN_ROW_EVIDENCE_EXTRACTED",
                "evidence_id": contract["evidence_id"],
                "rows": len(token_ids),
                "token_ids": token_ids,
                "row_file_sha256": sha256_file(output_dir / "BASE-TOKEN-ROWS.safetensors"),
                "audit_sha256": sha256_file(output_dir / "AUDIT.json"),
                "manifest_sha256": sha256_file(output_dir / "MANIFEST.json"),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

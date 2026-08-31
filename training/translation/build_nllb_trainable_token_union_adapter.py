#!/usr/bin/env python3
"""Expand an immutable PEFT TrainableTokens adapter with bound token rows."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import shutil
from pathlib import Path
from typing import Any

import numpy as np
from safetensors import safe_open
from safetensors.numpy import load_file, save_file


METHOD_ID = "nllb-trainable-token-union-adapter-v2"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def array_sha256(value: np.ndarray) -> str:
    contiguous = np.ascontiguousarray(value)
    return hashlib.sha256(memoryview(contiguous).cast("B")).hexdigest()


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


def verify(path: Path, expected_sha256: str) -> None:
    observed = sha256_file(path)
    if observed != expected_sha256:
        raise ValueError(f"SHA-256 mismatch for {path}: {observed} != {expected_sha256}")


def expand_trainable_token_values(
    values: np.ndarray,
    existing_indices: list[int],
    desired_indices: list[int],
    appended_values: np.ndarray,
) -> np.ndarray:
    """Preserve existing rows and append bound full-replacement token values."""
    if len(existing_indices) != len(set(existing_indices)):
        raise ValueError("existing trainable-token indices contain duplicates")
    if len(desired_indices) != len(set(desired_indices)):
        raise ValueError("desired trainable-token indices contain duplicates")
    if desired_indices[: len(existing_indices)] != existing_indices:
        raise ValueError(
            "desired trainable-token indices must retain the existing ordered prefix"
        )
    if len(desired_indices) <= len(existing_indices):
        raise ValueError("desired trainable-token indices must be a strict superset")
    if values.ndim != 2 or values.shape[0] != len(existing_indices):
        raise ValueError(
            "trainable-token value row count does not match existing indices: "
            f"shape={values.shape} indices={existing_indices}"
        )
    expected_append_shape = (
        len(desired_indices) - len(existing_indices),
        values.shape[1],
    )
    if appended_values.shape != expected_append_shape:
        raise ValueError(
            "replacement-row evidence has the wrong shape: "
            f"expected={expected_append_shape} observed={appended_values.shape}"
        )
    if appended_values.dtype != values.dtype:
        raise ValueError(
            "replacement-row evidence has the wrong dtype: "
            f"expected={values.dtype} observed={appended_values.dtype}"
        )
    return np.concatenate((values, appended_values), axis=0)


def checked_source_root(program_root: Path, relative_path: str) -> Path:
    source = (program_root / relative_path).resolve()
    try:
        source.relative_to(program_root)
    except ValueError as error:
        raise ValueError(f"source adapter escapes program root: {source}") from error
    if not source.is_dir():
        raise ValueError(f"source adapter is not a directory: {source}")
    return source


def verify_software_lock(lock: dict[str, str]) -> dict[str, str]:
    observed = {
        package: importlib.metadata.version(package) for package in sorted(lock)
    }
    if observed != dict(sorted(lock.items())):
        raise ValueError(f"software lock mismatch: expected={lock} observed={observed}")
    return observed


def build_readme(contract: dict[str, Any]) -> str:
    tokens = ", ".join(
        f"`{entry['token']}` ({entry['token_id']})"
        for entry in contract["token_union"]["tokens"]
    )
    return f"""---
library_name: peft
license: cc-by-nc-4.0
base_model: facebook/nllb-200-distilled-1.3B
tags:
- translation
- wajarri
- nllb
- peft
---

# {contract['artifact_id']}

Internal continuation-training adapter for the bounded Wajarri v3 experiment.
It preserves every tensor and every existing selective-token value from the
checksum-bound parent adapter, then adds exact checksum-bound replacement rows
for the appended task controls. Reserved rows: {tokens}.

This artifact does not establish translation quality and is not a public model
release. Its purpose is to make the PEFT trainable-token mechanism explicit and
auditable before optimizer execution.
"""


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    contract = read_json(contract_path)
    if contract.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method_id: {contract.get('method_id')}")

    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    temporary = output_dir.with_name(f".{output_dir.name}.tmp")
    if temporary.exists():
        raise SystemExit(f"refusing existing temporary directory: {temporary}")

    observed_software = verify_software_lock(contract["software_lock"])
    source = checked_source_root(program_root, contract["source_adapter"]["path"])
    source_files = contract["source_adapter"]["files"]
    for relative_path, expected in source_files.items():
        verify(source / relative_path, expected)
    row_evidence_contract = contract["replacement_row_evidence"]
    row_evidence = checked_source_root(program_root, row_evidence_contract["path"])
    for relative_path, expected in row_evidence_contract["files"].items():
        verify(row_evidence / relative_path, expected)

    config = read_json(source / "adapter_config.json")
    union = contract["token_union"]
    existing_indices = [int(value) for value in union["existing_indices"]]
    desired_indices = [int(value) for value in union["desired_indices"]]
    if config.get("trainable_token_indices") != existing_indices:
        raise ValueError(
            "source adapter trainable-token indices do not match the contract: "
            f"config={config.get('trainable_token_indices')} contract={existing_indices}"
        )

    tensor_key = union["tensor_key"]
    tensors = load_file(source / "adapter_model.safetensors")
    if tensor_key not in tensors:
        raise ValueError(f"source adapter lacks selective-token tensor: {tensor_key}")
    source_values = tensors[tensor_key]
    evidence_audit = read_json(row_evidence / row_evidence_contract["audit_path"])
    evidence_tokens = evidence_audit.get("tokens")
    if evidence_tokens is None and isinstance(evidence_audit.get("token"), dict):
        evidence_tokens = [evidence_audit["token"]]
    if not isinstance(evidence_tokens, list) or not all(
        isinstance(entry, dict) for entry in evidence_tokens
    ):
        raise ValueError("replacement-row evidence has no auditable token records")
    observed_evidence_ids = [int(entry["token_id"]) for entry in evidence_tokens]
    expected_evidence_ids = desired_indices[len(existing_indices) :]
    if observed_evidence_ids != expected_evidence_ids:
        raise ValueError(
            "replacement-row token IDs do not match the appended index contract: "
            f"expected={expected_evidence_ids} observed={observed_evidence_ids}"
        )
    replacement_rows = load_file(
        row_evidence / row_evidence_contract["tensor_path"]
    )[row_evidence_contract["tensor_key"]]
    expanded_values = expand_trainable_token_values(
        source_values, existing_indices, desired_indices, replacement_rows
    )
    tensors[tensor_key] = expanded_values
    with safe_open(source / "adapter_model.safetensors", framework="np") as handle:
        metadata = handle.metadata()

    temporary.mkdir(parents=True)
    for relative_path in source_files:
        if relative_path in {"README.md", "adapter_config.json", "adapter_model.safetensors"}:
            continue
        destination = temporary / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / relative_path, destination)
    (temporary / "README.md").write_text(build_readme(contract), encoding="utf-8")
    config["trainable_token_indices"] = desired_indices
    write_json(temporary / "adapter_config.json", config)
    save_file(tensors, temporary / "adapter_model.safetensors", metadata=metadata)

    rebuilt = load_file(temporary / "adapter_model.safetensors")
    if set(rebuilt) != set(tensors):
        raise RuntimeError("tensor key set changed while writing the union adapter")
    for key, source_value in tensors.items():
        if not np.array_equal(rebuilt[key], source_value):
            raise RuntimeError(f"tensor changed during serialization: {key}")
    rebuilt_values = rebuilt[tensor_key]
    if not np.array_equal(rebuilt_values[: len(existing_indices)], source_values):
        raise RuntimeError("existing trainable-token values were not preserved bit for bit")
    if not np.array_equal(rebuilt_values[len(existing_indices) :], replacement_rows):
        raise RuntimeError("new trainable-token values do not match row evidence")

    audit = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "artifact_id": contract["artifact_id"],
        "contract_sha256": sha256_file(contract_path),
        "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "source_adapter": {
            "path": contract["source_adapter"]["path"],
            "weight_sha256": source_files["adapter_model.safetensors"],
            "trainable_token_indices": existing_indices,
            "selective_value_shape": list(source_values.shape),
            "selective_value_sha256": array_sha256(source_values),
        },
        "replacement_row_evidence": {
            "path": row_evidence_contract["path"],
            "audit_sha256": row_evidence_contract["files"][row_evidence_contract["audit_path"]],
            "tensor_file_sha256": row_evidence_contract["files"][row_evidence_contract["tensor_path"]],
            "token_ids": observed_evidence_ids,
            "row_array_sha256": array_sha256(replacement_rows),
        },
        "union_adapter": {
            "trainable_token_indices": desired_indices,
            "tokens": union["tokens"],
            "selective_value_shape": list(rebuilt_values.shape),
            "preserved_prefix_sha256": array_sha256(
                rebuilt_values[: len(existing_indices)]
            ),
            "appended_rows": len(desired_indices) - len(existing_indices),
            "appended_values_sha256": array_sha256(
                rebuilt_values[len(existing_indices) :]
            ),
            "weight_sha256": sha256_file(temporary / "adapter_model.safetensors"),
        },
        "software": observed_software,
        "claims": contract["claims"],
        "claim_limit": contract["claim_limit"],
    }
    write_json(temporary / "UNION-AUDIT.json", audit)

    payload_files = [
        path
        for path in sorted(temporary.rglob("*"))
        if path.is_file() and path.name not in {"MANIFEST.json", "SHA256SUMS"}
    ]
    manifest = {
        "schema_version": 1,
        "artifact_id": contract["artifact_id"],
        "contract_sha256": sha256_file(contract_path),
        "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "files": {
            path.relative_to(temporary).as_posix(): {
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for path in payload_files
        },
    }
    write_json(temporary / "MANIFEST.json", manifest)
    checksum_files = [
        path for path in sorted(temporary.rglob("*")) if path.is_file()
    ]
    (temporary / "SHA256SUMS").write_text(
        "".join(
            f"{sha256_file(path)}  {path.relative_to(temporary).as_posix()}\n"
            for path in checksum_files
        ),
        encoding="utf-8",
    )
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    os.replace(temporary, output_dir)
    print(
        json.dumps(
            {
                "status": "PASS_TRAINABLE_TOKEN_UNION_ADAPTER_BUILT",
                "artifact_id": contract["artifact_id"],
                "output_dir": str(output_dir),
                "weight_sha256": sha256_file(output_dir / "adapter_model.safetensors"),
                "manifest_sha256": sha256_file(output_dir / "MANIFEST.json"),
                "checksums_sha256": sha256_file(output_dir / "SHA256SUMS"),
                "trainable_token_indices": desired_indices,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

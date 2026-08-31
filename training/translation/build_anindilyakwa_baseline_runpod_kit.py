#!/usr/bin/env python3
"""Build an immutable private-research Anindilyakwa NLLB RunPod kit."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"JSON document is not an object: {path}")
    return value


def deep_merge(base: Any, override: Any) -> Any:
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    merged = dict(base)
    for key, value in override.items():
        merged[key] = deep_merge(merged[key], value) if key in merged else value
    return merged


def resolve_within(root: Path, relative: str) -> Path:
    if Path(relative).is_absolute():
        raise ValueError(f"bound path must be relative: {relative}")
    path = (root / relative).resolve()
    path.relative_to(root)
    return path


def copy_bound(source: Path, destination: Path, expected_sha256: str) -> None:
    observed = sha256_file(source)
    if observed != expected_sha256:
        raise ValueError(f"source SHA-256 mismatch: {source}: {observed} != {expected_sha256}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if sha256_file(destination) != expected_sha256:
        raise RuntimeError(f"copied file SHA-256 mismatch: {destination}")


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    repo_root = args.repo_root.resolve()
    contract_path = args.contract.resolve()
    contract_path.relative_to(program_root)
    raw_contract = load_json(contract_path)
    inherited_contract = None
    if raw_contract.get("inherits_contract"):
        binding = raw_contract["inherits_contract"]
        inherited_path = resolve_within(program_root, str(binding["path"]))
        if sha256_file(inherited_path) != binding["sha256"]:
            raise ValueError("inherited contract hash mismatch")
        inherited_contract = {
            "path": str(binding["path"]),
            "sha256": str(binding["sha256"]),
        }
        contract = deep_merge(load_json(inherited_path), raw_contract["overrides"])
        contract["schema_version"] = raw_contract["schema_version"]
    else:
        contract = raw_contract
    if contract.get("schema_version") != 1:
        raise ValueError("unsupported contract schema")
    if contract.get("program_id") != "anindilyakwa-v1":
        raise ValueError("unexpected program identity")
    if contract["runpod"]["paid_compute_authorized_by_user"] is not True:
        raise ValueError("paid compute is not authorized")
    if contract["training"]["training_exposed_rows_before_run"] != 0:
        raise ValueError("training exposure baseline must be zero")

    readiness_path = resolve_within(
        program_root, contract["tokenizer_readiness"]["path"]
    )
    if sha256_file(readiness_path) != contract["tokenizer_readiness"]["sha256"]:
        raise ValueError("tokenizer readiness hash mismatch")
    readiness = load_json(readiness_path)
    if readiness.get("status") != "PASS" or readiness["decision"][
        "paid_gpu_execution_ready"
    ] is not True:
        raise ValueError("tokenizer readiness does not admit paid GPU execution")

    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output: {output_dir}")
    output_dir.mkdir(parents=True)
    roots = {"program": program_root, "repo": repo_root}
    for destination, binding in sorted(contract["payload_files"].items()):
        source_root = roots[str(binding["root"])]
        source = resolve_within(source_root, str(binding["path"]))
        copy_bound(source, output_dir / destination, str(binding["sha256"]))

    bootstrap = output_dir / "bootstrap_and_run.sh"
    bootstrap.chmod(0o755)
    effective = {
        **contract,
        "provenance": {
            "build_contract_path": str(contract_path),
            "build_contract_sha256": sha256_file(contract_path),
            "builder_path": str(Path(__file__).resolve()),
            "builder_sha256": sha256_file(Path(__file__).resolve()),
            "tokenizer_readiness_verified": True,
            "inherited_contract": inherited_contract,
        },
    }
    (output_dir / "CONTRACT.json").write_text(
        json.dumps(effective, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    files = [
        path
        for path in sorted(output_dir.rglob("*"))
        if path.is_file() and path.name != "SHA256SUMS.kit"
    ]
    (output_dir / "SHA256SUMS.kit").write_text(
        "".join(
            f"{sha256_file(path)}  {path.relative_to(output_dir).as_posix()}\n"
            for path in files
        ),
        encoding="utf-8",
    )
    report = {
        "status": "PASS_AUTHORIZED_PRIVATE_RESEARCH_BASELINE_KIT_BUILT",
        "run_id": contract["run_id"],
        "files": len(files),
        "bytes": sum(path.stat().st_size for path in files),
        "contract_sha256": sha256_file(output_dir / "CONTRACT.json"),
        "checksums_sha256": sha256_file(output_dir / "SHA256SUMS.kit"),
        "paid_compute_authorized_by_user": True,
        "private_research_only": True,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build an immutable Wajarri v3 task-separated RunPod screening kit."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


METHOD_ID = "wajarri-v3-task-separated-runpod-kit-v1"


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
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"JSON document is not an object: {path}")
    return value


def deep_merge(base: Any, override: Any) -> Any:
    """Recursively overlay JSON objects while replacing every non-object value."""
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    merged = dict(base)
    for key, value in override.items():
        merged[key] = deep_merge(merged[key], value) if key in merged else value
    return merged


def materialize_build_contract(
    contract: dict[str, Any], program_root: Path
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    inheritance = contract.get("inherits_contract")
    if inheritance is None:
        return contract, []
    parent_path = resolve_bound(program_root, inheritance)
    parent = load_json(parent_path)
    if parent.get("method_id") != METHOD_ID:
        raise ValueError(f"inherited contract has unexpected method_id: {parent.get('method_id')}")
    parent_effective, chain = materialize_build_contract(parent, program_root)
    effective = deep_merge(parent_effective, contract.get("overrides", {}))
    effective["schema_version"] = contract.get("schema_version", effective["schema_version"])
    effective["method_id"] = contract["method_id"]
    return effective, chain + [
        {"path": inheritance["path"], "sha256": inheritance["sha256"]}
    ]


def verify(path: Path, expected_sha256: str) -> None:
    observed = sha256_file(path)
    if observed != expected_sha256:
        raise ValueError(f"SHA-256 mismatch for {path}: {observed} != {expected_sha256}")


def copy_bound(source: Path, destination: Path, expected_sha256: str) -> None:
    verify(source, expected_sha256)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    verify(destination, expected_sha256)


def resolve_bound(root: Path, binding: dict[str, Any]) -> Path:
    path = (root / binding["path"]).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as error:
        raise ValueError(f"bound path escapes root: {path}") from error
    verify(path, binding["sha256"])
    return path


def resolve_bound_directory(root: Path, relative_path: str) -> Path:
    path = (root / relative_path).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as error:
        raise ValueError(f"bound directory escapes root: {path}") from error
    if not path.is_dir():
        raise ValueError(f"bound directory does not exist: {path}")
    return path


def copy_initial_adapter(
    build: dict[str, Any],
    source_contract: dict[str, Any],
    source_kit: Path,
    program_root: Path,
    output_dir: Path,
) -> dict[str, Any]:
    override = build.get("initial_adapter_override")
    if override is None:
        for relative_path, expected in source_contract["initial_adapter"]["files"].items():
            copy_bound(source_kit / relative_path, output_dir / relative_path, expected)
        return source_contract["initial_adapter"]

    source = resolve_bound_directory(program_root, override["path"])
    files = override["files"]
    required = {"adapter_config.json", "adapter_model.safetensors"}
    missing = sorted(required - files.keys())
    if missing:
        raise ValueError(f"initial adapter override lacks required bindings: {missing}")
    if files["adapter_model.safetensors"] != override["adapter_weight_sha256"]:
        raise ValueError("initial adapter override weight identity is internally inconsistent")

    destination_files: dict[str, str] = {}
    for relative_path, expected in sorted(files.items()):
        destination = f"payload/initial-adapter/{relative_path}"
        copy_bound(source / relative_path, output_dir / destination, expected)
        destination_files[destination] = expected
    return {
        **override["identity"],
        "adapter_weight_sha256": override["adapter_weight_sha256"],
        "files": destination_files,
        "topology": override["topology"],
    }


def count_jsonl(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line)


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def build_status(authorized: bool) -> str:
    return (
        "PASS_AUTHORIZED_TASK_SEPARATED_KIT_BUILT_GPU_EXECUTION_ALLOWED"
        if authorized
        else "PASS_TASK_SEPARATED_PREFLIGHT_KIT_GPU_EXECUTION_NOT_AUTHORIZED"
    )


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    repo_root = args.repo_root.resolve()
    contract_path = args.contract.resolve()
    contract = load_json(contract_path)
    if contract.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method_id: {contract.get('method_id')}")
    build, inherited_contracts = materialize_build_contract(contract, program_root)
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")

    source_kit = program_root / build["source_kit"]["path"]
    source_contract_path = source_kit / "CONTRACT.json"
    verify(source_contract_path, build["source_kit"]["contract_sha256"])
    source_contract = load_json(source_contract_path)
    inputs = {
        name: resolve_bound(program_root, binding)
        for name, binding in build["inputs"].items()
    }
    for name, path in inputs.items():
        expected_rows = build["inputs"][name].get("rows")
        if expected_rows is not None and count_jsonl(path) != expected_rows:
            raise ValueError(f"row-count mismatch for input {name}")
    repo_sources = {
        destination: resolve_bound(repo_root, binding)
        for destination, binding in build["repo_sources"].items()
    }
    provenance = {
        destination: resolve_bound(program_root, binding)
        for destination, binding in build["provenance"].items()
    }

    output_dir.mkdir(parents=True)
    initial_adapter = copy_initial_adapter(
        build, source_contract, source_kit, program_root, output_dir
    )
    for binding in source_contract["evaluation"].values():
        destination = output_dir / f"payload/data/evaluation/{Path(binding['path']).name}"
        copy_bound(source_kit / binding["path"], destination, binding["sha256"])

    data_destinations = {
        "development": "payload/data/DEVELOPMENT.jsonl",
        "glossary_development": "payload/data/GLOSSARY-DEVELOPMENT.jsonl",
        "C3_schedule": "payload/data/C3-SCHEDULE.jsonl",
        "P3_schedule": "payload/data/P3-SCHEDULE.jsonl",
        "G3_schedule": "payload/data/G3-SCHEDULE.jsonl",
    }
    for name, destination in data_destinations.items():
        copy_bound(inputs[name], output_dir / destination, build["inputs"][name]["sha256"])
    for destination, source in repo_sources.items():
        copy_bound(source, output_dir / destination, build["repo_sources"][destination]["sha256"])
    for destination, source in provenance.items():
        copy_bound(source, output_dir / destination, build["provenance"][destination]["sha256"])
    (output_dir / "bootstrap_and_run.sh").chmod(0o755)

    final_contract = {
        "schema_version": 1,
        "run_id": build["run_id"],
        "dataset_id": build["dataset_id"],
        "created_at_utc": build["created_at_utc"],
        "purpose": build["purpose"],
        "claim_limit": build["claim_limit"],
        "claims": build["claims"],
        "base_release": source_contract["base_release"],
        "initial_adapter": initial_adapter,
        "tokenizer": {
            **source_contract["tokenizer"],
            "task_tokens": ["<lexeme>", "<translate>", "<glossary>"],
        },
        "development": {
            "path": data_destinations["development"],
            "rows": build["inputs"]["development"]["rows"],
            "sha256": build["inputs"]["development"]["sha256"],
        },
        "glossary_development": {
            "path": data_destinations["glossary_development"],
            "rows": build["inputs"]["glossary_development"]["rows"],
            "sha256": build["inputs"]["glossary_development"]["sha256"],
        },
        "evaluation": {
            name: {
                "path": f"payload/data/evaluation/{Path(binding['path']).name}",
                "rows": binding["rows"],
                "sha256": binding["sha256"],
            }
            for name, binding in source_contract["evaluation"].items()
        },
        "arms": {
            arm: {
                **arm_contract,
                "schedule_path": data_destinations[f"{arm}_schedule"],
                "schedule_rows": build["inputs"][f"{arm}_schedule"]["rows"],
                "schedule_sha256": build["inputs"][f"{arm}_schedule"]["sha256"],
            }
            for arm, arm_contract in build["experiment"]["arms"].items()
        },
        "roles": build["experiment"]["roles"],
        "training": build["experiment"]["training"],
        "selection_rule": build["experiment"]["selection_rule"],
        "gates": build["experiment"]["gates"],
        "batch_invariance": build["experiment"]["batch_invariance"],
        "repair": build.get("repair"),
        "provenance": {
            "build_contract_sha256": sha256_file(contract_path),
            "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
            "source_kit_contract_sha256": sha256_file(source_contract_path),
            "inherited_contracts": inherited_contracts,
            "files": {
                destination: binding["sha256"]
                for destination, binding in build["provenance"].items()
            },
        },
        "runpod": build["runpod"],
        "runtime": source_contract["runtime"],
    }
    write_json(output_dir / "CONTRACT.json", final_contract)
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
        "status": build_status(build["runpod"]["paid_compute_authorized_by_user"]),
        "run_id": build["run_id"],
        "files": len(files),
        "bytes": sum(path.stat().st_size for path in files),
        "contract_sha256": sha256_file(output_dir / "CONTRACT.json"),
        "checksums_sha256": sha256_file(output_dir / "SHA256SUMS.kit"),
        "sealed_test_included": False,
        "paid_compute_authorized_by_user": build["runpod"]["paid_compute_authorized_by_user"],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

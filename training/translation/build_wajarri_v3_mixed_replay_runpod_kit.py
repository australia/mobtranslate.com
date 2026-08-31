#!/usr/bin/env python3
"""Build an immutable, preflight-only Wajarri v3 mixed-replay RunPod kit."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

METHOD_ID = "wajarri-v3-mixed-replay-runpod-kit-v1"


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


def verify(path: Path, expected_sha256: str) -> None:
    observed = sha256_file(path)
    if observed != expected_sha256:
        raise ValueError(
            f"SHA-256 mismatch for {path}: {observed} != {expected_sha256}"
        )


def copy_bound(source: Path, destination: Path, expected_sha256: str) -> None:
    verify(source, expected_sha256)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    verify(destination, expected_sha256)


def resolve_bound(root: Path, binding: dict[str, Any]) -> Path:
    path = root / binding["path"]
    verify(path, binding["sha256"])
    return path


def count_jsonl(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line)


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def build_status(authorized: bool) -> str:
    return (
        "PASS_AUTHORIZED_KIT_BUILT_GPU_EXECUTION_ALLOWED"
        if authorized
        else "PASS_PREFLIGHT_ONLY_KIT_BUILT_GPU_EXECUTION_NOT_AUTHORIZED"
    )


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    repo_root = args.repo_root.resolve()
    contract_path = args.contract.resolve()
    build = load_json(contract_path)
    if build.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method_id: {build.get('method_id')}")
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")

    source_kit = program_root / build["source_kit"]["path"]
    source_contract_path = source_kit / "CONTRACT.json"
    verify(source_contract_path, build["source_kit"]["contract_sha256"])
    source_contract = load_json(source_contract_path)

    bound_inputs = {
        name: resolve_bound(program_root, binding)
        for name, binding in build["inputs"].items()
    }
    for name, path in bound_inputs.items():
        expected_rows = build["inputs"][name].get("rows")
        if expected_rows is not None and count_jsonl(path) != expected_rows:
            raise ValueError(f"row-count mismatch for input {name}")
    repo_sources = {
        destination: resolve_bound(repo_root, binding)
        for destination, binding in build["repo_sources"].items()
    }
    provenance_sources = {
        destination: resolve_bound(program_root, binding)
        for destination, binding in build["provenance"].items()
    }

    output_dir.mkdir(parents=True)
    for relative_path, expected in source_contract["initial_adapter"]["files"].items():
        source = source_kit / relative_path
        copy_bound(source, output_dir / relative_path, expected)
    for name, binding in source_contract["evaluation"].items():
        source = source_kit / binding["path"]
        destination = (
            output_dir / f"payload/data/evaluation/{Path(binding['path']).name}"
        )
        copy_bound(source, destination, binding["sha256"])

    data_destinations = {
        "development": "payload/data/DEVELOPMENT.jsonl",
        "control_schedule": "payload/data/C2-SCHEDULE.jsonl",
        "treatment_schedule": "payload/data/T2-SCHEDULE.jsonl",
        "lexical_pair_matches": "payload/data/LEXICAL-PAIR-MATCHES.jsonl",
    }
    if "glossary_development" in build["inputs"]:
        data_destinations["glossary_development"] = (
            "payload/data/GLOSSARY-DEVELOPMENT.jsonl"
        )
    for name, destination in data_destinations.items():
        binding = build["inputs"][name]
        copy_bound(bound_inputs[name], output_dir / destination, binding["sha256"])
    for destination, source in repo_sources.items():
        copy_bound(
            source,
            output_dir / destination,
            build["repo_sources"][destination]["sha256"],
        )
    for destination, source in provenance_sources.items():
        copy_bound(
            source, output_dir / destination, build["provenance"][destination]["sha256"]
        )

    (output_dir / "bootstrap_and_run.sh").chmod(0o755)
    arms = build["experiment"]["arms"]
    final_contract = {
        "schema_version": 1,
        "run_id": build["run_id"],
        "dataset_id": build["dataset_id"],
        "created_at_utc": build["created_at_utc"],
        "purpose": build["purpose"],
        "claims": build["claims"],
        "base_release": source_contract["base_release"],
        "initial_adapter": source_contract["initial_adapter"],
        "tokenizer": source_contract["tokenizer"],
        "development": {
            "path": data_destinations["development"],
            "rows": build["inputs"]["development"]["rows"],
            "sha256": build["inputs"]["development"]["sha256"],
        },
        "evaluation": {
            name: {
                "path": f"payload/data/evaluation/{Path(binding['path']).name}",
                "rows": binding["rows"],
                "sha256": binding["sha256"],
            }
            for name, binding in source_contract["evaluation"].items()
        },
        "experiment_roles": build["experiment"]["roles"],
        "arms": {
            "C2": {
                **arms["C2"],
                "schedule_path": data_destinations["control_schedule"],
                "schedule_sha256": build["inputs"]["control_schedule"]["sha256"],
                "schedule_rows": build["inputs"]["control_schedule"]["rows"],
            },
            "T2": {
                **arms["T2"],
                "schedule_path": data_destinations["treatment_schedule"],
                "schedule_sha256": build["inputs"]["treatment_schedule"]["sha256"],
                "schedule_rows": build["inputs"]["treatment_schedule"]["rows"],
            },
        },
        "lexical_partitions": {
            **build["experiment"]["lexical_partitions"],
            "pair_matches_path": data_destinations["lexical_pair_matches"],
            "pair_matches_rows": build["inputs"]["lexical_pair_matches"]["rows"],
            "pair_matches_sha256": build["inputs"]["lexical_pair_matches"]["sha256"],
        },
        "training": build["experiment"]["training"],
        "gates": build["experiment"]["gates"],
        "provenance": {
            "build_contract_sha256": sha256_file(contract_path),
            "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
            "source_kit_contract_sha256": sha256_file(source_contract_path),
            "files": {
                destination: binding["sha256"]
                for destination, binding in build["provenance"].items()
            },
        },
        "runpod": build["runpod"],
        "runtime": source_contract["runtime"],
    }
    if "glossary_development" in data_destinations:
        binding = build["inputs"]["glossary_development"]
        final_contract["glossary_development"] = {
            "path": data_destinations["glossary_development"],
            "rows": binding["rows"],
            "sha256": binding["sha256"],
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
        "paid_compute_authorized_by_user": build["runpod"][
            "paid_compute_authorized_by_user"
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

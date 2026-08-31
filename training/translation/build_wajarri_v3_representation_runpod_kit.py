#!/usr/bin/env python3
"""Build an immutable Wajarri v3 terminology-representation RunPod kit."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    from training.translation.build_wajarri_v3_task_separated_runpod_kit import (
        copy_bound,
        count_jsonl,
        load_json,
        resolve_bound,
        sha256_file,
        verify,
        write_json,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_task_separated_runpod_kit import (
        copy_bound,
        count_jsonl,
        load_json,
        resolve_bound,
        sha256_file,
        verify,
        write_json,
    )


METHOD_ID = "wajarri-v3-representation-runpod-kit-v1"
DEVELOPMENT_INPUTS = {
    "plain": "development_plain",
    "suffix": "development_suffix",
    "inline_annotation": "development_inline",
    "placeholder_glossary": "development_placeholder",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def parent_id(row: dict[str, Any], condition: str) -> str:
    if condition == "plain":
        return str(row["id"])
    return str(row["parent_row_id"])


def build_development_all(
    condition_rows: dict[str, list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    if set(condition_rows) != set(DEVELOPMENT_INPUTS):
        raise ValueError("development conditions are incomplete")
    plain_targets = {
        str(row["id"]): str(row["output_text"]) for row in condition_rows["plain"]
    }
    combined = []
    for condition, rows in condition_rows.items():
        observed = {
            parent_id(row, condition): str(row["output_text"]) for row in rows
        }
        if observed != plain_targets:
            raise ValueError(f"development target mismatch: {condition}")
        for row in rows:
            combined.append(
                {
                    **row,
                    "id": f"{row['id']}:evaluation-{condition}",
                    "evaluation_condition": condition,
                    "evaluation_parent_id": parent_id(row, condition),
                    "approved_for_training": False,
                }
            )
    identifiers = [str(row["id"]) for row in combined]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("combined development identifiers are not unique")
    return sorted(
        combined,
        key=lambda row: (str(row["evaluation_condition"]), str(row["id"])),
    )


def copy_initial_adapter(
    source_kit: Path, source_contract: dict[str, Any], output_dir: Path
) -> dict[str, Any]:
    for relative_path, expected in source_contract["initial_adapter"]["files"].items():
        copy_bound(source_kit / relative_path, output_dir / relative_path, expected)
    return source_contract["initial_adapter"]


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    repo_root = args.repo_root.resolve()
    contract_path = args.contract.resolve()
    build = load_json(contract_path)
    if build.get("schema_version") != 1 or build.get("method_id") != METHOD_ID:
        raise ValueError("unexpected representation kit contract")
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")

    source_kit = (program_root / build["source_kit"]["path"]).resolve()
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
            raise ValueError(f"row-count mismatch for {name}")
    repo_sources = {
        destination: resolve_bound(repo_root, binding)
        for destination, binding in build["repo_sources"].items()
    }
    provenance = {
        destination: resolve_bound(program_root, binding)
        for destination, binding in build["provenance"].items()
    }

    output_dir.mkdir(parents=True)
    initial_adapter = copy_initial_adapter(source_kit, source_contract, output_dir)
    for binding in source_contract["evaluation"].values():
        destination = output_dir / f"payload/data/evaluation/{Path(binding['path']).name}"
        copy_bound(source_kit / binding["path"], destination, binding["sha256"])

    condition_rows = {
        condition: load_jsonl(inputs[input_name])
        for condition, input_name in DEVELOPMENT_INPUTS.items()
    }
    development_all = build_development_all(condition_rows)
    development_path = output_dir / "payload/data/DEVELOPMENT-ALL-FORMATS.jsonl"
    development_path.parent.mkdir(parents=True, exist_ok=True)
    development_path.write_text(
        "".join(canonical_json(row) + "\n" for row in development_all),
        encoding="utf-8",
    )

    schedule_destinations = {}
    for arm in build["experiment"]["arms"]:
        input_name = f"{arm}_schedule"
        destination = f"payload/data/{arm}-SCHEDULE.jsonl"
        copy_bound(
            inputs[input_name],
            output_dir / destination,
            build["inputs"][input_name]["sha256"],
        )
        schedule_destinations[arm] = destination
    for destination, source in repo_sources.items():
        copy_bound(
            source, output_dir / destination, build["repo_sources"][destination]["sha256"]
        )
    for destination, source in provenance.items():
        copy_bound(
            source, output_dir / destination, build["provenance"][destination]["sha256"]
        )
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
            "placeholder_strings_are_not_added_tokens": ["<T0>", "<T1>"],
        },
        "development_all": {
            "path": "payload/data/DEVELOPMENT-ALL-FORMATS.jsonl",
            "rows": len(development_all),
            "sha256": sha256_file(development_path),
            "conditions": {
                condition: len(rows) for condition, rows in condition_rows.items()
            },
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
                "schedule_path": schedule_destinations[arm],
                "schedule_rows": build["inputs"][f"{arm}_schedule"]["rows"],
                "schedule_sha256": build["inputs"][f"{arm}_schedule"]["sha256"],
            }
            for arm, arm_contract in build["experiment"]["arms"].items()
        },
        "roles": build["experiment"]["roles"],
        "training": build["experiment"]["training"],
        "selection_rule": build["experiment"]["selection_rule"],
        "gates": build["experiment"]["gates"],
        "serving_determinism": build["experiment"]["serving_determinism"],
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
        "status": "PASS_AUTHORIZED_REPRESENTATION_KIT_BUILT_GPU_EXECUTION_ALLOWED",
        "run_id": build["run_id"],
        "files": len(files),
        "bytes": sum(path.stat().st_size for path in files),
        "contract_sha256": sha256_file(output_dir / "CONTRACT.json"),
        "checksums_sha256": sha256_file(output_dir / "SHA256SUMS.kit"),
        "development_rows": len(development_all),
        "sealed_test_included": False,
        "paid_compute_authorized_by_user": build["runpod"][
            "paid_compute_authorized_by_user"
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the immutable Wajarri T7 dedicated-copy-token RunPod kit."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import Counter
from pathlib import Path
from typing import Any

try:
    from training.translation.build_wajarri_v3_task_separated_runpod_kit import (
        copy_bound,
        load_json,
        resolve_bound,
        resolve_bound_directory,
        sha256_file,
        verify,
        write_json,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_task_separated_runpod_kit import (
        copy_bound,
        load_json,
        resolve_bound,
        resolve_bound_directory,
        sha256_file,
        verify,
        write_json,
    )


METHOD_ID = "wajarri-v3-copy-task-token-runpod-kit-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def copy_tree_bound(
    source: Path, destination: Path, files: dict[str, str]
) -> dict[str, str]:
    result = {}
    for relative, expected in files.items():
        copy_bound(source / relative, destination / relative, expected)
        result[(destination / relative).as_posix()] = expected
    return result


def schedule_census(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "rows": len(rows),
        "task_presentations": dict(
            sorted(Counter(str(row["task"]) for row in rows).items())
        ),
        "population_presentations": dict(
            sorted(Counter(str(row["schedule_population"]) for row in rows).items())
        ),
        "source_non_padding_tokens": sum(
            int(row["token_accounting"]["source_tokens_with_specials"])
            for row in rows
        ),
        "target_non_padding_tokens": sum(
            int(row["token_accounting"]["target_tokens_with_specials"])
            for row in rows
        ),
        "non_padding_tokens": sum(
            int(row["token_accounting"]["non_padding_tokens_with_specials"])
            for row in rows
        ),
    }


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    build = load_json(contract_path)
    if build.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method_id: {build.get('method_id')}")
    program_root = args.program_root.resolve()
    repo_root = args.repo_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")

    source_kit = resolve_bound_directory(program_root, build["source_kit"]["path"])
    source_contract_path = source_kit / "CONTRACT.json"
    verify(source_contract_path, build["source_kit"]["sha256"])
    source_contract = load_json(source_contract_path)
    intervention = resolve_bound_directory(
        program_root, build["intervention"]["path"]
    )
    initial_adapter = resolve_bound_directory(
        program_root, build["initial_adapter"]["path"]
    )
    for relative, expected in build["intervention"]["files"].items():
        verify(intervention / relative, expected)
    for relative, expected in build["initial_adapter"]["files"].items():
        verify(initial_adapter / relative, expected)
    repo_sources = {
        destination: resolve_bound(repo_root, binding)
        for destination, binding in build["repo_sources"].items()
    }
    provenance = {
        destination: resolve_bound(program_root, binding)
        for destination, binding in build["provenance"].items()
    }

    output_dir.mkdir(parents=True)
    for relative, expected in build["initial_adapter"]["files"].items():
        copy_bound(
            initial_adapter / relative,
            output_dir / "payload/initial-adapter" / relative,
            expected,
        )
    intervention_destinations = {
        "T7-SCHEDULE.jsonl": "payload/data/T7-SCHEDULE.jsonl",
        "DEVELOPMENT-SCREEN.jsonl": "payload/data/DEVELOPMENT-SCREEN.jsonl",
        "NEUTRAL-SINGLE-CONFIRMATION.jsonl": (
            "payload/data/NEUTRAL-SINGLE-CONFIRMATION.jsonl"
        ),
        "NEUTRAL-DUAL-CONFIRMATION.jsonl": (
            "payload/data/NEUTRAL-DUAL-CONFIRMATION.jsonl"
        ),
    }
    for source_name, destination in intervention_destinations.items():
        copy_bound(
            intervention / source_name,
            output_dir / destination,
            build["intervention"]["files"][source_name],
        )
    for binding in source_contract["evaluation"].values():
        source = source_kit / binding["path"]
        destination = output_dir / "payload/data/evaluation" / Path(binding["path"]).name
        copy_bound(source, destination, binding["sha256"])
    copy_bound(
        source_kit / "requirements.lock",
        output_dir / "requirements.lock",
        build["source_kit"]["requirements_sha256"],
    )
    for destination, source in repo_sources.items():
        copy_bound(source, output_dir / destination, build["repo_sources"][destination]["sha256"])
    for destination, source in provenance.items():
        copy_bound(source, output_dir / destination, build["provenance"][destination]["sha256"])
    (output_dir / "bootstrap_and_run.sh").chmod(0o755)

    schedule_path = output_dir / "payload/data/T7-SCHEDULE.jsonl"
    schedule_rows = load_jsonl(schedule_path)
    census = schedule_census(schedule_rows)
    if census != build["experiment"]["schedule_census"]:
        raise ValueError(
            f"T7 schedule census changed: {census} != {build['experiment']['schedule_census']}"
        )
    adapter_files = {
        f"payload/initial-adapter/{relative}": expected
        for relative, expected in build["initial_adapter"]["files"].items()
    }
    final_contract = {
        "schema_version": 1,
        "experiment_kind": "dedicated_copy_task_token",
        "experiment_slug": "copy-token",
        "run_id": build["run_id"],
        "dataset_id": build["dataset_id"],
        "created_at_utc": build["created_at_utc"],
        "purpose": build["purpose"],
        "claim_limit": build["claim_limit"],
        "claims": build["claims"],
        "base_release": source_contract["base_release"],
        "initial_adapter": {
            "model_id": build["initial_adapter"]["artifact_id"],
            "artifact_id": build["initial_adapter"]["artifact_id"],
            "adapter_weight_sha256": build["initial_adapter"][
                "adapter_weight_sha256"
            ],
            "files": adapter_files,
            "trainable_token_indices": build["initial_adapter"][
                "trainable_token_indices"
            ],
            "topology": build["experiment"]["topology"],
            "public_release": False,
        },
        "tokenizer": build["experiment"]["tokenizer"],
        "development_screen": {
            "path": intervention_destinations["DEVELOPMENT-SCREEN.jsonl"],
            "rows": 198,
            "sha256": build["intervention"]["files"]["DEVELOPMENT-SCREEN.jsonl"],
            "endpoint_rows": source_contract["development_screen"]["endpoint_rows"],
        },
        "confirmations": {
            "neutral_single_confirmation": {
                "path": intervention_destinations[
                    "NEUTRAL-SINGLE-CONFIRMATION.jsonl"
                ],
                "rows": 580,
                "sha256": build["intervention"]["files"][
                    "NEUTRAL-SINGLE-CONFIRMATION.jsonl"
                ],
                "selection_use": "post_checkpoint_selection_only",
            },
            "neutral_dual_confirmation": {
                "path": intervention_destinations[
                    "NEUTRAL-DUAL-CONFIRMATION.jsonl"
                ],
                "rows": 580,
                "sha256": build["intervention"]["files"][
                    "NEUTRAL-DUAL-CONFIRMATION.jsonl"
                ],
                "selection_use": "post_checkpoint_selection_only",
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
            "T7": {
                "description": (
                    "Exact D6 presentation schedule with only neutral-copy inputs "
                    "re-prefixed from <translate> to <copy>."
                ),
                "schedule_path": intervention_destinations["T7-SCHEDULE.jsonl"],
                "schedule_rows": census["rows"],
                "schedule_sha256": build["intervention"]["files"][
                    "T7-SCHEDULE.jsonl"
                ],
                "required_trainable_token_updates": [
                    "wbv_Latn",
                    "<translate>",
                    "<copy>",
                ],
                **{
                    key: census[key]
                    for key in (
                        "task_presentations",
                        "population_presentations",
                        "source_non_padding_tokens",
                        "target_non_padding_tokens",
                        "non_padding_tokens",
                    )
                },
            }
        },
        "roles": {
            "candidates": ["T7"],
            "copy_task_treatment": "T7",
        },
        "training": build["experiment"]["training"],
        "selection_rule": build["experiment"]["selection_rule"],
        "gates": build["experiment"]["gates"],
        "prior_control": build["experiment"]["prior_control"],
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
    print(
        json.dumps(
            {
                "status": "PASS_AUTHORIZED_COPY_TASK_TOKEN_KIT_BUILT_GPU_EXECUTION_ALLOWED",
                "run_id": build["run_id"],
                "files": len(files),
                "bytes": sum(path.stat().st_size for path in files),
                "contract_sha256": sha256_file(output_dir / "CONTRACT.json"),
                "checksums_sha256": sha256_file(output_dir / "SHA256SUMS.kit"),
                "presentations": census["rows"],
                "sealed_test_included": False,
                "paid_compute_authorized_by_user": build["runpod"][
                    "paid_compute_authorized_by_user"
                ],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

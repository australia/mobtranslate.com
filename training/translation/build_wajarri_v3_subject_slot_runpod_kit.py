#!/usr/bin/env python3
"""Build the immutable Wajarri v3 subject-slot RunPod screening kit."""

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


METHOD_ID = "wajarri-v3-subject-slot-runpod-kit-v1"


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
    schedules = resolve_bound_directory(program_root, build["schedules"]["path"])
    initial_adapter = resolve_bound_directory(
        program_root, build["initial_adapter"]["path"]
    )
    for relative, expected in build["schedules"]["files"].items():
        verify(schedules / relative, expected)
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
    schedule_destinations = {
        "M8-SCHEDULE.jsonl": "payload/data/M8-SCHEDULE.jsonl",
        "D8-SCHEDULE.jsonl": "payload/data/D8-SCHEDULE.jsonl",
        "DEVELOPMENT-SCREEN.jsonl": "payload/data/DEVELOPMENT-SCREEN.jsonl",
    }
    for source_name, destination in schedule_destinations.items():
        copy_bound(
            schedules / source_name,
            output_dir / destination,
            build["schedules"]["files"][source_name],
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
        copy_bound(
            source,
            output_dir / destination,
            build["repo_sources"][destination]["sha256"],
        )
    for destination, source in provenance.items():
        copy_bound(
            source,
            output_dir / destination,
            build["provenance"][destination]["sha256"],
        )
    (output_dir / "bootstrap_and_run.sh").chmod(0o755)

    censuses = {
        arm: schedule_census(
            load_jsonl(output_dir / schedule_destinations[f"{arm}-SCHEDULE.jsonl"])
        )
        for arm in ("M8", "D8")
    }
    if censuses != build["experiment"]["schedule_census"]:
        raise ValueError("subject-slot schedule census changed")
    development_rows = load_jsonl(
        output_dir / schedule_destinations["DEVELOPMENT-SCREEN.jsonl"]
    )
    endpoint_rows = dict(
        sorted(Counter(str(row["evaluation_endpoint"]) for row in development_rows).items())
    )
    if endpoint_rows != build["experiment"]["development_endpoint_rows"]:
        raise ValueError("subject-slot development endpoint census changed")

    adapter_files = {
        f"payload/initial-adapter/{relative}": expected
        for relative, expected in build["initial_adapter"]["files"].items()
    }
    final_contract = {
        "schema_version": 1,
        "experiment_kind": "subject_slot_rendering",
        "experiment_slug": "subject-slot",
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
            "path": schedule_destinations["DEVELOPMENT-SCREEN.jsonl"],
            "rows": len(development_rows),
            "sha256": build["schedules"]["files"]["DEVELOPMENT-SCREEN.jsonl"],
            "endpoint_rows": endpoint_rows,
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
                "description": build["experiment"]["arm_descriptions"][arm],
                "schedule_path": schedule_destinations[f"{arm}-SCHEDULE.jsonl"],
                "schedule_rows": censuses[arm]["rows"],
                "schedule_sha256": build["schedules"]["files"][
                    f"{arm}-SCHEDULE.jsonl"
                ],
                "required_trainable_token_updates": (
                    ["wbv_Latn", "<translate>", "<copy>"]
                    if arm == "M8"
                    else ["wbv_Latn", "<translate>", "<glossary>", "<copy>"]
                ),
                **{
                    key: censuses[arm][key]
                    for key in (
                        "task_presentations",
                        "population_presentations",
                        "source_non_padding_tokens",
                        "target_non_padding_tokens",
                        "non_padding_tokens",
                    )
                },
            }
            for arm in ("M8", "D8")
        },
        "roles": {"candidates": ["M8", "D8"]},
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
    print(
        json.dumps(
            {
                "status": "PASS_SUBJECT_SLOT_RUNPOD_KIT_BUILD",
                "output_dir": str(output_dir),
                "run_id": build["run_id"],
                "arms": censuses,
                "development_rows": len(development_rows),
                "sealed_test_included": False,
                "kit_contract_sha256": sha256_file(output_dir / "CONTRACT.json"),
                "kit_sha256sums_sha256": sha256_file(output_dir / "SHA256SUMS.kit"),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

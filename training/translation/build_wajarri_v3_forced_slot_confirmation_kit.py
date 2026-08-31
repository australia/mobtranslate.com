#!/usr/bin/env python3
"""Build the immutable multi-seed Wajarri forced-slot confirmation kit."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import Counter
from pathlib import Path
from typing import Any

try:
    from training.translation.build_wajarri_v3_subject_slot_runpod_kit import (
        load_jsonl,
        schedule_census,
    )
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
    from training.translation.build_wajarri_v3_subject_slot_runpod_kit import (
        load_jsonl,
        schedule_census,
    )
    from training.translation.build_wajarri_v3_task_separated_runpod_kit import (
        copy_bound,
        load_json,
        resolve_bound,
        resolve_bound_directory,
        sha256_file,
        verify,
        write_json,
    )


METHOD_ID = "wajarri-v3-forced-slot-confirmation-kit-v1"
MATCHED_ENDPOINTS = ("slot_composition_masked", "slot_held_masked")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def verify_checksum_ledger(root: Path, ledger: Path) -> int:
    rows = [line for line in ledger.read_text(encoding="utf-8").splitlines() if line]
    for line in rows:
        expected, relative = line.split("  ", 1)
        verify(root / relative, expected)
    return len(rows)


def endpoint_census(rows: list[dict[str, Any]]) -> dict[str, int]:
    return dict(
        sorted(Counter(str(row["evaluation_endpoint"]) for row in rows).items())
    )


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
    source_ledger_path = source_kit / "SHA256SUMS.kit"
    verify(source_contract_path, build["source_kit"]["contract_sha256"])
    verify(source_ledger_path, build["source_kit"]["ledger_sha256"])
    source_bound_files = verify_checksum_ledger(source_kit, source_ledger_path)
    source = load_json(source_contract_path)
    if source.get("experiment_kind") != "subject_slot_rendering":
        raise ValueError("source kit is not the subject-slot screen")

    output_dir.mkdir(parents=True)
    copied_source_paths = [
        "requirements.lock",
        source["development_screen"]["path"],
        source["arms"]["M8"]["schedule_path"],
        *[binding["path"] for binding in source["evaluation"].values()],
        *source["initial_adapter"]["files"].keys(),
    ]
    source_hashes = {
        source["development_screen"]["path"]: source["development_screen"]["sha256"],
        source["arms"]["M8"]["schedule_path"]: source["arms"]["M8"][
            "schedule_sha256"
        ],
        **{
            binding["path"]: binding["sha256"]
            for binding in source["evaluation"].values()
        },
        **source["initial_adapter"]["files"],
        "requirements.lock": build["source_kit"]["requirements_sha256"],
    }
    for relative in copied_source_paths:
        copy_bound(source_kit / relative, output_dir / relative, source_hashes[relative])

    repo_sources = {
        destination: resolve_bound(repo_root, binding)
        for destination, binding in build["repo_sources"].items()
    }
    for destination, path in repo_sources.items():
        copy_bound(
            path,
            output_dir / destination,
            build["repo_sources"][destination]["sha256"],
        )
    provenance = {
        destination: resolve_bound(program_root, binding)
        for destination, binding in build["provenance"].items()
    }
    for destination, path in provenance.items():
        copy_bound(
            path,
            output_dir / destination,
            build["provenance"][destination]["sha256"],
        )
    (output_dir / "bootstrap_and_run.sh").chmod(0o755)

    schedule_rows = load_jsonl(output_dir / source["arms"]["M8"]["schedule_path"])
    schedule = schedule_census(schedule_rows)
    expected_census = {
        **{key: source["arms"]["M8"][key] for key in schedule if key != "rows"},
        "rows": source["arms"]["M8"]["schedule_rows"],
    }
    if schedule != expected_census:
        raise ValueError("M8 schedule census changed")
    development_rows = load_jsonl(output_dir / source["development_screen"]["path"])
    endpoints = endpoint_census(development_rows)
    forced_endpoint_rows = {name: endpoints[name] for name in MATCHED_ENDPOINTS}
    if forced_endpoint_rows != build["forced_route"]["endpoint_rows"]:
        raise ValueError("forced-route endpoint census changed")

    final_contract = {
        "schema_version": 1,
        "experiment_kind": "forced_subject_slot_confirmation",
        "experiment_slug": "forced-subject-slot-confirmation",
        "run_id": build["run_id"],
        "dataset_id": source["dataset_id"],
        "created_at_utc": build["created_at_utc"],
        "purpose": build["purpose"],
        "claim_limit": build["claim_limit"],
        "claims": build["claims"],
        "base_release": source["base_release"],
        "initial_adapter": source["initial_adapter"],
        "tokenizer": source["tokenizer"],
        "development_screen": source["development_screen"],
        "evaluation": source["evaluation"],
        "arms": {"M8": source["arms"]["M8"]},
        "confirmation_seeds": build["confirmation_seeds"],
        "training": source["training"],
        "forced_route": build["forced_route"],
        "selection_rule": build["selection_rule"],
        "gates": build["gates"],
        "provenance": {
            "build_contract_sha256": sha256_file(contract_path),
            "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
            "source_kit_contract_sha256": sha256_file(source_contract_path),
            "source_kit_ledger_sha256": sha256_file(source_ledger_path),
            "source_kit_bound_files": source_bound_files,
            "files": {
                destination: binding["sha256"]
                for destination, binding in build["provenance"].items()
            },
        },
        "runpod": build["runpod"],
        "runtime": source["runtime"],
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
                "status": "PASS_FORCED_SLOT_CONFIRMATION_KIT_BUILD",
                "output_dir": str(output_dir),
                "run_id": build["run_id"],
                "seeds": build["confirmation_seeds"],
                "schedule": schedule,
                "forced_route_rows": sum(forced_endpoint_rows.values()),
                "sealed_test_included": False,
                "kit_contract_sha256": sha256_file(output_dir / "CONTRACT.json"),
                "kit_sha256sums_sha256": sha256_file(
                    output_dir / "SHA256SUMS.kit"
                ),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

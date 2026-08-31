#!/usr/bin/env python3
"""Build an immutable Wajarri neutral-copy/composition RunPod screen kit."""

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


METHOD_ID = "wajarri-v3-neutral-copy-runpod-kit-v1"
SCREEN_INPUTS = {
    "composition_plain": ("composition_development_plain", "plain"),
    "composition_inline": ("composition_development_inline", "inline_annotation"),
    "held_lexeme_plain": ("held_lexeme_development_plain", "plain"),
    "held_lexeme_inline": ("held_lexeme_development_inline", "inline_annotation"),
    "neutral_single_copy_screen": (
        "neutral_single_development_screen",
        "neutral_single_copy",
    ),
    "neutral_dual_copy_screen": (
        "neutral_dual_development_screen",
        "neutral_dual_copy",
    ),
}
CONFIRMATION_INPUTS = {
    "neutral_single_confirmation": (
        "neutral_single_development_confirmation",
        "neutral_single_copy_confirmation",
        "neutral_single_copy",
    ),
    "neutral_dual_confirmation": (
        "neutral_dual_development_confirmation",
        "neutral_dual_copy_confirmation",
        "neutral_dual_copy",
    ),
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


def evaluation_row(
    row: dict[str, Any], *, endpoint: str, condition: str
) -> dict[str, Any]:
    source_text = row.get("source_text") or row.get("source_prompt")
    if not isinstance(source_text, str) or not source_text.strip():
        raise ValueError(f"evaluation source text is missing: {row.get('id')}")
    return {
        **row,
        "id": f"{row['id']}:evaluation-{endpoint}",
        "evaluation_endpoint": endpoint,
        "evaluation_condition": condition,
        "source_text": source_text,
        "approved_for_training": False,
    }


def build_screen_rows(inputs: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    combined = []
    for endpoint, (input_name, condition) in SCREEN_INPUTS.items():
        combined.extend(
            evaluation_row(row, endpoint=endpoint, condition=condition)
            for row in inputs[input_name]
        )
    identifiers = [str(row["id"]) for row in combined]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("combined screen identifiers are not unique")
    return sorted(combined, key=lambda row: (row["evaluation_endpoint"], row["id"]))


def build_confirmation_rows(
    rows: list[dict[str, Any]], *, endpoint: str, condition: str
) -> list[dict[str, Any]]:
    return sorted(
        [evaluation_row(row, endpoint=endpoint, condition=condition) for row in rows],
        key=lambda row: row["id"],
    )


def copy_initial_adapter(
    source_kit: Path, source_contract: dict[str, Any], output_dir: Path
) -> dict[str, Any]:
    for relative_path, expected in source_contract["initial_adapter"]["files"].items():
        copy_bound(source_kit / relative_path, output_dir / relative_path, expected)
    return source_contract["initial_adapter"]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(canonical_json(row) + "\n" for row in rows), encoding="utf-8"
    )


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    repo_root = args.repo_root.resolve()
    contract_path = args.contract.resolve()
    build = load_json(contract_path)
    if build.get("schema_version") != 1 or build.get("method_id") != METHOD_ID:
        raise ValueError("unexpected neutral-copy kit contract")
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")

    source_kit = (program_root / build["source_kit"]["path"]).resolve()
    source_contract_path = source_kit / "CONTRACT.json"
    verify(source_contract_path, build["source_kit"]["contract_sha256"])
    source_contract = load_json(source_contract_path)
    bound_inputs = {
        name: resolve_bound(program_root, binding)
        for name, binding in build["inputs"].items()
    }
    for name, path in bound_inputs.items():
        expected_rows = build["inputs"][name].get("rows")
        if expected_rows is not None and count_jsonl(path) != int(expected_rows):
            raise ValueError(f"row-count mismatch for {name}")
    required_row_inputs = {
        input_name for input_name, _ in SCREEN_INPUTS.values()
    } | {
        input_name
        for input_name, _, _ in CONFIRMATION_INPUTS.values()
    }
    input_rows = {
        name: load_jsonl(path)
        for name, path in bound_inputs.items()
        if name in required_row_inputs
    }
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

    screen_rows = build_screen_rows(input_rows)
    screen_path = output_dir / "payload/data/DEVELOPMENT-SCREEN.jsonl"
    write_jsonl(screen_path, screen_rows)
    confirmation_bindings = {}
    for binding_name, (input_name, endpoint, condition) in CONFIRMATION_INPUTS.items():
        rows = build_confirmation_rows(
            input_rows[input_name], endpoint=endpoint, condition=condition
        )
        destination = output_dir / f"payload/data/{binding_name.upper()}.jsonl"
        write_jsonl(destination, rows)
        confirmation_bindings[binding_name] = {
            "path": destination.relative_to(output_dir).as_posix(),
            "rows": len(rows),
            "sha256": sha256_file(destination),
            "selection_use": "post_checkpoint_selection_only",
        }

    schedule_destinations = {}
    for arm in build["experiment"]["arms"]:
        input_name = f"{arm}_schedule"
        destination = f"payload/data/{arm}-SCHEDULE.jsonl"
        copy_bound(
            bound_inputs[input_name],
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

    endpoint_counts = {
        endpoint: sum(row["evaluation_endpoint"] == endpoint for row in screen_rows)
        for endpoint in SCREEN_INPUTS
    }
    final_contract = {
        "schema_version": 1,
        "experiment_kind": "neutral_copy_composition",
        "experiment_slug": "neutral-copy",
        "run_id": build["run_id"],
        "dataset_id": build["dataset_id"],
        "created_at_utc": build["created_at_utc"],
        "purpose": build["purpose"],
        "claim_limit": build["claim_limit"],
        "claims": build["claims"],
        "base_release": source_contract["base_release"],
        "initial_adapter": initial_adapter,
        "tokenizer": source_contract["tokenizer"],
        "development_screen": {
            "path": "payload/data/DEVELOPMENT-SCREEN.jsonl",
            "rows": len(screen_rows),
            "sha256": sha256_file(screen_path),
            "endpoint_rows": endpoint_counts,
        },
        "confirmations": confirmation_bindings,
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
        "status": "PASS_AUTHORIZED_NEUTRAL_COPY_KIT_BUILT_GPU_EXECUTION_ALLOWED",
        "run_id": build["run_id"],
        "files": len(files),
        "bytes": sum(path.stat().st_size for path in files),
        "contract_sha256": sha256_file(output_dir / "CONTRACT.json"),
        "checksums_sha256": sha256_file(output_dir / "SHA256SUMS.kit"),
        "development_rows": len(screen_rows),
        "confirmation_rows": sum(
            binding["rows"] for binding in confirmation_bindings.values()
        ),
        "sealed_test_included": False,
        "paid_compute_authorized_by_user": build["runpod"][
            "paid_compute_authorized_by_user"
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

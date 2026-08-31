#!/usr/bin/env python3
"""Build the prefix-only Wajarri T7 copy-task-token intervention corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any


METHOD_ID = "wajarri-v3-copy-task-token-intervention-v1"
COPY_TASK = "neutral_terminology_copy_auxiliary"
COPY_ENDPOINTS = {
    "neutral_single_copy_screen",
    "neutral_dual_copy_screen",
    "neutral_single_copy_confirmation",
    "neutral_dual_copy_confirmation",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--source-kit", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"JSON document is not an object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]
    if not all(isinstance(row, dict) for row in rows):
        raise TypeError(f"JSONL contains a non-object: {path}")
    return rows


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(canonical_json(row) + "\n" for row in rows), encoding="utf-8"
    )


def verify(path: Path, expected: str) -> None:
    observed = sha256_file(path)
    if observed != expected:
        raise ValueError(f"SHA-256 mismatch for {path}: {observed} != {expected}")


def replace_prefix(value: str) -> str:
    if not value.startswith("<translate> "):
        raise ValueError(f"copy row lacks the exact source prefix: {value!r}")
    return "<copy> " + value.removeprefix("<translate> ")


def transform_schedule(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    transformed = []
    changed = 0
    for index, source in enumerate(rows, start=1):
        row = dict(source)
        is_copy = str(row.get("task")) == COPY_TASK
        if is_copy:
            row["input_text"] = replace_prefix(str(row["input_text"]))
            changed += 1
        elif "<copy>" in str(row.get("input_text") or ""):
            raise ValueError(f"non-copy row already contains <copy>: {row.get('id')}")
        row["source_schedule_id"] = str(row["id"])
        row["id"] = f"wbv-v3-copy-task-token:t7:{index:06d}"
        row["arm"] = "T7"
        transformed.append(row)

    for source, target in zip(rows, transformed, strict=True):
        allowed = {"arm", "id", "input_text", "source_schedule_id"}
        source_without = {key: value for key, value in source.items() if key not in allowed}
        target_without = {key: value for key, value in target.items() if key not in allowed}
        if source_without != target_without:
            raise RuntimeError(f"non-prefix schedule data changed: {source['id']}")
        expected_input = (
            replace_prefix(str(source["input_text"]))
            if source["task"] == COPY_TASK
            else source["input_text"]
        )
        if target["input_text"] != expected_input:
            raise RuntimeError(f"unexpected model-visible schedule change: {source['id']}")
    return transformed, {
        "rows": len(rows),
        "copy_rows_changed": changed,
        "noncopy_rows_unchanged_model_visible": len(rows) - changed,
        "outputs_preserved": all(
            source["output_text"] == target["output_text"]
            for source, target in zip(rows, transformed, strict=True)
        ),
        "presentation_order_preserved": all(
            source["presentation_index"] == target["presentation_index"]
            and source["optimizer_update"] == target["optimizer_update"]
            for source, target in zip(rows, transformed, strict=True)
        ),
        "token_accounting_preserved": all(
            source["token_accounting"] == target["token_accounting"]
            for source, target in zip(rows, transformed, strict=True)
        ),
    }


def transform_evaluation(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    transformed = []
    changed = 0
    for source in rows:
        row = dict(source)
        endpoint = str(row.get("evaluation_endpoint") or "")
        is_copy = endpoint in COPY_ENDPOINTS or str(row.get("task")) == COPY_TASK
        if is_copy:
            row["input_text"] = replace_prefix(str(row["input_text"]))
            changed += 1
        elif "<copy>" in str(row.get("input_text") or ""):
            raise ValueError(f"non-copy evaluation row contains <copy>: {row.get('id')}")
        transformed.append(row)
    for source, target in zip(rows, transformed, strict=True):
        expected_input = (
            replace_prefix(str(source["input_text"]))
            if (
                str(source.get("evaluation_endpoint") or "") in COPY_ENDPOINTS
                or str(source.get("task")) == COPY_TASK
            )
            else source["input_text"]
        )
        if target["input_text"] != expected_input:
            raise RuntimeError(f"unexpected evaluation input change: {source.get('id')}")
        if {key: value for key, value in source.items() if key != "input_text"} != {
            key: value for key, value in target.items() if key != "input_text"
        }:
            raise RuntimeError(f"non-prefix evaluation data changed: {source.get('id')}")
    return transformed, changed


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    contract = read_json(contract_path)
    if contract.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method_id: {contract.get('method_id')}")
    source_kit = args.source_kit.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    temporary = output_dir.with_name(f".{output_dir.name}.tmp")
    if temporary.exists():
        raise SystemExit(f"refusing existing temporary directory: {temporary}")
    verify(source_kit / "CONTRACT.json", contract["source_kit_contract_sha256"])

    input_rows = {}
    for name, binding in contract["inputs"].items():
        path = source_kit / binding["path"]
        verify(path, binding["sha256"])
        rows = read_jsonl(path)
        if len(rows) != int(binding["rows"]):
            raise ValueError(f"row-count mismatch for {name}: {len(rows)}")
        input_rows[name] = rows

    schedule, schedule_audit = transform_schedule(input_rows["D6_schedule"])
    development, development_changed = transform_evaluation(
        input_rows["development_screen"]
    )
    single_confirmation, single_changed = transform_evaluation(
        input_rows["neutral_single_confirmation"]
    )
    dual_confirmation, dual_changed = transform_evaluation(
        input_rows["neutral_dual_confirmation"]
    )
    expected = contract["expected"]
    observed = {
        "schedule_rows": len(schedule),
        "schedule_copy_rows_changed": schedule_audit["copy_rows_changed"],
        "development_rows": len(development),
        "development_copy_rows_changed": development_changed,
        "single_confirmation_rows": len(single_confirmation),
        "single_confirmation_rows_changed": single_changed,
        "dual_confirmation_rows": len(dual_confirmation),
        "dual_confirmation_rows_changed": dual_changed,
    }
    if observed != expected:
        raise ValueError(f"intervention census changed: {observed} != {expected}")
    task_counts = dict(sorted(Counter(str(row["task"]) for row in schedule).items()))
    population_counts = dict(
        sorted(Counter(str(row["schedule_population"]) for row in schedule).items())
    )
    if task_counts != contract["expected_task_presentations"]:
        raise ValueError(f"task presentation counts changed: {task_counts}")
    if population_counts != contract["expected_population_presentations"]:
        raise ValueError(f"population presentation counts changed: {population_counts}")

    temporary.mkdir(parents=True)
    outputs = {
        "T7-SCHEDULE.jsonl": schedule,
        "DEVELOPMENT-SCREEN.jsonl": development,
        "NEUTRAL-SINGLE-CONFIRMATION.jsonl": single_confirmation,
        "NEUTRAL-DUAL-CONFIRMATION.jsonl": dual_confirmation,
    }
    for name, rows in outputs.items():
        write_jsonl(temporary / name, rows)
    audit = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "intervention_id": contract["intervention_id"],
        "contract_sha256": sha256_file(contract_path),
        "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "source_kit_contract_sha256": contract["source_kit_contract_sha256"],
        "changed_component": "copy auxiliary model-visible prefix only",
        "source_prefix": "<translate>",
        "target_prefix": "<copy>",
        "census": observed,
        "schedule_audit": schedule_audit,
        "task_presentations": task_counts,
        "population_presentations": population_counts,
        "invariants": {
            "all_outputs_preserved": schedule_audit["outputs_preserved"],
            "presentation_order_preserved": schedule_audit[
                "presentation_order_preserved"
            ],
            "token_accounting_preserved_because_both_controls_are_one_token": schedule_audit[
                "token_accounting_preserved"
            ],
            "noncopy_model_inputs_preserved": True,
            "evaluation_references_and_metadata_preserved": True,
            "sealed_test_included": False,
        },
        "claim_limit": contract["claim_limit"],
    }
    positive_invariants = {
        key: value
        for key, value in audit["invariants"].items()
        if key != "sealed_test_included"
    }
    if not all(positive_invariants.values()) or audit["invariants"][
        "sealed_test_included"
    ] is not False:
        raise RuntimeError(f"intervention invariant failed: {audit['invariants']}")
    write_json(temporary / "AUDIT.json", audit)
    manifest = {
        "schema_version": 1,
        "intervention_id": contract["intervention_id"],
        "contract_sha256": sha256_file(contract_path),
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
                "status": "PASS_COPY_TASK_TOKEN_INTERVENTION_BUILT",
                "intervention_id": contract["intervention_id"],
                "census": observed,
                "schedule_sha256": sha256_file(output_dir / "T7-SCHEDULE.jsonl"),
                "audit_sha256": sha256_file(output_dir / "AUDIT.json"),
                "manifest_sha256": sha256_file(output_dir / "MANIFEST.json"),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

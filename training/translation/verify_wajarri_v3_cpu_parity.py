#!/usr/bin/env python3
"""Verify CPU float32 parity for the frozen Wajarri controlled route."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BATCH_SIZES = (1, 16)
ENDPOINTS = ("slot_composition_masked", "slot_held_masked")
OUTPUT_FIELDS = (
    "prediction",
    "rendered_prediction",
    "raw_exact",
    "rendered_exact",
    "slot_count",
    "slot_position_valid",
    "failure_codes",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gpu-dir", type=Path, required=True)
    parser.add_argument("--cpu-dir", type=Path, required=True)
    parser.add_argument("--expected-adapter-sha256", required=True)
    parser.add_argument("--expected-rows", type=int, default=35)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def read_predictions(path: Path) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            row_id = str(row.get("row_id") or "")
            if not row_id or row_id in rows:
                raise ValueError(f"invalid row ID at {path}:{line_number}")
            rows[row_id] = row
    return rows


def mechanical_gates(summary: dict[str, Any], expected_rows: int) -> dict[str, bool]:
    metrics = summary["metrics"]
    return {
        "expected_row_count": int(summary["evaluated_rows"]) == expected_rows,
        "included_endpoints_exact": tuple(summary["included_endpoints"])
        == ENDPOINTS,
        "raw_templates_exact": int(metrics["raw_exact"]) == expected_rows,
        "rendered_clauses_exact": int(metrics["slot_rendered_exact"])
        == expected_rows,
        "slot_counts_exact": int(metrics["slot_count_valid"]) == expected_rows,
        "slot_positions_exact": int(metrics["slot_position_valid"])
        == expected_rows,
        "predicates_present": int(metrics["predicate_present"]) == expected_rows,
        "faults_zero": sum(int(value) for value in metrics["faults"].values()) == 0,
        "batch_invariance": bool(summary["batch_invariance"]["all_outputs_identical"]),
    }


def compare_prediction_sets(
    gpu_rows: dict[str, dict[str, Any]],
    cpu_rows: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    differences: list[dict[str, Any]] = []
    for row_id in sorted(set(gpu_rows) | set(cpu_rows)):
        gpu = gpu_rows.get(row_id)
        cpu = cpu_rows.get(row_id)
        if gpu is None or cpu is None:
            differences.append(
                {"row_id": row_id, "field": "row_presence", "gpu": gpu is not None, "cpu": cpu is not None}
            )
            continue
        for field in OUTPUT_FIELDS:
            if gpu.get(field) != cpu.get(field):
                differences.append(
                    {
                        "row_id": row_id,
                        "field": field,
                        "gpu": gpu.get(field),
                        "cpu": cpu.get(field),
                    }
                )
    return differences


def verify(
    gpu_dir: Path,
    cpu_dir: Path,
    expected_adapter_sha256: str,
    expected_rows: int,
) -> dict[str, Any]:
    gpu_summary = read_json(gpu_dir / "SUMMARY.json")
    cpu_summary = read_json(cpu_dir / "SUMMARY.json")
    gpu_gates = mechanical_gates(gpu_summary, expected_rows)
    cpu_gates = mechanical_gates(cpu_summary, expected_rows)
    identity_gates = {
        "gpu_adapter_hash": gpu_summary["adapter_weight_sha256"]
        == expected_adapter_sha256,
        "cpu_adapter_hash": cpu_summary["adapter_weight_sha256"]
        == expected_adapter_sha256,
        "gpu_device_cuda": gpu_summary.get("device") == "cuda",
        "cpu_device_cpu": cpu_summary.get("device") == "cpu",
        "gpu_dtype_bfloat16": gpu_summary["dtype"] == "bfloat16",
        "cpu_dtype_float32": cpu_summary["dtype"] == "float32",
        "evaluation_hash_equal": gpu_summary["evaluation_sha256"]
        == cpu_summary["evaluation_sha256"],
        "evaluated_row_ids_hash_equal": gpu_summary["evaluated_row_ids_sha256"]
        == cpu_summary["evaluated_row_ids_sha256"],
    }
    differences_by_batch: dict[str, list[dict[str, Any]]] = {}
    prediction_hashes: dict[str, dict[str, str]] = {}
    for batch_size in BATCH_SIZES:
        name = f"PREDICTIONS.batch-{batch_size}.jsonl"
        gpu_path = gpu_dir / name
        cpu_path = cpu_dir / name
        gpu_rows = read_predictions(gpu_path)
        cpu_rows = read_predictions(cpu_path)
        differences_by_batch[str(batch_size)] = compare_prediction_sets(
            gpu_rows, cpu_rows
        )
        prediction_hashes[str(batch_size)] = {
            "gpu": sha256_file(gpu_path),
            "cpu": sha256_file(cpu_path),
        }
    parity_gates = {
        f"batch_{batch_size}_outputs_equal": not differences_by_batch[
            str(batch_size)
        ]
        for batch_size in BATCH_SIZES
    }
    passed = all(
        [
            *gpu_gates.values(),
            *cpu_gates.values(),
            *identity_gates.values(),
            *parity_gates.values(),
        ]
    )
    return {
        "schema_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "PASS_CPU_FLOAT32_PARITY" if passed else "FAIL_CPU_FLOAT32_PARITY",
        "passed": passed,
        "claim_limit": "Runtime parity for the 35-row controlled subject-slot route only; not free-form or natural-language translation reliability.",
        "expected_adapter_sha256": expected_adapter_sha256,
        "gpu_summary_sha256": sha256_file(gpu_dir / "SUMMARY.json"),
        "cpu_summary_sha256": sha256_file(cpu_dir / "SUMMARY.json"),
        "gpu_gates": gpu_gates,
        "cpu_gates": cpu_gates,
        "identity_gates": identity_gates,
        "parity_gates": parity_gates,
        "prediction_hashes": prediction_hashes,
        "differences_by_batch": differences_by_batch,
    }


def main() -> None:
    args = parse_args()
    if args.output.exists():
        raise FileExistsError(args.output)
    result = verify(
        args.gpu_dir.resolve(),
        args.cpu_dir.resolve(),
        args.expected_adapter_sha256,
        args.expected_rows,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    if not result["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

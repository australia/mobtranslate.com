from __future__ import annotations

import json
from pathlib import Path

from training.translation.verify_wajarri_v3_cpu_parity import verify


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def write_predictions(path: Path, prediction: str) -> None:
    row = {
        "row_id": "row-1",
        "prediction": prediction,
        "rendered_prediction": "duba jamarnimanha.",
        "raw_exact": True,
        "rendered_exact": True,
        "slot_count": 1,
        "slot_position_valid": True,
        "failure_codes": [],
    }
    path.write_text(json.dumps(row) + "\n", encoding="utf-8")


def summary(device: str, dtype: str) -> dict:
    return {
        "adapter_weight_sha256": "adapter",
        "batch_invariance": {"all_outputs_identical": True},
        "device": device,
        "dtype": dtype,
        "evaluated_rows": 1,
        "evaluation_sha256": "evaluation",
        "evaluated_row_ids_sha256": "rows",
        "included_endpoints": [
            "slot_composition_masked",
            "slot_held_masked",
        ],
        "metrics": {
            "raw_exact": 1,
            "slot_rendered_exact": 1,
            "slot_count_valid": 1,
            "slot_position_valid": 1,
            "predicate_present": 1,
            "faults": {"blank": 0},
        },
    }


def test_cpu_parity_requires_identical_outputs_and_runtime_identity(tmp_path: Path) -> None:
    gpu = tmp_path / "gpu"
    cpu = tmp_path / "cpu"
    gpu.mkdir()
    cpu.mkdir()
    write_json(gpu / "SUMMARY.json", summary("cuda", "bfloat16"))
    write_json(cpu / "SUMMARY.json", summary("cpu", "float32"))
    for batch_size in (1, 16):
        write_predictions(gpu / f"PREDICTIONS.batch-{batch_size}.jsonl", "<copy> jamarnimanha.")
        write_predictions(cpu / f"PREDICTIONS.batch-{batch_size}.jsonl", "<copy> jamarnimanha.")

    passing = verify(gpu, cpu, "adapter", 1)
    assert passing["passed"] is True

    write_predictions(cpu / "PREDICTIONS.batch-16.jsonl", "<copy> yanmanha.")
    failing = verify(gpu, cpu, "adapter", 1)
    assert failing["passed"] is False
    assert failing["differences_by_batch"]["16"][0]["field"] == "prediction"

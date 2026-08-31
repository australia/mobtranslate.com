#!/usr/bin/env python3
"""Run a frozen NLLB fixed-utterance baseline after a two-sample host gate."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Any


class ContractError(ValueError):
    """The experiment contract or host gate is inconsistent."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ContractError(f"expected JSON object: {path}")
    return value


def resolve(root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def parse_time(value: Any, context: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ContractError(f"{context}.sampled_at_utc must be an ISO-8601 string")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ContractError(f"invalid {context}.sampled_at_utc: {value!r}") from error


def verify_host_gate(
    report: dict[str, Any], policy: dict[str, Any]
) -> list[dict[str, Any]]:
    samples = report.get("samples")
    if not isinstance(samples, list) or len(samples) < 2:
        raise ContractError("host gate requires at least two samples")
    selected = samples[-2:]
    minimum_memory = int(policy["minimum_mem_available_bytes"])
    maximum_load_1m = float(policy["maximum_load_1m"])
    maximum_load_5m = float(policy["maximum_load_5m"])
    minimum_interval = int(policy["minimum_sample_interval_seconds"])
    times: list[datetime] = []
    for index, sample in enumerate(selected, start=1):
        if not isinstance(sample, dict):
            raise ContractError(f"host gate sample {index} must be an object")
        context = f"host gate sample {index}"
        times.append(parse_time(sample.get("sampled_at_utc"), context))
        memory = int(sample.get("mem_available_bytes", -1))
        load_1m = float(sample.get("load_1m", float("inf")))
        load_5m = float(sample.get("load_5m", float("inf")))
        if memory < minimum_memory:
            raise ContractError(
                f"{context} memory {memory} is below required {minimum_memory}"
            )
        if load_1m > maximum_load_1m or load_5m > maximum_load_5m:
            raise ContractError(
                f"{context} load {load_1m}/{load_5m} exceeds "
                f"{maximum_load_1m}/{maximum_load_5m}"
            )
        if sample.get("heavy_competing_job") is not False:
            raise ContractError(f"{context} does not prove heavy_competing_job=false")
    interval = (times[1] - times[0]).total_seconds()
    if interval < minimum_interval:
        raise ContractError(
            f"host gate sample interval {interval} is below required {minimum_interval}"
        )
    return selected


def verify_file(root: Path, declaration: dict[str, Any], context: str) -> Path:
    path_value = declaration.get("path")
    expected = declaration.get("sha256")
    if not isinstance(path_value, str) or not isinstance(expected, str):
        raise ContractError(f"{context} requires path and sha256")
    path = resolve(root, path_value)
    observed = sha256(path)
    if observed != expected:
        raise ContractError(
            f"{context} SHA-256 mismatch: expected {expected}, observed {observed}"
        )
    return path


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def tree_checksums(root: Path) -> list[tuple[str, str]]:
    excluded = {"OUTPUT-SHA256SUMS", "RUN_COMPLETE"}
    return [
        (path.relative_to(root).as_posix(), sha256(path))
        for path in sorted(root.rglob("*"))
        if path.is_file() and path.name not in excluded
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--execution", choices=("local", "hosted"), required=True)
    parser.add_argument("--python", type=Path, default=Path(sys.executable))
    parser.add_argument("--host-gate-report", type=Path)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--preflight-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    contract = load_json(args.contract)
    if contract.get("schema_version") != 1:
        raise ContractError("unsupported contract schema_version")
    root = args.program_root.resolve()
    driver = contract.get("driver")
    runner = contract.get("runner")
    analyzer = contract.get("post_analyzer")
    suites = contract.get("suites")
    if not isinstance(driver, dict) or not isinstance(runner, dict):
        raise ContractError("contract requires driver and runner objects")
    if (
        not isinstance(analyzer, dict)
        or not isinstance(suites, list)
        or len(suites) != 1
    ):
        raise ContractError(
            "fixed-utterance contract requires one suite and one post_analyzer"
        )
    driver_path = verify_file(root, driver, "driver")
    if driver_path.resolve() != Path(__file__).resolve():
        raise ContractError("invoked driver path does not match the frozen contract")
    runner_path = verify_file(root, runner, "runner")
    analyzer_path = verify_file(root, analyzer, "post_analyzer")
    suite = suites[0]
    if not isinstance(suite, dict):
        raise ContractError("suite declaration must be an object")
    suite_path = verify_file(root, suite, "suite")

    gate_samples: list[dict[str, Any]] | None = None
    if not args.preflight_only:
        if args.execution != "local":
            raise ContractError("this fixed-utterance baseline is local-only")
        if args.host_gate_report is None:
            raise ContractError("--host-gate-report is required before model loading")
        gate_samples = verify_host_gate(
            load_json(args.host_gate_report), contract["host_resource_gate"]
        )

    output_root = args.output_root.resolve()
    if output_root.exists() and not args.resume:
        raise FileExistsError(f"refusing existing output root: {output_root}")
    output_root.mkdir(parents=True, exist_ok=True)
    generation_root = output_root / "generation"
    command = [
        str(args.python),
        str(runner_path),
        "--contract",
        str(args.contract.resolve()),
        "--program-root",
        str(root),
        "--output-root",
        str(generation_root),
        "--execution",
        args.execution,
        "--python",
        str(args.python),
    ]
    if args.resume:
        command.append("--resume")
    if args.preflight_only:
        command.append("--preflight-only")
    subprocess.run(command, check=True)
    if args.preflight_only:
        return
    if not (generation_root / "RUN_COMPLETE").is_file():
        raise ContractError("frozen generation runner did not emit RUN_COMPLETE")

    suite_key = str(suite["suite_key"])
    predictions_path = generation_root / "suites" / suite_key / "predictions.jsonl"
    prediction_sha256 = sha256(predictions_path)
    analysis_root = output_root / "sentence-analysis"
    if not analysis_root.exists():
        subprocess.run(
            [
                str(args.python),
                str(analyzer_path),
                "--benchmark",
                str(suite_path),
                "--predictions",
                str(predictions_path),
                "--output-dir",
                str(analysis_root),
                "--expected-benchmark-sha256",
                str(suite["sha256"]),
                "--expected-predictions-sha256",
                prediction_sha256,
                "--expected-rows",
                str(suite["rows"]),
            ],
            check=True,
        )
    analysis_checksum = analysis_root / "SENTENCE-ANALYSIS-SHA256SUMS"
    if not analysis_checksum.is_file():
        raise ContractError("sentence analyzer did not emit its checksum inventory")

    summary_path = output_root / "SUMMARY.json"
    if not summary_path.exists():
        write_json_atomic(
            summary_path,
            {
                "schema_version": 1,
                "experiment_id": contract["experiment_id"],
                "suite_key": suite_key,
                "rows": suite["rows"],
                "optimizer_steps": 0,
                "host_gate_samples": gate_samples,
                "generation_complete": True,
                "sentence_analysis_complete": True,
                "prediction_sha256": prediction_sha256,
                "claim_limit": contract["claim_limit"],
            },
        )
    checksum_path = output_root / "OUTPUT-SHA256SUMS"
    checksum_path.write_text(
        "".join(
            f"{digest}  {relative}\n"
            for relative, digest in tree_checksums(output_root)
        ),
        encoding="utf-8",
    )
    (output_root / "RUN_COMPLETE").write_text(
        "fixed utterance baseline and post-analysis complete\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()

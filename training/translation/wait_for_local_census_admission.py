#!/usr/bin/env python3
"""Wait for a contract-defined host window, then exec a local census driver."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from typing import Any


class AdmissionError(RuntimeError):
    """The admission contract or launch envelope is invalid."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--python", type=Path, required=True)
    parser.add_argument("--unit-name", required=True)
    parser.add_argument("--sample-log", type=Path, required=True)
    parser.add_argument("--poll-seconds", type=float, default=60.0)
    parser.add_argument("--max-wait-seconds", type=float, default=0.0)
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AdmissionError(f"expected JSON object: {path}")
    return value


def append_jsonl(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def parse_mem_available(path: Path) -> int:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("MemAvailable:"):
            fields = line.split()
            if len(fields) != 3 or fields[2] != "kB":
                break
            return int(fields[1]) * 1024
    raise AdmissionError(f"could not parse MemAvailable from {path}")


def parse_load(path: Path) -> tuple[float, float]:
    fields = path.read_text(encoding="utf-8").split()
    if len(fields) < 2:
        raise AdmissionError(f"could not parse load averages from {path}")
    return float(fields[0]), float(fields[1])


def parse_pressure_full_avg10(path: Path) -> float:
    for line in path.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] == "full":
            values = dict(field.split("=", 1) for field in fields[1:])
            return float(values["avg10"])
    raise AdmissionError(f"could not parse full avg10 from {path}")


def read_host_sample(
    thresholds: dict[str, Any], proc_root: Path = Path("/proc")
) -> dict[str, Any]:
    load_1m, load_5m = parse_load(proc_root / "loadavg")
    observed = {
        "mem_available_bytes": parse_mem_available(proc_root / "meminfo"),
        "load_1m": load_1m,
        "load_5m": load_5m,
        "io_full_avg10": parse_pressure_full_avg10(proc_root / "pressure" / "io"),
        "memory_full_avg10": parse_pressure_full_avg10(
            proc_root / "pressure" / "memory"
        ),
    }
    failed: list[str] = []
    if observed["mem_available_bytes"] < thresholds["minimum_mem_available_bytes"]:
        failed.append("mem_available_bytes")
    for metric in (
        "load_1m",
        "load_5m",
        "io_full_avg10",
        "memory_full_avg10",
    ):
        threshold = thresholds[f"maximum_{metric}"]
        if observed[metric] > threshold:
            failed.append(metric)
    return {
        "event": "HOST_SAMPLE",
        "sampled_at": utc_now(),
        "observed": observed,
        "clean": not failed,
        "failed_conditions": failed,
    }


def update_clean_evidence(
    evidence: list[tuple[float, dict[str, Any]]],
    sample: dict[str, Any],
    now_monotonic: float,
    required_samples: int,
    minimum_spacing_seconds: float,
) -> tuple[list[tuple[float, dict[str, Any]]], bool]:
    if not sample["clean"]:
        return [], False
    if not evidence or now_monotonic - evidence[-1][0] >= minimum_spacing_seconds:
        evidence = [*evidence, (now_monotonic, sample)]
    admitted = len(evidence) >= required_samples
    return evidence, admitted


def read_systemd_properties(unit_name: str) -> dict[str, str]:
    names = (
        "ActiveState",
        "SubState",
        "MainPID",
        "MemoryHigh",
        "MemoryMax",
        "MemorySwapMax",
        "CPUWeight",
        "IOWeight",
        "Nice",
        "IOSchedulingClass",
        "IOSchedulingPriority",
        "OOMPolicy",
        "KillMode",
    )
    result = subprocess.run(
        [
            "systemctl",
            "--user",
            "show",
            unit_name,
            f"--property={','.join(names)}",
            "--no-pager",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return dict(
        line.split("=", 1) for line in result.stdout.splitlines() if "=" in line
    )


def current_cgroup_root() -> Path:
    for line in Path("/proc/self/cgroup").read_text(encoding="utf-8").splitlines():
        hierarchy, controllers, relative = line.split(":", 2)
        if hierarchy == "0" and controllers == "":
            return Path("/sys/fs/cgroup") / relative.lstrip("/")
    raise AdmissionError("the launcher is not in a cgroup-v2 hierarchy")


def verify_launch_envelope(unit_name: str, envelope: dict[str, Any]) -> dict[str, Any]:
    properties = read_systemd_properties(unit_name)
    expected = {
        "ActiveState": "active",
        "MemoryHigh": str(envelope["memory_high_bytes"]),
        "MemoryMax": str(envelope["memory_max_bytes"]),
        "MemorySwapMax": str(envelope["memory_swap_max_bytes"]),
        "CPUWeight": str(envelope["cpu_weight"]),
        "IOWeight": str(envelope["io_weight"]),
        "Nice": str(envelope["nice"]),
        "IOSchedulingClass": str(envelope["ionice_class"]),
        "IOSchedulingPriority": str(envelope["ionice_priority"]),
        "OOMPolicy": envelope["oom_policy"],
        "KillMode": envelope["kill_mode"],
    }
    mismatches = {
        key: {"expected": value, "observed": properties.get(key)}
        for key, value in expected.items()
        if properties.get(key) != value
    }
    if properties.get("MainPID") != str(os.getpid()):
        mismatches["MainPID"] = {
            "expected": str(os.getpid()),
            "observed": properties.get("MainPID"),
        }

    cgroup = current_cgroup_root()
    cgroup_values = {
        "memory.high": (cgroup / "memory.high").read_text(encoding="utf-8").strip(),
        "memory.max": (cgroup / "memory.max").read_text(encoding="utf-8").strip(),
        "memory.swap.max": (cgroup / "memory.swap.max")
        .read_text(encoding="utf-8")
        .strip(),
        "cpu.max": (cgroup / "cpu.max").read_text(encoding="utf-8").strip(),
        "cpu.weight": (cgroup / "cpu.weight").read_text(encoding="utf-8").strip(),
    }
    cgroup_expected = {
        "memory.high": str(envelope["memory_high_bytes"]),
        "memory.max": str(envelope["memory_max_bytes"]),
        "memory.swap.max": str(envelope["memory_swap_max_bytes"]),
        "cpu.weight": str(envelope["cpu_weight"]),
    }
    for key, value in cgroup_expected.items():
        if cgroup_values[key] != value:
            mismatches[key] = {"expected": value, "observed": cgroup_values[key]}
    quota, period = cgroup_values["cpu.max"].split()
    expected_quota = round(float(period) * envelope["cpu_quota_percent"] / 100)
    if quota == "max" or int(quota) != expected_quota:
        mismatches["cpu.max"] = {
            "expected": f"{expected_quota} {period}",
            "observed": cgroup_values["cpu.max"],
        }
    if mismatches:
        raise AdmissionError(f"launch envelope mismatch: {mismatches}")
    return {
        "status": "PASS",
        "systemd_properties": properties,
        "cgroup_path": str(cgroup),
        "cgroup_values": cgroup_values,
    }


def census_command(
    contract: dict[str, Any],
    contract_path: Path,
    program_root: Path,
    workspace_root: Path,
    output_root: Path,
    python: Path,
    resume: bool,
) -> list[str]:
    driver = workspace_root / contract["driver"]["path"]
    command = [
        str(python),
        str(driver),
        "--contract",
        str(contract_path),
        "--program-root",
        str(program_root),
        "--workspace-root",
        str(workspace_root),
        "--output-root",
        str(output_root),
        "--python",
        str(python),
    ]
    if resume:
        command.append("--resume")
    return command


def main() -> None:
    args = parse_args()
    contract_path = args.contract.expanduser().resolve()
    program_root = args.program_root.expanduser().resolve()
    workspace_root = args.workspace_root.expanduser().resolve()
    output_root = args.output_root.expanduser().resolve()
    python = args.python.expanduser().resolve()
    sample_log = args.sample_log.expanduser().resolve()
    contract = read_json(contract_path)
    policy = contract.get("execution_policy", {})
    if policy.get("local_evaluation_authorized") is not True:
        raise AdmissionError("local evaluation is not authorized")
    if policy.get("hosted_transfer_authorized") is not False:
        raise AdmissionError("this launcher accepts only local-only contracts")
    thresholds = policy["host_admission"]
    envelope = policy["resource_envelope"]
    launch_envelope = verify_launch_envelope(args.unit_name, envelope)
    command = census_command(
        contract,
        contract_path,
        program_root,
        workspace_root,
        output_root,
        python,
        args.resume,
    )
    append_jsonl(
        sample_log,
        {
            "event": "WAITER_STARTED",
            "started_at": utc_now(),
            "pid": os.getpid(),
            "unit_name": args.unit_name,
            "contract_path": str(contract_path),
            "contract_sha256": sha256_file(contract_path),
            "launcher_path": str(Path(__file__).resolve()),
            "launcher_sha256": sha256_file(Path(__file__).resolve()),
            "command": command,
            "launch_envelope": launch_envelope,
        },
    )

    started = time.monotonic()
    evidence: list[tuple[float, dict[str, Any]]] = []
    while True:
        now = time.monotonic()
        sample = read_host_sample(thresholds)
        evidence, admitted = update_clean_evidence(
            evidence,
            sample,
            now,
            thresholds["required_clean_samples"],
            thresholds["minimum_spacing_seconds"],
        )
        sample["clean_evidence_count"] = len(evidence)
        sample["required_clean_samples"] = thresholds["required_clean_samples"]
        append_jsonl(sample_log, sample)
        if admitted:
            latest_age = time.monotonic() - evidence[-1][0]
            if latest_age > thresholds["maximum_latest_sample_age_seconds"]:
                raise AdmissionError("latest clean sample expired before launch")
            append_jsonl(
                sample_log,
                {
                    "event": "HOST_ADMITTED",
                    "admitted_at": utc_now(),
                    "clean_samples": [row for _, row in evidence],
                    "latest_sample_age_seconds": latest_age,
                    "exec_command": command,
                },
            )
            overlay = program_root / contract["runtime"]["overlay_path"]
            environment = os.environ.copy()
            prior_pythonpath = environment.get("PYTHONPATH")
            environment["PYTHONPATH"] = os.pathsep.join(
                part
                for part in (str(overlay), str(workspace_root), prior_pythonpath)
                if part
            )
            os.execve(str(python), command, environment)
        if args.max_wait_seconds > 0 and now - started >= args.max_wait_seconds:
            append_jsonl(
                sample_log,
                {"event": "WAIT_TIMEOUT", "timed_out_at": utc_now()},
            )
            raise SystemExit(75)
        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    main()

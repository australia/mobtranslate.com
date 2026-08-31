#!/usr/bin/env python3
"""Collect host admission evidence and run one hash-bound frozen stage."""

from __future__ import annotations

import argparse
from collections.abc import Iterable
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
from typing import Any


class ContractError(RuntimeError):
    """The admission contract, report, stage, or output is inconsistent."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: Any) -> str:
    payload = json.dumps(
        value, ensure_ascii=True, separators=(",", ":"), sort_keys=True
    ).encode()
    return hashlib.sha256(payload).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ContractError(f"expected JSON object: {path}")
    return value


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.chmod(0o664)
    os.replace(temporary, path)
    fsync_directory(path.parent)


def append_jsonl_fsync(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            handle.write(
                json.dumps(
                    value, ensure_ascii=True, separators=(",", ":"), sort_keys=True
                )
                + "\n"
            )
            handle.flush()
            os.fsync(handle.fileno())
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    fsync_directory(path.parent)


def parse_utc(value: Any, context: str) -> datetime:
    if not isinstance(value, str):
        raise ContractError(f"{context} must be an ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ContractError(f"invalid {context}: {value!r}") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ContractError(f"{context} must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def utc_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def resolve_inside(root: Path, relative: str, context: str) -> Path:
    if not relative or Path(relative).is_absolute():
        raise ContractError(f"{context} must be a non-empty relative path")
    root = root.resolve()
    path = (root / relative).resolve()
    if path != root and root not in path.parents:
        raise ContractError(f"{context} escapes program root: {relative}")
    return path


def verify_declared_file(root: Path, declaration: dict[str, Any], context: str) -> Path:
    relative = declaration.get("path")
    expected = declaration.get("sha256")
    if not isinstance(relative, str) or not isinstance(expected, str):
        raise ContractError(f"{context} requires path and sha256")
    path = resolve_inside(root, relative, f"{context}.path")
    if not path.is_file():
        raise ContractError(f"missing {context}: {path}")
    observed = sha256(path)
    if observed != expected:
        raise ContractError(
            f"{context} checksum mismatch: expected {expected}, observed {observed}"
        )
    return path


def verify_python(
    root: Path, declaration: dict[str, Any], supplied_python: Path
) -> Path:
    relative = declaration.get("path")
    expected = declaration.get("resolved_sha256")
    if not isinstance(relative, str) or not isinstance(expected, str):
        raise ContractError("python declaration requires path and resolved_sha256")
    relative_path = Path(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ContractError(
            "python.path must be a program-relative non-traversing path"
        )
    declared = root.resolve() / relative_path
    if not declared.is_file():
        raise ContractError(f"missing declared Python executable: {declared}")
    if declared.resolve() != supplied_python.resolve():
        raise ContractError(
            f"supplied Python differs from contract: {supplied_python} != {declared}"
        )
    observed = sha256(declared.resolve())
    if observed != expected:
        raise ContractError(
            f"Python executable checksum mismatch: expected {expected}, observed {observed}"
        )
    return declared


def verify_report_path(root: Path, contract: dict[str, Any], supplied: Path) -> Path:
    relative = contract.get("host_gate_report")
    if not isinstance(relative, str):
        raise ContractError("admission contract requires host_gate_report")
    declared = resolve_inside(root, relative, "host_gate_report")
    if declared != supplied.resolve():
        raise ContractError(
            f"host gate report path differs from contract: {supplied} != {declared}"
        )
    return declared


def verify_contract(
    contract_path: Path, program_root: Path, invoked_tool: Path
) -> tuple[dict[str, Any], str]:
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ContractError("unsupported admission contract schema_version")
    root = program_root.resolve()
    expected_root = contract.get("program_id")
    if not isinstance(expected_root, str) or not expected_root:
        raise ContractError("admission contract requires program_id")
    tool = contract.get("tool")
    if not isinstance(tool, dict):
        raise ContractError("admission contract requires tool declaration")
    declared_tool = verify_declared_file(root, tool, "tool")
    if declared_tool.resolve() != invoked_tool.resolve():
        raise ContractError(
            f"invoked tool path differs from contract: {invoked_tool} != {declared_tool}"
        )
    return contract, sha256(contract_path)


def read_meminfo(path: Path = Path("/proc/meminfo")) -> dict[str, int]:
    values: dict[str, int] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        name, separator, remainder = line.partition(":")
        if not separator:
            continue
        fields = remainder.split()
        if not fields:
            continue
        multiplier = 1024 if len(fields) > 1 and fields[1] == "kB" else 1
        values[name] = int(fields[0]) * multiplier
    required = {"MemAvailable", "SwapTotal", "SwapFree"}
    if not required <= values.keys():
        raise ContractError(f"meminfo lacks fields: {sorted(required - values.keys())}")
    return values


def read_loadavg(path: Path = Path("/proc/loadavg")) -> tuple[float, float, float]:
    fields = path.read_text(encoding="utf-8").split()
    if len(fields) < 3:
        raise ContractError("loadavg has fewer than three fields")
    return float(fields[0]), float(fields[1]), float(fields[2])


def read_cpu_times(path: Path = Path("/proc/stat")) -> tuple[int, int]:
    first = path.read_text(encoding="utf-8").splitlines()[0].split()
    if not first or first[0] != "cpu" or len(first) < 6:
        raise ContractError("/proc/stat lacks aggregate CPU counters")
    counters = [int(value) for value in first[1:]]
    total = sum(counters)
    idle = counters[3] + counters[4]
    return total, idle


def read_pressure_full_avg10(path: Path) -> float | None:
    if not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] == "full":
            for field in fields[1:]:
                name, separator, value = field.partition("=")
                if separator and name == "avg10":
                    return float(value)
    return None


def read_process_snapshot(proc_root: Path = Path("/proc")) -> dict[int, dict[str, Any]]:
    clock_ticks = os.sysconf("SC_CLK_TCK")
    page_size = os.sysconf("SC_PAGE_SIZE")
    result: dict[int, dict[str, Any]] = {}
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        try:
            stat_text = (entry / "stat").read_text(encoding="utf-8")
            close = stat_text.rfind(")")
            if close < 0:
                continue
            fields = stat_text[close + 2 :].split()
            cpu_ticks = int(fields[11]) + int(fields[12])
            start_ticks = int(fields[19])
            rss_bytes = int(fields[21]) * page_size
            io_values: dict[str, int] = {}
            io_path = entry / "io"
            if io_path.is_file():
                for line in io_path.read_text(encoding="utf-8").splitlines():
                    name, separator, value = line.partition(":")
                    if separator:
                        io_values[name] = int(value.strip())
            command_bytes = (entry / "cmdline").read_bytes()
            command = (
                command_bytes.replace(b"\0", b" ")
                .decode("utf-8", errors="replace")
                .strip()
            )
            if not command:
                command = stat_text[stat_text.find("(") + 1 : close]
            result[pid] = {
                "pid": pid,
                "start_ticks": start_ticks,
                "cpu_ticks": cpu_ticks,
                "read_bytes": io_values.get("read_bytes", 0),
                "write_bytes": io_values.get("write_bytes", 0),
                "rss_bytes": rss_bytes,
                "command": command,
                "clock_ticks": clock_ticks,
            }
        except (OSError, ValueError):
            continue
    return result


def process_activity(
    before: dict[int, dict[str, Any]],
    after: dict[int, dict[str, Any]],
    elapsed_seconds: float,
    excluded_pids: Iterable[int] = (),
) -> list[dict[str, Any]]:
    excluded = set(excluded_pids)
    rows: list[dict[str, Any]] = []
    for pid, end in after.items():
        start = before.get(pid)
        if pid in excluded or start is None:
            continue
        if start["start_ticks"] != end["start_ticks"]:
            continue
        ticks = max(0, int(end["cpu_ticks"]) - int(start["cpu_ticks"]))
        io_bytes = max(
            0,
            int(end["read_bytes"])
            + int(end["write_bytes"])
            - int(start["read_bytes"])
            - int(start["write_bytes"]),
        )
        rows.append(
            {
                "pid": pid,
                "command": end["command"],
                "rss_bytes": end["rss_bytes"],
                "cpu_cores": ticks / int(end["clock_ticks"]) / elapsed_seconds,
                "io_bytes_per_second": io_bytes / elapsed_seconds,
            }
        )
    return sorted(
        rows,
        key=lambda row: (
            max(float(row["cpu_cores"]), float(row["io_bytes_per_second"]) / 1e8),
            int(row["rss_bytes"]),
        ),
        reverse=True,
    )


def evaluate_sample(sample: dict[str, Any], policy: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if int(sample["mem_available_bytes"]) < int(policy["minimum_mem_available_bytes"]):
        failures.append("memory")
    if float(sample["load_1m"]) > float(policy["maximum_load_1m"]):
        failures.append("load_1m")
    if float(sample["load_5m"]) > float(policy["maximum_load_5m"]):
        failures.append("load_5m")
    if sample.get("heavy_competing_job") is not False:
        failures.append("heavy_competing_job")
    return failures


def capture_sample(
    policy: dict[str, Any],
    detection: dict[str, Any],
    sleep: Any = time.sleep,
    monotonic: Any = time.monotonic,
) -> dict[str, Any]:
    observation_seconds = float(detection["observation_seconds"])
    if observation_seconds <= 0:
        raise ContractError("observation_seconds must be positive")
    total_start, idle_start = read_cpu_times()
    processes_start = read_process_snapshot()
    started = monotonic()
    sleep(observation_seconds)
    elapsed = monotonic() - started
    if elapsed < observation_seconds * 0.9:
        raise ContractError("host observation interval ended too early")
    total_end, idle_end = read_cpu_times()
    processes_end = read_process_snapshot()
    activity = process_activity(
        processes_start, processes_end, elapsed, excluded_pids={os.getpid()}
    )
    total_delta = total_end - total_start
    idle_delta = idle_end - idle_start
    busy_fraction = (total_delta - idle_delta) / total_delta if total_delta > 0 else 1.0
    meminfo = read_meminfo()
    load_1m, load_5m, load_15m = read_loadavg()
    io_pressure = read_pressure_full_avg10(Path("/proc/pressure/io"))
    maximum_process_cpu = max(
        (float(row["cpu_cores"]) for row in activity), default=0.0
    )
    maximum_process_io = max(
        (float(row["io_bytes_per_second"]) for row in activity), default=0.0
    )
    heavy_reasons: list[str] = []
    if maximum_process_cpu >= float(detection["maximum_process_cpu_cores"]):
        heavy_reasons.append("process_cpu")
    if maximum_process_io >= float(detection["maximum_process_io_bytes_per_second"]):
        heavy_reasons.append("process_io")
    if busy_fraction >= float(detection["maximum_system_cpu_busy_fraction"]):
        heavy_reasons.append("system_cpu")
    if io_pressure is not None and io_pressure >= float(
        detection["maximum_io_pressure_full_avg10"]
    ):
        heavy_reasons.append("io_pressure")
    sample = {
        "sampled_at_utc": utc_text(datetime.now(timezone.utc)),
        "observation_seconds": elapsed,
        "mem_available_bytes": meminfo["MemAvailable"],
        "swap_used_bytes": meminfo["SwapTotal"] - meminfo["SwapFree"],
        "load_1m": load_1m,
        "load_5m": load_5m,
        "load_15m": load_15m,
        "system_cpu_busy_fraction": busy_fraction,
        "io_pressure_full_avg10": io_pressure,
        "maximum_process_cpu_cores": maximum_process_cpu,
        "maximum_process_io_bytes_per_second": maximum_process_io,
        "heavy_competing_job": bool(heavy_reasons),
        "heavy_competing_job_reasons": heavy_reasons,
        "top_processes": activity[: int(detection.get("top_processes", 20))],
    }
    failures = evaluate_sample(sample, policy)
    sample["result"] = "PASS" if not failures else "FAIL"
    sample["failure_reasons"] = failures
    return sample


def append_sample_report(
    report_path: Path,
    contract_path: Path,
    contract_sha256: str,
    contract: dict[str, Any],
    tool_path: Path,
    sample: dict[str, Any],
) -> dict[str, Any]:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = report_path.with_name(f"{report_path.name}.lock")
    with lock_path.open("a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            if report_path.exists():
                report = load_json(report_path)
                if report.get("schema_version") != 1:
                    raise ContractError("unsupported host report schema_version")
                if report.get("admission_contract_sha256") != contract_sha256:
                    raise ContractError("host report admission contract changed")
                if report.get("tool_sha256") != sha256(tool_path):
                    raise ContractError("host report tool identity changed")
                samples = report.get("samples")
                if not isinstance(samples, list):
                    raise ContractError("host report samples must be a list")
                previous_hash = sha256(report_path)
            else:
                report = {
                    "schema_version": 1,
                    "program_id": contract["program_id"],
                    "admission_contract_path": str(contract_path.resolve()),
                    "admission_contract_sha256": contract_sha256,
                    "tool_path": str(tool_path.resolve()),
                    "tool_sha256": sha256(tool_path),
                    "samples": [],
                }
                samples = report["samples"]
                previous_hash = None
            sample = dict(sample)
            sample["prior_report_sha256"] = previous_hash
            sample["sample_sequence"] = len(samples) + 1
            timestamp = str(sample["sampled_at_utc"]).replace("-", "").replace(":", "")
            sample_relative = Path("samples") / (
                f"{sample['sample_sequence']:06d}-{timestamp}.json"
            )
            sample_path = report_path.parent / sample_relative
            if sample_path.exists():
                raise FileExistsError(
                    f"refusing existing sample artifact: {sample_path}"
                )
            write_json_atomic(sample_path, sample)
            sample["sample_artifact"] = sample_relative.as_posix()
            sample["sample_artifact_sha256"] = sha256(sample_path)
            samples.append(sample)
            write_json_atomic(report_path, report)
            return report
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def verify_sample_artifact(report_path: Path, sample: dict[str, Any]) -> None:
    relative = sample.get("sample_artifact")
    expected = sample.get("sample_artifact_sha256")
    if not isinstance(relative, str) or not isinstance(expected, str):
        raise ContractError("host sample lacks immutable artifact identity")
    path = resolve_inside(report_path.parent, relative, "sample_artifact")
    if not path.is_file() or sha256(path) != expected:
        raise ContractError(f"host sample artifact verification failed: {path}")
    payload = load_json(path)
    report_payload = {
        key: value
        for key, value in sample.items()
        if key not in {"sample_artifact", "sample_artifact_sha256"}
    }
    if payload != report_payload:
        raise ContractError(f"host sample payload differs from artifact: {path}")


def verify_gate_report(
    report: dict[str, Any],
    contract_sha256: str,
    tool_sha256: str,
    policy: dict[str, Any],
    now: datetime | None = None,
    report_path: Path | None = None,
) -> list[dict[str, Any]]:
    if report.get("admission_contract_sha256") != contract_sha256:
        raise ContractError("host report contract checksum mismatch")
    if report.get("tool_sha256") != tool_sha256:
        raise ContractError("host report tool checksum mismatch")
    samples = report.get("samples")
    minimum_samples = int(policy["minimum_passing_samples"])
    if not isinstance(samples, list) or len(samples) < minimum_samples:
        raise ContractError(f"host gate requires at least {minimum_samples} samples")
    selected = samples[-minimum_samples:]
    times: list[datetime] = []
    for index, sample in enumerate(selected, start=1):
        if not isinstance(sample, dict):
            raise ContractError(f"host sample {index} must be an object")
        failures = evaluate_sample(sample, policy)
        if failures or sample.get("result") != "PASS":
            raise ContractError(
                f"host sample {index} is not passing: {failures or sample.get('result')}"
            )
        times.append(parse_utc(sample.get("sampled_at_utc"), f"host sample {index}"))
        if report_path is not None:
            verify_sample_artifact(report_path, sample)
    sequences = [sample.get("sample_sequence") for sample in selected]
    if all(isinstance(value, int) for value in sequences):
        expected_sequences = list(
            range(int(sequences[0]), int(sequences[0]) + len(sequences))
        )
        if sequences != expected_sequences:
            raise ContractError("selected host sample sequence is not contiguous")
    if times != sorted(times) or len(set(times)) != len(times):
        raise ContractError("selected host samples are not strictly chronological")
    minimum_interval = int(policy["minimum_sample_interval_seconds"])
    for earlier, later in zip(times, times[1:]):
        if (later - earlier).total_seconds() < minimum_interval:
            raise ContractError("selected host samples are too close together")
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    age = (current - times[-1]).total_seconds()
    if age < -float(policy.get("maximum_clock_skew_seconds", 5)):
        raise ContractError("latest host sample is in the future")
    if age > int(policy["maximum_latest_sample_age_seconds"]):
        raise ContractError("latest host sample is stale")
    return selected


def substitute_argv(
    values: list[Any], root: Path, python: Path, report_path: Path | None
) -> list[str]:
    substitutions = {
        "{program_root}": str(root.resolve()),
        "{python}": str(python.absolute()),
        "{host_gate_report}": str(report_path.resolve()) if report_path else "",
    }
    result: list[str] = []
    for raw in values:
        if not isinstance(raw, str) or not raw:
            raise ContractError("stage argv entries must be non-empty strings")
        value = raw
        for token, replacement in substitutions.items():
            value = value.replace(token, replacement)
        if "{" in value or "}" in value:
            raise ContractError(f"unresolved stage argv token: {value}")
        if not value:
            raise ContractError("stage argv resolved to an empty string")
        result.append(value)
    return result


def verify_checksum_manifest(root: Path, manifest: Path) -> int:
    count = 0
    for line_number, line in enumerate(
        manifest.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        digest, separator, relative = line.partition("  ")
        if not separator or len(digest) != 64:
            raise ContractError(f"invalid checksum line {manifest}:{line_number}")
        path = resolve_inside(root, relative, f"checksum line {line_number}")
        if not path.is_file() or sha256(path) != digest:
            raise ContractError(f"checksum verification failed: {path}")
        count += 1
    if count == 0:
        raise ContractError(f"empty checksum manifest: {manifest}")
    return count


def verify_stage_complete(root: Path, stage: dict[str, Any]) -> dict[str, Any]:
    output_root = resolve_inside(root, stage["output_root"], "stage.output_root")
    marker = output_root / str(stage.get("completion_marker", "RUN_COMPLETE"))
    checksum = output_root / str(stage.get("checksum_manifest", "OUTPUT-SHA256SUMS"))
    if not marker.is_file():
        raise ContractError(f"missing stage completion marker: {marker}")
    if not checksum.is_file():
        raise ContractError(f"missing stage checksum manifest: {checksum}")
    return {
        "output_root": str(output_root),
        "completion_marker_sha256": sha256(marker),
        "checksum_manifest_sha256": sha256(checksum),
        "verified_checksum_records": verify_checksum_manifest(output_root, checksum),
    }


def find_stage(contract: dict[str, Any], stage_id: str) -> dict[str, Any]:
    stages = contract.get("stages")
    if not isinstance(stages, list):
        raise ContractError("admission contract stages must be a list")
    matches = [stage for stage in stages if stage.get("stage_id") == stage_id]
    if len(matches) != 1:
        raise ContractError(f"expected exactly one stage {stage_id!r}")
    return matches[0]


def verify_stage_inputs(root: Path, stage: dict[str, Any]) -> None:
    declarations = stage.get("required_files")
    if not isinstance(declarations, list) or not declarations:
        raise ContractError("stage requires a non-empty required_files list")
    for index, declaration in enumerate(declarations):
        if not isinstance(declaration, dict):
            raise ContractError("stage required_files entries must be objects")
        verify_declared_file(root, declaration, f"required_files[{index}]")


def run_with_timeout(argv: list[str], cwd: Path, timeout_seconds: int) -> None:
    process = subprocess.Popen(argv, cwd=cwd, start_new_session=True)
    try:
        return_code = process.wait(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as error:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=60)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        raise ContractError(f"stage exceeded {timeout_seconds} seconds") from error
    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, argv)


def run_captured_with_timeout(
    argv: list[str], cwd: Path, timeout_seconds: int
) -> dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    started = time.monotonic()
    process = subprocess.Popen(
        argv,
        cwd=cwd,
        start_new_session=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=60)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
    finished_at = datetime.now(timezone.utc)
    return {
        "started_at_utc": utc_text(started_at),
        "finished_at_utc": utc_text(finished_at),
        "elapsed_seconds": time.monotonic() - started,
        "timeout_seconds": timeout_seconds,
        "timed_out": timed_out,
        "return_code": process.returncode,
        "stdout": stdout,
        "stdout_sha256": hashlib.sha256(stdout.encode()).hexdigest(),
        "stderr": stderr,
        "stderr_sha256": hashlib.sha256(stderr.encode()).hexdigest(),
    }


def write_preflight_evidence(
    root: Path,
    contract: dict[str, Any],
    contract_path: Path,
    contract_hash: str,
    invoked_tool: Path,
    stage: dict[str, Any],
    python: Path,
    argv: list[str],
    execution: dict[str, Any],
) -> tuple[Path, str]:
    relative_root = contract.get("preflight_evidence_root")
    if not isinstance(relative_root, str):
        raise ContractError("admission contract requires preflight_evidence_root")
    evidence_root = resolve_inside(root, relative_root, "preflight_evidence_root")
    stage_id = stage.get("stage_id")
    if not isinstance(stage_id, str) or not stage_id.replace("_", "").isalnum():
        raise ContractError(
            "stage_id must contain only letters, numbers, and underscores"
        )
    timestamp = str(execution["finished_at_utc"]).replace("-", "").replace(":", "")
    evidence_path = evidence_root / f"{stage_id}-{timestamp}.json"
    if evidence_path.exists():
        raise FileExistsError(f"refusing existing preflight evidence: {evidence_path}")
    required_files = stage.get("required_files")
    if not isinstance(required_files, list):
        raise ContractError("stage required_files must be a list")
    status = (
        "PASS"
        if execution.get("return_code") == 0 and execution.get("timed_out") is False
        else "FAIL"
    )
    record = {
        "schema_version": 1,
        "record_kind": "zero_step_stage_preflight",
        "status": status,
        "claim_limit": (
            "This record proves only that the hash-bound preflight command completed. "
            "It is not a model evaluation, training run, synthetic pair, or linguistic claim."
        ),
        "program_id": contract["program_id"],
        "stage_id": stage_id,
        "evaluation_rows": stage.get("evaluation_rows"),
        "admission_contract": {
            "path": str(contract_path),
            "sha256": contract_hash,
        },
        "tool": {"path": str(invoked_tool), "sha256": sha256(invoked_tool)},
        "python": {
            "path": str(python.absolute()),
            "resolved_path": str(python.resolve()),
            "resolved_sha256": sha256(python.resolve()),
        },
        "stage_contract_sha256": canonical_sha256(stage),
        "required_files": required_files,
        "argv": argv,
        "execution": execution,
    }
    write_json_atomic(evidence_path, record)
    return evidence_path, sha256(evidence_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admission-contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    subparsers = parser.add_subparsers(dest="action", required=True)
    sample = subparsers.add_parser("sample")
    sample.add_argument("--report", type=Path, required=True)
    preflight = subparsers.add_parser("preflight")
    preflight.add_argument("--stage", required=True)
    preflight.add_argument("--python", type=Path, required=True)
    run = subparsers.add_parser("run")
    run.add_argument("--stage", required=True)
    run.add_argument("--python", type=Path, required=True)
    run.add_argument("--host-gate-report", type=Path, required=True)
    run.add_argument("--resume", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    invoked_tool = Path(__file__).resolve()
    root = args.program_root.resolve()
    contract_path = args.admission_contract.resolve()
    contract, contract_hash = verify_contract(contract_path, root, invoked_tool)
    policy = contract.get("host_gate_policy")
    if not isinstance(policy, dict):
        raise ContractError("admission contract requires host_gate_policy")

    if args.action == "sample":
        detection = contract.get("heavy_job_detection")
        if not isinstance(detection, dict):
            raise ContractError("admission contract requires heavy_job_detection")
        report_path = verify_report_path(root, contract, args.report)
        sample = capture_sample(policy, detection)
        report = append_sample_report(
            report_path,
            contract_path,
            contract_hash,
            contract,
            invoked_tool,
            sample,
        )
        print(
            json.dumps(
                {
                    "status": sample["result"],
                    "report": str(report_path),
                    "report_sha256": sha256(report_path),
                    "sample": report["samples"][-1],
                },
                indent=2,
                sort_keys=True,
            )
        )
        if sample["result"] != "PASS":
            raise SystemExit(2)
        return

    stage = find_stage(contract, args.stage)
    verify_stage_inputs(root, stage)
    python_declaration = contract.get("python")
    if not isinstance(python_declaration, dict):
        raise ContractError("admission contract requires Python declaration")
    python = verify_python(root, python_declaration, args.python)

    if args.action == "preflight":
        argv = substitute_argv(stage["preflight_argv"], root, python, None)
        execution = run_captured_with_timeout(
            argv, root, int(stage["preflight_timeout_seconds"])
        )
        evidence_path, evidence_hash = write_preflight_evidence(
            root,
            contract,
            contract_path,
            contract_hash,
            invoked_tool,
            stage,
            python,
            argv,
            execution,
        )
        status = (
            "PASS"
            if execution["return_code"] == 0 and execution["timed_out"] is False
            else "FAIL"
        )
        print(
            json.dumps(
                {
                    "status": status,
                    "stage": args.stage,
                    "preflight_evidence": str(evidence_path),
                    "preflight_evidence_sha256": evidence_hash,
                    "return_code": execution["return_code"],
                    "timed_out": execution["timed_out"],
                },
                indent=2,
                sort_keys=True,
            )
        )
        if status != "PASS":
            raise SystemExit(
                124 if execution["timed_out"] else execution["return_code"]
            )
        return

    report_path = verify_report_path(root, contract, args.host_gate_report)
    report = load_json(report_path)
    samples = verify_gate_report(
        report,
        contract_hash,
        sha256(invoked_tool),
        policy,
        report_path=report_path,
    )
    for previous_id in stage.get("requires_completed_stages", []):
        previous = find_stage(contract, str(previous_id))
        verify_stage_complete(root, previous)
    output_root = resolve_inside(root, stage["output_root"], "stage.output_root")
    if output_root.exists() and not args.resume:
        raise FileExistsError(f"refusing existing stage output: {output_root}")
    argv = substitute_argv(stage["run_argv"], root, python, report_path)
    if args.resume:
        resume_flag = stage.get("resume_flag")
        if not isinstance(resume_flag, str) or not resume_flag:
            raise ContractError("stage does not declare a resume flag")
        argv.append(resume_flag)
    admission_log = resolve_inside(root, contract["admission_log"], "admission_log")
    admission = {
        "record_kind": "admission",
        "recorded_at_utc": utc_text(datetime.now(timezone.utc)),
        "program_id": contract["program_id"],
        "stage_id": args.stage,
        "stage_contract_sha256": canonical_sha256(stage),
        "admission_contract_sha256": contract_hash,
        "tool_sha256": sha256(invoked_tool),
        "host_gate_report_path": str(report_path),
        "host_gate_report_sha256": sha256(report_path),
        "selected_samples": samples,
        "resume": args.resume,
        "argv": argv,
    }
    append_jsonl_fsync(admission_log, admission)
    try:
        run_with_timeout(argv, root, int(stage["maximum_wall_seconds"]))
        completion = verify_stage_complete(root, stage)
    except BaseException as error:
        append_jsonl_fsync(
            admission_log,
            {
                "record_kind": "terminal",
                "recorded_at_utc": utc_text(datetime.now(timezone.utc)),
                "stage_id": args.stage,
                "status": "failed",
                "error_type": type(error).__name__,
                "error": str(error),
            },
        )
        raise
    append_jsonl_fsync(
        admission_log,
        {
            "record_kind": "terminal",
            "recorded_at_utc": utc_text(datetime.now(timezone.utc)),
            "stage_id": args.stage,
            "status": "complete",
            "completion": completion,
        },
    )
    print(
        json.dumps(
            {"status": "PASS", "stage": args.stage, "completion": completion},
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

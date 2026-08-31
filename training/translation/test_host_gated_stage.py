from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

from training.translation.host_gated_stage import (
    ContractError,
    append_sample_report,
    canonical_sha256,
    evaluate_sample,
    parse_utc,
    process_activity,
    sha256,
    substitute_argv,
    verify_checksum_manifest,
    verify_gate_report,
    verify_stage_complete,
)


POLICY = {
    "minimum_mem_available_bytes": 12_884_901_888,
    "maximum_load_1m": 4.0,
    "maximum_load_5m": 4.0,
    "minimum_passing_samples": 2,
    "minimum_sample_interval_seconds": 300,
    "maximum_latest_sample_age_seconds": 120,
    "maximum_clock_skew_seconds": 5,
}


def sample(timestamp: str, **updates: object) -> dict[str, object]:
    value: dict[str, object] = {
        "sampled_at_utc": timestamp,
        "mem_available_bytes": 13_000_000_000,
        "load_1m": 3.0,
        "load_5m": 3.0,
        "heavy_competing_job": False,
        "result": "PASS",
    }
    value.update(updates)
    return value


def report(samples: list[dict[str, object]]) -> dict[str, object]:
    return {
        "admission_contract_sha256": "contract",
        "tool_sha256": "tool",
        "samples": samples,
    }


def test_parse_utc_rejects_naive_timestamp() -> None:
    with pytest.raises(ContractError, match="UTC offset"):
        parse_utc("2026-07-24T01:00:00", "sample")


def test_verify_gate_report_accepts_fresh_two_sample_sequence() -> None:
    samples = [
        sample("2026-07-24T01:00:00Z"),
        sample("2026-07-24T01:05:00Z"),
    ]
    assert (
        verify_gate_report(
            report(samples),
            "contract",
            "tool",
            POLICY,
            now=datetime(2026, 7, 24, 1, 6, tzinfo=timezone.utc),
        )
        == samples
    )


@pytest.mark.parametrize(
    ("samples", "now", "message"),
    [
        (
            [sample("2026-07-24T01:00:00Z"), sample("2026-07-24T01:04:59Z")],
            datetime(2026, 7, 24, 1, 5, tzinfo=timezone.utc),
            "too close",
        ),
        (
            [sample("2026-07-24T01:00:00Z"), sample("2026-07-24T01:05:00Z")],
            datetime(2026, 7, 24, 1, 8, tzinfo=timezone.utc),
            "stale",
        ),
        (
            [
                sample("2026-07-24T01:00:00Z"),
                sample(
                    "2026-07-24T01:05:00Z",
                    heavy_competing_job=True,
                    result="FAIL",
                ),
            ],
            datetime(2026, 7, 24, 1, 5, tzinfo=timezone.utc),
            "not passing",
        ),
        (
            [
                sample("2026-07-24T01:00:00Z"),
                sample(
                    "2026-07-24T01:05:00Z",
                    mem_available_bytes=12_000_000_000,
                    result="FAIL",
                ),
            ],
            datetime(2026, 7, 24, 1, 5, tzinfo=timezone.utc),
            "not passing",
        ),
    ],
)
def test_verify_gate_report_rejects_invalid_sequences(
    samples: list[dict[str, object]], now: datetime, message: str
) -> None:
    with pytest.raises(ContractError, match=message):
        verify_gate_report(report(samples), "contract", "tool", POLICY, now=now)


def test_evaluate_sample_reports_each_failed_gate() -> None:
    failures = evaluate_sample(
        sample(
            "2026-07-24T01:00:00Z",
            mem_available_bytes=1,
            load_1m=5,
            load_5m=6,
            heavy_competing_job=True,
        ),
        POLICY,
    )
    assert failures == ["memory", "load_1m", "load_5m", "heavy_competing_job"]


def test_process_activity_requires_stable_pid_identity() -> None:
    before = {
        1: {
            "start_ticks": 10,
            "cpu_ticks": 100,
            "read_bytes": 1000,
            "write_bytes": 500,
        },
        2: {
            "start_ticks": 10,
            "cpu_ticks": 100,
            "read_bytes": 0,
            "write_bytes": 0,
        },
    }
    after = {
        1: {
            "start_ticks": 10,
            "cpu_ticks": 300,
            "read_bytes": 3000,
            "write_bytes": 1500,
            "rss_bytes": 4096,
            "command": "worker",
            "clock_ticks": 100,
        },
        2: {
            "start_ticks": 11,
            "cpu_ticks": 999,
            "read_bytes": 999,
            "write_bytes": 999,
            "rss_bytes": 1,
            "command": "reused-pid",
            "clock_ticks": 100,
        },
    }
    rows = process_activity(before, after, elapsed_seconds=2)
    assert rows == [
        {
            "pid": 1,
            "command": "worker",
            "rss_bytes": 4096,
            "cpu_cores": 1.0,
            "io_bytes_per_second": 1500.0,
        }
    ]


def test_substitute_argv_rejects_unknown_tokens(tmp_path: Path) -> None:
    with pytest.raises(ContractError, match="unresolved"):
        substitute_argv(["{python}", "{unknown}"], tmp_path, tmp_path / "python", None)


def test_substitute_argv_preserves_declared_python_symlink(tmp_path: Path) -> None:
    python_link = tmp_path / "venv-python"
    python_link.symlink_to(Path(sys.executable).resolve())
    argv = substitute_argv(["{python}"], tmp_path, python_link, None)
    assert argv == [str(python_link.absolute())]


def test_append_sample_report_preserves_prefix_and_chains_hash(tmp_path: Path) -> None:
    tool = tmp_path / "tool.py"
    tool.write_text("print('tool')\n", encoding="utf-8")
    contract_path = tmp_path / "contract.json"
    contract = {"program_id": "example"}
    contract_path.write_text(json.dumps(contract), encoding="utf-8")
    report_path = tmp_path / "report.json"
    first = sample("2026-07-24T01:00:00Z")
    append_sample_report(report_path, contract_path, "contract", contract, tool, first)
    first_report_hash = sha256(report_path)
    first_saved = json.loads(report_path.read_text(encoding="utf-8"))["samples"][0]
    append_sample_report(
        report_path,
        contract_path,
        "contract",
        contract,
        tool,
        sample("2026-07-24T01:05:00Z"),
    )
    saved = json.loads(report_path.read_text(encoding="utf-8"))["samples"]
    assert saved[0] == first_saved
    assert saved[1]["prior_report_sha256"] == first_report_hash
    assert saved[1]["sample_sequence"] == 2
    assert (tmp_path / saved[0]["sample_artifact"]).is_file()
    assert (tmp_path / saved[1]["sample_artifact"]).is_file()


def test_verify_gate_report_rejects_changed_sample_artifact(tmp_path: Path) -> None:
    tool = tmp_path / "tool.py"
    tool.write_text("print('tool')\n", encoding="utf-8")
    contract_path = tmp_path / "contract.json"
    contract = {"program_id": "example"}
    contract_path.write_text(json.dumps(contract), encoding="utf-8")
    report_path = tmp_path / "report.json"
    append_sample_report(
        report_path,
        contract_path,
        "contract",
        contract,
        tool,
        sample("2026-07-24T01:00:00Z"),
    )
    append_sample_report(
        report_path,
        contract_path,
        "contract",
        contract,
        tool,
        sample("2026-07-24T01:05:00Z"),
    )
    value = json.loads(report_path.read_text(encoding="utf-8"))
    artifact = tmp_path / value["samples"][1]["sample_artifact"]
    artifact.write_text("{}\n", encoding="utf-8")
    with pytest.raises(ContractError, match="artifact verification failed"):
        verify_gate_report(
            value,
            "contract",
            sha256(tool),
            POLICY,
            now=datetime(2026, 7, 24, 1, 6, tzinfo=timezone.utc),
            report_path=report_path,
        )


def test_checksum_manifest_rejects_traversal(tmp_path: Path) -> None:
    manifest = tmp_path / "SHA256SUMS"
    manifest.write_text(f"{'0' * 64}  ../outside\n", encoding="utf-8")
    with pytest.raises(ContractError, match="escapes"):
        verify_checksum_manifest(tmp_path, manifest)


def test_verify_stage_complete_checks_every_bound_file(tmp_path: Path) -> None:
    output = tmp_path / "output"
    output.mkdir()
    result = output / "result.json"
    result.write_text("{}\n", encoding="utf-8")
    marker = output / "RUN_COMPLETE"
    marker.write_text("complete\n", encoding="utf-8")
    checksums = output / "OUTPUT-SHA256SUMS"
    checksums.write_text(f"{sha256(result)}  result.json\n", encoding="utf-8")
    stage = {"output_root": "output"}
    verified = verify_stage_complete(tmp_path, stage)
    assert verified["verified_checksum_records"] == 1
    assert verified["completion_marker_sha256"] == sha256(marker)


def test_canonical_hash_ignores_object_key_order() -> None:
    assert canonical_sha256({"b": 2, "a": 1}) == canonical_sha256({"a": 1, "b": 2})


def test_cli_preflight_and_hash_bound_stage_run(tmp_path: Path) -> None:
    source_tool = Path(__file__).with_name("host_gated_stage.py")
    tool = tmp_path / "host_gated_stage.py"
    shutil.copyfile(source_tool, tool)
    python_link = tmp_path / "python"
    python_link.symlink_to(Path(sys.executable).resolve())
    dummy = tmp_path / "dummy_stage.py"
    dummy.write_text(
        """\
import hashlib
from pathlib import Path
import sys

if sys.argv[1] == "preflight":
    print("preflight stdout")
    print("preflight stderr", file=sys.stderr)
    raise SystemExit(0)
if sys.argv[1] != "run":
    raise SystemExit(2)
root = Path(sys.argv[2])
root.mkdir(parents=True)
result = root / "result.json"
result.write_text("{}\\n", encoding="utf-8")
digest = hashlib.sha256(result.read_bytes()).hexdigest()
(root / "OUTPUT-SHA256SUMS").write_text(
    f"{digest}  result.json\\n", encoding="utf-8"
)
(root / "RUN_COMPLETE").write_text("complete\\n", encoding="utf-8")
""",
        encoding="utf-8",
    )
    contract = {
        "schema_version": 1,
        "program_id": "fixture",
        "tool": {"path": tool.name, "sha256": sha256(tool)},
        "python": {
            "path": python_link.name,
            "resolved_sha256": sha256(Path(sys.executable).resolve()),
        },
        "host_gate_report": "host-report.json",
        "admission_log": "admissions.jsonl",
        "preflight_evidence_root": "preflights",
        "host_gate_policy": POLICY,
        "stages": [
            {
                "stage_id": "fixture",
                "output_root": "output",
                "required_files": [{"path": dummy.name, "sha256": sha256(dummy)}],
                "preflight_argv": ["{python}", dummy.name, "preflight"],
                "preflight_timeout_seconds": 10,
                "run_argv": [
                    "{python}",
                    dummy.name,
                    "run",
                    "{program_root}/output",
                ],
                "maximum_wall_seconds": 10,
                "requires_completed_stages": [],
            }
        ],
    }
    contract_path = tmp_path / "contract.json"
    contract_path.write_text(json.dumps(contract), encoding="utf-8")
    contract_hash = sha256(contract_path)
    report_path = tmp_path / "host-report.json"
    now = datetime.now(timezone.utc)
    append_sample_report(
        report_path,
        contract_path,
        contract_hash,
        contract,
        tool,
        sample((now - timedelta(seconds=310)).isoformat()),
    )
    append_sample_report(
        report_path,
        contract_path,
        contract_hash,
        contract,
        tool,
        sample(now.isoformat()),
    )
    common = [
        str(python_link),
        str(tool),
        "--admission-contract",
        str(contract_path),
        "--program-root",
        str(tmp_path),
    ]
    preflight = subprocess.run(
        [*common, "preflight", "--stage", "fixture", "--python", str(python_link)],
        check=True,
        capture_output=True,
        text=True,
    )
    preflight_result = json.loads(preflight.stdout)
    assert preflight_result["status"] == "PASS"
    evidence_path = Path(preflight_result["preflight_evidence"])
    assert sha256(evidence_path) == preflight_result["preflight_evidence_sha256"]
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    assert evidence["status"] == "PASS"
    assert evidence["execution"]["stdout"] == "preflight stdout\n"
    assert evidence["execution"]["stderr"] == "preflight stderr\n"
    assert evidence["execution"]["timed_out"] is False
    assert evidence["required_files"] == contract["stages"][0]["required_files"]
    execution = subprocess.run(
        [
            *common,
            "run",
            "--stage",
            "fixture",
            "--python",
            str(python_link),
            "--host-gate-report",
            str(report_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    assert json.loads(execution.stdout)["completion"]["verified_checksum_records"] == 1
    admissions = [
        json.loads(line)
        for line in (tmp_path / "admissions.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert [row["record_kind"] for row in admissions] == ["admission", "terminal"]
    assert admissions[-1]["status"] == "complete"

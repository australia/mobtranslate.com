#!/usr/bin/env python3
"""Run the local-only Wajarri Stage-I full lexical census."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
from typing import Any


class ContractError(ValueError):
    """The local census contract or one of its bound artifacts is invalid."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--python", type=Path, default=Path(sys.executable))
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--preflight-only", action="store_true")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ContractError(f"expected a JSON object: {path}")
    return value


def write_json_atomic(path: Path, value: Any) -> None:
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


def count_nonblank_lines(path: Path) -> int:
    with path.open(encoding="utf-8") as handle:
        return sum(bool(line.strip()) for line in handle)


def resolve(root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def directory_identity(path: Path) -> dict[str, Any]:
    files = {
        str(candidate.relative_to(path)): {
            "bytes": candidate.stat().st_size,
            "sha256": sha256_file(candidate),
        }
        for candidate in sorted(path.rglob("*"))
        if candidate.is_file()
    }
    payload = json.dumps(
        files, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return {
        "algorithm": "sha256(canonical_json_relative_path_to_bytes_and_sha256)",
        "aggregate_sha256": hashlib.sha256(payload).hexdigest(),
        "file_count": len(files),
        "files": files,
        "total_bytes": sum(row["bytes"] for row in files.values()),
    }


def require_sha(path: Path, expected: str, label: str) -> str:
    if not path.is_file():
        raise FileNotFoundError(path)
    observed = sha256_file(path)
    if observed != expected:
        raise ContractError(
            f"{label} SHA-256 mismatch: expected {expected}, observed {observed}"
        )
    return observed


def verify_checksum_inventory(root: Path) -> dict[str, Any]:
    inventory = root / "OUTPUT-SHA256SUMS"
    if not inventory.is_file():
        raise ContractError(f"missing checksum inventory: {inventory}")
    listed: set[str] = set()
    total_bytes = 0
    for line_number, line in enumerate(
        inventory.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line:
            continue
        digest, separator, relative = line.partition("  ")
        if not separator or len(digest) != 64 or relative in listed:
            raise ContractError(f"invalid checksum line {inventory}:{line_number}")
        candidate = Path(relative)
        if candidate.is_absolute() or ".." in candidate.parts:
            raise ContractError(f"unsafe checksum path: {relative}")
        path = root / candidate
        require_sha(path, digest, f"output {relative}")
        listed.add(relative)
        total_bytes += path.stat().st_size
    observed = {
        str(path.relative_to(root))
        for path in root.rglob("*")
        if path.is_file() and path != inventory
    }
    if listed != observed:
        raise ContractError(
            "output inventory membership drift: "
            f"missing={sorted(observed - listed)}, extra={sorted(listed - observed)}"
        )
    return {
        "sha256": sha256_file(inventory),
        "files": len(listed),
        "bytes": total_bytes,
    }


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def verify_contract(
    contract: dict[str, Any], program_root: Path, workspace_root: Path
) -> dict[str, Any]:
    if contract.get("schema_version") != 1:
        raise ContractError("unsupported contract schema")
    if (
        contract.get("execution_policy", {}).get("hosted_transfer_authorized")
        is not False
    ):
        raise ContractError("the full census must remain local-only")
    if (
        contract.get("evaluation", {}).get("paired_disabled_adapter_baseline")
        is not False
    ):
        raise ContractError("this contract must be an explicit active-only census")
    if contract.get("evaluation", {}).get("require_merge_equivalence") is not False:
        raise ContractError("merge equivalence belongs to the bound hosted run")

    evaluator = contract["evaluator"]
    evaluator_path = resolve(workspace_root, evaluator["path"])
    require_sha(evaluator_path, evaluator["sha256"], "evaluator")
    driver = contract["driver"]
    driver_path = resolve(workspace_root, driver["path"])
    require_sha(driver_path, driver["sha256"], "driver")
    if driver_path != Path(__file__).resolve():
        raise ContractError("the invoked driver is not the contract-bound driver")
    matrix = contract["parent_matrix"]
    require_sha(resolve(program_root, matrix["path"]), matrix["sha256"], "matrix")

    base = contract["raw_base_model"]
    base_root = resolve(program_root, base["path"])
    require_sha(base_root / "config.json", base["config_sha256"], "base config")
    require_sha(
        base_root / base["weights_name"], base["weights_sha256"], "base weights"
    )

    suites: dict[str, dict[str, Any]] = {}
    total_rows = 0
    for suite in contract["suites"]:
        path = resolve(program_root, suite["path"])
        require_sha(path, suite["sha256"], f"suite {suite['name']}")
        rows = count_nonblank_lines(path)
        if rows != suite["rows"]:
            raise ContractError(f"suite row-count drift: {suite['name']}")
        suites[suite["name"]] = {"path": str(path), "rows": rows}
        total_rows += rows
    if total_rows != contract["evaluation"]["required_rows"]:
        raise ContractError("full-census row total drift")

    ledger = contract["exposure_ledger"]
    ledger_path = resolve(program_root, ledger["path"])
    require_sha(ledger_path, ledger["sha256"], "exposure ledger")
    population_rows = sum(
        1
        for line in ledger_path.read_text(encoding="utf-8").splitlines()
        if line and json.loads(line).get("population") == ledger["population"]
    )
    if population_rows != total_rows:
        raise ContractError("exposure-ledger population does not cover the census")

    arms: list[dict[str, Any]] = []
    observed_names: set[str] = set()
    for arm in contract["arms"]:
        name = arm["arm"]
        if name in observed_names or arm["checkpoint_step"] != 400:
            raise ContractError("arm inventory is duplicated or not at step 400")
        observed_names.add(name)
        adapter = resolve(program_root, arm["adapter_path"])
        identity = directory_identity(adapter)
        if identity["aggregate_sha256"] != arm["adapter_aggregate_sha256"]:
            raise ContractError(f"adapter identity drift: {name}")
        training_manifest_path = resolve(program_root, arm["training_manifest_path"])
        require_sha(
            training_manifest_path,
            arm["training_manifest_sha256"],
            f"training manifest {name}",
        )
        training_manifest = read_json(training_manifest_path)
        if training_manifest.get("trainer_state", {}).get("global_step") != 400:
            raise ContractError(f"training step drift: {name}")
        control_root = resolve(program_root, arm["control_contract_path"])
        require_sha(
            control_root / "MANIFEST.json",
            arm["control_manifest_sha256"],
            f"control manifest {name}",
        )
        hosted_metrics_path = resolve(program_root, arm["hosted_metrics_path"])
        require_sha(
            hosted_metrics_path,
            arm["hosted_metrics_sha256"],
            f"hosted metrics {name}",
        )
        hosted_metrics = read_json(hosted_metrics_path)
        absolute = hosted_metrics.get("absolute_quality_gates") or {}
        if (
            hosted_metrics.get("status") != "PASS"
            or absolute.get("zero_blank_outputs") is not True
            or absolute.get("zero_repeated_output_token_4grams") is not True
        ):
            raise ContractError(f"step-400 hosted quality gate failed: {name}")
        arm_result_path = resolve(program_root, arm["hosted_arm_result_path"])
        require_sha(
            arm_result_path,
            arm["hosted_arm_result_sha256"],
            f"hosted arm result {name}",
        )
        arm_result = read_json(arm_result_path)
        checkpoint = arm_result.get("hosted_evaluations", {}).get("400", {})
        if (
            checkpoint.get("integrity_valid") is not True
            or checkpoint.get("quality_eligible") is not True
        ):
            raise ContractError(f"step-400 checkpoint is not quality eligible: {name}")
        arms.append(
            {
                "arm": name,
                "adapter_path": str(adapter),
                "adapter_identity": identity,
                "training_manifest_path": str(training_manifest_path),
                "control_contract_path": str(control_root),
                "control_manifest_sha256": arm["control_manifest_sha256"],
                "hosted_metrics_path": str(hosted_metrics_path),
            }
        )
    if observed_names != {"I0", "I1", "I2"}:
        raise ContractError("the census requires exactly I0, I1, and I2")

    runtime = contract["runtime"]
    overlay = resolve(program_root, runtime["overlay_path"])
    if not overlay.is_dir():
        raise FileNotFoundError(overlay)
    if str(overlay) not in sys.path:
        sys.path.insert(0, str(overlay))
    observed_runtime = {
        "python": platform.python_version(),
        "packages": {name: package_version(name) for name in runtime["packages"]},
    }
    if observed_runtime != {
        "python": runtime["python"],
        "packages": runtime["packages"],
    }:
        raise ContractError(f"runtime drift: {observed_runtime}")
    return {
        "status": "PASS",
        "verified_at": utc_now(),
        "evaluator": {"path": str(evaluator_path), "sha256": evaluator["sha256"]},
        "raw_base_model": str(base_root),
        "suites": suites,
        "exposure_ledger": {
            "path": str(ledger_path),
            "population": ledger["population"],
            "rows": population_rows,
        },
        "arms": arms,
        "runtime": observed_runtime,
        "runtime_overlay": str(overlay),
    }


def evaluator_command(
    python: Path,
    preflight: dict[str, Any],
    contract: dict[str, Any],
    arm: dict[str, Any],
    output_dir: Path,
) -> list[str]:
    evaluation = contract["evaluation"]
    command = [
        str(python),
        "-m",
        "training.translation.evaluate_nllb_screen_checkpoint",
        "--raw-base-model",
        preflight["raw_base_model"],
        "--control-contract",
        arm["control_contract_path"],
        "--expected-control-contract-sha256",
        arm["control_manifest_sha256"],
        "--adapter-dir",
        arm["adapter_path"],
        "--training-manifest",
        arm["training_manifest_path"],
        "--expected-training-global-step",
        "400",
    ]
    for token in contract["expected_trainable_tokens"]:
        command.extend(("--expected-trainable-token", token))
    for name, suite in preflight["suites"].items():
        command.extend(("--suite", f"{name}={suite['path']}"))
    command.extend(
        (
            "--exposure-ledger",
            preflight["exposure_ledger"]["path"],
            "--exposure-population",
            preflight["exposure_ledger"]["population"],
            "--output-dir",
            str(output_dir),
            "--progress-jsonl",
            str(
                output_dir.parents[2]
                / "logs"
                / f"evaluate-{arm['arm']}-step400.progress.jsonl"
            ),
            "--direction",
            evaluation["direction"],
            "--source-lang",
            evaluation["source_lang"],
            "--target-lang",
            evaluation["target_lang"],
            "--batch-size",
            str(evaluation["batch_size"]),
            "--max-source-length",
            str(evaluation["max_source_length"]),
            "--max-new-tokens",
            str(evaluation["max_new_tokens"]),
            "--dtype",
            evaluation["dtype"],
            "--seed",
            str(evaluation["seed"]),
            "--no-require-merge-equivalence",
            "--no-paired-disabled-adapter-baseline",
        )
    )
    return command


def hard_gate(metrics: dict[str, Any], required_rows: int) -> bool:
    overall = metrics["overall_diagnostics"]
    absolute = metrics["absolute_quality_gates"]
    return (
        overall["rows"] == required_rows
        and overall["blank_output_count"] == 0
        and overall["repeated_output_token_4gram_count"] == 0
        and absolute["zero_blank_outputs"] is True
        and absolute["zero_repeated_output_token_4grams"] is True
    )


def apply_selection(arms: dict[str, dict[str, Any]]) -> dict[str, Any]:
    baseline = arms["I0"]
    if not baseline["hard_gate_pass"]:
        return {
            "status": "UNRESOLVED_BASELINE_FAILED_HARD_GATE",
            "selected_arm": None,
            "qualified_challengers": [],
        }
    qualified: list[str] = []
    for name in ("I1", "I2"):
        candidate = arms[name]
        primary_gain = baseline["prompt_group_gcer"] - candidate["prompt_group_gcer"]
        exact_gain = candidate["prompt_group_exact"] - baseline["prompt_group_exact"]
        no_material_gcer_loss = (
            candidate["prompt_group_gcer"] - baseline["prompt_group_gcer"] <= 0.002
        )
        synthetic_noninferior = (
            candidate["synthetic_chrf"] >= baseline["synthetic_chrf"] - 1.0
        )
        candidate["challenge_audit"] = {
            "prompt_group_gcer_improvement": primary_gain,
            "prompt_group_exact_gain": exact_gain,
            "prompt_group_gcer_loss_no_more_than_0_002": no_material_gcer_loss,
            "synthetic_chrf_noninferior_within_1_0": synthetic_noninferior,
        }
        if (
            candidate["hard_gate_pass"]
            and synthetic_noninferior
            and (primary_gain >= 0.005 or (exact_gain >= 5 and no_material_gcer_loss))
        ):
            qualified.append(name)
    if not qualified:
        return {
            "status": "RETAIN_I0_INITIALIZATION_UNRESOLVED_AT_SCREENING_RESOLUTION",
            "selected_arm": "I0",
            "qualified_challengers": [],
        }
    selected = min(
        qualified,
        key=lambda name: (
            arms[name]["prompt_group_gcer"],
            arms[name]["source_context_gcer"],
            -arms[name]["prompt_group_exact"],
            -arms[name]["synthetic_chrf"],
        ),
    )
    return {
        "status": "CHALLENGER_SELECTED_UNDER_FROZEN_STAGE_I_RULE",
        "selected_arm": selected,
        "qualified_challengers": qualified,
    }


def summarize_and_select(
    output_root: Path, contract: dict[str, Any], preflight: dict[str, Any]
) -> dict[str, Any]:
    summaries: dict[str, dict[str, Any]] = {}
    for arm in preflight["arms"]:
        name = arm["arm"]
        metrics = read_json(output_root / "arms" / name / "step-400" / "METRICS.json")
        hosted = read_json(Path(arm["hosted_metrics_path"]))
        summaries[name] = {
            "hard_gate_pass": hard_gate(
                metrics, contract["evaluation"]["required_rows"]
            ),
            "overall_exact": metrics["overall_diagnostics"]["normalized_exact_count"],
            "overall_gcer": metrics["overall_diagnostics"][
                "mean_grapheme_cluster_error_rate"
            ],
            "prompt_group_exact": metrics["by_suite"]["prompt_group"][
                "normalized_exact_count"
            ],
            "prompt_group_gcer": metrics["by_suite"]["prompt_group"][
                "mean_grapheme_cluster_error_rate"
            ],
            "source_context_exact": metrics["by_suite"]["source_context"][
                "normalized_exact_count"
            ],
            "source_context_gcer": metrics["by_suite"]["source_context"][
                "mean_grapheme_cluster_error_rate"
            ],
            "synthetic_exact": hosted["by_suite"][
                "synthetic_compositional_development"
            ]["normalized_exact_count"],
            "synthetic_chrf": hosted["by_suite"]["synthetic_compositional_development"][
                "chrf_plus_plus_first_declared_reference"
            ],
            "by_exposure_class": metrics["by_exposure_class"],
        }
    selection = apply_selection(summaries)
    return {
        "schema_version": 1,
        "status": "PASS_COMPLETE_LOCAL_STAGE_I_CENSUS",
        "completed_at": utc_now(),
        "claim_scope": contract["claim_scope"],
        "arms": summaries,
        "selection": selection,
        "selection_rule": contract["selection_rule"],
        "independent_natural_final_test_opened": False,
    }


def write_root_inventory(output_root: Path) -> dict[str, Any]:
    inventory = output_root / "OUTPUT-SHA256SUMS"
    files = sorted(
        path for path in output_root.rglob("*") if path.is_file() and path != inventory
    )
    inventory.write_text(
        "".join(
            f"{sha256_file(path)}  {path.relative_to(output_root)}\n" for path in files
        ),
        encoding="utf-8",
    )
    return verify_checksum_inventory(output_root)


def main() -> None:
    args = parse_args()
    contract_path = args.contract.expanduser().resolve()
    program_root = args.program_root.expanduser().resolve()
    workspace_root = args.workspace_root.expanduser().resolve()
    output_root = args.output_root.expanduser().resolve()
    python = args.python.expanduser().resolve()
    contract = read_json(contract_path)
    contract_sha256 = sha256_file(contract_path)
    preflight = verify_contract(contract, program_root, workspace_root)
    preflight.update(
        {
            "contract": {"path": str(contract_path), "sha256": contract_sha256},
            "driver": {
                "path": str(Path(__file__).resolve()),
                "sha256": sha256_file(Path(__file__).resolve()),
            },
            "python_executable": str(python),
        }
    )

    if output_root.exists() and not args.resume:
        raise FileExistsError(f"refusing existing output root: {output_root}")
    output_root.mkdir(parents=True, exist_ok=True)
    snapshot = output_root / "CONTRACT.json"
    if snapshot.exists():
        if sha256_file(snapshot) != contract_sha256:
            raise ContractError("resume contract drift")
    else:
        snapshot.write_bytes(contract_path.read_bytes())
    write_json_atomic(output_root / "PREFLIGHT.json", preflight)
    if args.preflight_only:
        print(json.dumps(preflight, ensure_ascii=False, indent=2, sort_keys=True))
        return

    overlay = resolve(program_root, contract["runtime"]["overlay_path"])
    environment = os.environ.copy()
    environment["PYTHONPATH"] = os.pathsep.join((str(overlay), str(workspace_root)))
    progress: list[dict[str, Any]] = []
    for arm in preflight["arms"]:
        name = arm["arm"]
        evaluation_root = output_root / "arms" / name / "step-400"
        if evaluation_root.exists():
            output_identity = verify_checksum_inventory(evaluation_root)
            status = "RESUMED_VERIFIED_COMPLETE"
        else:
            command = evaluator_command(
                python, preflight, contract, arm, evaluation_root
            )
            log_path = output_root / "logs" / f"evaluate-{name}-step400.log"
            log_path.parent.mkdir(parents=True, exist_ok=True)
            with log_path.open("a", encoding="utf-8") as log:
                log.write(
                    json.dumps(
                        {
                            "event": "START",
                            "at": utc_now(),
                            "arm": name,
                            "command": command,
                        },
                        ensure_ascii=False,
                        sort_keys=True,
                    )
                    + "\n"
                )
                log.flush()
                result = subprocess.run(
                    command,
                    cwd=workspace_root,
                    env=environment,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    text=True,
                    check=False,
                )
                log.write(
                    json.dumps(
                        {
                            "event": "EXIT",
                            "at": utc_now(),
                            "arm": name,
                            "returncode": result.returncode,
                        },
                        sort_keys=True,
                    )
                    + "\n"
                )
            if result.returncode != 0:
                write_json_atomic(
                    output_root / "RUN-FAILED.json",
                    {
                        "status": "FAIL",
                        "failed_at": utc_now(),
                        "arm": name,
                        "returncode": result.returncode,
                        "log": str(log_path),
                    },
                )
                raise SystemExit(result.returncode)
            output_identity = verify_checksum_inventory(evaluation_root)
            status = "PASS_NEW_EVALUATION"
        metrics = read_json(evaluation_root / "METRICS.json")
        if (
            metrics["overall_diagnostics"]["rows"]
            != contract["evaluation"]["required_rows"]
        ):
            raise ContractError(f"incomplete census for {name}")
        progress.append(
            {
                "arm": name,
                "checkpoint_step": 400,
                "status": status,
                "output": output_identity,
                "hard_gate_pass": hard_gate(
                    metrics, contract["evaluation"]["required_rows"]
                ),
                "completed_at": utc_now(),
            }
        )
        write_json_atomic(
            output_root / "PROGRESS.json",
            {"status": "RUNNING", "evaluations": progress},
        )

    result = summarize_and_select(output_root, contract, preflight)
    write_json_atomic(output_root / "RESULT.json", result)
    write_json_atomic(
        output_root / "RUN-COMPLETE.json",
        {
            "status": "PASS",
            "completed_at": utc_now(),
            "evaluations": len(progress),
            "rows_per_evaluation": contract["evaluation"]["required_rows"],
            "selected_arm": result["selection"]["selected_arm"],
            "claim_scope": contract["claim_scope"],
        },
    )
    identity = write_root_inventory(output_root)
    print(json.dumps({"result": result, "output": identity}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

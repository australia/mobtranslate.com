#!/usr/bin/env python3
"""Run all suites in a frozen NLLB lexical-census contract."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any


TOKENIZER_BUNDLE_NAMES = (
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
)


class ContractError(ValueError):
    """The frozen execution contract is incomplete or inconsistent."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_sha256(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def write_json_atomic(path: Path, value: Any, *, overwrite: bool = False) -> None:
    if path.exists() and not overwrite:
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


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ContractError(f"expected a JSON object: {path}")
    return value


def stable_manifest_identity(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: stable_manifest_identity(child)
            for key, child in sorted(value.items())
            if key not in {"created_at", "verified_at"}
        }
    if isinstance(value, list):
        return [stable_manifest_identity(child) for child in value]
    return value


def require_string(value: dict[str, Any], key: str, context: str) -> str:
    result = value.get(key)
    if not isinstance(result, str) or not result.strip():
        raise ContractError(f"{context}.{key} must be a non-empty string")
    return result


def resolve_path(root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def tokenizer_bundle_identity(root: Path) -> dict[str, Any]:
    paths = [root / name for name in TOKENIZER_BUNDLE_NAMES if (root / name).is_file()]
    names = {path.name for path in paths}
    if "tokenizer_config.json" not in names:
        raise FileNotFoundError(root / "tokenizer_config.json")
    if not ({"tokenizer.json", "sentencepiece.bpe.model"} & names):
        raise FileNotFoundError(f"no tokenizer payload under {root}")
    digest = hashlib.sha256()
    files: dict[str, str] = {}
    for path in paths:
        file_sha256 = sha256(path)
        files[path.name] = file_sha256
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(file_sha256))
    return {
        "algorithm": "sha256(relative_name_nul_file_sha256_bytes)",
        "sha256": digest.hexdigest(),
        "files": files,
    }


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def runtime_manifest() -> dict[str, Any]:
    try:
        import torch
    except ImportError:
        torch = None
    return {
        "created_at": utc_now(),
        "python": platform.python_version(),
        "python_executable": sys.executable,
        "platform": platform.platform(),
        "packages": {
            name: package_version(name)
            for name in (
                "torch",
                "transformers",
                "tokenizers",
                "sentencepiece",
                "regex",
                "safetensors",
                "peft",
                "protobuf",
            )
        },
        "cuda_available": bool(torch is not None and torch.cuda.is_available()),
        "cuda": None if torch is None else torch.version.cuda,
        "gpu": (
            torch.cuda.get_device_name(0)
            if torch is not None and torch.cuda.is_available()
            else None
        ),
        "cublas_workspace_config": os.environ.get("CUBLAS_WORKSPACE_CONFIG"),
        "nvidia_tf32_override": os.environ.get("NVIDIA_TF32_OVERRIDE"),
    }


def verify_runtime(actual: dict[str, Any], expected: dict[str, Any]) -> None:
    for field in ("python", "cuda", "gpu"):
        wanted = expected.get(field)
        if wanted is not None and actual.get(field) != wanted:
            raise ContractError(
                f"runtime {field} mismatch: expected {wanted!r}, observed {actual.get(field)!r}"
            )
    if expected.get("require_cuda") is True and not actual["cuda_available"]:
        raise ContractError("the selected runtime profile requires CUDA")
    expected_packages = expected.get("packages") or {}
    if not isinstance(expected_packages, dict):
        raise ContractError("runtime profile packages must be an object")
    for name, wanted in expected_packages.items():
        observed = actual["packages"].get(name)
        if observed != wanted:
            raise ContractError(
                f"runtime package {name} mismatch: expected {wanted!r}, observed {observed!r}"
            )


def authorize_execution(contract: dict[str, Any], execution: str) -> None:
    policy = contract.get("execution_policy")
    if not isinstance(policy, dict):
        raise ContractError("execution_policy must be an object")
    field = "local_evaluation_authorized" if execution == "local" else "hosted_transfer_authorized"
    if policy.get(field) is not True:
        decision = policy.get("rights_decision_artifact") or "(not recorded)"
        raise ContractError(
            f"{field}=true is required for {execution} execution; rights decision: {decision}"
        )


def verify_contract_inputs(
    contract: dict[str, Any], program_root: Path
) -> dict[str, Any]:
    policy = contract["execution_policy"]
    model = contract.get("model")
    evaluator = contract.get("evaluator")
    runner = contract.get("runner")
    decoder = contract.get("decoder")
    task = contract.get("task")
    suites = contract.get("suites")
    if not isinstance(model, dict) or not isinstance(evaluator, dict) or not isinstance(runner, dict):
        raise ContractError("model, evaluator, and runner must be objects")
    if not isinstance(decoder, dict):
        raise ContractError("decoder must be an object")
    if not isinstance(task, dict):
        raise ContractError("task must be an object")
    if not isinstance(suites, list) or not suites:
        raise ContractError("suites must be a non-empty array")

    rights_path = resolve_path(
        program_root,
        require_string(policy, "rights_decision_artifact", "execution_policy"),
    )
    rights_sha256 = sha256(rights_path)
    expected_rights_sha256 = require_string(
        policy, "rights_decision_sha256", "execution_policy"
    )
    if rights_sha256 != expected_rights_sha256:
        raise ContractError(
            "rights decision hash mismatch: "
            f"expected {expected_rights_sha256}, observed {rights_sha256}"
        )

    model_dir = resolve_path(program_root, require_string(model, "path", "model"))
    weights = model_dir / "model.safetensors"
    expected_weights = require_string(model, "weights_sha256", "model")
    observed_weights = sha256(weights)
    if observed_weights != expected_weights:
        raise ContractError(
            f"model weights hash mismatch: expected {expected_weights}, observed {observed_weights}"
        )
    tokenizer = tokenizer_bundle_identity(model_dir)
    expected_tokenizer = require_string(model, "tokenizer_bundle_sha256", "model")
    if tokenizer["sha256"] != expected_tokenizer:
        raise ContractError(
            "tokenizer bundle hash mismatch: "
            f"expected {expected_tokenizer}, observed {tokenizer['sha256']}"
        )
    model_manifest_path = resolve_path(
        program_root, require_string(model, "manifest_path", "model")
    )
    model_manifest_sha256 = sha256(model_manifest_path)
    expected_model_manifest = require_string(model, "manifest_sha256", "model")
    if model_manifest_sha256 != expected_model_manifest:
        raise ContractError(
            "model manifest hash mismatch: "
            f"expected {expected_model_manifest}, observed {model_manifest_sha256}"
        )
    model_manifest = load_json(model_manifest_path)
    if model_manifest.get("artifact_id") != model.get("artifact_id"):
        raise ContractError("model manifest artifact_id does not match the contract")
    manifest_weights = (
        (model_manifest.get("artifact_files") or {}).get("model.safetensors") or {}
    ).get("sha256")
    if manifest_weights != observed_weights:
        raise ContractError("model manifest does not bind the contracted model weights")

    decoder_policy_path = resolve_path(
        program_root, require_string(decoder, "policy_path", "decoder")
    )
    decoder_policy_sha256 = sha256(decoder_policy_path)
    expected_decoder_policy = require_string(decoder, "policy_sha256", "decoder")
    if decoder_policy_sha256 != expected_decoder_policy:
        raise ContractError(
            "decoder policy hash mismatch: "
            f"expected {expected_decoder_policy}, observed {decoder_policy_sha256}"
        )
    decoder_policy = load_json(decoder_policy_path)
    if decoder_policy.get("policy_id") != decoder.get("policy_id"):
        raise ContractError("decoder policy_id does not match the contract")
    if decoder_policy.get("source_language_token") != task.get("source_token"):
        raise ContractError("decoder policy source token does not match the task")
    if decoder_policy.get("target_language_token") != task.get("target_token"):
        raise ContractError("decoder policy target token does not match the task")
    if decoder_policy.get("forced_bos_token_id") != model.get("target_token_id"):
        raise ContractError("decoder policy target BOS does not match the model contract")
    policy_generation = decoder_policy.get("generation")
    if not isinstance(policy_generation, dict):
        raise ContractError("decoder policy generation must be an object")
    for field in (
        "do_sample",
        "num_beams",
        "max_source_length",
        "max_new_tokens",
        "length_penalty",
        "repetition_penalty",
        "no_repeat_ngram_size",
    ):
        if policy_generation.get(field) != decoder.get(field):
            raise ContractError(f"decoder policy {field} does not match the contract")
    expected_tokenizer_implementation = "fast" if decoder.get("use_fast_tokenizer") else "slow"
    if decoder_policy.get("tokenizer_implementation") != expected_tokenizer_implementation:
        raise ContractError("decoder policy tokenizer implementation does not match the contract")

    evaluator_path = resolve_path(
        program_root, require_string(evaluator, "path", "evaluator")
    )
    evaluator_sha256 = sha256(evaluator_path)
    expected_evaluator = require_string(evaluator, "sha256", "evaluator")
    if evaluator_sha256 != expected_evaluator:
        raise ContractError(
            f"evaluator hash mismatch: expected {expected_evaluator}, observed {evaluator_sha256}"
        )

    runner_path = resolve_path(
        program_root, require_string(runner, "path", "runner")
    )
    runner_sha256 = sha256(runner_path)
    expected_runner = require_string(runner, "sha256", "runner")
    if runner_sha256 != expected_runner:
        raise ContractError(
            f"runner hash mismatch: expected {expected_runner}, observed {runner_sha256}"
        )
    invoked_runner_path = Path(__file__).resolve()
    invoked_runner_sha256 = sha256(invoked_runner_path)
    if invoked_runner_sha256 != expected_runner:
        raise ContractError(
            "invoked runner hash mismatch: "
            f"expected {expected_runner}, observed {invoked_runner_sha256} at {invoked_runner_path}"
        )

    verified_suites: list[dict[str, Any]] = []
    suite_keys: set[str] = set()
    for index, suite in enumerate(suites):
        if not isinstance(suite, dict):
            raise ContractError(f"suites[{index}] must be an object")
        key = require_string(suite, "suite_key", f"suites[{index}]")
        if key in suite_keys:
            raise ContractError(f"duplicate suite key: {key}")
        suite_keys.add(key)
        path = resolve_path(
            program_root, require_string(suite, "path", f"suites[{index}]")
        )
        expected_sha256 = require_string(suite, "sha256", f"suites[{index}]")
        observed_sha256 = sha256(path)
        if observed_sha256 != expected_sha256:
            raise ContractError(
                f"suite {key} hash mismatch: expected {expected_sha256}, observed {observed_sha256}"
            )
        rows = suite.get("rows")
        if not isinstance(rows, int) or rows < 1:
            raise ContractError(f"suite {key} rows must be a positive integer")
        with path.open(encoding="utf-8") as handle:
            observed_rows = sum(1 for line in handle if line.strip())
        if observed_rows != rows:
            raise ContractError(
                f"suite {key} row mismatch: expected {rows}, observed {observed_rows}"
            )
        verified_suites.append(
            {
                "suite_key": key,
                "path": str(path),
                "sha256": observed_sha256,
                "rows": observed_rows,
                "input_field": require_string(
                    suite, "input_field", f"suites[{index}]"
                ),
            }
        )

    return {
        "verified_at": utc_now(),
        "contract_canonical_sha256": canonical_json_sha256(contract),
        "rights_decision": {
            "path": str(rights_path),
            "sha256": rights_sha256,
        },
        "model": {
            "path": str(model_dir),
            "weights_sha256": observed_weights,
            "tokenizer_bundle": tokenizer,
            "manifest_path": str(model_manifest_path),
            "manifest_sha256": model_manifest_sha256,
        },
        "evaluator": {"path": str(evaluator_path), "sha256": evaluator_sha256},
        "runner": {
            "declared_path": str(runner_path),
            "invoked_path": str(invoked_runner_path),
            "sha256": runner_sha256,
        },
        "decoder": {
            "contract": decoder,
            "policy_path": str(decoder_policy_path),
            "policy_sha256": decoder_policy_sha256,
        },
        "suites": verified_suites,
    }


class NvidiaMonitor:
    def __init__(self, path: Path, interval_seconds: float = 5.0) -> None:
        self.path = path
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if shutil.which("nvidia-smi") is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            "timestamp,gpu_util_pct,memory_used_mib,memory_total_mib,power_w,temperature_c\n",
            encoding="utf-8",
        )
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        query = (
            "utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu"
        )
        while not self._stop.is_set():
            result = subprocess.run(
                [
                    "nvidia-smi",
                    f"--query-gpu={query}",
                    "--format=csv,noheader,nounits",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                with self.path.open("a", encoding="utf-8") as handle:
                    for line in result.stdout.splitlines():
                        handle.write(f"{utc_now()},{line}\n")
            self._stop.wait(self.interval_seconds)

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=self.interval_seconds + 2)


def evaluator_command(
    *,
    python: Path,
    preflight: dict[str, Any],
    contract: dict[str, Any],
    suite: dict[str, Any],
    output_dir: Path,
    require_cuda: bool,
    resume: bool,
) -> list[str]:
    model = contract["model"]
    decoder = contract["decoder"]
    command = [
        str(python),
        preflight["evaluator"]["path"],
        "--model-dir",
        preflight["model"]["path"],
        "--benchmark",
        suite["path"],
        "--output-dir",
        str(output_dir),
        "--expected-model-sha256",
        model["weights_sha256"],
        "--expected-tokenizer-bundle-sha256",
        model["tokenizer_bundle_sha256"],
        "--expected-benchmark-sha256",
        suite["sha256"],
        "--expected-rows",
        str(suite["rows"]),
        "--expected-source-token-id",
        str(model["source_token_id"]),
        "--expected-target-token-id",
        str(model["target_token_id"]),
        "--expect-output-head-alias",
        model["output_head_alias"],
        "--input-field",
        suite["input_field"],
        "--direction",
        contract["task"]["direction"],
        "--source-lang",
        contract["task"]["source_token"],
        "--target-lang",
        contract["task"]["target_token"],
        "--batch-size",
        str(decoder["batch_size"]),
        "--max-source-length",
        str(decoder["max_source_length"]),
        "--max-new-tokens",
        str(decoder["max_new_tokens"]),
        "--num-beams",
        str(decoder["num_beams"]),
        "--no-repeat-ngram-size",
        str(decoder["no_repeat_ngram_size"]),
        "--repetition-penalty",
        str(decoder["repetition_penalty"]),
        "--length-penalty",
        str(decoder["length_penalty"]),
        "--dtype",
        decoder["dtype"],
        "--seed",
        str(decoder["seed"]),
        "--progress-every-batches",
        str(contract["runtime"]["progress_every_batches"]),
        "--resource-sample-every-batches",
        str(contract["runtime"]["resource_sample_every_batches"]),
    ]
    command.append("--use-fast-tokenizer" if decoder["use_fast_tokenizer"] else "--no-use-fast-tokenizer")
    if require_cuda:
        command.append("--require-cuda")
    if resume and (output_dir / "predictions.jsonl").exists():
        command.append("--resume")
    return command


def verify_suite_completion(path: Path, expected_rows: int) -> dict[str, Any]:
    required = (
        "input-manifest.json",
        "environment-manifest.json",
        "predictions.jsonl",
        "metric-report.json",
        "failure-slice-report.json",
        "resource-samples.json",
        "resource-samples.jsonl",
        "OUTPUT-SHA256SUMS",
    )
    for name in required:
        if not (path / name).is_file():
            raise RuntimeError(f"suite output is incomplete: {path / name}")
    with (path / "predictions.jsonl").open(encoding="utf-8") as handle:
        rows = sum(1 for line in handle if line.strip())
    if rows != expected_rows:
        raise RuntimeError(
            f"suite output row mismatch at {path}: expected {expected_rows}, observed {rows}"
        )
    checksummed_names: set[str] = set()
    for line in (path / "OUTPUT-SHA256SUMS").read_text(encoding="utf-8").splitlines():
        expected, name = line.split(None, 1)
        relative = name.strip()
        if relative in checksummed_names:
            raise RuntimeError(f"duplicate suite output checksum entry: {relative}")
        target = path / relative
        if target.parent != path or not target.is_file():
            raise RuntimeError(f"invalid suite output checksum path: {relative}")
        checksummed_names.add(relative)
        observed = sha256(target)
        if observed != expected:
            raise RuntimeError(
                f"suite output hash mismatch for {target}: expected {expected}, observed {observed}"
            )
    expected_checksummed = set(required) - {"OUTPUT-SHA256SUMS"}
    if checksummed_names != expected_checksummed:
        raise RuntimeError(
            "suite checksum inventory is not exact: "
            f"expected={sorted(expected_checksummed)}, observed={sorted(checksummed_names)}"
        )
    return load_json(path / "metric-report.json")


def tree_checksums(root: Path, excluded: set[str]) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    for path in sorted(candidate for candidate in root.rglob("*") if candidate.is_file()):
        relative = path.relative_to(root).as_posix()
        if relative in excluded:
            continue
        results.append((sha256(path), relative))
    return results


def verify_completed_run(output_root: Path) -> dict[str, Any]:
    """Verify and return an already sealed run without changing its bytes."""
    marker_path = output_root / "RUN_COMPLETE"
    checksum_path = output_root / "OUTPUT-SHA256SUMS"
    summary_path = output_root / "SUMMARY.json"
    for path in (marker_path, checksum_path, summary_path):
        if not path.is_file():
            raise RuntimeError(f"completed run is missing required artifact: {path}")

    marker = load_json(marker_path)
    expected_checksum_hash = marker.get("output_checksums_sha256")
    if not isinstance(expected_checksum_hash, str) or len(expected_checksum_hash) != 64:
        raise RuntimeError("RUN_COMPLETE has an invalid output_checksums_sha256")
    observed_checksum_hash = sha256(checksum_path)
    if observed_checksum_hash != expected_checksum_hash:
        raise RuntimeError(
            "completed-run checksum manifest hash mismatch: "
            f"expected {expected_checksum_hash}, observed {observed_checksum_hash}"
        )

    checksummed_names: set[str] = set()
    for line_number, line in enumerate(
        checksum_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            expected, relative = line.split(None, 1)
        except ValueError as error:
            raise RuntimeError(
                f"invalid completed-run checksum entry at line {line_number}"
            ) from error
        relative = relative.strip()
        if relative in checksummed_names:
            raise RuntimeError(f"duplicate completed-run checksum entry: {relative}")
        if len(expected) != 64 or any(character not in "0123456789abcdef" for character in expected):
            raise RuntimeError(f"invalid completed-run checksum digest: {relative}")
        target = output_root / relative
        try:
            target.resolve().relative_to(output_root.resolve())
        except ValueError as error:
            raise RuntimeError(
                f"completed-run checksum path escapes output root: {relative}"
            ) from error
        if not target.is_file():
            raise RuntimeError(f"completed-run checksum target is missing: {relative}")
        checksummed_names.add(relative)
        observed = sha256(target)
        if observed != expected:
            raise RuntimeError(
                f"completed-run artifact hash mismatch for {relative}: "
                f"expected {expected}, observed {observed}"
            )

    excluded = {"OUTPUT-SHA256SUMS", "RUN_COMPLETE"}
    current_names = {relative for _, relative in tree_checksums(output_root, excluded)}
    if checksummed_names != current_names:
        raise RuntimeError(
            "completed-run checksum inventory is not exact: "
            f"expected={sorted(current_names)}, observed={sorted(checksummed_names)}"
        )
    return load_json(summary_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--execution", choices=("local", "hosted"), required=True)
    parser.add_argument("--python", type=Path, default=Path(sys.executable))
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--preflight-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    contract = load_json(args.contract)
    if contract.get("schema_version") != 1:
        raise ContractError("unsupported contract schema_version")
    authorize_execution(contract, args.execution)
    program_root = args.program_root.resolve()
    preflight = verify_contract_inputs(contract, program_root)

    profiles = contract.get("runtime_profiles") or {}
    profile = profiles.get(args.execution)
    if not isinstance(profile, dict):
        raise ContractError(f"missing runtime profile for {args.execution}")
    runtime = runtime_manifest()
    verify_runtime(runtime, profile)
    if args.preflight_only:
        print(
            json.dumps(
                {"status": "PASS", "preflight": preflight, "runtime": runtime},
                ensure_ascii=False,
                indent=2,
            ),
            flush=True,
        )
        return

    output_root = args.output_root.resolve()
    if output_root.exists() and not args.resume:
        raise FileExistsError(f"refusing existing output root: {output_root}")
    output_root.mkdir(parents=True, exist_ok=True)
    contract_copy = output_root / "CONTRACT.json"
    if contract_copy.exists():
        if canonical_json_sha256(load_json(contract_copy)) != canonical_json_sha256(contract):
            raise ContractError("existing output contract differs from requested contract")
    else:
        write_json_atomic(contract_copy, contract)
    preflight_path = output_root / "preflight.json"
    runtime_path = output_root / "runtime.json"
    for path, current, label in (
        (preflight_path, preflight, "preflight"),
        (runtime_path, runtime, "runtime"),
    ):
        if path.exists():
            prior = load_json(path)
            if stable_manifest_identity(prior) != stable_manifest_identity(current):
                raise ContractError(f"existing {label} manifest does not match this resume")
        else:
            write_json_atomic(path, current)

    if (output_root / "RUN_COMPLETE").exists():
        if not args.resume:
            raise FileExistsError(f"refusing completed output root: {output_root}")
        summary = verify_completed_run(output_root)
        print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
        return

    max_seconds = profile.get(
        "max_wall_seconds", contract["runtime"].get("max_wall_seconds")
    )
    if not isinstance(max_seconds, int) or max_seconds < 1:
        raise ContractError("runtime.max_wall_seconds must be a positive integer")
    started = time.monotonic()
    monitor = NvidiaMonitor(output_root / "gpu-resource.csv")
    monitor.start()
    suite_metrics: list[dict[str, Any]] = []
    try:
        for suite in preflight["suites"]:
            suite_output = output_root / "suites" / suite["suite_key"]
            metric_path = suite_output / "metric-report.json"
            if metric_path.exists():
                metrics = verify_suite_completion(suite_output, suite["rows"])
                suite_metrics.append({"suite_key": suite["suite_key"], "metrics": metrics})
                continue
            remaining_seconds = max_seconds - (time.monotonic() - started)
            if remaining_seconds <= 0:
                raise TimeoutError("census wall-time limit reached before all suites ran")
            suite_output.mkdir(parents=True, exist_ok=True)
            logs = output_root / "logs"
            logs.mkdir(parents=True, exist_ok=True)
            command = evaluator_command(
                python=args.python,
                preflight=preflight,
                contract=contract,
                suite=suite,
                output_dir=suite_output,
                require_cuda=profile.get("require_cuda") is True,
                resume=args.resume,
            )
            with (logs / f"{suite['suite_key']}.stdout.log").open(
                "a" if args.resume else "w", encoding="utf-8"
            ) as stdout, (logs / f"{suite['suite_key']}.stderr.log").open(
                "a" if args.resume else "w", encoding="utf-8"
            ) as stderr:
                result = subprocess.run(
                    command,
                    check=False,
                    stdout=stdout,
                    stderr=stderr,
                    text=True,
                    timeout=remaining_seconds,
                    env={
                        **os.environ,
                        "PYTHONHASHSEED": "0",
                        "TOKENIZERS_PARALLELISM": "false",
                        "CUBLAS_WORKSPACE_CONFIG": ":4096:8",
                        "NVIDIA_TF32_OVERRIDE": "0",
                    },
                )
            if result.returncode != 0:
                raise RuntimeError(
                    f"suite {suite['suite_key']} evaluator exited {result.returncode}"
                )
            metrics = verify_suite_completion(suite_output, suite["rows"])
            suite_metrics.append({"suite_key": suite["suite_key"], "metrics": metrics})
    finally:
        monitor.stop()

    summary = {
        "schema_version": 1,
        "experiment_id": contract["experiment_id"],
        "completed_at": utc_now(),
        "execution": args.execution,
        "duration_seconds": time.monotonic() - started,
        "contract_canonical_sha256": canonical_json_sha256(contract),
        "suite_metrics": suite_metrics,
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_root / "SUMMARY.json", summary, overwrite=args.resume)
    excluded = {"OUTPUT-SHA256SUMS", "RUN_COMPLETE"}
    checksums = tree_checksums(output_root, excluded)
    checksum_path = output_root / "OUTPUT-SHA256SUMS"
    checksum_path.write_text(
        "".join(f"{digest}  {relative}\n" for digest, relative in checksums),
        encoding="utf-8",
    )
    for expected, relative in checksums:
        observed = sha256(output_root / relative)
        if observed != expected:
            raise RuntimeError(f"final checksum verification failed: {relative}")
    (output_root / "RUN_COMPLETE").write_text(
        json.dumps(
            {
                "completed_at": utc_now(),
                "output_checksums_sha256": sha256(checksum_path),
            },
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run the paired Wajarri v3 mixed-replay screen on a GPU worker."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from huggingface_hub import snapshot_download


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kit-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--preflight-only", action="store_true")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def run(command: list[str], log_path: Path) -> None:
    print(f"[{utc_now()}] running: {' '.join(command)}", flush=True)
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert process.stdout is not None
        for line in process.stdout:
            log.write(line)
            log.flush()
        return_code = process.wait()
    if return_code:
        raise RuntimeError(f"command failed with exit {return_code}: {command}")
    print(f"[{utc_now()}] completed: {log_path.name}", flush=True)


def verify_file(path: Path, expected: str) -> None:
    actual = sha256_file(path)
    if actual != expected:
        raise ValueError(f"SHA-256 mismatch for {path}: {actual} != {expected}")


def load_bound_jsonl(path: Path, expected_rows: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise TypeError(f"{path}:{line_number} is not an object")
            rows.append(value)
    if len(rows) != expected_rows:
        raise ValueError(
            f"row-count mismatch for {path}: {len(rows)} != {expected_rows}"
        )
    return rows


def verify_schedule(
    rows: list[dict[str, Any]], arm: str, binding: dict[str, Any]
) -> None:
    required_model_columns = {
        "direction",
        "id",
        "input_text",
        "output_text",
        "pair_kind",
        "task",
    }
    for index, row in enumerate(rows, start=1):
        missing = sorted(required_model_columns - row.keys())
        if missing:
            raise ValueError(
                f"schedule row {index} is missing model-facing columns: {missing}"
            )
    if any(row.get("arm") != arm for row in rows):
        raise ValueError(f"schedule contains a row assigned to the wrong arm: {arm}")
    unique_rows = {str(row["accounting_parent_id"]) for row in rows}
    if len(unique_rows) != binding["unique_rows"]:
        raise ValueError(
            f"unique-row mismatch for {arm}: {len(unique_rows)} != "
            f"{binding['unique_rows']}"
        )
    non_padding_tokens = sum(
        int(row["token_accounting"]["non_padding_tokens_with_specials"]) for row in rows
    )
    if non_padding_tokens != binding["non_padding_tokens"]:
        raise ValueError(
            f"token-accounting mismatch for {arm}: {non_padding_tokens} != "
            f"{binding['non_padding_tokens']}"
        )
    for field, key in (
        ("source_tokens_with_specials", "source_non_padding_tokens"),
        ("target_tokens_with_specials", "target_non_padding_tokens"),
    ):
        if key not in binding:
            continue
        observed = sum(int(row["token_accounting"][field]) for row in rows)
        if observed != binding[key]:
            raise ValueError(f"{key} mismatch for {arm}: {observed} != {binding[key]}")
    if "task_presentations" in binding:
        observed_tasks = dict(sorted(Counter(str(row["task"]) for row in rows).items()))
        if observed_tasks != binding["task_presentations"]:
            raise ValueError(
                f"task-presentation mismatch for {arm}: "
                f"{observed_tasks} != {binding['task_presentations']}"
            )


def experiment_arms(contract: dict[str, Any]) -> tuple[str, str]:
    roles = contract["experiment_roles"]
    control = str(roles["control_arm"])
    treatment = str(roles["treatment_arm"])
    if control == treatment or {control, treatment} != set(contract["arms"]):
        raise ValueError("experiment arm roles do not match the two schedule arms")
    return control, treatment


def training_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    arm: str,
    output_dir: Path,
) -> list[str]:
    training = contract["training"]
    arm_contract = contract["arms"][arm]
    schedule = kit_dir / arm_contract["schedule_path"]
    command = [
        sys.executable,
        str(kit_dir / "code/training/translation/train_nllb_lora.py"),
        "--train-file",
        str(schedule),
        "--output-dir",
        str(output_dir),
        "--model-id",
        f"mobtranslate-wajarri-v3-{arm.lower()}-mixed-replay-screen",
        "--model-version",
        f"v3-mixed-replay-{arm.lower()}-s{training['seed']}",
        "--run-id",
        f"{contract['run_id']}:{arm}",
        "--dataset-id",
        contract["dataset_id"],
        "--dataset-release-sha256",
        arm_contract["schedule_sha256"],
        "--license",
        "CC-BY-NC-4.0",
        "--base-model",
        str(base_dir),
        "--initial-adapter",
        str(kit_dir / "payload/initial-adapter"),
        "--expected-initial-adapter-sha256",
        contract["initial_adapter"]["adapter_weight_sha256"],
        "--source-lang",
        "eng_Latn",
        "--target-lang",
        "wbv_Latn",
        "--direction",
        "eng-wbv",
        "--training-mode",
        "lora",
        "--max-source-length",
        "256",
        "--max-target-length",
        "64",
        "--learning-rate",
        str(training["learning_rate"]),
        "--max-steps",
        str(training["optimizer_updates"]),
        "--stop-after-steps",
        str(training["optimizer_updates"]),
        "--batch-size",
        str(training["physical_batch_size"]),
        "--gradient-accumulation-steps",
        str(training["gradient_accumulation_steps"]),
        "--optimizer",
        "adamw_torch",
        "--lr-scheduler-type",
        training["lr_scheduler_type"],
        "--warmup-steps",
        str(training["warmup_updates"]),
        "--weight-decay",
        str(training["weight_decay"]),
        "--label-smoothing-factor",
        "0.0",
        "--max-grad-norm",
        "1.0",
        "--lora-r",
        str(training["lora_r"]),
        "--lora-alpha",
        str(training["lora_alpha"]),
        "--lora-dropout",
        str(training["lora_dropout"]),
        "--lora-target-modules",
        ",".join(training["lora_target_modules"]),
        "--save-steps",
        str(training["save_steps"]),
        "--save-total-limit",
        str(len(training["checkpoint_updates"]) + 1),
        "--eval-steps",
        str(training["save_steps"]),
        "--logging-steps",
        "1",
        "--generation-num-beams",
        "1",
        "--generation-no-repeat-ngram-size",
        "0",
        "--generation-repetition-penalty",
        "1.0",
        "--generation-length-penalty",
        "1.0",
        "--seed",
        str(training["seed"]),
        "--training-order",
        "sequential",
        "--accounting-row-id-field",
        "accounting_parent_id",
        "--allow-duplicate-train-pairs",
        "--no-shuffle-before-cap",
        "--no-use-fast-tokenizer",
        "--trainable-token-scope",
        "tied",
        "--ensure-weight-tying",
        "--no-gradient-checkpointing",
        "--full-determinism",
        "--no-merge-full-model",
        "--no-load-best-model-at-end",
    ]
    for token in ("wbv_Latn", "<lexeme>", "<translate>"):
        command.extend(["--trainable-token", token])
    return command


def development_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    adapter_dir: Path,
    output_dir: Path,
    label: str,
    development_name: str = "development",
) -> list[str]:
    binding = contract[development_name]
    return [
        sys.executable,
        str(kit_dir / "code/evaluate_composition.py"),
        "--base-dir",
        str(base_dir),
        "--adapter-dir",
        str(adapter_dir),
        "--development-file",
        str(kit_dir / binding["path"]),
        "--expected-rows",
        str(binding["rows"]),
        "--output-dir",
        str(output_dir),
        "--label",
        label,
        "--batch-size",
        "16",
        "--seed",
        str(contract["training"]["seed"]),
    ]


def lexical_sentinel_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    adapter_dir: Path,
    output_dir: Path,
    label: str,
) -> list[str]:
    partition = contract["lexical_partitions"]
    return [
        sys.executable,
        str(kit_dir / "code/evaluate_lexical_sentinels.py"),
        "--base-dir",
        str(base_dir),
        "--adapter-dir",
        str(adapter_dir),
        "--pair-matches",
        str(kit_dir / partition["pair_matches_path"]),
        "--expected-rows",
        str(partition["pair_matches_rows"]),
        "--expected-mandatory",
        str(partition["mandatory_regression_anchors"]),
        "--output-dir",
        str(output_dir),
        "--label",
        label,
        "--batch-size",
        "64",
        "--seed",
        str(contract["training"]["seed"]),
    ]


def full_evaluation_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    adapter_dir: Path,
    output_dir: Path,
    label: str,
) -> list[str]:
    return [
        sys.executable,
        str(kit_dir / "code/evaluate_v2.py"),
        "--base-dir",
        str(base_dir),
        "--adapter-dir",
        str(adapter_dir),
        "--evaluation-dir",
        str(kit_dir / "payload/data/evaluation"),
        "--output-dir",
        str(output_dir),
        "--label",
        label,
        "--batch-size",
        "64",
        "--seed",
        str(contract["training"]["seed"]),
    ]


def lexical_partition_command(
    contract: dict[str, Any],
    kit_dir: Path,
    full_evaluation_dir: Path,
    output_dir: Path,
    label: str,
) -> list[str]:
    partition = contract["lexical_partitions"]
    return [
        sys.executable,
        str(kit_dir / "code/analyze_lexical_partitions.py"),
        "--predictions",
        str(full_evaluation_dir / "predictions/lexical_direct_closed.jsonl"),
        "--pair-matches",
        str(kit_dir / partition["pair_matches_path"]),
        "--output-dir",
        str(output_dir),
        "--label",
        label,
        "--expected-prediction-rows",
        str(contract["evaluation"]["lexical_direct_closed"]["rows"]),
        "--expected-one-target-rows",
        str(partition["one_target_rows"]),
        "--expected-pairs",
        str(partition["pair_matches_rows"]),
        "--expected-mandatory-anchors",
        str(partition["mandatory_regression_anchors"]),
    ]


def development_rank(summary: dict[str, Any], step: int) -> tuple[Any, ...]:
    metrics = summary["metrics"]
    faults = sum(metrics["faults"].values())
    return (
        faults == 0,
        metrics["exact"],
        metrics["both_slots_present"],
        metrics["predicate_present"],
        metrics["subject_present"],
        metrics["mean_chrf2"],
        -step,
    )


def checkpoint_admissibility(
    sentinel: dict[str, Any], baseline: dict[str, Any], contract: dict[str, Any]
) -> dict[str, bool]:
    candidate = sentinel["metrics"]
    baseline_metrics = baseline["metrics"]
    maximum_loss = int(contract["gates"]["maximum_anchor_exact_count_loss"])
    return {
        "sentinel_faults_zero": sum(candidate["faults"].values()) == 0,
        "all_sentinels_retained": (
            candidate["exact"] >= baseline_metrics["exact"] - maximum_loss
        ),
        "mandatory_sentinels_retained": (
            candidate["mandatory"]["exact"]
            == baseline_metrics["mandatory"]["exact"]
        ),
    }


def diagnostic_checkpoint_rank(
    development: dict[str, Any], sentinel: dict[str, Any], step: int
) -> tuple[Any, ...]:
    metrics = sentinel["metrics"]
    return (
        -sum(metrics["faults"].values()),
        metrics["mandatory"]["exact"],
        metrics["exact"],
        development_rank(development, step),
    )


def choose_checkpoint(
    candidates: list[dict[str, Any]],
    baseline_sentinel: dict[str, Any],
    contract: dict[str, Any],
) -> tuple[dict[str, Any], str]:
    if not candidates:
        raise ValueError("checkpoint census is empty")
    for candidate in candidates:
        candidate["admissibility"] = checkpoint_admissibility(
            candidate["sentinel"], baseline_sentinel, contract
        )
        candidate["admissible"] = all(candidate["admissibility"].values())
    admissible = [candidate for candidate in candidates if candidate["admissible"]]
    if admissible:
        return (
            max(
                admissible,
                key=lambda candidate: development_rank(
                    candidate["development"], candidate["step"]
                ),
            ),
            "ADMISSIBLE_CHECKPOINT_SELECTED",
        )
    return (
        max(
            candidates,
            key=lambda candidate: diagnostic_checkpoint_rank(
                candidate["development"], candidate["sentinel"], candidate["step"]
            ),
        ),
        "NO_ADMISSIBLE_CHECKPOINT_DIAGNOSTIC_ONLY",
    )


def full_fault_count(summary: dict[str, Any]) -> int:
    return sum(sum(suite["faults"].values()) for suite in summary["suites"].values())


def fault_count_for_suites(summary: dict[str, Any], suite_names: list[str]) -> int:
    missing = sorted(set(suite_names) - summary["suites"].keys())
    if missing:
        raise ValueError(f"mechanical-fault policy names missing suites: {missing}")
    return sum(
        sum(summary["suites"][suite]["faults"].values()) for suite in suite_names
    )


def mechanical_gates(
    candidate: dict[str, Any], baseline: dict[str, Any], gates: dict[str, Any]
) -> dict[str, bool]:
    policy = gates.get("mechanical_fault_policy")
    if policy is None:
        return {"mechanical_faults": full_fault_count(candidate) == 0}
    if policy.get("kind") != "deployment_zero_diagnostic_noninferiority":
        raise ValueError(f"unsupported mechanical-fault policy: {policy.get('kind')}")
    deployment_suites = list(policy["deployment_zero_suites"])
    diagnostic_suites = list(policy["diagnostic_noninferiority_suites"])
    return {
        "deployment_mechanical_faults": (
            fault_count_for_suites(candidate, deployment_suites) == 0
        ),
        "diagnostic_mechanical_noninferiority": (
            fault_count_for_suites(candidate, diagnostic_suites)
            <= fault_count_for_suites(baseline, diagnostic_suites)
        ),
    }


def full_gates(
    candidate: dict[str, Any],
    baseline: dict[str, Any],
    candidate_partitions: dict[str, Any],
    baseline_partitions: dict[str, Any],
    contract: dict[str, Any],
) -> dict[str, bool]:
    gates = contract["gates"]
    candidate_partition_metrics = candidate_partitions["partitions"]
    baseline_partition_metrics = baseline_partitions["partitions"]
    return {
        **mechanical_gates(candidate, baseline, gates),
        "lexical_one_target_noninferiority": candidate["direct_one_target"][
            "exact_rate"
        ]
        >= baseline["direct_one_target"]["exact_rate"]
        - gates["maximum_one_target_exact_rate_loss"],
        "lexical_unanchored_noninferiority": candidate_partition_metrics[
            "unanchored_complement"
        ]["exact_rate"]
        >= baseline_partition_metrics["unanchored_complement"]["exact_rate"]
        - gates["maximum_unanchored_exact_rate_loss"],
        "lexical_anchor_noninferiority": candidate_partition_metrics["trained_anchors"][
            "exact"
        ]
        >= baseline_partition_metrics["trained_anchors"]["exact"]
        - gates["maximum_anchor_exact_count_loss"],
        "mandatory_regression_anchors_retained": candidate_partition_metrics[
            "mandatory_regression_anchors"
        ]["exact"]
        == baseline_partition_metrics["mandatory_regression_anchors"]["exact"],
        "synthetic_retention_noninferiority": candidate["suites"]["synthetic_holdout"][
            "mean_chrf2"
        ]
        >= baseline["suites"]["synthetic_holdout"]["mean_chrf2"]
        - gates["maximum_synthetic_chrf2_loss"],
        "fixed_utterance_retention": candidate["suites"]["retention"]["exact"]
        == baseline["suites"]["retention"]["exact"],
    }


def compact_adapter(source: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    names = (
        "adapter_config.json",
        "adapter_model.safetensors",
        "added_tokens.json",
        "sentencepiece.bpe.model",
        "special_tokens_map.json",
        "tokenizer_config.json",
        "README.md",
        "exposure-checkpoint.json",
        "exposure-row-presentations.jsonl",
    )
    for name in names:
        source_path = source / name
        if source_path.is_file():
            shutil.copy2(source_path, destination / name)
    if not (destination / "adapter_model.safetensors").is_file():
        raise ValueError(f"compact adapter is missing weights: {source}")


def recursive_manifest(root: Path) -> dict[str, Any]:
    return {
        str(path.relative_to(root)): {
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
        }
        for path in sorted(root.rglob("*"))
        if path.is_file() and path.name != "RESULT-MANIFEST.json"
    }


def main() -> None:
    args = parse_args()
    kit_dir = args.kit_dir.resolve()
    output_dir = args.output_dir.resolve()
    contract = json.loads((kit_dir / "CONTRACT.json").read_text(encoding="utf-8"))

    development_bindings = [contract["development"]]
    if "glossary_development" in contract:
        development_bindings.append(contract["glossary_development"])
    for binding in [*development_bindings, *contract["evaluation"].values()]:
        path = kit_dir / binding["path"]
        verify_file(path, binding["sha256"])
        load_bound_jsonl(path, binding["rows"])
    partition_binding = contract["lexical_partitions"]
    pair_matches_path = kit_dir / partition_binding["pair_matches_path"]
    verify_file(pair_matches_path, partition_binding["pair_matches_sha256"])
    load_bound_jsonl(pair_matches_path, partition_binding["pair_matches_rows"])
    control_arm, treatment_arm = experiment_arms(contract)
    for arm_label, arm in contract["arms"].items():
        path = kit_dir / arm["schedule_path"]
        verify_file(path, arm["schedule_sha256"])
        verify_schedule(load_bound_jsonl(path, arm["schedule_rows"]), arm_label, arm)
    schedule_rows = {arm["schedule_rows"] for arm in contract["arms"].values()}
    if len(schedule_rows) != 1:
        raise ValueError("paired arms must have identical presentation counts")
    presentations = schedule_rows.pop()
    training = contract["training"]
    expected_presentations = (
        training["physical_batch_size"]
        * training["gradient_accumulation_steps"]
        * training["optimizer_updates"]
    )
    if presentations != expected_presentations:
        raise ValueError(
            f"schedule cannot produce the frozen update count: "
            f"{presentations} != {expected_presentations}"
        )
    for relative_path, expected in contract["initial_adapter"]["files"].items():
        verify_file(kit_dir / relative_path, expected)
    if args.preflight_only:
        print(
            json.dumps(
                {
                    "status": "PASS_STATIC_KIT_PREFLIGHT",
                    "run_id": contract["run_id"],
                    "development_rows": contract["development"]["rows"],
                    "glossary_development_rows": contract.get(
                        "glossary_development", {}
                    ).get("rows", 0),
                    "evaluation_rows": sum(
                        binding["rows"] for binding in contract["evaluation"].values()
                    ),
                    "presentations_per_arm": presentations,
                    "optimizer_updates_per_arm": training["optimizer_updates"],
                },
                indent=2,
                sort_keys=True,
            )
        )
        return

    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    logs_dir = output_dir / "logs"
    logs_dir.mkdir()

    model_snapshot = Path(
        snapshot_download(
            repo_id=contract["base_release"]["repo_id"],
            revision=contract["base_release"]["revision"],
            local_dir=output_dir / "work/base-release",
            allow_patterns=["base/*", "release.json"],
        )
    )
    base_dir = model_snapshot / "base"
    for relative_path, expected in contract["base_release"]["files"].items():
        verify_file(model_snapshot / relative_path, expected)
    initial_adapter = kit_dir / "payload/initial-adapter"
    development_root = output_dir / "development-evaluation"
    glossary_development_root = output_dir / "glossary-development-evaluation"
    sentinel_root = output_dir / "lexical-sentinel-evaluation"
    full_root = output_dir / "full-evaluation"
    partition_root = output_dir / "lexical-partitions"
    development_root.mkdir()
    if "glossary_development" in contract:
        glossary_development_root.mkdir()
    sentinel_root.mkdir()
    full_root.mkdir()
    partition_root.mkdir()

    run(
        development_command(
            contract,
            kit_dir,
            base_dir,
            initial_adapter,
            development_root / "B0",
            "B0",
        ),
        logs_dir / "evaluate-development-B0.log",
    )
    run(
        lexical_sentinel_command(
            contract,
            kit_dir,
            base_dir,
            initial_adapter,
            sentinel_root / "B0",
            "B0",
        ),
        logs_dir / "evaluate-lexical-sentinels-B0.log",
    )
    if "glossary_development" in contract:
        run(
            development_command(
                contract,
                kit_dir,
                base_dir,
                initial_adapter,
                glossary_development_root / "B0",
                "B0-glossary",
                "glossary_development",
            ),
            logs_dir / "evaluate-glossary-development-B0.log",
        )
    run(
        full_evaluation_command(
            contract,
            kit_dir,
            base_dir,
            initial_adapter,
            full_root / "B0",
            "B0",
        ),
        logs_dir / "evaluate-full-B0.log",
    )
    run(
        lexical_partition_command(
            contract,
            kit_dir,
            full_root / "B0",
            partition_root / "B0",
            "B0",
        ),
        logs_dir / "partition-lexical-B0.log",
    )
    development_summaries = {
        "B0": json.loads(
            (development_root / "B0/SUMMARY.json").read_text(encoding="utf-8")
        )
    }
    sentinel_summaries = {
        "B0": json.loads(
            (sentinel_root / "B0/SUMMARY.json").read_text(encoding="utf-8")
        )
    }
    glossary_development_summaries = (
        {
            "B0": json.loads(
                (glossary_development_root / "B0/SUMMARY.json").read_text(
                    encoding="utf-8"
                )
            )
        }
        if "glossary_development" in contract
        else {}
    )
    selected: dict[str, dict[str, Any]] = {}
    checkpoint_census: dict[str, list[dict[str, Any]]] = {}
    training_roots = []
    for arm in (control_arm, treatment_arm):
        training_dir = output_dir / "arms" / arm / "training"
        training_dir.parent.mkdir(parents=True)
        training_roots.append(training_dir)
        run(
            training_command(contract, kit_dir, base_dir, arm, training_dir),
            logs_dir / f"train-{arm}.log",
        )
        candidate_summaries: list[dict[str, Any]] = []
        for step in contract["training"]["checkpoint_updates"]:
            adapter_dir = training_dir / f"checkpoint-{step}"
            if (
                not adapter_dir.is_dir()
                and step == contract["training"]["optimizer_updates"]
            ):
                adapter_dir = training_dir / "adapter"
            if not adapter_dir.is_dir():
                raise ValueError(f"missing {arm} checkpoint {step}")
            label = f"{arm}-step-{step}"
            run(
                development_command(
                    contract,
                    kit_dir,
                    base_dir,
                    adapter_dir,
                    development_root / label,
                    label,
                ),
                logs_dir / f"evaluate-development-{label}.log",
            )
            summary = json.loads(
                (development_root / label / "SUMMARY.json").read_text(encoding="utf-8")
            )
            development_summaries[label] = summary
            run(
                lexical_sentinel_command(
                    contract,
                    kit_dir,
                    base_dir,
                    adapter_dir,
                    sentinel_root / label,
                    label,
                ),
                logs_dir / f"evaluate-lexical-sentinels-{label}.log",
            )
            sentinel = json.loads(
                (sentinel_root / label / "SUMMARY.json").read_text(encoding="utf-8")
            )
            sentinel_summaries[label] = sentinel
            if "glossary_development" in contract:
                run(
                    development_command(
                        contract,
                        kit_dir,
                        base_dir,
                        adapter_dir,
                        glossary_development_root / label,
                        f"{label}-glossary",
                        "glossary_development",
                    ),
                    logs_dir / f"evaluate-glossary-development-{label}.log",
                )
                glossary_development_summaries[label] = json.loads(
                    (
                        glossary_development_root / label / "SUMMARY.json"
                    ).read_text(encoding="utf-8")
                )
            candidate_summaries.append(
                {
                    "step": step,
                    "adapter_dir": adapter_dir,
                    "label": label,
                    "development": summary,
                    "sentinel": sentinel,
                    "glossary_development": glossary_development_summaries.get(label),
                }
            )
        chosen, selection_status = choose_checkpoint(
            candidate_summaries, sentinel_summaries["B0"], contract
        )
        selected_step = chosen["step"]
        selected_path = chosen["adapter_dir"]
        selected_label = chosen["label"]
        compact_role = "selected-adapters" if chosen["admissible"] else "diagnostic-adapters"
        compact_path = output_dir / compact_role / arm
        compact_path.parent.mkdir(parents=True, exist_ok=True)
        compact_adapter(selected_path, compact_path)
        selected[arm] = {
            "step": selected_step,
            "label": selected_label,
            "adapter_dir": compact_path,
            "development": development_summaries[selected_label],
            "sentinel": sentinel_summaries[selected_label],
            "glossary_development": glossary_development_summaries.get(
                selected_label
            ),
            "admissibility": chosen["admissibility"],
            "admissible": chosen["admissible"],
            "selection_status": selection_status,
            "compact_role": compact_role,
        }
        checkpoint_census[arm] = [
            {
                "step": candidate["step"],
                "label": candidate["label"],
                "admissible": candidate["admissible"],
                "admissibility": candidate["admissibility"],
                "development_metrics": candidate["development"]["metrics"],
                "sentinel_metrics": candidate["sentinel"]["metrics"],
                "glossary_development_metrics": (
                    candidate["glossary_development"]["metrics"]
                    if candidate["glossary_development"] is not None
                    else None
                ),
            }
            for candidate in candidate_summaries
        ]
        run(
            full_evaluation_command(
                contract,
                kit_dir,
                base_dir,
                compact_path,
                full_root / arm,
                arm,
            ),
            logs_dir / f"evaluate-full-{arm}.log",
        )
        run(
            lexical_partition_command(
                contract,
                kit_dir,
                full_root / arm,
                partition_root / arm,
                arm,
            ),
            logs_dir / f"partition-lexical-{arm}.log",
        )

    full_summaries = {
        label: json.loads(
            (full_root / label / "SUMMARY.json").read_text(encoding="utf-8")
        )
        for label in ("B0", control_arm, treatment_arm)
    }
    lexical_partitions = {
        label: json.loads(
            (partition_root / label / "REPORT.json").read_text(encoding="utf-8")
        )
        for label in ("B0", control_arm, treatment_arm)
    }
    baseline_metrics = development_summaries["B0"]["metrics"]
    control_metrics = selected[control_arm]["development"]["metrics"]
    treatment_metrics = selected[treatment_arm]["development"]["metrics"]
    treatment_effect = treatment_metrics["exact"] > max(
        baseline_metrics["exact"], control_metrics["exact"]
    ) or treatment_metrics["both_slots_present"] > max(
        baseline_metrics["both_slots_present"],
        control_metrics["both_slots_present"],
    )
    candidate_gates = {
        arm: full_gates(
            full_summaries[arm],
            full_summaries["B0"],
            lexical_partitions[arm],
            lexical_partitions["B0"],
            contract,
        )
        for arm in (control_arm, treatment_arm)
    }
    treatment_pass = (
        treatment_effect
        and selected[treatment_arm]["admissible"]
        and all(candidate_gates[treatment_arm].values())
    )
    result = {
        "schema_version": 1,
        "run_id": contract["run_id"],
        "created_at_utc": utc_now(),
        "status": (
            "POSITIVE_INTERNAL_COMPOSITION_SIGNAL"
            if treatment_pass
            else "NEGATIVE_OR_INCONCLUSIVE_INTERNAL_COMPOSITION_SCREEN"
        ),
        "treatment_effect_pass": treatment_effect,
        "treatment_full_regression_gates_pass": all(
            candidate_gates[treatment_arm].values()
        ),
        "experiment_roles": {
            "baseline_arm": "B0",
            "control_arm": control_arm,
            "treatment_arm": treatment_arm,
        },
        "selected_checkpoints": {
            arm: {
                "step": selected[arm]["step"],
                "label": selected[arm]["label"],
                "selection_status": selected[arm]["selection_status"],
                "checkpoint_admissible": selected[arm]["admissible"],
                "checkpoint_admissibility": selected[arm]["admissibility"],
                "adapter_weight_sha256": sha256_file(
                    selected[arm]["adapter_dir"] / "adapter_model.safetensors"
                ),
            }
            for arm in (control_arm, treatment_arm)
        },
        "development_metrics": {
            "B0": baseline_metrics,
            control_arm: control_metrics,
            treatment_arm: treatment_metrics,
        },
        "checkpoint_census": checkpoint_census,
        "lexical_sentinel_metrics": {
            "B0": sentinel_summaries["B0"]["metrics"],
            control_arm: selected[control_arm]["sentinel"]["metrics"],
            treatment_arm: selected[treatment_arm]["sentinel"]["metrics"],
        },
        "glossary_development_metrics": (
            {
                "B0": glossary_development_summaries["B0"]["metrics"],
                control_arm: selected[control_arm]["glossary_development"]["metrics"],
                treatment_arm: selected[treatment_arm]["glossary_development"][
                    "metrics"
                ],
            }
            if glossary_development_summaries
            else None
        ),
        "full_regression_gates": candidate_gates,
        "lexical_partitions": lexical_partitions,
        "full_metrics": {
            label: {
                "direct_one_target": summary["direct_one_target"],
                "synthetic_holdout": summary["suites"]["synthetic_holdout"],
                "historical_holdout": summary["suites"]["historical_holdout"],
                "retention": summary["suites"]["retention"],
                "mechanical_faults": full_fault_count(summary),
            }
            for label, summary in full_summaries.items()
        },
        "promotion_authorized": False,
        "claim_limit": (
            "This is a development-consumed mechanistic screen. A positive result authorizes "
            "a broader evidence-backed experiment, not public sentence translation."
        ),
    }
    write_json(output_dir / "RESULT.json", result)

    deletion_ledger = {
        "schema_version": 1,
        "created_at_utc": utc_now(),
        "retained": [
            f"{selected[control_arm]['compact_role']}/{control_arm}",
            f"{selected[treatment_arm]['compact_role']}/{treatment_arm}",
            "development-evaluation",
            "lexical-sentinel-evaluation",
            *(
                ["glossary-development-evaluation"]
                if glossary_development_summaries
                else []
            ),
            "full-evaluation",
            "lexical-partitions",
            "logs",
        ],
        "deleted_after_verified_compaction": [
            str(path.relative_to(output_dir)) for path in training_roots
        ],
        "reason": "Retain only each arm's selected compact adapter and every evaluation; discard optimizer states and unselected checkpoint weights.",
    }
    for path in training_roots:
        shutil.rmtree(path)
    write_json(output_dir / "DELETION-LEDGER.json", deletion_ledger)
    write_json(
        output_dir / "RUN-COMPLETE.json",
        {
            "schema_version": 1,
            "run_id": contract["run_id"],
            "completed_at_utc": utc_now(),
            "status": result["status"],
            "result_sha256": sha256_file(output_dir / "RESULT.json"),
        },
    )
    write_json(
        output_dir / "RESULT-MANIFEST.json",
        {
            "schema_version": 1,
            "run_id": contract["run_id"],
            "created_at_utc": utc_now(),
            "files": recursive_manifest(output_dir),
        },
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run the bounded Wajarri v3 copy/composition screen."""

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
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]
    if len(rows) != expected_rows:
        raise ValueError(f"row-count mismatch for {path}: {len(rows)} != {expected_rows}")
    return rows


def verify_schedule(rows: list[dict[str, Any]], arm: str, binding: dict[str, Any]) -> None:
    required = {
        "accounting_parent_id",
        "target_pair_parent_id",
        "arm",
        "direction",
        "id",
        "input_text",
        "optimizer_update",
        "output_text",
        "pair_kind",
        "presentation_index",
        "schedule_population",
        "task",
        "token_accounting",
    }
    for index, row in enumerate(rows, start=1):
        missing = sorted(required - row.keys())
        if missing:
            raise ValueError(f"schedule row {index} lacks fields: {missing}")
    if any(row["arm"] != arm for row in rows):
        raise ValueError(f"schedule has wrong-arm rows: {arm}")
    if [row["presentation_index"] for row in rows] != list(range(1, len(rows) + 1)):
        raise ValueError(f"schedule presentation order is not contiguous: {arm}")
    observed_tasks = dict(sorted(Counter(str(row["task"]) for row in rows).items()))
    if observed_tasks != binding["task_presentations"]:
        raise ValueError(f"task-presentation mismatch for {arm}")
    observed_populations = dict(
        sorted(Counter(str(row["schedule_population"]) for row in rows).items())
    )
    if observed_populations != binding["population_presentations"]:
        raise ValueError(f"population-presentation mismatch for {arm}")
    observed_tokens = {
        "source_non_padding_tokens": sum(
            int(row["token_accounting"]["source_tokens_with_specials"]) for row in rows
        ),
        "target_non_padding_tokens": sum(
            int(row["token_accounting"]["target_tokens_with_specials"]) for row in rows
        ),
        "non_padding_tokens": sum(
            int(row["token_accounting"]["non_padding_tokens_with_specials"])
            for row in rows
        ),
    }
    for key, value in observed_tokens.items():
        if value != int(binding[key]):
            raise ValueError(f"{key} mismatch for {arm}: {value} != {binding[key]}")


def runtime_appended_tokens(contract: dict[str, Any]) -> list[dict[str, Any]]:
    records = list(contract.get("tokenizer", {}).get("runtime_appended_tokens") or [])
    tokens = [str(record["token"]) for record in records]
    token_ids = [int(record["token_id"]) for record in records]
    if len(tokens) != len(set(tokens)) or len(token_ids) != len(set(token_ids)):
        raise ValueError("runtime-appended token contract contains duplicates")
    return records


def add_runtime_token_arguments(
    command: list[str], contract: dict[str, Any]
) -> None:
    for record in runtime_appended_tokens(contract):
        command.extend(["--additional-special-token", str(record["token"])])
        command.extend(
            ["--expected-additional-special-token-id", str(record["token_id"])]
        )


def training_command(
    contract: dict[str, Any], kit_dir: Path, base_dir: Path, arm: str, output_dir: Path
) -> list[str]:
    training = contract["training"]
    arm_contract = contract["arms"][arm]
    experiment_slug = str(contract.get("experiment_slug", "copy-composition"))
    command = [
        sys.executable,
        str(kit_dir / "code/training/translation/train_nllb_lora.py"),
        "--train-file",
        str(kit_dir / arm_contract["schedule_path"]),
        "--output-dir",
        str(output_dir),
        "--model-id",
        f"mobtranslate-wajarri-v3-{arm.lower()}-{experiment_slug}-screen",
        "--model-version",
        f"v3-{experiment_slug}-{arm.lower()}-s{training['seed']}",
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
        str(training["optimizer_updates"]),
        "--save-total-limit",
        "1",
        "--adapter-snapshot-steps",
        ",".join(str(step) for step in training["checkpoint_updates"]),
        "--eval-steps",
        str(training["optimizer_updates"]),
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
    for record in runtime_appended_tokens(contract):
        command.extend(["--additional-special-token", str(record["token"])])
    trainable_tokens = contract.get("tokenizer", {}).get(
        "trainable_tokens",
        ["wbv_Latn", "<lexeme>", "<translate>", "<glossary>"],
    )
    for token in trainable_tokens:
        command.extend(["--trainable-token", token])
    for token in arm_contract["required_trainable_token_updates"]:
        command.extend(["--required-trainable-token-update", token])
    return command


def endpoint_evaluation_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    adapter_dir: Path,
    binding_name: str,
    output_dir: Path,
    label: str,
    *,
    batch_sizes: str = "16",
    dtype: str = "bfloat16",
) -> list[str]:
    binding = contract[binding_name]
    command = [
        sys.executable,
        str(kit_dir / "code/evaluate_copy_composition.py"),
        "--base-dir",
        str(base_dir),
        "--adapter-dir",
        str(adapter_dir),
        "--evaluation-file",
        str(kit_dir / binding["path"]),
        "--expected-rows",
        str(binding["rows"]),
        "--output-dir",
        str(output_dir),
        "--label",
        label,
        "--batch-sizes",
        batch_sizes,
        "--dtype",
        dtype,
        "--seed",
        str(contract["training"]["seed"]),
    ]
    add_runtime_token_arguments(command, contract)
    return command


def full_evaluation_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    adapter_dir: Path,
    output_dir: Path,
    label: str,
) -> list[str]:
    command = [
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
    add_runtime_token_arguments(command, contract)
    return command


def fault_count(metrics: dict[str, Any]) -> int:
    return sum(int(value) for value in metrics["faults"].values())


def endpoint(summary: dict[str, Any], name: str) -> dict[str, Any]:
    return summary["metrics"]["by_endpoint"][name]


def development_rank(
    summary: dict[str, Any], gates: dict[str, Any], step: int
) -> tuple[Any, ...]:
    composition = endpoint(summary, "composition_plain")
    held_inline = endpoint(summary, "held_lexeme_inline")
    copy_screen = endpoint(summary, "copy_screen")
    thresholds = (
        (composition["exact"], int(gates["minimum_composition_plain_exact"])),
        (held_inline["exact"], int(gates["minimum_held_inline_exact"])),
        (copy_screen["exact"], int(gates["minimum_copy_screen_exact"])),
    )
    threshold_count = sum(value >= minimum for value, minimum in thresholds)
    minimum_ratio = min(value / minimum for value, minimum in thresholds)
    return (
        fault_count(summary["metrics"]) == 0,
        threshold_count,
        minimum_ratio,
        composition["exact"],
        held_inline["exact"],
        copy_screen["exact"],
        composition["both_slots_present"],
        held_inline["both_slots_present"],
        composition["mean_chrf2"] + held_inline["mean_chrf2"],
        -step,
    )


def choose_checkpoint(candidates: list[dict[str, Any]], gates: dict[str, Any]) -> dict[str, Any]:
    if not candidates:
        raise ValueError("checkpoint census is empty")
    return max(
        candidates,
        key=lambda candidate: development_rank(
            candidate["development"], gates, candidate["step"]
        ),
    )


def neutral_development_rank(
    summary: dict[str, Any], gates: dict[str, Any], step: int
) -> tuple[Any, ...]:
    composition = endpoint(summary, "composition_plain")
    held_inline = endpoint(summary, "held_lexeme_inline")
    neutral_single = endpoint(summary, "neutral_single_copy_screen")
    neutral_dual = endpoint(summary, "neutral_dual_copy_screen")
    thresholds = (
        (composition["exact"], int(gates["minimum_composition_plain_exact"])),
        (held_inline["exact"], int(gates["minimum_held_inline_exact"])),
        (neutral_single["exact"], int(gates["minimum_neutral_single_screen_exact"])),
        (neutral_dual["exact"], int(gates["minimum_neutral_dual_screen_exact"])),
    )
    threshold_count = sum(value >= minimum for value, minimum in thresholds)
    minimum_ratio = min(value / minimum for value, minimum in thresholds)
    return (
        fault_count(summary["metrics"]) == 0,
        threshold_count,
        minimum_ratio,
        composition["exact"],
        held_inline["exact"],
        neutral_dual["exact"],
        neutral_single["exact"],
        composition["both_slots_present"],
        held_inline["both_slots_present"],
        composition["mean_chrf2"] + held_inline["mean_chrf2"],
        -step,
    )


def choose_neutral_checkpoint(
    candidates: list[dict[str, Any]], gates: dict[str, Any]
) -> dict[str, Any]:
    if not candidates:
        raise ValueError("checkpoint census is empty")
    return max(
        candidates,
        key=lambda candidate: neutral_development_rank(
            candidate["development"], gates, candidate["step"]
        ),
    )


def compact_adapter(source: Path, destination: Path) -> None:
    shutil.copytree(source, destination)
    if not (destination / "adapter_model.safetensors").is_file():
        raise ValueError(f"compact adapter is missing weights: {source}")
    if not (destination / "snapshot-manifest.json").is_file():
        raise ValueError(f"compact adapter is missing snapshot provenance: {source}")


def full_fault_count(summary: dict[str, Any], suites: list[str]) -> int:
    return sum(
        sum(int(value) for value in summary["suites"][suite]["faults"].values())
        for suite in suites
    )


def full_gates(
    candidate: dict[str, Any], baseline: dict[str, Any], gates: dict[str, Any]
) -> dict[str, bool]:
    deployment_suites = list(gates["deployment_zero_fault_suites"])
    return {
        "deployment_mechanical_faults_zero": full_fault_count(
            candidate, deployment_suites
        )
        == 0,
        "fixed_utterance_retention": candidate["suites"]["retention"]["exact"]
        == baseline["suites"]["retention"]["exact"],
        "synthetic_chrf2_noninferiority": candidate["suites"]["synthetic_holdout"][
            "mean_chrf2"
        ]
        >= baseline["suites"]["synthetic_holdout"]["mean_chrf2"]
        - float(gates["maximum_synthetic_chrf2_loss"]),
        "synthetic_exact_noninferiority": candidate["suites"]["synthetic_holdout"][
            "exact"
        ]
        >= baseline["suites"]["synthetic_holdout"]["exact"]
        - int(gates["maximum_synthetic_exact_count_loss"]),
    }


def family_floor(metrics: dict[str, Any], minimum: int) -> bool:
    families = metrics["by_contrast_family"]
    return bool(families) and all(
        int(group["both_slots_present"]) >= minimum for group in families.values()
    )


def candidate_screen_gates(
    development: dict[str, Any],
    baseline: dict[str, Any],
    control: dict[str, Any],
    full_gate_result: dict[str, bool],
    gates: dict[str, Any],
) -> dict[str, bool]:
    composition = endpoint(development, "composition_plain")
    held_inline = endpoint(development, "held_lexeme_inline")
    copy_screen = endpoint(development, "copy_screen")
    baseline_composition = endpoint(baseline, "composition_plain")
    control_composition = endpoint(control, "composition_plain")
    comparison_exact = max(
        baseline_composition["exact"], control_composition["exact"]
    )
    comparison_slots = max(
        baseline_composition["both_slots_present"],
        control_composition["both_slots_present"],
    )
    return {
        "development_faults_zero": fault_count(development["metrics"]) == 0,
        "composition_plain_minimum_exact": composition["exact"]
        >= int(gates["minimum_composition_plain_exact"]),
        "held_inline_minimum_exact": held_inline["exact"]
        >= int(gates["minimum_held_inline_exact"]),
        "copy_screen_minimum_exact": copy_screen["exact"]
        >= int(gates["minimum_copy_screen_exact"]),
        "composition_beats_b0_and_control": composition["exact"] > comparison_exact
        or composition["both_slots_present"] > comparison_slots,
        "composition_family_floor": family_floor(
            composition, int(gates["minimum_slots_per_composition_family"])
        ),
        **full_gate_result,
    }


def copy_intervention_comparison(
    treatment: dict[str, Any], sentence_control: dict[str, Any]
) -> dict[str, bool]:
    treatment_composition = endpoint(treatment, "composition_plain")
    treatment_held = endpoint(treatment, "held_lexeme_inline")
    treatment_copy = endpoint(treatment, "copy_screen")
    control_composition = endpoint(sentence_control, "composition_plain")
    control_held = endpoint(sentence_control, "held_lexeme_inline")
    control_copy = endpoint(sentence_control, "copy_screen")
    return {
        "copy_not_worse_than_sentence_control": treatment_copy["exact"]
        >= control_copy["exact"],
        "held_inline_not_worse_than_sentence_control": treatment_held["exact"]
        >= control_held["exact"],
        "composition_loses_at_most_one_exact": treatment_composition["exact"]
        >= control_composition["exact"] - 1,
        "strict_copy_or_uptake_improvement": treatment_copy["exact"]
        > control_copy["exact"]
        or treatment_held["exact"] > control_held["exact"],
    }


def neutral_candidate_screen_gates(
    development: dict[str, Any],
    baseline: dict[str, Any],
    full_gate_result: dict[str, bool],
    gates: dict[str, Any],
) -> dict[str, bool]:
    composition = endpoint(development, "composition_plain")
    held_inline = endpoint(development, "held_lexeme_inline")
    neutral_single = endpoint(development, "neutral_single_copy_screen")
    neutral_dual = endpoint(development, "neutral_dual_copy_screen")
    baseline_composition = endpoint(baseline, "composition_plain")
    return {
        "development_faults_zero": fault_count(development["metrics"]) == 0,
        "composition_plain_minimum_exact": composition["exact"]
        >= int(gates["minimum_composition_plain_exact"]),
        "held_inline_minimum_exact": held_inline["exact"]
        >= int(gates["minimum_held_inline_exact"]),
        "neutral_single_screen_minimum_exact": neutral_single["exact"]
        >= int(gates["minimum_neutral_single_screen_exact"]),
        "neutral_dual_screen_minimum_exact": neutral_dual["exact"]
        >= int(gates["minimum_neutral_dual_screen_exact"]),
        "composition_beats_b0": composition["exact"]
        > baseline_composition["exact"]
        or composition["both_slots_present"]
        > baseline_composition["both_slots_present"],
        "composition_family_floor": family_floor(
            composition, int(gates["minimum_slots_per_composition_family"])
        ),
        **full_gate_result,
    }


def neutral_dual_intervention_comparison(
    treatment: dict[str, Any], single_control: dict[str, Any]
) -> dict[str, bool]:
    treatment_composition = endpoint(treatment, "composition_plain")
    treatment_held = endpoint(treatment, "held_lexeme_inline")
    treatment_dual = endpoint(treatment, "neutral_dual_copy_screen")
    control_composition = endpoint(single_control, "composition_plain")
    control_held = endpoint(single_control, "held_lexeme_inline")
    control_dual = endpoint(single_control, "neutral_dual_copy_screen")
    return {
        "held_inline_not_worse_than_single_control": treatment_held["exact"]
        >= control_held["exact"],
        "composition_loses_at_most_one_exact": treatment_composition["exact"]
        >= control_composition["exact"] - 1,
        "strict_dual_copy_or_held_uptake_improvement": treatment_dual["exact"]
        > control_dual["exact"]
        or treatment_held["exact"] > control_held["exact"],
    }


def dedicated_copy_token_intervention_comparison(
    treatment: dict[str, Any], prior_control: dict[str, Any]
) -> dict[str, bool]:
    treatment_composition = endpoint(treatment, "composition_plain")
    treatment_held = endpoint(treatment, "held_lexeme_inline")
    treatment_single = endpoint(treatment, "neutral_single_copy_screen")
    treatment_dual = endpoint(treatment, "neutral_dual_copy_screen")
    return {
        "composition_loses_at_most_one_exact_vs_d6": treatment_composition["exact"]
        >= int(prior_control["composition_plain_exact"]) - 1,
        "held_inline_not_worse_than_d6": treatment_held["exact"]
        >= int(prior_control["held_lexeme_inline_exact"]),
        "neutral_single_not_worse_than_d6": treatment_single["exact"]
        >= int(prior_control["neutral_single_copy_exact"]),
        "neutral_dual_not_worse_than_d6": treatment_dual["exact"]
        >= int(prior_control["neutral_dual_copy_exact"]),
        "strict_copy_improvement_vs_d6": treatment_single["exact"]
        > int(prior_control["neutral_single_copy_exact"])
        or treatment_dual["exact"]
        > int(prior_control["neutral_dual_copy_exact"]),
    }


def neutral_confirmation_gates(
    summaries: dict[str, dict[str, Any]], gates: dict[str, Any]
) -> dict[str, bool]:
    single = endpoint(summaries["neutral_single_confirmation"], "neutral_single_copy_confirmation")
    dual = endpoint(summaries["neutral_dual_confirmation"], "neutral_dual_copy_confirmation")
    return {
        "neutral_single_confirmation_faults_zero": fault_count(single) == 0,
        "neutral_dual_confirmation_faults_zero": fault_count(dual) == 0,
        "neutral_single_confirmation_minimum_exact": single["exact"]
        >= int(gates["minimum_neutral_single_confirmation_exact"]),
        "neutral_dual_confirmation_minimum_exact": dual["exact"]
        >= int(gates["minimum_neutral_dual_confirmation_exact"]),
    }


def confirmation_gates(summary: dict[str, Any], gates: dict[str, Any]) -> dict[str, bool]:
    metrics = endpoint(summary, "copy_confirmation")
    return {
        "copy_confirmation_faults_zero": fault_count(metrics) == 0,
        "copy_confirmation_minimum_exact": metrics["exact"]
        >= int(gates["minimum_copy_confirmation_exact"]),
    }


def recursive_manifest(root: Path) -> dict[str, Any]:
    return {
        str(path.relative_to(root)): {
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
        }
        for path in sorted(root.rglob("*"))
        if path.is_file() and path.name != "RESULT-MANIFEST.json"
    }


def read_summary(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    args = parse_args()
    kit_dir = args.kit_dir.resolve()
    output_dir = args.output_dir.resolve()
    contract = json.loads((kit_dir / "CONTRACT.json").read_text(encoding="utf-8"))
    experiment_kind = str(contract.get("experiment_kind", "copy_composition"))
    neutral_mode = experiment_kind == "neutral_copy_composition"
    dedicated_copy_mode = experiment_kind == "dedicated_copy_task_token"
    neutral_endpoints = neutral_mode or dedicated_copy_mode
    confirmation_bindings = (
        list(contract["confirmations"].values())
        if neutral_endpoints
        else [contract["copy_confirmation"]]
    )

    for binding in [
        contract["development_screen"],
        *confirmation_bindings,
        *contract["evaluation"].values(),
    ]:
        path = kit_dir / binding["path"]
        verify_file(path, binding["sha256"])
        load_bound_jsonl(path, int(binding["rows"]))
    schedule_rows = set()
    for arm, binding in contract["arms"].items():
        path = kit_dir / binding["schedule_path"]
        verify_file(path, binding["schedule_sha256"])
        rows = load_bound_jsonl(path, int(binding["schedule_rows"]))
        verify_schedule(rows, arm, binding)
        schedule_rows.add(len(rows))
    if len(schedule_rows) != 1:
        raise ValueError("all arms must have equal presentation counts")
    presentations = schedule_rows.pop()
    training = contract["training"]
    expected_presentations = (
        int(training["physical_batch_size"])
        * int(training["gradient_accumulation_steps"])
        * int(training["optimizer_updates"])
    )
    if presentations != expected_presentations:
        raise ValueError(
            f"schedule cannot produce frozen update count: {presentations} != {expected_presentations}"
        )
    checkpoints = [int(step) for step in training["checkpoint_updates"]]
    if checkpoints != sorted(set(checkpoints)) or checkpoints[-1] != int(
        training["optimizer_updates"]
    ):
        raise ValueError("checkpoint steps must be sorted, unique, and end at max steps")
    for relative_path, expected in contract["initial_adapter"]["files"].items():
        verify_file(kit_dir / relative_path, expected)
    adapter_config = json.loads(
        (kit_dir / "payload/initial-adapter/adapter_config.json").read_text(
            encoding="utf-8"
        )
    )
    if adapter_config.get("trainable_token_indices") != contract["initial_adapter"].get(
        "trainable_token_indices"
    ):
        raise ValueError("initial adapter selective-token indices changed")
    runtime_tokens = runtime_appended_tokens(contract)
    if runtime_tokens:
        base_vocabulary_size = int(contract["tokenizer"]["base_vocabulary_size"])
        expected_ids = list(
            range(base_vocabulary_size, base_vocabulary_size + len(runtime_tokens))
        )
        observed_ids = [int(record["token_id"]) for record in runtime_tokens]
        if observed_ids != expected_ids:
            raise ValueError(
                f"runtime token IDs are not contiguous append rows: {observed_ids}"
            )
        if int(contract["tokenizer"]["expected_runtime_vocabulary_size"]) != (
            base_vocabulary_size + len(runtime_tokens)
        ):
            raise ValueError("runtime tokenizer vocabulary-size contract changed")
    if dedicated_copy_mode:
        if runtime_tokens != [
            {
                "token": "<copy>",
                "token_id": 256208,
                "initialization": "base_decomposition_mean_float32",
                "base_decomposition_ids": [45, 54503, 248078, 248123],
            }
        ]:
            raise ValueError("dedicated-copy token binding changed")
        for arm, binding in contract["arms"].items():
            rows = load_bound_jsonl(
                kit_dir / binding["schedule_path"], int(binding["schedule_rows"])
            )
            for row in rows:
                is_copy = str(row["task"]) == "neutral_terminology_copy_auxiliary"
                has_copy_prefix = str(row["input_text"]).startswith("<copy> ")
                if is_copy != has_copy_prefix:
                    raise ValueError(
                        f"copy-task prefix placement changed: {row.get('id')}"
                    )
            if "<copy>" not in binding["required_trainable_token_updates"]:
                raise ValueError(f"{arm} does not require a <copy> row update")
        development_rows = load_bound_jsonl(
            kit_dir / contract["development_screen"]["path"],
            int(contract["development_screen"]["rows"]),
        )
        for row in development_rows:
            is_copy = str(row["evaluation_endpoint"]).startswith("neutral_")
            has_copy_prefix = str(row["input_text"]).startswith("<copy> ")
            if is_copy != has_copy_prefix:
                raise ValueError(
                    f"development copy-task prefix placement changed: {row.get('id')}"
                )
    if contract["claims"]["sealed_test_included"] is not False:
        raise ValueError("screening kit declares a sealed test")
    if args.preflight_only:
        confirmation_rows = sum(int(binding["rows"]) for binding in confirmation_bindings)
        print(
            json.dumps(
                {
                    "status": (
                        "PASS_STATIC_DEDICATED_COPY_TASK_TOKEN_SCREEN_KIT_PREFLIGHT"
                        if dedicated_copy_mode
                        else "PASS_STATIC_NEUTRAL_COPY_COMPOSITION_SCREEN_KIT_PREFLIGHT"
                        if neutral_mode
                        else "PASS_STATIC_COPY_COMPOSITION_SCREEN_KIT_PREFLIGHT"
                    ),
                    "run_id": contract["run_id"],
                    "arms": sorted(contract["arms"]),
                    "presentations_per_arm": presentations,
                    "optimizer_updates_per_arm": training["optimizer_updates"],
                    "adapter_snapshot_steps": checkpoints,
                    "development_rows": contract["development_screen"]["rows"],
                    "confirmation_rows": confirmation_rows,
                    "sealed_test_in_kit": False,
                },
                indent=2,
                sort_keys=True,
            )
        )
        return

    from huggingface_hub import snapshot_download

    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    logs_dir = output_dir / "logs"
    logs_dir.mkdir()
    work_dir = output_dir / "work"
    model_snapshot = Path(
        snapshot_download(
            repo_id=contract["base_release"]["repo_id"],
            revision=contract["base_release"]["revision"],
            local_dir=work_dir / "base-release",
            allow_patterns=["base/*", "release.json"],
        )
    )
    base_dir = model_snapshot / "base"
    for relative_path, expected in contract["base_release"]["files"].items():
        verify_file(model_snapshot / relative_path, expected)
    initial_adapter = kit_dir / "payload/initial-adapter"
    development_root = output_dir / "development"
    full_root = output_dir / "full-evaluation"
    selected_root = output_dir / "selected-adapters"
    for path in (development_root, full_root, selected_root):
        path.mkdir()

    run(
        endpoint_evaluation_command(
            contract,
            kit_dir,
            base_dir,
            initial_adapter,
            "development_screen",
            development_root / "B0",
            "B0-development",
        ),
        logs_dir / "evaluate-development-B0.log",
    )
    run(
        full_evaluation_command(
            contract, kit_dir, base_dir, initial_adapter, full_root / "B0", "B0"
        ),
        logs_dir / "evaluate-full-B0.log",
    )
    baseline_development = read_summary(development_root / "B0/SUMMARY.json")
    baseline_full = read_summary(full_root / "B0/SUMMARY.json")

    selected: dict[str, dict[str, Any]] = {}
    checkpoint_census: dict[str, list[dict[str, Any]]] = {}
    training_roots: list[Path] = []
    for arm in sorted(contract["arms"]):
        training_dir = output_dir / "arms" / arm / "training"
        training_dir.parent.mkdir(parents=True)
        training_roots.append(training_dir)
        run(
            training_command(contract, kit_dir, base_dir, arm, training_dir),
            logs_dir / f"train-{arm}.log",
        )
        candidates = []
        for step in checkpoints:
            adapter_dir = training_dir / "adapter-snapshots" / f"step-{step}"
            if not adapter_dir.is_dir():
                raise ValueError(f"missing {arm} adapter snapshot {step}")
            label = f"{arm}-step-{step}"
            run(
                endpoint_evaluation_command(
                    contract,
                    kit_dir,
                    base_dir,
                    adapter_dir,
                    "development_screen",
                    development_root / label,
                    f"{label}-development",
                ),
                logs_dir / f"evaluate-development-{label}.log",
            )
            candidates.append(
                {
                    "step": step,
                    "label": label,
                    "adapter_dir": adapter_dir,
                    "development": read_summary(
                        development_root / label / "SUMMARY.json"
                    ),
                }
            )
        chosen = (
            choose_neutral_checkpoint(candidates, contract["gates"])
            if neutral_endpoints
            else choose_checkpoint(candidates, contract["gates"])
        )
        compact_path = selected_root / arm
        compact_adapter(chosen["adapter_dir"], compact_path)
        selected[arm] = {
            **chosen,
            "adapter_dir": compact_path,
            "adapter_weight_sha256": sha256_file(
                compact_path / "adapter_model.safetensors"
            ),
        }
        checkpoint_census[arm] = [
            {
                "step": candidate["step"],
                "label": candidate["label"],
                "metrics": candidate["development"]["metrics"],
                "rank": list(
                    (
                        neutral_development_rank(
                            candidate["development"],
                            contract["gates"],
                            candidate["step"],
                        )
                        if neutral_endpoints
                        else development_rank(
                            candidate["development"],
                            contract["gates"],
                            candidate["step"],
                        )
                    )
                ),
            }
            for candidate in candidates
        ]

    full_summaries = {"B0": baseline_full}
    for arm, value in selected.items():
        run(
            full_evaluation_command(
                contract,
                kit_dir,
                base_dir,
                value["adapter_dir"],
                full_root / arm,
                arm,
            ),
            logs_dir / f"evaluate-full-{arm}.log",
        )
        full_summaries[arm] = read_summary(full_root / arm / "SUMMARY.json")

    full_gate_results = {
        arm: full_gates(full_summaries[arm], baseline_full, contract["gates"])
        for arm in selected
    }
    if dedicated_copy_mode:
        candidate_gate_results = {
            arm: neutral_candidate_screen_gates(
                selected[arm]["development"],
                baseline_development,
                full_gate_results[arm],
                contract["gates"],
            )
            for arm in contract["roles"]["candidates"]
        }
        candidate = contract["roles"]["copy_task_treatment"]
        copy_comparison = dedicated_copy_token_intervention_comparison(
            selected[candidate]["development"], contract["prior_control"]
        )
        candidate_gate_results[candidate].update(
            {
                f"dedicated_copy_token_{key}": value
                for key, value in copy_comparison.items()
            }
        )
    elif neutral_mode:
        candidate_gate_results = {
            arm: neutral_candidate_screen_gates(
                selected[arm]["development"],
                baseline_development,
                full_gate_results[arm],
                contract["gates"],
            )
            for arm in contract["roles"]["candidates"]
        }
        copy_comparison = neutral_dual_intervention_comparison(
            selected[contract["roles"]["neutral_dual_treatment"]]["development"],
            selected[contract["roles"]["neutral_single_control"]]["development"],
        )
        candidate_gate_results[contract["roles"]["neutral_dual_treatment"]].update(
            {
                f"neutral_dual_intervention_{key}": value
                for key, value in copy_comparison.items()
            }
        )
    else:
        control_development = selected[contract["roles"]["control"]]["development"]
        candidate_gate_results = {
            arm: candidate_screen_gates(
                selected[arm]["development"],
                baseline_development,
                control_development,
                full_gate_results[arm],
                contract["gates"],
            )
            for arm in contract["roles"]["candidates"]
        }
        copy_comparison = copy_intervention_comparison(
            selected[contract["roles"]["copy_treatment"]]["development"],
            selected[contract["roles"]["sentence_control"]]["development"],
        )
        candidate_gate_results[contract["roles"]["copy_treatment"]].update(
            {f"copy_intervention_{key}": value for key, value in copy_comparison.items()}
        )
    passing = [
        arm
        for arm, result in candidate_gate_results.items()
        if all(result.values())
    ]
    candidate_pool = passing or list(contract["roles"]["candidates"])
    winning_candidate = max(
        candidate_pool,
        key=lambda arm: (
            neutral_development_rank(
                selected[arm]["development"],
                contract["gates"],
                selected[arm]["step"],
            )
            if neutral_endpoints
            else development_rank(
                selected[arm]["development"],
                contract["gates"],
                selected[arm]["step"],
            )
        ),
    )
    preliminary_pass = bool(passing)
    confirmation_summary: Any = None
    confirmation_gate_result = {
        "status": "NOT_EVALUATED_NO_PRELIMINARY_PASS",
        "passed": False,
    }
    if preliminary_pass:
        if neutral_endpoints:
            confirmation_summary = {}
            for binding_name in sorted(contract["confirmations"]):
                confirmation_dir = (
                    output_dir / "copy-confirmation" / winning_candidate / binding_name
                )
                run(
                    endpoint_evaluation_command(
                        contract,
                        kit_dir,
                        base_dir,
                        selected[winning_candidate]["adapter_dir"],
                        binding_name,
                        confirmation_dir,
                        f"{winning_candidate}-{binding_name}",
                    ),
                    logs_dir
                    / f"evaluate-{binding_name}-{winning_candidate}.log",
                )
                confirmation_summary[binding_name] = read_summary(
                    confirmation_dir / "SUMMARY.json"
                )
            gates = neutral_confirmation_gates(
                confirmation_summary, contract["gates"]
            )
        else:
            confirmation_dir = output_dir / "copy-confirmation" / winning_candidate
            run(
                endpoint_evaluation_command(
                    contract,
                    kit_dir,
                    base_dir,
                    selected[winning_candidate]["adapter_dir"],
                    "copy_confirmation",
                    confirmation_dir,
                    f"{winning_candidate}-copy-confirmation",
                ),
                logs_dir / f"evaluate-copy-confirmation-{winning_candidate}.log",
            )
            confirmation_summary = read_summary(confirmation_dir / "SUMMARY.json")
            gates = confirmation_gates(confirmation_summary, contract["gates"])
        confirmation_gate_result = {
            "status": "EVALUATED_AFTER_CHECKPOINT_SELECTION",
            "passed": all(gates.values()),
            "gates": gates,
        }
    screen_pass = preliminary_pass and bool(confirmation_gate_result["passed"])
    result = {
        "schema_version": 1,
        "run_id": contract["run_id"],
        "created_at_utc": utc_now(),
        "status": (
            (
                "POSITIVE_INTERNAL_DEDICATED_COPY_TASK_TOKEN_SCREEN"
                if dedicated_copy_mode
                else "POSITIVE_INTERNAL_NEUTRAL_COPY_COMPOSITION_SCREEN"
                if neutral_mode
                else "POSITIVE_INTERNAL_COPY_COMPOSITION_SCREEN"
            )
            if screen_pass
            else (
                "NEGATIVE_OR_INCONCLUSIVE_DEDICATED_COPY_TASK_TOKEN_SCREEN"
                if dedicated_copy_mode
                else "NEGATIVE_OR_INCONCLUSIVE_NEUTRAL_COPY_COMPOSITION_SCREEN"
                if neutral_mode
                else "NEGATIVE_OR_INCONCLUSIVE_COPY_COMPOSITION_SCREEN"
            )
        ),
        "winning_candidate": winning_candidate,
        "preliminary_pass": preliminary_pass,
        "screen_pass": screen_pass,
        "public_promotion_authorized": False,
        "sealed_test_opened": False,
        "selection_rule": contract["selection_rule"],
        "baseline": {
            "development": baseline_development,
            "full": baseline_full,
        },
        "selected_checkpoints": {
            arm: {
                "step": value["step"],
                "label": value["label"],
                "adapter_weight_sha256": value["adapter_weight_sha256"],
                "development": value["development"],
            }
            for arm, value in selected.items()
        },
        "checkpoint_census": checkpoint_census,
        "full_summaries": full_summaries,
        "full_gate_results": full_gate_results,
        "candidate_gate_results": candidate_gate_results,
        "intervention_comparison": copy_comparison,
        "copy_confirmation": {
            **confirmation_gate_result,
            "summary": confirmation_summary,
        },
        "serving_determinism_test_required_before_release": True,
        "multi_seed_confirmation_required_before_sealed_test": True,
        "claim_limit": contract["claim_limit"],
    }
    write_json(output_dir / "RESULT.json", result)

    deletion_roots = [*training_roots, work_dir]
    deletion_ledger = {
        "schema_version": 1,
        "deleted_at_utc": utc_now(),
        "deleted_roots": [str(path) for path in deletion_roots],
        "retained_adapters": {
            arm: value["adapter_weight_sha256"] for arm, value in selected.items()
        },
        "reason": "Retain selected adapter-only snapshots and evaluations; remove all training states, unselected snapshots, the duplicate final adapters, and downloaded base working files.",
    }
    for path in deletion_roots:
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

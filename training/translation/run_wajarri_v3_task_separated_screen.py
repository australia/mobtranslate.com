#!/usr/bin/env python3
"""Run the bounded Wajarri v3 task-separated sentence-adapter screen."""

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
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
    if len(rows) != expected_rows:
        raise ValueError(f"row-count mismatch for {path}: {len(rows)} != {expected_rows}")
    return rows


def verify_schedule(rows: list[dict[str, Any]], arm: str, binding: dict[str, Any]) -> None:
    required = {
        "accounting_parent_id",
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
    observed_tokens = {
        "source_non_padding_tokens": sum(
            int(row["token_accounting"]["source_tokens_with_specials"]) for row in rows
        ),
        "target_non_padding_tokens": sum(
            int(row["token_accounting"]["target_tokens_with_specials"]) for row in rows
        ),
        "non_padding_tokens": sum(
            int(row["token_accounting"]["non_padding_tokens_with_specials"]) for row in rows
        ),
    }
    for key, value in observed_tokens.items():
        if value != int(binding[key]):
            raise ValueError(f"{key} mismatch for {arm}: {value} != {binding[key]}")


def training_command(
    contract: dict[str, Any], kit_dir: Path, base_dir: Path, arm: str, output_dir: Path
) -> list[str]:
    training = contract["training"]
    arm_contract = contract["arms"][arm]
    command = [
        sys.executable,
        str(kit_dir / "code/training/translation/train_nllb_lora.py"),
        "--train-file",
        str(kit_dir / arm_contract["schedule_path"]),
        "--output-dir",
        str(output_dir),
        "--model-id",
        f"mobtranslate-wajarri-v3-{arm.lower()}-task-separated-screen",
        "--model-version",
        f"v3-task-separated-{arm.lower()}-s{training['seed']}",
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
    for token in ("wbv_Latn", "<lexeme>", "<translate>", "<glossary>"):
        command.extend(["--trainable-token", token])
    required_updates = ["wbv_Latn", "<translate>"]
    if any("glossary" in task for task in arm_contract["task_presentations"]):
        required_updates.append("<glossary>")
    for token in required_updates:
        command.extend(["--required-trainable-token-update", token])
    return command


def contrast_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    adapter_dir: Path,
    output_dir: Path,
    label: str,
    binding_name: str,
    batch_sizes: str = "16",
) -> list[str]:
    binding = contract[binding_name]
    return [
        sys.executable,
        str(kit_dir / "code/evaluate_task_separated.py"),
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


def fault_count(summary: dict[str, Any]) -> int:
    return sum(int(value) for value in summary["metrics"]["faults"].values())


def development_rank(
    plain: dict[str, Any], glossary: dict[str, Any], step: int
) -> tuple[Any, ...]:
    plain_metrics = plain["metrics"]
    glossary_metrics = glossary["metrics"]
    return (
        fault_count(plain) + fault_count(glossary) == 0,
        plain_metrics["exact"],
        glossary_metrics["exact"],
        plain_metrics["both_slots_present"],
        glossary_metrics["both_slots_present"],
        plain_metrics["predicate_present"],
        plain_metrics["subject_present"],
        plain_metrics["mean_chrf2"] + glossary_metrics["mean_chrf2"],
        -step,
    )


def choose_checkpoint(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    if not candidates:
        raise ValueError("checkpoint census is empty")
    return max(
        candidates,
        key=lambda candidate: development_rank(
            candidate["plain"], candidate["glossary"], candidate["step"]
        ),
    )


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
        "deployment_mechanical_faults_zero": full_fault_count(candidate, deployment_suites) == 0,
        "fixed_utterance_retention": candidate["suites"]["retention"]["exact"]
        == baseline["suites"]["retention"]["exact"],
        "synthetic_chrf2_noninferiority": candidate["suites"]["synthetic_holdout"]["mean_chrf2"]
        >= baseline["suites"]["synthetic_holdout"]["mean_chrf2"]
        - float(gates["maximum_synthetic_chrf2_loss"]),
        "synthetic_exact_noninferiority": candidate["suites"]["synthetic_holdout"]["exact"]
        >= baseline["suites"]["synthetic_holdout"]["exact"]
        - int(gates["maximum_synthetic_exact_count_loss"]),
    }


def family_floor(metrics: dict[str, Any], minimum: int) -> bool:
    return all(
        int(group["both_slots_present"]) >= minimum
        for group in metrics["by_contrast_family"].values()
    )


def treatment_screen_gates(
    plain: dict[str, Any],
    glossary: dict[str, Any],
    baseline_plain: dict[str, Any],
    control_plain: dict[str, Any],
    full_gate_result: dict[str, bool],
    plain_batch: dict[str, Any],
    glossary_batch: dict[str, Any],
    gates: dict[str, Any],
) -> dict[str, bool]:
    plain_metrics = plain["metrics"]
    glossary_metrics = glossary["metrics"]
    comparison_exact = max(
        baseline_plain["metrics"]["exact"], control_plain["metrics"]["exact"]
    )
    comparison_slots = max(
        baseline_plain["metrics"]["both_slots_present"],
        control_plain["metrics"]["both_slots_present"],
    )
    return {
        "development_faults_zero": fault_count(plain) + fault_count(glossary) == 0,
        "plain_minimum_exact": plain_metrics["exact"] >= gates["minimum_plain_exact"],
        "glossary_minimum_exact": glossary_metrics["exact"] >= gates["minimum_glossary_exact"],
        "plain_beats_b0_and_control": plain_metrics["exact"] > comparison_exact
        or plain_metrics["both_slots_present"] > comparison_slots,
        "plain_family_floor": family_floor(plain_metrics, gates["minimum_slots_per_family"]),
        "glossary_family_floor": family_floor(
            glossary_metrics, gates["minimum_slots_per_family"]
        ),
        "plain_batch_invariant": plain_batch["batch_invariance"]["all_outputs_identical"],
        "glossary_batch_invariant": glossary_batch["batch_invariance"]["all_outputs_identical"],
        **full_gate_result,
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
    from huggingface_hub import snapshot_download

    args = parse_args()
    kit_dir = args.kit_dir.resolve()
    output_dir = args.output_dir.resolve()
    contract_path = kit_dir / "CONTRACT.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))

    for binding in [
        contract["development"],
        contract["glossary_development"],
        *contract["evaluation"].values(),
    ]:
        path = kit_dir / binding["path"]
        verify_file(path, binding["sha256"])
        load_bound_jsonl(path, binding["rows"])
    schedule_rows = set()
    for arm, binding in contract["arms"].items():
        path = kit_dir / binding["schedule_path"]
        verify_file(path, binding["schedule_sha256"])
        rows = load_bound_jsonl(path, binding["schedule_rows"])
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
            f"schedule cannot produce the frozen update count: {presentations} != {expected_presentations}"
        )
    for relative_path, expected in contract["initial_adapter"]["files"].items():
        verify_file(kit_dir / relative_path, expected)
    if args.preflight_only:
        print(
            json.dumps(
                {
                    "status": "PASS_STATIC_TASK_SEPARATED_KIT_PREFLIGHT",
                    "run_id": contract["run_id"],
                    "arms": sorted(contract["arms"]),
                    "presentations_per_arm": presentations,
                    "optimizer_updates_per_arm": training["optimizer_updates"],
                    "development_rows": contract["development"]["rows"],
                    "sealed_test_in_kit": False,
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
    plain_root = output_dir / "development-plain"
    glossary_root = output_dir / "development-glossary"
    full_root = output_dir / "full-evaluation"
    batch_root = output_dir / "batch-invariance"
    selected_root = output_dir / "selected-adapters"
    for path in (plain_root, glossary_root, full_root, batch_root, selected_root):
        path.mkdir()

    for binding_name, root in (
        ("development", plain_root),
        ("glossary_development", glossary_root),
    ):
        run(
            contrast_command(
                contract,
                kit_dir,
                base_dir,
                initial_adapter,
                root / "B0",
                f"B0-{binding_name}",
                binding_name,
            ),
            logs_dir / f"evaluate-{binding_name}-B0.log",
        )
    run(
        full_evaluation_command(
            contract, kit_dir, base_dir, initial_adapter, full_root / "B0", "B0"
        ),
        logs_dir / "evaluate-full-B0.log",
    )
    baseline_plain = read_summary(plain_root / "B0/SUMMARY.json")
    baseline_glossary = read_summary(glossary_root / "B0/SUMMARY.json")
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
        for step in training["checkpoint_updates"]:
            adapter_dir = training_dir / f"checkpoint-{step}"
            if not adapter_dir.is_dir() and step == training["optimizer_updates"]:
                adapter_dir = training_dir / "adapter"
            if not adapter_dir.is_dir():
                raise ValueError(f"missing {arm} checkpoint {step}")
            label = f"{arm}-step-{step}"
            for binding_name, root in (
                ("development", plain_root),
                ("glossary_development", glossary_root),
            ):
                run(
                    contrast_command(
                        contract,
                        kit_dir,
                        base_dir,
                        adapter_dir,
                        root / label,
                        f"{label}-{binding_name}",
                        binding_name,
                    ),
                    logs_dir / f"evaluate-{binding_name}-{label}.log",
                )
            candidates.append(
                {
                    "step": step,
                    "label": label,
                    "adapter_dir": adapter_dir,
                    "plain": read_summary(plain_root / label / "SUMMARY.json"),
                    "glossary": read_summary(glossary_root / label / "SUMMARY.json"),
                }
            )
        chosen = choose_checkpoint(candidates)
        compact_path = selected_root / arm
        compact_adapter(chosen["adapter_dir"], compact_path)
        selected[arm] = {
            **chosen,
            "adapter_dir": compact_path,
            "adapter_weight_sha256": sha256_file(compact_path / "adapter_model.safetensors"),
        }
        checkpoint_census[arm] = [
            {
                "step": candidate["step"],
                "label": candidate["label"],
                "plain_metrics": candidate["plain"]["metrics"],
                "glossary_metrics": candidate["glossary"]["metrics"],
            }
            for candidate in candidates
        ]

    full_summaries = {"B0": baseline_full}
    batch_summaries: dict[str, dict[str, Any]] = {}
    evaluation_models = {"B0": initial_adapter, **{arm: value["adapter_dir"] for arm, value in selected.items()}}
    for label, adapter_dir in evaluation_models.items():
        if label != "B0":
            run(
                full_evaluation_command(
                    contract, kit_dir, base_dir, adapter_dir, full_root / label, label
                ),
                logs_dir / f"evaluate-full-{label}.log",
            )
            full_summaries[label] = read_summary(full_root / label / "SUMMARY.json")
        batch_summaries[label] = {}
        for binding_name, suffix in (
            ("development", "plain"),
            ("glossary_development", "glossary"),
        ):
            destination = batch_root / label / suffix
            destination.parent.mkdir(parents=True, exist_ok=True)
            run(
                contrast_command(
                    contract,
                    kit_dir,
                    base_dir,
                    adapter_dir,
                    destination,
                    f"{label}-{suffix}-batch-invariance",
                    binding_name,
                    contract["batch_invariance"]["batch_sizes_csv"],
                ),
                logs_dir / f"evaluate-batch-{suffix}-{label}.log",
            )
            batch_summaries[label][suffix] = read_summary(destination / "SUMMARY.json")

    full_gate_results = {
        arm: full_gates(full_summaries[arm], baseline_full, contract["gates"])
        for arm in selected
    }
    control_plain = selected[contract["roles"]["control"]]["plain"]
    treatment_gate_results = {
        arm: treatment_screen_gates(
            selected[arm]["plain"],
            selected[arm]["glossary"],
            baseline_plain,
            control_plain,
            full_gate_results[arm],
            batch_summaries[arm]["plain"],
            batch_summaries[arm]["glossary"],
            contract["gates"],
        )
        for arm in contract["roles"]["treatments"]
    }
    winning_treatment = max(
        contract["roles"]["treatments"],
        key=lambda arm: development_rank(
            selected[arm]["plain"], selected[arm]["glossary"], selected[arm]["step"]
        ),
    )
    screen_pass = all(treatment_gate_results[winning_treatment].values())
    result = {
        "schema_version": 1,
        "run_id": contract["run_id"],
        "created_at_utc": utc_now(),
        "status": (
            "POSITIVE_INTERNAL_TASK_SEPARATED_SCREEN"
            if screen_pass
            else "NEGATIVE_OR_INCONCLUSIVE_TASK_SEPARATED_SCREEN"
        ),
        "winning_treatment": winning_treatment,
        "screen_pass": screen_pass,
        "public_promotion_authorized": False,
        "sealed_test_opened": False,
        "selection_rule": contract["selection_rule"],
        "baseline": {
            "plain": baseline_plain["metrics"],
            "glossary": baseline_glossary["metrics"],
            "full": baseline_full,
        },
        "selected_checkpoints": {
            arm: {
                "step": value["step"],
                "label": value["label"],
                "adapter_weight_sha256": value["adapter_weight_sha256"],
                "plain_metrics": value["plain"]["metrics"],
                "glossary_metrics": value["glossary"]["metrics"],
            }
            for arm, value in selected.items()
        },
        "checkpoint_census": checkpoint_census,
        "full_summaries": full_summaries,
        "full_gate_results": full_gate_results,
        "batch_invariance": {
            label: {
                suffix: summary["batch_invariance"]
                for suffix, summary in suites.items()
            }
            for label, suites in batch_summaries.items()
        },
        "treatment_gate_results": treatment_gate_results,
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
        "reason": "Retain selected compact adapters and all evaluations; remove optimizer states, unselected checkpoints, and downloaded base working files.",
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

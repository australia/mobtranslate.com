#!/usr/bin/env python3
"""Run multi-seed confirmation of the forced Wajarri subject-slot route."""

from __future__ import annotations

import argparse
import copy
import json
import shutil
from pathlib import Path
from typing import Any

try:
    from copy_screen_runtime import (
        add_runtime_token_arguments,
        compact_adapter,
        full_evaluation_command,
        load_bound_jsonl,
        read_summary,
        recursive_manifest,
        run,
        runtime_appended_tokens,
        sha256_file,
        training_command,
        utc_now,
        verify_file,
        verify_schedule,
        write_json,
    )
except ModuleNotFoundError:
    from training.translation.run_wajarri_v3_copy_composition_screen import (
        add_runtime_token_arguments,
        compact_adapter,
        full_evaluation_command,
        load_bound_jsonl,
        read_summary,
        recursive_manifest,
        run,
        runtime_appended_tokens,
        sha256_file,
        training_command,
        utc_now,
        verify_file,
        verify_schedule,
        write_json,
    )


ARM = "M8"
SLOT_TOKEN = "<copy>"
MATCHED_ENDPOINTS = ("slot_composition_masked", "slot_held_masked")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kit-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--preflight-only", action="store_true")
    return parser.parse_args()


def endpoint(summary: dict[str, Any], name: str) -> dict[str, Any]:
    return summary["metrics"]["by_endpoint"][name]


def fault_count(metrics: dict[str, Any]) -> int:
    return sum(int(value) for value in metrics["faults"].values())


def route_metrics(summary: dict[str, Any]) -> dict[str, Any]:
    composition = endpoint(summary, MATCHED_ENDPOINTS[0])
    held = endpoint(summary, MATCHED_ENDPOINTS[1])
    rows = int(composition["rows"]) + int(held["rows"])
    return {
        "rows": rows,
        "raw_exact": int(composition["raw_exact"]) + int(held["raw_exact"]),
        "rendered_exact": int(composition["slot_rendered_exact"])
        + int(held["slot_rendered_exact"]),
        "slot_count_valid": int(composition["slot_count_valid"])
        + int(held["slot_count_valid"]),
        "slot_position_valid": int(composition["slot_position_valid"])
        + int(held["slot_position_valid"]),
        "predicate_present": int(composition["predicate_present"])
        + int(held["predicate_present"]),
        "mechanical_faults": fault_count(composition) + fault_count(held),
        "composition_rendered_exact": int(composition["slot_rendered_exact"]),
        "held_rendered_exact": int(held["slot_rendered_exact"]),
        "mean_chrf2": (
            float(composition["mean_chrf2"]) * int(composition["rows"])
            + float(held["mean_chrf2"]) * int(held["rows"])
        )
        / rows,
    }


def route_gates(summary: dict[str, Any], expected_rows: int) -> dict[str, bool]:
    metrics = route_metrics(summary)
    return {
        "evaluated_row_count_exact": int(summary["evaluated_rows"]) == expected_rows,
        "raw_template_exact": metrics["raw_exact"] == expected_rows,
        "rendered_clause_exact": metrics["rendered_exact"] == expected_rows,
        "slot_count_exact": metrics["slot_count_valid"] == expected_rows,
        "slot_position_exact": metrics["slot_position_valid"] == expected_rows,
        "predicate_presence_exact": metrics["predicate_present"] == expected_rows,
        "mechanical_faults_zero": metrics["mechanical_faults"] == 0,
    }


def checkpoint_rank(
    summary: dict[str, Any], expected_rows: int, step: int
) -> tuple[Any, ...]:
    metrics = route_metrics(summary)
    gates = route_gates(summary, expected_rows)
    return (
        all(gates.values()),
        metrics["rendered_exact"],
        metrics["raw_exact"],
        metrics["predicate_present"],
        -metrics["mechanical_faults"],
        metrics["mean_chrf2"],
        -step,
    )


def choose_checkpoint(
    candidates: list[dict[str, Any]], expected_rows: int
) -> dict[str, Any]:
    if not candidates:
        raise ValueError("checkpoint census is empty")
    return max(
        candidates,
        key=lambda candidate: checkpoint_rank(
            candidate["development"], expected_rows, int(candidate["step"])
        ),
    )


def full_guard_gates(
    candidate: dict[str, Any], baseline: dict[str, Any], gates: dict[str, Any]
) -> dict[str, bool]:
    return {
        "no_unresolved_task_token": int(
            candidate["faults"].get("unresolved_task_token", 0)
        )
        == 0,
        "fixed_utterance_retention_noninferiority": int(
            candidate["suites"]["retention"]["exact"]
        )
        >= int(baseline["suites"]["retention"]["exact"]),
        "synthetic_exact_noninferiority": int(
            candidate["suites"]["synthetic_holdout"]["exact"]
        )
        >= int(baseline["suites"]["synthetic_holdout"]["exact"])
        - int(gates["maximum_synthetic_exact_count_loss"]),
        "synthetic_chrf2_noninferiority": float(
            candidate["suites"]["synthetic_holdout"]["mean_chrf2"]
        )
        >= float(baseline["suites"]["synthetic_holdout"]["mean_chrf2"])
        - float(gates["maximum_synthetic_chrf2_loss"]),
    }


def trainer_seed_gates(snapshot_manifest: dict[str, Any], seed: int) -> dict[str, bool]:
    optimization = snapshot_manifest["binding"]["optimization"]
    return {
        "trainer_seed_bound_to_run": int(optimization["trainer_seed"]) == seed,
        "trainer_data_seed_bound_to_run": int(optimization["trainer_data_seed"])
        == seed,
    }


def seed_diversity_gates(seed_results: dict[str, dict[str, Any]]) -> dict[str, bool]:
    hashes = [
        str(result["adapter_weight_sha256"]) for result in seed_results.values()
    ]
    return {
        "selected_adapter_hashes_distinct_across_seeds": len(set(hashes))
        == len(hashes)
    }


def selected_seed_rank(result: dict[str, Any]) -> tuple[Any, ...]:
    full = result["full_summary"]
    return (
        all(result["combined_gates"].values()),
        int(full["suites"]["retention"]["exact"]),
        int(full["suites"]["synthetic_holdout"]["exact"]),
        float(full["suites"]["synthetic_holdout"]["mean_chrf2"]),
        -sum(int(value) for value in full["faults"].values()),
        -int(result["selected_step"]),
        -int(result["seed"]),
    )


def forced_route_evaluation_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    adapter_dir: Path,
    output_dir: Path,
    label: str,
    *,
    seed: int,
    batch_sizes: str,
) -> list[str]:
    binding = contract["development_screen"]
    command = [
        __import__("sys").executable,
        str(kit_dir / "code/evaluate_subject_slot.py"),
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
        contract["forced_route"]["dtype"],
        "--seed",
        str(seed),
        "--force-slot-after-target-lang",
    ]
    for name in MATCHED_ENDPOINTS:
        command.extend(["--include-endpoint", name])
    add_runtime_token_arguments(command, contract)
    return command


def seed_contract(contract: dict[str, Any], seed: int) -> dict[str, Any]:
    value = copy.deepcopy(contract)
    value["training"]["seed"] = seed
    value["run_id"] = f"{contract['run_id']}:seed-{seed}"
    return value


def main() -> None:
    args = parse_args()
    kit_dir = args.kit_dir.resolve()
    output_dir = args.output_dir.resolve()
    contract = json.loads((kit_dir / "CONTRACT.json").read_text(encoding="utf-8"))
    if contract.get("experiment_kind") != "forced_subject_slot_confirmation":
        raise ValueError("unexpected experiment kind")
    if sorted(contract["arms"]) != [ARM]:
        raise ValueError("confirmation kit must contain only M8")
    if contract["claims"]["sealed_test_included"] is not False:
        raise ValueError("confirmation kit declares a sealed test")

    seeds = [int(value) for value in contract["confirmation_seeds"]]
    if seeds != [17, 42, 73]:
        raise ValueError("confirmation seed set changed")
    binding = contract["development_screen"]
    development_path = kit_dir / binding["path"]
    verify_file(development_path, binding["sha256"])
    development_rows = load_bound_jsonl(development_path, int(binding["rows"]))
    observed_endpoint_counts = {
        name: sum(
            str(row["evaluation_endpoint"]) == name for row in development_rows
        )
        for name in MATCHED_ENDPOINTS
    }
    if observed_endpoint_counts != contract["forced_route"]["endpoint_rows"]:
        raise ValueError("forced-route endpoint census changed")
    expected_route_rows = sum(observed_endpoint_counts.values())
    if expected_route_rows != int(contract["forced_route"]["rows"]):
        raise ValueError("forced-route row count changed")
    for evaluation in contract["evaluation"].values():
        path = kit_dir / evaluation["path"]
        verify_file(path, evaluation["sha256"])
        load_bound_jsonl(path, int(evaluation["rows"]))

    arm_binding = contract["arms"][ARM]
    schedule_path = kit_dir / arm_binding["schedule_path"]
    verify_file(schedule_path, arm_binding["schedule_sha256"])
    schedule_rows = load_bound_jsonl(schedule_path, int(arm_binding["schedule_rows"]))
    verify_schedule(schedule_rows, ARM, arm_binding)
    for row in schedule_rows:
        if str(row["schedule_population"]) == "subject_slot":
            if str(row["input_text"]).count(SLOT_TOKEN) != 1:
                raise ValueError(f"M8 source slot changed: {row['id']}")
            if not str(row["output_text"]).startswith(SLOT_TOKEN + " "):
                raise ValueError(f"M8 target slot changed: {row['id']}")

    training = contract["training"]
    presentations = (
        int(training["physical_batch_size"])
        * int(training["gradient_accumulation_steps"])
        * int(training["optimizer_updates"])
    )
    if presentations != len(schedule_rows):
        raise ValueError("schedule cannot produce the frozen update count")
    checkpoints = [int(value) for value in training["checkpoint_updates"]]
    if checkpoints != sorted(set(checkpoints)) or checkpoints[-1] != int(
        training["optimizer_updates"]
    ):
        raise ValueError("checkpoint contract changed")
    for relative, expected in contract["initial_adapter"]["files"].items():
        verify_file(kit_dir / relative, expected)
    runtime_tokens = runtime_appended_tokens(contract)
    if runtime_tokens != [
        {
            "token": SLOT_TOKEN,
            "token_id": 256208,
            "initialization": "base_decomposition_mean_float32",
            "base_decomposition_ids": [45, 54503, 248078, 248123],
        }
    ]:
        raise ValueError("runtime slot-token contract changed")

    if args.preflight_only:
        print(
            json.dumps(
                {
                    "status": "PASS_STATIC_FORCED_SLOT_CONFIRMATION_PREFLIGHT",
                    "run_id": contract["run_id"],
                    "seeds": seeds,
                    "schedule_presentations_per_seed": len(schedule_rows),
                    "optimizer_updates_per_seed": training["optimizer_updates"],
                    "checkpoint_updates": checkpoints,
                    "forced_route_rows": expected_route_rows,
                    "forced_route_endpoints": observed_endpoint_counts,
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
    for relative, expected in contract["base_release"]["files"].items():
        verify_file(model_snapshot / relative, expected)

    initial_adapter = kit_dir / "payload/initial-adapter"
    baseline_contract = seed_contract(contract, seeds[0])
    baseline_dir = output_dir / "full-evaluation/T7"
    run(
        full_evaluation_command(
            baseline_contract,
            kit_dir,
            base_dir,
            initial_adapter,
            baseline_dir,
            "T7-confirmation-baseline",
        ),
        logs_dir / "evaluate-full-T7.log",
    )
    baseline_full = read_summary(baseline_dir / "SUMMARY.json")

    seed_results: dict[str, dict[str, Any]] = {}
    training_roots: list[Path] = []
    for seed in seeds:
        current = seed_contract(contract, seed)
        seed_root = output_dir / f"seeds/{seed}"
        training_dir = seed_root / "training"
        training_dir.parent.mkdir(parents=True)
        training_roots.append(training_dir)
        run(
            training_command(current, kit_dir, base_dir, ARM, training_dir),
            logs_dir / f"train-seed-{seed}.log",
        )
        candidates = []
        for step in checkpoints:
            adapter_dir = training_dir / "adapter-snapshots" / f"step-{step}"
            if not adapter_dir.is_dir():
                raise ValueError(f"missing seed {seed} adapter snapshot {step}")
            development_dir = seed_root / "development" / f"step-{step}"
            run(
                forced_route_evaluation_command(
                    contract,
                    kit_dir,
                    base_dir,
                    adapter_dir,
                    development_dir,
                    f"M8-seed-{seed}-step-{step}-forced-route",
                    seed=seed,
                    batch_sizes="16",
                ),
                logs_dir / f"evaluate-seed-{seed}-step-{step}.log",
            )
            candidates.append(
                {
                    "step": step,
                    "adapter_dir": adapter_dir,
                    "development": read_summary(development_dir / "SUMMARY.json"),
                }
            )
        chosen = choose_checkpoint(candidates, expected_route_rows)
        selected_dir = output_dir / f"selected-adapters/seed-{seed}"
        selected_dir.parent.mkdir(parents=True, exist_ok=True)
        compact_adapter(chosen["adapter_dir"], selected_dir)
        selected_sha = sha256_file(selected_dir / "adapter_model.safetensors")

        selected_validation_dir = seed_root / "selected-forced-route"
        run(
            forced_route_evaluation_command(
                contract,
                kit_dir,
                base_dir,
                selected_dir,
                selected_validation_dir,
                f"M8-seed-{seed}-selected-forced-route",
                seed=seed,
                batch_sizes=contract["forced_route"]["batch_sizes_csv"],
            ),
            logs_dir / f"evaluate-selected-seed-{seed}.log",
        )
        selected_summary = read_summary(selected_validation_dir / "SUMMARY.json")
        selected_snapshot_manifest = read_summary(
            selected_dir / "snapshot-manifest.json"
        )
        full_dir = output_dir / f"full-evaluation/seed-{seed}"
        run(
            full_evaluation_command(
                current,
                kit_dir,
                base_dir,
                selected_dir,
                full_dir,
                f"M8-seed-{seed}",
            ),
            logs_dir / f"evaluate-full-seed-{seed}.log",
        )
        full_summary = read_summary(full_dir / "SUMMARY.json")
        route_gate_result = route_gates(selected_summary, expected_route_rows)
        batch_gate = {
            "batch_1_16_outputs_identical": bool(
                selected_summary["batch_invariance"]["all_outputs_identical"]
            )
        }
        full_gate_result = full_guard_gates(
            full_summary, baseline_full, contract["gates"]
        )
        trainer_seed_gate_result = trainer_seed_gates(
            selected_snapshot_manifest, seed
        )
        combined_gates = {
            **route_gate_result,
            **batch_gate,
            **full_gate_result,
            **trainer_seed_gate_result,
        }
        seed_results[str(seed)] = {
            "seed": seed,
            "selected_step": int(chosen["step"]),
            "adapter_weight_sha256": selected_sha,
            "selected_forced_route": selected_summary,
            "full_summary": full_summary,
            "route_gates": route_gate_result,
            "batch_gate": batch_gate,
            "full_guard_gates": full_gate_result,
            "trainer_seed_gates": trainer_seed_gate_result,
            "combined_gates": combined_gates,
            "checkpoint_census": [
                {
                    "step": int(candidate["step"]),
                    "metrics": route_metrics(candidate["development"]),
                    "gates": route_gates(
                        candidate["development"], expected_route_rows
                    ),
                    "rank": list(
                        checkpoint_rank(
                            candidate["development"],
                            expected_route_rows,
                            int(candidate["step"]),
                        )
                    ),
                }
                for candidate in candidates
            ],
        }

    diversity_gates = seed_diversity_gates(seed_results)
    confirmation_pass = all(diversity_gates.values()) and all(
        all(result["combined_gates"].values()) for result in seed_results.values()
    )
    winning_seed = str(max(seed_results.values(), key=selected_seed_rank)["seed"])
    result = {
        "schema_version": 1,
        "run_id": contract["run_id"],
        "created_at_utc": utc_now(),
        "status": (
            "POSITIVE_INTERNAL_FORCED_SLOT_CONFIRMATION"
            if confirmation_pass
            else "NEGATIVE_OR_INCONCLUSIVE_FORCED_SLOT_CONFIRMATION"
        ),
        "confirmation_pass": confirmation_pass,
        "winning_seed": int(winning_seed),
        "winning_adapter_weight_sha256": seed_results[winning_seed][
            "adapter_weight_sha256"
        ],
        "seed_results": seed_results,
        "seed_diversity_gates": diversity_gates,
        "baseline_full": baseline_full,
        "controlled_route_candidate": confirmation_pass,
        "public_promotion_authorized": False,
        "free_form_sentence_generation_authorized": False,
        "natural_language_reliability_claimed": False,
        "next_gate": (
            "HF CPU float32 parity, fail-closed structured route integration, and model-bound registry publication"
            if confirmation_pass
            else "diagnose the failed seed and do not publish"
        ),
        "claim_limit": contract["claim_limit"],
    }
    write_json(output_dir / "RESULT.json", result)

    deletion_roots = [*training_roots, work_dir]
    deletion_ledger = {
        "schema_version": 1,
        "deleted_at_utc": utc_now(),
        "deleted_roots": [str(path) for path in deletion_roots],
        "retained_adapters": {
            seed: value["adapter_weight_sha256"]
            for seed, value in seed_results.items()
        },
        "reason": "Retain one selected adapter and complete evaluations per seed; remove optimizer state, unselected snapshots, duplicate final adapters, and downloaded base files.",
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

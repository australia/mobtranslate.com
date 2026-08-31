#!/usr/bin/env python3
"""Run the paired Wajarri v3 deterministic subject-slot screen."""

from __future__ import annotations

import argparse
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


SLOT_TOKEN = "<copy>"
ARM_ENDPOINTS = {
    "M8": ("slot_composition_masked", "slot_held_masked"),
    "D8": ("slot_composition_declared", "slot_held_declared"),
}
ORDINARY_ENDPOINTS = (
    "composition_plain",
    "composition_inline",
    "held_lexeme_plain",
    "held_lexeme_inline",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kit-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--preflight-only", action="store_true")
    return parser.parse_args()


def endpoint_evaluation_command(
    contract: dict[str, Any],
    kit_dir: Path,
    base_dir: Path,
    adapter_dir: Path,
    output_dir: Path,
    label: str,
    *,
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
        "bfloat16",
        "--seed",
        str(contract["training"]["seed"]),
    ]
    add_runtime_token_arguments(command, contract)
    return command


def endpoint(summary: dict[str, Any], name: str) -> dict[str, Any]:
    return summary["metrics"]["by_endpoint"][name]


def mechanical_fault_count(metrics: dict[str, Any]) -> int:
    return sum(int(value) for value in metrics["faults"].values())


def scoped_mechanical_fault_count(summary: dict[str, Any], arm: str) -> int:
    relevant = (*ORDINARY_ENDPOINTS, *matched_endpoints(arm))
    return sum(mechanical_fault_count(endpoint(summary, name)) for name in relevant)


def full_suite_fault_count(summary: dict[str, Any], suites: list[str]) -> int:
    return sum(
        mechanical_fault_count(summary["suites"][suite]) for suite in suites
    )


def full_regression_gates(
    candidate: dict[str, Any], baseline: dict[str, Any], gates: dict[str, Any]
) -> dict[str, bool]:
    deployment_suites = list(gates["deployment_zero_fault_suites"])
    return {
        "deployment_mechanical_faults_zero": full_suite_fault_count(
            candidate, deployment_suites
        )
        == 0,
        "fixed_utterance_retention_noninferiority": candidate["suites"]["retention"][
            "exact"
        ]
        >= baseline["suites"]["retention"]["exact"],
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


def matched_endpoints(arm: str) -> tuple[str, str]:
    try:
        return ARM_ENDPOINTS[arm]
    except KeyError as exc:
        raise ValueError(f"unsupported subject-slot arm: {arm}") from exc


def development_rank(
    summary: dict[str, Any], arm: str, gates: dict[str, Any], step: int
) -> tuple[Any, ...]:
    composition_name, held_name = matched_endpoints(arm)
    slot_composition = endpoint(summary, composition_name)
    slot_held = endpoint(summary, held_name)
    composition_plain = endpoint(summary, "composition_plain")
    held_inline = endpoint(summary, "held_lexeme_inline")
    cross_names = sorted(set(ARM_ENDPOINTS["M8"] + ARM_ENDPOINTS["D8"]) - {composition_name, held_name})
    thresholds = (
        (
            int(slot_composition["slot_rendered_exact"]),
            int(gates["minimum_matched_slot_composition_exact"]),
        ),
        (
            int(slot_held["slot_rendered_exact"]),
            int(gates["minimum_matched_slot_held_exact"]),
        ),
        (
            int(composition_plain["ordinary_exact"]),
            int(gates["minimum_composition_plain_exact"]),
        ),
        (
            int(held_inline["ordinary_exact"]),
            int(gates["minimum_held_inline_exact"]),
        ),
    )
    threshold_count = sum(value >= minimum for value, minimum in thresholds)
    minimum_ratio = min(value / minimum for value, minimum in thresholds)
    cross_rendered_exact = sum(
        int(endpoint(summary, name)["slot_rendered_exact"]) for name in cross_names
    )
    return (
        scoped_mechanical_fault_count(summary, arm) == 0,
        threshold_count,
        minimum_ratio,
        int(slot_held["slot_rendered_exact"]),
        int(slot_composition["slot_rendered_exact"]),
        int(held_inline["ordinary_exact"]),
        int(composition_plain["ordinary_exact"]),
        cross_rendered_exact,
        float(slot_held["mean_chrf2"]) + float(slot_composition["mean_chrf2"]),
        -step,
    )


def choose_checkpoint(
    candidates: list[dict[str, Any]], arm: str, gates: dict[str, Any]
) -> dict[str, Any]:
    if not candidates:
        raise ValueError("checkpoint census is empty")
    return max(
        candidates,
        key=lambda candidate: development_rank(
            candidate["development"], arm, gates, int(candidate["step"])
        ),
    )


def development_gates(
    summary: dict[str, Any],
    arm: str,
    gates: dict[str, Any],
    batch_invariance: dict[str, Any],
    full_gate_result: dict[str, bool],
) -> dict[str, bool]:
    composition_name, held_name = matched_endpoints(arm)
    slot_composition = endpoint(summary, composition_name)
    slot_held = endpoint(summary, held_name)
    composition_plain = endpoint(summary, "composition_plain")
    held_inline = endpoint(summary, "held_lexeme_inline")
    return {
        "matched_and_ordinary_mechanical_faults_zero": scoped_mechanical_fault_count(
            summary, arm
        )
        == 0,
        "matched_slot_composition_exact": int(slot_composition["slot_rendered_exact"])
        >= int(gates["minimum_matched_slot_composition_exact"]),
        "matched_slot_held_exact": int(slot_held["slot_rendered_exact"])
        >= int(gates["minimum_matched_slot_held_exact"]),
        "matched_slot_marker_count_exact": int(slot_composition["slot_count_valid"])
        == int(slot_composition["rows"])
        and int(slot_held["slot_count_valid"]) == int(slot_held["rows"]),
        "matched_slot_marker_position_exact": int(slot_composition["slot_position_valid"])
        == int(slot_composition["rows"])
        and int(slot_held["slot_position_valid"]) == int(slot_held["rows"]),
        "matched_predicate_presence_exact": int(slot_composition["predicate_present"])
        == int(slot_composition["rows"])
        and int(slot_held["predicate_present"]) == int(slot_held["rows"]),
        "ordinary_composition_retained": int(composition_plain["ordinary_exact"])
        >= int(gates["minimum_composition_plain_exact"]),
        "ordinary_held_inline_retained": int(held_inline["ordinary_exact"])
        >= int(gates["minimum_held_inline_exact"]),
        "batch_1_16_outputs_identical": bool(batch_invariance["all_outputs_identical"]),
        **full_gate_result,
    }


def verify_subject_slot_rows(rows: list[dict[str, Any]], arm: str) -> None:
    for row in rows:
        population = str(row["schedule_population"])
        input_text = str(row["input_text"])
        output_text = str(row["output_text"])
        if population == "subject_slot":
            if output_text.count(SLOT_TOKEN) != 1 or not output_text.startswith(SLOT_TOKEN + " "):
                raise ValueError(f"subject-slot target contract changed: {row['id']}")
            if arm == "M8":
                if input_text.count(SLOT_TOKEN) != 1 or "<glossary>" in input_text:
                    raise ValueError(f"M8 masked-source contract changed: {row['id']}")
            elif arm == "D8":
                if input_text.count(SLOT_TOKEN) != 1 or "<glossary>" not in input_text:
                    raise ValueError(f"D8 declared-source contract changed: {row['id']}")
            else:
                raise ValueError(f"unknown subject-slot arm: {arm}")
        elif SLOT_TOKEN in output_text:
            raise ValueError(f"slot leaked into non-slot target: {row['id']}")


def compare_arms(
    selected_validation: dict[str, dict[str, Any]], selected: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for arm in sorted(selected_validation):
        composition_name, held_name = matched_endpoints(arm)
        summary = selected_validation[arm]
        result[arm] = {
            "step": selected[arm]["step"],
            "matched_slot_composition_exact": endpoint(summary, composition_name)[
                "slot_rendered_exact"
            ],
            "matched_slot_held_exact": endpoint(summary, held_name)[
                "slot_rendered_exact"
            ],
            "ordinary_composition_plain_exact": endpoint(summary, "composition_plain")[
                "ordinary_exact"
            ],
            "ordinary_held_inline_exact": endpoint(summary, "held_lexeme_inline")[
                "ordinary_exact"
            ],
        }
    return result


def main() -> None:
    args = parse_args()
    kit_dir = args.kit_dir.resolve()
    output_dir = args.output_dir.resolve()
    contract = json.loads((kit_dir / "CONTRACT.json").read_text(encoding="utf-8"))
    if contract.get("experiment_kind") != "subject_slot_rendering":
        raise ValueError("unexpected experiment kind")
    if sorted(contract["arms"]) != sorted(ARM_ENDPOINTS):
        raise ValueError("subject-slot arm set changed")
    if contract["claims"]["sealed_test_included"] is not False:
        raise ValueError("screening kit declares a sealed test")

    for binding in [contract["development_screen"], *contract["evaluation"].values()]:
        path = kit_dir / binding["path"]
        verify_file(path, binding["sha256"])
        load_bound_jsonl(path, int(binding["rows"]))
    development_rows = load_bound_jsonl(
        kit_dir / contract["development_screen"]["path"],
        int(contract["development_screen"]["rows"]),
    )
    observed_endpoint_rows: dict[str, int] = {}
    for row in development_rows:
        name = str(row["evaluation_endpoint"])
        observed_endpoint_rows[name] = observed_endpoint_rows.get(name, 0) + 1
    if dict(sorted(observed_endpoint_rows.items())) != dict(
        sorted(contract["development_screen"]["endpoint_rows"].items())
    ):
        raise ValueError("development endpoint census changed")

    schedule_counts = set()
    for arm, binding in contract["arms"].items():
        path = kit_dir / binding["schedule_path"]
        verify_file(path, binding["schedule_sha256"])
        rows = load_bound_jsonl(path, int(binding["schedule_rows"]))
        verify_schedule(rows, arm, binding)
        verify_subject_slot_rows(rows, arm)
        schedule_counts.add(len(rows))
        required = set(binding["required_trainable_token_updates"])
        if not {"wbv_Latn", "<translate>", SLOT_TOKEN}.issubset(required):
            raise ValueError(f"{arm} required trainable-token updates changed")
        if arm == "D8" and "<glossary>" not in required:
            raise ValueError("D8 does not require a glossary-token update")
    if len(schedule_counts) != 1:
        raise ValueError("arms have unequal presentation counts")
    presentations = schedule_counts.pop()
    training = contract["training"]
    expected_presentations = (
        int(training["physical_batch_size"])
        * int(training["gradient_accumulation_steps"])
        * int(training["optimizer_updates"])
    )
    if presentations != expected_presentations:
        raise ValueError("schedule cannot produce the frozen optimizer-update count")
    checkpoints = [int(value) for value in training["checkpoint_updates"]]
    if checkpoints != sorted(set(checkpoints)) or checkpoints[-1] != int(
        training["optimizer_updates"]
    ):
        raise ValueError("checkpoint schedule is not sorted, unique, and terminal")

    for relative, expected in contract["initial_adapter"]["files"].items():
        verify_file(kit_dir / relative, expected)
    adapter_config = json.loads(
        (kit_dir / "payload/initial-adapter/adapter_config.json").read_text(
            encoding="utf-8"
        )
    )
    if adapter_config.get("trainable_token_indices") != contract["initial_adapter"].get(
        "trainable_token_indices"
    ):
        raise ValueError("initial-adapter trainable token rows changed")
    runtime_tokens = runtime_appended_tokens(contract)
    if runtime_tokens != [
        {
            "token": SLOT_TOKEN,
            "token_id": 256208,
            "initialization": "base_decomposition_mean_float32",
            "base_decomposition_ids": [45, 54503, 248078, 248123],
        }
    ]:
        raise ValueError("subject-slot runtime token contract changed")
    if args.preflight_only:
        print(
            json.dumps(
                {
                    "status": "PASS_STATIC_SUBJECT_SLOT_SCREEN_KIT_PREFLIGHT",
                    "run_id": contract["run_id"],
                    "arms": sorted(contract["arms"]),
                    "presentations_per_arm": presentations,
                    "optimizer_updates_per_arm": training["optimizer_updates"],
                    "adapter_snapshot_steps": checkpoints,
                    "development_rows": len(development_rows),
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
    development_root = output_dir / "development"
    selected_validation_root = output_dir / "selected-validation"
    full_root = output_dir / "full-evaluation"
    selected_root = output_dir / "selected-adapters"
    for path in (
        development_root,
        selected_validation_root,
        full_root,
        selected_root,
    ):
        path.mkdir()

    run(
        endpoint_evaluation_command(
            contract,
            kit_dir,
            base_dir,
            initial_adapter,
            development_root / "T7",
            "T7-development",
            batch_sizes="1,16",
        ),
        logs_dir / "evaluate-development-T7.log",
    )
    run(
        full_evaluation_command(
            contract, kit_dir, base_dir, initial_adapter, full_root / "T7", "T7"
        ),
        logs_dir / "evaluate-full-T7.log",
    )
    baseline_development = read_summary(development_root / "T7/SUMMARY.json")
    baseline_full = read_summary(full_root / "T7/SUMMARY.json")

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
                    development_root / label,
                    f"{label}-development",
                    batch_sizes="16",
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
        chosen = choose_checkpoint(candidates, arm, contract["gates"])
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
                    development_rank(
                        candidate["development"],
                        arm,
                        contract["gates"],
                        int(candidate["step"]),
                    )
                ),
            }
            for candidate in candidates
        ]

    selected_validation: dict[str, dict[str, Any]] = {}
    full_summaries = {"T7": baseline_full}
    full_gate_results: dict[str, dict[str, bool]] = {}
    for arm, value in selected.items():
        run(
            endpoint_evaluation_command(
                contract,
                kit_dir,
                base_dir,
                value["adapter_dir"],
                selected_validation_root / arm,
                f"{arm}-selected-batch-invariance",
                batch_sizes="1,16",
            ),
            logs_dir / f"evaluate-selected-{arm}.log",
        )
        selected_validation[arm] = read_summary(
            selected_validation_root / arm / "SUMMARY.json"
        )
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
        full_gate_results[arm] = full_regression_gates(
            full_summaries[arm], baseline_full, contract["gates"]
        )

    candidate_gate_results = {
        arm: development_gates(
            selected_validation[arm],
            arm,
            contract["gates"],
            selected_validation[arm]["batch_invariance"],
            full_gate_results[arm],
        )
        for arm in selected
    }
    passing = [
        arm for arm, result in candidate_gate_results.items() if all(result.values())
    ]
    candidate_pool = passing or list(selected)
    winning_candidate = max(
        candidate_pool,
        key=lambda arm: development_rank(
            selected_validation[arm],
            arm,
            contract["gates"],
            int(selected[arm]["step"]),
        ),
    )
    screen_pass = bool(passing)
    result = {
        "schema_version": 1,
        "run_id": contract["run_id"],
        "created_at_utc": utc_now(),
        "status": (
            "POSITIVE_INTERNAL_SUBJECT_SLOT_SCREEN"
            if screen_pass
            else "NEGATIVE_OR_INCONCLUSIVE_SUBJECT_SLOT_SCREEN"
        ),
        "winning_candidate": winning_candidate,
        "passing_candidates": passing,
        "screen_pass": screen_pass,
        "public_promotion_authorized": False,
        "sentence_generation_authorized": False,
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
                "selection_development": value["development"],
                "batch_invariance_development": selected_validation[arm],
            }
            for arm, value in selected.items()
        },
        "checkpoint_census": checkpoint_census,
        "full_summaries": full_summaries,
        "full_gate_results": full_gate_results,
        "candidate_gate_results": candidate_gate_results,
        "arm_comparison": compare_arms(selected_validation, selected),
        "multi_seed_confirmation_required_before_release": True,
        "independent_natural_language_gate_required_before_sentence_serving": True,
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
        "reason": "Retain selected adapter-only snapshots and evaluations; remove training state, unselected snapshots, duplicate final adapters, and downloaded base files.",
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

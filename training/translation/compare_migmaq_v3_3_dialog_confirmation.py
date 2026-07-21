#!/usr/bin/env python3
"""Verify the Mi'kmaq v3.3 dialog40 multi-seed confirmation."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import random
from typing import Any, Sequence

from audit_migmaq_v3_3_dialog_schedules import verify_release_checksums
from compare_migmaq_v3_2_natural_lessons_screen import (
    learning_rate_trajectory,
    percentile,
    read_json,
    read_jsonl,
    sentence_diagnostics,
    sha256,
    verify_checksum_manifest,
    write_json_atomic,
    write_jsonl_atomic,
)
from compare_migmaq_v3_3_dialog_screen import (
    BASE_CONTRACT_SHA256,
    BASE_LEXICAL_PREDICTIONS_SHA256,
    BASE_RESULT_SHA256,
    BASE_RUN_CHECKSUM_MANIFEST_SHA256,
    lexical_summary,
    lesson_ids,
    normalize_prediction,
    result_path,
    subset_payload,
    verify_canonicalization,
    verify_run_log,
)


SEEDS = (17, 42, 73)
ARMS = ("retention", "dialog40")
ENDPOINTS = (
    "existing-validation",
    "existing-opened-regression",
    "lesson-validation-all",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-run", type=Path, required=True)
    for seed in SEEDS:
        for arm in ARMS:
            parser.add_argument(f"--{arm}-seed{seed}-run", type=Path, required=True)
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--expected-dataset-manifest-sha256", required=True)
    parser.add_argument("--expected-screen-contract-sha256", required=True)
    parser.add_argument("--expected-confirmation-contract-sha256", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=5000)
    parser.add_argument("--bootstrap-seed", type=int, default=20260722)
    return parser.parse_args()


def run_key(arm: str, seed: int) -> str:
    return f"{arm}_seed{seed}"


def aligned_dialog_rows(
    retention: dict[str, Any], candidate: dict[str, Any]
) -> list[dict[str, str]]:
    control = {str(row["id"]): row for row in retention["predictions"]}
    treatment = {str(row["id"]): row for row in candidate["predictions"]}
    if len(control) != len(retention["predictions"]):
        raise ValueError("duplicate retention dialog IDs")
    if len(treatment) != len(candidate["predictions"]):
        raise ValueError("duplicate candidate dialog IDs")
    if set(control) != set(treatment):
        raise ValueError("dialog row IDs differ between paired arms")
    return [
        {
            "id": row_id,
            "input_text": str(control[row_id]["input_text"]),
            "reference": str(
                control[row_id].get("reference") or control[row_id]["output_text"]
            ),
            "retention": str(control[row_id]["prediction"]),
            "dialog40": str(treatment[row_id]["prediction"]),
        }
        for row_id in control
    ]


def hierarchical_paired_chrf_bootstrap(
    rows_by_seed: dict[int, Sequence[dict[str, str]]],
    *,
    samples: int,
    seed: int,
) -> dict[str, Any]:
    """Resample seeds, then paired rows within each sampled seed."""
    if samples < 1 or set(rows_by_seed) != set(SEEDS):
        raise ValueError("bootstrap requires all seeds and positive sample count")
    from sacrebleu.metrics import CHRF

    metric = CHRF(word_order=2)

    def delta(rows: Sequence[dict[str, str]], indices: Sequence[int]) -> float:
        references = [rows[index]["reference"] for index in indices]
        controls = [rows[index]["retention"] for index in indices]
        candidates = [rows[index]["dialog40"] for index in indices]
        return (
            metric.corpus_score(candidates, [references]).score
            - metric.corpus_score(controls, [references]).score
        )

    observed_by_seed = {
        item_seed: delta(rows, range(len(rows)))
        for item_seed, rows in rows_by_seed.items()
    }
    rng = random.Random(seed)
    replicates: list[float] = []
    for _ in range(samples):
        sampled_seeds = [rng.choice(SEEDS) for _ in SEEDS]
        seed_deltas = []
        for sampled_seed in sampled_seeds:
            rows = rows_by_seed[sampled_seed]
            indices = [rng.randrange(len(rows)) for _ in rows]
            seed_deltas.append(delta(rows, indices))
        replicates.append(sum(seed_deltas) / len(seed_deltas))
    return {
        "unit": "seed, then paired held-out dialog row within seed",
        "samples": samples,
        "seed": seed,
        "observed_by_seed": observed_by_seed,
        "observed_mean_delta": sum(observed_by_seed.values()) / len(SEEDS),
        "percentile_90_interval": {
            "low": percentile(replicates, 0.05),
            "high": percentile(replicates, 0.95),
        },
        "probability_delta_above_zero": sum(value > 0 for value in replicates)
        / samples,
    }


def rate(metrics: dict[str, Any], field: str) -> float:
    return float(metrics[field]) / int(metrics["rows"])


def confirmation_decision(
    metrics: dict[int, dict[str, dict[str, dict[str, Any]]]],
    base_dialog_chrf: float,
    bootstrap: dict[str, Any],
) -> dict[str, Any]:
    conditions: dict[str, dict[str, Any]] = {}
    for seed in SEEDS:
        for arm in ARMS:
            for endpoint in (*ENDPOINTS, "lesson-validation-dialog"):
                observed = metrics[seed][arm][endpoint]["empty_outputs"]
                conditions[f"seed{seed}_{arm}_{endpoint}_zero_blanks"] = {
                    "observed": observed,
                    "required": 0,
                    "pass": observed == 0,
                }

    dialog_deltas = {
        seed: metrics[seed]["dialog40"]["lesson-validation-dialog"]["chrf"]
        - metrics[seed]["retention"]["lesson-validation-dialog"]["chrf"]
        for seed in SEEDS
    }
    conditions["dialog_delta_positive_every_seed"] = {
        "observed": dialog_deltas,
        "required": "all > 0",
        "pass": all(value > 0 for value in dialog_deltas.values()),
    }
    mean_dialog_delta = sum(dialog_deltas.values()) / len(SEEDS)
    conditions["mean_dialog_delta_at_least_one"] = {
        "observed": mean_dialog_delta,
        "required": 1.0,
        "pass": mean_dialog_delta >= 1.0,
    }
    mean_candidate_dialog = sum(
        metrics[seed]["dialog40"]["lesson-validation-dialog"]["chrf"] for seed in SEEDS
    ) / len(SEEDS)
    conditions["mean_dialog_score_above_untouched_base"] = {
        "observed": mean_candidate_dialog,
        "required": base_dialog_chrf + 1.0,
        "pass": mean_candidate_dialog >= base_dialog_chrf + 1.0,
    }
    bootstrap_low = bootstrap["percentile_90_interval"]["low"]
    conditions["hierarchical_bootstrap_direction"] = {
        "observed": bootstrap_low,
        "required": 0.0,
        "pass": bootstrap_low > 0.0,
    }

    for endpoint in ("existing-validation", "existing-opened-regression"):
        chrf_deltas = {
            seed: metrics[seed]["dialog40"][endpoint]["chrf"]
            - metrics[seed]["retention"][endpoint]["chrf"]
            for seed in SEEDS
        }
        mean_delta = sum(chrf_deltas.values()) / len(SEEDS)
        conditions[f"{endpoint}_mean_chrf_noninferiority"] = {
            "observed": mean_delta,
            "required": -0.25,
            "pass": mean_delta >= -0.25,
        }
        conditions[f"{endpoint}_per_seed_chrf_safeguard"] = {
            "observed": chrf_deltas,
            "required": "all >= -0.75",
            "pass": all(value >= -0.75 for value in chrf_deltas.values()),
        }
        under_deltas = {
            seed: rate(
                metrics[seed]["dialog40"][endpoint], "severe_undertranslation_rows"
            )
            - rate(
                metrics[seed]["retention"][endpoint],
                "severe_undertranslation_rows",
            )
            for seed in SEEDS
        }
        conditions[f"{endpoint}_mean_undertranslation_noninferiority"] = {
            "observed": sum(under_deltas.values()) / len(SEEDS),
            "required": 0.05,
            "pass": sum(under_deltas.values()) / len(SEEDS) <= 0.05,
        }
        conditions[f"{endpoint}_per_seed_undertranslation_safeguard"] = {
            "observed": under_deltas,
            "required": "all <= 0.10",
            "pass": all(value <= 0.10 for value in under_deltas.values()),
        }

    dialog_under_deltas = {
        seed: rate(
            metrics[seed]["dialog40"]["lesson-validation-dialog"],
            "severe_undertranslation_rows",
        )
        - rate(
            metrics[seed]["retention"]["lesson-validation-dialog"],
            "severe_undertranslation_rows",
        )
        for seed in SEEDS
    }
    conditions["dialog_mean_undertranslation_noninferiority"] = {
        "observed": sum(dialog_under_deltas.values()) / len(SEEDS),
        "required": 0.05,
        "pass": sum(dialog_under_deltas.values()) / len(SEEDS) <= 0.05,
    }
    conditions["dialog_per_seed_undertranslation_safeguard"] = {
        "observed": dialog_under_deltas,
        "required": "all <= 0.10",
        "pass": all(value <= 0.10 for value in dialog_under_deltas.values()),
    }
    passed = all(item["pass"] for item in conditions.values())
    return {
        "conditions": conditions,
        "passed": passed,
        "selected_recipe": "dialog40" if passed else None,
        "sealed_test_authorized": passed,
        "publication_or_deployment_authorized": False,
        "next_state": (
            "Open the checksum-bound sealed sentence test once under a separate frozen contract."
            if passed
            else "Reject v3.3 dialog40; do not add blind epochs or synthetic volume."
        ),
    }


def lexical_pair_transition(control_dir: Path, candidate_dir: Path) -> dict[str, Any]:
    paths = {
        "retention": control_dir / "evaluations/lexical-all-plain/predictions.jsonl",
        "dialog40": candidate_dir / "evaluations/lexical-all-plain/predictions.jsonl",
    }
    rows = {arm: read_jsonl(path) for arm, path in paths.items()}
    indexed = {
        arm: {str(row["id"]): row for row in arm_rows} for arm, arm_rows in rows.items()
    }
    if any(len(indexed[arm]) != len(rows[arm]) for arm in ARMS):
        raise ValueError("duplicate lexical IDs")
    if set(indexed["retention"]) != set(indexed["dialog40"]):
        raise ValueError("lexical IDs differ between paired runs")
    transitions: Counter[str] = Counter()
    improved = tied = worsened = changed = 0
    for row_id, control in indexed["retention"].items():
        candidate = indexed["dialog40"][row_id]
        control_exact = bool(control["accepted_exact"])
        candidate_exact = bool(candidate["accepted_exact"])
        transitions[
            ("exact" if control_exact else "failure")
            + "_to_"
            + ("exact" if candidate_exact else "failure")
        ] += 1
        control_cer = float(control["grapheme_cer"])
        candidate_cer = float(candidate["grapheme_cer"])
        if candidate_cer < control_cer:
            improved += 1
        elif candidate_cer > control_cer:
            worsened += 1
        else:
            tied += 1
        changed += normalize_prediction(control["prediction"]) != normalize_prediction(
            candidate["prediction"]
        )
    return {
        "exact_transitions": dict(sorted(transitions.items())),
        "cer_improved_rows": improved,
        "cer_tied_rows": tied,
        "cer_worsened_rows": worsened,
        "changed_normalized_outputs": changed,
    }


def main() -> None:
    args = parse_args()
    base_run = args.base_run.expanduser().resolve()
    run_dirs = {
        seed: {
            arm: getattr(args, f"{arm}_seed{seed}_run").expanduser().resolve()
            for arm in ARMS
        }
        for seed in SEEDS
    }
    dataset_dir = args.dataset_dir.expanduser().resolve()
    manifest_path = dataset_dir / "manifest.json"
    if sha256(manifest_path) != args.expected_dataset_manifest_sha256:
        raise ValueError("dataset manifest hash mismatch")
    dataset = read_json(manifest_path)
    release_checksum_audit = verify_release_checksums(dataset_dir)

    base_checksum = verify_checksum_manifest(base_run)
    base_log = verify_run_log(base_run)
    if sha256(base_run / "input-experiment-contract.json") != BASE_CONTRACT_SHA256:
        raise ValueError("base contract identity changed")
    if sha256(base_run / "RUN-SHA256SUMS") != BASE_RUN_CHECKSUM_MANIFEST_SHA256:
        raise ValueError("base checksum-manifest identity changed")
    for endpoint, expected_hash in BASE_RESULT_SHA256.items():
        if sha256(result_path(base_run, endpoint, base=True)) != expected_hash:
            raise ValueError(f"base {endpoint} result changed")
    if (
        sha256(base_run / "evaluations/lexical-all-plain/predictions.jsonl")
        != BASE_LEXICAL_PREDICTIONS_SHA256
    ):
        raise ValueError("base lexical predictions changed")

    checksums: dict[str, Any] = {"base": base_checksum}
    logs: dict[str, Any] = {"base": base_log}
    manifests: dict[str, Any] = {}
    models: dict[str, Any] = {}
    canonicalization: dict[str, Any] = {}
    trajectories: dict[str, Any] = {}
    for seed in SEEDS:
        for arm in ARMS:
            key = run_key(arm, seed)
            run_dir = run_dirs[seed][arm]
            checksums[key] = verify_checksum_manifest(run_dir)
            logs[key] = verify_run_log(run_dir)
            expected_contract = (
                args.expected_screen_contract_sha256
                if seed == 42
                else args.expected_confirmation_contract_sha256
            )
            if sha256(run_dir / "input-experiment-contract.json") != expected_contract:
                raise ValueError(f"experiment contract differs for {key}")
            manifest = read_json(run_dir / "run-manifest.json")
            if manifest["arm"] != arm or int(manifest["seed"]) != seed:
                raise ValueError(f"run identity mismatch for {key}")
            if seed != 42 and manifest.get("study_phase") != "confirmation":
                raise ValueError(f"confirmation phase missing for {key}")
            if (
                manifest["dataset_manifest_sha256"]
                != args.expected_dataset_manifest_sha256
            ):
                raise ValueError(f"dataset identity mismatch for {key}")
            model = read_json(run_dir / "model/model_manifest.json")
            expected = dataset["token_accounting"]["schedule_audit"]["arms"][arm]
            exposure = model["trainer_state"]["actual_training_exposure"]
            if model["trainer_state"]["global_step"] != 600:
                raise ValueError(f"global step mismatch for {key}")
            for field in (
                "examples",
                "source_tokens",
                "target_tokens",
                "non_padding_tokens",
            ):
                if exposure[field] != expected[field]:
                    raise ValueError(f"{key} {field} exposure mismatch")
            if model["training_args"]["modules_to_save"]:
                raise ValueError(f"{key} is not LoRA-only")
            if model["training_args"]["ensure_weight_tying"]:
                raise ValueError(f"{key} changed the untied output-head contract")
            manifests[key] = manifest
            models[key] = model
            trajectories[key] = learning_rate_trajectory(model)
            canonicalization[key] = verify_canonicalization(run_dir, manifest)
    if len({json.dumps(item) for item in trajectories.values()}) != 1:
        raise ValueError("learning-rate trajectories differ")
    if (
        len(
            {json.dumps(item["decoder"], sort_keys=True) for item in manifests.values()}
        )
        != 1
    ):
        raise ValueError("decoder policies differ")

    dialog_validation_ids = lesson_ids(dataset_dir, "dialog")
    metrics: dict[int, dict[str, dict[str, dict[str, Any]]]] = {
        seed: {arm: {} for arm in ARMS} for seed in SEEDS
    }
    dialog_payloads: dict[int, dict[str, dict[str, Any]]] = {seed: {} for seed in SEEDS}
    for seed in SEEDS:
        for arm in ARMS:
            for endpoint in ENDPOINTS:
                payload = read_json(
                    run_dirs[seed][arm] / f"evaluations/{endpoint}.json"
                )
                metrics[seed][arm][endpoint] = sentence_diagnostics(payload)
                if endpoint == "lesson-validation-all":
                    subset = subset_payload(payload, dialog_validation_ids)
                    metrics[seed][arm]["lesson-validation-dialog"] = subset["metrics"]
                    dialog_payloads[seed][arm] = subset

    rows_by_seed = {
        seed: aligned_dialog_rows(
            dialog_payloads[seed]["retention"], dialog_payloads[seed]["dialog40"]
        )
        for seed in SEEDS
    }
    bootstrap = hierarchical_paired_chrf_bootstrap(
        rows_by_seed,
        samples=args.bootstrap_samples,
        seed=args.bootstrap_seed,
    )
    base_lesson = read_json(result_path(base_run, "lesson-validation-all", base=True))
    base_dialog = subset_payload(base_lesson, dialog_validation_ids)["metrics"]
    decision = confirmation_decision(metrics, base_dialog["chrf"], bootstrap)

    lexical = {
        seed: {
            arm: lexical_summary(run_dirs[seed][arm], "lexical-all-plain")
            for arm in ARMS
        }
        for seed in SEEDS
    }
    lexical_transitions = {
        seed: lexical_pair_transition(
            run_dirs[seed]["retention"], run_dirs[seed]["dialog40"]
        )
        for seed in SEEDS
    }
    report = {
        "schema_version": 1,
        "analysis_kind": "migmaq_v3_3_dialog40_multiseed_confirmation",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "path": str(dataset_dir),
            "manifest_sha256": args.expected_dataset_manifest_sha256,
            **release_checksum_audit,
        },
        "contracts": {
            "screen_sha256": args.expected_screen_contract_sha256,
            "confirmation_sha256": args.expected_confirmation_contract_sha256,
        },
        "checksum_audits": checksums,
        "run_log_audits": logs,
        "run_manifests": manifests,
        "training_audit": {
            "learning_rate_trajectories_identical": True,
            "trajectory": next(iter(trajectories.values())),
            "tokenizer_canonicalization": canonicalization,
        },
        "base_dialog_metrics": base_dialog,
        "sentence_metrics": metrics,
        "hierarchical_paired_bootstrap": bootstrap,
        "lexical_diagnostics": {
            "full_plain_census": lexical,
            "paired_transitions": lexical_transitions,
            "claim_limit": (
                "Closed-set lexical development census only; deterministic dictionary lookup remains "
                "the product route and these scores cannot authorize sentence generation."
            ),
        },
        "decision": decision,
        "claim_limit": (
            "Three-seed development confirmation. A pass authorizes one sealed evaluation under a new "
            "frozen contract; it does not authorize publication or deployment."
        ),
    }
    output = args.output_dir.expanduser().resolve()
    if output.exists():
        raise FileExistsError(output)
    output.mkdir(parents=True)
    write_json_atomic(output / "comparison.json", report)
    for seed, rows in rows_by_seed.items():
        write_jsonl_atomic(output / f"paired-lesson-dialog-seed{seed}.jsonl", rows)
    files = sorted(path for path in output.iterdir() if path.is_file())
    (output / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    print(json.dumps({"decision": decision, "bootstrap": bootstrap}, indent=2))


if __name__ == "__main__":
    main()

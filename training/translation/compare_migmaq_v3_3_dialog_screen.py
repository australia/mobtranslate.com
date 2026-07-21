#!/usr/bin/env python3
"""Verify and compare the Mi'kmaq v3.3 dialog-only development screen."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Sequence

from audit_migmaq_v3_3_dialog_schedules import audit_schedules, verify_release_checksums
from compare_migmaq_v3_2_natural_lessons_screen import (
    learning_rate_trajectory,
    paired_chrf_bootstrap,
    read_json,
    read_jsonl,
    sentence_diagnostics,
    sha256,
    verify_checksum_manifest,
    write_json_atomic,
    write_jsonl_atomic,
)


ARMS = ("base", "retention", "dialog20", "dialog40")
TRAINED_ARMS = ("retention", "dialog20", "dialog40")
CANDIDATES = ("dialog20", "dialog40")
BASE_CONTRACT_SHA256 = (
    "246b3ea2cbecfddf22924097b5aece85bd9a310df73f0caa32a794f50dc6a6e0"
)
BASE_RUN_CHECKSUM_MANIFEST_SHA256 = (
    "0906add151bac554b5e5f0b7ed1e38f95aff7c6cff94cbe6073307ea1a531f0c"
)
BASE_RESULT_SHA256 = {
    "existing-validation": "853b685df8edacf8c6c933544a9b030243edc4dc6298042ee32c18ea1863e38f",
    "existing-opened-regression": "3331c4838cf0e2941b31635b4739d516f383b67743fb5f9baa2b50f27aec07da",
    "lesson-validation-all": "13f26fb92607803b1cfd45d1bfebd8e927a3f82d1c2c73f8f04c2f957da04e36",
}
BASE_LEXICAL_PREDICTIONS_SHA256 = (
    "c447b18683af4f0432dcd5d0e13d003d5a0a1c594b1e48ab9cf3bcca8b6df712"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    for arm in ARMS:
        parser.add_argument(f"--{arm}-run", type=Path, required=True)
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--expected-dataset-manifest-sha256", required=True)
    parser.add_argument("--expected-contract-sha256", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=5000)
    parser.add_argument("--bootstrap-seed", type=int, default=20260721)
    return parser.parse_args()


def verify_run_log(run_dir: Path) -> dict[str, str]:
    checksum_path = run_dir / "run-log.sha256"
    line = checksum_path.read_text(encoding="utf-8").strip()
    try:
        expected, relative = line.split(maxsplit=1)
    except ValueError as error:
        raise ValueError(f"invalid run-log checksum: {checksum_path}") from error
    log_path = run_dir / relative.removeprefix("./")
    if log_path != run_dir / "run.log" or sha256(log_path) != expected:
        raise ValueError(f"run-log checksum failed: {run_dir}")
    return {"path": str(checksum_path), "sha256": sha256(checksum_path)}


def result_path(run_dir: Path, endpoint: str, *, base: bool) -> Path:
    if base and endpoint == "lesson-validation-all":
        return run_dir / "evaluations" / "lesson-validation-sentences.json"
    return run_dir / "evaluations" / f"{endpoint}.json"


def score_sentence_rows(
    rows: list[dict[str, Any]], parent_metrics: dict[str, Any]
) -> dict[str, Any]:
    from sacrebleu.metrics import BLEU, CHRF

    predictions = [str(row["prediction"]) for row in rows]
    references = [str(row.get("reference") or row["output_text"]) for row in rows]
    sources = [str(row["input_text"]) for row in rows]
    metrics = {
        "rows": len(rows),
        "bleu": BLEU(effective_order=True)
        .corpus_score(predictions, [references])
        .score,
        "chrf": CHRF(word_order=2).corpus_score(predictions, [references]).score,
        "exact_match": sum(p == r for p, r in zip(predictions, references, strict=True))
        / max(1, len(rows)),
        "empty_outputs": sum(not prediction.strip() for prediction in predictions),
        "source_copy_outputs": sum(
            prediction.strip().casefold() == source.strip().casefold()
            for prediction, source in zip(predictions, sources, strict=True)
        ),
        "direction": parent_metrics.get("direction"),
        "source_lang": parent_metrics.get("source_lang"),
        "target_lang": parent_metrics.get("target_lang"),
    }
    return sentence_diagnostics({"metrics": metrics, "predictions": rows})


def subset_payload(
    payload: dict[str, Any], ordered_ids: Sequence[str]
) -> dict[str, Any]:
    indexed = {str(row["id"]): row for row in payload["predictions"]}
    if len(indexed) != len(payload["predictions"]):
        raise ValueError("duplicate IDs in lesson prediction payload")
    missing = [row_id for row_id in ordered_ids if row_id not in indexed]
    if missing:
        raise ValueError(f"lesson subset IDs absent from predictions: {missing[:3]}")
    rows = [indexed[row_id] for row_id in ordered_ids]
    return {
        "metrics": score_sentence_rows(rows, payload["metrics"]),
        "predictions": rows,
    }


def aligned_sentence_rows(payloads: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    indexed: dict[str, dict[str, dict[str, Any]]] = {}
    for arm, payload in payloads.items():
        rows = {str(row["id"]): row for row in payload["predictions"]}
        if len(rows) != len(payload["predictions"]):
            raise ValueError(f"duplicate sentence IDs for {arm}")
        indexed[arm] = rows
    ids = [str(row["id"]) for row in payloads["base"]["predictions"]]
    if any(set(indexed[arm]) != set(ids) for arm in ARMS):
        raise ValueError("sentence evaluation row IDs differ across arms")
    return [
        {
            "id": row_id,
            "input_text": indexed["base"][row_id]["input_text"],
            "reference": indexed["base"][row_id].get("reference")
            or indexed["base"][row_id]["output_text"],
            "predictions": {arm: indexed[arm][row_id]["prediction"] for arm in ARMS},
        }
        for row_id in ids
    ]


def candidate_decision(
    metrics: dict[str, dict[str, dict[str, Any]]],
    bootstraps: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    decisions: dict[str, Any] = {}
    integrity_endpoints = (
        "existing-validation",
        "existing-opened-regression",
        "lesson-validation-all",
        "lesson-validation-dialog",
    )
    for arm in CANDIDATES:
        conditions: dict[str, dict[str, Any]] = {}
        for endpoint in integrity_endpoints:
            observed = metrics[arm][endpoint]
            conditions[f"{endpoint}_zero_blanks"] = {
                "observed": observed["empty_outputs"],
                "required": 0,
                "pass": observed["empty_outputs"] == 0,
            }
        for endpoint in ("existing-validation", "existing-opened-regression"):
            observed = metrics[arm][endpoint]
            control = metrics["retention"][endpoint]
            chrf_delta = observed["chrf"] - control["chrf"]
            under_delta = (
                observed["severe_undertranslation_rows"] / observed["rows"]
                - control["severe_undertranslation_rows"] / control["rows"]
            )
            conditions[f"{endpoint}_chrf_noninferiority"] = {
                "observed": chrf_delta,
                "required": -0.25,
                "pass": chrf_delta >= -0.25,
            }
            conditions[f"{endpoint}_undertranslation_noninferiority"] = {
                "observed": under_delta,
                "required": 0.05,
                "pass": under_delta <= 0.05,
            }
        dialog = metrics[arm]["lesson-validation-dialog"]
        dialog_floor = (
            max(
                metrics["base"]["lesson-validation-dialog"]["chrf"],
                metrics["retention"]["lesson-validation-dialog"]["chrf"],
            )
            + 1.0
        )
        conditions["lesson_dialog_chrf_improvement"] = {
            "observed": dialog["chrf"],
            "required": dialog_floor,
            "pass": dialog["chrf"] >= dialog_floor,
        }
        dialog_under_delta = (
            dialog["severe_undertranslation_rows"] / dialog["rows"]
            - metrics["retention"]["lesson-validation-dialog"][
                "severe_undertranslation_rows"
            ]
            / metrics["retention"]["lesson-validation-dialog"]["rows"]
        )
        conditions["lesson_dialog_undertranslation_noninferiority"] = {
            "observed": dialog_under_delta,
            "required": 0.05,
            "pass": dialog_under_delta <= 0.05,
        }
        bootstrap_low = bootstraps[arm]["percentile_90_interval"]["low"]
        conditions["lesson_dialog_bootstrap_direction"] = {
            "observed": bootstrap_low,
            "required": 0.0,
            "pass": bootstrap_low > 0.0,
        }
        decisions[arm] = {
            "conditions": conditions,
            "passed": all(condition["pass"] for condition in conditions.values()),
        }

    eligible = [arm for arm in CANDIDATES if decisions[arm]["passed"]]
    selected = max(
        eligible,
        key=lambda arm: (
            metrics[arm]["lesson-validation-dialog"]["chrf"],
            (
                metrics[arm]["existing-validation"]["chrf"]
                + metrics[arm]["existing-opened-regression"]["chrf"]
            )
            / 2,
            -float(arm.removeprefix("dialog")),
        ),
        default=None,
    )
    return {
        "candidates": decisions,
        "selected_recipe": selected,
        "continue_to_multiseed_confirmation": selected is not None,
        "sealed_test_authorized": False,
        "publication_or_deployment_authorized": False,
        "selection_rule": (
            "Among arms passing every gate, maximize held-out dialog chrF++, then mean existing-domain "
            "chrF++, then choose the lower dialog dose."
        ),
    }


def lexical_summary(run_dir: Path, label: str) -> dict[str, Any]:
    report = read_json(run_dir / "evaluations" / label / "metric-report.json")
    return {
        "rows": report["rows"],
        "accepted_exact_count": report["accepted_exact_count"],
        "accepted_exact_percent": report["accepted_exact_percent"],
        "empty_outputs": report["empty_outputs"],
        "source_copy_outputs": report["source_copy_outputs"],
        "mean_grapheme_cer": report["grapheme_cer"]["mean"],
        "unique_normalized_outputs": report["unique_normalized_outputs"],
        "maximum_normalized_output_frequency": report[
            "maximum_normalized_output_frequency"
        ],
    }


def lexical_transitions(run_dirs: dict[str, Path]) -> dict[str, Any]:
    indexed: dict[str, dict[str, dict[str, Any]]] = {}
    for arm, run_dir in run_dirs.items():
        rows = read_jsonl(
            run_dir / "evaluations" / "lexical-all-plain" / "predictions.jsonl"
        )
        indexed[arm] = {str(row["id"]): row for row in rows}
        if len(indexed[arm]) != len(rows):
            raise ValueError(f"duplicate lexical IDs for {arm}")
    ids = set(indexed["retention"])
    if any(set(indexed[arm]) != ids for arm in ARMS):
        raise ValueError("lexical row IDs differ across arms")
    result: dict[str, Any] = {}
    for arm in CANDIDATES:
        transitions: Counter[str] = Counter()
        improved = tied = worsened = changed = 0
        for row_id in ids:
            control = indexed["retention"][row_id]
            candidate = indexed[arm][row_id]
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
            changed += normalize_prediction(
                control["prediction"]
            ) != normalize_prediction(candidate["prediction"])
        result[arm] = {
            "exact_transitions": dict(sorted(transitions.items())),
            "cer_improved_rows": improved,
            "cer_tied_rows": tied,
            "cer_worsened_rows": worsened,
            "changed_normalized_outputs": changed,
        }
    return result


def normalize_prediction(value: Any) -> str:
    return " ".join(str(value or "").casefold().split())


def verify_canonicalization(
    run_dir: Path, run_manifest: dict[str, Any]
) -> dict[str, Any]:
    record = run_manifest.get("tokenizer_canonicalization", {})
    path = run_dir / str(record.get("audit", ""))
    if not path.is_file() or sha256(path) != record.get("audit_sha256"):
        raise ValueError(f"tokenizer canonicalization audit identity failed: {run_dir}")
    audit = read_json(path)
    checks = audit["semantic_identity_before_canonicalization"]["checks"]
    if audit.get("status") != "PASS" or not all(checks.values()):
        raise ValueError(f"tokenizer semantic-identity audit failed: {run_dir}")
    if (
        audit["adapter_bundle_after"]["sha256"]
        != run_manifest["base_tokenizer_bundle_sha256"]
    ):
        raise ValueError(f"canonical tokenizer bundle differs from base: {run_dir}")
    return {
        "path": str(path),
        "sha256": sha256(path),
        "status": audit["status"],
        "data_rows_examined": audit["data_rows_examined"],
    }


def lesson_ids(dataset_dir: Path, label: str) -> list[str]:
    rows = read_jsonl(
        dataset_dir / "evaluation" / f"lesson-validation-{label}.eng-mic.jsonl"
    )
    ids = [str(row["id"]) for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError(f"duplicate lesson-{label} IDs")
    return ids


def main() -> None:
    args = parse_args()
    run_dirs = {arm: getattr(args, f"{arm}_run").expanduser().resolve() for arm in ARMS}
    dataset_dir = args.dataset_dir.expanduser().resolve()
    manifest_path = dataset_dir / "manifest.json"
    if sha256(manifest_path) != args.expected_dataset_manifest_sha256:
        raise ValueError("dataset manifest hash mismatch")
    dataset = read_json(manifest_path)
    release_checksum_audit = verify_release_checksums(dataset_dir)
    schedules = {
        arm: read_jsonl(dataset_dir / "schedules" / f"{arm}-screen-600.eng-mic.jsonl")
        for arm in TRAINED_ARMS
    }
    schedule_audit = audit_schedules(schedules)

    checksum_audits: dict[str, Any] = {}
    log_audits: dict[str, Any] = {}
    run_manifests: dict[str, dict[str, Any]] = {}
    model_manifests: dict[str, dict[str, Any]] = {}
    tokenizer_audits: dict[str, Any] = {}
    for arm, run_dir in run_dirs.items():
        checksum_audits[arm] = verify_checksum_manifest(run_dir)
        log_audits[arm] = verify_run_log(run_dir)
        contract_hash = sha256(run_dir / "input-experiment-contract.json")
        expected_contract = (
            BASE_CONTRACT_SHA256 if arm == "base" else args.expected_contract_sha256
        )
        if contract_hash != expected_contract:
            raise ValueError(f"experiment contract differs for {arm}")
        if (
            arm == "base"
            and sha256(run_dir / "RUN-SHA256SUMS") != BASE_RUN_CHECKSUM_MANIFEST_SHA256
        ):
            raise ValueError("reused base run checksum-manifest identity changed")
        run_manifest = read_json(run_dir / "run-manifest.json")
        if run_manifest["arm"] != arm:
            raise ValueError(f"run arm mismatch for {arm}")
        run_manifests[arm] = run_manifest
        if arm in TRAINED_ARMS:
            if (
                run_manifest["dataset_manifest_sha256"]
                != args.expected_dataset_manifest_sha256
            ):
                raise ValueError(f"dataset identity mismatch for {arm}")
            model_manifest = read_json(run_dir / "model" / "model_manifest.json")
            expected = dataset["token_accounting"]["schedule_audit"]["arms"][arm]
            exposure = model_manifest["trainer_state"]["actual_training_exposure"]
            for key in (
                "examples",
                "source_tokens",
                "target_tokens",
                "non_padding_tokens",
            ):
                if exposure[key] != expected[key]:
                    raise ValueError(f"{arm} {key} exposure mismatch")
            if model_manifest["training_args"]["modules_to_save"]:
                raise ValueError(f"{arm} is not LoRA-only")
            if model_manifest["training_args"]["ensure_weight_tying"]:
                raise ValueError(f"{arm} changed the untied output-head contract")
            model_manifests[arm] = model_manifest
            tokenizer_audits[arm] = verify_canonicalization(run_dir, run_manifest)

    trajectories = {
        arm: learning_rate_trajectory(model_manifests[arm]) for arm in TRAINED_ARMS
    }
    if len({json.dumps(value) for value in trajectories.values()}) != 1:
        raise ValueError("learning-rate trajectories differ across trained arms")
    if (
        len({json.dumps(run_manifests[arm]["decoder"], sort_keys=True) for arm in ARMS})
        != 1
    ):
        raise ValueError("decoder policy differs across arms")

    for endpoint, expected_hash in BASE_RESULT_SHA256.items():
        if sha256(result_path(run_dirs["base"], endpoint, base=True)) != expected_hash:
            raise ValueError(f"reused base {endpoint} result changed")
    if (
        sha256(run_dirs["base"] / "evaluations/lexical-all-plain/predictions.jsonl")
        != BASE_LEXICAL_PREDICTIONS_SHA256
    ):
        raise ValueError("reused base lexical predictions changed")

    raw_payloads: dict[str, dict[str, dict[str, Any]]] = {arm: {} for arm in ARMS}
    metrics: dict[str, dict[str, dict[str, Any]]] = {arm: {} for arm in ARMS}
    paired_ledgers: dict[str, list[dict[str, Any]]] = {}
    for endpoint in (
        "existing-validation",
        "existing-opened-regression",
        "lesson-validation-all",
    ):
        payloads = {
            arm: read_json(result_path(run_dirs[arm], endpoint, base=arm == "base"))
            for arm in ARMS
        }
        for arm, payload in payloads.items():
            raw_payloads[arm][endpoint] = payload
            metrics[arm][endpoint] = sentence_diagnostics(payload)
        paired_ledgers[endpoint] = aligned_sentence_rows(payloads)

    subset_ids = {
        "lesson-validation-dialog": lesson_ids(dataset_dir, "dialog"),
        "lesson-validation-vocab-container": lesson_ids(dataset_dir, "vocab-container"),
    }
    for endpoint, ids in subset_ids.items():
        payloads = {
            arm: subset_payload(raw_payloads[arm]["lesson-validation-all"], ids)
            for arm in ARMS
        }
        for arm, payload in payloads.items():
            metrics[arm][endpoint] = payload["metrics"]
        paired_ledgers[endpoint] = aligned_sentence_rows(payloads)

    bootstraps = {
        arm: paired_chrf_bootstrap(
            paired_ledgers["lesson-validation-dialog"],
            arm,
            samples=args.bootstrap_samples,
            seed=args.bootstrap_seed + index,
        )
        for index, arm in enumerate(CANDIDATES)
    }
    decision = candidate_decision(metrics, bootstraps)
    lexical = {
        "full_plain_census": {
            arm: lexical_summary(run_dirs[arm], "lexical-all-plain") for arm in ARMS
        },
        "lesson_validation_plain_lexemes": {
            arm: lexical_summary(run_dirs[arm], "lesson-validation-lexemes-plain")
            for arm in ARMS
        },
        "paired_vs_retention": lexical_transitions(run_dirs),
        "claim_limit": (
            "All 14,438 eligible lexical rows are reported as a model diagnostic. Known words remain "
            "deterministic lookup, and this endpoint cannot authorize sentence generation."
        ),
    }
    report = {
        "schema_version": 1,
        "analysis_kind": "migmaq_v3_3_dialog_only_screen",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "path": str(dataset_dir),
            "manifest_sha256": args.expected_dataset_manifest_sha256,
            **release_checksum_audit,
        },
        "reused_base": {
            "reason": (
                "The v3.3 existing and lesson-all evaluation inputs are byte-identical to v3.2; the exact "
                "checksum-bound untouched-v1 outputs are reused without another GPU generation pass."
            ),
            "v3_2_contract_sha256": BASE_CONTRACT_SHA256,
            "run_checksum_manifest_sha256": BASE_RUN_CHECKSUM_MANIFEST_SHA256,
        },
        "checksum_audits": checksum_audits,
        "run_log_audits": log_audits,
        "run_manifests": run_manifests,
        "training_audit": {
            "schedule": schedule_audit,
            "learning_rate_trajectories_identical": True,
            "trajectory": next(iter(trajectories.values())),
            "token_accounting": dataset["token_accounting"]["schedule_audit"],
            "tokenizer_canonicalization": tokenizer_audits,
            "adapter_topology": (
                "LoRA rank 32 over attention/feed-forward projections; no full modules saved; v1 untied "
                "output head preserved"
            ),
        },
        "sentence_metrics": metrics,
        "lesson_dialog_paired_bootstrap": bootstraps,
        "vocabulary_container_interpretation": (
            "The 74 vocabulary-container rows are a separate phrase/lookup diagnostic and are not part "
            "of the sentence-model promotion gate."
        ),
        "lexical_diagnostics": lexical,
        "decision": decision,
        "claim_limit": (
            "Single-seed development screen. A selected recipe advances only to seeds 17 and 73; the "
            "sealed lesson test remains unopened and no result here authorizes release or deployment."
        ),
    }
    output = args.output_dir.expanduser().resolve()
    if output.exists():
        raise FileExistsError(output)
    output.mkdir(parents=True)
    write_json_atomic(output / "comparison.json", report)
    for endpoint, rows in paired_ledgers.items():
        write_jsonl_atomic(output / f"paired-{endpoint}.jsonl", rows)
    files = sorted(path for path in output.iterdir() if path.is_file())
    (output / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files), encoding="utf-8"
    )
    print(
        json.dumps(
            {"decision": decision, "sentence_metrics": metrics, "lexical": lexical},
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

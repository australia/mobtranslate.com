#!/usr/bin/env python3
"""Verify and compare the paired Mi'kmaq v3.1 sentence-LoRA screen."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable

from sacrebleu.metrics import CHRF

try:
    from .analyze_migmaq_v2_dose import basic_metrics, rescore_predictions
    from .compare_migmaq_v2_screen import canonical_id, sha256
    from .compare_migmaq_v3_tokenizer_screen import (
        count_bucket,
        exact_transition,
        keyed_canonical,
        read_jsonl,
        ratio_bucket,
        word_tokens,
    )
    from .evaluate_migmaq_lexical_baseline import error_rate, graphemes, normalize
except ImportError:
    from analyze_migmaq_v2_dose import basic_metrics, rescore_predictions
    from compare_migmaq_v2_screen import canonical_id, sha256
    from compare_migmaq_v3_tokenizer_screen import (
        count_bucket,
        exact_transition,
        keyed_canonical,
        read_jsonl,
        ratio_bucket,
        word_tokens,
    )
    from evaluate_migmaq_lexical_baseline import error_rate, graphemes, normalize


EXPECTED_TOKEN_IDS = {
    "<translate>": 256205,
    "<lexeme>": 256206,
    "<pos>": 256207,
    "<glossary>": 256208,
}
EXPECTED_TRAINABLE_TOKENS = {"<translate>", "<lexeme>", "<pos>"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--control-schedule", type=Path, required=True)
    parser.add_argument("--glossary-schedule", type=Path, required=True)
    parser.add_argument("--control-run", type=Path, required=True)
    parser.add_argument("--glossary-run", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--expected-contract-sha256", required=True)
    parser.add_argument("--expected-benchmark-rows", type=int, default=14_438)
    parser.add_argument("--expected-schedule-rows", type=int, default=19_200)
    parser.add_argument("--expected-changed-inputs", type=int, default=4_800)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object in {path}")
    return value


def keyed_schedule(path: Path) -> tuple[list[str], dict[str, dict[str, Any]]]:
    order: list[str] = []
    rows: dict[str, dict[str, Any]] = {}
    for line_number, row in enumerate(read_jsonl(path), start=1):
        row_id = str(row.get("id") or "")
        if not row_id or row_id in rows:
            raise ValueError(f"blank or duplicate schedule ID at {path}:{line_number}")
        order.append(row_id)
        rows[row_id] = row
    return order, rows


def audit_paired_schedules(
    control_path: Path,
    glossary_path: Path,
    *,
    expected_rows: int,
    expected_changed_inputs: int,
) -> tuple[dict[str, Any], set[str]]:
    control_order, control = keyed_schedule(control_path)
    glossary_order, glossary = keyed_schedule(glossary_path)
    if len(control_order) != expected_rows or len(glossary_order) != expected_rows:
        raise ValueError(
            f"schedule row count changed: control={len(control_order)} "
            f"glossary={len(glossary_order)} expected={expected_rows}"
        )
    if control_order != glossary_order:
        raise ValueError("paired schedule row IDs or order differ")

    changed: list[str] = []
    common = 0
    lexical_ids: set[str] = set()
    allowed_changed_fields = {"input_text", "task", "pair_kind", "glossary_condition"}
    for row_id in control_order:
        left = control[row_id]
        right = glossary[row_id]
        if left.get("output_text") != right.get("output_text"):
            raise ValueError(f"paired schedule target differs for {row_id}")
        if left.get("schedule_source_id") != right.get("schedule_source_id"):
            raise ValueError(f"paired schedule source ID differs for {row_id}")
        differing_fields = {
            field
            for field in set(left) | set(right)
            if left.get(field) != right.get(field)
        }
        if left.get("input_text") == right.get("input_text"):
            if differing_fields:
                raise ValueError(
                    f"unchanged-input row has metadata drift for {row_id}: {differing_fields}"
                )
            common += 1
        else:
            if not differing_fields <= allowed_changed_fields:
                raise ValueError(
                    f"paired intervention drift for {row_id}: {differing_fields}"
                )
            if (
                left.get("task") != "translate"
                or right.get("task") != "glossary_translation"
            ):
                raise ValueError(f"unexpected paired task transition for {row_id}")
            if left.get("pair_kind") != "attested_dictionary_example_translation":
                raise ValueError(f"unexpected control pair kind for {row_id}")
            if right.get("pair_kind") != "attested_glossary_conditioned_translation":
                raise ValueError(f"unexpected glossary pair kind for {row_id}")
            if "<glossary>" not in str(right.get("input_text") or ""):
                raise ValueError(f"glossary marker absent from treatment row {row_id}")
            changed.append(row_id)
        if left.get("task") == "lexeme":
            lexical_ids.add(canonical_id(left.get("schedule_source_id")))

    if len(changed) != expected_changed_inputs:
        raise ValueError(
            f"changed-input count is {len(changed)}, expected {expected_changed_inputs}"
        )
    return {
        "rows": expected_rows,
        "identical_row_ids_and_order": True,
        "identical_targets": True,
        "identical_rows": common,
        "input_only_intervention_rows": len(changed),
        "direct_lexical_source_rows": len(lexical_ids),
        "control_sha256": sha256(control_path),
        "glossary_sha256": sha256(glossary_path),
    }, lexical_ids


def load_exposure(path: Path) -> dict[str, int]:
    exposure: dict[str, int] = {}
    for line_number, row in enumerate(read_jsonl(path), start=1):
        row_id = str(row.get("id") or "")
        presentations = int(row.get("presentations") or 0)
        if not row_id or row_id in exposure or presentations <= 0:
            raise ValueError(f"invalid exposure row at {path}:{line_number}")
        exposure[row_id] = presentations
    return exposure


def verify_checksum_manifest(root: Path) -> dict[str, Any]:
    manifest = root / "RUN-SHA256SUMS"
    if not manifest.is_file():
        raise ValueError(f"run checksum manifest is absent: {manifest}")
    checked = 0
    root_resolved = root.resolve()
    for line_number, line in enumerate(
        manifest.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            expected, relative = line.split(maxsplit=1)
        except ValueError as error:
            raise ValueError(
                f"malformed checksum row at {manifest}:{line_number}"
            ) from error
        relative = relative.lstrip("*")
        path = (root / relative).resolve()
        if root_resolved not in path.parents:
            raise ValueError(f"checksum path escapes run directory: {relative}")
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"checksum verification failed for {path}")
        checked += 1
    if checked == 0:
        raise ValueError(f"empty checksum manifest: {manifest}")
    return {
        "manifest_sha256": sha256(manifest),
        "files_verified": checked,
        "passed": True,
    }


def learning_rate_trajectory(manifest: dict[str, Any]) -> list[tuple[int, float]]:
    result: list[tuple[int, float]] = []
    for row in manifest["trainer_state"]["log_history"]:
        if "learning_rate" in row and "step" in row:
            result.append((int(row["step"]), float(row["learning_rate"])))
    return result


def audit_runs(
    control_run: Path,
    glossary_run: Path,
    control_schedule: Path,
    *,
    expected_contract_sha256: str,
) -> dict[str, Any]:
    checksums = {
        "control": verify_checksum_manifest(control_run),
        "glossary": verify_checksum_manifest(glossary_run),
    }
    for run in (control_run, glossary_run):
        copied_contract = run / "input-experiment-contract.json"
        if sha256(copied_contract) != expected_contract_sha256:
            raise ValueError(f"copied experiment contract changed in {run}")

    control_manifest = load_json(control_run / "model/model_manifest.json")
    glossary_manifest = load_json(glossary_run / "model/model_manifest.json")
    control_exposure_path = control_run / "model/exposure-row-presentations.jsonl"
    glossary_exposure_path = glossary_run / "model/exposure-row-presentations.jsonl"
    control_exposure = load_exposure(control_exposure_path)
    glossary_exposure = load_exposure(glossary_exposure_path)
    if control_exposure != glossary_exposure:
        raise ValueError("paired run exposure ledgers differ")
    schedule_order, _ = keyed_schedule(control_schedule)
    if set(control_exposure) != set(schedule_order):
        raise ValueError("exposure ledger is not the complete paired schedule")
    if set(control_exposure.values()) != {1}:
        raise ValueError("every schedule row was not presented exactly once")

    if control_manifest["training_args"] != glossary_manifest["training_args"]:
        raise ValueError("matched training arguments differ")
    if learning_rate_trajectory(control_manifest) != learning_rate_trajectory(
        glossary_manifest
    ):
        raise ValueError("matched learning-rate trajectories differ")
    for arm, manifest, expected_tasks in (
        (
            "control",
            control_manifest,
            {
                "attested_dictionary_example_translation": 18_240,
                "source_dictionary_lexical_reconstruction": 960,
            },
        ),
        (
            "glossary",
            glossary_manifest,
            {
                "attested_dictionary_example_translation": 13_440,
                "attested_glossary_conditioned_translation": 4_800,
                "source_dictionary_lexical_reconstruction": 960,
            },
        ),
    ):
        state = manifest["trainer_state"]
        exposure = state["actual_training_exposure"]
        observed_tasks = {
            task: int(values["examples"])
            for task, values in exposure["by_task"].items()
            if int(values["examples"]) > 0
        }
        if state["global_step"] != 600 or exposure["examples"] != 19_200:
            raise ValueError(f"{arm} did not execute the registered 600-step exposure")
        if exposure["unique_rows_seen"] != 19_200:
            raise ValueError(f"{arm} did not see all schedule rows")
        presentations = exposure["presentations_per_seen_row"]
        if presentations["minimum"] != 1 or presentations["maximum"] != 1:
            raise ValueError(f"{arm} repeated or omitted schedule rows")
        if observed_tasks != expected_tasks:
            raise ValueError(f"{arm} task exposure changed: {observed_tasks}")
        tokens = manifest["token_adaptation"]
        registered = {
            row["token"]: row["token_id"] for row in tokens["additional_special_tokens"]
        }
        trained = {row["token"] for row in tokens["trainable_tokens"]}
        if registered != EXPECTED_TOKEN_IDS or trained != EXPECTED_TRAINABLE_TOKENS:
            raise ValueError(f"{arm} task-token contract changed")
        if not tokens["selective_token_gradient_audit"][
            "all_selected_rows_received_nonzero_gradient"
        ]:
            raise ValueError(f"{arm} has a selected token row without gradient")
        if not tokens["unselected_audit_rows_unchanged"]:
            raise ValueError(f"{arm} changed an unselected source embedding row")

    control_tokens = control_manifest["trainer_state"]["actual_training_exposure"]
    glossary_tokens = glossary_manifest["trainer_state"]["actual_training_exposure"]
    if control_tokens["target_tokens"] != glossary_tokens["target_tokens"]:
        raise ValueError("paired target-token exposure differs")
    return {
        "checksums": checksums,
        "exposure_ledgers_identical": True,
        "exposure_ledger_sha256": sha256(control_exposure_path),
        "schedule_rows_presented_once": len(control_exposure),
        "training_args_identical": True,
        "learning_rate_trajectory_identical": True,
        "learning_rate_observations": len(learning_rate_trajectory(control_manifest)),
        "target_token_exposure_identical": True,
        "target_tokens": control_tokens["target_tokens"],
        "source_tokens": {
            "control": control_tokens["source_tokens"],
            "glossary": glossary_tokens["source_tokens"],
        },
    }


def paired_lexical_analysis(
    benchmark_path: Path,
    control_path: Path,
    glossary_path: Path,
    direct_ids: set[str],
    *,
    expected_rows: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    benchmark = keyed_canonical(benchmark_path)
    if len(benchmark) != expected_rows:
        raise ValueError(
            f"lexical benchmark has {len(benchmark)} rows, expected {expected_rows}"
        )
    if not direct_ids <= set(benchmark):
        raise ValueError("direct lexical schedule rows are absent from the benchmark")
    control = rescore_predictions(control_path, benchmark)
    glossary = rescore_predictions(glossary_path, benchmark)
    rows: list[dict[str, Any]] = []
    for row_id in sorted(benchmark):
        left = control[row_id]
        right = glossary[row_id]
        rows.append(
            {
                "id": row_id,
                "input_text": left["input_text"],
                "part_of_speech": left["part_of_speech"],
                "accepted_references": left["accepted_references"],
                "exposure_stratum": "direct_lexical_pair"
                if row_id in direct_ids
                else "not_directly_paired",
                "exact_transition": exact_transition(
                    bool(left["accepted_exact"]), bool(right["accepted_exact"])
                ),
                "grapheme_cer_delta_glossary_minus_control": (
                    float(right["grapheme_cer"]) - float(left["grapheme_cer"])
                ),
                "control": {
                    "prediction": left["prediction"],
                    "accepted_exact": left["accepted_exact"],
                    "grapheme_cer": left["grapheme_cer"],
                },
                "glossary": {
                    "prediction": right["prediction"],
                    "accepted_exact": right["accepted_exact"],
                    "grapheme_cer": right["grapheme_cer"],
                },
            }
        )
    return {
        "rows": len(rows),
        "control": basic_metrics(control.values()),
        "glossary": basic_metrics(glossary.values()),
        "paired": paired_lexical_summary(rows),
        "by_exposure_stratum": grouped_paired_lexical(rows, "exposure_stratum"),
    }, rows


def paired_lexical_summary(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    materialized = list(rows)
    transitions = Counter(row["exact_transition"] for row in materialized)
    deltas = [
        float(row["grapheme_cer_delta_glossary_minus_control"]) for row in materialized
    ]
    return {
        "rows": len(materialized),
        "exact_transitions": dict(sorted(transitions.items())),
        "net_exact_gain": transitions["gain"] - transitions["loss"],
        "mean_grapheme_cer_delta_glossary_minus_control": statistics.fmean(deltas)
        if deltas
        else 0.0,
        "cer_improved_rows": sum(value < -1e-12 for value in deltas),
        "cer_worsened_rows": sum(value > 1e-12 for value in deltas),
        "cer_tied_rows": sum(abs(value) <= 1e-12 for value in deltas),
    }


def grouped_paired_lexical(
    rows: Iterable[dict[str, Any]], field: str
) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) or "(missing)")].append(row)
    return {
        label: paired_lexical_summary(members)
        for label, members in sorted(groups.items())
    }


def load_sentence_predictions(
    path: Path,
) -> tuple[dict[str, Any], list[str], dict[str, dict[str, Any]]]:
    document = load_json(path)
    source_rows = document.get("predictions") or []
    order: list[str] = []
    rows: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(source_rows, start=1):
        row_id = str(row.get("id") or "")
        if not row_id or row_id in rows:
            raise ValueError(f"blank or duplicate sentence ID at {path}:{index}")
        order.append(row_id)
        rows[row_id] = row
    metrics = dict(document.get("metrics") or {})
    predictions = [normalize(row.get("prediction")) for row in source_rows]
    references = [normalize(row.get("reference")) for row in source_rows]
    metrics.update(
        {
            "empty_outputs": sum(not prediction for prediction in predictions),
            "source_copy_outputs": sum(
                prediction
                == normalize(
                    row.get("unconditioned_input_text") or row.get("input_text")
                )
                for row, prediction in zip(source_rows, predictions)
            ),
            "mean_prediction_characters": statistics.fmean(map(len, predictions))
            if predictions
            else 0.0,
            "mean_reference_characters": statistics.fmean(map(len, references))
            if references
            else 0.0,
        }
    )
    return metrics, order, rows


def paired_sentence_analysis(
    control_path: Path,
    glossary_path: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    control_metrics, control_order, control = load_sentence_predictions(control_path)
    glossary_metrics, glossary_order, glossary = load_sentence_predictions(
        glossary_path
    )
    if control_order != glossary_order:
        raise ValueError("sentence prediction order or IDs differ")
    generation_keys = (
        "rows",
        "num_beams",
        "no_repeat_ngram_size",
        "repetition_penalty",
        "length_penalty",
        "dtype",
        "artifact_kind",
    )
    if tuple(control_metrics.get(key) for key in generation_keys) != tuple(
        glossary_metrics.get(key) for key in generation_keys
    ):
        raise ValueError("sentence generation contracts differ")

    sentence_chrf = CHRF(word_order=2)
    matrix: list[dict[str, Any]] = []
    for row_id in control_order:
        left = control[row_id]
        right = glossary[row_id]
        for field in ("input_text", "reference"):
            if normalize(left.get(field)) != normalize(right.get(field)):
                raise ValueError(f"sentence {field} mismatch for {row_id}")
        reference = normalize(left.get("reference"))
        control_prediction = normalize(left.get("prediction"))
        glossary_prediction = normalize(right.get("prediction"))
        control_cer = error_rate(graphemes(control_prediction), graphemes(reference))
        glossary_cer = error_rate(graphemes(glossary_prediction), graphemes(reference))
        control_ratio = len(graphemes(control_prediction)) / max(
            1, len(graphemes(reference))
        )
        glossary_ratio = len(graphemes(glossary_prediction)) / max(
            1, len(graphemes(reference))
        )
        control_chrf = sentence_chrf.sentence_score(
            control_prediction, [reference]
        ).score
        glossary_chrf = sentence_chrf.sentence_score(
            glossary_prediction, [reference]
        ).score
        matrix.append(
            {
                "id": row_id,
                "source": left.get("unconditioned_input_text")
                or left.get("input_text"),
                "reference": left.get("reference"),
                "source_word_count_class": count_bucket(
                    len(
                        word_tokens(
                            left.get("unconditioned_input_text")
                            or left.get("input_text")
                        )
                    ),
                    (5, 10, 15, 25),
                ),
                "control": {
                    "prediction": left.get("prediction"),
                    "grapheme_cer": control_cer,
                    "character_length_ratio": control_ratio,
                    "length_ratio_class": ratio_bucket(control_ratio),
                    "sentence_chrf": control_chrf,
                },
                "glossary": {
                    "prediction": right.get("prediction"),
                    "grapheme_cer": glossary_cer,
                    "character_length_ratio": glossary_ratio,
                    "length_ratio_class": ratio_bucket(glossary_ratio),
                    "sentence_chrf": glossary_chrf,
                },
                "prediction_changed": control_prediction != glossary_prediction,
                "grapheme_cer_delta_glossary_minus_control": glossary_cer - control_cer,
                "sentence_chrf_delta_glossary_minus_control": glossary_chrf
                - control_chrf,
                "length_ratio_delta_glossary_minus_control": glossary_ratio
                - control_ratio,
            }
        )

    cer_deltas = [row["grapheme_cer_delta_glossary_minus_control"] for row in matrix]
    chrf_deltas = [row["sentence_chrf_delta_glossary_minus_control"] for row in matrix]
    report = {
        "rows": len(matrix),
        "control_metrics": control_metrics,
        "glossary_metrics": glossary_metrics,
        "corpus_metric_delta_glossary_minus_control": {
            "chrf": glossary_metrics["chrf"] - control_metrics["chrf"],
            "bleu": glossary_metrics["bleu"] - control_metrics["bleu"],
            "mean_prediction_characters": glossary_metrics["mean_prediction_characters"]
            - control_metrics["mean_prediction_characters"],
        },
        "prediction_changed_rows": sum(row["prediction_changed"] for row in matrix),
        "mean_grapheme_cer_delta_glossary_minus_control": statistics.fmean(cer_deltas),
        "cer_improved_rows": sum(value < -1e-12 for value in cer_deltas),
        "cer_worsened_rows": sum(value > 1e-12 for value in cer_deltas),
        "cer_tied_rows": sum(abs(value) <= 1e-12 for value in cer_deltas),
        "mean_sentence_chrf_delta_glossary_minus_control": statistics.fmean(
            chrf_deltas
        ),
        "sentence_chrf_improved_rows": sum(value > 1e-12 for value in chrf_deltas),
        "sentence_chrf_worsened_rows": sum(value < -1e-12 for value in chrf_deltas),
        "sentence_chrf_tied_rows": sum(abs(value) <= 1e-12 for value in chrf_deltas),
    }
    return report, matrix


def glossary_summary(run: Path, name: str) -> dict[str, Any]:
    return load_json(run / f"evaluations/{name}.json")["summary"]


def condition(observed: Any, required: Any, passed: bool) -> dict[str, Any]:
    return {"observed": observed, "required": required, "pass": bool(passed)}


def per_arm_gate(
    lexical: dict[str, Any],
    validation: dict[str, Any],
    opened: dict[str, Any],
    contract: dict[str, Any],
) -> dict[str, Any]:
    gates = contract["per_arm_hard_gates"]
    checks = {
        "lexical_blank_outputs": condition(
            lexical["blank_outputs"],
            gates["lexical_blank_outputs_maximum"],
            lexical["blank_outputs"] <= gates["lexical_blank_outputs_maximum"],
        ),
        "sentence_validation_blank_outputs": condition(
            validation["empty_outputs"],
            gates["sentence_blank_outputs_maximum"],
            validation["empty_outputs"] <= gates["sentence_blank_outputs_maximum"],
        ),
        "sentence_opened_blank_outputs": condition(
            opened["empty_outputs"],
            gates["sentence_blank_outputs_maximum"],
            opened["empty_outputs"] <= gates["sentence_blank_outputs_maximum"],
        ),
        "sentence_validation_chrf": condition(
            validation["chrf"],
            gates["sentence_validation_chrf_minimum"],
            validation["chrf"] >= gates["sentence_validation_chrf_minimum"],
        ),
        "sentence_opened_chrf": condition(
            opened["chrf"],
            gates["sentence_opened_regression_chrf_minimum"],
            opened["chrf"] >= gates["sentence_opened_regression_chrf_minimum"],
        ),
        "lexical_mean_grapheme_cer": condition(
            lexical["mean_grapheme_cer"],
            gates["lexical_mean_grapheme_cer_maximum"],
            lexical["mean_grapheme_cer"] <= gates["lexical_mean_grapheme_cer_maximum"],
        ),
        "lexical_unique_outputs": condition(
            lexical["unique_normalized_outputs"],
            gates["lexical_unique_outputs_minimum"],
            lexical["unique_normalized_outputs"]
            >= gates["lexical_unique_outputs_minimum"],
        ),
        "lexical_maximum_output_frequency": condition(
            lexical["maximum_normalized_output_frequency"],
            gates["lexical_maximum_output_frequency_maximum"],
            lexical["maximum_normalized_output_frequency"]
            <= gates["lexical_maximum_output_frequency_maximum"],
        ),
        "lexical_source_copies": condition(
            lexical["source_copies"],
            gates["lexical_source_copies_maximum"],
            lexical["source_copies"] <= gates["lexical_source_copies_maximum"],
        ),
    }
    return {
        "passed": all(item["pass"] for item in checks.values()),
        "conditions": checks,
    }


def selection_decision(
    control_gate: dict[str, Any],
    glossary_gate: dict[str, Any],
    control_validation: dict[str, Any],
    glossary_validation: dict[str, Any],
    control_opened: dict[str, Any],
    glossary_opened: dict[str, Any],
    control_unexposed: dict[str, Any],
    glossary_unexposed: dict[str, Any],
    contract: dict[str, Any],
) -> dict[str, Any]:
    treatment_gates = contract["treatment_continuation_gates"]
    control_gates = contract["control_continuation_gates_if_treatment_fails"]
    treatment_checks = {
        "sentence_validation_delta": condition(
            glossary_validation["chrf"] - control_validation["chrf"],
            treatment_gates["glossary_minus_control_sentence_validation_chrf_minimum"],
            glossary_validation["chrf"] - control_validation["chrf"]
            >= treatment_gates[
                "glossary_minus_control_sentence_validation_chrf_minimum"
            ],
        ),
        "sentence_opened_delta": condition(
            glossary_opened["chrf"] - control_opened["chrf"],
            treatment_gates[
                "glossary_minus_control_sentence_opened_regression_chrf_minimum"
            ],
            glossary_opened["chrf"] - control_opened["chrf"]
            >= treatment_gates[
                "glossary_minus_control_sentence_opened_regression_chrf_minimum"
            ],
        ),
        "project_unexposed_paired_chrf_delta_gain": condition(
            glossary_unexposed["paired_chrf_delta"]
            - control_unexposed["paired_chrf_delta"],
            treatment_gates[
                "glossary_minus_control_project_unexposed_paired_chrf_delta_minimum"
            ],
            glossary_unexposed["paired_chrf_delta"]
            - control_unexposed["paired_chrf_delta"]
            >= treatment_gates[
                "glossary_minus_control_project_unexposed_paired_chrf_delta_minimum"
            ],
        ),
        "project_unexposed_conditioned_chrf_gain": condition(
            glossary_unexposed["conditioned_chrf"]
            - control_unexposed["conditioned_chrf"],
            treatment_gates[
                "glossary_minus_control_project_unexposed_conditioned_chrf_minimum"
            ],
            glossary_unexposed["conditioned_chrf"]
            - control_unexposed["conditioned_chrf"]
            >= treatment_gates[
                "glossary_minus_control_project_unexposed_conditioned_chrf_minimum"
            ],
        ),
        "project_unexposed_net_uptake_noninferiority": condition(
            glossary_unexposed["all_hint_row_gains"]
            - glossary_unexposed["all_hint_row_losses"],
            control_unexposed["all_hint_row_gains"]
            - control_unexposed["all_hint_row_losses"],
            glossary_unexposed["all_hint_row_gains"]
            - glossary_unexposed["all_hint_row_losses"]
            >= control_unexposed["all_hint_row_gains"]
            - control_unexposed["all_hint_row_losses"],
        ),
    }
    treatment_passed = glossary_gate["passed"] and all(
        item["pass"] for item in treatment_checks.values()
    )
    control_checks = {
        "sentence_validation_chrf": condition(
            control_validation["chrf"],
            control_gates["control_sentence_validation_chrf_minimum"],
            control_validation["chrf"]
            >= control_gates["control_sentence_validation_chrf_minimum"],
        ),
        "sentence_opened_chrf": condition(
            control_opened["chrf"],
            control_gates["control_sentence_opened_regression_chrf_minimum"],
            control_opened["chrf"]
            >= control_gates["control_sentence_opened_regression_chrf_minimum"],
        ),
    }
    control_passed = control_gate["passed"] and all(
        item["pass"] for item in control_checks.values()
    )
    if treatment_passed:
        selected = "glossary"
    elif control_passed:
        selected = "control"
    else:
        selected = None
    return {
        "selected_recipe": selected,
        "continue_to_2400_updates": selected is not None,
        "treatment_continuation_passed": treatment_passed,
        "treatment_conditions": treatment_checks,
        "control_fallback_continuation_passed": control_passed,
        "control_fallback_conditions": control_checks,
    }


def build_report(
    args: argparse.Namespace,
) -> tuple[
    dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]
]:
    if sha256(args.contract) != args.expected_contract_sha256:
        raise ValueError("experiment contract SHA-256 changed")
    contract = load_json(args.contract)
    schedule_audit, direct_ids = audit_paired_schedules(
        args.control_schedule,
        args.glossary_schedule,
        expected_rows=args.expected_schedule_rows,
        expected_changed_inputs=args.expected_changed_inputs,
    )
    run_audit = audit_runs(
        args.control_run,
        args.glossary_run,
        args.control_schedule,
        expected_contract_sha256=args.expected_contract_sha256,
    )
    lexical, lexical_rows = paired_lexical_analysis(
        args.benchmark,
        args.control_run / "evaluations/lexical-full/predictions.jsonl",
        args.glossary_run / "evaluations/lexical-full/predictions.jsonl",
        direct_ids,
        expected_rows=args.expected_benchmark_rows,
    )
    validation, validation_rows = paired_sentence_analysis(
        args.control_run / "evaluations/sentence-validation.json",
        args.glossary_run / "evaluations/sentence-validation.json",
    )
    opened, opened_rows = paired_sentence_analysis(
        args.control_run / "evaluations/sentence-opened-regression.json",
        args.glossary_run / "evaluations/sentence-opened-regression.json",
    )
    control_glossary = {
        "all_validation": glossary_summary(args.control_run, "glossary-uptake"),
        "project_lineage_unexposed": glossary_summary(
            args.control_run, "glossary-project-unexposed-uptake"
        ),
    }
    glossary_glossary = {
        "all_validation": glossary_summary(args.glossary_run, "glossary-uptake"),
        "project_lineage_unexposed": glossary_summary(
            args.glossary_run, "glossary-project-unexposed-uptake"
        ),
    }
    control_gate = per_arm_gate(
        lexical["control"],
        validation["control_metrics"],
        opened["control_metrics"],
        contract,
    )
    glossary_gate = per_arm_gate(
        lexical["glossary"],
        validation["glossary_metrics"],
        opened["glossary_metrics"],
        contract,
    )
    decision = selection_decision(
        control_gate,
        glossary_gate,
        validation["control_metrics"],
        validation["glossary_metrics"],
        opened["control_metrics"],
        opened["glossary_metrics"],
        control_glossary["project_lineage_unexposed"],
        glossary_glossary["project_lineage_unexposed"],
        contract,
    )
    report = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "migmaq_v3_1_paired_sentence_lora_glossary_screen",
        "claim_limit": (
            "Single-seed development-census comparison. It does not establish free-form "
            "translation reliability, morphological generalization, or speaker acceptability."
        ),
        "contract": {
            "experiment_id": contract["experiment_id"],
            "path": str(args.contract.resolve()),
            "sha256": args.expected_contract_sha256,
        },
        "schedule_audit": schedule_audit,
        "run_audit": run_audit,
        "lexical": lexical,
        "sentence_validation": validation,
        "sentence_opened_regression": opened,
        "glossary_uptake": {
            "control": control_glossary,
            "glossary": glossary_glossary,
        },
        "hard_gates": {"control": control_gate, "glossary": glossary_gate},
        "decision": decision,
    }
    return report, lexical_rows, validation_rows, opened_rows


def write_json_atomic(path: Path, value: Any) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    if args.output_dir.exists() and any(args.output_dir.iterdir()):
        raise FileExistsError(f"refusing nonempty output directory: {args.output_dir}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report, lexical_rows, validation_rows, opened_rows = build_report(args)
    outputs = {
        "comparison.json": report,
        "lexical-paired.jsonl": lexical_rows,
        "sentence-validation-paired.jsonl": validation_rows,
        "sentence-opened-regression-paired.jsonl": opened_rows,
    }
    write_json_atomic(args.output_dir / "comparison.json", report)
    for name in (
        "lexical-paired.jsonl",
        "sentence-validation-paired.jsonl",
        "sentence-opened-regression-paired.jsonl",
    ):
        write_jsonl_atomic(args.output_dir / name, outputs[name])
    checksums = "".join(
        f"{sha256(args.output_dir / name)}  {name}\n" for name in sorted(outputs)
    )
    (args.output_dir / "OUTPUT-SHA256SUMS").write_text(checksums, encoding="utf-8")
    print(json.dumps(report["decision"], indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

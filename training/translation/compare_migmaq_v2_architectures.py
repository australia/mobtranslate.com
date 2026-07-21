#!/usr/bin/env python3
"""Compare two Mi'kmaq v2 architecture runs on one frozen benchmark.

The comparison is artifact-only. It rescales neither run, verifies row and
evaluation alignment, separates directly supervised and held-out lineages,
and evaluates a checksum-bound architecture-screen contract.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable

try:
    from .analyze_migmaq_v2_dose import (
        keyed_rows,
        lexicon_membership_metrics,
        load_exposure,
        load_json,
        model_report,
        pool_ids,
        prompt_audit,
        rescore_predictions,
    )
    from .compare_migmaq_v2_screen import canonical_id, sha256
except ImportError:
    from analyze_migmaq_v2_dose import (
        keyed_rows,
        lexicon_membership_metrics,
        load_exposure,
        load_json,
        model_report,
        pool_ids,
        prompt_audit,
        rescore_predictions,
    )
    from compare_migmaq_v2_screen import canonical_id, sha256


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--direct-pool", type=Path, required=True)
    parser.add_argument("--heldout-pool", type=Path, required=True)
    parser.add_argument("--baseline-run", type=Path, required=True)
    parser.add_argument("--baseline-evaluation-dir", default="evaluations")
    parser.add_argument("--candidate-run", type=Path, required=True)
    parser.add_argument("--candidate-evaluation-dir", default="evaluations")
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, default=14_438)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sentence_metrics(run: Path, evaluation_dir: str) -> dict[str, dict[str, Any]]:
    root = run / evaluation_dir
    return {
        "validation": load_json(root / "sentence-validation.json")["metrics"],
        "opened_regression": load_json(root / "sentence-opened-regression.json")["metrics"],
    }


def annotate_rows(
    rows: dict[str, dict[str, Any]],
    direct_ids: set[str],
    exposure: dict[str, int],
) -> None:
    for row_id, row in rows.items():
        row["cohort"] = (
            "direct_pair_training_pool" if row_id in direct_ids else "heldout_lineage"
        )
        row["direct_presentations"] = exposure.get(row_id, 0)


def exact_transition(baseline: bool, candidate: bool) -> str:
    if baseline and candidate:
        return "stable_exact"
    if baseline:
        return "loss"
    if candidate:
        return "gain"
    return "stable_failure"


def exact_binomial_two_sided(successes: int, trials: int) -> float:
    """Two-sided exact sign-test probability under p=0.5."""
    if trials == 0:
        return 1.0
    minority = min(successes, trials - successes)
    tail = sum(math.comb(trials, value) for value in range(minority + 1)) / (2**trials)
    return min(1.0, 2 * tail)


def grouped_pair_summary(rows: Iterable[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        value = row.get(field)
        groups[str(value if value is not None else "(missing)")].append(row)
    result: dict[str, Any] = {}
    for label, members in sorted(groups.items()):
        deltas = [float(row["grapheme_cer_delta_candidate_minus_baseline"]) for row in members]
        transitions = Counter(str(row["exact_transition"]) for row in members)
        result[label] = {
            "rows": len(members),
            "exact_transitions": dict(sorted(transitions.items())),
            "candidate_exact_minus_baseline": transitions["gain"] - transitions["loss"],
            "mean_grapheme_cer_delta_candidate_minus_baseline": statistics.fmean(deltas),
            "cer_improved_rows": sum(delta < -1e-12 for delta in deltas),
            "cer_worsened_rows": sum(delta > 1e-12 for delta in deltas),
            "cer_tied_rows": sum(abs(delta) <= 1e-12 for delta in deltas),
        }
    return result


def paired_analysis(
    baseline: dict[str, dict[str, Any]],
    candidate: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    dictionary_forms: set[str] = set()
    dictionary_forms_by_pos: dict[str, set[str]] = defaultdict(set)
    for row in candidate.values():
        references = set(str(value) for value in row["accepted_references_normalized"])
        part_of_speech = str(row.get("part_of_speech") or "(missing)")
        dictionary_forms.update(references)
        dictionary_forms_by_pos[part_of_speech].update(references)

    matrix: list[dict[str, Any]] = []
    for row_id in sorted(candidate):
        left = baseline[row_id]
        right = candidate[row_id]
        baseline_prediction = str(left["prediction_normalized"])
        candidate_prediction = str(right["prediction_normalized"])
        part_of_speech = str(right.get("part_of_speech") or "(missing)")
        delta = float(right["grapheme_cer"]) - float(left["grapheme_cer"])
        matrix.append(
            {
                "id": row_id,
                "cohort": right["cohort"],
                "input_text": right["input_text"],
                "part_of_speech": part_of_speech,
                "target_subword_count": right.get("target_subword_count"),
                "accepted_references": right["accepted_references"],
                "exact_transition": exact_transition(
                    bool(left["accepted_exact"]), bool(right["accepted_exact"])
                ),
                "prediction_changed": baseline_prediction != candidate_prediction,
                "grapheme_cer_delta_candidate_minus_baseline": delta,
                "baseline": {
                    "prediction": left["prediction"],
                    "accepted_exact": left["accepted_exact"],
                    "grapheme_cer": left["grapheme_cer"],
                    "edit_error_type": left["edit_error_type"],
                    "is_any_dictionary_form": baseline_prediction in dictionary_forms,
                    "is_same_pos_dictionary_form": (
                        baseline_prediction in dictionary_forms_by_pos[part_of_speech]
                    ),
                },
                "candidate": {
                    "prediction": right["prediction"],
                    "accepted_exact": right["accepted_exact"],
                    "grapheme_cer": right["grapheme_cer"],
                    "edit_error_type": right["edit_error_type"],
                    "is_any_dictionary_form": candidate_prediction in dictionary_forms,
                    "is_same_pos_dictionary_form": (
                        candidate_prediction in dictionary_forms_by_pos[part_of_speech]
                    ),
                },
            }
        )

    transitions = Counter(str(row["exact_transition"]) for row in matrix)
    gains = transitions["gain"]
    losses = transitions["loss"]
    discordant = gains + losses
    deltas = [float(row["grapheme_cer_delta_candidate_minus_baseline"]) for row in matrix]
    summary = {
        "rows": len(matrix),
        "exact_transitions": dict(sorted(transitions.items())),
        "net_exact_gain": gains - losses,
        "prediction_changed_rows": sum(bool(row["prediction_changed"]) for row in matrix),
        "mean_grapheme_cer_delta_candidate_minus_baseline": statistics.fmean(deltas),
        "cer_improved_rows": sum(delta < -1e-12 for delta in deltas),
        "cer_worsened_rows": sum(delta > 1e-12 for delta in deltas),
        "cer_tied_rows": sum(abs(delta) <= 1e-12 for delta in deltas),
        "discordant_exact_sign_test": {
            "gains": gains,
            "losses": losses,
            "discordant_rows": discordant,
            "two_sided_exact_p": exact_binomial_two_sided(min(gains, losses), discordant),
            "interpretation": (
                "Descriptive paired stability test on this benchmark census; not a population estimate."
            ),
        },
        "by_cohort": grouped_pair_summary(matrix, "cohort"),
        "by_part_of_speech": grouped_pair_summary(matrix, "part_of_speech"),
        "by_target_subword_count": grouped_pair_summary(matrix, "target_subword_count"),
        "exact_gain_examples": [row for row in matrix if row["exact_transition"] == "gain"],
        "exact_loss_examples": [row for row in matrix if row["exact_transition"] == "loss"],
        "largest_cer_improvements": sorted(
            matrix, key=lambda row: row["grapheme_cer_delta_candidate_minus_baseline"]
        )[:100],
        "largest_cer_regressions": sorted(
            matrix,
            key=lambda row: row["grapheme_cer_delta_candidate_minus_baseline"],
            reverse=True,
        )[:100],
    }
    return summary, matrix


def token_preflight(manifest: dict[str, Any], contract: dict[str, Any]) -> dict[str, Any]:
    adaptation = manifest["token_adaptation"]
    expected_tokens = set(contract["training_contract"]["registered_trainable_task_tokens"])
    trained = {str(row["token"]) for row in adaptation["trainable_tokens"]}
    additional = {
        str(row["token"]): row for row in adaptation["additional_special_tokens"]
    }
    gradient = adaptation["selective_token_gradient_audit"]
    embedding = adaptation["embedding_row_delta_audit"]
    selected_rows = [row for row in embedding if row["selected_for_training"]]
    unselected_rows = [row for row in embedding if not row["selected_for_training"]]
    merge = manifest["artifacts"]["merge_embedding_canonicalization"]
    checks = {
        "expected_trainable_tokens": trained == expected_tokens,
        "registered_tokens_round_trip_as_one_special_id": all(
            token in additional
            and additional[token]["round_trip"]
            and additional[token]["single_encoded_id"]
            and additional[token]["is_special"]
            for token in expected_tokens
        ),
        "all_selected_rows_received_nonzero_gradient": bool(
            gradient["all_selected_rows_received_nonzero_gradient"]
        ),
        "all_selected_encoder_rows_changed": (
            {str(row["token"]) for row in selected_rows} == expected_tokens
            and all(bool(row["encoder_input_changed"]) for row in selected_rows)
        ),
        "unselected_input_rows_unchanged": all(
            not row["encoder_input_changed"]
            and not row["decoder_input_changed"]
            and not row["shared_input_changed"]
            for row in unselected_rows
        ),
        "target_language_id_unchanged": (
            manifest["target_lang_token_id"]
            == contract["training_contract"]["unchanged_target_language_token_id"]
        ),
        "merged_encoder_decoder_inputs_tied": bool(merge["encoder_decoder_tied"]),
        "merged_output_head_untied": not bool(merge["output_head_tied"]),
    }
    return {"passed": all(checks.values()), "checks": checks}


def evaluate_success_rule(
    contract: dict[str, Any],
    candidate_report: dict[str, Any],
    sentence: dict[str, dict[str, Any]],
    token_audit: dict[str, Any],
) -> dict[str, Any]:
    rule = contract["success_rule"]
    overall = candidate_report["overall"]
    direct = candidate_report["cohort"]["direct_pair_training_pool"]
    conditions = {
        "direct_pool_exact_minimum": {
            "observed": direct["accepted_exact_count"],
            "required": rule["direct_pool_exact_minimum"],
            "pass": direct["accepted_exact_count"] >= rule["direct_pool_exact_minimum"],
        },
        "direct_pool_exact_rate_minimum": {
            "observed": direct["accepted_exact_rate"],
            "required": rule["direct_pool_exact_rate_minimum"],
            "pass": direct["accepted_exact_rate"] >= rule["direct_pool_exact_rate_minimum"],
        },
        "full_lexical_exact_must_exceed": {
            "observed": overall["accepted_exact_count"],
            "required_strictly_greater_than": rule["full_lexical_exact_must_exceed"],
            "pass": overall["accepted_exact_count"]
            > rule["full_lexical_exact_must_exceed"],
        },
        "mean_grapheme_cer_maximum": {
            "observed": overall["mean_grapheme_cer"],
            "required": rule["mean_grapheme_cer_maximum"],
            "pass": overall["mean_grapheme_cer"] <= rule["mean_grapheme_cer_maximum"],
        },
        "unique_normalized_outputs_minimum": {
            "observed": overall["unique_normalized_outputs"],
            "required": rule["unique_normalized_outputs_minimum"],
            "pass": overall["unique_normalized_outputs"]
            >= rule["unique_normalized_outputs_minimum"],
        },
        "max_single_output_frequency_maximum": {
            "observed": overall["maximum_normalized_output_frequency"],
            "required": rule["max_single_output_frequency_maximum"],
            "pass": overall["maximum_normalized_output_frequency"]
            <= rule["max_single_output_frequency_maximum"],
        },
        "validation_chrf_minimum": {
            "observed": sentence["validation"]["chrf"],
            "required": rule["validation_chrf_minimum"],
            "pass": sentence["validation"]["chrf"] >= rule["validation_chrf_minimum"],
        },
        "opened_regression_chrf_minimum": {
            "observed": sentence["opened_regression"]["chrf"],
            "required": rule["opened_regression_chrf_minimum"],
            "pass": sentence["opened_regression"]["chrf"]
            >= rule["opened_regression_chrf_minimum"],
        },
        "blank_outputs_maximum": {
            "observed": overall["blank_outputs"],
            "required": rule["blank_outputs_maximum"],
            "pass": overall["blank_outputs"] <= rule["blank_outputs_maximum"],
        },
        "token_preflight_must_pass": {
            "observed": token_audit["passed"],
            "required": rule["token_preflight_must_pass"],
            "pass": token_audit["passed"] is rule["token_preflight_must_pass"],
        },
    }
    return {
        "passed": all(value["pass"] for value in conditions.values()),
        "conditions": conditions,
        "failure_action": contract["failure_action"],
        "promotion_rule": contract["promotion_rule"],
    }


def assert_sentence_contract_alignment(
    baseline: dict[str, dict[str, Any]], candidate: dict[str, dict[str, Any]]
) -> None:
    keys = (
        "rows",
        "num_beams",
        "no_repeat_ngram_size",
        "repetition_penalty",
        "length_penalty",
        "dtype",
        "artifact_kind",
    )
    for split in ("validation", "opened_regression"):
        left = tuple(baseline[split].get(key) for key in keys)
        right = tuple(candidate[split].get(key) for key in keys)
        if left != right:
            raise ValueError(f"sentence evaluation contract mismatch for {split}: {left} != {right}")


def build_report(args: argparse.Namespace) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    benchmark = keyed_rows(args.benchmark)
    if len(benchmark) != args.expected_rows:
        raise ValueError(f"expected {args.expected_rows} benchmark rows, found {len(benchmark)}")
    direct_ids = pool_ids(args.direct_pool)
    heldout_ids = pool_ids(args.heldout_pool)
    if direct_ids & heldout_ids or direct_ids | heldout_ids != set(benchmark):
        raise ValueError("direct and held-out pools do not form the benchmark partition")

    baseline_prediction_path = (
        args.baseline_run / args.baseline_evaluation_dir / "lexical-full/predictions.jsonl"
    )
    candidate_prediction_path = (
        args.candidate_run / args.candidate_evaluation_dir / "lexical-full/predictions.jsonl"
    )
    baseline = rescore_predictions(baseline_prediction_path, benchmark)
    candidate = rescore_predictions(candidate_prediction_path, benchmark)
    if set(baseline) != set(candidate):
        raise ValueError("baseline and candidate prediction IDs differ")

    baseline_exposure_path = args.baseline_run / "model/exposure-row-presentations.jsonl"
    candidate_exposure_path = args.candidate_run / "model/exposure-row-presentations.jsonl"
    baseline_exposure = load_exposure(baseline_exposure_path)
    candidate_exposure = load_exposure(candidate_exposure_path)
    annotate_rows(baseline, direct_ids, baseline_exposure)
    annotate_rows(candidate, direct_ids, candidate_exposure)
    if any(candidate_exposure.get(row_id, 0) for row_id in heldout_ids):
        raise ValueError("held-out lexical rows received direct candidate exposure")

    baseline_report = model_report(baseline)
    candidate_report = model_report(candidate)
    paired, matrix = paired_analysis(baseline, candidate)
    baseline_sentence = sentence_metrics(args.baseline_run, args.baseline_evaluation_dir)
    candidate_sentence = sentence_metrics(args.candidate_run, args.candidate_evaluation_dir)
    assert_sentence_contract_alignment(baseline_sentence, candidate_sentence)

    baseline_manifest_path = args.baseline_run / "model/model_manifest.json"
    candidate_manifest_path = args.candidate_run / "model/model_manifest.json"
    baseline_manifest = load_json(baseline_manifest_path)
    candidate_manifest = load_json(candidate_manifest_path)
    contract = load_json(args.contract)
    token_audit = token_preflight(candidate_manifest, contract)
    decision = evaluate_success_rule(contract, candidate_report, candidate_sentence, token_audit)

    baseline_training = baseline_manifest["trainer_state"]["actual_training_exposure"]
    candidate_training = candidate_manifest["trainer_state"]["actual_training_exposure"]
    row_schedule_identical = sha256(baseline_exposure_path) == sha256(candidate_exposure_path)
    report = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "migmaq_v2_registered_task_token_architecture_comparison",
        "claim_limit": contract["claim_limit"],
        "inputs": {
            "benchmark": {"path": str(args.benchmark.resolve()), "sha256": sha256(args.benchmark)},
            "direct_pool": {"path": str(args.direct_pool.resolve()), "sha256": sha256(args.direct_pool)},
            "heldout_pool": {"path": str(args.heldout_pool.resolve()), "sha256": sha256(args.heldout_pool)},
            "baseline_predictions": {
                "path": str(baseline_prediction_path.resolve()),
                "sha256": sha256(baseline_prediction_path),
            },
            "candidate_predictions": {
                "path": str(candidate_prediction_path.resolve()),
                "sha256": sha256(candidate_prediction_path),
            },
            "baseline_manifest": {
                "path": str(baseline_manifest_path.resolve()),
                "sha256": sha256(baseline_manifest_path),
            },
            "candidate_manifest": {
                "path": str(candidate_manifest_path.resolve()),
                "sha256": sha256(candidate_manifest_path),
            },
            "contract": {"path": str(args.contract.resolve()), "sha256": sha256(args.contract)},
        },
        "rows": len(benchmark),
        "cohort_rows": {
            "direct_pair_training_pool": len(direct_ids),
            "heldout_lineage": len(heldout_ids),
        },
        "causal_alignment": {
            "row_presentation_schedule_identical": row_schedule_identical,
            "baseline_exposure_ledger_sha256": sha256(baseline_exposure_path),
            "candidate_exposure_ledger_sha256": sha256(candidate_exposure_path),
            "optimizer_steps": {
                "baseline": baseline_manifest["trainer_state"]["global_step"],
                "candidate": candidate_manifest["trainer_state"]["global_step"],
            },
            "examples": {
                "baseline": baseline_training["examples"],
                "candidate": candidate_training["examples"],
            },
            "source_tokens": {
                "baseline": baseline_training["source_tokens"],
                "candidate": candidate_training["source_tokens"],
                "candidate_minus_baseline": (
                    candidate_training["source_tokens"] - baseline_training["source_tokens"]
                ),
            },
            "target_tokens": {
                "baseline": baseline_training["target_tokens"],
                "candidate": candidate_training["target_tokens"],
                "candidate_minus_baseline": (
                    candidate_training["target_tokens"] - baseline_training["target_tokens"]
                ),
            },
            "non_padding_tokens": {
                "baseline": baseline_training["non_padding_tokens"],
                "candidate": candidate_training["non_padding_tokens"],
                "candidate_minus_baseline": (
                    candidate_training["non_padding_tokens"]
                    - baseline_training["non_padding_tokens"]
                ),
            },
            "interpretation": (
                "Optimizer steps, target tokens, examples, and row presentations are matched. "
                "Source and total tokens differ because the candidate replaces multi-piece controls "
                "with one-token controls; the contrast is not total-token matched."
            ),
        },
        "prompt_audit": prompt_audit(benchmark),
        "baseline": baseline_report,
        "candidate": candidate_report,
        "paired": paired,
        "sentence": {
            "baseline": baseline_sentence,
            "candidate": candidate_sentence,
            "candidate_minus_baseline": {
                split: {
                    "chrf": candidate_sentence[split]["chrf"] - baseline_sentence[split]["chrf"],
                    "bleu": candidate_sentence[split]["bleu"] - baseline_sentence[split]["bleu"],
                }
                for split in ("validation", "opened_regression")
            },
        },
        "token_preflight": token_audit,
        "success_decision": decision,
        "lexicon_membership_delta": {
            key: candidate_report["lexicon_membership"][key]
            - baseline_report["lexicon_membership"][key]
            for key in (
                "exact_target",
                "any_dictionary_form",
                "wrong_dictionary_form",
                "same_pos_dictionary_form",
                "wrong_same_pos_dictionary_form",
                "not_any_dictionary_form",
                "unique_predictions",
                "unique_predictions_in_dictionary",
            )
        },
    }
    return report, matrix


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    report, matrix = build_report(args)
    write_json_atomic(output_dir / "architecture-comparison.json", report)
    write_jsonl_atomic(output_dir / "paired-lexical-rows.jsonl", matrix)
    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

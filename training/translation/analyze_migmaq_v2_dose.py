#!/usr/bin/env python3
"""Analyze a Mi'kmaq lexical-dose run against one corrected benchmark surface."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable

try:
    from .compare_migmaq_v2_screen import canonical_id, sha256
    from .evaluate_migmaq_lexical_baseline import (
        classify_edit,
        error_rate,
        graphemes,
        normalize,
        normalized_references,
    )
except ImportError:
    from compare_migmaq_v2_screen import canonical_id, sha256
    from evaluate_migmaq_lexical_baseline import (
        classify_edit,
        error_rate,
        graphemes,
        normalize,
        normalized_references,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--direct-pool", type=Path, required=True)
    parser.add_argument("--heldout-pool", type=Path, required=True)
    parser.add_argument("--steps600-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, default=14_438)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"non-object row at {path}:{line_number}")
            rows.append(row)
    return rows


def keyed_rows(path: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for line_number, row in enumerate(read_jsonl(path), start=1):
        row_id = canonical_id(row.get("id"))
        if not row_id:
            raise ValueError(f"blank row ID at {path}:{line_number}")
        if row_id in result:
            raise ValueError(f"duplicate canonical row ID {row_id} in {path}")
        result[row_id] = row
    return result


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected an object in {path}")
    return value


def rescore_predictions(
    prediction_path: Path,
    benchmark: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    predictions = keyed_rows(prediction_path)
    if set(predictions) != set(benchmark):
        raise ValueError(
            f"prediction/benchmark row mismatch for {prediction_path}: "
            f"benchmark_only={len(set(benchmark) - set(predictions))}, "
            f"prediction_only={len(set(predictions) - set(benchmark))}"
        )
    result: dict[str, dict[str, Any]] = {}
    for row_id, benchmark_row in benchmark.items():
        source_row = predictions[row_id]
        prediction = str(source_row.get("prediction") or "")
        prediction_normalized = normalize(prediction)
        references = normalized_references(benchmark_row)
        reference = references[0]
        source_normalized = normalize(benchmark_row.get("input_text"))
        unconditioned_source = normalize(benchmark_row.get("unconditioned_input_text"))
        source_layout_references = benchmark_row.get("source_accepted_references") or []
        grapheme_cer = min(
            error_rate(graphemes(prediction_normalized), graphemes(reference))
            for reference in references
        )
        result[row_id] = {
            "id": row_id,
            "input_text": benchmark_row.get("input_text"),
            "unconditioned_input_text": benchmark_row.get("unconditioned_input_text"),
            "part_of_speech": benchmark_row.get("part_of_speech"),
            "legacy_v1_splits": benchmark_row.get("legacy_v1_splits") or [],
            "source_entry_ids": benchmark_row.get("source_entry_ids") or [],
            "source_accepted_references": benchmark_row.get("source_accepted_references") or [],
            "accepted_references": benchmark_row.get("accepted_references") or [],
            "accepted_references_normalized": references,
            "prediction": prediction,
            "prediction_normalized": prediction_normalized,
            "accepted_exact": prediction_normalized in references,
            "grapheme_cer": grapheme_cer,
            "empty": not prediction_normalized,
            "source_copy": prediction_normalized == source_normalized,
            "target_subword_count": source_row.get("target_subword_count"),
            "source_gloss_word_count": len(unconditioned_source.split()),
            "target_word_count": len(reference.split()),
            "target_grapheme_count": len(graphemes(reference)),
            "target_has_apostrophe": "'" in reference,
            "target_has_hyphen": "-" in reference,
            "source_layout_has_underscore": any("_" in str(value) for value in source_layout_references),
            "legacy_lineage": lineage_label(benchmark_row.get("legacy_v1_splits") or []),
            "edit_error_type": classify_edit(prediction_normalized, references, source_normalized),
        }
    return result


def load_exposure(path: Path) -> dict[str, int]:
    result: dict[str, int] = {}
    for row in read_jsonl(path):
        row_id = canonical_id(row.get("id"))
        if row_id in result:
            raise ValueError(f"duplicate exposure row: {row_id}")
        presentations = int(row.get("presentations") or 0)
        if presentations <= 0:
            raise ValueError(f"nonpositive exposure for {row_id}: {presentations}")
        result[row_id] = presentations
    return result


def pool_ids(path: Path) -> set[str]:
    return set(keyed_rows(path))


def lineage_label(values: Iterable[Any]) -> str:
    normalized = sorted({str(value) for value in values if value})
    return "+".join(normalized) if normalized else "none"


def count_bucket(value: int, boundaries: tuple[int, ...]) -> str:
    for boundary in boundaries:
        if value <= boundary:
            return f"<= {boundary}"
    return f"> {boundaries[-1]}"


def basic_metrics(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    materialized = list(rows)
    frequencies = Counter(str(row["prediction_normalized"]) for row in materialized)
    cers = [float(row["grapheme_cer"]) for row in materialized]
    exact = sum(bool(row["accepted_exact"]) for row in materialized)
    return {
        "rows": len(materialized),
        "accepted_exact_count": exact,
        "accepted_exact_rate": exact / len(materialized) if materialized else 0.0,
        "mean_grapheme_cer": statistics.fmean(cers) if cers else 0.0,
        "median_grapheme_cer": statistics.median(cers) if cers else 0.0,
        "blank_outputs": sum(bool(row["empty"]) for row in materialized),
        "source_copies": sum(bool(row["source_copy"]) for row in materialized),
        "unique_normalized_outputs": len(frequencies),
        "maximum_normalized_output_frequency": max(frequencies.values(), default=0),
    }


def grouped_metrics(rows: Iterable[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) if row.get(field) is not None else "(missing)")].append(row)
    return {name: basic_metrics(members) for name, members in sorted(groups.items())}


def top_outputs(rows: Iterable[dict[str, Any]], limit: int = 25) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row["prediction_normalized"])].append(row)
    result: list[dict[str, Any]] = []
    for prediction, members in sorted(groups.items(), key=lambda item: (-len(item[1]), item[0]))[
        :limit
    ]:
        exact = sum(bool(row["accepted_exact"]) for row in members)
        result.append(
            {
                "prediction": prediction,
                "rows": len(members),
                "accepted_exact_count": exact,
                "exact_precision": exact / len(members),
                "distinct_reference_sets": len(
                    {tuple(row["accepted_references_normalized"]) for row in members}
                ),
            }
        )
    return result


def top_outputs_by_field(
    rows: Iterable[dict[str, Any]], field: str, limit: int = 5,
) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) if row.get(field) is not None else "(missing)")].append(row)
    return {
        name: {"rows": len(members), "top_outputs": top_outputs(members, limit=limit)}
        for name, members in sorted(groups.items())
    }


def prompt_group_summary(
    benchmark: dict[str, dict[str, Any]],
    key_function: Any,
) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in benchmark.values():
        groups[key_function(row)].append(row)

    duplicate_groups = [members for members in groups.values() if len(members) > 1]
    conflicting_groups: list[dict[str, Any]] = []
    deterministic_oracle_exact = 0
    for prompt, members in groups.items():
        reference_sets = [set(normalized_references(row)) for row in members]
        candidates = set().union(*reference_sets)
        best_hits = max(
            (sum(candidate in references for references in reference_sets) for candidate in candidates),
            default=0,
        )
        deterministic_oracle_exact += best_hits
        if len({tuple(sorted(references)) for references in reference_sets}) > 1:
            conflicting_groups.append(
                {
                    "prompt": prompt,
                    "rows": len(members),
                    "accepted_reference_sets": sorted(
                        {tuple(sorted(references)) for references in reference_sets}
                    ),
                    "best_deterministic_exact": best_hits,
                }
            )

    rows = len(benchmark)
    return {
        "rows": rows,
        "unique_prompts": len(groups),
        "duplicate_prompt_groups": len(duplicate_groups),
        "rows_in_duplicate_prompt_groups": sum(len(members) for members in duplicate_groups),
        "conflicting_prompt_groups": len(conflicting_groups),
        "rows_in_conflicting_prompt_groups": sum(row["rows"] for row in conflicting_groups),
        "maximum_group_rows": max((len(members) for members in groups.values()), default=0),
        "deterministic_oracle_exact_ceiling": deterministic_oracle_exact,
        "deterministic_oracle_exact_ceiling_rate": (
            deterministic_oracle_exact / rows if rows else 0.0
        ),
        "largest_conflicting_groups": sorted(
            conflicting_groups,
            key=lambda row: (-row["rows"], row["prompt"]),
        )[:100],
    }


def prompt_audit(benchmark: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "exact_model_visible_surface": prompt_group_summary(
            benchmark,
            lambda row: str(row.get("input_text") or ""),
        ),
        "comparison_normalized_surface": prompt_group_summary(
            benchmark,
            lambda row: normalize(row.get("input_text")),
        ),
    }


def lexicon_membership_metrics(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    materialized = list(rows)
    global_inventory: set[str] = set()
    inventory_by_pos: dict[str, set[str]] = defaultdict(set)
    for row in materialized:
        pos = str(row.get("part_of_speech") or "(missing)")
        references = set(row["accepted_references_normalized"])
        global_inventory.update(references)
        inventory_by_pos[pos].update(references)

    any_dictionary_form = 0
    same_pos_dictionary_form = 0
    unique_predictions: set[str] = set()
    unique_dictionary_predictions: set[str] = set()
    for row in materialized:
        prediction = str(row["prediction_normalized"])
        pos = str(row.get("part_of_speech") or "(missing)")
        unique_predictions.add(prediction)
        if prediction in global_inventory:
            any_dictionary_form += 1
            unique_dictionary_predictions.add(prediction)
        if prediction in inventory_by_pos[pos]:
            same_pos_dictionary_form += 1

    exact = sum(bool(row["accepted_exact"]) for row in materialized)
    total = len(materialized)
    return {
        "benchmark_dictionary_forms": len(global_inventory),
        "rows": total,
        "exact_target": exact,
        "any_dictionary_form": any_dictionary_form,
        "any_dictionary_form_rate": any_dictionary_form / total if total else 0.0,
        "wrong_dictionary_form": any_dictionary_form - exact,
        "same_pos_dictionary_form": same_pos_dictionary_form,
        "same_pos_dictionary_form_rate": same_pos_dictionary_form / total if total else 0.0,
        "wrong_same_pos_dictionary_form": same_pos_dictionary_form - exact,
        "not_any_dictionary_form": total - any_dictionary_form,
        "not_any_dictionary_form_rate": (total - any_dictionary_form) / total if total else 0.0,
        "unique_predictions": len(unique_predictions),
        "unique_predictions_in_dictionary": len(unique_dictionary_predictions),
    }


def model_report(rows: dict[str, dict[str, Any]]) -> dict[str, Any]:
    values = list(rows.values())
    for row in values:
        row["source_gloss_length_bucket"] = count_bucket(row["source_gloss_word_count"], (1, 2, 3, 5))
        row["target_word_count_bucket"] = count_bucket(row["target_word_count"], (1, 2))
        row["target_grapheme_length_bucket"] = count_bucket(
            row["target_grapheme_count"], (5, 8, 12)
        )
        row["target_apostrophe_class"] = "apostrophe" if row["target_has_apostrophe"] else "none"
        row["target_hyphen_class"] = "hyphen" if row["target_has_hyphen"] else "none"
        row["source_layout_class"] = (
            "source_layout_underscore" if row["source_layout_has_underscore"] else "ordinary"
        )
    return {
        "overall": basic_metrics(values),
        "cohort": grouped_metrics(values, "cohort"),
        "part_of_speech": grouped_metrics(values, "part_of_speech"),
        "direct_presentations": grouped_metrics(values, "direct_presentations"),
        "target_subword_count": grouped_metrics(values, "target_subword_count"),
        "source_gloss_length": grouped_metrics(values, "source_gloss_length_bucket"),
        "target_word_count": grouped_metrics(values, "target_word_count_bucket"),
        "target_grapheme_length": grouped_metrics(values, "target_grapheme_length_bucket"),
        "target_apostrophe": grouped_metrics(values, "target_apostrophe_class"),
        "target_hyphen": grouped_metrics(values, "target_hyphen_class"),
        "source_layout": grouped_metrics(values, "source_layout_class"),
        "legacy_lineage": grouped_metrics(values, "legacy_lineage"),
        "edit_error_type": dict(sorted(Counter(row["edit_error_type"] for row in values).items())),
        "lexicon_membership": lexicon_membership_metrics(values),
        "top_outputs": top_outputs(values),
        "top_outputs_by_part_of_speech": top_outputs_by_field(values, "part_of_speech"),
    }


def pair_rows(
    baseline: dict[str, dict[str, Any]],
    candidate: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row_id in sorted(candidate):
        left = baseline[row_id]
        right = candidate[row_id]
        if left["accepted_exact"] and right["accepted_exact"]:
            transition = "stable_exact"
        elif left["accepted_exact"]:
            transition = "loss"
        elif right["accepted_exact"]:
            transition = "gain"
        else:
            transition = "stable_failure"
        rows.append(
            {
                "id": row_id,
                "cohort": right["cohort"],
                "direct_presentations": right["direct_presentations"],
                "input_text": right["input_text"],
                "part_of_speech": right["part_of_speech"],
                "accepted_references": right["accepted_references"],
                "source_accepted_references": right["source_accepted_references"],
                "exact_transition": transition,
                "grapheme_cer_delta_candidate_minus_steps600": (
                    float(right["grapheme_cer"]) - float(left["grapheme_cer"])
                ),
                "steps600": {
                    "prediction": left["prediction"],
                    "accepted_exact": left["accepted_exact"],
                    "grapheme_cer": left["grapheme_cer"],
                    "edit_error_type": left["edit_error_type"],
                },
                "candidate": {
                    "prediction": right["prediction"],
                    "accepted_exact": right["accepted_exact"],
                    "grapheme_cer": right["grapheme_cer"],
                    "edit_error_type": right["edit_error_type"],
                },
            }
        )
    deltas = [float(row["grapheme_cer_delta_candidate_minus_steps600"]) for row in rows]
    epsilon = 1e-12
    summary = {
        "rows": len(rows),
        "exact_transitions": dict(sorted(Counter(row["exact_transition"] for row in rows).items())),
        "mean_grapheme_cer_delta_candidate_minus_steps600": statistics.fmean(deltas),
        "cer_improved_rows": sum(delta < -epsilon for delta in deltas),
        "cer_worsened_rows": sum(delta > epsilon for delta in deltas),
        "cer_tied_rows": sum(abs(delta) <= epsilon for delta in deltas),
        "exact_gain_examples": [row for row in rows if row["exact_transition"] == "gain"][:100],
        "exact_loss_examples": [row for row in rows if row["exact_transition"] == "loss"][:100],
        "largest_cer_improvements": sorted(
            rows, key=lambda row: row["grapheme_cer_delta_candidate_minus_steps600"]
        )[:100],
        "largest_cer_regressions": sorted(
            rows,
            key=lambda row: row["grapheme_cer_delta_candidate_minus_steps600"],
            reverse=True,
        )[:100],
    }
    return rows, summary


def sentence_metrics(run: Path) -> dict[str, dict[str, Any]]:
    return {
        "validation": load_json(run / "evaluations/sentence-validation.json")["metrics"],
        "opened_regression": load_json(
            run / "evaluations/sentence-opened-regression.json"
        )["metrics"],
    }


def evaluate_continue_rule(
    contract: dict[str, Any],
    steps600: dict[str, Any],
    candidate: dict[str, Any],
    sentence: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    rule = contract["continue_to_higher_dose_rule"]
    direct = candidate["cohort"]["direct_pair_training_pool"]
    overall = candidate["overall"]
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
        "full_lexical_exact_exceeds_steps600": {
            "observed": overall["accepted_exact_count"],
            "required_strictly_greater_than": steps600["overall"]["accepted_exact_count"],
            "pass": overall["accepted_exact_count"] > steps600["overall"]["accepted_exact_count"],
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
    }
    passed = all(condition["pass"] for condition in conditions.values())
    return {
        "passed": passed,
        "conditions": conditions,
        "authorized_next_action": (
            "one_higher_dose_development_experiment"
            if passed
            else "architecture_change_and_failure_analysis"
        ),
        "not_authorized": ["model_promotion", "homepage_inference", "public_release"],
    }


def write_json(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def build_analysis(args: argparse.Namespace) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    benchmark = keyed_rows(args.benchmark)
    if len(benchmark) != args.expected_rows:
        raise ValueError(f"expected {args.expected_rows} benchmark rows, found {len(benchmark)}")
    direct_ids = pool_ids(args.direct_pool)
    heldout_ids = pool_ids(args.heldout_pool)
    if direct_ids & heldout_ids or direct_ids | heldout_ids != set(benchmark):
        raise ValueError("direct and held-out pools do not form an exact benchmark partition")

    steps600_path = args.steps600_run / "evaluations/lexical-full/predictions.jsonl"
    candidate_path = args.candidate_run / "evaluations/lexical-full/predictions.jsonl"
    steps600 = rescore_predictions(steps600_path, benchmark)
    candidate = rescore_predictions(candidate_path, benchmark)
    exposure_path = args.candidate_run / "model/exposure-row-presentations.jsonl"
    exposure = load_exposure(exposure_path)

    for collection in (steps600, candidate):
        for row_id, row in collection.items():
            row["cohort"] = (
                "direct_pair_training_pool" if row_id in direct_ids else "heldout_lineage"
            )
            row["direct_presentations"] = exposure.get(row_id, 0)
    if any(exposure.get(row_id, 0) for row_id in heldout_ids):
        raise ValueError("held-out-lineage lexical rows received direct-pair presentations")
    missing_direct = [row_id for row_id in direct_ids if exposure.get(row_id, 0) == 0]

    paired_rows, paired = pair_rows(steps600, candidate)
    steps600_report = model_report(steps600)
    candidate_report = model_report(candidate)
    sentences = sentence_metrics(args.candidate_run)
    contract = load_json(args.contract)
    decision = evaluate_continue_rule(contract, steps600_report, candidate_report, sentences)
    report = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "migmaq_v2_lexical_dose_response",
        "claim_limit": (
            "Closed-set, single-seed development analysis. Held-out lineage means withheld from this "
            "direct-pair pool, not unseen upstream or natural-language generalization."
        ),
        "inputs": {
            "benchmark": {"path": str(args.benchmark.resolve()), "sha256": sha256(args.benchmark)},
            "direct_pool": {"path": str(args.direct_pool.resolve()), "sha256": sha256(args.direct_pool)},
            "heldout_pool": {"path": str(args.heldout_pool.resolve()), "sha256": sha256(args.heldout_pool)},
            "steps600_predictions": {"path": str(steps600_path.resolve()), "sha256": sha256(steps600_path)},
            "candidate_predictions": {"path": str(candidate_path.resolve()), "sha256": sha256(candidate_path)},
            "candidate_exposure": {"path": str(exposure_path.resolve()), "sha256": sha256(exposure_path)},
            "contract": {"path": str(args.contract.resolve()), "sha256": sha256(args.contract)},
        },
        "rows": len(benchmark),
        "cohort_rows": {
            "direct_pair_training_pool": len(direct_ids),
            "heldout_lineage": len(heldout_ids),
        },
        "prompt_audit": prompt_audit(benchmark),
        "exposure": {
            "ledger_rows": len(exposure),
            "ledger_presentations": sum(exposure.values()),
            "missing_direct_lexical_rows": len(missing_direct),
            "direct_lexical_presentations": dict(
                sorted(Counter(exposure.get(row_id, 0) for row_id in direct_ids).items())
            ),
        },
        "steps600_rescored_on_v02": steps600_report,
        "candidate": candidate_report,
        "paired_steps600_to_candidate": paired,
        "sentence": sentences,
        "continue_decision": decision,
    }
    return report, paired_rows, decision


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    report, rows, decision = build_analysis(args)
    write_json(output_dir / "dose-response-report.json", report)
    write_jsonl(output_dir / "paired-lexical-rows.jsonl", rows)
    write_json(output_dir / "continue-decision.json", decision)
    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

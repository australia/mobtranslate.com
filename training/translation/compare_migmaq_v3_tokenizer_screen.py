#!/usr/bin/env python3
"""Analyze the matched Mi'kmaq v3 base-tokenizer and SPM-tokenizer screen.

This is an artifact-only analysis. It verifies row alignment, reconstructs the
actual examples selected by the Trainer sampler, joins lexical rows back to
their canonical schedule source, and separates direct-pair presentation from
incidental target-surface exposure. The resulting measurements are development
census diagnostics, not population estimates or evidence of speaker approval.
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
from typing import Any, Iterable, Sequence

import regex
from sacrebleu.metrics import CHRF

try:
    from .analyze_migmaq_v2_dose import (
        basic_metrics,
        load_json,
        model_report,
        rescore_predictions,
    )
    from .compare_migmaq_v2_screen import canonical_id, sha256
    from .evaluate_migmaq_lexical_baseline import error_rate, graphemes, normalize
except ImportError:
    from analyze_migmaq_v2_dose import (
        basic_metrics,
        load_json,
        model_report,
        rescore_predictions,
    )
    from compare_migmaq_v2_screen import canonical_id, sha256
    from evaluate_migmaq_lexical_baseline import error_rate, graphemes, normalize


WORD_PATTERN = regex.compile(r"[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--direct-pool", type=Path, required=True)
    parser.add_argument("--train-schedule", type=Path, required=True)
    parser.add_argument("--base-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, default=14_438)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"non-object row at {path}:{line_number}")
            rows.append(value)
    return rows


def keyed_exact(rows: Iterable[dict[str, Any]], *, source: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows, start=1):
        row_id = str(row.get("id") or "")
        if not row_id:
            raise ValueError(f"blank row ID at {source}:{index}")
        if row_id in result:
            raise ValueError(f"duplicate row ID {row_id} in {source}")
        result[row_id] = row
    return result


def keyed_canonical(path: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(read_jsonl(path), start=1):
        row_id = canonical_id(row.get("id"))
        if not row_id:
            raise ValueError(f"blank canonical row ID at {path}:{index}")
        if row_id in result:
            raise ValueError(f"duplicate canonical row ID {row_id} in {path}")
        result[row_id] = row
    return result


def word_tokens(value: Any) -> list[str]:
    return WORD_PATTERN.findall(normalize(value))


def subsequence_count(sequence: Sequence[str], phrase: Sequence[str]) -> int:
    if not phrase or len(phrase) > len(sequence):
        return 0
    width = len(phrase)
    return sum(sequence[index : index + width] == list(phrase) for index in range(len(sequence) - width + 1))


def count_bucket(value: int, bounds: Sequence[int]) -> str:
    for bound in bounds:
        if value <= bound:
            return f"<= {bound}"
    return f"> {bounds[-1]}"


def ratio_bucket(value: float) -> str:
    if value < 0.60:
        return "< 0.60"
    if value < 0.85:
        return "0.60-0.84"
    if value <= 1.15:
        return "0.85-1.15"
    if value <= 1.50:
        return "1.16-1.50"
    return "> 1.50"


def exact_transition(left: bool, right: bool) -> str:
    if left and right:
        return "stable_exact"
    if left:
        return "loss"
    if right:
        return "gain"
    return "stable_failure"


def sign_test_two_sided(gains: int, losses: int) -> float:
    trials = gains + losses
    if trials == 0:
        return 1.0
    minority = min(gains, losses)
    tail = sum(math.comb(trials, value) for value in range(minority + 1)) / (2**trials)
    return min(1.0, 2 * tail)


def load_exposure(path: Path) -> dict[str, int]:
    result: dict[str, int] = {}
    for index, row in enumerate(read_jsonl(path), start=1):
        row_id = str(row.get("id") or "")
        count = int(row.get("presentations") or 0)
        if not row_id or count <= 0:
            raise ValueError(f"invalid exposure row at {path}:{index}")
        if row_id in result:
            raise ValueError(f"duplicate exposure row {row_id} in {path}")
        result[row_id] = count
    return result


def materialize_presented_rows(
    schedule_path: Path,
    exposure_path: Path,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    schedule = keyed_exact(read_jsonl(schedule_path), source=str(schedule_path))
    exposure = load_exposure(exposure_path)
    missing = sorted(set(exposure) - set(schedule))
    if missing:
        raise ValueError(f"exposure rows absent from schedule: {missing[:5]}")

    presented: list[dict[str, Any]] = []
    source_presentations: Counter[str] = Counter()
    task_presentations: Counter[str] = Counter()
    pair_kind_presentations: Counter[str] = Counter()
    for schedule_id, presentations in sorted(exposure.items()):
        row = schedule[schedule_id]
        source_id = canonical_id(row.get("schedule_source_id") or row.get("id"))
        if not source_id:
            raise ValueError(f"schedule row {schedule_id} has no canonical source ID")
        source_presentations[source_id] += presentations
        task_presentations[str(row.get("task") or "(missing)")] += presentations
        pair_kind_presentations[str(row.get("pair_kind") or "(missing)")] += presentations
        presented.extend([row] * presentations)

    audit = {
        "schedule_rows": len(schedule),
        "exposure_rows": len(exposure),
        "presentations": sum(exposure.values()),
        "unique_canonical_source_rows": len(source_presentations),
        "canonical_source_presentations": dict(source_presentations),
        "task_presentations": dict(sorted(task_presentations.items())),
        "pair_kind_presentations": dict(sorted(pair_kind_presentations.items())),
    }
    return presented, audit


def prompt_ambiguity(benchmark: dict[str, dict[str, Any]]) -> dict[str, dict[str, int]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in benchmark.values():
        groups[normalize(row.get("input_text"))].append(row)
    result: dict[str, dict[str, int]] = {}
    for members in groups.values():
        reference_sets = {
            tuple(sorted(normalize(value) for value in row.get("accepted_references") or []))
            for row in members
        }
        for row in members:
            result[canonical_id(row.get("id"))] = {
                "prompt_group_rows": len(members),
                "prompt_distinct_reference_sets": len(reference_sets),
            }
    return result


def build_exposure_features(
    benchmark: dict[str, dict[str, Any]],
    direct_ids: set[str],
    presented: list[dict[str, Any]],
    source_presentations: dict[str, int],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    reference_phrases = {
        tuple(word_tokens(reference))
        for row in benchmark.values()
        for reference in row.get("accepted_references") or []
    }
    reference_phrases.discard(())
    phrase_lengths = sorted({len(phrase) for phrase in reference_phrases})
    exact_target_rows: Counter[str] = Counter()
    target_token_counts: Counter[str] = Counter()
    sentence_target_token_counts: Counter[str] = Counter()
    target_phrase_counts: Counter[tuple[str, ...]] = Counter()
    sentence_target_phrase_counts: Counter[tuple[str, ...]] = Counter()
    input_phrase_counts: Counter[tuple[str, ...]] = Counter()
    target_chars = 0
    for row in presented:
        target = normalize(row.get("output_text"))
        source = normalize(row.get("input_text"))
        target_words = word_tokens(target)
        source_words = word_tokens(source)
        exact_target_rows[target] += 1
        target_token_counts.update(target_words)
        is_sentence = str(row.get("task")) != "lexeme"
        if is_sentence:
            sentence_target_token_counts.update(target_words)
        for length in phrase_lengths:
            for index in range(max(0, len(target_words) - length + 1)):
                phrase = tuple(target_words[index : index + length])
                if phrase in reference_phrases:
                    target_phrase_counts[phrase] += 1
                    if is_sentence:
                        sentence_target_phrase_counts[phrase] += 1
            for index in range(max(0, len(source_words) - length + 1)):
                phrase = tuple(source_words[index : index + length])
                if phrase in reference_phrases:
                    input_phrase_counts[phrase] += 1
        target_chars += len(target)

    ambiguity = prompt_ambiguity(benchmark)
    features: dict[str, dict[str, Any]] = {}
    for row_id, row in benchmark.items():
        references = [normalize(value) for value in row.get("accepted_references") or []]
        reference_tokens = [word_tokens(reference) for reference in references]
        exact_rows = sum(exact_target_rows[reference] for reference in set(references))
        unique_phrases = {tuple(phrase) for phrase in reference_tokens if phrase}
        target_occurrences = sum(target_phrase_counts[phrase] for phrase in unique_phrases)
        sentence_occurrences = sum(
            sentence_target_phrase_counts[phrase] for phrase in unique_phrases
        )
        prompt_occurrences = sum(input_phrase_counts[phrase] for phrase in unique_phrases)
        canonical_presentations = int(source_presentations.get(row_id, 0))
        direct_presentations = canonical_presentations if row_id in direct_ids else 0
        reference = references[0]
        reference_word_count = len(reference_tokens[0])
        reference_graphemes = len(graphemes(reference))
        row_features = {
            "cohort": "direct_pair_training_pool" if row_id in direct_ids else "heldout_lineage",
            "canonical_source_presentations": canonical_presentations,
            "direct_pair_presentations": direct_presentations,
            "direct_pair_presentation_class": str(direct_presentations),
            "exact_target_row_presentations": exact_rows,
            "target_phrase_occurrences_all_tasks": target_occurrences,
            "target_phrase_occurrences_sentence_tasks": sentence_occurrences,
            "target_phrase_occurrences_class": count_bucket(target_occurrences, (0, 1, 3, 10)),
            "sentence_target_phrase_occurrences_class": count_bucket(sentence_occurrences, (0, 1, 3, 10)),
            "target_phrase_occurrences_in_inputs": prompt_occurrences,
            "source_gloss_word_count": len(word_tokens(row.get("unconditioned_input_text"))),
            "source_gloss_word_count_class": count_bucket(
                len(word_tokens(row.get("unconditioned_input_text"))), (1, 2, 3, 5)
            ),
            "target_word_count": reference_word_count,
            "target_word_count_class": count_bucket(reference_word_count, (1, 2)),
            "target_grapheme_count": reference_graphemes,
            "target_grapheme_count_class": count_bucket(reference_graphemes, (5, 8, 12, 20)),
            "target_apostrophe_class": "apostrophe" if "'" in reference else "none",
            "target_hyphen_class": "hyphen" if "-" in reference else "none",
            "reference_count": len(references),
            "reference_count_class": "one" if len(references) == 1 else "multiple",
            "prompt_group_rows": ambiguity[row_id]["prompt_group_rows"],
            "prompt_distinct_reference_sets": ambiguity[row_id]["prompt_distinct_reference_sets"],
            "prompt_ambiguity_class": (
                "unique"
                if ambiguity[row_id]["prompt_group_rows"] == 1
                else "duplicate_same_references"
                if ambiguity[row_id]["prompt_distinct_reference_sets"] == 1
                else "duplicate_conflicting_references"
            ),
        }
        features[row_id] = row_features

    return features, {
        "presented_rows": len(presented),
        "target_characters": target_chars,
        "unique_exact_targets": len(exact_target_rows),
        "unique_target_word_tokens": len(target_token_counts),
        "unique_sentence_target_word_tokens": len(sentence_target_token_counts),
        "top_exact_training_targets": [
            {"target": target, "presentations": count}
            for target, count in exact_target_rows.most_common(50)
        ],
        "top_training_target_tokens": [
            {"token": token, "occurrences": count}
            for token, count in target_token_counts.most_common(50)
        ],
    }


def validate_prediction_alignment(
    prediction_path: Path,
    benchmark: dict[str, dict[str, Any]],
) -> None:
    predictions = keyed_canonical(prediction_path)
    if set(predictions) != set(benchmark):
        raise ValueError(f"prediction/benchmark IDs differ for {prediction_path}")
    for row_id, source in predictions.items():
        reference = benchmark[row_id]
        if normalize(source.get("input_normalized")) != normalize(reference.get("input_text")):
            raise ValueError(f"input mismatch for {row_id} in {prediction_path}")
        observed_refs = {
            normalize(value)
            for value in source.get("accepted_references") or source.get("accepted_references_normalized") or []
        }
        expected_refs = {normalize(value) for value in reference.get("accepted_references") or []}
        if observed_refs != expected_refs:
            raise ValueError(f"reference mismatch for {row_id} in {prediction_path}")


def annotate_model_rows(
    rows: dict[str, dict[str, Any]],
    features: dict[str, dict[str, Any]],
) -> None:
    for row_id, row in rows.items():
        row.update(features[row_id])
        row["direct_presentations"] = row["direct_pair_presentations"]
        row["target_subword_count_class"] = count_bucket(
            int(row.get("target_subword_count") or 0), (1, 2, 3, 5, 8)
        )


def grouped_metrics(rows: Iterable[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        value = row.get(field)
        groups[str(value if value is not None else "(missing)")].append(row)
    return {name: basic_metrics(members) for name, members in sorted(groups.items())}


def model_failure_report(rows: dict[str, dict[str, Any]]) -> dict[str, Any]:
    report = model_report(rows)
    values = list(rows.values())
    report["exposure_slices"] = {
        field: grouped_metrics(values, field)
        for field in (
            "direct_pair_presentation_class",
            "target_phrase_occurrences_class",
            "sentence_target_phrase_occurrences_class",
            "prompt_ambiguity_class",
            "reference_count_class",
            "source_gloss_word_count_class",
            "target_word_count_class",
            "target_grapheme_count_class",
            "target_apostrophe_class",
            "target_hyphen_class",
            "target_subword_count_class",
        )
    }
    report["exact_rows"] = [
        {
            "id": row["id"],
            "input_text": row["input_text"],
            "part_of_speech": row["part_of_speech"],
            "accepted_references": row["accepted_references"],
            "prediction": row["prediction"],
            "cohort": row["cohort"],
            "direct_pair_presentations": row["direct_pair_presentations"],
            "target_phrase_occurrences_all_tasks": row["target_phrase_occurrences_all_tasks"],
            "target_phrase_occurrences_sentence_tasks": row["target_phrase_occurrences_sentence_tasks"],
            "target_subword_count": row["target_subword_count"],
        }
        for row in sorted(values, key=lambda item: item["id"])
        if row["accepted_exact"]
    ]
    report["near_surface_failures"] = [
        {
            "id": row["id"],
            "input_text": row["input_text"],
            "accepted_references": row["accepted_references"],
            "prediction": row["prediction"],
            "grapheme_cer": row["grapheme_cer"],
            "cohort": row["cohort"],
            "direct_pair_presentations": row["direct_pair_presentations"],
            "target_phrase_occurrences_all_tasks": row["target_phrase_occurrences_all_tasks"],
            "target_subword_count": row["target_subword_count"],
        }
        for row in sorted(values, key=lambda item: (item["grapheme_cer"], item["id"]))
        if not row["accepted_exact"] and row["edit_error_type"] == "near_surface_form"
    ][:250]
    return report


def collapse_report(
    rows: dict[str, dict[str, Any]],
    presented: list[dict[str, Any]],
    limit: int = 50,
) -> dict[str, Any]:
    exact_targets = Counter(normalize(row.get("output_text")) for row in presented)
    target_tokens = Counter(token for row in presented for token in word_tokens(row.get("output_text")))
    dictionary_forms: set[str] = set()
    for row in rows.values():
        dictionary_forms.update(row["accepted_references_normalized"])

    predictions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows.values():
        predictions[str(row["prediction_normalized"])].append(row)
    ranked = sorted(predictions.items(), key=lambda item: (-len(item[1]), item[0]))[:limit]
    return {
        "top_outputs": [
            {
                "prediction": prediction,
                "benchmark_rows": len(members),
                "benchmark_share": len(members) / len(rows),
                "accepted_exact_rows": sum(bool(row["accepted_exact"]) for row in members),
                "is_any_benchmark_dictionary_form": prediction in dictionary_forms,
                "exact_training_target_presentations": exact_targets[prediction],
                "training_target_token_occurrences": target_tokens[prediction],
                "dominant_part_of_speech": Counter(
                    str(row.get("part_of_speech") or "(missing)") for row in members
                ).most_common(10),
            }
            for prediction, members in ranked
        ],
        "top_five_output_share": sum(len(members) for _, members in ranked[:5]) / len(rows),
        "top_ten_output_share": sum(len(members) for _, members in ranked[:10]) / len(rows),
    }


def paired_lexical_analysis(
    base: dict[str, dict[str, Any]],
    candidate: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    matrix: list[dict[str, Any]] = []
    for row_id in sorted(base):
        left = base[row_id]
        right = candidate[row_id]
        if left["accepted_references_normalized"] != right["accepted_references_normalized"]:
            raise ValueError(f"rescored references differ for {row_id}")
        delta = float(right["grapheme_cer"]) - float(left["grapheme_cer"])
        base_subwords = int(left.get("target_subword_count") or 0)
        candidate_subwords = int(right.get("target_subword_count") or 0)
        row = {
            "id": row_id,
            "input_text": left["input_text"],
            "part_of_speech": left["part_of_speech"],
            "accepted_references": left["accepted_references"],
            **{
                key: left[key]
                for key in (
                    "cohort",
                    "direct_pair_presentations",
                    "exact_target_row_presentations",
                    "target_phrase_occurrences_all_tasks",
                    "target_phrase_occurrences_sentence_tasks",
                    "target_phrase_occurrences_class",
                    "sentence_target_phrase_occurrences_class",
                    "source_gloss_word_count_class",
                    "target_grapheme_count_class",
                    "target_apostrophe_class",
                    "target_hyphen_class",
                    "prompt_ambiguity_class",
                )
            },
            "exact_transition": exact_transition(
                bool(left["accepted_exact"]), bool(right["accepted_exact"])
            ),
            "prediction_changed": left["prediction_normalized"] != right["prediction_normalized"],
            "grapheme_cer_delta_candidate_minus_base": delta,
            "subword_count_delta_candidate_minus_base": candidate_subwords - base_subwords,
            "subword_change_class": (
                "fewer" if candidate_subwords < base_subwords else "same" if candidate_subwords == base_subwords else "more"
            ),
            "base": {
                "prediction": left["prediction"],
                "accepted_exact": left["accepted_exact"],
                "grapheme_cer": left["grapheme_cer"],
                "edit_error_type": left["edit_error_type"],
                "target_subword_count": base_subwords,
                "empty": left["empty"],
            },
            "candidate": {
                "prediction": right["prediction"],
                "accepted_exact": right["accepted_exact"],
                "grapheme_cer": right["grapheme_cer"],
                "edit_error_type": right["edit_error_type"],
                "target_subword_count": candidate_subwords,
                "empty": right["empty"],
            },
        }
        matrix.append(row)

    transitions = Counter(row["exact_transition"] for row in matrix)
    deltas = [row["grapheme_cer_delta_candidate_minus_base"] for row in matrix]
    summary = {
        "rows": len(matrix),
        "exact_transitions": dict(sorted(transitions.items())),
        "net_exact_gain": transitions["gain"] - transitions["loss"],
        "discordant_exact_sign_test": {
            "gains": transitions["gain"],
            "losses": transitions["loss"],
            "two_sided_exact_p": sign_test_two_sided(transitions["gain"], transitions["loss"]),
            "interpretation": "Descriptive paired census comparison; not a population inference.",
        },
        "prediction_changed_rows": sum(row["prediction_changed"] for row in matrix),
        "mean_grapheme_cer_delta_candidate_minus_base": statistics.fmean(deltas),
        "cer_improved_rows": sum(delta < -1e-12 for delta in deltas),
        "cer_worsened_rows": sum(delta > 1e-12 for delta in deltas),
        "cer_tied_rows": sum(abs(delta) <= 1e-12 for delta in deltas),
        "blank_transitions": dict(
            sorted(
                Counter(
                    f"{int(row['base']['empty'])}->{int(row['candidate']['empty'])}"
                    for row in matrix
                ).items()
            )
        ),
        "subword_changes": dict(sorted(Counter(row["subword_change_class"] for row in matrix).items())),
        "mean_subword_delta_candidate_minus_base": statistics.fmean(
            row["subword_count_delta_candidate_minus_base"] for row in matrix
        ),
        "by_factor": {
            field: grouped_paired_metrics(matrix, field)
            for field in (
                "cohort",
                "direct_pair_presentations",
                "target_phrase_occurrences_class",
                "sentence_target_phrase_occurrences_class",
                "part_of_speech",
                "source_gloss_word_count_class",
                "target_grapheme_count_class",
                "target_apostrophe_class",
                "target_hyphen_class",
                "prompt_ambiguity_class",
                "subword_change_class",
            )
        },
        "exact_gains": [row for row in matrix if row["exact_transition"] == "gain"],
        "exact_losses": [row for row in matrix if row["exact_transition"] == "loss"],
        "largest_cer_improvements": sorted(
            matrix, key=lambda row: row["grapheme_cer_delta_candidate_minus_base"]
        )[:200],
        "largest_cer_regressions": sorted(
            matrix,
            key=lambda row: row["grapheme_cer_delta_candidate_minus_base"],
            reverse=True,
        )[:200],
    }
    return summary, matrix


def grouped_paired_metrics(rows: Iterable[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) if row.get(field) is not None else "(missing)")].append(row)
    result: dict[str, Any] = {}
    for label, members in sorted(groups.items()):
        transitions = Counter(row["exact_transition"] for row in members)
        deltas = [row["grapheme_cer_delta_candidate_minus_base"] for row in members]
        result[label] = {
            "rows": len(members),
            "exact_transitions": dict(sorted(transitions.items())),
            "net_exact_gain": transitions["gain"] - transitions["loss"],
            "mean_grapheme_cer_delta_candidate_minus_base": statistics.fmean(deltas),
            "cer_improved_rows": sum(delta < -1e-12 for delta in deltas),
            "cer_worsened_rows": sum(delta > 1e-12 for delta in deltas),
            "cer_tied_rows": sum(abs(delta) <= 1e-12 for delta in deltas),
        }
    return result


def load_sentence_predictions(path: Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    document = load_json(path)
    rows = keyed_exact(document.get("predictions") or [], source=str(path))
    return document.get("metrics") or {}, rows


def paired_sentence_analysis(
    base_path: Path,
    candidate_path: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    base_metrics, base = load_sentence_predictions(base_path)
    candidate_metrics, candidate = load_sentence_predictions(candidate_path)
    if list(base) != list(candidate):
        raise ValueError("sentence prediction order or IDs differ")
    generation_keys = (
        "rows",
        "num_beams",
        "max_new_tokens",
        "no_repeat_ngram_size",
        "repetition_penalty",
        "length_penalty",
        "do_sample",
        "seed",
    )
    if tuple(base_metrics.get(key) for key in generation_keys) != tuple(
        candidate_metrics.get(key) for key in generation_keys
    ):
        raise ValueError("sentence generation contracts differ")

    sentence_chrf = CHRF(word_order=2)
    matrix: list[dict[str, Any]] = []
    for row_id in base:
        left = base[row_id]
        right = candidate[row_id]
        for field in ("input_text", "reference"):
            if normalize(left.get(field)) != normalize(right.get(field)):
                raise ValueError(f"sentence {field} mismatch for {row_id}")
        reference = normalize(left.get("reference"))
        left_prediction = normalize(left.get("prediction"))
        right_prediction = normalize(right.get("prediction"))
        left_cer = error_rate(graphemes(left_prediction), graphemes(reference))
        right_cer = error_rate(graphemes(right_prediction), graphemes(reference))
        left_ratio = len(graphemes(left_prediction)) / max(1, len(graphemes(reference)))
        right_ratio = len(graphemes(right_prediction)) / max(1, len(graphemes(reference)))
        left_chrf = sentence_chrf.sentence_score(left_prediction, [reference]).score
        right_chrf = sentence_chrf.sentence_score(right_prediction, [reference]).score
        matrix.append(
            {
                "id": row_id,
                "source": left.get("unconditioned_input_text") or left.get("input_text"),
                "reference": left.get("reference"),
                "source_word_count_class": count_bucket(
                    len(word_tokens(left.get("unconditioned_input_text") or left.get("input_text"))),
                    (5, 10, 15, 25),
                ),
                "base": {
                    "prediction": left.get("prediction"),
                    "grapheme_cer": left_cer,
                    "character_length_ratio": left_ratio,
                    "length_ratio_class": ratio_bucket(left_ratio),
                    "sentence_chrf": left_chrf,
                },
                "candidate": {
                    "prediction": right.get("prediction"),
                    "grapheme_cer": right_cer,
                    "character_length_ratio": right_ratio,
                    "length_ratio_class": ratio_bucket(right_ratio),
                    "sentence_chrf": right_chrf,
                },
                "prediction_changed": left_prediction != right_prediction,
                "grapheme_cer_delta_candidate_minus_base": right_cer - left_cer,
                "sentence_chrf_delta_candidate_minus_base": right_chrf - left_chrf,
                "length_ratio_delta_candidate_minus_base": right_ratio - left_ratio,
            }
        )

    deltas = [row["grapheme_cer_delta_candidate_minus_base"] for row in matrix]
    chrf_deltas = [row["sentence_chrf_delta_candidate_minus_base"] for row in matrix]
    return {
        "rows": len(matrix),
        "base_metrics": base_metrics,
        "candidate_metrics": candidate_metrics,
        "corpus_metric_delta_candidate_minus_base": {
            "chrf": candidate_metrics["chrf"] - base_metrics["chrf"],
            "bleu": candidate_metrics["bleu"] - base_metrics["bleu"],
            "mean_prediction_characters": (
                candidate_metrics["mean_prediction_characters"]
                - base_metrics["mean_prediction_characters"]
            ),
        },
        "prediction_changed_rows": sum(row["prediction_changed"] for row in matrix),
        "mean_grapheme_cer_delta_candidate_minus_base": statistics.fmean(deltas),
        "cer_improved_rows": sum(delta < -1e-12 for delta in deltas),
        "cer_worsened_rows": sum(delta > 1e-12 for delta in deltas),
        "cer_tied_rows": sum(abs(delta) <= 1e-12 for delta in deltas),
        "mean_sentence_chrf_delta_candidate_minus_base": statistics.fmean(chrf_deltas),
        "sentence_chrf_improved_rows": sum(delta > 1e-12 for delta in chrf_deltas),
        "sentence_chrf_worsened_rows": sum(delta < -1e-12 for delta in chrf_deltas),
        "sentence_chrf_tied_rows": sum(abs(delta) <= 1e-12 for delta in chrf_deltas),
        "base_length_ratio_classes": dict(
            sorted(Counter(row["base"]["length_ratio_class"] for row in matrix).items())
        ),
        "candidate_length_ratio_classes": dict(
            sorted(Counter(row["candidate"]["length_ratio_class"] for row in matrix).items())
        ),
        "by_source_length": grouped_sentence_metrics(matrix, "source_word_count_class"),
        "largest_cer_improvements": sorted(
            matrix, key=lambda row: row["grapheme_cer_delta_candidate_minus_base"]
        )[:100],
        "largest_cer_regressions": sorted(
            matrix,
            key=lambda row: row["grapheme_cer_delta_candidate_minus_base"],
            reverse=True,
        )[:100],
        "largest_sentence_chrf_improvements": sorted(
            matrix,
            key=lambda row: row["sentence_chrf_delta_candidate_minus_base"],
            reverse=True,
        )[:100],
        "largest_sentence_chrf_regressions": sorted(
            matrix, key=lambda row: row["sentence_chrf_delta_candidate_minus_base"]
        )[:100],
    }, matrix


def grouped_sentence_metrics(rows: Iterable[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) or "(missing)")].append(row)
    return {
        label: {
            "rows": len(members),
            "mean_grapheme_cer_delta_candidate_minus_base": statistics.fmean(
                row["grapheme_cer_delta_candidate_minus_base"] for row in members
            ),
            "mean_sentence_chrf_delta_candidate_minus_base": statistics.fmean(
                row["sentence_chrf_delta_candidate_minus_base"] for row in members
            ),
            "cer_improved_rows": sum(
                row["grapheme_cer_delta_candidate_minus_base"] < -1e-12 for row in members
            ),
            "cer_worsened_rows": sum(
                row["grapheme_cer_delta_candidate_minus_base"] > 1e-12 for row in members
            ),
            "sentence_chrf_improved_rows": sum(
                row["sentence_chrf_delta_candidate_minus_base"] > 1e-12 for row in members
            ),
            "sentence_chrf_worsened_rows": sum(
                row["sentence_chrf_delta_candidate_minus_base"] < -1e-12 for row in members
            ),
        }
        for label, members in sorted(groups.items())
    }


def glossary_report(run: Path) -> dict[str, Any]:
    ordinary = load_json(run / "evaluations/glossary-uptake.json")["summary"]
    unexposed = load_json(run / "evaluations/glossary-project-unexposed-uptake.json")["summary"]
    fields = (
        "rows",
        "all_hint_row_gains",
        "all_hint_row_losses",
        "conditioned_all_hint_rows",
        "unconditioned_all_hint_rows",
        "conditioned_chrf",
        "unconditioned_chrf",
        "paired_chrf_delta",
    )
    return {
        "all_validation": {field: ordinary[field] for field in fields},
        "project_lineage_unexposed": {field: unexposed[field] for field in fields},
    }


def gate_report(
    run: Path,
    lexical: dict[str, Any],
    sentence: dict[str, Any],
    glossary: dict[str, Any],
    contract: dict[str, Any],
    *,
    require_tokenizer_remap: bool,
) -> dict[str, Any]:
    gates = contract["hard_screen_gates"]
    manifest = load_json(run / "model/model_manifest.json")
    overall = lexical["overall"]
    conditions = {
        "observed_global_step": {
            "observed": manifest["trainer_state"]["global_step"],
            "required": gates["observed_global_step"],
            "pass": manifest["trainer_state"]["global_step"] == gates["observed_global_step"],
        },
        "presentations_range": {
            "observed": manifest["trainer_state"]["actual_training_exposure"]["examples"],
            "minimum": gates["observed_presentations_minimum"],
            "maximum": gates["observed_presentations_maximum"],
            "pass": gates["observed_presentations_minimum"]
            <= manifest["trainer_state"]["actual_training_exposure"]["examples"]
            <= gates["observed_presentations_maximum"],
        },
        "lexical_blank_outputs": {
            "observed": overall["blank_outputs"],
            "required_maximum": gates["lexical_blank_outputs"],
            "pass": overall["blank_outputs"] <= gates["lexical_blank_outputs"],
        },
        "sentence_blank_outputs": {
            "observed": sentence["empty_outputs"],
            "required_maximum": gates["sentence_blank_outputs"],
            "pass": sentence["empty_outputs"] <= gates["sentence_blank_outputs"],
        },
        "minimum_sentence_validation_chrf": {
            "observed": sentence["chrf"],
            "required_minimum": gates["minimum_sentence_validation_chrf"],
            "pass": sentence["chrf"] >= gates["minimum_sentence_validation_chrf"],
        },
        "minimum_unique_lexical_outputs": {
            "observed": overall["unique_normalized_outputs"],
            "required_minimum": gates["minimum_unique_lexical_outputs"],
            "pass": overall["unique_normalized_outputs"] >= gates["minimum_unique_lexical_outputs"],
        },
        "maximum_single_lexical_output_frequency": {
            "observed": overall["maximum_normalized_output_frequency"],
            "required_maximum": gates["maximum_single_lexical_output_frequency"],
            "pass": overall["maximum_normalized_output_frequency"]
            <= gates["maximum_single_lexical_output_frequency"],
        },
        "glossary_uptake_gains_exceed_losses": {
            "observed_gains": glossary["project_lineage_unexposed"]["all_hint_row_gains"],
            "observed_losses": glossary["project_lineage_unexposed"]["all_hint_row_losses"],
            "pass": glossary["project_lineage_unexposed"]["all_hint_row_gains"]
            > glossary["project_lineage_unexposed"]["all_hint_row_losses"],
        },
    }
    if require_tokenizer_remap:
        remap = manifest.get("tokenizer_extension") or {}
        checks = remap.get("checks") or {}
        conditions["tokenizer_identity_remap"] = {
            "observed_status": remap.get("status"),
            "checks": checks,
            "pass": remap.get("status") == "PASS" and all(bool(value) for value in checks.values()),
        }
    return {
        "passed": all(condition["pass"] for condition in conditions.values()),
        "conditions": conditions,
    }


def build_report(args: argparse.Namespace) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    benchmark = keyed_canonical(args.benchmark)
    if len(benchmark) != args.expected_rows:
        raise ValueError(f"expected {args.expected_rows} benchmark rows, found {len(benchmark)}")
    direct_ids = set(keyed_canonical(args.direct_pool))
    if not direct_ids <= set(benchmark):
        raise ValueError("direct pool is not a benchmark subset")

    base_exposure_path = args.base_run / "model/exposure-row-presentations.jsonl"
    candidate_exposure_path = args.candidate_run / "model/exposure-row-presentations.jsonl"
    presented_base, exposure = materialize_presented_rows(args.train_schedule, base_exposure_path)
    presented_candidate, candidate_exposure = materialize_presented_rows(
        args.train_schedule, candidate_exposure_path
    )
    if sha256(base_exposure_path) != sha256(candidate_exposure_path):
        raise ValueError("matched screen exposure ledgers differ")
    if exposure != candidate_exposure:
        raise ValueError("matched screen exposure summaries differ")
    if [row["id"] for row in presented_base] != [row["id"] for row in presented_candidate]:
        raise ValueError("materialized matched presentations differ")

    features, training_surface = build_exposure_features(
        benchmark,
        direct_ids,
        presented_base,
        exposure["canonical_source_presentations"],
    )
    base_prediction_path = args.base_run / "evaluations/lexical-full/predictions.jsonl"
    candidate_prediction_path = args.candidate_run / "evaluations/lexical-full/predictions.jsonl"
    validate_prediction_alignment(base_prediction_path, benchmark)
    validate_prediction_alignment(candidate_prediction_path, benchmark)
    base = rescore_predictions(base_prediction_path, benchmark)
    candidate = rescore_predictions(candidate_prediction_path, benchmark)
    annotate_model_rows(base, features)
    annotate_model_rows(candidate, features)
    base_failure = model_failure_report(base)
    candidate_failure = model_failure_report(candidate)
    paired_lexical, lexical_matrix = paired_lexical_analysis(base, candidate)

    sentence_base_path = args.base_run / "evaluations/sentence-validation.json"
    sentence_candidate_path = args.candidate_run / "evaluations/sentence-validation.json"
    paired_sentence, sentence_matrix = paired_sentence_analysis(
        sentence_base_path, sentence_candidate_path
    )
    base_glossary = glossary_report(args.base_run)
    candidate_glossary = glossary_report(args.candidate_run)
    contract = load_json(args.contract)
    base_gate = gate_report(
        args.base_run,
        base_failure,
        paired_sentence["base_metrics"],
        base_glossary,
        contract,
        require_tokenizer_remap=False,
    )
    candidate_gate = gate_report(
        args.candidate_run,
        candidate_failure,
        paired_sentence["candidate_metrics"],
        candidate_glossary,
        contract,
        require_tokenizer_remap=True,
    )

    direct_presented = sum(
        features[row_id]["direct_pair_presentations"] > 0 for row_id in direct_ids
    )
    direct_unpresented = len(direct_ids) - direct_presented
    no_survivor = not base_gate["passed"] and not candidate_gate["passed"]
    report = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "migmaq_v3_full_tokenizer_screen_paired_failure_analysis",
        "claim_limit": (
            "Single-seed development-census analysis of one matched 600-update screen. "
            "It does not estimate free-form translation reliability, speaker acceptability, "
            "or productive recovery of arbitrary unseen lexical mappings."
        ),
        "inputs": {
            "benchmark": {"path": str(args.benchmark.resolve()), "sha256": sha256(args.benchmark)},
            "direct_pool": {"path": str(args.direct_pool.resolve()), "sha256": sha256(args.direct_pool)},
            "train_schedule": {
                "path": str(args.train_schedule.resolve()),
                "sha256": sha256(args.train_schedule),
            },
            "base_predictions": {
                "path": str(base_prediction_path.resolve()),
                "sha256": sha256(base_prediction_path),
            },
            "candidate_predictions": {
                "path": str(candidate_prediction_path.resolve()),
                "sha256": sha256(candidate_prediction_path),
            },
            "base_exposure": {
                "path": str(base_exposure_path.resolve()),
                "sha256": sha256(base_exposure_path),
            },
            "candidate_exposure": {
                "path": str(candidate_exposure_path.resolve()),
                "sha256": sha256(candidate_exposure_path),
            },
            "contract": {"path": str(args.contract.resolve()), "sha256": sha256(args.contract)},
        },
        "preflight": {
            "benchmark_rows": len(benchmark),
            "direct_pool_rows": len(direct_ids),
            "heldout_lineage_rows": len(benchmark) - len(direct_ids),
            "prediction_ids_and_inputs_aligned": True,
            "matched_exposure_ledger": True,
            "sentence_ids_order_sources_references_and_decoder_aligned": True,
        },
        "actual_training_exposure": {
            **{key: value for key, value in exposure.items() if key != "canonical_source_presentations"},
            "direct_lexical_pool_rows_presented": direct_presented,
            "direct_lexical_pool_rows_unpresented": direct_unpresented,
            "direct_lexical_pool_coverage": direct_presented / len(direct_ids),
            "interpretation": (
                "The 76,800-row balanced schedule was sampled for 19,200 presentations by the "
                "Trainer's seeded random sampler. The no-shuffle-before-cap option did not make "
                "the training sampler sequential."
            ),
        },
        "training_surface_inventory": training_surface,
        "base": {
            "lexical": base_failure,
            "sentence": paired_sentence["base_metrics"],
            "glossary": base_glossary,
            "collapse": collapse_report(base, presented_base),
            "hard_gate": base_gate,
        },
        "candidate": {
            "lexical": candidate_failure,
            "sentence": paired_sentence["candidate_metrics"],
            "glossary": candidate_glossary,
            "collapse": collapse_report(candidate, presented_base),
            "hard_gate": candidate_gate,
        },
        "paired_lexical": paired_lexical,
        "paired_sentence": paired_sentence,
        "glossary_delta_candidate_minus_base": {
            cohort: {
                field: candidate_glossary[cohort][field] - base_glossary[cohort][field]
                for field in (
                    "all_hint_row_gains",
                    "all_hint_row_losses",
                    "conditioned_all_hint_rows",
                    "unconditioned_all_hint_rows",
                    "conditioned_chrf",
                    "unconditioned_chrf",
                    "paired_chrf_delta",
                )
            }
            for cohort in ("all_validation", "project_lineage_unexposed")
        },
        "screen_decision": {
            "base_survives": base_gate["passed"],
            "candidate_survives": candidate_gate["passed"],
            "no_arm_survives": no_survivor,
            "authorized_by_frozen_contract": (
                contract["continuation_rule"]["action_if_no_arm_survives"]
                if no_survivor
                else contract["continuation_rule"]["action_if_an_arm_survives"]
            ),
            "publication_authorized": False,
        },
        "computed_findings": {
            "custom_tokenizer_reduced_mean_target_subword_count": (
                paired_lexical["mean_subword_delta_candidate_minus_base"] < 0
            ),
            "custom_tokenizer_improved_mean_lexical_cer": (
                paired_lexical["mean_grapheme_cer_delta_candidate_minus_base"] < 0
            ),
            "custom_tokenizer_improved_sentence_chrf": (
                paired_sentence["corpus_metric_delta_candidate_minus_base"]["chrf"] > 0
            ),
            "custom_tokenizer_increased_sentence_undertranslation": (
                paired_sentence["candidate_metrics"]["mean_prediction_characters"]
                < paired_sentence["base_metrics"]["mean_prediction_characters"]
            ),
            "base_glossary_conditioning_net_positive_on_unexposed_rows": (
                base_glossary["project_lineage_unexposed"]["all_hint_row_gains"]
                > base_glossary["project_lineage_unexposed"]["all_hint_row_losses"]
            ),
            "candidate_glossary_conditioning_net_positive_on_unexposed_rows": (
                candidate_glossary["project_lineage_unexposed"]["all_hint_row_gains"]
                > candidate_glossary["project_lineage_unexposed"]["all_hint_row_losses"]
            ),
            "screen_supports_2400_step_continuation": not no_survivor,
        },
    }
    return report, lexical_matrix, sentence_matrix


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
    report, lexical_rows, sentence_rows = build_report(args)
    write_json_atomic(output_dir / "failure-analysis.json", report)
    write_jsonl_atomic(output_dir / "paired-lexical-rows.jsonl", lexical_rows)
    write_jsonl_atomic(output_dir / "paired-sentence-rows.jsonl", sentence_rows)
    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "output_dir": str(output_dir),
                "direct_lexical_pool_coverage": report["actual_training_exposure"][
                    "direct_lexical_pool_coverage"
                ],
                "base_exact": report["base"]["lexical"]["overall"]["accepted_exact_count"],
                "candidate_exact": report["candidate"]["lexical"]["overall"][
                    "accepted_exact_count"
                ],
                "candidate_minus_base_sentence_chrf": report["paired_sentence"][
                    "corpus_metric_delta_candidate_minus_base"
                ]["chrf"],
                "screen_decision": report["screen_decision"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

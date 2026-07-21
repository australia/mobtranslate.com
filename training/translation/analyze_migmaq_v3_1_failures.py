#!/usr/bin/env python3
"""Diagnose lexical collapse and glossary-copy effects in the Mi'kmaq v3.1 screen."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable, Sequence

from sacrebleu.metrics import CHRF

try:
    from .compare_migmaq_v2_screen import canonical_id, sha256
    from .compare_migmaq_v3_tokenizer_screen import read_jsonl, word_tokens
    from .evaluate_migmaq_lexical_baseline import graphemes, normalize
except ImportError:
    from compare_migmaq_v2_screen import canonical_id, sha256
    from compare_migmaq_v3_tokenizer_screen import read_jsonl, word_tokens
    from evaluate_migmaq_lexical_baseline import graphemes, normalize


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--screen-schedule", type=Path, required=True)
    parser.add_argument("--control-predictions", type=Path, required=True)
    parser.add_argument("--glossary-predictions", type=Path, required=True)
    parser.add_argument("--prior-predictions", type=Path, required=True)
    parser.add_argument("--prior-exposure-ledger", type=Path, required=True)
    parser.add_argument("--glossary-evaluation-set", type=Path, required=True)
    parser.add_argument("--control-uptake-rows", type=Path, required=True)
    parser.add_argument("--glossary-uptake-rows", type=Path, required=True)
    parser.add_argument("--expected-benchmark-rows", type=int, default=14_438)
    parser.add_argument("--expected-direct-rows", type=int, default=960)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def keyed_canonical(path: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for line_number, row in enumerate(read_jsonl(path), start=1):
        row_id = canonical_id(row.get("id"))
        if not row_id or row_id in result:
            raise ValueError(f"blank or duplicate canonical ID at {path}:{line_number}")
        result[row_id] = row
    return result


def keyed_exact(path: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for line_number, row in enumerate(read_jsonl(path), start=1):
        row_id = str(row.get("id") or "")
        if not row_id or row_id in result:
            raise ValueError(f"blank or duplicate ID at {path}:{line_number}")
        result[row_id] = row
    return result


def normalized_references(row: dict[str, Any]) -> tuple[str, ...]:
    values = (
        row.get("accepted_references_normalized")
        or row.get("accepted_references")
        or [row.get("output_text")]
    )
    return tuple(
        dict.fromkeys(normalize(value) for value in values if normalize(value))
    )


def audit_lexical_schedule(
    benchmark: dict[str, dict[str, Any]],
    schedule_rows: Sequence[dict[str, Any]],
    *,
    expected_direct_rows: int,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    direct: dict[str, dict[str, Any]] = {}
    mismatched_targets: list[str] = []
    mismatched_inputs: list[str] = []
    for file_position, row in enumerate(schedule_rows, start=1):
        if row.get("task") != "lexeme":
            continue
        row_id = canonical_id(row.get("schedule_source_id") or row.get("id"))
        if not row_id or row_id in direct:
            raise ValueError(f"blank or duplicate direct lexical source ID: {row_id!r}")
        benchmark_row = benchmark.get(row_id)
        if benchmark_row is None:
            raise ValueError(
                f"schedule lexical source is absent from benchmark: {row_id}"
            )
        target = normalize(row.get("output_text"))
        if target not in normalized_references(benchmark_row):
            mismatched_targets.append(row_id)
        if normalize(row.get("input_text")) != normalize(
            benchmark_row.get("input_text")
        ):
            mismatched_inputs.append(row_id)
        direct[row_id] = {
            "file_position": file_position,
            "schedule_id": row.get("id"),
            "schedule_presentation_index": row.get("schedule_presentation_index"),
            "target": row.get("output_text"),
        }
    if len(direct) != expected_direct_rows:
        raise ValueError(
            f"direct lexical rows changed: {len(direct)} != {expected_direct_rows}"
        )
    if mismatched_targets or mismatched_inputs:
        raise ValueError(
            "lexical schedule does not reproduce the benchmark: "
            f"target_mismatches={len(mismatched_targets)} "
            f"input_mismatches={len(mismatched_inputs)}"
        )
    return {
        "direct_rows": len(direct),
        "all_targets_are_accepted_benchmark_references": True,
        "all_inputs_match_benchmark_task_prompts": True,
        "unique_direct_source_ids": True,
        "presentations_per_direct_source": {"minimum": 1, "maximum": 1},
        "note": (
            "File position is not optimizer presentation order because the Trainer uses a "
            "seeded random sampler. The exposure ledger proves count, not first-seen update."
        ),
    }, direct


def load_exposure(path: Path) -> dict[str, int]:
    result: dict[str, int] = {}
    for line_number, row in enumerate(read_jsonl(path), start=1):
        row_id = canonical_id(row.get("id"))
        count = int(row.get("presentations") or 0)
        if not row_id or row_id in result or count <= 0:
            raise ValueError(f"invalid exposure row at {path}:{line_number}")
        result[row_id] = count
    return result


def length_bucket(value: int, bounds: Sequence[int]) -> str:
    for bound in bounds:
        if value <= bound:
            return f"<= {bound}"
    return f"> {bounds[-1]}"


def lexical_metrics(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    materialized = list(rows)
    predictions = [normalize(row.get("prediction")) for row in materialized]
    frequencies = Counter(predictions)
    cers = [float(row.get("grapheme_cer") or 0.0) for row in materialized]
    return {
        "rows": len(materialized),
        "accepted_exact_count": sum(
            bool(row.get("accepted_exact")) for row in materialized
        ),
        "accepted_exact_rate": (
            sum(bool(row.get("accepted_exact")) for row in materialized)
            / len(materialized)
            if materialized
            else 0.0
        ),
        "mean_grapheme_cer": statistics.fmean(cers) if cers else 0.0,
        "median_grapheme_cer": statistics.median(cers) if cers else 0.0,
        "near_surface_count": sum(
            not row.get("accepted_exact")
            and float(row.get("grapheme_cer") or 0.0) <= 0.25
            for row in materialized
        ),
        "unique_normalized_outputs": len(frequencies),
        "maximum_normalized_output_frequency": max(frequencies.values(), default=0),
        "blank_outputs": frequencies.get("", 0),
    }


def grouped_metrics(
    rows: Iterable[dict[str, Any]], field: str
) -> dict[str, dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) or "(missing)")].append(row)
    return {label: lexical_metrics(group) for label, group in sorted(groups.items())}


def dictionary_index(
    benchmark: dict[str, dict[str, Any]],
) -> dict[str, dict[str, set[str]]]:
    result: dict[str, dict[str, set[str]]] = defaultdict(
        lambda: {"ids": set(), "parts_of_speech": set()}
    )
    for row_id, row in benchmark.items():
        part_of_speech = str(row.get("part_of_speech") or "(missing)")
        for reference in normalized_references(row):
            result[reference]["ids"].add(row_id)
            result[reference]["parts_of_speech"].add(part_of_speech)
    return result


def enrich_lexical_rows(
    benchmark: dict[str, dict[str, Any]],
    direct: dict[str, dict[str, Any]],
    control: dict[str, dict[str, Any]],
    glossary: dict[str, dict[str, Any]],
    prior: dict[str, dict[str, Any]],
    prior_exposure: dict[str, int],
) -> list[dict[str, Any]]:
    expected = set(benchmark)
    for label, rows in (("control", control), ("glossary", glossary), ("prior", prior)):
        if set(rows) != expected:
            raise ValueError(
                f"{label} lexical ID set differs from benchmark: "
                f"missing={len(expected - set(rows))} extra={len(set(rows) - expected)}"
            )
    form_index = dictionary_index(benchmark)
    result: list[dict[str, Any]] = []
    for row_id in sorted(benchmark):
        benchmark_row = benchmark[row_id]
        references = normalized_references(benchmark_row)
        part_of_speech = str(benchmark_row.get("part_of_speech") or "(missing)")
        source_words = word_tokens(benchmark_row.get("unconditioned_input_text"))
        target_length = min(len(graphemes(reference)) for reference in references)
        source: dict[str, Any] = {
            "id": row_id,
            "input_text": benchmark_row.get("input_text"),
            "unconditioned_input_text": benchmark_row.get("unconditioned_input_text"),
            "accepted_references": list(references),
            "part_of_speech": part_of_speech,
            "exposure_stratum": "direct_one_shot" if row_id in direct else "not_direct",
            "screen_direct_presentations": 1 if row_id in direct else 0,
            "prior_direct_presentations": int(prior_exposure.get(row_id, 0)),
            "source_word_count": len(source_words),
            "source_word_count_class": length_bucket(len(source_words), (1, 2, 5)),
            "target_grapheme_length": target_length,
            "target_grapheme_length_class": length_bucket(target_length, (5, 8, 12)),
            "target_subword_count": control[row_id].get("target_subword_count"),
        }
        if row_id in direct:
            source["screen_schedule"] = direct[row_id]
        for label, arm in (
            ("control", control[row_id]),
            ("glossary", glossary[row_id]),
            ("prior_repeated_lexical", prior[row_id]),
        ):
            prediction = normalize(arm.get("prediction"))
            dictionary_match = form_index.get(prediction)
            source[label] = {
                "prediction": arm.get("prediction"),
                "prediction_normalized": prediction,
                "accepted_exact": bool(arm.get("accepted_exact")),
                "grapheme_cer": float(arm.get("grapheme_cer") or 0.0),
                "edit_error_type": arm.get("edit_error_type"),
                "prediction_is_any_dictionary_form": bool(dictionary_match),
                "prediction_is_same_pos_dictionary_form": bool(
                    dictionary_match
                    and part_of_speech in dictionary_match["parts_of_speech"]
                ),
                "prediction_is_wrong_dictionary_form": bool(
                    dictionary_match and prediction not in references
                ),
            }
        result.append(source)
    return result


def top_collapse_outputs(
    rows: Sequence[dict[str, Any]], arm: str, limit: int = 30
) -> list[dict[str, Any]]:
    frequencies = Counter(row[arm]["prediction_normalized"] for row in rows)
    result: list[dict[str, Any]] = []
    for prediction, count in frequencies.most_common(limit):
        members = [
            row for row in rows if row[arm]["prediction_normalized"] == prediction
        ]
        parts = Counter(row["part_of_speech"] for row in members)
        result.append(
            {
                "prediction": prediction,
                "rows": count,
                "accepted_exact_rows": sum(
                    row[arm]["accepted_exact"] for row in members
                ),
                "wrong_dictionary_form_rows": sum(
                    row[arm]["prediction_is_wrong_dictionary_form"] for row in members
                ),
                "is_any_dictionary_form": any(
                    row[arm]["prediction_is_any_dictionary_form"] for row in members
                ),
                "part_of_speech_counts": dict(sorted(parts.items())),
            }
        )
    return result


def summarize_lexical(rows: Sequence[dict[str, Any]], arm: str) -> dict[str, Any]:
    flattened = [{**row, **row[arm]} for row in rows]
    direct = [row for row in flattened if row["exposure_stratum"] == "direct_one_shot"]
    return {
        "overall": lexical_metrics(flattened),
        "direct_one_shot": lexical_metrics(direct),
        "not_direct": lexical_metrics(
            row for row in flattened if row["exposure_stratum"] == "not_direct"
        ),
        "direct_by_part_of_speech": grouped_metrics(direct, "part_of_speech"),
        "direct_by_source_word_count": grouped_metrics(
            direct, "source_word_count_class"
        ),
        "direct_by_target_grapheme_length": grouped_metrics(
            direct, "target_grapheme_length_class"
        ),
        "direct_by_target_subword_count": grouped_metrics(
            direct, "target_subword_count"
        ),
        "prediction_membership": {
            "any_dictionary_form": sum(
                row[arm]["prediction_is_any_dictionary_form"] for row in rows
            ),
            "same_pos_dictionary_form": sum(
                row[arm]["prediction_is_same_pos_dictionary_form"] for row in rows
            ),
            "wrong_dictionary_form": sum(
                row[arm]["prediction_is_wrong_dictionary_form"] for row in rows
            ),
        },
        "top_collapse_outputs": top_collapse_outputs(rows, arm),
    }


def remove_hint_sequences(value: Any, hints: Sequence[Any]) -> list[str]:
    tokens = word_tokens(value)
    phrases = sorted(
        (word_tokens(hint) for hint in hints if word_tokens(hint)),
        key=len,
        reverse=True,
    )
    result: list[str] = []
    index = 0
    while index < len(tokens):
        match = next(
            (
                phrase
                for phrase in phrases
                if tokens[index : index + len(phrase)] == phrase
            ),
            None,
        )
        if match:
            index += len(match)
        else:
            result.append(tokens[index])
            index += 1
    return result


def sentence_chrf(prediction: str, reference: str) -> float:
    return CHRF(word_order=2).sentence_score(prediction, [reference]).score


def glossary_matrix(
    evaluation: dict[str, dict[str, Any]],
    control_rows: dict[str, dict[str, Any]],
    glossary_rows: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if set(control_rows) != set(evaluation) or set(glossary_rows) != set(evaluation):
        raise ValueError(
            "glossary uptake row IDs differ from the frozen evaluation set"
        )
    result: list[dict[str, Any]] = []
    for row_id in evaluation:
        source_row = evaluation[row_id]
        hints = [
            str(pair.get("migmaq_headword") or "")
            for pair in source_row.get("glossary_pairs") or []
        ]
        if not hints or any(not word_tokens(hint) for hint in hints):
            raise ValueError(f"blank glossary hint for {row_id}")
        reference = str(source_row.get("output_text") or "")
        reference_residual = " ".join(remove_hint_sequences(reference, hints))
        if not reference_residual:
            raise ValueError(
                f"glossary hint consumes the complete reference for {row_id}"
            )
        item: dict[str, Any] = {
            "id": row_id,
            "source": source_row.get("unconditioned_input_text"),
            "reference": reference,
            "hints": hints,
            "reference_residual": reference_residual,
            "reference_word_count": len(word_tokens(reference)),
            "reference_residual_word_count": len(word_tokens(reference_residual)),
            "hint_reference_word_share": 1.0
            - len(word_tokens(reference_residual))
            / max(1, len(word_tokens(reference))),
        }
        for label, source in (
            ("control", control_rows[row_id]),
            ("glossary", glossary_rows[row_id]),
        ):
            if normalize(source.get("reference")) != normalize(reference):
                raise ValueError(f"glossary reference mismatch for {row_id} in {label}")
            conditioned = str(source.get("conditioned_prediction") or "")
            unconditioned = str(source.get("unconditioned_prediction") or "")
            conditioned_residual = " ".join(remove_hint_sequences(conditioned, hints))
            unconditioned_residual = " ".join(
                remove_hint_sequences(unconditioned, hints)
            )
            conditioned_chrf = sentence_chrf(
                normalize(conditioned), normalize(reference)
            )
            unconditioned_chrf = sentence_chrf(
                normalize(unconditioned), normalize(reference)
            )
            conditioned_residual_chrf = sentence_chrf(
                conditioned_residual, reference_residual
            )
            unconditioned_residual_chrf = sentence_chrf(
                unconditioned_residual, reference_residual
            )
            item[label] = {
                "conditioned_prediction": conditioned,
                "unconditioned_prediction": unconditioned,
                "conditioned_residual": conditioned_residual,
                "unconditioned_residual": unconditioned_residual,
                "conditioned_all_hints_present": bool(
                    source.get("conditioned_all_hints_present")
                ),
                "unconditioned_all_hints_present": bool(
                    source.get("unconditioned_all_hints_present")
                ),
                "conditioned_chrf": conditioned_chrf,
                "unconditioned_chrf": unconditioned_chrf,
                "whole_chrf_delta": conditioned_chrf - unconditioned_chrf,
                "conditioned_residual_chrf": conditioned_residual_chrf,
                "unconditioned_residual_chrf": unconditioned_residual_chrf,
                "residual_chrf_delta": conditioned_residual_chrf
                - unconditioned_residual_chrf,
                "conditioned_residual_empty": not conditioned_residual,
            }
        item["glossary_minus_control"] = {
            "conditioned_chrf": item["glossary"]["conditioned_chrf"]
            - item["control"]["conditioned_chrf"],
            "conditioned_residual_chrf": item["glossary"]["conditioned_residual_chrf"]
            - item["control"]["conditioned_residual_chrf"],
        }
        result.append(item)
    return result


def corpus_chrf(predictions: Sequence[str], references: Sequence[str]) -> float:
    return CHRF(word_order=2).corpus_score(list(predictions), [list(references)]).score


def summarize_glossary_arm(rows: Sequence[dict[str, Any]], arm: str) -> dict[str, Any]:
    conditioned = [normalize(row[arm]["conditioned_prediction"]) for row in rows]
    unconditioned = [normalize(row[arm]["unconditioned_prediction"]) for row in rows]
    references = [normalize(row["reference"]) for row in rows]
    conditioned_residual = [row[arm]["conditioned_residual"] for row in rows]
    unconditioned_residual = [row[arm]["unconditioned_residual"] for row in rows]
    reference_residual = [row["reference_residual"] for row in rows]
    hint_only = [" ".join(word_tokens(" ".join(row["hints"]))) for row in rows]
    residual_deltas = [row[arm]["residual_chrf_delta"] for row in rows]
    metric = CHRF(word_order=2)
    whole_conditioned = metric.corpus_score(conditioned, [references]).score
    whole_unconditioned = metric.corpus_score(unconditioned, [references]).score
    residual_conditioned = metric.corpus_score(
        conditioned_residual, [reference_residual]
    ).score
    residual_unconditioned = metric.corpus_score(
        unconditioned_residual, [reference_residual]
    ).score
    hint_only_chrf = metric.corpus_score(hint_only, [references]).score
    return {
        "rows": len(rows),
        "conditioned_all_hint_rows": sum(
            row[arm]["conditioned_all_hints_present"] for row in rows
        ),
        "unconditioned_all_hint_rows": sum(
            row[arm]["unconditioned_all_hints_present"] for row in rows
        ),
        "conditioned_chrf": whole_conditioned,
        "unconditioned_chrf": whole_unconditioned,
        "paired_whole_chrf_delta": whole_conditioned - whole_unconditioned,
        "hint_only_baseline_chrf": hint_only_chrf,
        "conditioned_minus_hint_only_chrf": whole_conditioned - hint_only_chrf,
        "conditioned_residual_chrf": residual_conditioned,
        "unconditioned_residual_chrf": residual_unconditioned,
        "paired_residual_chrf_delta": residual_conditioned - residual_unconditioned,
        "mean_row_residual_chrf_delta": statistics.fmean(residual_deltas),
        "residual_improved_rows": sum(value > 1e-12 for value in residual_deltas),
        "residual_worsened_rows": sum(value < -1e-12 for value in residual_deltas),
        "residual_tied_rows": sum(abs(value) <= 1e-12 for value in residual_deltas),
        "conditioned_residual_empty_rows": sum(
            row[arm]["conditioned_residual_empty"] for row in rows
        ),
        "mean_hint_reference_word_share": statistics.fmean(
            row["hint_reference_word_share"] for row in rows
        ),
        "metric_signature": str(metric.get_signature()),
    }


def qualitative_examples(
    rows: Sequence[dict[str, Any]], field: str, *, highest: bool, limit: int = 15
) -> list[dict[str, Any]]:
    ordered = sorted(
        rows, key=lambda row: row["glossary_minus_control"][field], reverse=highest
    )
    return [
        {
            "id": row["id"],
            "source": row["source"],
            "reference": row["reference"],
            "hints": row["hints"],
            "delta": row["glossary_minus_control"][field],
            "control_conditioned": row["control"]["conditioned_prediction"],
            "glossary_conditioned": row["glossary"]["conditioned_prediction"],
            "control_residual": row["control"]["conditioned_residual"],
            "glossary_residual": row["glossary"]["conditioned_residual"],
            "reference_residual": row["reference_residual"],
        }
        for row in ordered[:limit]
    ]


def build_report(
    args: argparse.Namespace,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    benchmark = keyed_canonical(args.benchmark)
    if len(benchmark) != args.expected_benchmark_rows:
        raise ValueError(
            f"benchmark rows changed: {len(benchmark)} != {args.expected_benchmark_rows}"
        )
    schedule_rows = read_jsonl(args.screen_schedule)
    schedule_audit, direct = audit_lexical_schedule(
        benchmark, schedule_rows, expected_direct_rows=args.expected_direct_rows
    )
    control = keyed_canonical(args.control_predictions)
    glossary = keyed_canonical(args.glossary_predictions)
    prior = keyed_canonical(args.prior_predictions)
    prior_exposure = load_exposure(args.prior_exposure_ledger)
    lexical_rows = enrich_lexical_rows(
        benchmark, direct, control, glossary, prior, prior_exposure
    )
    evaluation = keyed_exact(args.glossary_evaluation_set)
    control_uptake = keyed_exact(args.control_uptake_rows)
    glossary_uptake = keyed_exact(args.glossary_uptake_rows)
    glossary_rows = glossary_matrix(evaluation, control_uptake, glossary_uptake)
    glossary_control = summarize_glossary_arm(glossary_rows, "control")
    glossary_treatment = summarize_glossary_arm(glossary_rows, "glossary")
    direct_prior = [
        {**row, **row["prior_repeated_lexical"]}
        for row in lexical_rows
        if row["exposure_stratum"] == "direct_one_shot"
    ]
    report = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "migmaq_v3_1_lexical_and_masked_glossary_failure_analysis",
        "claim_limit": (
            "Development-census and source-attested dictionary-example analysis. Masked "
            "chrF++ tests non-hint surface overlap, not semantic adequacy or speaker judgment."
        ),
        "inputs": {
            name: {"path": str(path.resolve()), "sha256": sha256(path)}
            for name, path in (
                ("benchmark", args.benchmark),
                ("screen_schedule", args.screen_schedule),
                ("control_predictions", args.control_predictions),
                ("glossary_predictions", args.glossary_predictions),
                ("prior_predictions", args.prior_predictions),
                ("prior_exposure_ledger", args.prior_exposure_ledger),
                ("glossary_evaluation_set", args.glossary_evaluation_set),
                ("control_uptake_rows", args.control_uptake_rows),
                ("glossary_uptake_rows", args.glossary_uptake_rows),
            )
        },
        "schedule_audit": schedule_audit,
        "lexical": {
            "control": summarize_lexical(lexical_rows, "control"),
            "glossary": summarize_lexical(lexical_rows, "glossary"),
            "prior_repeated_lexical": summarize_lexical(
                lexical_rows, "prior_repeated_lexical"
            ),
            "same_960_direct_rows_under_prior_repeated_recipe": lexical_metrics(
                direct_prior
            ),
            "interpretation": [
                "All 960 one-shot targets and prompts exactly match the frozen benchmark.",
                "One presentation cannot be interpreted as a lexical-capacity test.",
                "A wrong dictionary form is a fluent listed form returned for the wrong prompt; it is not a near-correct translation.",
            ],
        },
        "glossary_masked": {
            "control": glossary_control,
            "glossary": glossary_treatment,
            "glossary_minus_control": {
                "conditioned_chrf": glossary_treatment["conditioned_chrf"]
                - glossary_control["conditioned_chrf"],
                "paired_whole_chrf_delta": glossary_treatment["paired_whole_chrf_delta"]
                - glossary_control["paired_whole_chrf_delta"],
                "conditioned_residual_chrf": glossary_treatment[
                    "conditioned_residual_chrf"
                ]
                - glossary_control["conditioned_residual_chrf"],
                "paired_residual_chrf_delta": glossary_treatment[
                    "paired_residual_chrf_delta"
                ]
                - glossary_control["paired_residual_chrf_delta"],
            },
            "best_non_hint_changes": qualitative_examples(
                glossary_rows, "conditioned_residual_chrf", highest=True
            ),
            "worst_non_hint_changes": qualitative_examples(
                glossary_rows, "conditioned_residual_chrf", highest=False
            ),
            "interpretation": [
                "Hint-only chrF++ quantifies overlap available by copying supplied headwords and producing nothing else.",
                "Residual chrF++ removes every supplied headword sequence from prediction and reference before scoring.",
                "Residual gains show non-hint surface improvement, but still do not establish semantic or grammatical adequacy.",
            ],
        },
    }
    return report, lexical_rows, glossary_rows


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
    report, lexical_rows, glossary_rows = build_report(args)
    write_json_atomic(args.output_dir / "failure-analysis.json", report)
    write_jsonl_atomic(
        args.output_dir / "lexical-failures-enriched.jsonl", lexical_rows
    )
    write_jsonl_atomic(args.output_dir / "glossary-masked-paired.jsonl", glossary_rows)
    names = (
        "failure-analysis.json",
        "glossary-masked-paired.jsonl",
        "lexical-failures-enriched.jsonl",
    )
    (args.output_dir / "OUTPUT-SHA256SUMS").write_text(
        "".join(f"{sha256(args.output_dir / name)}  {name}\n" for name in names),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "direct_one_shot": report["lexical"]["glossary"]["direct_one_shot"],
                "prior_same_960": report["lexical"][
                    "same_960_direct_rows_under_prior_repeated_recipe"
                ],
                "glossary_masked": report["glossary_masked"]["glossary_minus_control"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

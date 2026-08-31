#!/usr/bin/env python3
"""Analyze complete lexical and fixed-utterance 50 Words pretraining baselines."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import statistics
import tempfile
from typing import Any, Sequence
import unicodedata

import regex


CLAIM_LIMIT = (
    "This analysis describes zero-step surface reconstruction failures in one "
    "source/speaker cluster. It cannot establish a lexical fact, grammar rule, "
    "morphological analysis, independent sentence capability, synthetic pair, "
    "training eligibility, or release readiness."
)


class AnalysisError(ValueError):
    """The frozen baseline or prediction inputs are inconsistent."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}-{digest}"


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value)).lower().split())


def graphemes(value: str) -> list[str]:
    return regex.findall(r"\X", value)


def edit_distance(left: Sequence[Any], right: Sequence[Any]) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_value in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_value in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_value != right_value),
                )
            )
        previous = current
    return previous[-1]


def error_rate(prediction: Sequence[Any], reference: Sequence[Any]) -> float:
    return edit_distance(prediction, reference) / max(1, len(reference))


def terminal_punctuation(value: str) -> str:
    match = regex.search(r"[.!?]+$", value)
    return match.group(0) if match else ""


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise AnalysisError(
                    f"invalid JSON at {path}:{line_number}: {error}"
                ) from error
            if not isinstance(row, dict):
                raise AnalysisError(f"expected object at {path}:{line_number}")
            rows.append(row)
    return rows


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def normalized_references(row: dict[str, Any], context: str) -> list[str]:
    references = row.get("accepted_references")
    if not isinstance(references, list) or not references:
        raise AnalysisError(f"{context} requires accepted_references")
    values = [normalize(value) for value in references]
    if any(not value for value in values) or len(values) != len(set(values)):
        raise AnalysisError(f"{context} has empty or duplicate normalized references")
    return values


def closest_reference(
    prediction: str, references: list[str]
) -> tuple[str, float, float]:
    candidates = []
    for reference in references:
        codepoint = error_rate(list(prediction), list(reference))
        grapheme = error_rate(graphemes(prediction), graphemes(reference))
        candidates.append((grapheme, codepoint, reference))
    grapheme, codepoint, reference = min(candidates)
    return reference, codepoint, grapheme


def fertility_bucket(value: int) -> str:
    if value <= 1:
        return "1"
    if value == 2:
        return "2"
    if value == 3:
        return "3"
    return "4+"


def validate_prediction(
    benchmark: dict[str, Any], prediction: dict[str, Any], index: int, task: str
) -> tuple[str, list[str], str, float, float]:
    row_id = str(benchmark.get("id") or "")
    if not row_id:
        raise AnalysisError(f"{task} benchmark row {index} has no id")
    if prediction.get("id") != row_id:
        raise AnalysisError(f"{task} prediction order/id mismatch at row {index}")
    source = str(benchmark.get("input_text") or "")
    if not source or prediction.get("unconditioned_input_text") != source:
        raise AnalysisError(f"{task} prediction source mismatch for {row_id}")
    references = normalized_references(benchmark, f"{task} benchmark row {row_id}")
    if prediction.get("accepted_references_normalized") != references:
        raise AnalysisError(f"{task} prediction reference mismatch for {row_id}")
    output = normalize(prediction.get("prediction") or "")
    selected, codepoint, grapheme = closest_reference(output, references)
    expected_exact = output in references
    if prediction.get("accepted_exact") is not expected_exact:
        raise AnalysisError(f"{task} accepted_exact drift for {row_id}")
    for field, expected in (("codepoint_cer", codepoint), ("grapheme_cer", grapheme)):
        observed = prediction.get(field)
        if (
            not isinstance(observed, (int, float))
            or abs(float(observed) - expected) > 1e-12
        ):
            raise AnalysisError(f"{task} {field} drift for {row_id}")
    return row_id, references, selected, codepoint, grapheme


def common_result(
    benchmark: dict[str, Any],
    prediction: dict[str, Any],
    row_id: str,
    references: list[str],
    selected: str,
    codepoint: float,
    grapheme: float,
    task_family: str,
) -> dict[str, Any]:
    output = normalize(prediction.get("prediction") or "")
    return {
        "id": row_id,
        "task_family": task_family,
        "suite_key": benchmark.get("suite_key"),
        "source_cluster_id": benchmark.get("source_cluster_id"),
        "speaker_source": benchmark.get("speaker_source"),
        "source_record_id": benchmark.get("source_record_id"),
        "source_ordinal": benchmark.get("source_ordinal"),
        "source_prompt": benchmark.get("source_prompt"),
        "input_text": benchmark.get("input_text"),
        "accepted_references_normalized": references,
        "selected_closest_reference": selected,
        "prediction": prediction.get("prediction"),
        "prediction_normalized": output,
        "accepted_exact": output in references,
        "codepoint_cer": codepoint,
        "grapheme_cer": grapheme,
        "edit_error_type": prediction.get("edit_error_type"),
        "empty": not output,
        "source_copy": output == normalize(benchmark.get("input_text") or ""),
        "target_subword_count": prediction.get("target_subword_count"),
        "latency_milliseconds": prediction.get("latency_milliseconds"),
        "project_training_exposure_at_measurement": benchmark.get(
            "project_training_exposure_at_measurement"
        ),
        "post_training_interpretation": benchmark.get("post_training_interpretation"),
        "model_output_is_linguistic_evidence": False,
        "sentence_translation_authorization": False,
        "claim_limit": CLAIM_LIMIT,
    }


def lexical_result(
    benchmark: dict[str, Any], prediction: dict[str, Any], index: int
) -> dict[str, Any]:
    row_id, references, selected, codepoint, grapheme = validate_prediction(
        benchmark, prediction, index, "lexical"
    )
    result = common_result(
        benchmark,
        prediction,
        row_id,
        references,
        selected,
        codepoint,
        grapheme,
        "lexeme",
    )
    target_subwords = prediction.get("target_subword_count")
    if not isinstance(target_subwords, int) or target_subwords < 1:
        raise AnalysisError(f"lexical target_subword_count invalid for {row_id}")
    failure_labels: list[str] = []
    review_actions: list[str] = []
    if not result["accepted_exact"]:
        failure_labels.append(str(result["edit_error_type"] or "surface_mismatch"))
        review_actions.append("direct_lexical_reconstruction_supervision_review")
        relation = benchmark.get("current_dictionary_relation")
        if relation == "no_exact_current_headword":
            review_actions.append("current_dictionary_relation_review")
        elif relation == "multiple_exact_current_headwords":
            review_actions.append("sense_and_headword_ambiguity_review")
        if target_subwords >= 4:
            review_actions.append("target_tokenizer_fragmentation_review")
        if result["empty"]:
            failure_labels.append("blank_output")
        if result["source_copy"]:
            failure_labels.append("source_copy")
    result.update(
        {
            "current_dictionary_relation": benchmark.get("current_dictionary_relation"),
            "current_dictionary_match_ids": benchmark.get(
                "current_dictionary_match_ids"
            ),
            "lexical_entry_id": benchmark.get("lexical_entry_id"),
            "form_id": benchmark.get("form_id"),
            "sense_decision_id": benchmark.get("sense_decision_id"),
            "target_subword_fertility_bucket": fertility_bucket(target_subwords),
            "failure_labels": sorted(set(failure_labels)),
            "review_actions": sorted(set(review_actions)),
            "synthetic_sentence_eligibility": benchmark.get(
                "synthetic_sentence_eligibility"
            ),
            "synthetic_coverage_cell_authorized": False,
            "training_eligible": False,
        }
    )
    return result


def sentence_result(
    benchmark: dict[str, Any], prediction: dict[str, Any], index: int
) -> dict[str, Any]:
    row_id, references, selected, codepoint, grapheme = validate_prediction(
        benchmark, prediction, index, "sentence"
    )
    result = common_result(
        benchmark,
        prediction,
        row_id,
        references,
        selected,
        codepoint,
        grapheme,
        "fixed_utterance",
    )
    output = str(result["prediction_normalized"])
    reference_tokens = len(selected.split())
    prediction_tokens = len(output.split()) if output else 0
    reference_terminal = terminal_punctuation(selected)
    prediction_terminal = terminal_punctuation(output)
    failure_labels: list[str] = []
    review_actions: list[str] = []
    if not result["accepted_exact"]:
        failure_labels.append(str(result["edit_error_type"] or "surface_mismatch"))
        review_actions.append("attested_fixed_utterance_reconstruction_review")
        if reference_tokens != prediction_tokens:
            failure_labels.append("target_token_count_mismatch")
            review_actions.append("output_length_behavior_review")
        if reference_terminal != prediction_terminal:
            failure_labels.append("terminal_punctuation_mismatch")
            review_actions.append("terminal_punctuation_behavior_review")
        if result["empty"]:
            failure_labels.append("blank_output")
        if result["source_copy"]:
            failure_labels.append("source_copy")
    result.update(
        {
            "reference_token_count": reference_tokens,
            "prediction_token_count": prediction_tokens,
            "signed_target_token_count_delta": prediction_tokens - reference_tokens,
            "reference_terminal_punctuation": reference_terminal,
            "prediction_terminal_punctuation": prediction_terminal,
            "terminal_punctuation_preserved": reference_terminal == prediction_terminal,
            "structural_risk_tags": benchmark.get("structural_risk_tags") or [],
            "failure_labels": sorted(set(failure_labels)),
            "review_actions": sorted(set(review_actions)),
            "productive_grammar_status": benchmark.get("productive_grammar_status"),
            "morphological_analysis_status": benchmark.get(
                "morphological_analysis_status"
            ),
            "synthetic_coverage_cell_authorized": False,
            "training_eligible": False,
        }
    )
    return result


def analyze(
    lexical_benchmark: list[dict[str, Any]],
    lexical_predictions: list[dict[str, Any]],
    sentence_benchmark: list[dict[str, Any]],
    sentence_predictions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if len(lexical_benchmark) != len(lexical_predictions):
        raise AnalysisError("lexical benchmark/prediction row mismatch")
    if len(sentence_benchmark) != len(sentence_predictions):
        raise AnalysisError("sentence benchmark/prediction row mismatch")
    rows = [
        lexical_result(benchmark, prediction, index)
        for index, (benchmark, prediction) in enumerate(
            zip(lexical_benchmark, lexical_predictions, strict=True), start=1
        )
    ]
    rows.extend(
        sentence_result(benchmark, prediction, index)
        for index, (benchmark, prediction) in enumerate(
            zip(sentence_benchmark, sentence_predictions, strict=True), start=1
        )
    )
    ids = [str(row["id"]) for row in rows]
    if len(ids) != len(set(ids)):
        raise AnalysisError("duplicate row IDs across the 50 Words cohort")
    return rows


def summarize_group(rows: list[dict[str, Any]]) -> dict[str, Any]:
    exact = sum(bool(row["accepted_exact"]) for row in rows)
    return {
        "rows": len(rows),
        "accepted_exact_count": exact,
        "accepted_exact_percent": 100 * exact / len(rows),
        "mean_grapheme_cer": statistics.fmean(
            float(row["grapheme_cer"]) for row in rows
        ),
    }


def grouped_summary(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) or "(missing)")].append(row)
    return {key: summarize_group(group) for key, group in sorted(groups.items())}


def report(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        raise AnalysisError("analysis requires at least one row")
    lexical = [row for row in rows if row["task_family"] == "lexeme"]
    sentence = [row for row in rows if row["task_family"] == "fixed_utterance"]
    predictions = Counter(str(row["prediction_normalized"]) for row in rows)
    failed = [row for row in rows if not row["accepted_exact"]]
    return {
        "schema_version": 1,
        "analysis_id": "wajarri-50words-pretraining-failure-analysis-v1",
        "population": {
            "rows": len(rows),
            "lexical_rows": len(lexical),
            "fixed_utterance_rows": len(sentence),
            "source_clusters": len({str(row["source_cluster_id"]) for row in rows}),
            "speakers": len({str(row["speaker_source"]) for row in rows}),
            "independent_sentence_rows": 0,
        },
        "overall": summarize_group(rows),
        "by_task_family": grouped_summary(rows, "task_family"),
        "lexical_by_current_dictionary_relation": grouped_summary(
            lexical, "current_dictionary_relation"
        ),
        "lexical_by_target_subword_fertility": grouped_summary(
            lexical, "target_subword_fertility_bucket"
        ),
        "by_edit_error_type": grouped_summary(rows, "edit_error_type"),
        "failure_labels": dict(
            sorted(
                Counter(
                    label for row in failed for label in row["failure_labels"]
                ).items()
            )
        ),
        "review_actions": dict(
            sorted(
                Counter(
                    action for row in failed for action in row["review_actions"]
                ).items()
            )
        ),
        "prediction_collapse": {
            "unique_normalized_outputs": len(predictions),
            "maximum_output_frequency": max(predictions.values()),
            "most_common_outputs": [
                {"prediction": value, "rows": count}
                for value, count in predictions.most_common(25)
            ],
        },
        "authorization": {
            "synthetic_coverage_cells": 0,
            "controlled_synthetic_sentence_pairs": 0,
            "training_eligible_rows": 0,
            "independent_sentence_translation": False,
            "model_output_is_linguistic_evidence": False,
        },
        "required_next_sequence": [
            "review every failed row against its frozen source and living-book relation",
            "separate direct lexical reconstruction needs from sentence-structure needs",
            "map only clean failures to accepted lexemes and productive templates",
            "issue a Kuku Yalanji-style bilingual synthetic coverage commission",
            "review generated candidates before any training eligibility",
            "compare curated-only and curated-plus-synthetic arms under fixed tokens and steps",
        ],
        "claim_limit": CLAIM_LIMIT,
    }


def review_queue(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue = []
    for row in rows:
        if row["accepted_exact"]:
            continue
        blockers = (
            ["part_of_speech", "morphology", "productive_grammar"]
            if row["task_family"] == "lexeme"
            else ["productive_grammar", "morphology", "independent_sentence_evidence"]
        )
        queue.append(
            {
                "review_id": stable_id(
                    "wbv-50words-failure-review",
                    str(row["task_family"]),
                    str(row["id"]),
                ),
                "benchmark_row_id": row["id"],
                "task_family": row["task_family"],
                "source_record_id": row["source_record_id"],
                "source_prompt": row["source_prompt"],
                "accepted_references_normalized": row["accepted_references_normalized"],
                "prediction_normalized": row["prediction_normalized"],
                "failure_labels": row["failure_labels"],
                "review_actions": row["review_actions"],
                "synthetic_coverage_cell_status": "blocked_review_question_only",
                "synthetic_blockers": blockers,
                "direct_supervision_training_status": "blocked_pending_program_training_gate",
                "model_output_is_linguistic_evidence": False,
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return queue


def verify_input(path: Path, expected_sha256: str, label: str) -> None:
    observed = sha256(path)
    if observed != expected_sha256:
        raise AnalysisError(
            f"{label} SHA-256 mismatch: expected {expected_sha256}, observed {observed}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lexical-benchmark", type=Path, required=True)
    parser.add_argument("--lexical-predictions", type=Path, required=True)
    parser.add_argument("--sentence-benchmark", type=Path, required=True)
    parser.add_argument("--sentence-predictions", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-lexical-benchmark-sha256", required=True)
    parser.add_argument("--expected-lexical-predictions-sha256", required=True)
    parser.add_argument("--expected-sentence-benchmark-sha256", required=True)
    parser.add_argument("--expected-sentence-predictions-sha256", required=True)
    parser.add_argument("--expected-lexical-rows", type=int, default=47)
    parser.add_argument("--expected-sentence-rows", type=int, default=8)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    for path, expected, label in (
        (
            args.lexical_benchmark,
            args.expected_lexical_benchmark_sha256,
            "lexical benchmark",
        ),
        (
            args.lexical_predictions,
            args.expected_lexical_predictions_sha256,
            "lexical predictions",
        ),
        (
            args.sentence_benchmark,
            args.expected_sentence_benchmark_sha256,
            "sentence benchmark",
        ),
        (
            args.sentence_predictions,
            args.expected_sentence_predictions_sha256,
            "sentence predictions",
        ),
    ):
        verify_input(path, expected, label)
    lexical_benchmark = read_jsonl(args.lexical_benchmark)
    lexical_predictions = read_jsonl(args.lexical_predictions)
    sentence_benchmark = read_jsonl(args.sentence_benchmark)
    sentence_predictions = read_jsonl(args.sentence_predictions)
    if len(lexical_benchmark) != args.expected_lexical_rows:
        raise AnalysisError("lexical benchmark row count mismatch")
    if len(sentence_benchmark) != args.expected_sentence_rows:
        raise AnalysisError("sentence benchmark row count mismatch")
    rows = analyze(
        lexical_benchmark,
        lexical_predictions,
        sentence_benchmark,
        sentence_predictions,
    )
    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows_path = args.output_dir / "ROWS.jsonl"
    queue_path = args.output_dir / "COVERAGE-REVIEW-QUEUE.jsonl"
    report_path = args.output_dir / "REPORT.json"
    input_path = args.output_dir / "INPUT-MANIFEST.json"
    write_jsonl_atomic(rows_path, rows)
    write_jsonl_atomic(queue_path, review_queue(rows))
    write_json_atomic(report_path, report(rows))
    write_json_atomic(
        input_path,
        {
            "schema_version": 1,
            "inputs": {
                "lexical_benchmark": {
                    "path": str(args.lexical_benchmark),
                    "sha256": args.expected_lexical_benchmark_sha256,
                    "rows": len(lexical_benchmark),
                },
                "lexical_predictions": {
                    "path": str(args.lexical_predictions),
                    "sha256": args.expected_lexical_predictions_sha256,
                    "rows": len(lexical_predictions),
                },
                "sentence_benchmark": {
                    "path": str(args.sentence_benchmark),
                    "sha256": args.expected_sentence_benchmark_sha256,
                    "rows": len(sentence_benchmark),
                },
                "sentence_predictions": {
                    "path": str(args.sentence_predictions),
                    "sha256": args.expected_sentence_predictions_sha256,
                    "rows": len(sentence_predictions),
                },
            },
            "claim_limit": CLAIM_LIMIT,
        },
    )
    outputs = (rows_path, queue_path, report_path, input_path)
    checksum_path = args.output_dir / "SHA256SUMS.analysis"
    checksum_path.write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in outputs),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Analyze a frozen fixed-utterance NLLB reconstruction run.

This analyzer is deliberately language-neutral and post-generation only. It
does not judge meaning, grammar, morphology, variety, or cultural suitability.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import tempfile
from typing import Any, Sequence
import unicodedata

import regex


CLAIM_LIMIT = (
    "This is a source-cluster fixed-utterance reconstruction diagnostic. "
    "It measures deterministic surface behavior only and cannot establish "
    "productive grammar, morphology, independent sentence translation, "
    "speaker diversity, or release readiness."
)


class AnalysisError(ValueError):
    """The frozen analysis inputs are inconsistent."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def token_count(value: str) -> int:
    return len(value.split()) if value else 0


def percentile(values: list[float], proportion: float) -> float:
    if not values:
        raise AnalysisError("cannot calculate a percentile over zero rows")
    ordered = sorted(values)
    position = (len(ordered) - 1) * proportion
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise AnalysisError(
                    f"invalid JSON at {path}:{line_number}: {error}"
                ) from error
            if not isinstance(value, dict):
                raise AnalysisError(f"expected object at {path}:{line_number}")
            rows.append(value)
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


def require_references(row: dict[str, Any], context: str) -> list[str]:
    references = row.get("accepted_references")
    if not isinstance(references, list) or not references:
        raise AnalysisError(f"{context} requires non-empty accepted_references")
    normalized = [normalize(value) for value in references]
    if any(not value for value in normalized):
        raise AnalysisError(f"{context} contains an empty accepted reference")
    if len(normalized) != len(set(normalized)):
        raise AnalysisError(f"{context} contains duplicate normalized references")
    return normalized


def closest_reference(
    prediction: str, references: list[str]
) -> tuple[str, float, float]:
    candidates = []
    for reference in references:
        codepoint_cer = error_rate(list(prediction), list(reference))
        grapheme_cer = error_rate(graphemes(prediction), graphemes(reference))
        candidates.append((grapheme_cer, codepoint_cer, reference))
    grapheme_cer, codepoint_cer, reference = min(candidates)
    return reference, codepoint_cer, grapheme_cer


def analyze_rows(
    benchmark_rows: list[dict[str, Any]], prediction_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if len(benchmark_rows) != len(prediction_rows):
        raise AnalysisError(
            f"benchmark/prediction row mismatch: {len(benchmark_rows)} != {len(prediction_rows)}"
        )
    analyzed: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, (benchmark, prediction) in enumerate(
        zip(benchmark_rows, prediction_rows, strict=True), start=1
    ):
        row_id = str(benchmark.get("id") or "")
        if not row_id:
            raise AnalysisError(f"benchmark row {index} has no id")
        if row_id in seen_ids:
            raise AnalysisError(f"duplicate benchmark id {row_id}")
        seen_ids.add(row_id)
        if prediction.get("id") != row_id:
            raise AnalysisError(
                f"prediction order/id mismatch at row {index}: {prediction.get('id')!r} != {row_id!r}"
            )
        source = str(benchmark.get("input_text") or "")
        if not source:
            raise AnalysisError(f"benchmark row {row_id} has no input_text")
        if prediction.get("unconditioned_input_text") != source:
            raise AnalysisError(f"prediction source mismatch for {row_id}")
        references = require_references(benchmark, f"benchmark row {row_id}")
        observed_references = prediction.get("accepted_references_normalized")
        if observed_references != references:
            raise AnalysisError(f"prediction reference mismatch for {row_id}")
        output = normalize(prediction.get("prediction") or "")
        selected, codepoint_cer, grapheme_cer = closest_reference(output, references)
        selected_tokens = token_count(selected)
        output_tokens = token_count(output)
        reference_terminal = terminal_punctuation(selected)
        output_terminal = terminal_punctuation(output)
        selected_graphemes = len(graphemes(selected))
        output_graphemes = len(graphemes(output))
        flags: list[str] = []
        if not output:
            flags.append("blank_output")
        if output == normalize(source):
            flags.append("source_copy")
        if output_tokens < selected_tokens:
            flags.append("fewer_surface_tokens_than_reference")
        elif output_tokens > selected_tokens:
            flags.append("more_surface_tokens_than_reference")
        if reference_terminal != output_terminal:
            flags.append("terminal_punctuation_mismatch")
        if output not in references:
            flags.append("whole_utterance_mismatch")
        analyzed.append(
            {
                "id": row_id,
                "suite_key": benchmark.get("suite_key"),
                "source_cluster_id": benchmark.get("source_cluster_id"),
                "speaker_source": benchmark.get("speaker_source"),
                "source_record_id": benchmark.get("source_record_id"),
                "source_prompt": benchmark.get("source_prompt"),
                "accepted_references_normalized": references,
                "selected_closest_reference": selected,
                "prediction_normalized": output,
                "accepted_exact": output in references,
                "codepoint_cer": codepoint_cer,
                "grapheme_cer": grapheme_cer,
                "reference_token_count": selected_tokens,
                "prediction_token_count": output_tokens,
                "signed_target_token_count_delta": output_tokens - selected_tokens,
                "absolute_target_token_count_delta": abs(
                    output_tokens - selected_tokens
                ),
                "reference_grapheme_count": selected_graphemes,
                "prediction_grapheme_count": output_graphemes,
                "grapheme_length_ratio": output_graphemes / max(1, selected_graphemes),
                "reference_terminal_punctuation": reference_terminal,
                "prediction_terminal_punctuation": output_terminal,
                "terminal_punctuation_preserved": reference_terminal == output_terminal,
                "failure_flags": flags,
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return analyzed


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        raise AnalysisError("fixed-utterance analysis requires at least one row")
    exact = sum(bool(row["accepted_exact"]) for row in rows)
    codepoint = [float(row["codepoint_cer"]) for row in rows]
    grapheme = [float(row["grapheme_cer"]) for row in rows]
    length_ratios = [float(row["grapheme_length_ratio"]) for row in rows]
    token_deltas = [int(row["signed_target_token_count_delta"]) for row in rows]
    required_terminal = [row for row in rows if row["reference_terminal_punctuation"]]
    no_terminal = [row for row in rows if not row["reference_terminal_punctuation"]]
    source_clusters = {str(row["source_cluster_id"]) for row in rows}
    speakers = {str(row["speaker_source"]) for row in rows}
    return {
        "schema_version": 1,
        "analysis_kind": "fixed_utterance_pretraining_surface_reconstruction",
        "rows": len(rows),
        "source_clusters": len(source_clusters),
        "speakers": len(speakers),
        "accepted_exact_count": exact,
        "accepted_exact_percent": 100 * exact / len(rows),
        "blank_outputs": sum("blank_output" in row["failure_flags"] for row in rows),
        "source_copy_outputs": sum(
            "source_copy" in row["failure_flags"] for row in rows
        ),
        "whole_utterance_mismatch_outputs": sum(
            "whole_utterance_mismatch" in row["failure_flags"] for row in rows
        ),
        "codepoint_cer": {
            "mean": statistics.fmean(codepoint),
            "median": percentile(codepoint, 0.5),
            "p90": percentile(codepoint, 0.9),
        },
        "grapheme_cer": {
            "mean": statistics.fmean(grapheme),
            "median": percentile(grapheme, 0.5),
            "p90": percentile(grapheme, 0.9),
        },
        "grapheme_length_ratio": {
            "mean": statistics.fmean(length_ratios),
            "median": percentile(length_ratios, 0.5),
            "minimum": min(length_ratios),
            "maximum": max(length_ratios),
        },
        "target_token_count_delta": {
            "mean_signed": statistics.fmean(token_deltas),
            "mean_absolute": statistics.fmean(abs(value) for value in token_deltas),
            "fewer_token_rows": sum(value < 0 for value in token_deltas),
            "equal_token_rows": sum(value == 0 for value in token_deltas),
            "more_token_rows": sum(value > 0 for value in token_deltas),
        },
        "terminal_punctuation": {
            "required_rows": len(required_terminal),
            "required_preserved_rows": sum(
                bool(row["terminal_punctuation_preserved"]) for row in required_terminal
            ),
            "no_terminal_reference_rows": len(no_terminal),
            "spurious_terminal_punctuation_rows": sum(
                bool(row["prediction_terminal_punctuation"]) for row in no_terminal
            ),
            "all_row_agreement_count": sum(
                bool(row["terminal_punctuation_preserved"]) for row in rows
            ),
        },
        "claim_limit": CLAIM_LIMIT,
        "sentence_translation_authorized": False,
        "model_output_is_linguistic_evidence": False,
    }


def failure_report(rows: list[dict[str, Any]]) -> dict[str, Any]:
    flag_counts = Counter(flag for row in rows for flag in row["failure_flags"])
    by_reference_tokens: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_reference_tokens[str(row["reference_token_count"])].append(row)
    return {
        "schema_version": 1,
        "failure_flag_counts": dict(sorted(flag_counts.items())),
        "reference_token_count_slices": {
            key: {
                "rows": len(group),
                "accepted_exact_count": sum(
                    bool(row["accepted_exact"]) for row in group
                ),
                "mean_grapheme_cer": statistics.fmean(
                    float(row["grapheme_cer"]) for row in group
                ),
                "mean_signed_target_token_count_delta": statistics.fmean(
                    int(row["signed_target_token_count_delta"]) for row in group
                ),
            }
            for key, group in sorted(
                by_reference_tokens.items(), key=lambda item: int(item[0])
            )
        },
        "failed_row_ids": [row["id"] for row in rows if not row["accepted_exact"]],
        "interpretation": (
            "These are structural surface diagnostics only. Qualitative linguistic error "
            "analysis requires independent source evidence and qualified review."
        ),
        "claim_limit": CLAIM_LIMIT,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-benchmark-sha256", required=True)
    parser.add_argument("--expected-predictions-sha256", required=True)
    parser.add_argument("--expected-rows", type=int, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if sha256(args.benchmark) != args.expected_benchmark_sha256:
        raise AnalysisError("benchmark SHA-256 mismatch")
    if sha256(args.predictions) != args.expected_predictions_sha256:
        raise AnalysisError("predictions SHA-256 mismatch")
    benchmark_rows = read_jsonl(args.benchmark)
    prediction_rows = read_jsonl(args.predictions)
    if len(benchmark_rows) != args.expected_rows:
        raise AnalysisError(
            f"benchmark row count {len(benchmark_rows)} != expected {args.expected_rows}"
        )
    analyzed = analyze_rows(benchmark_rows, prediction_rows)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    row_path = args.output_dir / "sentence-row-analysis.jsonl"
    metric_path = args.output_dir / "sentence-metric-report.json"
    failure_path = args.output_dir / "sentence-failure-report.json"
    write_jsonl_atomic(row_path, analyzed)
    write_json_atomic(metric_path, summarize(analyzed))
    write_json_atomic(failure_path, failure_report(analyzed))
    checksum_path = args.output_dir / "SENTENCE-ANALYSIS-SHA256SUMS"
    if checksum_path.exists():
        raise FileExistsError(f"refusing to overwrite {checksum_path}")
    checksum_path.write_text(
        "".join(
            f"{sha256(path)}  {path.name}\n"
            for path in (row_path, metric_path, failure_path)
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

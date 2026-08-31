from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys

import pytest

from analyze_nllb_fixed_utterance_regression import (
    AnalysisError,
    analyze_rows,
    summarize,
)


def benchmark_row(row_id: str, source: str, reference: str) -> dict[str, object]:
    return {
        "id": row_id,
        "suite_key": "fixed-v1",
        "source_cluster_id": "cluster-1",
        "speaker_source": "Speaker One",
        "source_record_id": f"record-{row_id}",
        "source_prompt": source.removeprefix("<translate> "),
        "input_text": source,
        "accepted_references": [reference],
    }


def prediction_row(row: dict[str, object], prediction: str) -> dict[str, object]:
    references = [str(value).lower() for value in row["accepted_references"]]
    return {
        "id": row["id"],
        "unconditioned_input_text": row["input_text"],
        "accepted_references_normalized": references,
        "prediction": prediction,
    }


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_exact_outputs_have_perfect_structural_metrics() -> None:
    benchmark = [
        benchmark_row("a", "<translate> hello", "nyinda barndi?"),
        benchmark_row("b", "<translate> let's go", "ngali yanma!"),
    ]
    predictions = [
        prediction_row(row, str(row["accepted_references"][0])) for row in benchmark
    ]
    report = summarize(analyze_rows(benchmark, predictions))
    assert report["accepted_exact_count"] == 2
    assert report["grapheme_cer"]["mean"] == 0
    assert report["target_token_count_delta"]["equal_token_rows"] == 2
    assert report["terminal_punctuation"]["required_preserved_rows"] == 2
    assert report["sentence_translation_authorized"] is False


def test_reports_token_and_terminal_punctuation_drift() -> None:
    benchmark = [benchmark_row("a", "<translate> hello", "nyinda barndi?")]
    analyzed = analyze_rows(benchmark, [prediction_row(benchmark[0], "nyinda")])
    row = analyzed[0]
    assert row["signed_target_token_count_delta"] == -1
    assert row["terminal_punctuation_preserved"] is False
    assert row["failure_flags"] == [
        "fewer_surface_tokens_than_reference",
        "terminal_punctuation_mismatch",
        "whole_utterance_mismatch",
    ]


def test_rejects_prediction_order_mismatch() -> None:
    benchmark = [benchmark_row("a", "<translate> hello", "nyinda barndi?")]
    prediction = prediction_row(benchmark[0], "nyinda barndi?")
    prediction["id"] = "wrong"
    with pytest.raises(AnalysisError, match="order/id mismatch"):
        analyze_rows(benchmark, [prediction])


def test_rejects_prediction_reference_drift() -> None:
    benchmark = [benchmark_row("a", "<translate> hello", "nyinda barndi?")]
    prediction = prediction_row(benchmark[0], "nyinda barndi?")
    prediction["accepted_references_normalized"] = ["different"]
    with pytest.raises(AnalysisError, match="reference mismatch"):
        analyze_rows(benchmark, [prediction])


def test_cli_is_hash_bound_and_deterministic(tmp_path: Path) -> None:
    benchmark = [benchmark_row("a", "<translate> hello", "nyinda barndi?")]
    predictions = [prediction_row(benchmark[0], "nyinda")]
    benchmark_path = tmp_path / "benchmark.jsonl"
    predictions_path = tmp_path / "predictions.jsonl"
    write_jsonl(benchmark_path, benchmark)
    write_jsonl(predictions_path, predictions)
    script = Path(__file__).with_name("analyze_nllb_fixed_utterance_regression.py")

    outputs = []
    for name in ("first", "second"):
        output = tmp_path / name
        subprocess.run(
            [
                sys.executable,
                str(script),
                "--benchmark",
                str(benchmark_path),
                "--predictions",
                str(predictions_path),
                "--output-dir",
                str(output),
                "--expected-benchmark-sha256",
                digest(benchmark_path),
                "--expected-predictions-sha256",
                digest(predictions_path),
                "--expected-rows",
                "1",
            ],
            check=True,
        )
        outputs.append(output)

    for filename in (
        "sentence-row-analysis.jsonl",
        "sentence-metric-report.json",
        "sentence-failure-report.json",
        "SENTENCE-ANALYSIS-SHA256SUMS",
    ):
        assert (outputs[0] / filename).read_bytes() == (
            outputs[1] / filename
        ).read_bytes()


def test_cli_rejects_hash_mismatch(tmp_path: Path) -> None:
    benchmark_path = tmp_path / "benchmark.jsonl"
    predictions_path = tmp_path / "predictions.jsonl"
    row = benchmark_row("a", "<translate> hello", "nyinda barndi?")
    write_jsonl(benchmark_path, [row])
    write_jsonl(predictions_path, [prediction_row(row, "nyinda barndi?")])
    script = Path(__file__).with_name("analyze_nllb_fixed_utterance_regression.py")
    result = subprocess.run(
        [
            sys.executable,
            str(script),
            "--benchmark",
            str(benchmark_path),
            "--predictions",
            str(predictions_path),
            "--output-dir",
            str(tmp_path / "out"),
            "--expected-benchmark-sha256",
            "0" * 64,
            "--expected-predictions-sha256",
            digest(predictions_path),
            "--expected-rows",
            "1",
        ],
        text=True,
        capture_output=True,
    )
    assert result.returncode != 0
    assert "benchmark SHA-256 mismatch" in result.stderr

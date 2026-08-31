from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys

import pytest

from analyze_nllb_50words_pretraining_failures import (
    AnalysisError,
    analyze,
    report,
    review_queue,
)


def benchmark_row(row_id: str, task: str) -> dict[str, object]:
    lexical = task == "lexeme"
    return {
        "id": row_id,
        "suite_key": f"suite-{task}",
        "input_text": f"<{'lexeme' if lexical else 'translate'}> hello",
        "accepted_references": ["nyinda barndi?" if not lexical else "barndi"],
        "source_prompt": "hello",
        "source_cluster_id": "cluster-1",
        "speaker_source": "Speaker One",
        "source_record_id": f"source-{row_id}",
        "source_ordinal": 1,
        "project_training_exposure_at_measurement": "none",
        "post_training_interpretation": "training_reconstruction_only",
        "current_dictionary_relation": "unique_exact_current_headword",
        "current_dictionary_match_ids": ["dictionary-1"],
        "lexical_entry_id": "entry-1",
        "form_id": "form-1",
        "sense_decision_id": "sense-1",
        "synthetic_sentence_eligibility": "blocked_pending_pos_morphology_and_productive_grammar",
        "structural_risk_tags": ["target_question_punctuation"],
        "productive_grammar_status": "not_inferred",
        "morphological_analysis_status": "not_inferred",
    }


def edit_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for index, left_value in enumerate(left, start=1):
        current = [index]
        for other, right_value in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[other] + 1,
                    previous[other - 1] + (left_value != right_value),
                )
            )
        previous = current
    return previous[-1]


def prediction_row(
    benchmark: dict[str, object], output: str, *, target_subwords: int = 2
) -> dict[str, object]:
    reference = str(benchmark["accepted_references"][0])
    cer = edit_distance(output.lower(), reference.lower()) / len(reference)
    return {
        "id": benchmark["id"],
        "unconditioned_input_text": benchmark["input_text"],
        "accepted_references_normalized": [reference.lower()],
        "prediction": output,
        "prediction_normalized": output.lower(),
        "accepted_exact": output.lower() == reference.lower(),
        "codepoint_cer": cer,
        "grapheme_cer": cer,
        "edit_error_type": (
            "accepted_exact"
            if output.lower() == reference.lower()
            else "different_surface_form"
        ),
        "target_subword_count": target_subwords,
        "latency_milliseconds": 10.0,
    }


def test_analyzes_exact_and_failed_rows_without_authorizing_training() -> None:
    lexical = benchmark_row("lexical-1", "lexeme")
    sentence = benchmark_row("sentence-1", "fixed_utterance")
    rows = analyze(
        [lexical],
        [prediction_row(lexical, "wrong", target_subwords=4)],
        [sentence],
        [prediction_row(sentence, "nyinda")],
    )
    assert len(rows) == 2
    assert rows[0]["target_subword_fertility_bucket"] == "4+"
    assert "target_tokenizer_fragmentation_review" in rows[0]["review_actions"]
    assert "terminal_punctuation_mismatch" in rows[1]["failure_labels"]
    assert all(row["training_eligible"] is False for row in rows)
    summary = report(rows)
    assert summary["authorization"]["controlled_synthetic_sentence_pairs"] == 0
    assert summary["authorization"]["model_output_is_linguistic_evidence"] is False


def test_review_queue_contains_only_failures() -> None:
    exact = benchmark_row("lexical-exact", "lexeme")
    failed = benchmark_row("sentence-failed", "fixed_utterance")
    rows = analyze(
        [exact],
        [prediction_row(exact, "barndi")],
        [failed],
        [prediction_row(failed, "wrong")],
    )
    queue = review_queue(rows)
    assert len(queue) == 1
    assert queue[0]["benchmark_row_id"] == "sentence-failed"
    assert queue[0]["synthetic_coverage_cell_status"] == "blocked_review_question_only"


def test_dictionary_relation_changes_review_action() -> None:
    lexical = benchmark_row("lexical-1", "lexeme")
    lexical["current_dictionary_relation"] = "no_exact_current_headword"
    row = analyze(
        [lexical],
        [prediction_row(lexical, "wrong")],
        [],
        [],
    )[0]
    assert "current_dictionary_relation_review" in row["review_actions"]


def test_rejects_prediction_order_drift() -> None:
    lexical = benchmark_row("lexical-1", "lexeme")
    prediction = prediction_row(lexical, "barndi")
    prediction["id"] = "other"
    with pytest.raises(AnalysisError, match="order/id mismatch"):
        analyze([lexical], [prediction], [], [])


def test_rejects_evaluator_metric_drift() -> None:
    lexical = benchmark_row("lexical-1", "lexeme")
    prediction = prediction_row(lexical, "wrong")
    prediction["grapheme_cer"] = 0.0
    with pytest.raises(AnalysisError, match="grapheme_cer drift"):
        analyze([lexical], [prediction], [], [])


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_cli_is_hash_bound_and_deterministic(tmp_path: Path) -> None:
    lexical = benchmark_row("lexical-1", "lexeme")
    sentence = benchmark_row("sentence-1", "fixed_utterance")
    inputs = {
        "lexical-benchmark": [lexical],
        "lexical-predictions": [prediction_row(lexical, "wrong")],
        "sentence-benchmark": [sentence],
        "sentence-predictions": [prediction_row(sentence, "nyinda")],
    }
    paths = {}
    for name, rows in inputs.items():
        path = tmp_path / f"{name}.jsonl"
        write_jsonl(path, rows)
        paths[name] = path
    script = Path(__file__).with_name("analyze_nllb_50words_pretraining_failures.py")
    outputs = []
    for name in ("first", "second"):
        output = tmp_path / name
        subprocess.run(
            [
                sys.executable,
                str(script),
                "--lexical-benchmark",
                str(paths["lexical-benchmark"]),
                "--lexical-predictions",
                str(paths["lexical-predictions"]),
                "--sentence-benchmark",
                str(paths["sentence-benchmark"]),
                "--sentence-predictions",
                str(paths["sentence-predictions"]),
                "--output-dir",
                str(output),
                "--expected-lexical-benchmark-sha256",
                digest(paths["lexical-benchmark"]),
                "--expected-lexical-predictions-sha256",
                digest(paths["lexical-predictions"]),
                "--expected-sentence-benchmark-sha256",
                digest(paths["sentence-benchmark"]),
                "--expected-sentence-predictions-sha256",
                digest(paths["sentence-predictions"]),
                "--expected-lexical-rows",
                "1",
                "--expected-sentence-rows",
                "1",
            ],
            check=True,
        )
        outputs.append(output)
    for filename in (
        "ROWS.jsonl",
        "COVERAGE-REVIEW-QUEUE.jsonl",
        "REPORT.json",
        "INPUT-MANIFEST.json",
        "SHA256SUMS.analysis",
    ):
        assert (outputs[0] / filename).read_bytes() == (
            outputs[1] / filename
        ).read_bytes()


def test_cli_rejects_input_hash_drift(tmp_path: Path) -> None:
    lexical = benchmark_row("lexical-1", "lexeme")
    sentence = benchmark_row("sentence-1", "fixed_utterance")
    paths = {}
    for name, rows in {
        "lexical-benchmark": [lexical],
        "lexical-predictions": [prediction_row(lexical, "barndi")],
        "sentence-benchmark": [sentence],
        "sentence-predictions": [prediction_row(sentence, "nyinda barndi?")],
    }.items():
        path = tmp_path / f"{name}.jsonl"
        write_jsonl(path, rows)
        paths[name] = path
    script = Path(__file__).with_name("analyze_nllb_50words_pretraining_failures.py")
    result = subprocess.run(
        [
            sys.executable,
            str(script),
            "--lexical-benchmark",
            str(paths["lexical-benchmark"]),
            "--lexical-predictions",
            str(paths["lexical-predictions"]),
            "--sentence-benchmark",
            str(paths["sentence-benchmark"]),
            "--sentence-predictions",
            str(paths["sentence-predictions"]),
            "--output-dir",
            str(tmp_path / "out"),
            "--expected-lexical-benchmark-sha256",
            "0" * 64,
            "--expected-lexical-predictions-sha256",
            digest(paths["lexical-predictions"]),
            "--expected-sentence-benchmark-sha256",
            digest(paths["sentence-benchmark"]),
            "--expected-sentence-predictions-sha256",
            digest(paths["sentence-predictions"]),
            "--expected-lexical-rows",
            "1",
            "--expected-sentence-rows",
            "1",
        ],
        text=True,
        capture_output=True,
    )
    assert result.returncode != 0
    assert "lexical benchmark SHA-256 mismatch" in result.stderr

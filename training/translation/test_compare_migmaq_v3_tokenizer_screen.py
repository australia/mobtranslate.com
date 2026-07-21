import json
from pathlib import Path

import pytest

from compare_migmaq_v3_tokenizer_screen import (
    build_exposure_features,
    exact_transition,
    materialize_presented_rows,
    paired_sentence_analysis,
    sign_test_two_sided,
    subsequence_count,
    validate_prediction_alignment,
    word_tokens,
)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def test_whole_word_tokenization_and_subsequence_count() -> None:
    assert word_tokens("Gatu'l, mi'kmaq-word!") == ["gatu'l", "mi'kmaq-word"]
    assert subsequence_count(["a", "b", "a", "b"], ["a", "b"]) == 2
    assert subsequence_count(["womanhood"], ["woman"]) == 0


def test_materialize_presented_rows_joins_schedule_ids_to_sources(tmp_path: Path) -> None:
    schedule = tmp_path / "schedule.jsonl"
    exposure = tmp_path / "exposure.jsonl"
    write_jsonl(
        schedule,
        [
            {
                "id": "source-a:task-lexeme:schedule-1",
                "schedule_source_id": "source-a:task-lexeme",
                "task": "lexeme",
                "pair_kind": "lexical",
                "input_text": "<lexeme> a",
                "output_text": "alpha",
            },
            {
                "id": "source-b:task-translate:schedule-2",
                "schedule_source_id": "source-b:task-translate",
                "task": "translate",
                "pair_kind": "sentence",
                "input_text": "<translate> b",
                "output_text": "beta alpha",
            },
        ],
    )
    write_jsonl(
        exposure,
        [
            {"id": "source-a:task-lexeme:schedule-1", "presentations": 2},
            {"id": "source-b:task-translate:schedule-2", "presentations": 1},
        ],
    )
    rows, audit = materialize_presented_rows(schedule, exposure)
    assert len(rows) == 3
    assert audit["canonical_source_presentations"] == {"source-a": 2, "source-b:task-translate": 1}
    assert audit["task_presentations"] == {"lexeme": 2, "translate": 1}


def test_exposure_features_separate_direct_and_sentence_occurrence() -> None:
    benchmark = {
        "source-a": {
            "id": "source-a:task-lexeme",
            "input_text": "<lexeme> alpha",
            "unconditioned_input_text": "alpha",
            "accepted_references": ["gatu'l"],
        },
        "source-b": {
            "id": "source-b:task-lexeme",
            "input_text": "<lexeme> beta",
            "unconditioned_input_text": "beta",
            "accepted_references": ["other"],
        },
    }
    presented = [
        {"task": "lexeme", "input_text": "<lexeme> alpha", "output_text": "gatu'l"},
        {"task": "translate", "input_text": "sentence", "output_text": "I see gatu'l."},
    ]
    features, _ = build_exposure_features(
        benchmark,
        {"source-a"},
        presented,
        {"source-a": 1},
    )
    assert features["source-a"]["direct_pair_presentations"] == 1
    assert features["source-a"]["target_phrase_occurrences_all_tasks"] == 2
    assert features["source-a"]["target_phrase_occurrences_sentence_tasks"] == 1
    assert features["source-b"]["target_phrase_occurrences_all_tasks"] == 0


def test_prediction_alignment_rejects_source_drift(tmp_path: Path) -> None:
    predictions = tmp_path / "predictions.jsonl"
    write_jsonl(
        predictions,
        [
            {
                "id": "row:task-lexeme",
                "input_normalized": "<lexeme> wrong",
                "accepted_references": ["target"],
            }
        ],
    )
    benchmark = {
        "row": {
            "id": "row:task-lexeme",
            "input_text": "<lexeme> right",
            "accepted_references": ["target"],
        }
    }
    with pytest.raises(ValueError, match="input mismatch"):
        validate_prediction_alignment(predictions, benchmark)


def test_paired_sentence_analysis_requires_order_and_computes_direction(tmp_path: Path) -> None:
    base = tmp_path / "base.json"
    candidate = tmp_path / "candidate.json"
    metrics = {
        "rows": 1,
        "num_beams": 1,
        "max_new_tokens": 10,
        "no_repeat_ngram_size": 0,
        "repetition_penalty": 1.0,
        "length_penalty": 1.0,
        "do_sample": False,
        "seed": 42,
        "chrf": 10.0,
        "bleu": 1.0,
        "mean_prediction_characters": 3.0,
    }
    row = {
        "id": "sentence-1",
        "input_text": "<translate> hello",
        "unconditioned_input_text": "hello",
        "reference": "abcd",
        "prediction": "ab",
    }
    base.write_text(json.dumps({"metrics": metrics, "predictions": [row]}), encoding="utf-8")
    candidate_metrics = {**metrics, "chrf": 12.0, "mean_prediction_characters": 4.0}
    candidate_row = {**row, "prediction": "abcd"}
    candidate.write_text(
        json.dumps({"metrics": candidate_metrics, "predictions": [candidate_row]}),
        encoding="utf-8",
    )
    report, rows = paired_sentence_analysis(base, candidate)
    assert report["corpus_metric_delta_candidate_minus_base"]["chrf"] == 2.0
    assert report["cer_improved_rows"] == 1
    assert report["sentence_chrf_improved_rows"] == 1
    assert rows[0]["grapheme_cer_delta_candidate_minus_base"] < 0


def test_exact_transition_and_sign_test() -> None:
    assert exact_transition(False, True) == "gain"
    assert exact_transition(True, False) == "loss"
    assert sign_test_two_sided(0, 4) == 0.125
    assert sign_test_two_sided(2, 2) == 1.0

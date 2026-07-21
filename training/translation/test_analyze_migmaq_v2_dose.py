from __future__ import annotations

from analyze_migmaq_v2_dose import (
    evaluate_continue_rule,
    lexicon_membership_metrics,
    load_exposure,
    prompt_audit,
    rescore_predictions,
)


def test_rescore_uses_corrected_running_text_reference(tmp_path) -> None:
    predictions = tmp_path / "predictions.jsonl"
    predictions.write_text(
        '{"id":"row:task-lexeme","prediction":"ta\'n goqwei"}\n',
        encoding="utf-8",
    )
    benchmark = {
        "row": {
            "id": "row:task-lexeme",
            "input_text": "<lexeme> what it is <pos> pronoun",
            "accepted_references": ["ta'n goqwei"],
            "source_accepted_references": ["ta'n_goqwei"],
        }
    }
    scored = rescore_predictions(predictions, benchmark)
    assert scored["row"]["accepted_exact"] is True
    assert scored["row"]["grapheme_cer"] == 0


def test_exposure_ledger_canonicalizes_task_suffix(tmp_path) -> None:
    ledger = tmp_path / "exposure.jsonl"
    ledger.write_text(
        '{"id":"row-a:task-lexeme","presentations":4}\n'
        '{"id":"sentence-a:task-translate","presentations":5}\n',
        encoding="utf-8",
    )
    assert load_exposure(ledger) == {"row-a": 4, "sentence-a:task-translate": 5}


def test_continue_rule_requires_every_condition() -> None:
    rule = {
        "continue_to_higher_dose_rule": {
            "direct_pool_exact_minimum": 2,
            "direct_pool_exact_rate_minimum": 0.5,
            "mean_grapheme_cer_maximum": 0.75,
            "unique_normalized_outputs_minimum": 3,
            "max_single_output_frequency_maximum": 2,
            "validation_chrf_minimum": 20,
            "opened_regression_chrf_minimum": 20,
            "blank_outputs_maximum": 0,
        }
    }
    steps600 = {"overall": {"accepted_exact_count": 1}}
    candidate = {
        "overall": {
            "accepted_exact_count": 3,
            "mean_grapheme_cer": 0.5,
            "unique_normalized_outputs": 3,
            "maximum_normalized_output_frequency": 2,
            "blank_outputs": 0,
        },
        "cohort": {
            "direct_pair_training_pool": {
                "accepted_exact_count": 2,
                "accepted_exact_rate": 0.5,
            }
        },
    }
    sentence = {"validation": {"chrf": 21}, "opened_regression": {"chrf": 21}}
    assert evaluate_continue_rule(rule, steps600, candidate, sentence)["passed"] is True
    sentence["opened_regression"]["chrf"] = 19
    assert evaluate_continue_rule(rule, steps600, candidate, sentence)["passed"] is False


def test_prompt_audit_finds_conflicting_identical_inputs() -> None:
    benchmark = {
        "a": {"input_text": "<lexeme> bank <pos> noun", "accepted_references": ["one"]},
        "b": {"input_text": "<lexeme> bank <pos> noun", "accepted_references": ["two"]},
        "c": {"input_text": "<lexeme> tree <pos> noun", "accepted_references": ["three"]},
    }
    result = prompt_audit(benchmark)["exact_model_visible_surface"]
    assert result["duplicate_prompt_groups"] == 1
    assert result["conflicting_prompt_groups"] == 1
    assert result["deterministic_oracle_exact_ceiling"] == 2


def test_lexicon_membership_separates_wrong_same_pos_forms() -> None:
    rows = [
        {
            "part_of_speech": "noun",
            "accepted_references_normalized": ["tree"],
            "prediction_normalized": "stone",
            "accepted_exact": False,
        },
        {
            "part_of_speech": "noun",
            "accepted_references_normalized": ["stone"],
            "prediction_normalized": "stone",
            "accepted_exact": True,
        },
        {
            "part_of_speech": "verb",
            "accepted_references_normalized": ["runs"],
            "prediction_normalized": "novel",
            "accepted_exact": False,
        },
    ]
    result = lexicon_membership_metrics(rows)
    assert result["exact_target"] == 1
    assert result["any_dictionary_form"] == 2
    assert result["wrong_dictionary_form"] == 1
    assert result["wrong_same_pos_dictionary_form"] == 1
    assert result["not_any_dictionary_form"] == 1

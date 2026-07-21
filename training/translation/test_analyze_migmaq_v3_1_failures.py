from __future__ import annotations

import pytest

try:
    from .analyze_migmaq_v3_1_failures import (
        audit_lexical_schedule,
        glossary_matrix,
        remove_hint_sequences,
        summarize_glossary_arm,
    )
except ImportError:
    from analyze_migmaq_v3_1_failures import (
        audit_lexical_schedule,
        glossary_matrix,
        remove_hint_sequences,
        summarize_glossary_arm,
    )


def test_remove_hint_sequences_is_whole_word_and_longest_first() -> None:
    assert remove_hint_sequences("Lagga'p wajuwaq apigji'jg.", ["lagga'p", "lag"]) == [
        "wajuwaq",
        "apigji'jg",
    ]


def test_audit_lexical_schedule_verifies_prompt_and_target() -> None:
    benchmark = {
        "mic-row": {
            "id": "mic-row:task-lexeme",
            "input_text": "<lexeme> woman <pos> noun animate",
            "accepted_references": ["e'pit"],
        }
    }
    schedule = [
        {
            "id": "schedule-row",
            "schedule_source_id": "mic-row:task-lexeme",
            "task": "lexeme",
            "input_text": "<lexeme> woman <pos> noun animate",
            "output_text": "e'pit",
            "schedule_presentation_index": 1,
        }
    ]
    report, direct = audit_lexical_schedule(benchmark, schedule, expected_direct_rows=1)
    assert report["all_targets_are_accepted_benchmark_references"] is True
    assert set(direct) == {"mic-row"}


def test_audit_lexical_schedule_rejects_wrong_target() -> None:
    benchmark = {
        "mic-row": {
            "input_text": "<lexeme> woman <pos> noun animate",
            "accepted_references": ["e'pit"],
        }
    }
    schedule = [
        {
            "schedule_source_id": "mic-row:task-lexeme",
            "task": "lexeme",
            "input_text": "<lexeme> woman <pos> noun animate",
            "output_text": "wrong",
        }
    ]
    with pytest.raises(ValueError, match="does not reproduce"):
        audit_lexical_schedule(benchmark, schedule, expected_direct_rows=1)


def test_masked_glossary_separates_copying_from_residual_quality() -> None:
    evaluation = {
        "row": {
            "id": "row",
            "unconditioned_input_text": "The woman returned home.",
            "output_text": "E'pit apaja'sit wiguaq.",
            "glossary_pairs": [{"migmaq_headword": "e'pit"}],
        }
    }
    control = {
        "row": {
            "id": "row",
            "reference": "E'pit apaja'sit wiguaq.",
            "conditioned_prediction": "E'pit",
            "unconditioned_prediction": "Nmu'ltis",
            "conditioned_all_hints_present": True,
            "unconditioned_all_hints_present": False,
        }
    }
    glossary = {
        "row": {
            "id": "row",
            "reference": "E'pit apaja'sit wiguaq.",
            "conditioned_prediction": "E'pit apaja'sit wiguaq.",
            "unconditioned_prediction": "Nmu'ltis",
            "conditioned_all_hints_present": True,
            "unconditioned_all_hints_present": False,
        }
    }
    rows = glossary_matrix(evaluation, control, glossary)
    assert rows[0]["control"]["conditioned_residual"] == ""
    assert rows[0]["glossary"]["conditioned_residual"] == "apaja'sit wiguaq"
    control_summary = summarize_glossary_arm(rows, "control")
    glossary_summary = summarize_glossary_arm(rows, "glossary")
    assert control_summary["conditioned_residual_chrf"] == 0.0
    assert glossary_summary["conditioned_residual_chrf"] == 100.0
    assert (
        glossary_summary["conditioned_chrf"]
        > glossary_summary["hint_only_baseline_chrf"]
    )

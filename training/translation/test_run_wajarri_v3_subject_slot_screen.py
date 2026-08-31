from copy import deepcopy

import pytest

from training.translation.run_wajarri_v3_subject_slot_screen import (
    choose_checkpoint,
    development_gates,
    full_regression_gates,
    scoped_mechanical_fault_count,
    verify_subject_slot_rows,
)


def endpoint(rows: int, *, ordinary: int = 0, slot: int = 0) -> dict:
    return {
        "rows": rows,
        "ordinary_exact": ordinary,
        "slot_rendered_exact": slot,
        "slot_count_valid": rows if slot else 0,
        "slot_position_valid": rows if slot else 0,
        "predicate_present": rows,
        "mean_chrf2": 100.0,
        "faults": {
            "blank": 0,
            "source_copy": 0,
            "repeated_token_4gram": 0,
            "unresolved_bracket": 0,
            "unresolved_slot": 0,
        },
    }


def summary(slot_composition: int, slot_held: int) -> dict:
    return {
        "metrics": {
            "faults": {
                "blank": 0,
                "source_copy": 0,
                "repeated_token_4gram": 0,
                "unresolved_bracket": 0,
                "unresolved_slot": 0,
            },
            "by_endpoint": {
                "composition_plain": endpoint(11, ordinary=9),
                "composition_inline": endpoint(11, ordinary=11),
                "held_lexeme_plain": endpoint(24, ordinary=21),
                "held_lexeme_inline": endpoint(24, ordinary=22),
                "slot_composition_masked": endpoint(11, slot=slot_composition),
                "slot_held_masked": endpoint(24, slot=slot_held),
                "slot_composition_declared": endpoint(11, slot=3),
                "slot_held_declared": endpoint(24, slot=4),
            },
        },
        "batch_invariance": {"all_outputs_identical": True},
    }


GATES = {
    "minimum_matched_slot_composition_exact": 11,
    "minimum_matched_slot_held_exact": 24,
    "minimum_composition_plain_exact": 9,
    "minimum_held_inline_exact": 22,
}


def test_checkpoint_selection_prefers_complete_matched_slot_behavior() -> None:
    candidates = [
        {"step": 20, "development": summary(10, 24)},
        {"step": 40, "development": summary(11, 24)},
        {"step": 60, "development": summary(11, 24)},
    ]
    assert choose_checkpoint(candidates, "M8", GATES)["step"] == 40


def test_development_gate_keeps_batch_invariance_independent() -> None:
    gates = development_gates(
        summary(11, 24),
        "M8",
        GATES,
        {"all_outputs_identical": False},
        {"retention": True},
    )
    assert gates["matched_slot_composition_exact"] is True
    assert gates["batch_1_16_outputs_identical"] is False
    assert gates["retention"] is True


def test_cross_representation_faults_do_not_select_the_arm_checkpoint() -> None:
    value = summary(11, 24)
    value["metrics"]["by_endpoint"]["slot_composition_declared"]["faults"] = {
        "unresolved_slot": 11
    }
    assert scoped_mechanical_fault_count(value, "M8") == 0


def test_full_retention_improvement_passes_noninferiority() -> None:
    baseline = {
        "suites": {
            "retention": {"exact": 54, "faults": {}},
            "synthetic_holdout": {"exact": 23, "mean_chrf2": 75.0, "faults": {}},
            "historical_holdout": {"faults": {}},
        }
    }
    candidate = deepcopy(baseline)
    candidate["suites"]["retention"]["exact"] = 55
    result = full_regression_gates(
        candidate,
        baseline,
        {
            "deployment_zero_fault_suites": [
                "historical_holdout",
                "retention",
                "synthetic_holdout",
            ],
            "maximum_synthetic_chrf2_loss": 2.0,
            "maximum_synthetic_exact_count_loss": 2,
        },
    )
    assert result["fixed_utterance_retention_noninferiority"] is True


def test_schedule_verifier_rejects_slot_in_non_slot_target() -> None:
    rows = [
        {
            "id": "slot",
            "schedule_population": "subject_slot",
            "input_text": "<translate> The <copy> is running.",
            "output_text": "<copy> jamarnimanha.",
        },
        {
            "id": "ordinary",
            "schedule_population": "retention",
            "input_text": "<translate> The crow is running.",
            "output_text": "gagu jamarnimanha.",
        },
    ]
    verify_subject_slot_rows(rows, "M8")
    broken = deepcopy(rows)
    broken[1]["output_text"] = "<copy> jamarnimanha."
    with pytest.raises(ValueError, match="non-slot target"):
        verify_subject_slot_rows(broken, "M8")

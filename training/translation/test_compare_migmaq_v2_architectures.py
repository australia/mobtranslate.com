from compare_migmaq_v2_architectures import (
    exact_binomial_two_sided,
    exact_transition,
    evaluate_success_rule,
)


def test_exact_transition_labels() -> None:
    assert exact_transition(False, False) == "stable_failure"
    assert exact_transition(False, True) == "gain"
    assert exact_transition(True, False) == "loss"
    assert exact_transition(True, True) == "stable_exact"


def test_exact_sign_test_is_symmetric() -> None:
    assert exact_binomial_two_sided(0, 4) == 0.125
    assert exact_binomial_two_sided(4, 4) == 0.125
    assert exact_binomial_two_sided(2, 4) == 1.0


def test_architecture_success_requires_every_gate() -> None:
    contract = {
        "success_rule": {
            "direct_pool_exact_minimum": 2,
            "direct_pool_exact_rate_minimum": 0.5,
            "full_lexical_exact_must_exceed": 2,
            "mean_grapheme_cer_maximum": 0.75,
            "unique_normalized_outputs_minimum": 3,
            "max_single_output_frequency_maximum": 5,
            "validation_chrf_minimum": 20,
            "opened_regression_chrf_minimum": 20,
            "blank_outputs_maximum": 0,
            "token_preflight_must_pass": True,
        },
        "failure_action": "change architecture",
        "promotion_rule": "none",
    }
    candidate = {
        "overall": {
            "accepted_exact_count": 3,
            "mean_grapheme_cer": 0.7,
            "unique_normalized_outputs": 3,
            "maximum_normalized_output_frequency": 5,
            "blank_outputs": 0,
        },
        "cohort": {
            "direct_pair_training_pool": {
                "accepted_exact_count": 2,
                "accepted_exact_rate": 0.5,
            }
        },
    }
    sentence = {"validation": {"chrf": 20}, "opened_regression": {"chrf": 20}}
    assert evaluate_success_rule(contract, candidate, sentence, {"passed": True})["passed"]
    candidate["overall"]["accepted_exact_count"] = 2
    assert not evaluate_success_rule(contract, candidate, sentence, {"passed": True})["passed"]

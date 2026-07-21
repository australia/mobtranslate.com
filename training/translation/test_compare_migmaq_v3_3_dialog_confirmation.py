from __future__ import annotations

from copy import deepcopy

from compare_migmaq_v3_3_dialog_confirmation import (
    SEEDS,
    confirmation_decision,
    hierarchical_paired_chrf_bootstrap,
)


def _metrics() -> dict:
    result = {}
    for seed in SEEDS:
        result[seed] = {}
        for arm, offset in (("retention", 0.0), ("dialog40", 2.0)):
            result[seed][arm] = {}
            for endpoint, score in (
                ("existing-validation", 20.0),
                ("existing-opened-regression", 21.0),
                ("lesson-validation-all", 18.0),
                ("lesson-validation-dialog", 19.0),
            ):
                result[seed][arm][endpoint] = {
                    "rows": 43 if endpoint == "lesson-validation-dialog" else 100,
                    "chrf": score
                    + (offset if endpoint == "lesson-validation-dialog" else 0.0),
                    "empty_outputs": 0,
                    "severe_undertranslation_rows": 4,
                }
    return result


def test_hierarchical_bootstrap_is_deterministic_and_positive() -> None:
    rows = {
        seed: [
            {
                "id": f"{seed}-{index}",
                "input_text": "hello",
                "reference": "welalin",
                "retention": "abc",
                "dialog40": "welalin",
            }
            for index in range(8)
        ]
        for seed in SEEDS
    }
    first = hierarchical_paired_chrf_bootstrap(rows, samples=100, seed=9)
    second = hierarchical_paired_chrf_bootstrap(rows, samples=100, seed=9)
    assert first == second
    assert first["percentile_90_interval"]["low"] > 0


def test_confirmation_decision_requires_every_seed_to_improve() -> None:
    bootstrap = {"percentile_90_interval": {"low": 0.5, "high": 3.0}}
    passing = confirmation_decision(_metrics(), 18.0, bootstrap)
    assert passing["passed"] is True
    assert passing["sealed_test_authorized"] is True
    assert passing["publication_or_deployment_authorized"] is False

    failing_metrics = deepcopy(_metrics())
    failing_metrics[73]["dialog40"]["lesson-validation-dialog"]["chrf"] = 18.5
    failing = confirmation_decision(failing_metrics, 18.0, bootstrap)
    assert failing["passed"] is False
    assert failing["conditions"]["dialog_delta_positive_every_seed"]["pass"] is False

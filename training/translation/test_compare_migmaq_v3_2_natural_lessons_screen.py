from __future__ import annotations

import unittest

from compare_migmaq_v3_2_natural_lessons_screen import (
    candidate_decision,
    sentence_diagnostics,
)


def endpoint(chrf: float, *, under: int = 0, rows: int = 100) -> dict[str, object]:
    return {
        "chrf": chrf,
        "empty_outputs": 0,
        "severe_undertranslation_rows": under,
        "rows": rows,
    }


class NaturalLessonComparisonTests(unittest.TestCase):
    def test_sentence_diagnostics_counts_degeneration(self) -> None:
        payload = {
            "metrics": {"rows": 3, "chrf": 10.0, "empty_outputs": 1},
            "predictions": [
                {"input_text": "one", "reference": "abcdef", "prediction": "a"},
                {"input_text": "two", "reference": "a", "prediction": "abcdef"},
                {"input_text": "three", "reference": "same", "prediction": "same"},
            ],
        }
        observed = sentence_diagnostics(payload)
        self.assertEqual(observed["severe_undertranslation_rows"], 1)
        self.assertEqual(observed["severe_overtranslation_rows"], 1)
        self.assertEqual(observed["normalized_exact_rows"], 1)
        self.assertEqual(observed["unique_normalized_outputs"], 3)

    def test_decision_selects_best_passing_lesson_arm(self) -> None:
        metrics = {
            "base": {
                "existing-validation": endpoint(20),
                "existing-opened-regression": endpoint(20),
                "lesson-validation-sentences": endpoint(10),
            },
            "retention": {
                "existing-validation": endpoint(21),
                "existing-opened-regression": endpoint(21),
                "lesson-validation-sentences": endpoint(10.5),
            },
            "lessons20": {
                "existing-validation": endpoint(20.9),
                "existing-opened-regression": endpoint(20.9),
                "lesson-validation-sentences": endpoint(12),
            },
            "lessons40": {
                "existing-validation": endpoint(20.8),
                "existing-opened-regression": endpoint(20.8),
                "lesson-validation-sentences": endpoint(13),
            },
        }
        bootstraps = {
            "lessons20": {"percentile_90_interval": {"low": 0.1}},
            "lessons40": {"percentile_90_interval": {"low": 0.2}},
        }
        decision = candidate_decision(metrics, bootstraps)
        self.assertEqual(decision["selected_recipe"], "lessons40")
        self.assertTrue(decision["continue_to_multiseed_confirmation"])
        self.assertFalse(decision["publication_or_deployment_authorized"])

    def test_decision_rejects_noninferior_failure(self) -> None:
        metrics = {
            "base": {
                "existing-validation": endpoint(20),
                "existing-opened-regression": endpoint(20),
                "lesson-validation-sentences": endpoint(10),
            },
            "retention": {
                "existing-validation": endpoint(21),
                "existing-opened-regression": endpoint(21),
                "lesson-validation-sentences": endpoint(10),
            },
            "lessons20": {
                "existing-validation": endpoint(20.0),
                "existing-opened-regression": endpoint(21),
                "lesson-validation-sentences": endpoint(12),
            },
            "lessons40": {
                "existing-validation": endpoint(20.0),
                "existing-opened-regression": endpoint(21),
                "lesson-validation-sentences": endpoint(12),
            },
        }
        bootstraps = {
            "lessons20": {"percentile_90_interval": {"low": 0.1}},
            "lessons40": {"percentile_90_interval": {"low": 0.1}},
        }
        decision = candidate_decision(metrics, bootstraps)
        self.assertIsNone(decision["selected_recipe"])


if __name__ == "__main__":
    unittest.main()

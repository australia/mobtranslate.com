from __future__ import annotations

import unittest

from compare_migmaq_v3_3_dialog_screen import (
    candidate_decision,
    score_sentence_rows,
    subset_payload,
)


def endpoint(chrf: float, *, under: int = 0, rows: int = 100) -> dict[str, object]:
    return {
        "chrf": chrf,
        "empty_outputs": 0,
        "severe_undertranslation_rows": under,
        "rows": rows,
    }


def arm_metrics(
    existing: float,
    opened: float,
    dialog: float,
    *,
    dialog_under: int = 0,
) -> dict[str, dict[str, object]]:
    return {
        "existing-validation": endpoint(existing),
        "existing-opened-regression": endpoint(opened),
        "lesson-validation-all": endpoint(dialog),
        "lesson-validation-dialog": endpoint(dialog, under=dialog_under),
    }


class DialogComparisonTests(unittest.TestCase):
    def test_subset_payload_preserves_requested_order_and_rescores(self) -> None:
        payload = {
            "metrics": {
                "direction": "eng-mic",
                "source_lang": "eng_Latn",
                "target_lang": "mic_Latn",
            },
            "predictions": [
                {
                    "id": "b",
                    "input_text": "two",
                    "reference": "elu",
                    "prediction": "elu",
                },
                {
                    "id": "a",
                    "input_text": "one",
                    "reference": "newt",
                    "prediction": "wrong",
                },
            ],
        }
        observed = subset_payload(payload, ["a", "b"])
        self.assertEqual([row["id"] for row in observed["predictions"]], ["a", "b"])
        self.assertEqual(observed["metrics"]["rows"], 2)
        self.assertEqual(observed["metrics"]["normalized_exact_rows"], 1)

    def test_score_sentence_rows_counts_undertranslation(self) -> None:
        rows = [
            {"id": "a", "input_text": "one", "reference": "abcdef", "prediction": "a"},
            {"id": "b", "input_text": "two", "reference": "same", "prediction": "same"},
        ]
        observed = score_sentence_rows(rows, {})
        self.assertEqual(observed["severe_undertranslation_rows"], 1)
        self.assertEqual(observed["normalized_exact_rows"], 1)

    def test_decision_selects_best_passing_dialog_arm(self) -> None:
        metrics = {
            "base": arm_metrics(20.0, 20.0, 10.0),
            "retention": arm_metrics(21.0, 21.0, 10.5),
            "dialog20": arm_metrics(20.9, 20.9, 12.0),
            "dialog40": arm_metrics(20.8, 20.8, 13.0),
        }
        bootstraps = {
            "dialog20": {"percentile_90_interval": {"low": 0.1}},
            "dialog40": {"percentile_90_interval": {"low": 0.2}},
        }
        decision = candidate_decision(metrics, bootstraps)
        self.assertEqual(decision["selected_recipe"], "dialog40")
        self.assertTrue(decision["continue_to_multiseed_confirmation"])
        self.assertFalse(decision["sealed_test_authorized"])
        self.assertFalse(decision["publication_or_deployment_authorized"])

    def test_decision_rejects_small_uncertain_gain(self) -> None:
        metrics = {
            "base": arm_metrics(20.0, 20.0, 10.0),
            "retention": arm_metrics(21.0, 21.0, 10.5),
            "dialog20": arm_metrics(20.9, 20.9, 11.0),
            "dialog40": arm_metrics(20.8, 20.8, 12.0),
        }
        bootstraps = {
            "dialog20": {"percentile_90_interval": {"low": -0.1}},
            "dialog40": {"percentile_90_interval": {"low": -0.1}},
        }
        decision = candidate_decision(metrics, bootstraps)
        self.assertIsNone(decision["selected_recipe"])


if __name__ == "__main__":
    unittest.main()

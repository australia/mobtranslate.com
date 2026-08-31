from __future__ import annotations

import unittest

from training.translation.probe_wajarri_v3_composition_development import (
    score_development_row,
    validate_development_rows,
)


class ProbeWajarriV3CompositionDevelopmentTest(unittest.TestCase):
    def row(self) -> dict:
        return {
            "cell_id": "cell-1",
            "subject_id": "dog",
            "predicate_id": "running",
            "source_text": "The dog is running.",
            "input_text": "<translate> The dog is running.",
            "output_text": "Duthu jamarnimanha.",
            "training_eligibility": "not_allowed",
            "benchmark_eligibility": "development_only_not_sealed",
            "baseline_status": "not_measured_live",
        }

    def test_validation_accepts_two_slot_development_row(self) -> None:
        validate_development_rows([self.row()])

    def test_validation_rejects_trainable_row(self) -> None:
        row = self.row()
        row["training_eligibility"] = "allowed"
        with self.assertRaisesRegex(ValueError, "unexpectedly trainable"):
            validate_development_rows([row])

    def test_scoring_separates_subject_and_predicate_substitution(self) -> None:
        result = score_development_row(
            self.row(),
            {"translation": "Duthu yanmanha."},
            50,
            {"duthu", "mayu"},
            {"jamarnimanha", "yanmanha"},
        )
        self.assertFalse(result["exact"])
        self.assertTrue(result["expected_subject_present"])
        self.assertFalse(result["expected_predicate_present"])
        self.assertIn("known_predicate_substitution", result["failure_codes"])


if __name__ == "__main__":
    unittest.main()

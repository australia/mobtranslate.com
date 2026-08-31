from __future__ import annotations

import unittest

from training.translation.analyze_wajarri_v3_composition_screen_result import (
    compare_rows,
    transition_counts,
)


class AnalyzeWajarriV3CompositionScreenResultTest(unittest.TestCase):
    def test_compare_rows_records_paired_gain_and_loss(self) -> None:
        baseline = [
            {"id": "a", "input_text": "a", "prediction": "x", "exact": True},
            {"id": "b", "input_text": "b", "prediction": "z", "exact": False},
        ]
        candidate = [
            {"id": "a", "input_text": "a", "prediction": "y", "exact": False},
            {"id": "b", "input_text": "b", "prediction": "q", "exact": True},
        ]
        rows = compare_rows(
            baseline,
            candidate,
            baseline_label="B0",
            candidate_label="T1",
            suite="test",
        )
        self.assertEqual(transition_counts(rows)["loss"], 1)
        self.assertEqual(transition_counts(rows)["gain"], 1)

    def test_compare_rows_rejects_unaligned_populations(self) -> None:
        with self.assertRaisesRegex(ValueError, "unaligned"):
            compare_rows(
                [{"id": "a", "prediction": "x", "exact": True}],
                [{"id": "b", "prediction": "x", "exact": True}],
                baseline_label="B0",
                candidate_label="T1",
                suite="test",
            )


if __name__ == "__main__":
    unittest.main()

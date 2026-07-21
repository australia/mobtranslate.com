#!/usr/bin/env python3

from __future__ import annotations

import unittest

from training.translation.audit_lexicon_transfer import summarize_transfer


def prediction(prompt: str, reference: str, output: str) -> dict:
    return {
        "id": prompt,
        "unconditioned_input_text": prompt,
        "accepted_references": [reference],
        "prediction": output,
    }


class LexiconTransferAuditTest(unittest.TestCase):
    def test_transfer_is_stratified_by_resource_relation(self) -> None:
        overlap = [
            {
                "prompt": "water",
                "relation": "shared_accepted_form",
                "old": {"accepted_references": ["bana"]},
                "new": {"accepted_references": ["bana"]},
            },
            {
                "prompt": "ear",
                "relation": "surface_disjoint",
                "old": {"accepted_references": ["milka"]},
                "new": {"accepted_references": ["kulbir"]},
            },
        ]
        predictions = [
            prediction("water", "bana", "bana"),
            prediction("ear", "milka", "kulbir"),
            prediction("moon", "kala", "kala"),
        ]

        summary, rows = summarize_transfer(predictions, overlap, "old", "new")

        self.assertEqual(summary["rows"], 3)
        self.assertEqual(summary["old_exact_count"], 2)
        self.assertEqual(summary["by_resource_relation"]["shared_accepted_form"]["old_exact_count"], 1)
        self.assertEqual(summary["by_resource_relation"]["surface_disjoint"]["old_exact_count"], 0)
        self.assertEqual(summary["by_resource_relation"]["old_only"]["old_exact_count"], 1)
        self.assertTrue(rows[1]["prediction_supported_by_new"])
        self.assertIsNone(rows[2]["prediction_supported_by_new"])

    def test_duplicate_prediction_prompts_fail_closed(self) -> None:
        rows = [prediction("water", "bana", "bana"), prediction("water", "bana", "bana")]
        with self.assertRaisesRegex(ValueError, "duplicate prediction prompt"):
            summarize_transfer(rows, [], "old", "new")


if __name__ == "__main__":
    unittest.main()

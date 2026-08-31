from __future__ import annotations

import unittest

from training.translation.evaluate_wajarri_v3_representation_screen import (
    summarize_by_condition,
)


class EvaluateWajarriV3RepresentationScreenTest(unittest.TestCase):
    def test_condition_summaries_remain_separate(self) -> None:
        base = {
            "prediction": "a b",
            "failure_codes": [],
            "exact": True,
            "expected_subject_present": True,
            "expected_predicate_present": True,
            "both_expected_slots_present": True,
            "chrf2": 100.0,
            "blank": False,
            "source_copy": False,
            "repeated_token_4gram": False,
            "contrast_family": "posture",
            "predicate_id": "standing",
            "subject_id": "dog",
        }
        summaries = summarize_by_condition(
            [
                {**base, "evaluation_condition": "plain"},
                {**base, "evaluation_condition": "suffix", "exact": False},
            ]
        )
        self.assertEqual(summaries["plain"]["exact"], 1)
        self.assertEqual(summaries["suffix"]["exact"], 0)


if __name__ == "__main__":
    unittest.main()

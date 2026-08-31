from __future__ import annotations

import unittest

from training.translation.evaluate_wajarri_v3_copy_composition import (
    SENTENCE_ENDPOINTS,
    summarize,
)


def scored(endpoint: str, exact: bool) -> dict:
    sentence = endpoint in SENTENCE_ENDPOINTS
    return {
        "evaluation_endpoint": endpoint,
        "prediction": "a b",
        "failure_codes": [] if exact else ["expected_subject_missing"],
        "exact": exact,
        "expected_subject_present": exact if sentence else None,
        "expected_predicate_present": exact if sentence else None,
        "both_expected_slots_present": exact if sentence else None,
        "copy_surface_present": exact if not sentence else None,
        "chrf2": 100.0 if exact else 0.0,
        "blank": False,
        "source_copy": False,
        "repeated_token_4gram": False,
        "unresolved_bracket": False,
        "contrast_family": "motion" if sentence else None,
        "predicate_id": "running" if sentence else None,
        "subject_id": "crow" if sentence else None,
    }


class EvaluateWajarriV3CopyCompositionTest(unittest.TestCase):
    def test_endpoints_remain_separate_and_copy_has_no_fake_slots(self) -> None:
        summary = summarize(
            [
                scored("composition_plain", True),
                scored("held_lexeme_inline", False),
                scored("copy_screen", True),
                scored("neutral_dual_copy_screen", True),
            ]
        )
        self.assertEqual(summary["by_endpoint"]["composition_plain"]["exact"], 1)
        self.assertEqual(summary["by_endpoint"]["held_lexeme_inline"]["exact"], 0)
        self.assertEqual(summary["by_endpoint"]["copy_screen"]["copy_rows"], 1)
        self.assertEqual(summary["by_endpoint"]["copy_screen"]["sentence_rows"], 0)
        self.assertEqual(
            summary["by_endpoint"]["neutral_dual_copy_screen"]["copy_rows"], 1
        )
        self.assertEqual(summary["sentence_rows"], 2)


if __name__ == "__main__":
    unittest.main()

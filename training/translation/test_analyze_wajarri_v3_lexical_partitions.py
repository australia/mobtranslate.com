from __future__ import annotations

import unittest

from training.translation.analyze_wajarri_v3_lexical_partitions import (
    build_partitions,
)


def prediction(row_id: str, exact: bool) -> dict:
    return {
        "id": row_id,
        "ambiguity_class": "one_target",
        "exact": exact,
        "prediction": row_id,
        "chrf2": 100.0 if exact else 0.0,
        "grapheme_cer": 0.0 if exact else 1.0,
        "surface_class": "exact" if exact else "different_surface_form",
        "blank": False,
        "source_copy": False,
        "repeated_token_4gram": False,
    }


class AnalyzeWajarriV3LexicalPartitionsTest(unittest.TestCase):
    def test_partitions_are_explicit_and_exhaustive(self) -> None:
        predictions = [
            prediction("anchor", True),
            prediction("control", False),
            prediction("other", True),
        ]
        pairs = [
            {
                "pair_id": "pair-1",
                "anchor": {"id": "anchor"},
                "control": {"id": "control"},
                "mandatory_regression_anchor": True,
            }
        ]
        report, memberships = build_partitions(
            predictions,
            pairs,
            expected_one_target_rows=3,
            expected_mandatory_anchors=1,
        )
        self.assertEqual(report["all_one_target"]["exact"], 2)
        self.assertEqual(report["trained_anchors"]["exact"], 1)
        self.assertEqual(report["matched_controls"]["exact"], 0)
        self.assertEqual(report["unanchored_complement"]["rows"], 2)
        self.assertEqual(len(memberships), 3)

    def test_rejects_replay_id_outside_one_target_population(self) -> None:
        pairs = [
            {
                "pair_id": "pair-1",
                "anchor": {"id": "missing"},
                "control": {"id": "control"},
                "mandatory_regression_anchor": True,
            }
        ]
        with self.assertRaisesRegex(ValueError, "absent from one-target census"):
            build_partitions(
                [prediction("anchor", True), prediction("control", True)],
                pairs,
                expected_one_target_rows=2,
                expected_mandatory_anchors=1,
            )


if __name__ == "__main__":
    unittest.main()

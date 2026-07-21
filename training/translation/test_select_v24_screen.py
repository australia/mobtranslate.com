#!/usr/bin/env python3

from __future__ import annotations

import unittest

from training.translation.select_v24_screen import select, wilson


def model(exact: int, chrf: float, loops: int = 0) -> dict:
    return {
        "lexical": {"normalized_exact_count": exact, "empty_outputs": 0},
        "sentence_endpoints": {
            "synthetic": {
                "corpus_chrf": chrf,
                "empty_outputs": 0,
                "repeated_segment_rows_at_least_10": loops,
            }
        },
    }


class V24ScreenSelectorTest(unittest.TestCase):
    def test_wilson_reproduces_frozen_baseline_interval(self) -> None:
        interval = wilson(48, 297)
        self.assertAlmostEqual(interval["low"], 0.1241, places=4)
        self.assertAlmostEqual(interval["high"], 0.2078, places=4)

    def test_advances_lexical_gain_when_retention_is_noninferior(self) -> None:
        models = {
            "B0": model(2, 50.0),
            "C0": model(3, 50.2),
            "L1": model(14, 49.5),
            "L2": model(20, 48.0),
        }
        vectors = {
            "B0": [0.0] * 20,
            "C0": [1.0] * 3 + [0.0] * 17,
            "L1": [1.0] * 14 + [0.0] * 6,
            "L2": [1.0] * 20,
        }
        result = select(
            models,
            vectors,
            baseline_label="B0",
            control_label="C0",
            retention_endpoints=["synthetic"],
            minimum_gain=10,
            margin=1.0,
            bootstrap_samples=100,
            seed="fixture",
        )
        self.assertEqual(result["status"], "ADVANCE")
        self.assertEqual(result["selected_label"], "L1")
        self.assertFalse(result["assessments"]["L2"]["eligible"])

    def test_returns_no_advance_when_gain_is_too_small(self) -> None:
        models = {"B0": model(2, 50.0), "C0": model(3, 50.0), "L1": model(8, 50.0)}
        vectors = {label: [0.0] * 10 for label in models}
        result = select(
            models,
            vectors,
            baseline_label="B0",
            control_label="C0",
            retention_endpoints=["synthetic"],
            minimum_gain=10,
            margin=1.0,
            bootstrap_samples=10,
            seed="fixture",
        )
        self.assertEqual(result["status"], "NO_ADVANCE")
        self.assertIsNone(result["selected_label"])


if __name__ == "__main__":
    unittest.main()

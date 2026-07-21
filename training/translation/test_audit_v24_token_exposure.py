#!/usr/bin/env python3

from __future__ import annotations

import unittest

from training.translation.audit_v24_token_exposure import choose_update_shape, describe


class V24TokenExposureAuditTest(unittest.TestCase):
    def test_describe_uses_nearest_rank_percentiles(self) -> None:
        result = describe([1, 2, 3, 4, 100])
        self.assertEqual(result["minimum"], 1)
        self.assertEqual(result["p50"], 3)
        self.assertEqual(result["p95"], 100)
        self.assertEqual(result["maximum"], 100)
        self.assertEqual(result["mean"], 22.0)

    def test_update_shape_selects_closest_token_budget_then_larger_batch(self) -> None:
        result = choose_update_shape(
            mean_tokens_per_example=40.0,
            reference_tokens_per_update=800.0,
            reference_examples_per_update=16,
            maximum_micro_batch_size=10,
            maximum_gradient_accumulation=5,
        )
        self.assertEqual(result["micro_batch_size"], 10)
        self.assertEqual(result["gradient_accumulation_steps"], 2)
        self.assertEqual(result["effective_examples_per_update"], 20)
        self.assertEqual(result["relative_difference_from_reference"], 0.0)


if __name__ == "__main__":
    unittest.main()

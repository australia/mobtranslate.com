import unittest

from training.translation.evaluate_wajarri_v3_task_separated import (
    compare_batches,
    parse_batch_sizes,
    row_id,
    summarize,
)


class TaskSeparatedEvaluationTest(unittest.TestCase):
    def test_row_identifier_fallbacks(self) -> None:
        self.assertEqual(row_id({"id": "a"}), "a")
        self.assertEqual(row_id({"cell_id": "b"}), "b")
        with self.assertRaises(ValueError):
            row_id({})

    def test_batch_sizes_fail_closed(self) -> None:
        self.assertEqual(parse_batch_sizes("1,8,24"), [1, 8, 24])
        for value in ("", "0", "1,1"):
            with self.assertRaises(ValueError):
                parse_batch_sizes(value)

    def test_batch_comparison_uses_row_identity(self) -> None:
        baseline = [{"row_id": "a", "prediction": "One."}, {"row_id": "b", "prediction": "Two"}]
        reordered = [{"row_id": "b", "prediction": "two."}, {"row_id": "a", "prediction": "one"}]
        changed = [{"row_id": "a", "prediction": "one"}, {"row_id": "b", "prediction": "three"}]
        result = compare_batches({1: baseline, 8: reordered, 16: changed})
        self.assertFalse(result["all_outputs_identical"])
        self.assertEqual(result["comparisons"]["8"]["mismatch_count"], 0)
        self.assertEqual(result["comparisons"]["16"]["mismatch_row_ids"], ["b"])

    def test_summary_preserves_contrast_breakdown(self) -> None:
        base = {
            "exact": True,
            "expected_subject_present": True,
            "expected_predicate_present": True,
            "both_expected_slots_present": True,
            "chrf2": 100.0,
            "blank": False,
            "source_copy": False,
            "repeated_token_4gram": False,
            "failure_codes": [],
            "prediction": "x y",
            "contrast_family": "motion",
            "predicate_id": "coming",
            "subject_id": "bilby",
        }
        metrics = summarize([base, {**base, "subject_id": "emu"}])
        self.assertEqual(metrics["exact"], 2)
        self.assertEqual(metrics["by_contrast_family"]["motion"]["exact"], 2)


if __name__ == "__main__":
    unittest.main()

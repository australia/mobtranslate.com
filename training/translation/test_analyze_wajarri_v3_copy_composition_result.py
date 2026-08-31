import unittest

from training.translation.analyze_wajarri_v3_copy_composition_result import (
    copy_task_confound,
    group_held_rows,
)


class AnalyzeWajarriV3CopyCompositionResultTest(unittest.TestCase):
    def test_group_held_rows_localizes_surface_specific_failure(self) -> None:
        rows = [
            {
                "subject_id": "a",
                "expected_subject": "alpha",
                "exact": True,
                "expected_subject_present": True,
                "expected_predicate_present": True,
                "prediction": "alpha verb.",
            },
            {
                "subject_id": "b",
                "expected_subject": "beta",
                "exact": False,
                "expected_subject_present": False,
                "expected_predicate_present": True,
                "prediction": "other verb.",
            },
            {
                "subject_id": "b",
                "expected_subject": "beta",
                "exact": False,
                "expected_subject_present": False,
                "expected_predicate_present": False,
                "prediction": "other.",
            },
        ]
        grouped = group_held_rows(rows)
        self.assertEqual(grouped[0]["exact"], 1)
        self.assertEqual(grouped[1]["rows"], 2)
        self.assertEqual(grouped[1]["subject_present"], 0)
        self.assertEqual(grouped[1]["predicate_present"], 1)

    def test_true_lexical_pairs_make_copy_screen_confounded(self) -> None:
        rows = [
            {"parent_lexical_id": "lex:1", "source_prompt": "dog"},
            {"parent_lexical_id": "lex:2", "source_prompt": "cat"},
        ]
        result = copy_task_confound({"exact": 1}, rows)
        self.assertTrue(result["confounded"])
        self.assertEqual(result["untreated_baseline_exact_rate"], 0.5)

    def test_neutral_rows_do_not_trigger_lexical_pair_confound(self) -> None:
        rows = [
            {"source_prompt": "first item"},
            {"source_prompt": "second item"},
        ]
        self.assertFalse(copy_task_confound({"exact": 0}, rows)["confounded"])


if __name__ == "__main__":
    unittest.main()

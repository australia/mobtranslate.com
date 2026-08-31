from __future__ import annotations

import unittest


class AnalyzeWajarriStageIHostedScreenTest(unittest.TestCase):
    def test_unit_profile_is_structural_not_semantic(self) -> None:
        from training.translation.analyze_wajarri_stage_i_hosted_screen import (
            unit_profile,
        )

        profile = unit_profile(
            "gurda janda",
            ["Gurda janda."],
            {"gurda", "janda"},
            {"gurda", "janda"},
        )
        self.assertTrue(profile["all_prediction_units_are_c0_units"])
        self.assertTrue(profile["first_reference_unit_preserved_as_first"])
        self.assertFalse(profile["remaining_reference_units_exact"])

    def test_pairwise_identity_is_bound_to_evaluation_ids(self) -> None:
        from training.translation.analyze_wajarri_stage_i_hosted_screen import (
            AnalysisError,
            identical_output_count,
        )

        left = [{"evaluation_id": "a", "generated_content_token_ids": [1, 2]}]
        right = [{"evaluation_id": "a", "generated_content_token_ids": [1, 2]}]
        self.assertEqual(identical_output_count(left, right)["token_identical_rows"], 1)
        right[0]["evaluation_id"] = "b"
        with self.assertRaisesRegex(AnalysisError, "populations differ"):
            identical_output_count(left, right)


if __name__ == "__main__":
    unittest.main()

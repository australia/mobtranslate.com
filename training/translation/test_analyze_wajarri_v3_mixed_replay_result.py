import unittest

from training.translation.analyze_wajarri_v3_mixed_replay_result import (
    normalized_tokens,
    summarize_anchor_rows,
    transition,
)


class AnalyzeWajarriV3MixedReplayResultTest(unittest.TestCase):
    def test_transition_is_directional(self) -> None:
        self.assertEqual(transition(True, True), "retained_exact")
        self.assertEqual(transition(True, False), "lost_exact")
        self.assertEqual(transition(False, True), "gained_exact")
        self.assertEqual(transition(False, False), "remained_nonexact")

    def test_normalized_tokens_preserve_internal_hyphens(self) -> None:
        self.assertEqual(
            normalized_tokens("Ganggaly-ganggaly, Warlugura."),
            {"ganggaly-ganggaly", "warlugura"},
        )

    def test_anchor_summary_separates_exposure_and_token_shape(self) -> None:
        rows = [
            {
                "baseline_exact": True,
                "control_exact": True,
                "treatment_exact": False,
                "transition": "lost_exact",
                "treatment_surface_class": "near_surface_form",
                "composition_surface_intrusions": [],
                "selected_checkpoint_presentations": 1,
                "target_token_bucket": "2",
            },
            {
                "baseline_exact": True,
                "control_exact": True,
                "treatment_exact": True,
                "transition": "retained_exact",
                "treatment_surface_class": "exact",
                "composition_surface_intrusions": ["yanmanha"],
                "selected_checkpoint_presentations": 2,
                "target_token_bucket": "3-4",
            },
        ]
        summary = summarize_anchor_rows(rows)
        self.assertEqual(summary["treatment_exact"], 1)
        self.assertEqual(summary["composition_surface_intrusions"], 1)
        self.assertEqual(
            summary["by_selected_checkpoint_presentations"]["1"]["lost_from_baseline"],
            1,
        )
        self.assertEqual(summary["by_target_token_bucket"]["3-4"]["exact"], 1)


if __name__ == "__main__":
    unittest.main()

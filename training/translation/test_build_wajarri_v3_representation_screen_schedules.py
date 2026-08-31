from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_representation_screen_schedules import (
    validate_paired_treatment_schedules,
    validate_representation_targets,
)


class BuildWajarriV3RepresentationScreenSchedulesTest(unittest.TestCase):
    def test_representation_targets_must_match_parent_set(self) -> None:
        targets = [{"id": "p1", "output_text": "a b."}]
        variants = {
            "suffix": [
                {"parent_row_id": "p1", "output_text": "a c."}
            ]
        }
        with self.assertRaisesRegex(ValueError, "target mismatch"):
            validate_representation_targets(targets, variants)

    def test_paired_schedules_reject_target_order_drift(self) -> None:
        base = {
            "target_pair_parent_id": "p1",
            "output_text": "a b.",
            "optimizer_update": 1,
            "presentation_index": 1,
            "schedule_population": "contrast",
            "token_accounting": {"target_tokens_with_specials": 3},
        }
        schedules = {
            "R0": [base],
            "R1": [{**base, "target_pair_parent_id": "p2"}],
            "R2": [base],
        }
        with self.assertRaisesRegex(ValueError, "pairing drift"):
            validate_paired_treatment_schedules(schedules)


if __name__ == "__main__":
    unittest.main()

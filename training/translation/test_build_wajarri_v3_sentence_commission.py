from __future__ import annotations

import unittest


class BuildWajarriV3SentenceCommissionTest(unittest.TestCase):
    def test_split_quota_matches_frozen_balanced_budget(self) -> None:
        from training.translation.build_wajarri_v3_sentence_commission import (
            split_quota,
        )

        budget = {
            "families": 24,
            "pairs_per_family": 125,
            "per_family_train": 100,
            "per_family_development_first_half": 12,
            "per_family_test_first_half": 13,
            "per_family_development_second_half": 13,
            "per_family_test_second_half": 12,
        }
        quotas = [split_quota(index, budget) for index in range(24)]

        self.assertEqual(quotas[0], {"train": 100, "development": 12, "sealed_test": 13})
        self.assertEqual(quotas[-1], {"train": 100, "development": 13, "sealed_test": 12})
        self.assertEqual(sum(row["train"] for row in quotas), 2400)
        self.assertEqual(sum(row["development"] for row in quotas), 300)
        self.assertEqual(sum(row["sealed_test"] for row in quotas), 300)

    def test_scsa_pair_requires_explicit_alignment_and_english(self) -> None:
        from training.translation.build_wajarri_v3_sentence_commission import (
            scsa_example_is_explicit_pair,
        )

        self.assertTrue(
            scsa_example_is_explicit_pair(
                {
                    "englishText": "How are you?",
                    "translationAlignment": "explicit_source_pair",
                }
            )
        )
        self.assertFalse(
            scsa_example_is_explicit_pair(
                {
                    "englishText": "How are you?",
                    "translationAlignment": "editorial_inference",
                }
            )
        )
        self.assertFalse(
            scsa_example_is_explicit_pair(
                {"englishText": None, "translationAlignment": "explicit_source_pair"}
            )
        )

    def test_lexical_priority_places_context_regressions_first(self) -> None:
        from training.translation.build_wajarri_v3_sentence_commission import (
            lexical_priority,
        )

        def row(outcome: str) -> dict:
            return {
                "outcome_class": outcome,
                "direct": {
                    "ambiguity_class": "one_accepted_target",
                    "known_target_substitution": False,
                },
                "context": {"known_target_substitution": False},
                "part_of_speech": {"status": "not_provided_by_source"},
                "evidence_coverage": {},
            }

        direct_only_score, reasons = lexical_priority(row("direct_only_exact"))
        context_only_score, _ = lexical_priority(row("context_only_exact"))

        self.assertGreater(direct_only_score, context_only_score)
        self.assertIn(
            "raw_definition_context_regressed_a_direct_source_exact_result", reasons
        )

    def test_budget_rejects_wrong_family_count(self) -> None:
        from training.translation.build_wajarri_v3_sentence_commission import (
            validate_budget,
        )

        contract = {
            "pair_budget": {
                "families": 2,
                "pairs_per_family": 125,
                "new_unique_sentence_pairs": 250,
                "split_totals": {"train": 200, "development": 25, "sealed_test": 25},
            },
            "construction_families": [{"family_id": "F01"}],
            "cross_cutting_requirements": {"maximum_macro_family_share": 0.6},
        }

        with self.assertRaisesRegex(ValueError, "family count"):
            validate_budget(contract)


if __name__ == "__main__":
    unittest.main()

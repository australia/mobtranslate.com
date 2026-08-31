from __future__ import annotations

import unittest

from training.translation.run_wajarri_v3_copy_composition_screen import (
    choose_neutral_checkpoint,
    neutral_candidate_screen_gates,
    neutral_development_rank,
    neutral_dual_intervention_comparison,
)


GATES = {
    "minimum_composition_plain_exact": 8,
    "minimum_held_inline_exact": 18,
    "minimum_neutral_single_screen_exact": 56,
    "minimum_neutral_dual_screen_exact": 56,
    "minimum_slots_per_composition_family": 1,
}


def metric(exact: int, rows: int, *, sentence: bool = True) -> dict:
    return {
        "rows": rows,
        "exact": exact,
        "both_slots_present": exact if sentence else 0,
        "mean_chrf2": float(exact),
        "faults": {
            "blank": 0,
            "source_copy": 0,
            "repeated_token_4gram": 0,
            "unresolved_bracket": 0,
        },
        "by_contrast_family": {"motion": {"both_slots_present": exact}},
    }


def development(composition: int, held: int, single: int, dual: int) -> dict:
    endpoints = {
        "composition_plain": metric(composition, 11),
        "composition_inline": metric(composition, 11),
        "held_lexeme_plain": metric(0, 24),
        "held_lexeme_inline": metric(held, 24),
        "neutral_single_copy_screen": metric(single, 64, sentence=False),
        "neutral_dual_copy_screen": metric(dual, 64, sentence=False),
    }
    return {
        "metrics": {
            "faults": {
                "blank": 0,
                "source_copy": 0,
                "repeated_token_4gram": 0,
                "unresolved_bracket": 0,
            },
            "by_endpoint": endpoints,
        }
    }


class NeutralCopyRunnerTest(unittest.TestCase):
    def test_balanced_selector_counts_all_four_primary_thresholds(self) -> None:
        one_slot_only = {
            "step": 20,
            "development": development(8, 18, 64, 2),
        }
        balanced = {
            "step": 40,
            "development": development(8, 18, 56, 56),
        }
        selected = choose_neutral_checkpoint([one_slot_only, balanced], GATES)
        self.assertEqual(selected["step"], 40)

    def test_earlier_step_breaks_a_complete_tie(self) -> None:
        summary = development(8, 18, 56, 56)
        self.assertGreater(
            neutral_development_rank(summary, GATES, 20),
            neutral_development_rank(summary, GATES, 40),
        )

    def test_dual_intervention_requires_strict_gain_without_sentence_loss(self) -> None:
        result = neutral_dual_intervention_comparison(
            development(8, 19, 56, 58), development(9, 18, 58, 58)
        )
        self.assertTrue(all(result.values()))
        no_gain = neutral_dual_intervention_comparison(
            development(8, 18, 56, 58), development(9, 18, 58, 58)
        )
        self.assertFalse(no_gain["strict_dual_copy_or_held_uptake_improvement"])

    def test_candidate_gates_cover_both_neutral_copy_endpoints(self) -> None:
        full = {
            "deployment_mechanical_faults_zero": True,
            "fixed_utterance_retention": True,
            "synthetic_chrf2_noninferiority": True,
            "synthetic_exact_noninferiority": True,
        }
        result = neutral_candidate_screen_gates(
            development(8, 18, 56, 56), development(1, 1, 0, 0), full, GATES
        )
        self.assertTrue(all(result.values()))


if __name__ == "__main__":
    unittest.main()

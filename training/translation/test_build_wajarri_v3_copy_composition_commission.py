from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_copy_composition_commission import (
    build_copy_row,
    holdout_map,
    unique_copy_candidates,
)


class BuildWajarriV3CopyCompositionCommissionTest(unittest.TestCase):
    def test_holdout_map_is_balanced_and_deterministic(self) -> None:
        subjects = [f"s{index}" for index in range(11)]
        predicates = [f"p{index}" for index in range(6)]
        first = holdout_map(subjects, predicates, "seed-v1")
        second = holdout_map(list(reversed(subjects)), predicates, "seed-v1")
        self.assertEqual(first, second)
        counts = sorted(
            sum(value == predicate for value in first.values())
            for predicate in predicates
        )
        self.assertEqual(counts, [1, 2, 2, 2, 2, 2])

    def test_copy_candidates_exclude_held_and_deduplicate_targets(self) -> None:
        rows = [
            {
                "id": "a",
                "ambiguity_class": "one_target",
                "accepted_references": ["Mirdi"],
                "source_record_ids": ["1"],
            },
            {
                "id": "b",
                "ambiguity_class": "one_target",
                "accepted_references": ["jalbu"],
                "source_record_ids": ["2"],
            },
            {
                "id": "c",
                "ambiguity_class": "one_target",
                "accepted_references": ["Jalbu"],
                "source_record_ids": ["3"],
            },
        ]
        selected, excluded = unique_copy_candidates(rows, {"mirdi"}, "seed")
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0]["id"], "b")
        self.assertEqual(
            {row["reason"] for row in excluded},
            {"held_sentence_lexeme_surface", "duplicate_normalized_target_surface"},
        )

    def test_copy_row_is_explicitly_nonlinguistic(self) -> None:
        row = {
            "id": "lex-1",
            "input_text": "<lexeme> black goanna",
            "accepted_references": ["mirdi"],
            "source_record_ids": ["source-1"],
        }
        built = build_copy_row(row, "training")
        self.assertEqual(built["input_text"], "<translate> black goanna [mirdi].")
        self.assertEqual(built["output_text"], "mirdi.")
        self.assertTrue(built["approved_for_training"])
        self.assertFalse(built["creates_new_target_sentence"])
        self.assertFalse(built["synthetic_output_is_linguistic_evidence"])


if __name__ == "__main__":
    unittest.main()

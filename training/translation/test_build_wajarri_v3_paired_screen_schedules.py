from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_paired_screen_schedules import (
    build_schedules,
    minimum_cost_assignment,
    merge_contract_values,
    pair_cost,
    reviewed_legacy_ids,
    row_identifier,
    schedule_token_accounting,
    select_aggregate_token_matches,
    select_control_matches,
    select_global_token_matches,
    validate_schedule_pairing,
)


def treatment(subject: str, predicate: str, source: int, target: int) -> dict:
    return {
        "id": f"t-{subject}-{predicate}",
        "subject_realization_id": subject,
        "predicate_realization_id": predicate,
        "input_text": f"treatment {predicate}",
        "output_text": f"target {predicate}",
        "pair_kind": "controlled_synthetic_composition_intervention",
        "token_accounting": {
            "source_tokens_with_specials": source,
            "target_tokens_with_specials": target,
            "non_padding_tokens_with_specials": source + target,
        },
    }


def control(subject: str, predicate: str, split: str, source: int, target: int) -> dict:
    return {
        "id": f"c-{subject}-{predicate}",
        "task": "translate",
        "split": split,
        "input_text": f"control {subject} {predicate}",
        "output_text": f"output {subject} {predicate}",
        "pair_kind": "controlled_research_synthetic_sentence",
        "grammar_audit": {"status": "pass"},
        "lexical_audit": {"status": "pass"},
        "target_analysis": {
            "slot_realizations": {
                "subject": {"realization_id": subject},
                "predicate": {"realization_id": predicate},
            }
        },
        "token_accounting": {
            "source_tokens_with_specials": source,
            "target_tokens_with_specials": target,
            "non_padding_tokens_with_specials": source + target,
        },
    }


class BuildWajarriV3PairedScreenSchedulesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.subject = "wbv-realization:bird:subject:v1"
        self.treatments = [
            treatment(self.subject, f"p{index}", 8 + index, 5 + index)
            for index in range(4)
        ]

    def test_pair_cost_counts_source_target_and_total_differences(self) -> None:
        self.assertEqual(
            pair_cost(
                self.treatments[0],
                control(self.subject, "c", "train", 10, 4),
            ),
            (4, 2, 1),
        )

    def test_contract_merge_preserves_unoverridden_nested_bindings(self) -> None:
        self.assertEqual(
            merge_contract_values(
                {"inputs": {"a": 1}, "schedule": {"seed": 17, "kind": "old"}},
                {"inputs": {"b": 2}, "schedule": {"kind": "new"}},
            ),
            {
                "inputs": {"a": 1, "b": 2},
                "schedule": {"seed": 17, "kind": "new"},
            },
        )

    def test_row_identifier_accepts_development_cell_schema(self) -> None:
        self.assertEqual(row_identifier({"cell_id": "cell-1"}), "cell-1")
        with self.assertRaisesRegex(ValueError, "stable identifier"):
            row_identifier({})

    def test_legacy_eligibility_requires_both_review_ledgers(self) -> None:
        sentence_reviews = [
            {
                "id": "wbv-v2-synthetic:abc",
                "automatic_structure_checks": "pass",
                "source_bound": True,
                "training_eligible_for_research": True,
                "split": "train",
            },
            {
                "id": "wbv-v2-synthetic:missing-compatibility",
                "automatic_structure_checks": "pass",
                "source_bound": True,
                "training_eligible_for_research": True,
                "split": "train",
            },
        ]
        compatibility_reviews = [
            {
                "review_id": "wbv-v2-compatibility:abc",
                "decision": "include_research_synthetic",
            }
        ]
        self.assertEqual(
            reviewed_legacy_ids(sentence_reviews, compatibility_reviews),
            {"wbv-v2-synthetic:abc"},
        )

    def test_train_only_controls_are_preferred_when_four_exist(self) -> None:
        controls = [
            control(self.subject, f"c{index}", "train", 8 + index, 5 + index)
            for index in range(4)
        ] + [control(self.subject, "holdout", "holdout", 8, 5)]
        matches = select_control_matches(
            self.treatments, controls, [self.subject]
        )
        self.assertEqual(len(matches), 4)
        self.assertEqual({row["control_original_split"] for row in matches}, {"train"})

    def test_rectangular_assignment_finds_global_minimum(self) -> None:
        assignment = minimum_cost_assignment([[10, 1, 8], [2, 9, 3]])
        self.assertEqual(assignment, [1, 0])

    def test_global_matching_uses_distinct_training_rows(self) -> None:
        controls = [
            control(f"subject-{index}", f"c{index}", "train", 8 + index, 5 + index)
            for index in range(6)
        ]
        controls.append(control("held", "held", "holdout", 8, 5))
        matches = select_global_token_matches(self.treatments, controls, set())
        self.assertEqual(len(matches), 4)
        self.assertEqual(len({row["control_id"] for row in matches}), 4)
        self.assertEqual({row["control_original_split"] for row in matches}, {"train"})

    def test_aggregate_matching_balances_total_token_budget(self) -> None:
        treatments = [
            treatment("subject", "p0", 8, 8),
            treatment("subject", "p1", 10, 10),
        ]
        controls = [
            control("a", "c0", "train", 7, 7),
            control("b", "c1", "train", 9, 9),
            control("c", "c2", "train", 11, 11),
            control("d", "c3", "train", 13, 13),
        ]
        matches = select_aggregate_token_matches(
            treatments, controls, set(), maximum_overshoot_tokens=4
        )
        source_total = sum(
            row["control_token_accounting"]["source_tokens_with_specials"]
            for row in matches
        )
        target_total = sum(
            row["control_token_accounting"]["target_tokens_with_specials"]
            for row in matches
        )
        self.assertEqual((source_total, target_total), (18, 18))

    def test_holdout_control_is_used_only_to_complete_subject_matrix(self) -> None:
        controls = [
            control(self.subject, f"c{index}", "train", 8 + index, 5 + index)
            for index in range(3)
        ] + [control(self.subject, "holdout", "holdout", 11, 8)]
        matches = select_control_matches(
            self.treatments, controls, [self.subject]
        )
        self.assertEqual(
            sum(row["control_original_split"] == "holdout" for row in matches), 1
        )

    def test_insufficient_subject_controls_fail_closed(self) -> None:
        controls = [
            control(self.subject, f"c{index}", "train", 8, 5)
            for index in range(3)
        ]
        with self.assertRaisesRegex(ValueError, "only 3 eligible controls"):
            select_control_matches(self.treatments, controls, [self.subject])

    def test_schedule_order_is_paired_and_reproducible(self) -> None:
        controls = [
            control(self.subject, f"c{index}", "train", 8 + index, 5 + index)
            for index in range(4)
        ]
        matches = select_control_matches(
            self.treatments, controls, [self.subject]
        )
        first = build_schedules(matches, cycles=2, seed=17)
        second = build_schedules(matches, cycles=2, seed=17)
        self.assertEqual(first, second)
        validate_schedule_pairing(first[0], first[1], expected=8)
        self.assertEqual({row["schedule_cycle"] for row in first[0]}, {1, 2})
        self.assertEqual(
            {row["pair_kind"] for row in first[0]},
            {"controlled_research_synthetic_sentence"},
        )
        self.assertEqual(
            {row["pair_kind"] for row in first[1]},
            {"controlled_synthetic_composition_intervention"},
        )

    def test_token_accounting_includes_dynamic_batch_padding(self) -> None:
        rows = [
            {
                "token_accounting": {
                    "source_tokens_with_specials": source,
                    "target_tokens_with_specials": target,
                }
            }
            for source, target in [(3, 2), (5, 4), (4, 3), (2, 2)]
        ]
        result = schedule_token_accounting(rows, physical_batch_size=4)
        self.assertEqual(result["total_non_padding_tokens_with_specials"], 25)
        self.assertEqual(result["source_padded_tokens"], 20)
        self.assertEqual(result["target_padded_tokens"], 16)


if __name__ == "__main__":
    unittest.main()

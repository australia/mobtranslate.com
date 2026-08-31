from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_composition_intervention import (
    baseline_index,
    classify_cell,
    index_candidate_realizations,
    normalize_surface,
    retired_baseline_rows,
)


class BuildWajarriV3CompositionInterventionTest(unittest.TestCase):
    def test_existing_pair_is_retention(self) -> None:
        existing = {
            normalize_surface("<translate> The dog is going away."): [
                {
                    "id": "row-1",
                    "input_text": "<translate> The dog is going away.",
                    "output_text": "Duthu yanmanha.",
                }
            ]
        }
        disposition, row_ids = classify_cell(
            "development_matrix_subject",
            "<translate> The dog is going away.",
            "Duthu yanmanha.",
            existing,
        )
        self.assertEqual(disposition, "existing_retention")
        self.assertEqual(row_ids, ["row-1"])

    def test_competing_existing_target_blocks_cell(self) -> None:
        key = normalize_surface("<translate> The child is going away.")
        existing = {
            key: [
                {"id": "mayu", "output_text": "Mayu yanmanha."},
                {"id": "jura", "output_text": "Jura yanmanha."},
            ]
        }
        disposition, row_ids = classify_cell(
            "development_matrix_subject",
            "<translate> The child is going away.",
            "Mayu yanmanha.",
            existing,
        )
        self.assertEqual(disposition, "blocked_reference_conflict")
        self.assertEqual(row_ids, ["mayu"])

    def test_exclusion_overrides_existing_pair(self) -> None:
        existing = {
            normalize_surface("<translate> The fish is going away."): [
                {"id": "fish", "output_text": "Warrbi yanmanha."}
            ]
        }
        disposition, _ = classify_cell(
            "excluded_semantic_compatibility",
            "<translate> The fish is going away.",
            "Warrbi yanmanha.",
            existing,
        )
        self.assertEqual(disposition, "excluded_semantic_compatibility")

    def test_candidate_identity_conflict_fails_closed(self) -> None:
        first = {
            "realization_id": "r1",
            "english_surface": "running",
            "target_surface": "form-a",
            "part_of_speech": "verb",
            "slot_classes": ["predicate"],
            "grammatical_features": {},
            "source_record_ids": ["s1"],
        }
        second = dict(first, target_surface="form-b")
        with self.assertRaisesRegex(ValueError, "conflicting candidate realization"):
            index_candidate_realizations([[first], [second]])

    def test_duplicate_baseline_source_fails_closed(self) -> None:
        rows = [
            {"source_text": "The dog is running."},
            {"source_text": "the dog is running"},
        ]
        with self.assertRaisesRegex(ValueError, "duplicate baseline source"):
            baseline_index(rows)

    def test_retirement_policy_is_predicate_specific(self) -> None:
        contract = {
            "retired_baseline_predicates": [
                {
                    "realization_id": "coming",
                    "reason": "direction must be explicit",
                    "replacement_prompt_policy": "say towards the speaker",
                }
            ]
        }
        rows = [
            {
                "pair_id": "p1",
                "source_text": "I am coming.",
                "reference": "r",
                "prediction": "p",
                "exact": False,
                "bindings": {"predicate": "coming"},
            },
            {
                "pair_id": "p2",
                "source_text": "I am running.",
                "reference": "r",
                "prediction": "p",
                "exact": False,
                "bindings": {"predicate": "running"},
            },
        ]
        retired = retired_baseline_rows(contract, rows)
        self.assertEqual([row["pair_id"] for row in retired], ["p1"])
        self.assertEqual(retired[0]["retirement_reason"], "direction must be explicit")


if __name__ == "__main__":
    unittest.main()

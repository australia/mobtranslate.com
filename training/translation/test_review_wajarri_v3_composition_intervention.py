from __future__ import annotations

import unittest

from training.translation.review_wajarri_v3_composition_intervention import (
    collect_identifiers,
    issue_rows,
    stable_pair_id,
    validate_pair_partitions,
)


class ReviewWajarriV3CompositionInterventionTest(unittest.TestCase):
    def test_collect_identifiers_handles_nested_id_fields(self) -> None:
        value = {
            "claimId": "claim-1",
            "evidenceRecordIds": ["e1", "e2"],
            "nested": {"curated_example_id": "example-1"},
        }
        self.assertEqual(
            collect_identifiers(value), {"claim-1", "e1", "e2", "example-1"}
        )

    def test_pair_id_is_case_and_punctuation_normalized(self) -> None:
        first = stable_pair_id(
            "<translate> The dog is running.", "Duthu jamarnimanha."
        )
        second = stable_pair_id(
            "<TRANSLATE> the dog is running", "duthu jamarnimanha"
        )
        self.assertEqual(first, second)

    def test_pair_partitions_reject_overlap(self) -> None:
        train = [{"input_text": "a", "output_text": "b"}]
        development = [{"input_text": "A.", "output_text": "B."}]
        with self.assertRaisesRegex(ValueError, "overlap"):
            validate_pair_partitions(train, development)

    def test_pair_partitions_reject_duplicate_training_pair(self) -> None:
        train = [
            {"input_text": "a", "output_text": "b"},
            {"input_text": "A.", "output_text": "B."},
        ]
        with self.assertRaisesRegex(ValueError, "duplicate normalized training pair"):
            validate_pair_partitions(train, [])

    def test_issue_rows_normalizes_development_schema(self) -> None:
        cell = {
            "cell_id": "c1",
            "disposition": "development_candidate",
            "input_text": "<translate> I am running.",
            "target_text": "Ngatha jamarnimanha.",
        }
        _, development, _, _ = issue_rows(
            [cell],
            [],
            {"grammar_synthesis_id": "g", "template_precedent_id": "t"},
        )
        self.assertEqual(development[0]["output_text"], cell["target_text"])


if __name__ == "__main__":
    unittest.main()

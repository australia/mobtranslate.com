from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_glossary_fixtures import (
    glossary_row,
    pairing_record,
    split_controlled_clause,
)


def controlled_row() -> dict:
    return {
        "id": "row-1",
        "input_text": "<translate> The brother is sitting.",
        "output_text": "Gurda nyinamanha.",
        "direction": "eng-wbv",
        "subject_realization_id": "subject-1",
        "predicate_realization_id": "predicate-1",
        "training_eligibility": "allowed_internal_noncommercial_fixed_compute_screen",
    }


class BuildWajarriV3GlossaryFixturesTest(unittest.TestCase):
    def test_controlled_clause_splits_existing_surfaces(self) -> None:
        parts = split_controlled_clause(controlled_row())
        self.assertEqual(parts["source_subject"], "brother")
        self.assertEqual(parts["source_predicate"], "sitting")
        self.assertEqual(parts["target_subject"], "Gurda")
        self.assertEqual(parts["target_predicate"], "nyinamanha")

    def test_glossary_variant_changes_only_input_task_metadata(self) -> None:
        plain = controlled_row()
        result = glossary_row(plain, "training")
        self.assertEqual(result["output_text"], plain["output_text"])
        self.assertEqual(
            result["input_text"],
            "<translate> The brother is sitting. <glossary> brother = Gurda; sitting = nyinamanha",
        )
        self.assertFalse(result["creates_new_target_sentence"])
        pairing = pairing_record(plain, result, "training")
        self.assertTrue(pairing["target_identical"])
        self.assertTrue(pairing["only_model_input_changed"])

    def test_fixture_rejects_non_matrix_clause(self) -> None:
        row = controlled_row()
        row["input_text"] = "<translate> Sit down."
        with self.assertRaisesRegex(ValueError, "frozen clause template"):
            glossary_row(row, "training")

    def test_fixture_rejects_target_with_more_than_two_slots(self) -> None:
        row = controlled_row()
        row["output_text"] = "Gurda nyinamanha ngayu."
        with self.assertRaisesRegex(ValueError, "two-slot"):
            glossary_row(row, "training")


if __name__ == "__main__":
    unittest.main()

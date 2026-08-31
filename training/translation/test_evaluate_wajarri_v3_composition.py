from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from training.translation.evaluate_wajarri_v3_composition import (
    load_rows,
    score_row,
    summarize,
)


class EvaluateWajarriV3CompositionTest(unittest.TestCase):
    def row(self) -> dict:
        return {
            "cell_id": "cell-1",
            "subject_id": "dog",
            "predicate_id": "running",
            "source_text": "The dog is running.",
            "input_text": "<translate> The dog is running.",
            "output_text": "Duthu jamarnimanha.",
        }

    def test_slot_scoring_distinguishes_predicate_substitution(self) -> None:
        result = score_row(
            self.row(),
            "Duthu yanmanha.",
            [1, 2, 3],
            set(),
            {"duthu", "mayu"},
            {"jamarnimanha", "yanmanha"},
        )
        self.assertFalse(result["exact"])
        self.assertTrue(result["expected_subject_present"])
        self.assertFalse(result["expected_predicate_present"])
        self.assertIn("known_predicate_substitution", result["failure_codes"])

    def test_summary_counts_mechanical_faults(self) -> None:
        exact = score_row(
            self.row(),
            "Duthu jamarnimanha.",
            [1, 2],
            set(),
            {"duthu"},
            {"jamarnimanha"},
        )
        summary = summarize([exact])
        self.assertEqual(summary["exact"], 1)
        self.assertEqual(summary["both_slots_present"], 1)
        self.assertEqual(
            summary["faults"], {"blank": 0, "source_copy": 0, "repeated_token_4gram": 0}
        )

    def test_loader_uses_contract_bound_count(self) -> None:
        import json

        with TemporaryDirectory() as temporary:
            path = Path(temporary) / "development.jsonl"
            path.write_text(json.dumps(self.row()) + "\n", encoding="utf-8")
            self.assertEqual(len(load_rows(path, 1)), 1)
            with self.assertRaisesRegex(ValueError, "expected 2 development rows"):
                load_rows(path, 2)


if __name__ == "__main__":
    unittest.main()

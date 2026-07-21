from __future__ import annotations

import unittest

from training.translation.audit_tokenizer_extension_impact import summarize, text_views


class TokenizerExtensionImpactTest(unittest.TestCase):
    def test_text_views_keep_conditioning_and_all_references_separate(self) -> None:
        row = {
            "input_text": "<lexeme> woman",
            "unconditioned_input_text": "woman",
            "output_text": "jalbu",
            "accepted_references": ["jalbu", "jalbu", "mukul jalbu"],
        }
        self.assertEqual(
            list(text_views(row)),
            [
                ("source_conditioned", "<lexeme> woman", 0),
                ("source_unconditioned", "woman", 0),
                ("target_selected", "jalbu", 0),
                ("target_all_references", "jalbu", 0),
                ("target_all_references", "mukul jalbu", 1),
            ],
        )

    def test_summary_counts_token_changes_and_new_piece_use(self) -> None:
        records = [
            {
                "row_id": "a",
                "whitespace_units": 1,
                "base_token_count": 5,
                "candidate_token_count": 2,
                "tokenization_changed": True,
                "new_candidate_pieces": ["jalbu"],
                "candidate_has_unknown": False,
                "base_has_unknown": False,
                "candidate_round_trip_exact": True,
                "base_round_trip_exact": True,
            },
            {
                "row_id": "b",
                "whitespace_units": 2,
                "base_token_count": 4,
                "candidate_token_count": 5,
                "tokenization_changed": True,
                "new_candidate_pieces": ["jalbu", "-ngku"],
                "candidate_has_unknown": False,
                "base_has_unknown": True,
                "candidate_round_trip_exact": True,
                "base_round_trip_exact": False,
            },
        ]
        result = summarize(records, top_new_pieces=1)
        self.assertEqual(result["observations"], 2)
        self.assertEqual(result["unique_rows"], 2)
        self.assertEqual(result["base_tokens"], 9)
        self.assertEqual(result["candidate_tokens"], 7)
        self.assertEqual(result["candidate_one_token"], 0)
        self.assertEqual(result["candidate_five_plus_tokens"], 1)
        self.assertEqual(result["base_unknown_rows"], 1)
        self.assertEqual(result["candidate_round_trip_failures"], 0)
        self.assertEqual(result["top_new_candidate_pieces"], [{"token": "jalbu", "occurrences": 2}])


if __name__ == "__main__":
    unittest.main()

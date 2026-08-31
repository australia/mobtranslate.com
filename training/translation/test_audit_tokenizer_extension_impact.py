from __future__ import annotations

import unittest
from pathlib import Path
import tempfile

from training.translation.audit_tokenizer_extension_impact import (
    normalized_created_at,
    parse_expected_rows,
    render_checksum_manifest,
    summarize,
    text_views,
    tokenizer_file_manifest,
)


class TokenizerExtensionImpactTest(unittest.TestCase):
    def test_text_views_support_language_neutral_camel_case_rows(self) -> None:
        row = {
            "inputText": "<lexeme> water",
            "acceptedReferences": ["bamba", "bamba", "bamba-gu"],
        }

        self.assertEqual(
            list(text_views(row)),
            [
                ("source_conditioned", "<lexeme> water", 0),
                ("target_all_references", "bamba", 0),
                ("target_all_references", "bamba-gu", 1),
            ],
        )

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
        self.assertEqual(
            result["top_new_candidate_pieces"], [{"token": "jalbu", "occurrences": 2}]
        )

    def test_expected_rows_are_strict_and_nonnegative(self) -> None:
        self.assertEqual(
            parse_expected_rows(["main=3016", "supplement=55"]),
            {"main": 3016, "supplement": 55},
        )
        for value in ("main", "main=-1", "main=nope"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_expected_rows([value])
        with self.assertRaisesRegex(ValueError, "duplicate expected row label"):
            parse_expected_rows(["main=1", "main=1"])

    def test_created_at_requires_an_offset_and_normalizes_to_utc(self) -> None:
        self.assertEqual(
            normalized_created_at("2026-07-24T08:00:00+01:00"), "2026-07-24T07:00:00Z"
        )
        with self.assertRaisesRegex(ValueError, "UTC offset"):
            normalized_created_at("2026-07-24T07:00:00")

    def test_tokenizer_manifest_binds_only_identity_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "tokenizer.json").write_text("{}\n", encoding="utf-8")
            (root / "model.safetensors").write_bytes(b"weights")
            manifest = tokenizer_file_manifest(root)
        self.assertEqual([row["path"] for row in manifest], ["tokenizer.json"])
        self.assertEqual(manifest[0]["bytes"], 3)

    def test_checksum_manifest_requires_one_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report = root / "REPORT.json"
            rows = root / "ROWS.jsonl"
            report.write_text("{}\n", encoding="utf-8")
            rows.write_text("{}\n", encoding="utf-8")
            manifest = render_checksum_manifest([rows, report])
            other = root / "other"
            other.mkdir()
            other_report = other / "REPORT.json"
            other_report.write_text("{}\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "one directory"):
                render_checksum_manifest([rows, other_report])
        self.assertEqual(
            [line.split("  ")[1] for line in manifest.splitlines()],
            ["REPORT.json", "ROWS.jsonl"],
        )


if __name__ == "__main__":
    unittest.main()

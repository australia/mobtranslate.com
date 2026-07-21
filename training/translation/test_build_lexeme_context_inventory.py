#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from training.translation.build_lexeme_context_inventory import main


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


class LexemeContextInventoryTest(unittest.TestCase):
    def test_evidence_classes_remain_separate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            census = root / "census.jsonl"
            write_jsonl(
                census,
                [
                    {
                        "id": "water",
                        "unconditioned_input_text": "water",
                        "accepted_references": ["bana"],
                        "curated_dictionary": {
                            "ambiguous_surface_prompt": False,
                            "identity_translation": False,
                            "entry_records": [
                                {"word": "bana", "type": "noun", "semantic_domain": "water"}
                            ],
                        },
                    },
                    {
                        "id": "woman",
                        "unconditioned_input_text": "woman",
                        "accepted_references": ["jalbu"],
                        "curated_dictionary": {
                            "ambiguous_surface_prompt": False,
                            "identity_translation": False,
                            "entry_records": [
                                {"word": "jalbu", "type": "noun", "semantic_domain": "human"}
                            ],
                        },
                    },
                ],
            )
            synthetic = root / "synthetic.jsonl"
            write_jsonl(
                synthetic,
                [
                    {
                        "ku": "Bana-ng.",
                        "meta": {"lexical_targets": ["bana"], "quality_tier": "B"},
                    }
                ],
            )
            usage = root / "usage.jsonl"
            write_jsonl(
                usage,
                [
                    {
                        "db_usage_example": {"word": "jalbu", "is_verified": False},
                        "output_text": "Jalbungku kadan.",
                    }
                ],
            )
            xigt = root / "xigt.jsonl"
            write_jsonl(
                xigt,
                [
                    {
                        "transcript": "Jalbu kadan.",
                        "source_backed_same_chunk": True,
                        "candidate_kind": "clause_like",
                        "minimum_source_line_distance": 1,
                    }
                ],
            )
            output = root / "inventory.jsonl"
            summary = root / "summary.json"
            argv = [
                "build_lexeme_context_inventory.py",
                "--curated-census",
                str(census),
                "--synthetic-train",
                str(synthetic),
                "--usage-file",
                str(usage),
                "--xigt-audit-rows",
                str(xigt),
                "--output",
                str(output),
                "--summary-output",
                str(summary),
            ]
            with patch.object(sys, "argv", argv):
                main()

            rows = {row["normalized_headword"]: row for row in map(json.loads, output.read_text().splitlines())}
            self.assertEqual(rows["bana"]["context_evidence"]["synthetic_explicit_rows"], 1)
            self.assertEqual(rows["bana"]["context_evidence"]["synthetic_surface_rows"], 0)
            self.assertEqual(rows["jalbu"]["context_evidence"]["usage_unverified_rows"], 1)
            self.assertEqual(rows["jalbu"]["context_evidence"]["xigt_source_backed_clause_rows"], 1)
            self.assertFalse(rows["jalbu"]["automatic_sentence_generation_authorized"])


if __name__ == "__main__":
    unittest.main()

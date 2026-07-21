#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from training.translation.audit_xigt_source_alignment import main


class XigtSourceAlignmentAuditTest(unittest.TestCase):
    def test_source_alignment_training_overlap_and_prompt_contamination(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir = root / "sources"
            source_dir.mkdir()
            (source_dir / "pages_1_to_10.md").write_text(
                "| bana | water |\nTarget-only form: jalbu.\n",
                encoding="utf-8",
            )
            examples = root / "examples.json"
            examples.write_text(
                json.dumps(
                    {
                        "items": [
                            {"transcript": "bana", "translation": "water", "source": "example 1"},
                            {
                                "transcript": "nyulu jalbungku karrkay kawany",
                                "translation": "the woman looked after the child",
                                "source": "invented prompt example",
                            },
                            {"transcript": "jalbu", "translation": "woman", "source": "example 2"},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            training = root / "train.jsonl"
            training.write_text(
                json.dumps(
                    {
                        "input_text": "<translate> water",
                        "unconditioned_input_text": "water",
                        "output_text": "bana",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            prompt = root / "prompt.md"
            prompt.write_text(
                "nyulu jalbungku karrkay kawany means the woman looked after the child",
                encoding="utf-8",
            )
            summary = root / "summary.json"
            rows = root / "rows.jsonl"
            argv = [
                "audit_xigt_source_alignment.py",
                "--examples-json",
                str(examples),
                "--source-dir",
                str(source_dir),
                "--training-file",
                str(training),
                "--prompt-document",
                str(prompt),
                "--output-summary",
                str(summary),
                "--output-rows",
                str(rows),
            ]
            with patch.object(sys, "argv", argv):
                main()

            result = json.loads(summary.read_text(encoding="utf-8"))
            analyzed = [json.loads(line) for line in rows.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(result["examples"], 3)
            self.assertEqual(result["source_backed_same_chunk_total"], 1)
            self.assertEqual(result["prompt_contamination_candidates"], 1)
            self.assertEqual(result["exact_pair_in_documented_training"], 1)
            self.assertEqual(analyzed[0]["target_surface_occurrences_in_documented_training"], 1)
            self.assertEqual(analyzed[0]["minimum_source_line_distance"], 0)
            self.assertEqual(analyzed[0]["closest_source_line_anchor"]["source_chunk"], "pages_1_to_10.md")
            self.assertTrue(analyzed[1]["prompt_contamination_candidate"])
            self.assertEqual(analyzed[2]["alignment_status"], "target_only")


if __name__ == "__main__":
    unittest.main()

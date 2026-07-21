#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from training.translation.freeze_language_program_artifacts import freeze


class FreezeLanguageProgramArtifactsTest(unittest.TestCase):
    def test_hashes_files_and_counts_nonblank_jsonl_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "data.jsonl").write_text('{"a":1}\n\n{"a":2}\n', encoding="utf-8")
            rows = freeze(root, [{
                "artifact_key": "data",
                "stage_key": "dictionary",
                "artifact_kind": "fixture",
                "path": "data.jsonl",
                "row_count": "jsonl_nonblank",
            }])
            self.assertEqual(rows[0]["row_count"], 2)
            self.assertEqual(len(rows[0]["sha256"]), 64)
            self.assertEqual(rows[0]["status"], "verified")

    def test_rejects_duplicate_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "a").write_text("a", encoding="utf-8")
            spec = {"artifact_key": "same", "stage_key": "identity", "artifact_kind": "x", "path": "a"}
            with self.assertRaisesRegex(ValueError, "duplicate artifact_key"):
                freeze(root, [spec, spec])


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from training.translation.build_nllb_tokenizer_extension import (
    load_training_texts,
    normalize_text,
    percentile,
    piece_surface,
)


class NllbTokenizerExtensionBuilderTest(unittest.TestCase):
    def test_load_training_texts_filters_direction_and_records_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.jsonl"
            rows = [
                {"direction": "eng-gvn", "output_text": "  jalbu  ", "pair_kind": "lexeme"},
                {"direction": "gvn-eng", "output_text": "woman", "pair_kind": "lexeme"},
                {"direction": "eng-gvn", "output_text": "bana", "pair_kind": "verse"},
                {"output_text": "jalbu", "pair_kind": "lexeme"},
            ]
            path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")

            texts, manifest = load_training_texts(
                [path], "output_text", "eng-gvn", exclude_tasks={"verse"}
            )

        self.assertEqual(texts, ["jalbu", "jalbu"])
        self.assertEqual(manifest["rows"], 2)
        self.assertEqual(manifest["unique_texts"], 1)
        self.assertEqual(manifest["files"][0]["accepted_rows"], 2)
        self.assertEqual(manifest["files"][0]["skipped_direction_rows"], 1)
        self.assertEqual(manifest["files"][0]["skipped_task_rows"], 1)

    def test_blank_training_target_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.jsonl"
            path.write_text('{"direction":"eng-gvn","output_text":"  "}\n', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "blank 'output_text'"):
                load_training_texts([path], "output_text", "eng-gvn")

    def test_text_and_piece_helpers_are_deterministic(self) -> None:
        self.assertEqual(normalize_text("  Bana\u0301   yala "), "Baná yala")
        self.assertEqual(piece_surface("▁jalbu"), "jalbu")
        self.assertEqual(piece_surface("ngku"), "ngku")
        self.assertEqual(percentile([1, 2, 8, 10], 0.5), 5.0)


if __name__ == "__main__":
    unittest.main()

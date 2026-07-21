#!/usr/bin/env python3

from __future__ import annotations

import unittest

from training.translation.build_curated_dictionary_census import build_rows


class CuratedDictionaryCensusTest(unittest.TestCase):
    def test_groups_accepted_headwords_and_excludes_review_rows(self) -> None:
        entries = [
            {"word": "jalbu", "type": "noun", "translations": ["woman"]},
            {"word": "wulbuman", "type": "noun", "translations": ["woman", "old woman"]},
            {"word": "bad", "translations": ["woman"], "needs_review": "unverified"},
            {"word": "bana", "gloss": "water"},
            {"word": "empty"},
        ]
        rows, counts = build_rows(entries, "test", "eng-x", "eng_Latn", "x_Latn", "<lexeme>")
        by_prompt = {row["unconditioned_input_text"]: row for row in rows}
        self.assertEqual(by_prompt["woman"]["accepted_references"], ["jalbu", "wulbuman"])
        self.assertTrue(by_prompt["woman"]["curated_dictionary"]["ambiguous_surface_prompt"])
        self.assertEqual(by_prompt["water"]["output_text"], "bana")
        self.assertEqual(counts["exclusions"], {"missing_translation_and_gloss": 1, "needs_review": 1})
        self.assertEqual(counts["unique_prompts"], 3)


if __name__ == "__main__":
    unittest.main()

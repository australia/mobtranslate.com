#!/usr/bin/env python3

from __future__ import annotations

import unittest

from training.translation.build_v24_lexicon_provenance_crosswalk import build_crosswalk


class V24LexiconProvenanceCrosswalkTest(unittest.TestCase):
    def test_crosswalk_keeps_exact_headword_prompt_headword_only_and_unresolved_distinct(self) -> None:
        lexical = [
            {
                "id": "exact",
                "unconditioned_input_text": "woman",
                "output_text": "jalbu",
                "lexicon": {"entry_ids": ["raw:jalbu"], "parts_of_speech": ["Noun"]},
            },
            {
                "id": "headword-only",
                "unconditioned_input_text": "adult female",
                "output_text": "jalbu",
                "lexicon": {"entry_ids": ["raw:jalbu:2"], "parts_of_speech": ["Noun"]},
            },
            {
                "id": "raw-only",
                "unconditioned_input_text": "woman-ERG",
                "output_text": "jalbu-ngku",
                "lexicon": {"entry_ids": ["raw:jalbu-ngku"], "parts_of_speech": ["Noun"]},
            },
        ]
        dictionary = [
            {
                "word": "jalbu",
                "type": "noun",
                "gloss": "woman",
                "translations": ["woman"],
                "verb_class": None,
            }
        ]
        rows, summary = build_crosswalk(lexical, dictionary)
        self.assertEqual(
            [row["crosswalk_status"] for row in rows],
            [
                "curated_exact_headword_and_prompt",
                "curated_headword_only",
                "grammar_extraction_only_unadjudicated",
            ],
        )
        self.assertEqual(summary["crosswalk_status_counts"]["curated_exact_headword_and_prompt"], 1)
        self.assertTrue(all(not row["automatic_sentence_generation_authorized"] for row in rows))


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from training.translation.analyze_migmaq_lexical_census import build_analysis
from training.translation.build_migmaq_lexical_census import build_census


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


class AnalyzeMigmaqLexicalCensusTest(unittest.TestCase):
    def test_reports_ready_ambiguous_and_missing_entries_without_losing_overlap(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.jsonl"
            write_jsonl(source, [
                {"externalEntryId": "a", "sourceHeadword": "one", "translation": "light", "meanings": ["glow"], "partOfSpeech": "noun", "alternateForms": ["ones -- lights -- (plural)"], "examples": [], "wordRecordings": []},
                {"externalEntryId": "b", "sourceHeadword": "two", "translation": "light", "meanings": [], "partOfSpeech": "noun", "alternateForms": [], "examples": [], "wordRecordings": []},
                {"externalEntryId": "c", "sourceHeadword": "three", "translation": "", "meanings": [], "partOfSpeech": "particle", "alternateForms": [], "examples": [], "wordRecordings": []},
            ])
            program = root / "program"
            build_census(source, program, generated_at_utc="2026-07-20T00:00:00Z")
            analysis = build_analysis(program, "2026-07-20T00:00:00Z")
            coverage = analysis["coverage"]
            self.assertEqual(coverage["entries_total"], 3)
            self.assertEqual(coverage["entries_with_at_least_one_ready_prompt"], 1)
            self.assertEqual(coverage["entries_with_at_least_one_ambiguous_prompt"], 2)
            self.assertEqual(coverage["entries_ambiguous_only"], 1)
            self.assertEqual(coverage["entries_missing_gloss"], 1)
            self.assertEqual(coverage["entries_neither_ready_ambiguous_nor_missing"], 0)
            self.assertEqual(analysis["morphology_source_surface"]["source_layout_recovered"], 1)
            self.assertEqual(analysis["ambiguity"]["target_count_histogram"], {"2": 1})


if __name__ == "__main__":
    unittest.main()

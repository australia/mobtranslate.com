#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from training.translation.build_migmaq_lexical_census import (
    build_census,
    comparison_text,
    parse_alternate_form,
)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


class MigmaqLexicalCensusTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.entries = self.root / "entries.jsonl"
        self.lexical = self.root / "lexical.jsonl"
        write_jsonl(
            self.entries,
            [
                {
                    "externalEntryId": "entries/a/apu/apu.html",
                    "sourceUrl": "https://example.test/apu",
                    "sourceHeadword": "A\u2019pu",
                    "normalizedHeadword": "a'pu",
                    "translation": " Light ",
                    "partOfSpeech": "noun animate",
                    "meanings": ["light", "illumination"],
                    "alternateForms": ["a'pu'g -- lights -- (plural)"],
                    "wordRecordings": [
                        {
                            "externalRecordingId": "rec-word-1",
                            "speakerCode": "s1",
                            "sourceAudioUrl": "https://example.test/word.mp3",
                            "archiveRelativePath": "raw/audio/word.mp3",
                        }
                    ],
                    "examples": [
                        {
                            "text": "A'pu na.",
                            "translation": "That is a light.",
                            "recordings": [
                                {
                                    "externalRecordingId": "rec-sentence-1",
                                    "speakerCode": "s1",
                                    "sourceAudioUrl": "https://example.test/sentence.mp3",
                                    "archiveRelativePath": "raw/audio/sentence.mp3",
                                }
                            ],
                        }
                    ],
                    "rawHtmlSha256": "a" * 64,
                },
                {
                    "externalEntryId": "entries/a/apu2/apu2.html",
                    "sourceHeadword": "apu2",
                    "translation": "light",
                    "partOfSpeech": "noun animate",
                    "meanings": [],
                    "alternateForms": [],
                    "wordRecordings": [],
                    "examples": [],
                },
                {
                    "externalEntryId": "entries/v/verbal/verbal.html",
                    "sourceHeadword": "verbal",
                    "translation": "light",
                    "partOfSpeech": "verb animate intransitive",
                    "meanings": [],
                    "alternateForms": [],
                    "wordRecordings": [],
                    "examples": [],
                },
                {
                    "externalEntryId": "entries/s/same/same.html",
                    "sourceHeadword": "same",
                    "translation": "same",
                    "partOfSpeech": "",
                    "meanings": [],
                    "alternateForms": [],
                    "wordRecordings": [],
                    "examples": [],
                },
                {
                    "externalEntryId": "entries/m/missing/missing.html",
                    "sourceHeadword": "missing",
                    "translation": "",
                    "partOfSpeech": "particle",
                    "meanings": [],
                    "alternateForms": [],
                    "wordRecordings": [],
                    "examples": [],
                },
                {
                    "externalEntryId": "entries/a/apu-duplicate/apu-duplicate.html",
                    "sourceHeadword": "A'pu",
                    "translation": "glow",
                    "partOfSpeech": "noun animate",
                    "meanings": [],
                    "alternateForms": [],
                    "wordRecordings": [],
                    "examples": [],
                },
            ],
        )
        write_jsonl(
            self.lexical,
            [
                {
                    "id": "legacy-1",
                    "split": "test",
                    "leakage_group": "group-1",
                    "source": {"entry_id": "entries/a/apu/apu.html"},
                }
            ],
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_normalization_folds_quotes_without_changing_source_output(self) -> None:
        self.assertEqual(comparison_text(" A\u2019PU  "), "a'pu")
        output = self.root / "output"
        build_census(self.entries, output, self.lexical, generated_at_utc="2026-07-20T00:00:00Z")
        entries = [json.loads(line) for line in (output / "dictionary/entries.jsonl").read_text().splitlines()]
        apu = next(row for row in entries if row["external_entry_id"] == "entries/a/apu/apu.html")
        self.assertEqual(apu["headword"], "A\u2019pu")
        self.assertEqual(apu["comparison_headword"], "a'pu")
        self.assertEqual(apu["legacy_v1_split"], "test")

    def test_builds_pos_conditioned_benchmark_and_review_queue(self) -> None:
        output = self.root / "output"
        summary = build_census(
            self.entries,
            output,
            self.lexical,
            generated_at_utc="2026-07-20T00:00:00Z",
        )
        counts = summary["counts"]
        self.assertEqual(counts["source_entries"], 6)
        self.assertEqual(counts["source_gloss_candidates"], 6)
        self.assertEqual(counts["lexical_prompt_pos_groups"], 5)
        self.assertEqual(counts["benchmark_ready_unique_target_groups"], 4)
        self.assertEqual(counts["ambiguous_target_groups"], 1)
        self.assertEqual(counts["raw_alternate_forms"], 1)
        self.assertEqual(counts["recorded_examples"], 1)
        self.assertEqual(counts["unique_external_recording_ids"], 2)
        self.assertEqual(counts["unique_archive_paths"], 2)
        self.assertEqual(counts["review_queue"]["entry_without_english_gloss"], 1)
        self.assertEqual(counts["review_queue"]["multiple_distinct_targets_for_gloss_and_pos"], 1)
        self.assertEqual(counts["review_queue"]["normalized_headword_collision"], 1)

        ready = [json.loads(line) for line in (output / "benchmarks/lexical/benchmark-ready.eng-mic.jsonl").read_text().splitlines()]
        verb_light = next(row for row in ready if row["part_of_speech"] == "verb animate intransitive")
        self.assertEqual(verb_light["output_text"], "verbal")
        self.assertIn("<pos> verb animate intransitive", verb_light["input_text"])
        self.assertFalse(any(row["part_of_speech"] == "noun animate" and row["unconditioned_input_text"].casefold() == "light" for row in ready))

    def test_recovers_source_form_layout_without_claiming_morphological_analysis(self) -> None:
        parsed = parse_alternate_form("a'pu'g -- lights -- (plural animate)")
        self.assertEqual(parsed["surface_form_candidate"], "a'pu'g")
        self.assertEqual(parsed["english_gloss_candidate"], "lights")
        self.assertEqual(parsed["grammatical_label"], "plural animate")
        self.assertEqual(parsed["structure_parse_status"], "source_layout_recovered_unadjudicated")
        self.assertEqual(parse_alternate_form("unstructured")["structure_parse_status"], "unparsed")

    def test_outputs_are_byte_reproducible_with_fixed_inputs_and_time(self) -> None:
        first = self.root / "first"
        second = self.root / "second"
        kwargs = {
            "entries_path": self.entries,
            "lexical_auxiliary_path": self.lexical,
            "generated_at_utc": "2026-07-20T00:00:00Z",
        }
        build_census(output_root=first, **kwargs)
        build_census(output_root=second, **kwargs)
        relative_files = [
            "dictionary/entries.jsonl",
            "dictionary/sense-candidates.jsonl",
            "dictionary/forms-raw.jsonl",
            "dictionary/examples.jsonl",
            "dictionary/media-links.jsonl",
            "benchmarks/lexical/lexical-census.eng-mic.jsonl",
            "benchmarks/lexical/benchmark-ready.eng-mic.jsonl",
            "benchmarks/lexical/review-queue.jsonl",
            "analysis/inventories/dictionary-census-summary.json",
            "analysis/inventories/SHA256SUMS",
        ]
        for relative in relative_files:
            self.assertEqual((first / relative).read_bytes(), (second / relative).read_bytes(), relative)


if __name__ == "__main__":
    unittest.main()

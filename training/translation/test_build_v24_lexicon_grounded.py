#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("build_v24_lexicon_grounded.py")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


class V24LexiconBuilderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.lexicon = self.root / "lexicon.jsonld"
        self.lexicon.write_text(
            json.dumps(
                {
                    "@graph": [
                        self.entry("entry:jalbu", "jalbu", "woman", "lexinfo:Noun"),
                        self.entry("entry:yalngkarr", "yalngkarr", "woman", "lexinfo:Noun"),
                        self.entry("entry:bama", "bama", "person", "lexinfo:Noun"),
                        self.entry("entry:ngulkurr", "ngulkurr", "good", "lexinfo:Adjective"),
                        self.entry("entry:abl", "ABL", "ablative case", "lexinfo:CaseMarker"),
                        self.entry("entry:name", "alice", "Alice", "lexinfo:ProperNoun"),
                        self.entry("entry:suffix", "-ku", "purpose", "lexinfo:Suffix"),
                        self.entry("entry:missing", "badul", "", "lexinfo:Noun"),
                    ]
                }
            ),
            encoding="utf-8",
        )
        self.retention = self.root / "retention.jsonl"
        retention_rows = []
        for index in range(40):
            target = "yalngkarr yundu" if index < 4 else "bama ngulkurr"
            retention_rows.append(
                {
                    "id": f"retention:{index}",
                    "input_text": f"<translate> sentence {index}",
                    "unconditioned_input_text": f"sentence {index}",
                    "output_text": target,
                    "pair_kind": "synthetic" if index < 30 else "usage_example",
                }
            )
        write_jsonl(self.retention, retention_rows)
        self.v12 = self.root / "v12.jsonl"
        write_jsonl(
            self.v12,
            [
                {
                    "id": "v12:1",
                    "input_text": "<translate> a woman",
                    "unconditioned_input_text": "a woman",
                    "output_text": "jalbu",
                    "pair_kind": "verse",
                }
            ],
        )
        self.validation = self.root / "validation.jsonl"
        self.test = self.root / "test.jsonl"
        write_jsonl(self.validation, [{"id": "dev:1", "input_text": "dev", "output_text": "dev"}])
        write_jsonl(self.test, [{"id": "test:1", "input_text": "test", "output_text": "test"}])
        self.probe = self.root / "probe.jsonl"
        write_jsonl(
            self.probe,
            [
                {
                    "id": "probe:woman",
                    "input_text": "<translate> woman",
                    "unconditioned_input_text": "woman",
                    "output_text": "jalbu",
                    "accepted_references": ["jalbu", "yalngkarr"],
                    "pair_kind": "dictionary_single_gloss_probe",
                },
                {
                    "id": "probe:person",
                    "input_text": "<translate> person",
                    "unconditioned_input_text": "person",
                    "output_text": "bama",
                    "accepted_references": ["bama"],
                    "pair_kind": "dictionary_single_gloss_probe",
                },
            ],
        )
        self.output = self.root / "output"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def entry(identifier: str, headword: str, definition: str, part_of_speech: str) -> dict:
        return {
            "@id": identifier,
            "ontolex:canonicalForm": {"ontolex:writtenRep": headword},
            "ontolex:sense": {"ontolex:definition": {"@value": definition}},
            "lexinfo:partOfSpeech": part_of_speech,
        }

    def run_builder(self, output: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--lexicon",
                str(self.lexicon),
                "--retention-train",
                str(self.retention),
                "--validation-file",
                str(self.validation),
                "--test-file",
                str(self.test),
                "--lexicon-probe",
                str(self.probe),
                "--lineage",
                f"v12={self.v12}",
                "--output-dir",
                str(output or self.output),
                "--seed",
                "fixture-seed",
            ],
            capture_output=True,
            text=True,
        )

    def test_builds_equal_length_nested_lexical_arms(self) -> None:
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = json.loads((self.output / "MANIFEST.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["lexicon"]["source_entries"], 8)
        self.assertEqual(manifest["lexicon"]["trainable_unique_prompts"], 3)
        self.assertEqual(manifest["lexicon"]["probe_prompts_covered"], 2)
        self.assertTrue(manifest["training_contract"]["arm_row_count_equal"])
        self.assertEqual(manifest["arms"]["C0"]["lexical_rows"], 0)
        self.assertEqual(manifest["arms"]["L1"]["lexical_rows"], 3)
        self.assertEqual(manifest["arms"]["L2"]["lexical_rows"], 6)
        self.assertEqual(manifest["arms"]["L4"]["lexical_rows"], 12)
        for arm in ("C0", "L1", "L2", "L4"):
            rows = read_jsonl(self.output / "arms" / arm / "train.eng-gvn.jsonl")
            self.assertEqual(len(rows), 40)
            self.assertEqual(len({row["id"] for row in rows}), 40)

    def test_selects_documented_frequent_target_and_rewrites_probe_task(self) -> None:
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        pairs = read_jsonl(self.output / "lexicon" / "trainable-pairs.eng-gvn.jsonl")
        woman = next(row for row in pairs if row["unconditioned_input_text"] == "woman")
        self.assertEqual(woman["output_text"], "yalngkarr")
        self.assertEqual(woman["accepted_references"], ["jalbu", "yalngkarr"])
        self.assertEqual(
            woman["lexicon"]["documented_lineage_exposure"]["v21.2"]["target_surface_occurrences"],
            4,
        )
        probe = read_jsonl(self.output / "evaluation" / "lexeme-probe.eng-gvn.jsonl")
        self.assertTrue(all(row["input_text"].startswith("<lexeme> ") for row in probe))
        self.assertEqual(next(row for row in probe if row["id"] == "probe:woman")["output_text"], "yalngkarr")

    def test_preserves_excluded_source_entries_in_ledger(self) -> None:
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        ledger = read_jsonl(self.output / "lexicon" / "source-entry-ledger.jsonl")
        classifications = {row["entry_id"]: row["classification"] for row in ledger}
        self.assertEqual(classifications["entry:abl"], "notation")
        self.assertEqual(classifications["entry:name"], "proper_name")
        self.assertEqual(classifications["entry:suffix"], "morphology")
        self.assertEqual(classifications["entry:missing"], "deferred")

    def test_is_deterministic_apart_from_manifest_timestamp(self) -> None:
        first = self.run_builder()
        self.assertEqual(first.returncode, 0, first.stderr)
        second_output = self.root / "second"
        second = self.run_builder(second_output)
        self.assertEqual(second.returncode, 0, second.stderr)
        for relative in (
            "lexicon/source-entry-ledger.jsonl",
            "lexicon/trainable-pairs.eng-gvn.jsonl",
            "evaluation/lexeme-probe.eng-gvn.jsonl",
            "arms/C0/train.eng-gvn.jsonl",
            "arms/L4/train.eng-gvn.jsonl",
        ):
            self.assertEqual((self.output / relative).read_bytes(), (second_output / relative).read_bytes())

    def test_refuses_existing_output(self) -> None:
        self.output.mkdir()
        result = self.run_builder()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing existing output directory", result.stderr)

    def test_publishes_complete_output_without_staging_residue(self) -> None:
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.output / "BUILD_COMPLETE").is_file())
        self.assertEqual(list(self.root.glob(f".{self.output.name}.building-*")), [])


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from training.translation.build_v24_development_suite import build


class V24DevelopmentSuiteBuilderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.first = self.root / "first.jsonl"
        self.second = self.root / "second.jsonl"
        self.first.write_text(
            json.dumps({"id": "same", "input_text": "one", "output_text": "wan", "direction": "eng-gvn"}) + "\n",
            encoding="utf-8",
        )
        self.second.write_text(
            json.dumps({"id": "same", "input_text": "two", "output_text": "tu", "direction": "eng-gvn"}) + "\n",
            encoding="utf-8",
        )
        self.output = self.root / "suite"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_labels_rows_and_prevents_cross_endpoint_id_collisions(self) -> None:
        manifest = build([("first", self.first), ("second", self.second)], self.output)
        rows = [
            json.loads(line)
            for line in (self.output / "development-suite.eng-gvn.jsonl").read_text().splitlines()
        ]
        self.assertEqual(manifest["rows"], 2)
        self.assertEqual([row["v24_endpoint"] for row in rows], ["first", "second"])
        self.assertEqual(len({row["id"] for row in rows}), 2)
        self.assertTrue((self.output / "BUILD_COMPLETE").is_file())

    def test_refuses_existing_output(self) -> None:
        self.output.mkdir()
        with self.assertRaises(FileExistsError):
            build([("first", self.first)], self.output)


if __name__ == "__main__":
    unittest.main()

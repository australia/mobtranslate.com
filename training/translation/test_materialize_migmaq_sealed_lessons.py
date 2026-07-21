from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from materialize_migmaq_sealed_lessons import (
    sha256,
    validate_and_materialize,
    write_jsonl,
)


def row(row_id: str, task: str) -> dict[str, object]:
    prefix = "<translate>" if task == "translate" else "<lexeme>"
    english = "How are you?" if task == "translate" else "woman"
    migmaq = "Me' talei?" if task == "translate" else "e'pit"
    return {
        "id": row_id,
        "split": "test",
        "direction": "eng-mic",
        "task": task,
        "task_prefix": prefix,
        "input_text": f"{prefix} {english}",
        "unconditioned_input_text": english,
        "output_text": migmaq,
        "translation": {"eng_Latn": english, "mic_Latn": migmaq},
        "container_kind": "dialog" if task == "translate" else "vocab",
        "lesson_id": "lesson-1",
        "split_component_id": "component-1",
    }


class MaterializeSealedLessonsTests(unittest.TestCase):
    def test_separates_tasks_and_removes_prefix(self) -> None:
        result = validate_and_materialize(
            [row("sentence", "translate"), row("word", "lexeme")],
            expected_rows=2,
        )
        self.assertEqual(result["translate"][0]["input_text"], "How are you?")
        self.assertEqual(result["lexeme"][0]["input_text"], "woman")
        self.assertEqual(
            result["translate"][0]["source_task_input_text"],
            "<translate> How are you?",
        )

    def test_rejects_duplicate_ids(self) -> None:
        with self.assertRaisesRegex(ValueError, "non-unique"):
            validate_and_materialize(
                [row("same", "translate"), row("same", "lexeme")],
                expected_rows=2,
            )

    def test_rejects_non_test_rows(self) -> None:
        rows = [row("sentence", "translate"), row("word", "lexeme")]
        rows[0]["split"] = "validation"
        with self.assertRaisesRegex(ValueError, "non-test"):
            validate_and_materialize(rows, expected_rows=2)

    def test_allows_sentence_only_split(self) -> None:
        result = validate_and_materialize(
            [row("sentence-1", "translate"), row("sentence-2", "translate")],
            expected_rows=2,
        )
        self.assertEqual(len(result["translate"]), 2)
        self.assertEqual(result["lexeme"], [])

    def test_jsonl_hash_is_stable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "rows.jsonl"
            write_jsonl(path, [row("sentence", "translate")])
            first = sha256(path)
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(payload["id"], "sentence")
            self.assertEqual(first, sha256(path))


if __name__ == "__main__":
    unittest.main()

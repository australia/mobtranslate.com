from __future__ import annotations

import unittest

from build_migmaq_v3_2_natural_lesson_schedules import (
    build_schedules,
    filter_lessons,
    lexical_diagnostic_row,
    match_controls_by_token_length,
    sentence_row,
)


def row(row_id: str, source: str, target: str, origin: str) -> dict[str, object]:
    return {
        "id": row_id,
        "source_record_id": row_id,
        "input_text": source,
        "unconditioned_input_text": source,
        "output_text": target,
        "pair_kind": "attested_sentence_translation",
        "source_origin": origin,
        "task": "translate",
    }


class NaturalLessonScheduleTests(unittest.TestCase):
    def test_sentence_row_restores_v1_unprefixed_contract(self) -> None:
        observed = sentence_row(
            {
                "id": "old-1",
                "input_text": "<translate> Where are you?",
                "unconditioned_input_text": "Where are you?",
                "output_text": "Tami eteg?",
            },
            origin="dictionary",
            split="train",
        )
        self.assertEqual(observed["input_text"], "Where are you?")
        self.assertIsNone(observed["task_prefix"])
        self.assertEqual(observed["translation"]["mic_Latn"], "Tami eteg?")

    def test_lexical_diagnostic_uses_plain_input_and_references(self) -> None:
        observed = lexical_diagnostic_row(
            {
                "id": "lex-1",
                "input_text": "<lexeme> woman <pos> noun",
                "unconditioned_input_text": "woman",
                "output_text": "e'pit",
                "accepted_references": ["e'pit", "E'pit"],
            },
            origin="dictionary",
        )
        self.assertEqual(observed["input_text"], "woman")
        self.assertEqual(observed["accepted_references"], ["e'pit", "E'pit"])
        self.assertFalse(observed["promotion_eligible"])

    def test_filter_lessons_requires_split_task_and_approval(self) -> None:
        rows = [
            {"id": "a", "task": "translate", "split": "train", "approved_for_training": True},
            {"id": "b", "task": "lexeme", "split": "train", "approved_for_training": True},
            {"id": "c", "task": "translate", "split": "validation", "approved_for_training": True},
            {"id": "d", "task": "translate", "split": "train", "approved_for_training": False},
        ]
        self.assertEqual(
            [item["id"] for item in filter_lessons(rows, "translate", split="train")],
            ["a"],
        )

    def test_matching_prefers_target_then_source_token_length(self) -> None:
        old = [
            row("old-a", "a", "aa", "old"),
            row("old-b", "b", "bb", "old"),
        ]
        lessons = [row("lesson", "lesson", "target", "lesson")]
        lengths = {
            "old-a": {"source_tokens": 7, "target_tokens": 5},
            "old-b": {"source_tokens": 3, "target_tokens": 6},
            "lesson": {"source_tokens": 3, "target_tokens": 5},
        }
        controls, ledger = match_controls_by_token_length(old, lessons, lengths, seed=1)
        self.assertEqual(controls[0]["id"], "old-a")
        self.assertEqual(ledger[0]["target_token_delta"], 0)

    def test_schedules_are_nested_position_matched_and_token_accounted(self) -> None:
        old = [
            row(f"old-{index}", f"source {index}", f"target {index}", "old")
            for index in range(8)
        ]
        lessons = [
            row(f"lesson-{index}", f"lesson {index}", f"answer {index}", "lesson")
            for index in range(4)
        ]
        lengths = {
            str(item["id"]): {
                "source_tokens": 4,
                "target_tokens": 4,
                "non_padding_tokens": 8,
                "source_truncated": False,
                "target_truncated": False,
            }
            for item in old + lessons
        }
        schedules, ledger, audit = build_schedules(old, lessons, lengths, seed=2, total=20)
        self.assertEqual(len(ledger), 8)
        self.assertEqual(set(schedules), {"retention", "lessons20", "lessons40"})
        self.assertEqual(sum(row["natural_lesson_intervention"] for row in schedules["lessons20"]), 4)
        self.assertEqual(sum(row["natural_lesson_intervention"] for row in schedules["lessons40"]), 8)
        self.assertEqual(
            [row["id"] for row in schedules["retention"]],
            [row["id"] for row in schedules["lessons40"]],
        )
        lesson20_positions = {
            row["schedule_position"]
            for row in schedules["lessons20"]
            if row["natural_lesson_intervention"]
        }
        lesson40_positions = {
            row["schedule_position"]
            for row in schedules["lessons40"]
            if row["natural_lesson_intervention"]
        }
        self.assertTrue(lesson20_positions < lesson40_positions)
        self.assertEqual(audit["pairing"]["token_deltas"]["lessons40"]["target_tokens"]["absolute"], 0)


if __name__ == "__main__":
    unittest.main()

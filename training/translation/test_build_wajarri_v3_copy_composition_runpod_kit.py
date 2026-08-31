from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_copy_composition_runpod_kit import (
    build_confirmation_rows,
    build_screen_rows,
)


def sentence(row_id: str) -> dict:
    return {
        "id": row_id,
        "input_text": "<translate> The crow is running.",
        "output_text": "gagu jamarnimanha.",
        "source_text": "The crow is running.",
    }


class BuildWajarriV3CopyCompositionRunpodKitTest(unittest.TestCase):
    def test_screen_builder_assigns_five_distinct_endpoints(self) -> None:
        inputs = {
            "composition_development_plain": [sentence("a")],
            "composition_development_inline": [sentence("b")],
            "held_lexeme_development_plain": [sentence("c")],
            "held_lexeme_development_inline": [sentence("d")],
            "copy_development_screen": [
                {
                    "id": "e",
                    "input_text": "<translate> crow [gagu].",
                    "output_text": "gagu.",
                    "source_prompt": "crow",
                }
            ],
        }
        rows = build_screen_rows(inputs)
        self.assertEqual(len(rows), 5)
        self.assertEqual(len({row["evaluation_endpoint"] for row in rows}), 5)
        self.assertTrue(all(row["approved_for_training"] is False for row in rows))

    def test_confirmation_is_marked_after_selection(self) -> None:
        rows = build_confirmation_rows(
            [
                {
                    "id": "copy-1",
                    "input_text": "<translate> crow [gagu].",
                    "output_text": "gagu.",
                    "source_prompt": "crow",
                }
            ]
        )
        self.assertEqual(rows[0]["evaluation_endpoint"], "copy_confirmation")
        self.assertFalse(rows[0]["approved_for_training"])


if __name__ == "__main__":
    unittest.main()

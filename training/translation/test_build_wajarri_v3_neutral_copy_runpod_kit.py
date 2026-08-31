from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_neutral_copy_runpod_kit import (
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


def copy_row(row_id: str, dual: bool = False) -> dict:
    output = "gagu marlu." if dual else "gagu."
    return {
        "id": row_id,
        "input_text": (
            "<translate> first supplied form [gagu]; second supplied form [marlu]."
            if dual
            else "<translate> supplied form [gagu]."
        ),
        "output_text": output,
        "source_text": "neutral carrier",
    }


class BuildWajarriV3NeutralCopyRunpodKitTest(unittest.TestCase):
    def test_screen_builder_assigns_six_distinct_endpoints(self) -> None:
        inputs = {
            "composition_development_plain": [sentence("a")],
            "composition_development_inline": [sentence("b")],
            "held_lexeme_development_plain": [sentence("c")],
            "held_lexeme_development_inline": [sentence("d")],
            "neutral_single_development_screen": [copy_row("e")],
            "neutral_dual_development_screen": [copy_row("f", dual=True)],
        }
        rows = build_screen_rows(inputs)
        self.assertEqual(len(rows), 6)
        self.assertEqual(len({row["evaluation_endpoint"] for row in rows}), 6)
        self.assertTrue(all(row["approved_for_training"] is False for row in rows))

    def test_confirmation_endpoint_is_explicit_and_nontraining(self) -> None:
        rows = build_confirmation_rows(
            [copy_row("copy-1", dual=True)],
            endpoint="neutral_dual_copy_confirmation",
            condition="neutral_dual_copy",
        )
        self.assertEqual(
            rows[0]["evaluation_endpoint"], "neutral_dual_copy_confirmation"
        )
        self.assertFalse(rows[0]["approved_for_training"])


if __name__ == "__main__":
    unittest.main()

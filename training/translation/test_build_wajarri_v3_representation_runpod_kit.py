from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_representation_runpod_kit import (
    build_development_all,
)


def row(identifier: str, output: str = "a b.") -> dict:
    return {
        "id": identifier,
        "parent_row_id": "p1",
        "output_text": output,
        "approved_for_training": False,
    }


class BuildWajarriV3RepresentationRunpodKitTest(unittest.TestCase):
    def test_combined_development_preserves_four_conditions(self) -> None:
        plain = row("p1")
        conditions = {
            "plain": [plain],
            "suffix": [row("s1")],
            "inline_annotation": [row("i1")],
            "placeholder_glossary": [row("h1")],
        }
        combined = build_development_all(conditions)
        self.assertEqual(len(combined), 4)
        self.assertEqual(
            {item["evaluation_condition"] for item in combined}, set(conditions)
        )
        self.assertTrue(all(item["approved_for_training"] is False for item in combined))

    def test_combined_development_rejects_target_drift(self) -> None:
        conditions = {
            "plain": [row("p1")],
            "suffix": [row("s1", "a c.")],
            "inline_annotation": [row("i1")],
            "placeholder_glossary": [row("h1")],
        }
        with self.assertRaisesRegex(ValueError, "target mismatch"):
            build_development_all(conditions)


if __name__ == "__main__":
    unittest.main()

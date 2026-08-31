from __future__ import annotations

import unittest

import probe_wajarri_v3_terminology_formats_space as probe


def fixture() -> dict:
    return {
        "id": "row:glossary",
        "parent_row_id": "row",
        "subject_id": "black-goanna",
        "predicate_id": "standing",
        "contrast_family": "posture",
        "unconditioned_input_text": "<translate> The black goanna is standing.",
        "input_text": (
            "<translate> The black goanna is standing. <glossary> "
            "black goanna = mirdi; standing = garrimanha"
        ),
        "output_text": "mirdi garrimanha.",
        "glossary_pairs": [
            {
                "slot": "subject",
                "english_surface": "black goanna",
                "wajarri_surface": "mirdi",
            },
            {
                "slot": "predicate",
                "english_surface": "standing",
                "wajarri_surface": "garrimanha",
            },
        ],
    }


class TerminologyFormatProbeTest(unittest.TestCase):
    def test_condition_rendering_is_source_local_and_prefix_free(self) -> None:
        row = fixture()
        self.assertEqual(
            probe.condition_text(row, "inline_append"),
            "The black goanna (mirdi) is standing (garrimanha).",
        )
        self.assertEqual(
            probe.condition_text(row, "code_switch"),
            "The mirdi is garrimanha.",
        )

    def test_scoring_preserves_slot_and_exact_distinctions(self) -> None:
        scored = probe.score_prediction(
            fixture(), "inline_append", "mirdi garrimanha extra"
        )
        self.assertFalse(scored["exact"])
        self.assertTrue(scored["both_expected_slots_present"])

    def test_paired_transitions_detect_gain(self) -> None:
        rows = [
            {
                "parent_row_id": "row",
                "condition": "plain",
                "exact": False,
            },
            {
                "parent_row_id": "row",
                "condition": "code_switch",
                "exact": True,
            },
        ]
        self.assertEqual(
            probe.paired_transitions(rows, "plain", "code_switch", "exact"),
            {"gained": 1},
        )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_copy_composition_schedules import (
    build_schedule,
    validate_composition_partition,
    validate_copy_partitions,
    validate_mirror_targets,
    validate_schedule,
)


def token_row(parent: str, population: str, output: str = "a b.") -> dict:
    return {
        "schema_version": 1,
        "id": parent,
        "input_text": "<translate> x.",
        "output_text": output,
        "task": "translate",
        "pair_kind": population,
        "source_population": population,
        "source_row_id": parent,
        "token_accounting": {
            "source_tokens_with_specials": 3,
            "target_tokens_with_specials": 3,
            "non_padding_tokens_with_specials": 6,
        },
    }


class BuildWajarriV3CopyCompositionSchedulesTest(unittest.TestCase):
    def test_composition_requires_seen_slots_but_unseen_pair(self) -> None:
        training = [
            {"id": "p1", "output_text": "a x."},
            {"id": "p2", "output_text": "b y."},
        ]
        validate_composition_partition(training, [{"id": "d1", "output_text": "a y."}])
        with self.assertRaisesRegex(ValueError, "appears in training"):
            validate_composition_partition(training, [{"id": "d2", "output_text": "a x."}])
        with self.assertRaisesRegex(ValueError, "unexposed slot"):
            validate_composition_partition(training, [{"id": "d3", "output_text": "c y."}])

    def test_mirror_targets_require_identical_parent_mapping(self) -> None:
        plain = [{"id": "p1", "output_text": "a b."}]
        inline = [{"parent_row_id": "p1", "output_text": "a c."}]
        with self.assertRaisesRegex(ValueError, "target mismatch"):
            validate_mirror_targets(plain, inline, label="test")

    def test_copy_partitions_reject_overlap_and_held_subject(self) -> None:
        def copy(surface: str) -> dict:
            return {
                "id": surface,
                "target_surface": surface,
                "creates_new_target_sentence": False,
                "synthetic_output_is_linguistic_evidence": False,
            }

        held = [{"id": "h1", "output_text": "held predicate."}]
        with self.assertRaisesRegex(ValueError, "overlap"):
            validate_copy_partitions([copy("a")], [copy("a")], [copy("b")], held)
        with self.assertRaisesRegex(ValueError, "held sentence subject"):
            validate_copy_partitions([copy("held")], [copy("a")], [copy("b")], held)

    def test_sentence_plain_and_inline_are_paired_within_every_update(self) -> None:
        retention = [token_row("r1", "retention")]
        plain = [token_row("p1", "sentence_plain"), token_row("p2", "sentence_plain")]
        inline = [
            {**token_row("p1", "sentence_inline"), "task": "terminology_conditioned_translation"},
            {**token_row("p2", "sentence_inline"), "task": "terminology_conditioned_translation"},
        ]
        schedule = build_schedule(
            "S5",
            {"retention": retention, "sentence_plain": plain, "sentence_inline": inline},
            {"retention": 2, "sentence_plain": 1, "sentence_inline": 1},
            optimizer_updates=3,
            seed=17,
        )
        validate_schedule(
            schedule,
            {"retention": 2, "sentence_plain": 1, "sentence_inline": 1},
            updates=3,
        )
        self.assertEqual(len(schedule), 12)


if __name__ == "__main__":
    unittest.main()

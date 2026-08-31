import unittest

from training.translation.build_wajarri_v3_neutral_copy_schedules import (
    neutral_copy_training_row,
    validate_paired_noncopy_schedules,
)


class TokenizerStub:
    def __call__(
        self, text: str | None = None, *, text_target: str | None = None, **_: object
    ) -> dict:
        value = text if text is not None else text_target
        assert value is not None
        return {"input_ids": list(range(len(value.split()) + 2))}


def neutral_row(mechanism: str, targets: list[str]) -> dict:
    return {
        "id": f"copy:{mechanism}",
        "input_text": "<translate> supplied [x].",
        "output_text": " ".join(targets) + ".",
        "pair_kind": "nonlinguistic_copy",
        "copy_mechanism": mechanism,
        "target_surfaces": targets,
        "approved_for_training": True,
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
        "semantic_alignment_present": False,
    }


class BuildWajarriV3NeutralCopySchedulesTest(unittest.TestCase):
    def test_training_row_preserves_nonlinguistic_contract(self) -> None:
        row = neutral_copy_training_row(
            neutral_row("neutral_ordered_two_slot", ["a", "b"]),
            TokenizerStub(),
            population="neutral_dual_copy",
        )
        self.assertEqual(row["target_surfaces"], ["a", "b"])
        self.assertFalse(row["semantic_alignment_present"])
        self.assertIn("token_accounting", row)

    def test_training_row_rejects_wrong_arity(self) -> None:
        with self.assertRaisesRegex(ValueError, "arity"):
            neutral_copy_training_row(
                neutral_row("neutral_ordered_two_slot", ["a"]),
                TokenizerStub(),
                population="neutral_dual_copy",
            )

    def test_paired_schedule_ignores_only_copy_population(self) -> None:
        shared = {
            "optimizer_update": 1,
            "schedule_population": "retention",
            "target_pair_parent_id": "shared",
            "input_text": "in",
            "output_text": "out",
        }
        n6 = [shared, {**shared, "schedule_population": "neutral_single_copy"}]
        d6 = [shared, {**shared, "schedule_population": "neutral_dual_copy"}]
        validate_paired_noncopy_schedules(n6, d6)
        with self.assertRaisesRegex(ValueError, "not paired"):
            validate_paired_noncopy_schedules(
                n6, [{**shared, "input_text": "changed"}, d6[1]]
            )


if __name__ == "__main__":
    unittest.main()

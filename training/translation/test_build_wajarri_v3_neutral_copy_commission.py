import math
import unittest

from training.translation.build_wajarri_v3_neutral_copy_commission import (
    build_dual_rows,
    build_single_row,
    coprime_offset,
    validate_split,
)


def source(index: int) -> dict:
    return {
        "id": f"copy:{index}",
        "parent_lexical_id": f"lex:{index}",
        "source_prompt": f"true gloss {index}",
        "target_surface": f"surface{index}",
        "source_record_ids": [f"source:{index}"],
    }


class BuildWajarriV3NeutralCopyCommissionTest(unittest.TestCase):
    def test_offsets_are_coprime_and_nonzero(self) -> None:
        for size in (64, 512, 580):
            offset = coprime_offset(size)
            self.assertGreater(offset, 0)
            self.assertLess(offset, size)
            self.assertEqual(math.gcd(offset, size), 1)

    def test_single_row_removes_true_english_gloss(self) -> None:
        row = build_single_row(source(1), "training")
        self.assertNotIn("true gloss", row["input_text"])
        self.assertEqual(row["output_text"], "surface1.")
        self.assertFalse(row["semantic_alignment_present"])
        self.assertFalse(row["creates_new_target_sentence"])

    def test_dual_rows_use_every_surface_once_in_each_position(self) -> None:
        sources = [source(index) for index in range(7)]
        single = [build_single_row(row, "training") for row in sources]
        dual, _ = build_dual_rows(sources, "training")
        validate_split(sources, single, dual)
        self.assertEqual(
            {row["target_surfaces"][0] for row in dual},
            {f"surface{index}" for index in range(7)},
        )
        self.assertEqual(
            {row["target_surfaces"][1] for row in dual},
            {f"surface{index}" for index in range(7)},
        )
        self.assertTrue(
            all(len(row["target_surfaces"]) == 2 for row in dual)
        )

    def test_validation_rejects_its_own_true_gloss_in_carrier(self) -> None:
        sources = [source(index) for index in range(3)]
        sources[0]["source_prompt"] = "supplied form"
        single = [build_single_row(row, "training") for row in sources]
        dual, _ = build_dual_rows(sources, "training")
        with self.assertRaisesRegex(ValueError, "true English lexical prompt"):
            validate_split(sources, single, dual)


if __name__ == "__main__":
    unittest.main()

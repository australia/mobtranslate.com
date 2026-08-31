from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from build_wajarri_douglas_ocr_witness import (
    OcrLine,
    OcrWord,
    align_marker_numbers,
    confidence_summary,
    line_block_text,
    observed_markers,
    parse_tsv,
    review_reasons,
)


def word(text: str, number: int, confidence: float = 90.0) -> OcrWord:
    return OcrWord(
        text=text,
        confidence=confidence,
        left=number * 10,
        top=20,
        width=8,
        height=10,
        word_number=number,
    )


def line(*texts: str) -> OcrLine:
    words = tuple(word(text, index + 1) for index, text in enumerate(texts))
    return OcrLine(
        line_key=(1, 1, 1),
        words=words,
        text=" ".join(texts),
        left=10,
        top=20,
        width=100,
        height=10,
    )


class WajarriDouglasOcrWitnessTests(unittest.TestCase):
    def test_aligns_all_expected_markers_around_extra_reference(self) -> None:
        matches, extras = align_marker_numbers(
            [5, 6, 7],
            [5, 6, 6, 7],
        )
        self.assertEqual(matches, [0, 1, 3])
        self.assertEqual(extras, [2])

    def test_aligns_repeated_source_examples_without_flattening(self) -> None:
        matches, extras = align_marker_numbers(
            [235, 236, 237, 236, 237, 238],
            [235, 236, 237, 235, 236, 237, 238],
        )
        self.assertEqual(matches, [0, 1, 2, 4, 5, 6])
        self.assertEqual(extras, [3])

    def test_rejects_missing_expected_marker(self) -> None:
        with self.assertRaisesRegex(ValueError, "not every expected marker"):
            align_marker_numbers([1, 2, 3], [1, 3])

    def test_parses_tsv_lines_and_numeric_markers(self) -> None:
        fixture = "\n".join(
            [
                "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
                "5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t91.0\t(105)",
                "5\t1\t1\t1\t1\t2\t50\t20\t40\t10\t88.0\tnjarlu",
                "5\t1\t1\t1\t2\t1\t50\t40\t40\t10\t95.0\twoman",
                "",
            ]
        )
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "page.tsv"
            path.write_text(fixture, encoding="utf-8")
            lines = parse_tsv(path)
        self.assertEqual([row.text for row in lines], ["(105) njarlu", "woman"])
        markers = observed_markers(lines)
        self.assertEqual(len(markers), 1)
        self.assertEqual(markers[0].number, 105)
        self.assertEqual(markers[0].line_index, 0)

    def test_tsv_quotes_do_not_merge_physical_rows(self) -> None:
        fixture = "\n".join(
            [
                "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
                "5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t91.0\t\"quoted",
                "5\t1\t1\t1\t2\t1\t10\t40\t30\t10\t92.0\tnext",
                "",
            ]
        )
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "page.tsv"
            path.write_text(fixture, encoding="utf-8")
            lines = parse_tsv(path)
        self.assertEqual([row.text for row in lines], ["\"quoted", "next"])

    def test_block_and_review_outputs_remain_review_only(self) -> None:
        lines = [line("(1)", "ngatja"), line("I"), line("(2)", "palu")]
        self.assertEqual(line_block_text(lines, 0, 2), "(1) ngatja\nI\n")
        summary = confidence_summary(lines[:2])
        expected = {
            "example_number": 1,
            "line_start": 10,
            "line_end": 11,
            "ocr_diagnostics": {
                "digitOneCount": 1,
                "interiorWhitespaceSequenceCount": 2,
            },
        }
        reasons = review_reasons(
            expected,
            curated_numbers={1},
            page_has_extra_markers=True,
            confidence=summary,
        )
        self.assertIn("existing_curated_grammar_example", reasons)
        self.assertIn("text_layer_digit_one_risk", reasons)
        self.assertIn("page_contains_extra_numeric_marker", reasons)


if __name__ == "__main__":
    unittest.main()

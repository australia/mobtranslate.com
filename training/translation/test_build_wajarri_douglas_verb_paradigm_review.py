from __future__ import annotations

import unittest

from build_wajarri_douglas_verb_paradigm_review import (
    HYPOTHESIZED,
    RECORDED,
    build_pair_preconditions,
    expected_cell_keys,
    validate_decisions,
    validate_form,
    validate_zero_invariants,
)


PAGE_35 = "a" * 64
PAGE_36 = "b" * 64


def matrix() -> dict:
    return {
        "categories": ["present", "purposive"],
        "regular_rows": ["ya_class"],
        "irregular_rows": ["tju"],
        "source_hypothesized_cell_keys": ["tju:purposive"],
    }


def decision(row: str, category: str) -> dict:
    regular = row == "ya_class"
    hypothesized = row == "tju" and category == "purposive"
    page_id = "wbv-douglas-ocr-page-035" if regular else "wbv-douglas-ocr-page-036"
    page_hash = PAGE_35 if regular else PAGE_36
    return {
        "schema_version": 1,
        "decision_id": f"cell-{row}-{category}",
        "table_key": (
            "table-3.3-regular-verb-inflections"
            if regular
            else "table-3.4-irregular-verb-inflections"
        ),
        "paradigm_type": (
            "regular_class_suffix" if regular else "irregular_verb_form"
        ),
        "row_key": row,
        "row_label": row,
        "lexical_gloss": None if regular else "put",
        "category": category,
        "page_witness_id": page_id,
        "page_png_sha256": page_hash,
        "source_cell_rendering": "(?tjunawu)" if hypothesized else "form",
        "forms": [
            {
                "surface": "tjunawu" if hypothesized else "form",
                "evidence_status": HYPOTHESIZED if hypothesized else RECORDED,
                "alternative_index": 1,
                "source_trailing_tilde": False,
                "parenthesized": hypothesized,
                "leading_question_mark": hypothesized,
                "asterisked": False,
                "zero_form": False,
            }
        ],
        "source_footnote_keys": ["note"] if category == "purposive" else [],
        "reviewed_at_utc": "2026-07-24T15:00:00Z",
        "transcription_decision": "accepted_exact_source_image_cell_transcription",
        "current_correspondence_status": "not_assessed",
        "productive_rule_status": "not_authorized",
        "synthetic_eligibility": "not_authorized",
        "training_eligibility": "not_allowed",
        "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
    }


def witnesses() -> dict:
    return {
        "wbv-douglas-ocr-page-035": {"png_sha256": PAGE_35},
        "wbv-douglas-ocr-page-036": {"png_sha256": PAGE_36},
    }


class DouglasVerbParadigmReviewTests(unittest.TestCase):
    def test_expected_matrix_is_cartesian_and_explicit(self) -> None:
        self.assertEqual(
            expected_cell_keys(matrix()),
            {
                ("ya_class", "present"),
                ("ya_class", "purposive"),
                ("tju", "present"),
                ("tju", "purposive"),
            },
        )

    def test_complete_matrix_validates(self) -> None:
        decisions = [
            decision(row, category)
            for row, category in sorted(expected_cell_keys(matrix()))
        ]
        validate_decisions(
            decisions,
            matrix=matrix(),
            page_witnesses=witnesses(),
            note_ids={"note"},
        )

    def test_missing_cell_is_rejected(self) -> None:
        decisions = [
            decision(row, category)
            for row, category in sorted(expected_cell_keys(matrix()))
        ][:-1]
        with self.assertRaisesRegex(ValueError, "exact matrix"):
            validate_decisions(
                decisions,
                matrix=matrix(),
                page_witnesses=witnesses(),
                note_ids={"note"},
            )

    def test_hypothesized_form_must_preserve_parentheses(self) -> None:
        form = decision("tju", "purposive")["forms"][0]
        form["parenthesized"] = False
        with self.assertRaisesRegex(ValueError, "preserve parentheses"):
            validate_form(form, expected_index=1)

    def test_pair_preconditions_require_bilingual_sentence_units(self) -> None:
        cells = [
            {
                "category": "purposive",
                "form_evidence_statuses": [HYPOTHESIZED],
                "form_count": 1,
            }
        ]
        rows = build_pair_preconditions(cells, ["purposive"])
        self.assertEqual(len(rows), 1)
        self.assertIn(
            "English-Wajarri", rows[0]["future_pair_contract"]["required_unit"]
        )
        self.assertFalse(
            rows[0]["future_pair_contract"][
                "isolated_dictionary_mapping_counts_as_pair"
            ]
        )
        self.assertEqual(
            rows[0]["controlled_bilingual_english_wajarri_sentence_pairs_added"],
            0,
        )

    def test_zero_invariants_reject_synthetic_count(self) -> None:
        row = {
            "controlled_bilingual_english_wajarri_sentence_pairs_added": 1,
            "training_eligibility": "not_allowed",
        }
        with self.assertRaisesRegex(ValueError, "must not issue"):
            validate_zero_invariants([row], [], [], [])


if __name__ == "__main__":
    unittest.main()

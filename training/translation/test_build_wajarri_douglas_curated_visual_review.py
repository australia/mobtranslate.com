from __future__ import annotations

import copy
import unittest

from build_wajarri_douglas_curated_visual_review import (
    compile_review_rows,
    validate_decision,
)


PAGE_HASH = "a" * 64


def witness(number: int = 57) -> dict:
    return {
        "witness_id": f"wbv-douglas-ocr-example-{number:03d}-01",
        "source_example_id": f"source-example-{number}",
        "example_number": number,
        "occurrence_index": 1,
        "chapter_page_ordinal": 24,
        "printed_page": 219,
        "source_pdf_page": 241,
        "source_page_sha256": "b" * 64,
        "source_span_sha256": "c" * 64,
        "page_png_path": "pages/page-024.png",
        "page_png_sha256": PAGE_HASH,
        "source_text_layer_witness_sha256": "d" * 64,
        "secondary_ocr_witness_sha256": "e" * 64,
    }


def curated(number: int = 57) -> dict:
    return {
        "exampleNumber": number,
        "curatedExampleId": f"curated-{number}",
        "phenomenonTags": ["causal-case"],
        "selectionRationale": "Contrasts causal case in a finite clause.",
        "acceptanceStatus": "not_accepted",
        "trainingEligibility": "not_allowed",
    }


def decision(number: int = 57) -> dict:
    return {
        "schema_version": 1,
        "decision_id": f"visual-review-{number}",
        "example_number": number,
        "witness_id": f"wbv-douglas-ocr-example-{number:03d}-01",
        "reviewed_at_utc": "2026-07-24T13:00:00Z",
        "page_png_sha256": PAGE_HASH,
        "historical_wajarri_text": "ngatja mayu-kutja mamanjimanja",
        "source_morpheme_gloss": "I child-CAU become angry-PRES",
        "source_free_translation": "I'm becoming angry because of the children.",
        "source_editorial_note": None,
        "source_layout_type": "interlinear_three_line",
        "visual_legibility": "clear",
        "visual_review_note": "Read directly from the source image.",
        "unresolved_uncertainties": [],
        "transcription_decision": "accepted_exact_source_image_transcription",
        "source_layout_pairing_decision": "observed_in_source_not_semantically_validated",
        "semantic_validation_status": "not_independently_validated",
        "current_orthography_correspondence_status": "not_assessed",
        "training_eligibility": "not_allowed",
        "synthetic_eligibility": "not_authorized",
        "controlled_synthetic_sentence_pairs_added": 0,
    }


REVIEWER_SCOPE = {
    "reviewer_id": "ai-assisted-operator-visual-review",
    "role": "source-image transcription only",
    "fluent_speaker": False,
    "linguistic_certification": "none",
}


class DouglasCuratedVisualReviewTests(unittest.TestCase):
    def test_compiles_source_record_without_promoting_language_claims(self) -> None:
        reviewed, queue = compile_review_rows(
            witnesses=[witness()],
            curated_examples=[curated()],
            decisions=[decision()],
            reviewer_scope=REVIEWER_SCOPE,
        )
        self.assertEqual(len(reviewed), 1)
        self.assertEqual(
            reviewed[0]["historical_source_record"]["historical_wajarri_text"],
            "ngatja mayu-kutja mamanjimanja",
        )
        self.assertEqual(reviewed[0]["current_wajarri_form"], None)
        self.assertEqual(reviewed[0]["controlled_synthetic_sentence_pairs_added"], 0)
        self.assertEqual(reviewed[0]["training_eligibility"], "not_allowed")
        self.assertEqual(queue[0]["status"], "pending")

    def test_rejects_nonzero_synthetic_pair_claim(self) -> None:
        row = decision()
        row["controlled_synthetic_sentence_pairs_added"] = 1
        with self.assertRaisesRegex(ValueError, "must equal 0"):
            validate_decision(row)

    def test_rejects_training_authorization(self) -> None:
        row = decision()
        row["training_eligibility"] = "allowed"
        with self.assertRaisesRegex(ValueError, "not_allowed"):
            validate_decision(row)

    def test_rejects_page_hash_mismatch(self) -> None:
        row = decision()
        row["page_png_sha256"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "page image hash mismatch"):
            compile_review_rows(
                witnesses=[witness()],
                curated_examples=[curated()],
                decisions=[row],
                reviewer_scope=REVIEWER_SCOPE,
            )

    def test_requires_exact_curated_set(self) -> None:
        second_curated = curated(59)
        with self.assertRaisesRegex(ValueError, "exact curated set"):
            compile_review_rows(
                witnesses=[witness(), witness(59)],
                curated_examples=[curated(), second_curated],
                decisions=[decision()],
                reviewer_scope=REVIEWER_SCOPE,
            )

    def test_rejects_duplicate_decision_id(self) -> None:
        second = copy.deepcopy(decision(59))
        second["decision_id"] = decision()["decision_id"]
        with self.assertRaisesRegex(ValueError, "duplicate decision ID"):
            compile_review_rows(
                witnesses=[witness(), witness(59)],
                curated_examples=[curated(), curated(59)],
                decisions=[decision(), second],
                reviewer_scope=REVIEWER_SCOPE,
            )


if __name__ == "__main__":
    unittest.main()

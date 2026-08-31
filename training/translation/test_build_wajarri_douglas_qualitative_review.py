from __future__ import annotations

import unittest

from build_wajarri_douglas_qualitative_review import (
    aggregate_surfaces,
    build_evidence_gap_families,
    build_sentence_pair_preconditions,
    edit_signature,
    review_occurrence,
    source_class,
    surface_edit_operations,
    validate_zero_invariants,
)


def candidate_row(
    *, surface: str = "njarlu-ngku", current: str = "njarlu", score: float = 1.0
) -> dict:
    exact = score == 1.0
    return {
        "token_occurrence_id": "example-223:token:01",
        "review_id": "example-223",
        "example_number": 223,
        "token_index": 1,
        "historical_surface": surface,
        "positional_source_gloss": "woman-ERG",
        "source_gloss_alignment_status": "positionally_aligned_candidate_not_validated",
        "source_free_translation": "The woman hit the dog.",
        "phenomenon_tags": ["ergative-case", "transitive-clause"],
        "source": {"page_png_sha256": "a" * 64},
        "historical_lexicon_candidates": [
            {
                "historical_source_record_id": "hist-1",
                "historical_headword": "njarlu",
                "historical_gloss": "woman",
                "raw_part_of_speech": "N",
                "surface_score": {"score": 1.0},
            }
        ],
        "current_dictionary_candidates": [
            {
                "rank": 1,
                "entry_candidate_id": "entry-1",
                "form_candidate_id": "form-1",
                "current_surface": current,
                "combined_review_score": score,
                "surface_score": {
                    "score": score,
                    "normalized_exact_projection": exact,
                    "literal_exact_projection": exact,
                    "projection_surface": "njarlu",
                    "projection_kind": "hyphen_prefix_1",
                },
            }
        ],
        "diagnostics": {
            "current_top_surface_band": (
                "normalized_exact_projection" if exact else "weak_surface_candidate"
            ),
            "current_top_candidate_ambiguous": False,
        },
    }


def frozen_maps(*, accepted_speaker: bool = False) -> tuple[dict, dict, dict]:
    source_id = "speaker-source" if accepted_speaker else "historical-source"
    form = {
        "formCandidateId": "form-1",
        "entryCandidateId": "entry-1",
        "sourceRecordId": "speaker-1" if accepted_speaker else "hist-1",
        "status": "accepted" if accepted_speaker else "candidate",
        "formType": (
            "speaker_attributed_published_source_form"
            if accepted_speaker
            else "historical_published_headword_or_variant_set"
        ),
        "recordKind": (
            None if accepted_speaker else "historical_published_form_candidate"
        ),
        "orthography": "source-orthography",
    }
    entry = {"entryCandidateId": "entry-1", "sourceId": source_id}
    source = {
        "source_id": source_id,
        "source_type": (
            "open_licensed_speaker_attributed_lexical_phrase_audio"
            if accepted_speaker
            else "historical_dictionary"
        ),
    }
    return {"form-1": form}, {"entry-1": entry}, {source_id: source}


class DouglasQualitativeReviewTests(unittest.TestCase):
    def test_source_class_distinguishes_speaker_evidence_from_history(self) -> None:
        forms, _, sources = frozen_maps(accepted_speaker=True)
        self.assertEqual(
            source_class(forms["form-1"], sources["speaker-source"]),
            "accepted_speaker_attributed_source",
        )
        forms, _, sources = frozen_maps(accepted_speaker=False)
        self.assertEqual(
            source_class(forms["form-1"], sources["historical-source"]),
            "historical_dictionary_candidate",
        )

    def test_historical_self_match_is_not_current_confirmation(self) -> None:
        forms, entries, sources = frozen_maps(accepted_speaker=False)
        reviewed = review_occurrence(
            candidate_row(), forms, entries, sources, 0.5, 0.7
        )
        self.assertIn(
            "historical_self_match_without_speaker_exact_confirmation",
            reviewed["diagnostic_flags"],
        )
        self.assertFalse(reviewed["historical_current_correspondence_accepted"])
        self.assertEqual(
            reviewed["controlled_bilingual_english_wajarri_sentence_pairs_added"],
            0,
        )

    def test_speaker_exact_candidate_still_needs_adjudication(self) -> None:
        forms, entries, sources = frozen_maps(accepted_speaker=True)
        reviewed = review_occurrence(
            candidate_row(), forms, entries, sources, 0.5, 0.7
        )
        self.assertEqual(
            reviewed["evidence_state"],
            "speaker_attested_exact_candidate_needs_sense_and_variety_adjudication",
        )
        self.assertEqual(reviewed["synthetic_eligibility"], "not_authorized")

    def test_edit_signature_is_mechanical_only(self) -> None:
        operations = surface_edit_operations("yanatjimanja", "yanajimanha")
        self.assertTrue(operations)
        self.assertIn("replace", edit_signature(operations))

    def test_surface_aggregation_preserves_multiple_occurrences(self) -> None:
        forms, entries, sources = frozen_maps(accepted_speaker=False)
        first = review_occurrence(
            candidate_row(), forms, entries, sources, 0.5, 0.7
        )
        second = {**first, "token_occurrence_id": "example-224:token:01"}
        surfaces = aggregate_surfaces([first, second])
        self.assertEqual(len(surfaces), 1)
        self.assertEqual(surfaces[0]["occurrence_count"], 2)

    def test_preconditions_require_bilingual_sentence_pairs(self) -> None:
        forms, entries, sources = frozen_maps(accepted_speaker=False)
        reviewed = review_occurrence(
            candidate_row(), forms, entries, sources, 0.5, 0.7
        )
        families = build_evidence_gap_families([reviewed])
        preconditions = build_sentence_pair_preconditions([reviewed])
        surfaces = aggregate_surfaces([reviewed])
        validate_zero_invariants([reviewed], surfaces, families, preconditions)
        self.assertEqual(len(preconditions), 2)
        for row in preconditions:
            contract = row["future_pair_contract"]
            self.assertIn("English-Wajarri", contract["required_unit"])
            self.assertFalse(contract["isolated_dictionary_mapping_counts_as_pair"])
            self.assertEqual(
                row["controlled_bilingual_english_wajarri_sentence_pairs_added"],
                0,
            )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from build_wajarri_douglas_paradigm_crosswalk import (
    RECORDED,
    build_crosswalk_rows,
    build_gap_summaries,
    classify_source,
    evidence_state,
    surface_score,
    validate_zero_invariants,
)


def current_form(
    form_id: str,
    entry_id: str,
    surface: str,
    *,
    status: str = "candidate",
    form_type: str = "published_headword",
) -> dict:
    return {
        "formCandidateId": form_id,
        "entryCandidateId": entry_id,
        "sourceRecordId": f"source-{form_id}",
        "surfaceSource": surface,
        "status": status,
        "formType": form_type,
        "orthography": "source-orthography",
        "variety": "source-variety",
    }


def historical_form() -> dict:
    return {
        "form_id": "historical-form-1",
        "cell_id": "historical-cell-1",
        "table_key": "table-3.4-irregular-verb-inflections",
        "row_key": "ya",
        "lexical_gloss": "go",
        "category": "present",
        "surface": "yanmanja",
        "evidence_status": RECORDED,
    }


class DouglasParadigmCrosswalkTests(unittest.TestCase):
    def test_surface_score_reports_normalized_and_literal_exactness(self) -> None:
        score = surface_score("Yanmanja", "yanmanja")
        self.assertTrue(score["normalized_exact"])
        self.assertTrue(score["literal_exact"])
        self.assertEqual(score["score"], 1.0)

    def test_source_class_keeps_historical_self_match_separate(self) -> None:
        form = current_form(
            "form-1",
            "entry-1",
            "yanmanja",
            form_type="historical_published_headword_or_variant_set",
        )
        entry = {"sourceId": "douglas"}
        self.assertEqual(
            classify_source(form, entry, {"source_type": "historical_dictionary"}),
            "same_douglas_historical_collection",
        )

    def test_speaker_exact_candidate_has_explicit_review_state(self) -> None:
        candidates = [
            {
                "source_class": "accepted_speaker_attributed_source",
                "surface_score": {"normalized_exact": True, "score": 1.0},
                "lexical_gloss_jaccard": 1.0,
            }
        ]
        self.assertEqual(
            evidence_state(candidates, 0.7),
            "speaker_attributed_exact_candidate_with_literal_gloss_overlap_needs_variety_and_feature_review",
        )

    def test_surface_exact_without_gloss_overlap_is_not_lexical_confirmation(self) -> None:
        candidates = [
            {
                "source_class": "accepted_speaker_attributed_source",
                "surface_score": {"normalized_exact": True, "score": 1.0},
                "lexical_gloss_jaccard": 0.0,
            }
        ]
        self.assertEqual(
            evidence_state(candidates, 0.7),
            "surface_exact_without_literal_gloss_overlap_needs_homophony_and_sense_review",
        )

    def test_dynamic_ranking_does_not_accept_correspondence(self) -> None:
        forms = [
            current_form("form-a", "entry-a", "yanmanja"),
            current_form("form-b", "entry-b", "yanaya"),
        ]
        entries = {
            "entry-a": {"entryCandidateId": "entry-a", "sourceId": "source-a"},
            "entry-b": {"entryCandidateId": "entry-b", "sourceId": "source-b"},
        }
        senses = {
            "entry-a": {
                "translations": ["go"],
                "definitions": [],
                "sense_ids": ["sense-a"],
            },
            "entry-b": {
                "translations": ["will go"],
                "definitions": [],
                "sense_ids": ["sense-b"],
            },
        }
        sources = {
            "source-a": {"source_type": "dictionary"},
            "source-b": {"source_type": "dictionary"},
        }
        rows = build_crosswalk_rows(
            [historical_form()],
            current_forms=forms,
            entries=entries,
            senses=senses,
            sources=sources,
            ranking={
                "candidate_limit": 2,
                "surface_weight": 0.85,
                "gloss_weight": 0.15,
                "ambiguity_gap_threshold": 0.05,
                "near_surface_score_at_least": 0.7,
            },
        )
        self.assertEqual(rows[0]["ranked_current_candidates"][0]["current_surface"], "yanmanja")
        self.assertEqual(
            rows[0]["current_correspondence_status"],
            "unadjudicated_candidates_only",
        )
        self.assertFalse(rows[0]["automatic_acceptance_allowed"])
        self.assertEqual(
            rows[0]["controlled_bilingual_english_wajarri_sentence_pairs_added"],
            0,
        )

    def test_gap_summary_preserves_all_member_states(self) -> None:
        rows = [
            {
                "row_key": "ya",
                "lexical_gloss": "go",
                "category": "present",
                "evidence_state": "state-a",
                "diagnostics": {
                    "top_normalized_exact": True,
                    "rank_ambiguous": False,
                    "exact_candidate_with_literal_gloss_overlap_count": 1,
                },
            },
            {
                "row_key": "ya",
                "lexical_gloss": "go",
                "category": "past",
                "evidence_state": "state-b",
                "diagnostics": {
                    "top_normalized_exact": False,
                    "rank_ambiguous": True,
                    "exact_candidate_with_literal_gloss_overlap_count": 0,
                },
            },
        ]
        summary = build_gap_summaries(rows)[0]
        self.assertEqual(summary["recorded_historical_forms_reviewed"], 2)
        self.assertEqual(summary["evidence_state_counts"], {"state-a": 1, "state-b": 1})

    def test_zero_invariants_reject_pair_issuance(self) -> None:
        with self.assertRaisesRegex(ValueError, "must not issue"):
            validate_zero_invariants(
                [[{
                    "controlled_bilingual_english_wajarri_sentence_pairs_added": 1,
                    "training_eligibility": "not_allowed",
                }]]
            )


if __name__ == "__main__":
    unittest.main()

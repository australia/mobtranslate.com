from __future__ import annotations

import unittest

from build_wajarri_douglas_correspondence_candidates import (
    aggregate_current_senses,
    best_surface_score,
    rank_current_candidates,
    score_band,
    surface_projections,
    token_rows,
)


class DouglasCorrespondenceCandidateTests(unittest.TestCase):
    def test_projects_hyphenated_inflection_without_claiming_a_stem(self) -> None:
        projections = surface_projections("ngurlumanmanja-rna-ø")
        self.assertEqual(
            [row["projection_kind"] for row in projections],
            [
                "full_surface",
                "hyphen_prefix_1",
                "hyphen_prefix_2",
            ],
        )
        self.assertEqual(projections[1]["surface"], "ngurlumanmanja")

    def test_exact_projection_outranks_prefix_similarity(self) -> None:
        projections = surface_projections("papa-ø")
        exact = best_surface_score(projections, "papa")
        nearby = best_surface_score(projections, "paparna")
        self.assertTrue(exact["normalized_exact_projection"])
        self.assertTrue(exact["literal_exact_projection"])
        self.assertEqual(exact["score"], 1.0)
        self.assertGreater(exact["score"], nearby["score"])

    def test_source_gloss_is_only_positionally_proposed_at_equal_length(self) -> None:
        base = {
            "review_id": "review-1",
            "example_number": 59,
            "source": {},
            "curation_context": {"phenomenon_tags": ["dative"]},
            "historical_source_record": {
                "historical_wajarri_text": "tjutju-kila palu wangkanja yanayiku",
                "source_morpheme_gloss": "dog-DAT he tell-PAST come-PURP",
                "source_free_translation": "He told the dog to come.",
            },
        }
        rows = token_rows([base])
        self.assertEqual(rows[0]["positional_source_gloss"], "dog-DAT")
        self.assertEqual(
            rows[0]["source_gloss_alignment_status"],
            "positionally_aligned_candidate_not_validated",
        )
        base["historical_source_record"]["source_morpheme_gloss"] = (
            "dog-DAT he tell PAST come-PURP"
        )
        rows = token_rows([base])
        self.assertIsNone(rows[0]["positional_source_gloss"])

    def test_ranked_current_candidate_remains_unadjudicated(self) -> None:
        token = {
            "surface_projections": surface_projections("njarlu-ngku"),
            "positional_source_gloss": "woman-ERG",
            "source_free_translation": "The woman hit the dog.",
        }
        forms = [
            {
                "entryCandidateId": "woman-entry",
                "formCandidateId": "woman-form",
                "surfaceSource": "njarlu",
            },
            {
                "entryCandidateId": "unrelated-entry",
                "formCandidateId": "unrelated-form",
                "surfaceSource": "kuka",
            },
        ]
        senses = aggregate_current_senses(
            [
                {
                    "entryCandidateId": "woman-entry",
                    "senseCandidateId": "woman-sense",
                    "translationSource": "woman",
                    "definitionSource": "adult female person",
                },
                {
                    "entryCandidateId": "unrelated-entry",
                    "senseCandidateId": "unrelated-sense",
                    "translationSource": "meat",
                    "definitionSource": "meat",
                },
            ]
        )
        ranked = rank_current_candidates(token, forms, senses, 2)
        self.assertEqual(ranked[0]["entry_candidate_id"], "woman-entry")
        self.assertFalse(ranked[0]["automatic_acceptance_allowed"])
        self.assertEqual(ranked[0]["relation_status"], "unadjudicated_candidate")

    def test_surface_bands_do_not_imply_acceptance(self) -> None:
        self.assertEqual(score_band(1.0, True), "normalized_exact_projection")
        self.assertEqual(score_band(0.86, False), "very_high_surface_candidate")
        self.assertEqual(score_band(0.71, False), "high_surface_candidate")
        self.assertEqual(score_band(0.51, False), "moderate_surface_candidate")
        self.assertEqual(score_band(0.49, False), "weak_surface_candidate")


if __name__ == "__main__":
    unittest.main()

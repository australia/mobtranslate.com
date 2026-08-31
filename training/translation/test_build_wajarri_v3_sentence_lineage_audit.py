from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_sentence_lineage_audit import (
    build_holdout_composition_rows,
    build_private_synthetic_lineage,
    build_selected_sentence_presentations,
    normalize_surface,
)


class BuildWajarriV3SentenceLineageAuditTest(unittest.TestCase):
    def test_surface_normalization_is_unicode_case_and_punctuation_stable(self) -> None:
        self.assertEqual(normalize_surface("  MAMA.  "), "mama")
        self.assertEqual(normalize_surface("Ma\u0304ma"), normalize_surface("Māma"))

    def test_private_parent_detects_public_holdout_pair_collision(self) -> None:
        private_rows = [
            {
                "id": "wbv-v2-synthetic:legacy",
                "input_text": "<translate> The father is good.",
                "output_text": "Mama barndi.",
                "pair_kind": "controlled_research_synthetic_sentence",
                "split": "train",
                "construction_family": "stative-good",
                "template_id": "template:good",
                "rights_tier": "public_generated",
            }
        ]
        public_provenance = [
            {
                "row_id": "wbv-synthetic-pair:rich",
                "input_text": "<translate> The father is good.",
                "output_text": "Mama barndi.",
                "split": "holdout",
                "provenance_class": "inline_explicit_binding_provenance",
            }
        ]
        sentence_reviews = [{"id": "wbv-v2-synthetic:legacy"}]
        compatibility_reviews = [
            {
                "review_id": "wbv-v2-compatibility:legacy",
                "decision": "include_research_synthetic",
            }
        ]

        rows = build_private_synthetic_lineage(
            private_rows,
            public_provenance,
            sentence_reviews,
            compatibility_reviews,
        )

        self.assertEqual(
            rows[0]["parent_visibility"],
            "private_parent_id_with_public_pair_duplicate",
        )
        self.assertTrue(rows[0]["public_holdout_pair_collision"])
        self.assertEqual(rows[0]["public_pair_duplicate_ids"], ["wbv-synthetic-pair:rich"])

    def test_selected_schedule_rejects_unknown_synthetic_parent(self) -> None:
        schedule = [
            {
                "id": "presentation:1",
                "schedule_role": "sentence_context_retention",
                "pair_kind": "synthetic_candidate",
                "accounting_parent_id": "missing-parent",
            }
        ]

        with self.assertRaisesRegex(ValueError, "absent from private training data"):
            build_selected_sentence_presentations(schedule, 1, [])

    def test_holdout_keeps_evaluation_and_public_pair_provenance_separate(self) -> None:
        corpus = [
            {
                "id": "wbv-synthetic-pair:rich",
                "input_text": "<translate> The father is good.",
                "output_text": "Mama barndi.",
                "split": "holdout",
                "construction_family": "stative-good",
            }
        ]
        provenance = [
            {
                "row_id": "wbv-synthetic-pair:rich",
                "input_text": "<translate> The father is good.",
                "output_text": "Mama barndi.",
                "split": "holdout",
                "provenance_class": "inline_explicit_binding_provenance",
            }
        ]
        predictions = [
            {
                "id": "wbv-v2-synthetic:legacy",
                "input_text": "<translate> The father is good.",
                "accepted_references": ["Mama barndi."],
                "prediction": "Baba barndi.",
                "exact": False,
                "construction_family": "stative-good",
                "template_id": "template:good",
                "source_record_ids": ["wbv-src-local-000001-sense-candidate"],
            }
        ]
        source_outcomes = [
            {
                "source_record_id": "wbv-src-local-000001",
                "source_target": "mama",
                "direct": {"prediction": "mama", "source_target_exact": True},
                "context": {"source_target_exact": True},
            }
        ]
        sentence_reviews = [{"id": "wbv-v2-synthetic:legacy"}]
        compatibility_reviews = [
            {
                "review_id": "wbv-v2-compatibility:legacy",
                "decision": "include_research_synthetic",
            }
        ]

        rows = build_holdout_composition_rows(
            predictions,
            source_outcomes,
            corpus,
            provenance,
            sentence_reviews,
            compatibility_reviews,
        )

        self.assertEqual(rows[0]["corpus_identity_resolution"], "normalized_pair_duplicate")
        self.assertEqual(
            rows[0]["evaluation_provenance_class"],
            "external_review_ledger_provenance",
        )
        self.assertEqual(
            rows[0]["public_corpus_provenance_class"],
            "inline_explicit_binding_provenance",
        )
        self.assertTrue(rows[0]["lexical_direct_source_target_exact"])
        self.assertFalse(rows[0]["sentence_exact"])


if __name__ == "__main__":
    unittest.main()

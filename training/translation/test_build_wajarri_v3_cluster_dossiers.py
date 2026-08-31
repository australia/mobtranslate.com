from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_cluster_dossiers import build_dossiers


class BuildWajarriV3ClusterDossiersTest(unittest.TestCase):
    def fixtures(self) -> tuple[dict, dict]:
        contract = {
            "clusters": [
                {
                    "cluster_id": "cluster:butterfly",
                    "english_lemma": "butterfly",
                    "source_form_id": "form:1",
                    "source_target": "birdi-birdi",
                    "local_source_record_ids": ["local:1"],
                    "diagnostic_source_record_id": "local:1",
                    "sentence_row_ids": ["sentence:1"],
                    "live_probe_ids": ["probe:1"],
                    "analyst_disposition": {
                        "reference_status": (
                            "source_scoped_only_pending_cross_source_adjudication"
                        ),
                        "sealed_test_eligible": False,
                    },
                }
            ]
        }
        resolved = {
            "open_source_lexemes": [
                {
                    "source_form_id": "form:1",
                    "input_text": "<lexeme> butterfly",
                    "output_text": "birdi-birdi",
                    "source_id": "source:1",
                    "license": "CC BY 4.0",
                    "part_of_speech_status": "not_provided_not_inferred",
                    "sentence_slot_eligible": False,
                }
            ],
            "source_census": [
                {
                    "sourceRecordId": "local:1",
                    "sourcePromptCandidate": {"source": "butterfly"},
                    "sourceTargetCandidate": {"source": "birdi-birdi"},
                    "trainingEligibility": "not_allowed",
                    "blockerCodes": ["source_mapping_unadjudicated"],
                }
            ],
            "source_record_outcomes": [
                {
                    "source_record_id": "local:1",
                    "source_prompt": "butterfly",
                    "source_target": "birdi-birdi",
                    "direct": {"prediction": "birrbirr"},
                    "context": {"prediction": "birrbirri"},
                    "outcome_class": "neither_exact",
                }
            ],
            "holdout_composition": [
                {
                    "row_id": "sentence:1",
                    "expected_subject": "birdi-birdi",
                    "input_text": "<translate> The butterfly is good.",
                    "reference": "Birdi-birdi barndi.",
                    "sentence_prediction": "Birrbirri barndi.",
                    "sentence_exact": False,
                    "construction_family": "stative-good",
                }
            ],
            "live_probes": [
                {
                    "probe_id": "probe:1",
                    "cluster_id": "cluster:butterfly",
                    "task": "lexeme",
                    "text": "butterfly",
                    "translation": "birrbirr",
                    "accepted_exact": False,
                    "frozen_prediction_match": True,
                }
            ],
        }
        return contract, resolved

    def test_dossier_keeps_source_forms_and_model_surfaces_separate(self) -> None:
        contract, resolved = self.fixtures()

        dossier = build_dossiers(contract, resolved)[0]

        self.assertEqual(dossier["source_scoped_mapping"]["target"], "birdi-birdi")
        self.assertEqual(dossier["local_accepted_target_candidates"], ["birdi-birdi"])
        self.assertIn("birrbirr", dossier["observed_model_surfaces"])
        self.assertFalse(dossier["analyst_disposition"]["sealed_test_eligible"])

    def test_dossier_rejects_sentence_subject_mismatch(self) -> None:
        contract, resolved = self.fixtures()
        resolved["holdout_composition"][0]["expected_subject"] = "another-form"

        with self.assertRaisesRegex(ValueError, "sentence subject mismatch"):
            build_dossiers(contract, resolved)


if __name__ == "__main__":
    unittest.main()

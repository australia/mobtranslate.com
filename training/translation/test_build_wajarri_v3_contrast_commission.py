from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_contrast_commission import (
    build_glossary_pair,
    build_pair,
    validate_partitions,
    validate_subject,
)


class BuildWajarriV3ContrastCommissionTest(unittest.TestCase):
    def test_subject_requires_one_target_exact_baseline_and_audio(self) -> None:
        spec = {
            "subject_id": "bilby",
            "split": "training",
            "english_surface": "The bilby",
            "glossary_english_surface": "bilby",
            "source_prompt": "bilby",
            "target_surface": "marruwa",
            "source_record_id": "s1",
            "semantic_class": "mammal",
            "semantic_compatibility_review": "bounded review",
            "audio_sha256": "not-used-in-this-test",
        }
        dispositions = [
            {
                "sourceRecordId": "s1",
                "sourcePrompt": "bilby",
                "sourceTarget": "marruwa",
                "sourceDefinition": "bilby",
                "sourceRecordSha256": "source-hash",
                "benchmarkEligibility": {"unconditionedPromptReconstruction": True},
            }
        ]
        baselines = [
            {
                "id": "b1",
                "source_record_ids": ["s1"],
                "ambiguity_class": "one_target",
                "exact": True,
                "prediction": "marruwa",
            }
        ]
        outcomes = [
            {
                "source_record_id": "s1",
                "direct": {"ambiguity_class": "one_target", "source_target_exact": True},
                "evidence_coverage": {"verifiedAudioLinks": 1},
            }
        ]
        baselines[0]["exact"] = False
        with self.assertRaisesRegex(ValueError, "baseline is not exact"):
            validate_subject(spec, dispositions, baselines, outcomes, [], None, "audio")  # type: ignore[arg-type]

    def test_pair_and_glossary_share_target_but_not_input(self) -> None:
        subject = {
            "subject_id": "bilby",
            "family_id": "family:bilby",
            "split": "training",
            "english_surface": "The bilby",
            "glossary_english_surface": "bilby",
            "target_surface": "marruwa",
            "source_record_id": "s1",
        }
        predicate = {
            "predicate_id": "coming-towards-speaker",
            "contrast_family": "deictic_motion",
            "english_clause": "is coming towards the speaker",
            "glossary_english_surface": "coming towards the speaker",
            "target_surface": "yanajimanha",
            "source_record_id": "p1",
            "evidence_grade": "B",
        }
        contract = {
            "grammar_synthesis_id": "g1",
            "template_precedent_ids": ["t1"],
            "row_claim_limit": "synthetic",
        }
        pair = build_pair(subject, predicate, contract)
        glossary = build_glossary_pair(pair, subject, predicate)
        self.assertEqual(pair["output_text"], "marruwa yanajimanha.")
        self.assertEqual(glossary["output_text"], pair["output_text"])
        self.assertNotEqual(glossary["input_text"], pair["input_text"])
        self.assertIn("<glossary>", glossary["input_text"])
        self.assertTrue(pair["approved_for_training"])

    def test_partition_validator_rejects_family_leakage(self) -> None:
        rows = [
            {
                "id": "a",
                "split": "training",
                "family_id": "f1",
                "input_text": "<translate> A.",
                "output_text": "A.",
            },
            {
                "id": "b",
                "split": "development",
                "family_id": "f1",
                "input_text": "<translate> B.",
                "output_text": "B.",
            },
        ]
        with self.assertRaisesRegex(ValueError, "family leakage"):
            validate_partitions(rows)


if __name__ == "__main__":
    unittest.main()

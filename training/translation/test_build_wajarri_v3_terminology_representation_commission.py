from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_terminology_representation_commission import (
    baseline_facts,
    build_representation,
    validate_partitions,
)


class BuildWajarriV3TerminologyRepresentationCommissionTest(unittest.TestCase):
    def test_baseline_facts_requires_single_source_one_target_exact(self) -> None:
        rows = [
            {
                "id": "ambiguous",
                "source_record_ids": ["s1", "s2"],
                "ambiguity_class": "multiple_accepted_targets",
                "exact": True,
                "prediction": "mama",
            }
        ]
        facts = baseline_facts("s1", "mama", rows)
        self.assertFalse(facts["strict_one_target_exact"])

    def test_representations_preserve_target_and_parent(self) -> None:
        pair = {
            "id": "p1",
            "input_text": "<translate> The dog is standing.",
            "output_text": "duthu garrimanha.",
        }
        subject = {
            "english_surface": "The dog",
            "glossary_english_surface": "dog",
            "target_surface": "duthu",
        }
        predicate = {
            "english_clause": "is standing",
            "glossary_english_surface": "standing",
            "target_surface": "garrimanha",
        }
        suffix = build_representation(pair, subject, predicate, "suffix")
        inline = build_representation(pair, subject, predicate, "inline_annotation")
        placeholder = build_representation(
            pair, subject, predicate, "placeholder_glossary"
        )
        for row in (suffix, inline, placeholder):
            self.assertEqual(row["output_text"], pair["output_text"])
            self.assertEqual(row["parent_row_id"], "p1")
            self.assertFalse(row["creates_new_target_sentence"])
        self.assertIn("dog = duthu", suffix["input_text"])
        self.assertIn("[duthu]", inline["input_text"])
        self.assertIn("<T0> = duthu", placeholder["input_text"])

    def test_partition_validator_rejects_family_leakage(self) -> None:
        training = [
            {
                "id": "a",
                "family_id": "f1",
                "input_text": "<translate> A.",
                "output_text": "A.",
            }
        ]
        development = [
            {
                "id": "b",
                "family_id": "f1",
                "input_text": "<translate> B.",
                "output_text": "B.",
            }
        ]
        with self.assertRaisesRegex(ValueError, "family leakage"):
            validate_partitions(training, development)


if __name__ == "__main__":
    unittest.main()

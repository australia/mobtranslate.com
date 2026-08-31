from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_fresh_subject_development import (
    build_cells,
    validate_subject,
)


class BuildWajarriV3FreshSubjectDevelopmentTest(unittest.TestCase):
    def test_subject_requires_exact_one_target_baseline(self) -> None:
        spec = {
            "subject_id": "dingo",
            "english_subject": "The dingo",
            "source_prompt": "dingo",
            "target_surface": "Ngubanu",
            "source_record_id": "s1",
            "semantic_compatibility_review": "animate terrestrial subject",
        }
        dispositions = [
            {
                "sourceRecordId": "s1",
                "sourcePrompt": "dingo",
                "sourceTarget": "ngubanu",
                "sourceDefinition": "dingo",
                "sourceRecordSha256": "abc",
                "benchmarkEligibility": {"unconditionedPromptReconstruction": True},
            }
        ]
        baseline = [
            {
                "id": "b1",
                "source_record_ids": ["s1"],
                "ambiguity_class": "one_target",
                "exact": True,
                "prediction": "ngubanu",
            }
        ]
        reviewed = validate_subject(spec, dispositions, baseline)
        self.assertTrue(reviewed["baseline_exact"])
        baseline[0]["exact"] = False
        with self.assertRaisesRegex(ValueError, "not exact"):
            validate_subject(spec, dispositions, baseline)

    def test_cells_are_cartesian_and_development_only(self) -> None:
        subjects = [
            {
                "subject_id": "dingo",
                "english_subject": "The dingo",
                "target_surface": "Ngubanu",
                "source_record_id": "s1",
            }
        ]
        predicates = [
            {
                "predicate_id": "running",
                "english_clause": "is running",
                "target_surface": "jamarnimanha",
                "source_record_id": "p1",
            },
            {
                "predicate_id": "standing",
                "english_clause": "is standing",
                "target_surface": "garrimanha",
                "source_record_id": "p2",
            },
        ]
        rows = build_cells(subjects, predicates)
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["training_eligibility"] == "not_allowed" for row in rows))
        self.assertEqual(rows[0]["output_text"].split()[0], "Ngubanu")


if __name__ == "__main__":
    unittest.main()

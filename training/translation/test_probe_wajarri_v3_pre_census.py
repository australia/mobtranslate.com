import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("probe_wajarri_v3_pre_census.py")
SPEC = importlib.util.spec_from_file_location("probe_wajarri_v3_pre_census", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def realization(realization_id, english, target, slot):
    return {
        "realization_id": realization_id,
        "english_surface": english,
        "target_surface": target,
        "part_of_speech": "test",
        "slot_classes": [slot],
        "source_record_ids": [f"source:{realization_id}"],
    }


def candidate():
    return {
        "pairId": "pair:1",
        "reviewId": "review:1",
        "constructionFamily": "family:1",
        "sourceText": "The child is going.",
        "targetText": "mayu yanmanha.",
        "bindings": {"subject": "subject:child", "predicate": "predicate:going"},
        "acceptanceStatus": "candidate_preview_only",
        "trainingEligibility": "not_allowed",
    }


class PreCensusProbeTests(unittest.TestCase):
    def setUp(self):
        self.realizations = {
            "subject:child": realization(
                "subject:child", "child", "mayu", "nominative-common-noun-subject"
            ),
            "subject:dog": realization(
                "subject:dog", "dog", "duthu", "nominative-common-noun-subject"
            ),
            "predicate:going": realization(
                "predicate:going", "going", "yanmanha", "present-intransitive-predicate"
            ),
            "predicate:sitting": realization(
                "predicate:sitting", "sitting", "nyinamanha", "present-intransitive-predicate"
            ),
        }

    def test_validate_candidate_requires_bound_target(self):
        row = candidate()
        MODULE.validate_candidates([row], self.realizations)
        row["targetText"] = "duthu yanmanha."
        with self.assertRaisesRegex(ValueError, "target does not match"):
            MODULE.validate_candidates([row], self.realizations)

    def test_merge_realizations_unions_review_notes_but_rejects_surface_conflict(self):
        first = realization(
            "predicate:going", "going", "yanmanha", "present-intransitive-predicate"
        )
        first["limitations"] = ["review one"]
        second = dict(first)
        second["limitations"] = ["review two"]
        merged = MODULE.merge_realizations([first, second])
        self.assertEqual(merged["predicate:going"]["limitations"], ["review one", "review two"])
        second["target_surface"] = "different"
        with self.assertRaisesRegex(ValueError, "target_surface"):
            MODULE.merge_realizations([first, second])

    def test_exact_sentence_preserves_both_slots(self):
        row = MODULE.score_sentence(
            candidate(),
            {"translation": "Mayu yanmanha."},
            10,
            self.realizations,
            {"mayu", "duthu"},
            {"yanmanha", "nyinamanha"},
        )
        self.assertTrue(row["exact"])
        self.assertTrue(row["both_expected_slots_present"])
        self.assertEqual(row["failure_codes"], [])

    def test_known_slot_substitution_is_identified(self):
        row = MODULE.score_sentence(
            candidate(),
            {"translation": "Duthu nyinamanha."},
            10,
            self.realizations,
            {"mayu", "duthu"},
            {"yanmanha", "nyinamanha"},
        )
        self.assertFalse(row["exact"])
        self.assertIn("known_subject_substitution", row["failure_codes"])
        self.assertIn("known_predicate_substitution", row["failure_codes"])

    def test_failure_cluster_keeps_lexeme_and_sentence_results_separate(self):
        sentence = MODULE.score_sentence(
            candidate(),
            {"translation": "Mayu nyinamanha."},
            10,
            self.realizations,
            {"mayu", "duthu"},
            {"yanmanha", "nyinamanha"},
        )
        lexemes = {
            "subject:child": {"realization_id": "subject:child", "english_surface": "child", "expected_surface": "mayu", "exact": True},
            "predicate:going": {"realization_id": "predicate:going", "english_surface": "going", "expected_surface": "yanmanha", "exact": True},
        }
        clusters = MODULE.build_failure_clusters([sentence], lexemes)
        predicate = next(row for row in clusters if row["role"] == "predicate")
        self.assertTrue(predicate["lexeme_exact"])
        self.assertEqual(predicate["sentence_failures"], 1)
        self.assertEqual(predicate["expected_slot_missing"], 1)


if __name__ == "__main__":
    unittest.main()

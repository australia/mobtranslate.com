import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("analyze_wajarri_v3_pre_census_lineage.py")
SPEC = importlib.util.spec_from_file_location(
    "analyze_wajarri_v3_pre_census_lineage", MODULE_PATH
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PreCensusLineageTests(unittest.TestCase):
    def test_task_prefix_and_unicode_tokenization(self):
        self.assertEqual(
            MODULE.text_tokens("<translate> I’m going home."), ["i’m", "going", "home"]
        )

    def test_tfidf_nearest_row_prefers_shared_content(self):
        sentences = [
            {
                "pair_id": "p1",
                "source_text": "The child is going.",
                "reference": "Mayu yanmanha.",
                "prediction": "Jura yanmanha.",
            }
        ]
        schedule = [
            {
                "id": "s1",
                "task": "translate",
                "input_text": "<translate> The dog is cold.",
                "output_text": "Duthu janda.",
                "pair_kind": "synthetic",
            },
            {
                "id": "s2",
                "task": "translate",
                "input_text": "<translate> The child is going away.",
                "output_text": "Jura yanmanha.",
                "pair_kind": "synthetic",
            },
        ]
        nearest = MODULE.nearest_training_rows(sentences, schedule, 1)
        self.assertEqual(
            nearest[0]["nearest_selected_checkpoint_rows"][0]["presentation_id"], "s2"
        )

    def test_prompt_conflicts_are_exact_prompt_groups(self):
        schedule = [
            {"id": "a", "task": "translate", "input_text": "<translate> The child is cold.", "output_text": "Mayu janda.", "pair_kind": "x"},
            {"id": "b", "task": "translate", "input_text": "<translate> the child is cold", "output_text": "Jura janda.", "pair_kind": "y"},
            {"id": "c", "task": "lexeme", "input_text": "<lexeme> child", "output_text": "mayu", "pair_kind": "z"},
        ]
        conflicts = MODULE.build_prompt_conflicts(schedule)
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]["distinct_targets"], 2)


if __name__ == "__main__":
    unittest.main()

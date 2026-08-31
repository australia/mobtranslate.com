from __future__ import annotations

import unittest

from training.translation.probe_wajarri_v3_glossary_space import (
    condition_text,
    score_prediction,
    summarize_pairs,
    verify_identity,
)


def row() -> dict:
    return {
        "id": "g1",
        "cell_id": "c1",
        "parent_row_id": "p1",
        "subject_id": "aunt",
        "predicate_id": "standing",
        "unconditioned_input_text": "<translate> The aunt is standing.",
        "input_text": "<translate> The aunt is standing. <glossary> aunt = Maraji; standing = garrimanha",
        "output_text": "Maraji garrimanha.",
    }


class ProbeWajarriV3GlossarySpaceTest(unittest.TestCase):
    def test_endpoint_text_omits_prefix_added_by_runtime(self) -> None:
        self.assertEqual(condition_text(row(), "plain"), "The aunt is standing.")
        self.assertTrue(condition_text(row(), "glossary").endswith("standing = garrimanha"))

    def test_score_tracks_both_expected_slots(self) -> None:
        score = score_prediction(row(), "glossary", "Maraji garrimanha")
        self.assertTrue(score["exact"])
        self.assertTrue(score["both_expected_slots_present"])

    def test_pair_summary_reports_glossary_gain(self) -> None:
        plain = score_prediction(row(), "plain", "Maraji yanmanha")
        glossary = score_prediction(row(), "glossary", "Maraji garrimanha")
        result = summarize_pairs([plain, glossary])
        self.assertEqual(result["exact"]["gained"], 1)
        self.assertEqual(result["subject_present"]["retained"], 1)

    def test_identity_is_fail_closed(self) -> None:
        contract = {
            "expected_identity": {
                "language_code": "wajarri",
                "model_id": "model",
                "model_version": "version",
                "source_lang": "eng_Latn",
                "target_lang": "wbv_Latn",
            }
        }
        payload = {
            "languageCode": "wajarri",
            "modelId": "model",
            "model": "version",
            "sourceLang": "eng_Latn",
            "targetLang": "wbv_Latn",
            "task": "translate",
            "translation": "result",
        }
        verify_identity(payload, contract)
        payload["model"] = "wrong"
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            verify_identity(payload, contract)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from training.translation.probe_wajarri_v3_live_clusters import (
    score_probe,
    summarize,
    validate_model_info,
)


class ProbeWajarriV3LiveClustersTest(unittest.TestCase):
    def test_score_separates_reference_exactness_from_backend_reproduction(self) -> None:
        row = score_probe(
            {
                "probe_id": "probe:1",
                "cluster_id": "cluster:1",
                "task": "lexeme",
                "text": "sandhill",
                "accepted_references": ["dungguru", "thungguru"],
                "frozen_prediction": "nyilira",
            },
            {"translation": "nyili"},
        )

        self.assertFalse(row["accepted_exact"])
        self.assertFalse(row["frozen_prediction_match"])

    def test_summary_reports_backend_mismatch_and_runtime(self) -> None:
        rows = [
            {
                "probe_id": "probe:1",
                "accepted_exact": False,
                "frozen_prediction_match": False,
                "wall_ms": 200,
            },
            {
                "probe_id": "probe:2",
                "accepted_exact": True,
                "frozen_prediction_match": True,
                "wall_ms": 100,
            },
            {
                "probe_id": "probe:3",
                "accepted_exact": False,
                "frozen_prediction_match": None,
                "wall_ms": 300,
            },
        ]

        result = summarize(
            rows,
            {"status": {"device": "cpu", "dtype": "bfloat16"}},
        )

        self.assertEqual(result["accepted_exact"], 1)
        self.assertEqual(result["frozen_comparable_rows"], 2)
        self.assertEqual(result["frozen_prediction_mismatches"], 1)
        self.assertEqual(result["mismatch_probe_ids"], ["probe:1"])
        self.assertEqual(result["api_wall_ms_median"], 200)
        self.assertEqual(result["serving_device"], "cpu")

    def test_model_info_validation_is_decoder_bound(self) -> None:
        contract = {
            "language": "wajarri",
            "model": {
                "model_id": "model-v2",
                "version": "version-v2",
                "revision": "revision-v2",
                "base_revision": "base-v1",
                "tasks": {"lexeme": {"numBeams": 1}},
            },
        }
        model_info = {
            "languageCode": "wajarri",
            "modelId": "model-v2",
            "version": "version-v2",
            "revision": "revision-v2",
            "baseRevision": "base-v1",
            "tasks": {"lexeme": {"numBeams": 4}},
        }

        with self.assertRaisesRegex(ValueError, "decoder mismatch"):
            validate_model_info(model_info, contract)


if __name__ == "__main__":
    unittest.main()

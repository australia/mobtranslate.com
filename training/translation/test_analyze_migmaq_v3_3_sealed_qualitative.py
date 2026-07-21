from __future__ import annotations

import unittest

from analyze_migmaq_v3_3_sealed_qualitative import (
    cluster_bootstrap,
    nearest_training_source,
)


class SealedQualitativeTests(unittest.TestCase):
    def test_cluster_bootstrap_preserves_positive_direction(self) -> None:
        rows = [
            {
                "id": f"row-{index}",
                "split_component_id": f"component-{index % 2}",
                "reference": "alpha beta",
                "predictions": {
                    "base": "wrong",
                    "retention": "alpha",
                    "candidate": "alpha beta",
                },
            }
            for index in range(6)
        ]
        result = cluster_bootstrap(
            rows,
            cluster_field="split_component_id",
            control="retention",
            samples=100,
            seed=7,
        )
        self.assertGreater(result["percentile_90_interval"]["low"], 0)
        self.assertEqual(result["positive_clusters"], 2)

    def test_nearest_training_source(self) -> None:
        unique = {
            "where are you": {"where", "are", "you"},
            "the dog ran": {"the", "dog", "ran"},
        }
        inverted = {
            "where": {"where are you"},
            "are": {"where are you"},
            "you": {"where are you"},
            "dog": {"the dog ran"},
        }
        result = nearest_training_source(
            ["where", "were", "you"],
            "Where were you?",
            unique,
            inverted,
        )
        self.assertEqual(result["source"], "where are you")
        self.assertFalse(result["exact"])


if __name__ == "__main__":
    unittest.main()

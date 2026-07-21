from __future__ import annotations

import unittest

from compare_migmaq_v3_3_sealed_test import (
    aligned_rows,
    paired_chrf_bootstrap,
    sealed_decision,
    sentence_metrics,
)


def payload(predictions: list[str]) -> dict[str, object]:
    references = ["alpha beta", "gamma delta", "epsilon zeta", "eta theta"]
    rows = [
        {
            "id": f"row-{index}",
            "split": "test",
            "task": "translate",
            "input_text": f"source {index}",
            "output_text": reference,
            "reference": reference,
            "prediction": prediction,
            "lesson_id": "lesson-1",
            "split_component_id": "component-1",
        }
        for index, (reference, prediction) in enumerate(
            zip(references, predictions, strict=True)
        )
    ]
    return {"metrics": {"rows": len(rows)}, "predictions": rows}


class SealedComparatorTests(unittest.TestCase):
    def test_passing_candidate(self) -> None:
        base = payload(["wrong", "wrong", "wrong", "wrong"])
        retention = payload(["alpha", "gamma", "epsilon", "eta"])
        candidate = payload(["alpha beta", "gamma delta", "epsilon zeta", "eta theta"])
        rows = aligned_rows(
            {"base": base, "retention": retention, "candidate": candidate}
        )
        metrics = {
            arm: sentence_metrics(rows, arm)
            for arm in ("base", "retention", "candidate")
        }
        bootstraps = {
            "candidate_vs_retention": paired_chrf_bootstrap(
                rows,
                control="retention",
                treatment="candidate",
                samples=200,
                seed=1,
            ),
            "candidate_vs_base": paired_chrf_bootstrap(
                rows,
                control="base",
                treatment="candidate",
                samples=200,
                seed=2,
            ),
        }
        decision = sealed_decision(metrics, bootstraps)
        self.assertTrue(decision["passed"])
        self.assertFalse(decision["homepage_or_api_deployment_authorized"])

    def test_alignment_rejects_changed_reference(self) -> None:
        base = payload(["wrong"] * 4)
        retention = payload(["wrong"] * 4)
        candidate = payload(["wrong"] * 4)
        candidate["predictions"][0]["reference"] = "changed"
        with self.assertRaisesRegex(ValueError, "reference changed"):
            aligned_rows({"base": base, "retention": retention, "candidate": candidate})


if __name__ == "__main__":
    unittest.main()

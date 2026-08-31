from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from training.translation.evaluate_wajarri_v3_lexical_sentinels import (
    load_sentinels,
    score_row,
    summarize,
)


def pair(anchor_id: str, *, mandatory: bool = False) -> dict:
    return {
        "pair_id": f"pair-{anchor_id}",
        "mandatory_regression_anchor": mandatory,
        "anchor": {
            "id": anchor_id,
            "input_text": f"<lexeme> {anchor_id}",
            "output_text": f"target-{anchor_id}",
            "reference_token_length_bucket": "2",
            "baseline_exact": True,
            "source_record_ids": [f"source-{anchor_id}"],
        },
    }


class EvaluateWajarriV3LexicalSentinelsTest(unittest.TestCase):
    def test_loader_binds_counts_and_baseline_exact(self) -> None:
        with TemporaryDirectory() as temporary:
            path = Path(temporary) / "pairs.jsonl"
            path.write_text(
                "\n".join(json.dumps(value) for value in [pair("a", mandatory=True), pair("b")])
                + "\n",
                encoding="utf-8",
            )
            rows = load_sentinels(path, 2, 1)
            self.assertEqual([row["anchor_id"] for row in rows], ["a", "b"])
            value = pair("c")
            value["anchor"]["baseline_exact"] = False
            path.write_text(json.dumps(value) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "not exact at baseline"):
                load_sentinels(path, 1, 0)

    def test_loader_rejects_duplicate_anchors(self) -> None:
        with TemporaryDirectory() as temporary:
            path = Path(temporary) / "pairs.jsonl"
            path.write_text(
                json.dumps(pair("a")) + "\n" + json.dumps(pair("a")) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "duplicate"):
                load_sentinels(path, 2, 0)

    def test_scoring_and_summary_keep_mandatory_population_separate(self) -> None:
        base = {
            "anchor_id": "a",
            "input_text": "<lexeme> shoes",
            "output_text": "jinabuga",
            "mandatory_regression_anchor": True,
            "reference_token_length_bucket": "2",
        }
        exact = score_row(base, "Jinabuga", [1, 2], {0})
        lost = score_row(
            {**base, "anchor_id": "b", "mandatory_regression_anchor": False},
            "jinabu",
            [1, 2],
            {0},
        )
        metrics = summarize([exact, lost])
        self.assertEqual(metrics["exact"], 1)
        self.assertEqual(metrics["mandatory"]["exact"], 1)
        self.assertEqual(metrics["nonmandatory"]["exact"], 0)


if __name__ == "__main__":
    unittest.main()

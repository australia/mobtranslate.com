from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest


def write_jsonl(path: Path, rows: list[dict]) -> dict[str, object]:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )
    return {
        "path": str(path.name),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "rows": len(rows),
    }


class BuildWajarriV3BaselineLedgerTest(unittest.TestCase):
    def test_explicit_schedule_stage_is_bound_to_checkpoint_exposure(self) -> None:
        from training.translation.build_wajarri_v3_baseline_ledger import (
            build_stage,
            exposure_for_row,
        )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            schedule = [
                {
                    "id": "presentation-1",
                    "accounting_parent_id": "parent-a",
                    "input_text": "<lexeme> water",
                    "output_text": "bila",
                    "source_record_ids": ["source-a"],
                },
                {
                    "id": "presentation-2",
                    "accounting_parent_id": "parent-b",
                    "input_text": "<lexeme> water",
                    "output_text": "gabi",
                    "source_record_ids": ["source-b"],
                },
                {
                    "id": "presentation-not-consumed",
                    "accounting_parent_id": "parent-c",
                    "input_text": "<lexeme> fire",
                    "output_text": "warlu",
                },
            ]
            schedule_component = write_jsonl(root / "schedule.jsonl", schedule)
            exposure_component = write_jsonl(
                root / "exposure.jsonl",
                [
                    {"id": "parent-a", "presentations": 1},
                    {"id": "parent-b", "presentations": 1},
                ],
            )
            stage = build_stage(
                root,
                {
                    "stage_id": "selected-step",
                    "mode": "explicit_schedule_prefix",
                    "rows": schedule_component,
                    "exposure_ledger": exposure_component,
                    "presentation_limit": 2,
                    "selected_presentations": 2,
                },
            )
            exposure = exposure_for_row(
                stage,
                "<lexeme> water",
                ["bila"],
                ["source-a"],
                "gabi",
            )

        self.assertEqual(stage.presentations, 2)
        self.assertEqual(exposure["accepted_pair_presentations"], 1)
        self.assertEqual(exposure["same_input_conflicting_presentations"], 1)
        self.assertEqual(exposure["prediction_target_presentations"], 1)
        self.assertEqual(exposure["source_record_presentations"], {"source-a": 1})

    def test_weighted_unique_stage_preserves_replay_counts(self) -> None:
        from training.translation.build_wajarri_v3_baseline_ledger import build_stage

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rows_component = write_jsonl(
                root / "rows.jsonl",
                [
                    {
                        "id": "a",
                        "input_text": "<lexeme> water",
                        "output_text": "bila",
                    },
                    {
                        "id": "b",
                        "input_text": "<lexeme> fire",
                        "output_text": "warlu",
                    },
                ],
            )
            exposure_component = write_jsonl(
                root / "exposure.jsonl",
                [
                    {"id": "a", "presentations": 58},
                    {"id": "b", "presentations": 57},
                ],
            )
            stage = build_stage(
                root,
                {
                    "stage_id": "lexical-dose",
                    "mode": "weighted_unique_rows",
                    "rows": rows_component,
                    "exposure_ledger": exposure_component,
                    "selected_presentations": 115,
                },
            )

        self.assertEqual(stage.presentations, 115)
        self.assertEqual(stage.exact_pairs[("<lexeme> water", "bila")], 58)

    def test_source_record_outcome_keeps_group_and_source_specific_exactness(self) -> None:
        from training.translation.build_wajarri_v3_baseline_ledger import (
            build_source_record_outcomes,
        )

        exposure = {
            "accepted_pair_presentations": 1,
            "exposure_class": "direct_accepted_pair_exposed",
        }
        profiles = [
            {
                "sourceRecordId": "source-a",
                "censusRecordId": "census-a",
                "sourcePromptCandidate": {
                    "source": "water",
                    "definitionSource": "water",
                },
                "sourceTargetCandidate": {"source": "bila"},
                "structuralStratum": "multi_target",
                "blockerCodes": [],
                "partOfSpeech": {"status": "missing"},
                "structuralFeatures": {},
                "evidenceCoverage": {},
            },
            {
                "sourceRecordId": "source-b",
                "censusRecordId": "census-b",
                "sourcePromptCandidate": {
                    "source": "water",
                    "definitionSource": "water in a soak",
                },
                "sourceTargetCandidate": {"source": "gabi"},
                "structuralStratum": "multi_target",
                "blockerCodes": [],
                "partOfSpeech": {"status": "missing"},
                "structuralFeatures": {},
                "evidenceCoverage": {},
            },
        ]
        direct = {
            "suite": "lexical_direct_closed",
            "row_id": "direct",
            "source_record_ids": ["source-a", "source-b"],
            "exact": True,
            "normalized_prediction": "bila",
            "prediction": "bila",
            "surface_class": "exact",
            "ambiguity_class": "multiple_accepted_targets",
            "known_target_substitution": False,
            "cumulative_documented_exposure": exposure,
        }
        context_a = {
            "suite": "lexical_context_closed",
            "row_id": "context-a",
            "source_record_ids": ["source-a"],
            "normalized_prediction": "bila",
            "prediction": "bila",
            "surface_class": "exact",
            "known_target_substitution": False,
            "selected_checkpoint_stage_exposure": exposure,
            "cumulative_documented_exposure": exposure,
        }
        context_b = {
            "suite": "lexical_context_closed",
            "row_id": "context-b",
            "source_record_ids": ["source-b"],
            "normalized_prediction": "bila",
            "prediction": "bila",
            "surface_class": "wrong_known_target",
            "known_target_substitution": True,
            "selected_checkpoint_stage_exposure": exposure,
            "cumulative_documented_exposure": exposure,
        }

        outcomes = build_source_record_outcomes(
            profiles, [direct, context_a, context_b]
        )

        self.assertEqual(outcomes[0]["outcome_class"], "both_exact")
        self.assertTrue(outcomes[1]["direct"]["group_exact"])
        self.assertFalse(outcomes[1]["direct"]["source_target_exact"])
        self.assertEqual(outcomes[1]["outcome_class"], "neither_exact")

    def test_grapheme_alignment_is_deterministic(self) -> None:
        from training.translation.build_wajarri_v3_baseline_ledger import (
            closest_reference_alignment,
        )

        result = closest_reference_alignment("gaba", ["waga", "gaga"])
        self.assertEqual(result["closest_normalized_reference"], "gaga")
        self.assertEqual(result["distance"], 1)
        self.assertEqual(result["grapheme_substitutions"], 1)


if __name__ == "__main__":
    unittest.main()

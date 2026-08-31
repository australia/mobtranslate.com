from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from training.translation.run_wajarri_v3_mixed_replay_screen import (
    checkpoint_admissibility,
    choose_checkpoint,
    development_command,
    development_rank,
    experiment_arms,
    full_gates,
    load_bound_jsonl,
    mechanical_gates,
    verify_schedule,
)


class RunWajarriV3MixedReplayScreenTest(unittest.TestCase):
    def development(self, exact: int, both: int, predicate: int) -> dict:
        return {
            "metrics": {
                "faults": {"blank": 0, "source_copy": 0, "repeated_token_4gram": 0},
                "exact": exact,
                "both_slots_present": both,
                "predicate_present": predicate,
                "subject_present": 7,
                "mean_chrf2": 30.0,
            }
        }

    def test_development_rank_prefers_exact_then_slots(self) -> None:
        self.assertGreater(
            development_rank(self.development(1, 1, 2), 6),
            development_rank(self.development(0, 5, 5), 3),
        )

    def sentinel(self, exact: int, mandatory: int, faults: int = 0) -> dict:
        return {
            "metrics": {
                "exact": exact,
                "mandatory": {"exact": mandatory},
                "faults": {
                    "blank": faults,
                    "source_copy": 0,
                    "repeated_token_4gram": 0,
                },
            }
        }

    def checkpoint_contract(self) -> dict:
        return {"gates": {"maximum_anchor_exact_count_loss": 0}}

    def test_checkpoint_admissibility_requires_all_mandatory_sentinels(self) -> None:
        baseline = self.sentinel(144, 23)
        admissible = checkpoint_admissibility(
            self.sentinel(144, 23), baseline, self.checkpoint_contract()
        )
        self.assertTrue(all(admissible.values()))
        rejected = checkpoint_admissibility(
            self.sentinel(143, 22), baseline, self.checkpoint_contract()
        )
        self.assertFalse(rejected["all_sentinels_retained"])
        self.assertFalse(rejected["mandatory_sentinels_retained"])

    def test_selection_rejects_better_development_when_sentinel_fails(self) -> None:
        candidates = [
            {
                "step": 3,
                "development": self.development(1, 1, 1),
                "sentinel": self.sentinel(144, 23),
            },
            {
                "step": 6,
                "development": self.development(4, 4, 7),
                "sentinel": self.sentinel(143, 22),
            },
        ]
        selected, status = choose_checkpoint(
            candidates, self.sentinel(144, 23), self.checkpoint_contract()
        )
        self.assertEqual(selected["step"], 3)
        self.assertEqual(status, "ADMISSIBLE_CHECKPOINT_SELECTED")

    def test_no_admissible_checkpoint_is_diagnostic_only(self) -> None:
        candidates = [
            {
                "step": 3,
                "development": self.development(1, 1, 1),
                "sentinel": self.sentinel(143, 22),
            }
        ]
        selected, status = choose_checkpoint(
            candidates, self.sentinel(144, 23), self.checkpoint_contract()
        )
        self.assertEqual(selected["step"], 3)
        self.assertFalse(selected["admissible"])
        self.assertEqual(status, "NO_ADMISSIBLE_CHECKPOINT_DIAGNOSTIC_ONLY")

    def test_development_command_can_bind_glossary_suite(self) -> None:
        contract = {
            "development": {"path": "plain.jsonl", "rows": 32},
            "glossary_development": {"path": "glossary.jsonl", "rows": 32},
            "training": {"seed": 17},
        }
        command = development_command(
            contract,
            Path("/kit"),
            Path("/base"),
            Path("/adapter"),
            Path("/output"),
            "G",
            "glossary_development",
        )
        self.assertIn("/kit/glossary.jsonl", command)

    def test_full_gate_is_relative_to_same_run_baseline(self) -> None:
        baseline = {
            "direct_one_target": {"exact_rate": 0.91},
            "suites": {
                "synthetic_holdout": {"mean_chrf2": 70.0, "faults": {}},
                "retention": {"exact": 55, "faults": {}},
            },
        }
        candidate = {
            "direct_one_target": {"exact_rate": 0.905},
            "suites": {
                "synthetic_holdout": {"mean_chrf2": 69.0, "faults": {}},
                "retention": {"exact": 55, "faults": {}},
            },
        }
        contract = {
            "gates": {
                "maximum_one_target_exact_rate_loss": 0.01,
                "maximum_unanchored_exact_rate_loss": 0.01,
                "maximum_anchor_exact_count_loss": 0,
                "maximum_synthetic_chrf2_loss": 2.0,
            }
        }
        partitions = {
            "partitions": {
                "unanchored_complement": {"exact_rate": 0.90},
                "trained_anchors": {"exact": 144},
                "mandatory_regression_anchors": {"exact": 23},
            }
        }
        self.assertTrue(
            all(
                full_gates(
                    candidate,
                    baseline,
                    partitions,
                    partitions,
                    contract,
                ).values()
            )
        )

    def test_split_mechanical_gate_does_not_require_baseline_diagnostic_zero(
        self,
    ) -> None:
        baseline = {
            "suites": {
                "lexical_direct_closed": {
                    "faults": {"blank": 0, "source_copy": 0, "repeated_token_4gram": 0}
                },
                "lexical_context_closed": {
                    "faults": {"blank": 0, "source_copy": 0, "repeated_token_4gram": 1}
                },
            }
        }
        candidate = {
            "suites": {
                "lexical_direct_closed": {
                    "faults": {"blank": 0, "source_copy": 0, "repeated_token_4gram": 0}
                },
                "lexical_context_closed": {
                    "faults": {"blank": 0, "source_copy": 0, "repeated_token_4gram": 1}
                },
            }
        }
        gates = {
            "mechanical_fault_policy": {
                "kind": "deployment_zero_diagnostic_noninferiority",
                "deployment_zero_suites": ["lexical_direct_closed"],
                "diagnostic_noninferiority_suites": ["lexical_context_closed"],
            }
        }
        self.assertTrue(all(mechanical_gates(candidate, baseline, gates).values()))
        candidate["suites"]["lexical_context_closed"]["faults"]["source_copy"] = 1
        self.assertFalse(
            mechanical_gates(candidate, baseline, gates)[
                "diagnostic_mechanical_noninferiority"
            ]
        )

    def test_bound_schedule_checks_rows_identity_and_tokens(self) -> None:
        with TemporaryDirectory() as temporary:
            path = Path(temporary) / "schedule.jsonl"
            path.write_text(
                '{"accounting_parent_id":"a","arm":"T1","direction":"eng-wbv","id":"a1","input_text":"a","output_text":"x","pair_kind":"synthetic","task":"translate","token_accounting":{"non_padding_tokens_with_specials":7,"source_tokens_with_specials":3,"target_tokens_with_specials":4}}\n'
                '{"accounting_parent_id":"b","arm":"T1","direction":"eng-wbv","id":"b1","input_text":"b","output_text":"y","pair_kind":"synthetic","task":"translate","token_accounting":{"non_padding_tokens_with_specials":9,"source_tokens_with_specials":4,"target_tokens_with_specials":5}}\n',
                encoding="utf-8",
            )
            rows = load_bound_jsonl(path, 2)
            verify_schedule(
                rows,
                "T1",
                {
                    "unique_rows": 2,
                    "non_padding_tokens": 16,
                    "source_non_padding_tokens": 7,
                    "target_non_padding_tokens": 9,
                    "task_presentations": {"translate": 2},
                },
            )

    def test_experiment_roles_bind_exactly_two_arms(self) -> None:
        contract = {
            "experiment_roles": {"control_arm": "C2", "treatment_arm": "T2"},
            "arms": {"C2": {}, "T2": {}},
        }
        self.assertEqual(experiment_arms(contract), ("C2", "T2"))
        contract["experiment_roles"]["treatment_arm"] = "C2"
        with self.assertRaisesRegex(ValueError, "arm roles"):
            experiment_arms(contract)

    def test_bound_schedule_rejects_wrong_arm(self) -> None:
        rows = [
            {
                "accounting_parent_id": "a",
                "arm": "C0",
                "direction": "eng-wbv",
                "id": "a1",
                "input_text": "a",
                "output_text": "x",
                "pair_kind": "synthetic",
                "task": "translate",
                "token_accounting": {"non_padding_tokens_with_specials": 7},
            }
        ]
        with self.assertRaisesRegex(ValueError, "wrong arm"):
            verify_schedule(
                rows,
                "T1",
                {"unique_rows": 1, "non_padding_tokens": 7},
            )

    def test_bound_schedule_rejects_missing_model_column(self) -> None:
        rows = [
            {
                "accounting_parent_id": "a",
                "arm": "T1",
                "direction": "eng-wbv",
                "id": "a1",
                "input_text": "a",
                "output_text": "x",
                "task": "translate",
                "token_accounting": {"non_padding_tokens_with_specials": 7},
            }
        ]
        with self.assertRaisesRegex(ValueError, "pair_kind"):
            verify_schedule(
                rows,
                "T1",
                {"unique_rows": 1, "non_padding_tokens": 7},
            )


if __name__ == "__main__":
    unittest.main()

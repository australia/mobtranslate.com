from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from training.translation.run_wajarri_v3_composition_screen import (
    development_rank,
    full_gates,
    load_bound_jsonl,
    mechanical_gates,
    verify_schedule,
)


class RunWajarriV3CompositionScreenTest(unittest.TestCase):
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
                "maximum_synthetic_chrf2_loss": 2.0,
            }
        }
        self.assertTrue(all(full_gates(candidate, baseline, contract).values()))

    def test_split_mechanical_gate_does_not_require_baseline_diagnostic_zero(self) -> None:
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
                '{"accounting_parent_id":"a","arm":"T1","direction":"eng-wbv","id":"a1","input_text":"a","output_text":"x","pair_kind":"synthetic","task":"translate","token_accounting":{"non_padding_tokens_with_specials":7}}\n'
                '{"accounting_parent_id":"b","arm":"T1","direction":"eng-wbv","id":"b1","input_text":"b","output_text":"y","pair_kind":"synthetic","task":"translate","token_accounting":{"non_padding_tokens_with_specials":9}}\n',
                encoding="utf-8",
            )
            rows = load_bound_jsonl(path, 2)
            verify_schedule(
                rows,
                "T1",
                {"unique_rows": 2, "non_padding_tokens": 16},
            )

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

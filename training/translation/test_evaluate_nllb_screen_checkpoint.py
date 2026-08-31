from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


class FakeTokenizer:
    def __init__(self) -> None:
        self.vocabulary = {"wbv_Latn": 7, "<lexeme>": 8, "piece": 9}

    def convert_tokens_to_ids(self, token: str) -> int:
        return self.vocabulary[token]

    def convert_ids_to_tokens(self, token_id: int) -> str:
        return {value: key for key, value in self.vocabulary.items()}[token_id]


class EvaluateNllbScreenCheckpointTest(unittest.TestCase):
    def test_progress_reporter_is_bounded_and_emits_final_partial_batch(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            ProgressReporter,
        )

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "progress.jsonl"
            reporter = ProgressReporter(path, "invocation", minimum_row_delta=100)
            callback = reporter.generation_callback("active_adapter")
            callback(4, 204, 1.0)
            callback(100, 204, 2.0)
            callback(104, 204, 3.0)
            callback(200, 204, 4.0)
            callback(204, 204, 5.0)
            rows = [json.loads(line) for line in path.read_text().splitlines()]
        self.assertEqual([row["rows_completed"] for row in rows], [100, 200, 204])
        self.assertTrue(all(row["phase"] == "active_adapter" for row in rows))

    def test_active_only_census_flag_is_explicit_and_defaults_to_paired(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import parse_args

        required = [
            "evaluate",
            "--raw-base-model",
            "base",
            "--control-contract",
            "control",
            "--expected-control-contract-sha256",
            "0" * 64,
            "--adapter-dir",
            "adapter",
            "--training-manifest",
            "manifest.json",
            "--expected-training-global-step",
            "400",
            "--suite",
            "source_context=rows.jsonl",
            "--output-dir",
            "output",
        ]
        with patch.object(sys, "argv", required):
            self.assertTrue(parse_args().paired_disabled_adapter_baseline)
        with patch.object(
            sys,
            "argv",
            [*required, "--no-paired-disabled-adapter-baseline"],
        ):
            self.assertFalse(parse_args().paired_disabled_adapter_baseline)

    def test_normalization_prefix_and_repetition_contract(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            contains_repeated_ngram,
            normalize,
            source_without_task_prefix,
        )

        self.assertEqual(normalize("  WAJARRI\u2019S  Word "), "wajarri's word")
        self.assertEqual(source_without_task_prefix("<lexeme> woman"), "woman")
        self.assertTrue(contains_repeated_ngram([1, 2, 3, 4, 1, 2, 3, 4]))
        self.assertFalse(contains_repeated_ngram([1, 2, 3, 4, 2, 3, 4, 5]))

    def test_paired_decoder_regression_separates_inherited_and_new_failures(
        self,
    ) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            paired_decoder_regression,
        )

        disabled = [
            {
                "evaluation_id": "row-1",
                "generated_content_token_ids": [1, 2, 3, 4, 1, 2, 3, 4],
                "blank_output": False,
                "repeated_output_token_4gram": True,
            },
            {
                "evaluation_id": "row-2",
                "generated_content_token_ids": [],
                "blank_output": True,
                "repeated_output_token_4gram": False,
            },
        ]
        candidate = [
            dict(disabled[0]),
            {
                "evaluation_id": "row-2",
                "generated_content_token_ids": [9],
                "blank_output": False,
                "repeated_output_token_4gram": False,
            },
        ]

        audit = paired_decoder_regression(disabled, candidate)

        self.assertEqual(audit["status"], "PASS")
        self.assertEqual(audit["token_identical_rows"], 1)
        self.assertEqual(audit["resolved_blank_evaluation_ids"], ["row-2"])
        self.assertEqual(audit["disabled_adapter_repeated_output_token_4gram_count"], 1)
        self.assertEqual(audit["candidate_repeated_output_token_4gram_count"], 1)
        self.assertEqual(audit["newly_repeated_output_token_4gram_evaluation_ids"], [])

        candidate[1]["repeated_output_token_4gram"] = True
        failed = paired_decoder_regression(disabled, candidate)
        self.assertEqual(failed["status"], "FAIL")
        self.assertEqual(
            failed["newly_repeated_output_token_4gram_evaluation_ids"],
            ["row-2"],
        )

    def test_paired_decoder_regression_rejects_order_drift(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            paired_decoder_regression,
        )

        baseline = [
            {
                "evaluation_id": "baseline-row",
                "generated_content_token_ids": [1],
                "blank_output": False,
                "repeated_output_token_4gram": False,
            }
        ]
        candidate = [
            {
                **baseline[0],
                "evaluation_id": "candidate-row",
            }
        ]
        with self.assertRaisesRegex(ValueError, "evaluation order"):
            paired_decoder_regression(baseline, candidate)

    def test_merge_prediction_regression_preserves_exact_mismatch(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            merge_prediction_regression,
        )

        adapter = [
            {
                "evaluation_id": "suite:row-1",
                "input_text": "<lexeme> woman",
                "prediction": "adapter form",
                "generated_content_token_ids": [11, 12],
            },
            {
                "evaluation_id": "suite:row-2",
                "input_text": "<translate> The woman returned.",
                "prediction": "same form",
                "generated_content_token_ids": [21],
            },
        ]
        merged = [
            {
                **adapter[0],
                "prediction": "merged form",
                "generated_content_token_ids": [11, 13],
            },
            dict(adapter[1]),
        ]

        audit = merge_prediction_regression(adapter, merged)

        self.assertEqual(audit["status"], "FAIL")
        self.assertFalse(audit["token_identical"])
        self.assertEqual(audit["token_identical_rows"], 1)
        self.assertEqual(audit["mismatch_count"], 1)
        self.assertEqual(
            audit["mismatches"],
            [
                {
                    "evaluation_id": "suite:row-1",
                    "input_text": "<lexeme> woman",
                    "adapter_prediction": "adapter form",
                    "adapter_generated_content_token_ids": [11, 12],
                    "merged_prediction": "merged form",
                    "merged_generated_content_token_ids": [11, 13],
                }
            ],
        )

        merged[0] = dict(adapter[0])
        passed = merge_prediction_regression(adapter, merged)
        self.assertEqual(passed["status"], "PASS")
        self.assertTrue(passed["token_identical"])
        self.assertEqual(passed["mismatch_count"], 0)

    def test_merge_prediction_regression_rejects_order_drift(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            merge_prediction_regression,
        )

        row = {
            "evaluation_id": "suite:row-1",
            "input_text": "<lexeme> woman",
            "prediction": "form",
            "generated_content_token_ids": [11],
        }
        with self.assertRaisesRegex(ValueError, "evaluation order"):
            merge_prediction_regression(
                [row],
                [{**row, "evaluation_id": "suite:row-2"}],
            )

    def test_suite_reader_and_exposure_join_are_exact(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            join_exposure,
            read_exposure_ledger,
            read_suite,
        )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            suite = root / "suite.jsonl"
            ledger = root / "ledger.jsonl"
            suite.write_text(
                json.dumps(
                    {
                        "rowId": "row-1",
                        "inputText": "<lexeme> woman",
                        "acceptedReferences": ["yagu"],
                        "task": "lexeme",
                        "suiteKey": "prompt",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            ledger.write_text(
                json.dumps(
                    {
                        "benchmark_row_id": "row-1",
                        "population": "J0",
                        "primary_exposure_class": "direct_exact_mapping_exposed",
                        "direct_matching_training_rows": [{"id": "training-1"}],
                        "same_prompt_conflicting_training_rows": [],
                        "complete_target_output_elsewhere_by_reference": {},
                        "upstream_nllb_pretraining_exposure": "unknown",
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            rows = read_suite("prompt_group", suite, "eng-wbv", None)
            exposures = read_exposure_ledger(ledger, "J0")
            self.assertEqual(join_exposure(rows, exposures), 1)
            self.assertEqual(
                rows[0]["exposure"]["primary_exposure_class"],
                "direct_exact_mapping_exposed",
            )

    def test_trainable_spec_is_hash_bound_and_order_preserving(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            load_expected_trainable_rows,
            sha256_file,
        )

        with tempfile.TemporaryDirectory() as temporary:
            spec = Path(temporary) / "rows.json"
            spec.write_text(
                json.dumps(
                    {
                        "rows": [
                            {
                                "token": "piece",
                                "token_id": 9,
                                "selected_for_gradient_training": True,
                            },
                            {
                                "token": "<lexeme>",
                                "token_id": 8,
                                "selected_for_gradient_training": True,
                            },
                            {
                                "token": "wbv_Latn",
                                "token_id": 7,
                                "selected_for_gradient_training": False,
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            args = argparse.Namespace(
                trainable_token_spec=spec,
                expected_trainable_token_spec_sha256=sha256_file(spec),
                expected_trainable_token=["wbv_Latn"],
            )
            rows = load_expected_trainable_rows(args, FakeTokenizer())

            self.assertEqual(
                [(row["token"], row["token_id"]) for row in rows],
                [("piece", 9), ("<lexeme>", 8), ("wbv_Latn", 7)],
            )

    def test_training_manifest_hard_gate_rejects_missing_row_update(self) -> None:
        from training.translation.evaluate_nllb_screen_checkpoint import (
            verify_training_manifest,
        )

        manifest = {
            "training_mode": "lora",
            "trainer_state": {
                "global_step": 1,
                "actual_training_exposure": {"presentations": 56},
            },
            "token_adaptation": {
                "selective_token_gradient_audit": {
                    "all_selected_rows_received_nonzero_gradient": True
                },
                "all_selected_expected_surfaces_changed": True,
                "unselected_selective_surfaces_unchanged": True,
                "selected_rows_missing_expected_updates": [],
                "selected_rows_with_unexpected_updates": [],
            },
            "training_args": {},
            "dataset": {},
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            audit = verify_training_manifest(path, 1)
            self.assertEqual(audit["global_step"], 1)

            manifest["token_adaptation"]["selected_rows_missing_expected_updates"] = [
                {"token": "piece"}
            ]
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "hard gate failed"):
                verify_training_manifest(path, 1)


if __name__ == "__main__":
    unittest.main()

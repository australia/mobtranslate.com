from __future__ import annotations

import unittest
from pathlib import Path

from training.translation.run_wajarri_v3_copy_composition_screen import (
    candidate_screen_gates,
    choose_checkpoint,
    copy_intervention_comparison,
    dedicated_copy_token_intervention_comparison,
    development_rank,
    training_command,
)


GATES = {
    "minimum_composition_plain_exact": 8,
    "minimum_held_inline_exact": 18,
    "minimum_copy_screen_exact": 56,
    "minimum_slots_per_composition_family": 1,
}


def metric(exact: int, rows: int, *, sentence: bool = True) -> dict:
    return {
        "rows": rows,
        "exact": exact,
        "both_slots_present": exact if sentence else 0,
        "mean_chrf2": float(exact),
        "faults": {
            "blank": 0,
            "source_copy": 0,
            "repeated_token_4gram": 0,
            "unresolved_bracket": 0,
        },
        "by_contrast_family": {"motion": {"both_slots_present": exact}},
    }


def development(composition: int, held: int, copy: int) -> dict:
    endpoints = {
        "composition_plain": metric(composition, 11),
        "composition_inline": metric(composition, 11),
        "held_lexeme_plain": metric(0, 24),
        "held_lexeme_inline": metric(held, 24),
        "copy_screen": metric(copy, 64, sentence=False),
    }
    return {
        "metrics": {
            "faults": {
                "blank": 0,
                "source_copy": 0,
                "repeated_token_4gram": 0,
                "unresolved_bracket": 0,
            },
            "by_endpoint": endpoints,
        }
    }


def option_values(command: list[str], option: str) -> list[str]:
    return [
        command[index + 1]
        for index, value in enumerate(command[:-1])
        if value == option
    ]


class CopyCompositionRunnerTest(unittest.TestCase):
    def test_balanced_selector_prefers_more_passed_gates_before_raw_copy(self) -> None:
        weak_composition = {"step": 20, "development": development(2, 24, 64)}
        balanced = {"step": 40, "development": development(8, 18, 56)}
        self.assertEqual(choose_checkpoint([weak_composition, balanced], GATES)["step"], 40)

    def test_earlier_step_breaks_a_complete_tie(self) -> None:
        summary = development(8, 18, 56)
        self.assertGreater(
            development_rank(summary, GATES, 20),
            development_rank(summary, GATES, 40),
        )

    def test_copy_intervention_requires_strict_gain_without_regression(self) -> None:
        result = copy_intervention_comparison(
            development(8, 19, 58), development(9, 18, 58)
        )
        self.assertTrue(all(result.values()))
        no_gain = copy_intervention_comparison(
            development(8, 18, 58), development(9, 18, 58)
        )
        self.assertFalse(no_gain["strict_copy_or_uptake_improvement"])

    def test_candidate_gates_do_not_use_held_plain(self) -> None:
        candidate = development(8, 18, 56)
        baseline = development(1, 1, 1)
        control = development(2, 2, 2)
        full = {
            "deployment_mechanical_faults_zero": True,
            "fixed_utterance_retention": True,
            "synthetic_chrf2_noninferiority": True,
            "synthetic_exact_noninferiority": True,
        }
        result = candidate_screen_gates(candidate, baseline, control, full, GATES)
        self.assertTrue(all(result.values()))

    def test_dedicated_copy_token_must_preserve_d6_and_strictly_improve_copy(self) -> None:
        candidate = development(8, 21, 56)
        candidate["metrics"]["by_endpoint"].update(
            {
                "neutral_single_copy_screen": metric(56, 64, sentence=False),
                "neutral_dual_copy_screen": metric(56, 64, sentence=False),
            }
        )
        result = dedicated_copy_token_intervention_comparison(
            candidate,
            {
                "composition_plain_exact": 9,
                "held_lexeme_inline_exact": 21,
                "neutral_single_copy_exact": 48,
                "neutral_dual_copy_exact": 24,
            },
        )
        self.assertTrue(all(result.values()))

    def test_training_uses_explicit_adapter_snapshot_steps(self) -> None:
        contract = {
            "run_id": "run",
            "dataset_id": "data",
            "initial_adapter": {"adapter_weight_sha256": "a" * 64},
            "training": {
                "seed": 17,
                "learning_rate": 1e-5,
                "optimizer_updates": 40,
                "physical_batch_size": 4,
                "gradient_accumulation_steps": 4,
                "lr_scheduler_type": "linear",
                "warmup_updates": 4,
                "weight_decay": 0.01,
                "lora_r": 16,
                "lora_alpha": 32,
                "lora_dropout": 0.05,
                "lora_target_modules": ["q_proj"],
                "checkpoint_updates": [20, 40],
            },
            "arms": {
                "K5": {
                    "schedule_path": "payload/k5.jsonl",
                    "schedule_sha256": "b" * 64,
                    "required_trainable_token_updates": ["wbv_Latn", "<translate>"],
                }
            },
        }
        command = training_command(
            contract, Path("/kit"), Path("/base"), "K5", Path("/out")
        )
        self.assertEqual(option_values(command, "--adapter-snapshot-steps"), ["20,40"])
        self.assertEqual(
            option_values(command, "--required-trainable-token-update"),
            ["wbv_Latn", "<translate>"],
        )

    def test_training_registers_and_selects_the_copy_task_token(self) -> None:
        contract = {
            "run_id": "run",
            "dataset_id": "data",
            "initial_adapter": {"adapter_weight_sha256": "a" * 64},
            "tokenizer": {
                "runtime_appended_tokens": [{"token": "<copy>", "token_id": 256208}],
                "trainable_tokens": ["wbv_Latn", "<translate>", "<copy>"],
            },
            "training": {
                "seed": 17,
                "learning_rate": 1e-5,
                "optimizer_updates": 40,
                "physical_batch_size": 4,
                "gradient_accumulation_steps": 4,
                "lr_scheduler_type": "linear",
                "warmup_updates": 4,
                "weight_decay": 0.01,
                "lora_r": 16,
                "lora_alpha": 32,
                "lora_dropout": 0.05,
                "lora_target_modules": ["q_proj"],
                "checkpoint_updates": [20, 40],
            },
            "arms": {
                "T7": {
                    "schedule_path": "payload/t7.jsonl",
                    "schedule_sha256": "b" * 64,
                    "required_trainable_token_updates": [
                        "wbv_Latn",
                        "<translate>",
                        "<copy>",
                    ],
                }
            },
        }
        command = training_command(
            contract, Path("/kit"), Path("/base"), "T7", Path("/out")
        )
        self.assertEqual(option_values(command, "--additional-special-token"), ["<copy>"])
        self.assertEqual(
            option_values(command, "--trainable-token"),
            ["wbv_Latn", "<translate>", "<copy>"],
        )


if __name__ == "__main__":
    unittest.main()

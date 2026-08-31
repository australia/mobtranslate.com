from __future__ import annotations

import unittest
from pathlib import Path

from training.translation.run_wajarri_v3_representation_screen import (
    choose_checkpoint,
    development_rank,
    family_floor,
    training_command,
)


def metrics(exact: int) -> dict:
    return {
        "exact": exact,
        "both_slots_present": exact + 1,
        "predicate_present": exact + 2,
        "subject_present": exact + 3,
        "mean_chrf2": float(exact),
        "faults": {"blank": 0, "source_copy": 0, "repeated_token_4gram": 0},
        "by_contrast_family": {"a": {"both_slots_present": 1}},
    }


def development(plain: int, suffix: int, inline: int, placeholder: int) -> dict:
    return {
        "metrics_by_condition": {
            "plain": metrics(plain),
            "suffix": metrics(suffix),
            "inline_annotation": metrics(inline),
            "placeholder_glossary": metrics(placeholder),
        }
    }


def option_values(command: list[str], option: str) -> list[str]:
    return [
        command[index + 1]
        for index, value in enumerate(command[:-1])
        if value == option
    ]


class RepresentationRunnerTest(unittest.TestCase):
    def test_arm_contract_declares_required_special_token_updates(self) -> None:
        contract = {
            "run_id": "test-run",
            "dataset_id": "test-dataset",
            "initial_adapter": {"adapter_weight_sha256": "a" * 64},
            "training": {
                "learning_rate": 1e-5,
                "optimizer_updates": 10,
                "physical_batch_size": 1,
                "gradient_accumulation_steps": 1,
                "lr_scheduler_type": "linear",
                "warmup_updates": 1,
                "weight_decay": 0.0,
                "lora_r": 16,
                "lora_alpha": 32,
                "lora_dropout": 0.05,
                "lora_target_modules": ["q_proj"],
                "save_steps": 10,
                "checkpoint_updates": [10],
                "seed": 17,
            },
            "arms": {
                "R0": {
                    "schedule_path": "payload/r0.jsonl",
                    "schedule_sha256": "b" * 64,
                    "task_presentations": {
                        "translate": 5,
                        "terminology_conditioned_translation": 5,
                    },
                    "required_trainable_token_updates": [
                        "wbv_Latn",
                        "<translate>",
                        "<glossary>",
                    ],
                }
            },
        }
        command = training_command(
            contract, Path("/kit"), Path("/base"), "R0", Path("/out")
        )
        self.assertEqual(
            option_values(command, "--required-trainable-token-update"),
            ["wbv_Latn", "<translate>", "<glossary>"],
        )

    def test_plain_exact_precedes_own_representation(self) -> None:
        candidates = [
            {
                "step": 40,
                "development": development(5, 16, 1, 1),
            },
            {
                "step": 80,
                "development": development(6, 1, 1, 1),
            },
        ]
        self.assertEqual(choose_checkpoint(candidates, "suffix")["step"], 80)

    def test_own_representation_breaks_plain_tie(self) -> None:
        left = development_rank(development(6, 8, 1, 1), "suffix", 40)
        right = development_rank(development(6, 9, 1, 1), "suffix", 80)
        self.assertGreater(right, left)

    def test_earlier_checkpoint_breaks_full_tie(self) -> None:
        left = development_rank(development(6, 8, 1, 1), "suffix", 40)
        right = development_rank(development(6, 8, 1, 1), "suffix", 80)
        self.assertGreater(left, right)

    def test_family_floor_is_hard(self) -> None:
        self.assertTrue(family_floor(metrics(4), 1))
        self.assertFalse(family_floor(metrics(4), 2))


if __name__ == "__main__":
    unittest.main()

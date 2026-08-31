import unittest
from pathlib import Path

from training.translation.run_wajarri_v3_task_separated_screen import (
    choose_checkpoint,
    development_rank,
    family_floor,
    full_gates,
    training_command,
)


def development(exact: int, glossary: bool = False) -> dict:
    return {
        "metrics": {
            "exact": exact,
            "both_slots_present": exact + 1,
            "predicate_present": exact + 2,
            "subject_present": exact + 3,
            "mean_chrf2": float(exact),
            "faults": {"blank": 0, "source_copy": 0, "repeated_token_4gram": 0},
            "by_contrast_family": {
                "a": {"both_slots_present": 1 if not glossary else 2},
                "b": {"both_slots_present": 1},
            },
        }
    }


def option_values(command: list[str], option: str) -> list[str]:
    return [command[index + 1] for index, value in enumerate(command[:-1]) if value == option]


class TaskSeparatedRunnerTest(unittest.TestCase):
    def test_only_glossary_arm_requires_glossary_token_updates(self) -> None:
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
                "plain": {
                    "schedule_path": "payload/plain.jsonl",
                    "schedule_sha256": "b" * 64,
                    "task_presentations": {"translate": 10},
                },
                "glossary": {
                    "schedule_path": "payload/glossary.jsonl",
                    "schedule_sha256": "c" * 64,
                    "task_presentations": {"translate": 5, "glossary_translation": 5},
                },
            },
        }

        plain = training_command(contract, Path("/kit"), Path("/base"), "plain", Path("/out"))
        glossary = training_command(
            contract, Path("/kit"), Path("/base"), "glossary", Path("/out")
        )

        self.assertEqual(
            option_values(plain, "--trainable-token"),
            ["wbv_Latn", "<lexeme>", "<translate>", "<glossary>"],
        )
        self.assertEqual(
            option_values(plain, "--required-trainable-token-update"),
            ["wbv_Latn", "<translate>"],
        )
        self.assertEqual(
            option_values(glossary, "--required-trainable-token-update"),
            ["wbv_Latn", "<translate>", "<glossary>"],
        )

    def test_plain_exact_is_primary_checkpoint_criterion(self) -> None:
        candidates = [
            {"step": 10, "plain": development(5), "glossary": development(20)},
            {"step": 20, "plain": development(6), "glossary": development(1)},
        ]
        self.assertEqual(choose_checkpoint(candidates)["step"], 20)

    def test_earlier_checkpoint_wins_exact_tie(self) -> None:
        left = development_rank(development(6), development(8), 10)
        right = development_rank(development(6), development(8), 20)
        self.assertGreater(left, right)

    def test_family_floor_is_hard(self) -> None:
        metrics = development(4)["metrics"]
        self.assertTrue(family_floor(metrics, 1))
        self.assertFalse(family_floor(metrics, 2))

    def test_full_gates_ignore_task_separated_lexical_drift(self) -> None:
        baseline = {
            "suites": {
                "retention": {"exact": 55, "faults": {"blank": 0}},
                "synthetic_holdout": {"exact": 13, "mean_chrf2": 70.0, "faults": {"blank": 0}},
                "historical_holdout": {"faults": {"blank": 0}},
            }
        }
        candidate = {
            **baseline,
            "direct_one_target": {"exact": 0},
        }
        gates = full_gates(
            candidate,
            baseline,
            {
                "deployment_zero_fault_suites": ["retention", "synthetic_holdout", "historical_holdout"],
                "maximum_synthetic_chrf2_loss": 2.0,
                "maximum_synthetic_exact_count_loss": 2,
            },
        )
        self.assertTrue(all(gates.values()))


if __name__ == "__main__":
    unittest.main()

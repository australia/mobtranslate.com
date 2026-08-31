from __future__ import annotations

import hashlib
from pathlib import Path
import tempfile
import unittest


class RunWajarriStageILocalCensusTest(unittest.TestCase):
    def test_checksum_inventory_rejects_unlisted_files(self) -> None:
        from training.translation.run_wajarri_stage_i_local_census import (
            ContractError,
            verify_checksum_inventory,
        )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = root / "payload.json"
            payload.write_text("{}\n", encoding="utf-8")
            digest = hashlib.sha256(payload.read_bytes()).hexdigest()
            (root / "OUTPUT-SHA256SUMS").write_text(
                f"{digest}  payload.json\n", encoding="utf-8"
            )
            self.assertEqual(verify_checksum_inventory(root)["files"], 1)
            (root / "unlisted.txt").write_text("drift\n", encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "membership drift"):
                verify_checksum_inventory(root)

    def test_evaluator_command_is_explicitly_active_only(self) -> None:
        from training.translation.run_wajarri_stage_i_local_census import (
            evaluator_command,
        )

        preflight = {
            "raw_base_model": "/base",
            "suites": {"prompt_group": {"path": "/prompt.jsonl"}},
            "exposure_ledger": {"path": "/ledger.jsonl", "population": "C0"},
        }
        contract = {
            "expected_trainable_tokens": ["wbv_Latn", "<lexeme>"],
            "evaluation": {
                "direction": "eng-wbv",
                "source_lang": "eng_Latn",
                "target_lang": "wbv_Latn",
                "batch_size": 8,
                "max_source_length": 192,
                "max_new_tokens": 32,
                "dtype": "float32",
                "seed": 0,
            },
        }
        arm = {
            "arm": "I0",
            "control_contract_path": "/control",
            "control_manifest_sha256": "a" * 64,
            "adapter_path": "/adapter",
            "training_manifest_path": "/training.json",
        }
        command = evaluator_command(
            Path("/python"),
            preflight,
            contract,
            arm,
            Path("/output/arms/I0/step-400"),
        )
        self.assertIn("--no-paired-disabled-adapter-baseline", command)
        self.assertIn("--no-require-merge-equivalence", command)
        self.assertIn("--progress-jsonl", command)
        progress_index = command.index("--progress-jsonl") + 1
        self.assertEqual(
            command[progress_index],
            "/output/logs/evaluate-I0-step400.progress.jsonl",
        )
        self.assertNotIn("--require-cuda", command)
        self.assertEqual(command.count("--expected-trainable-token"), 2)

    def test_selection_uses_frozen_thresholds(self) -> None:
        from training.translation.run_wajarri_stage_i_local_census import (
            apply_selection,
        )

        arms = {
            "I0": {
                "hard_gate_pass": True,
                "prompt_group_gcer": 0.900,
                "source_context_gcer": 0.920,
                "prompt_group_exact": 10,
                "synthetic_chrf": 30.0,
            },
            "I1": {
                "hard_gate_pass": True,
                "prompt_group_gcer": 0.894,
                "source_context_gcer": 0.918,
                "prompt_group_exact": 11,
                "synthetic_chrf": 29.5,
            },
            "I2": {
                "hard_gate_pass": True,
                "prompt_group_gcer": 0.899,
                "source_context_gcer": 0.910,
                "prompt_group_exact": 16,
                "synthetic_chrf": 28.9,
            },
        }
        selected = apply_selection(arms)
        self.assertEqual(selected["selected_arm"], "I1")
        self.assertEqual(selected["qualified_challengers"], ["I1"])

    def test_selection_retains_baseline_below_resolution(self) -> None:
        from training.translation.run_wajarri_stage_i_local_census import (
            apply_selection,
        )

        baseline = {
            "hard_gate_pass": True,
            "prompt_group_gcer": 0.900,
            "source_context_gcer": 0.920,
            "prompt_group_exact": 10,
            "synthetic_chrf": 30.0,
        }
        arms = {
            "I0": dict(baseline),
            "I1": {
                **baseline,
                "prompt_group_gcer": 0.897,
                "prompt_group_exact": 12,
            },
            "I2": {
                **baseline,
                "prompt_group_gcer": 0.901,
                "prompt_group_exact": 14,
            },
        }
        selected = apply_selection(arms)
        self.assertEqual(selected["selected_arm"], "I0")
        self.assertEqual(selected["qualified_challengers"], [])


if __name__ == "__main__":
    unittest.main()

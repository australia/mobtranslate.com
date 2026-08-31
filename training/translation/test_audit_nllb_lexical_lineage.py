from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("audit_nllb_lexical_lineage.py")
SPEC = importlib.util.spec_from_file_location("audit_nllb_lexical_lineage", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NllbLexicalLineageAuditTest(unittest.TestCase):
    def zero_step_inputs(self) -> tuple[dict, dict, list[dict], list[dict]]:
        contract = {
            "experiment_id": "experiment-1",
            "optimizer_steps": 0,
            "model": {
                "artifact_id": "control-1",
                "weights_sha256": "weights",
                "base_revision": "revision",
            },
            "task": {"target_token": "wbv_Latn"},
        }
        manifest = {
            "artifact_id": "control-1",
            "artifact_kind": "untrained_nllb_control_model",
            "artifact_files": {"model.safetensors": {"sha256": "weights"}},
            "base": {"revision": "revision"},
            "extension": {
                "ordered_extension_rows": [
                    {
                        "role": "target_language",
                        "initialization": {"source_token": "tpi_Latn"},
                    }
                ]
            },
        }
        models = [
            {
                "merged_weights_sha256": "weights",
                "adapter_sha256": None,
                "task_contract": {"optimizer_steps": 0},
            }
        ]
        experiments = [
            {
                "experiment_key": "experiment-1",
                "observed_global_step": 0,
                "provider_run_id": None,
                "token_accounting": {
                    "training_examples_presented": 0,
                    "source_training_tokens": 0,
                    "target_training_tokens": 0,
                    "optimizer_updates": 0,
                },
            }
        ]
        return contract, manifest, models, experiments

    def test_bounded_surface_detection(self) -> None:
        self.assertTrue(MODULE.contains_bounded_surface("Definition: mabarn", "mabarn"))
        self.assertTrue(MODULE.contains_bounded_surface("(ganggaly-ganggaly)", "ganggaly-ganggaly"))
        self.assertFalse(MODULE.contains_bounded_surface("mabarnu", "mabarn"))
        self.assertFalse(MODULE.contains_bounded_surface("amabarn", "mabarn"))

    def test_zero_step_lineage_is_explicit(self) -> None:
        lineage = MODULE.assert_zero_step_lineage(*self.zero_step_inputs())
        self.assertEqual(
            lineage["classification"],
            "zero_project_training_exposure_upstream_unknown",
        )
        self.assertEqual(lineage["upstream_nllb_pretraining_exposure"], "unknown")
        self.assertFalse(lineage["target_reference_used_to_fit_tokenizer"])

    def test_nonzero_training_exposure_fails(self) -> None:
        contract, manifest, models, experiments = self.zero_step_inputs()
        experiments[0]["token_accounting"]["target_training_tokens"] = 1
        with self.assertRaisesRegex(ValueError, "nonzero project training exposure"):
            MODULE.assert_zero_step_lineage(contract, manifest, models, experiments)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("check_dictionary_cpu_deployment_gate.py")
CHECKS = {
    "benchmark_rows_at_least_minimum": True,
    "normalized_accepted_reference_exact_rate_ge_0_80": True,
    "wilson_95_lower_bound_ge_0_80": True,
    "empty_outputs_zero": True,
}


class CpuDeploymentInterlockTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.model = self.root / "model.safetensors"
        self.model.write_bytes(b"exact model bytes")
        self.model_sha = hashlib.sha256(self.model.read_bytes()).hexdigest()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_check(self, gate: dict) -> subprocess.CompletedProcess[str]:
        gate_file = self.root / "gate.json"
        gate_file.write_text(json.dumps(gate), encoding="utf-8")
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--gate",
                str(gate_file),
                "--model-id",
                "candidate-v1",
                "--model-file",
                str(self.model),
            ],
            capture_output=True,
            text=True,
        )

    def passing_gate(self) -> dict:
        return {
            "gate_type": "model_lexical_reconstruction",
            "status": "PASS",
            "decision": "MODEL_LEXICAL_RECONSTRUCTION_ALLOWED",
            "checks": CHECKS,
            "model": {
                "id": "candidate-v1",
                "merged_model_sha256": self.model_sha,
            },
        }

    def test_exact_model_and_passing_gate_allow_start(self) -> None:
        result = self.run_check(self.passing_gate())
        self.assertEqual(result.returncode, 0)
        self.assertTrue(json.loads(result.stdout)["allowed"])

    def test_failed_gate_blocks_before_model_hash(self) -> None:
        gate = self.passing_gate()
        gate["status"] = "FAIL"
        self.model.unlink()
        result = self.run_check(gate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("gate status is not PASS", result.stdout)

    def test_sentence_gate_cannot_authorize_lexical_model(self) -> None:
        gate = self.passing_gate()
        gate["gate_type"] = "model_sentence_generation"
        result = self.run_check(gate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("gate type", result.stdout)

    def test_model_id_mismatch_blocks_start(self) -> None:
        gate = self.passing_gate()
        gate["model"]["id"] = "different-model"
        self.assertNotEqual(self.run_check(gate).returncode, 0)

    def test_changed_weights_block_start(self) -> None:
        gate = self.passing_gate()
        self.model.write_bytes(b"changed model bytes")
        result = self.run_check(gate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256", result.stdout)


if __name__ == "__main__":
    unittest.main()

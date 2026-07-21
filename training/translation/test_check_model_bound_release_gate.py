#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("check_model_bound_release_gate.py")


class ModelBoundReleaseGateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.model = self.root / "model.safetensors"
        self.model.write_bytes(b"model bytes")
        self.model_sha = hashlib.sha256(self.model.read_bytes()).hexdigest()
        self.adapter = self.root / "adapter.safetensors"
        self.adapter.write_bytes(b"adapter bytes")
        self.adapter_sha = hashlib.sha256(self.adapter.read_bytes()).hexdigest()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def gate(self) -> dict:
        return {
            "gate_type": "model_sentence_generation",
            "status": "PASS",
            "decision": "SENTENCE_GENERATION_ALLOWED",
            "checks": {"natural_evaluation": True, "speaker_review": True},
            "model": {"id": "candidate-v1", "merged_model_sha256": self.model_sha},
        }

    def run_check(self, gate: dict) -> subprocess.CompletedProcess[str]:
        path = self.root / "gate.json"
        path.write_text(json.dumps(gate), encoding="utf-8")
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--gate",
                str(path),
                "--gate-type",
                "model_sentence_generation",
                "--allowed-decision",
                "SENTENCE_GENERATION_ALLOWED",
                "--model-id",
                "candidate-v1",
                "--model-file",
                str(self.model),
            ],
            capture_output=True,
            text=True,
        )

    def run_artifact_check(self, gate: dict) -> subprocess.CompletedProcess[str]:
        path = self.root / "artifact-gate.json"
        path.write_text(json.dumps(gate), encoding="utf-8")
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--gate",
                str(path),
                "--gate-type",
                "operator_research_preview",
                "--allowed-decision",
                "OPERATOR_RESEARCH_PREVIEW_ALLOWED",
                "--model-id",
                "candidate-v2",
                "--artifact",
                f"base={self.model}",
                "--artifact",
                f"adapter={self.adapter}",
            ],
            capture_output=True,
            text=True,
        )

    def test_matching_pass_allows_exact_weights(self) -> None:
        result = self.run_check(self.gate())
        self.assertEqual(result.returncode, 0)
        self.assertTrue(json.loads(result.stdout)["allowed"])

    def test_failed_sentence_gate_blocks_without_hashing(self) -> None:
        gate = self.gate()
        gate["status"] = "FAIL"
        gate["decision"] = "SENTENCE_GENERATION_PROHIBITED"
        gate["checks"]["speaker_review"] = False
        self.model.unlink()
        result = self.run_check(gate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("gate status is not PASS", result.stdout)

    def test_lexical_gate_cannot_authorize_sentences(self) -> None:
        gate = self.gate()
        gate["gate_type"] = "model_lexical_reconstruction"
        result = self.run_check(gate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("gate type", result.stdout)

    def test_changed_weights_block(self) -> None:
        gate = self.gate()
        self.model.write_bytes(b"changed")
        result = self.run_check(gate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256", result.stdout)

    def test_matching_runtime_artifacts_allow_exact_base_and_adapter(self) -> None:
        gate = {
            "gate_type": "operator_research_preview",
            "status": "PASS",
            "decision": "OPERATOR_RESEARCH_PREVIEW_ALLOWED",
            "checks": {"runtime_verified": True, "warning_required": True},
            "model": {
                "id": "candidate-v2",
                "artifacts": {
                    "base": {"sha256": self.model_sha},
                    "adapter": {"sha256": self.adapter_sha},
                },
            },
        }
        result = self.run_artifact_check(gate)
        self.assertEqual(result.returncode, 0, result.stdout)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["allowed"])
        self.assertEqual(payload["artifacts"]["adapter"], self.adapter_sha)

    def test_changed_adapter_blocks_runtime_artifact_gate(self) -> None:
        gate = {
            "gate_type": "operator_research_preview",
            "status": "PASS",
            "decision": "OPERATOR_RESEARCH_PREVIEW_ALLOWED",
            "checks": {"runtime_verified": True},
            "model": {
                "id": "candidate-v2",
                "artifacts": {
                    "base": {"sha256": self.model_sha},
                    "adapter": {"sha256": self.adapter_sha},
                },
            },
        }
        self.adapter.write_bytes(b"changed adapter")
        result = self.run_artifact_check(gate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("adapter", result.stdout)


if __name__ == "__main__":
    unittest.main()

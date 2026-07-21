#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

if __package__:
    from .verify_dictionary_cpu_deployment import required_successes, wilson_interval
else:
    from verify_dictionary_cpu_deployment import required_successes, wilson_interval


SCRIPT = Path(__file__).with_name("verify_dictionary_cpu_deployment.py")


class DictionaryCpuDeploymentGateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_gate(self, *, exact: int, rows: int = 297, empty: int = 0) -> dict:
        audit = self.root / "audit.json"
        audit.write_text(
            json.dumps(
                {
                    "models": {
                        "candidate": {
                            "lexicon": {
                                "overall": {
                                    "rows": rows,
                                    "normalized_exact_count": exact,
                                    "empty_outputs": empty,
                                }
                            }
                        }
                    }
                }
            ),
            encoding="utf-8",
        )
        output = self.root / "gate.json"
        subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
            "--lexicon-audit",
            str(audit),
            "--model-id",
            "test-model",
            "--model-sha256",
            "a" * 64,
            "--output",
            str(output),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(output.read_text(encoding="utf-8"))

    def test_252_of_297_is_first_reliable_pass(self) -> None:
        self.assertEqual(required_successes(297, 0.80, 0.80), 252)
        self.assertLess(wilson_interval(251, 297)[0], 0.80)
        self.assertGreaterEqual(wilson_interval(252, 297)[0], 0.80)
        gate = self.run_gate(exact=252)
        self.assertEqual(gate["status"], "PASS")
        self.assertEqual(gate["gate_type"], "model_lexical_reconstruction")
        self.assertEqual(gate["decision"], "MODEL_LEXICAL_RECONSTRUCTION_ALLOWED")
        self.assertFalse(gate["policy"]["population_reliability_claim_allowed"])

    def test_80_percent_point_estimate_alone_fails_reliability(self) -> None:
        gate = self.run_gate(exact=238)
        self.assertGreaterEqual(gate["benchmark"]["normalized_exact_rate"], 0.80)
        self.assertFalse(gate["checks"]["wilson_95_lower_bound_ge_0_80"])
        self.assertEqual(gate["decision"], "MODEL_LEXICAL_RECONSTRUCTION_PROHIBITED")

    def test_empty_output_prohibits_mount(self) -> None:
        gate = self.run_gate(exact=260, empty=1)
        self.assertFalse(gate["checks"]["empty_outputs_zero"])
        self.assertEqual(gate["status"], "FAIL")

    def test_current_v21_dictionary_result_fails(self) -> None:
        gate = self.run_gate(exact=48)
        self.assertAlmostEqual(gate["benchmark"]["normalized_exact_percent"], 16.1616161616)
        self.assertEqual(gate["decision"], "MODEL_LEXICAL_RECONSTRUCTION_PROHIBITED")


if __name__ == "__main__":
    unittest.main()

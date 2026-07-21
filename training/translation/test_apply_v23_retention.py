#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("apply_v23_retention.py")


class RetentionPolicyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.models = self.root / "models"
        for label in ("seed17", "seed42", "seed73"):
            model = self.models / label
            for directory in ("adapter", "merged", "runs", "checkpoint-148"):
                target = model / directory
                target.mkdir(parents=True)
                (target / "weights.bin").write_bytes(b"weights")
            (model / "model_manifest.json").write_text("{}\n", encoding="utf-8")
            (model / "eval.predictions.json").write_text("{}\n", encoding="utf-8")
        self.selection = self.root / "selection.json"
        self.selection.write_text(
            json.dumps(
                {
                    "candidates": [{"label": label} for label in ("seed17", "seed42", "seed73")],
                    "selected": {"label": "seed42"},
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_policy(self, status: str, *, apply: bool = True) -> dict:
        gate = self.root / "gate.json"
        gate.write_text(
            json.dumps({"status": status, "selected_seed": "seed42"}),
            encoding="utf-8",
        )
        output = self.root / "retention.json"
        command = [
            sys.executable,
            str(SCRIPT),
            "--models-root",
            str(self.models),
            "--seed-selection",
            str(self.selection),
            "--promotion-gate",
            str(gate),
            "--output",
            str(output),
        ]
        if apply:
            command.append("--apply")
        subprocess.run(command, check=True, capture_output=True, text=True)
        return json.loads(output.read_text(encoding="utf-8"))

    def test_pass_keeps_only_selected_final_weights(self) -> None:
        ledger = self.run_policy("PASS")
        for label in ("seed17", "seed73"):
            self.assertFalse((self.models / label / "adapter").exists())
            self.assertFalse((self.models / label / "merged").exists())
        self.assertTrue((self.models / "seed42" / "adapter").is_dir())
        self.assertTrue((self.models / "seed42" / "merged").is_dir())
        for label in ("seed17", "seed42", "seed73"):
            self.assertFalse((self.models / label / "checkpoint-148").exists())
            self.assertFalse((self.models / label / "runs").exists())
            self.assertTrue((self.models / label / "model_manifest.json").is_file())
            self.assertTrue((self.models / label / "eval.predictions.json").is_file())
        self.assertEqual(ledger["retained_weight_dirs"], ["seed42/adapter", "seed42/merged"])

    def test_fail_deletes_every_weight_directory(self) -> None:
        ledger = self.run_policy("FAIL")
        for label in ("seed17", "seed42", "seed73"):
            for directory in ("adapter", "merged", "runs", "checkpoint-148"):
                self.assertFalse((self.models / label / directory).exists())
            self.assertTrue((self.models / label / "model_manifest.json").is_file())
        self.assertEqual(ledger["retained_weight_dirs"], [])

    def test_dry_run_changes_nothing(self) -> None:
        ledger = self.run_policy("FAIL", apply=False)
        self.assertEqual(ledger["mode"], "DRY_RUN")
        self.assertTrue((self.models / "seed17" / "merged").is_dir())
        self.assertGreater(ledger["summary"]["bytes"], 0)

    def test_mismatched_selected_seed_is_rejected(self) -> None:
        gate = self.root / "gate.json"
        gate.write_text(
            json.dumps({"status": "PASS", "selected_seed": "seed73"}),
            encoding="utf-8",
        )
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--models-root",
                str(self.models),
                "--seed-selection",
                str(self.selection),
                "--promotion-gate",
                str(gate),
                "--output",
                str(self.root / "retention.json"),
            ],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("disagree", result.stderr)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest


class WaitForLocalCensusAdmissionTest(unittest.TestCase):
    def test_host_sample_reports_every_failed_threshold(self) -> None:
        from training.translation.wait_for_local_census_admission import (
            read_host_sample,
        )

        with tempfile.TemporaryDirectory() as temporary:
            proc = Path(temporary)
            (proc / "pressure").mkdir()
            (proc / "meminfo").write_text(
                "MemTotal: 24000000 kB\nMemAvailable: 7000000 kB\n",
                encoding="utf-8",
            )
            (proc / "loadavg").write_text("5.5 4.5 3.0 1/1 1\n", encoding="utf-8")
            (proc / "pressure" / "io").write_text(
                "some avg10=3.00 avg60=2.00 avg300=1.00 total=1\n"
                "full avg10=2.50 avg60=2.00 avg300=1.00 total=1\n",
                encoding="utf-8",
            )
            (proc / "pressure" / "memory").write_text(
                "some avg10=2.00 avg60=1.00 avg300=1.00 total=1\n"
                "full avg10=1.50 avg60=1.00 avg300=1.00 total=1\n",
                encoding="utf-8",
            )
            sample = read_host_sample(
                {
                    "minimum_mem_available_bytes": 8 * 1024**3,
                    "maximum_load_1m": 4.0,
                    "maximum_load_5m": 4.0,
                    "maximum_io_full_avg10": 2.0,
                    "maximum_memory_full_avg10": 1.0,
                },
                proc,
            )
        self.assertFalse(sample["clean"])
        self.assertEqual(
            sample["failed_conditions"],
            [
                "mem_available_bytes",
                "load_1m",
                "load_5m",
                "io_full_avg10",
                "memory_full_avg10",
            ],
        )

    def test_clean_evidence_requires_spacing_and_resets_on_dirty_sample(self) -> None:
        from training.translation.wait_for_local_census_admission import (
            update_clean_evidence,
        )

        clean = {"clean": True}
        dirty = {"clean": False}
        evidence, admitted = update_clean_evidence([], clean, 0.0, 2, 300.0)
        self.assertEqual(len(evidence), 1)
        self.assertFalse(admitted)
        evidence, admitted = update_clean_evidence(evidence, clean, 299.0, 2, 300.0)
        self.assertEqual(len(evidence), 1)
        self.assertFalse(admitted)
        evidence, admitted = update_clean_evidence(evidence, dirty, 300.0, 2, 300.0)
        self.assertEqual(evidence, [])
        self.assertFalse(admitted)
        evidence, _ = update_clean_evidence(evidence, clean, 400.0, 2, 300.0)
        evidence, admitted = update_clean_evidence(evidence, clean, 700.0, 2, 300.0)
        self.assertEqual(len(evidence), 2)
        self.assertTrue(admitted)

    def test_census_command_is_contract_driven_and_resume_explicit(self) -> None:
        from training.translation.wait_for_local_census_admission import (
            census_command,
        )

        command = census_command(
            {"driver": {"path": "training/translation/driver.py"}},
            Path("/contract.json"),
            Path("/program"),
            Path("/workspace"),
            Path("/output"),
            Path("/venv/python"),
            True,
        )
        self.assertEqual(command[0], "/venv/python")
        self.assertEqual(command[1], "/workspace/training/translation/driver.py")
        self.assertEqual(command[-1], "--resume")
        self.assertEqual(json.loads(json.dumps(command)), command)


if __name__ == "__main__":
    unittest.main()

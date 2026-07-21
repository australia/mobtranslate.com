from __future__ import annotations

import re
import unittest
from pathlib import Path


SPEECH_ROOT = Path(__file__).resolve().parent
LOCK_PATH = SPEECH_ROOT / "requirements-serverless.lock"
EVALUATION_LOCK_PATH = SPEECH_ROOT / "requirements-evaluation.lock"
DATASET_LOCK_PATH = SPEECH_ROOT / "requirements-dataset.lock"
DOCKERFILE_PATH = SPEECH_ROOT / "Dockerfile.serverless"

EXPECTED_BASE = (
    "docker.io/runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404"
    "@sha256:0a360022e8de4375af99430f84e8b38951acc397252163a37ceac7204d01be35"
)
EXPECTED_PACKAGES = {
    "omnilingual-asr": "0.1.0",
    "runpod": "1.10.1",
    "torch": "2.8.0+cu128",
    "torchaudio": "2.8.0+cu128",
}
EXPECTED_EVALUATION_PACKAGES = {
    "httpx": "0.28.1",
    "jiwer": "4.0.0",
    "pyyaml": "6.0.2",
    "regex": "2025.7.34",
}
PACKAGE_LINE = re.compile(r"^([a-z0-9][a-z0-9._-]*)==([^\s]+) \\$")
HASH_LINE = re.compile(r"^    --hash=sha256:[0-9a-f]{64}(?: \\)?$")


class SpeechReproducibilityTests(unittest.TestCase):
    def test_serverless_image_uses_immutable_runtime_and_hash_lock(self) -> None:
        dockerfile = DOCKERFILE_PATH.read_text(encoding="utf-8")
        self.assertIn(f"FROM {EXPECTED_BASE}\n", dockerfile)
        self.assertIn("COPY requirements-serverless.lock ./", dockerfile)
        self.assertIn("--require-hashes", dockerfile)
        self.assertIn("https://download.pytorch.org/whl/cu128", dockerfile)
        self.assertNotIn("COPY requirements-serverless.txt ./", dockerfile)

    def test_lock_is_complete_and_pins_runtime_packages(self) -> None:
        lines = LOCK_PATH.read_text(encoding="utf-8").splitlines()
        self.assertIn("--index-url https://pypi.org/simple", lines)

        packages: dict[str, str] = {}
        index = 0
        while index < len(lines):
            match = PACKAGE_LINE.fullmatch(lines[index])
            if not match:
                index += 1
                continue

            name, version = match.groups()
            self.assertNotIn(name, packages)
            packages[name] = version

            index += 1
            hashes = 0
            while index < len(lines) and HASH_LINE.fullmatch(lines[index]):
                hashes += 1
                index += 1
            self.assertGreater(hashes, 0, f"{name} has no distribution hash")

        self.assertEqual(len(packages), 144)
        for name, version in EXPECTED_PACKAGES.items():
            self.assertEqual(packages.get(name), version)

    def test_evaluation_dependencies_are_hash_locked(self) -> None:
        lines = EVALUATION_LOCK_PATH.read_text(encoding="utf-8").splitlines()
        packages: dict[str, str] = {}
        index = 0
        while index < len(lines):
            match = PACKAGE_LINE.fullmatch(lines[index])
            if not match:
                index += 1
                continue
            name, version = match.groups()
            self.assertNotIn(name, packages)
            packages[name] = version
            index += 1
            hashes = 0
            while index < len(lines) and HASH_LINE.fullmatch(lines[index]):
                hashes += 1
                index += 1
            self.assertGreater(hashes, 0, f"{name} has no distribution hash")

        self.assertEqual(len(packages), 12)
        for name, version in EXPECTED_EVALUATION_PACKAGES.items():
            self.assertEqual(packages.get(name), version)

    def test_dataset_builder_dependency_is_hash_locked(self) -> None:
        lines = DATASET_LOCK_PATH.read_text(encoding="utf-8").splitlines()
        package_line = next(line for line in lines if line.startswith("pyarrow=="))
        self.assertEqual(package_line, "pyarrow==23.0.1 \\")
        self.assertTrue(any(HASH_LINE.fullmatch(line) for line in lines))


if __name__ == "__main__":
    unittest.main()

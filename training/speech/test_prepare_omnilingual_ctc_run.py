from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

import prepare_omnilingual_ctc_run as prepare
from asr_benchmark import BenchmarkError


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PrepareOmnilingualCtcRunTests(unittest.TestCase):
    def fixture(self, root: Path) -> tuple[Path, Path, str, str]:
        upstream = root / "upstream"
        config_path = upstream / prepare.RECOMMENDED_CONFIG
        config_path.parent.mkdir(parents=True)
        (upstream / "src/omnilingual_asr/cards/datasets").mkdir(parents=True)
        config_path.write_text(
            yaml.safe_dump(
                {
                    "model": {"name": "omniASR_CTC_300M"},
                    "dataset": {
                        "name": "example_dataset",
                        "train_split": "train",
                        "valid_split": "dev",
                        "mixture_parquet_storage_config": {
                            "dataset_summary_path": "/replace/me"
                        },
                        "asr_task_config": {"max_audio_len": 960_000},
                    },
                    "tokenizer": {"name": "omniASR_tokenizer_v1"},
                    "optimizer": {"config": {"lr": 1e-5}},
                    "regime": {"num_steps": 5_000},
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        subprocess.run(["git", "init", "-q", str(upstream)], check=True)
        subprocess.run(["git", "-C", str(upstream), "config", "user.name", "test"], check=True)
        subprocess.run(
            ["git", "-C", str(upstream), "config", "user.email", "test@example.invalid"],
            check=True,
        )
        subprocess.run(["git", "-C", str(upstream), "add", "."], check=True)
        subprocess.run(["git", "-C", str(upstream), "commit", "-qm", "fixture"], check=True)
        commit = subprocess.run(
            ["git", "-C", str(upstream), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

        dataset = root / "dataset"
        (dataset / "version=0").mkdir(parents=True)
        data_file = dataset / "version=0" / "sample.parquet"
        data_file.write_bytes(b"test parquet fixture")
        stats = dataset / "language_distribution_0.tsv"
        stats.write_text("corpus\tlanguage\thours\ntest\tgvn_Latn\t0.1\n")
        (dataset / "dataset-manifest.json").write_text(
            json.dumps(
                {
                    "upstream": {"commit": commit},
                    "rows_by_split": {"train": 1, "dev": 1, "test": 1},
                    "files": {
                        "version=0/sample.parquet": sha256(data_file),
                        "language_distribution_0.tsv": sha256(stats),
                    },
                }
            ),
            encoding="utf-8",
        )
        return upstream, dataset, commit, sha256(config_path)

    def test_prepares_an_immutable_upstream_and_dataset_bound_run(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            upstream, dataset, commit, config_hash = self.fixture(root)
            with (
                patch.object(prepare, "UPSTREAM_COMMIT", commit),
                patch.object(prepare, "UPSTREAM_RECOMMENDED_CONFIG_SHA256", config_hash),
            ):
                result = prepare.prepare_run(upstream, dataset, root / "run", seed=73)

            self.assertEqual(result["seed"], 73)
            self.assertEqual(result["upstream_commit"], commit)
            self.assertTrue((root / "run/ctc-finetune.yaml").is_file())
            self.assertTrue(Path(result["dataset_card"]).is_file())
            self.assertEqual(result["contract"]["steps"], 5_000)

    def test_rejects_a_dataset_changed_after_manifesting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            upstream, dataset, commit, config_hash = self.fixture(root)
            (dataset / "version=0/sample.parquet").write_bytes(b"tampered")
            with (
                patch.object(prepare, "UPSTREAM_COMMIT", commit),
                patch.object(prepare, "UPSTREAM_RECOMMENDED_CONFIG_SHA256", config_hash),
                self.assertRaisesRegex(BenchmarkError, "dataset integrity failed"),
            ):
                prepare.prepare_run(upstream, dataset, root / "run", seed=17)


if __name__ == "__main__":
    unittest.main()

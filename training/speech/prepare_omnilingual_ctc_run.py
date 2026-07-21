from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import yaml

from asr_benchmark import BenchmarkError
from build_omnilingual_ctc_dataset import (
    UPSTREAM_COMMIT,
    UPSTREAM_RECOMMENDED_CONFIG_SHA256,
)


RECOMMENDED_CONFIG = Path(
    "workflows/recipes/wav2vec2/asr/configs/ctc-finetune-recommendation.yaml"
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BenchmarkError(f"could not read {path}: {error}") from error
    if not isinstance(value, dict):
        raise BenchmarkError(f"{path}: expected an object")
    return value


def prepare_run(upstream: Path, dataset: Path, output: Path, *, seed: int) -> dict[str, Any]:
    upstream = upstream.resolve()
    dataset = dataset.resolve()
    output = output.resolve()
    if output.exists():
        raise BenchmarkError(f"run output already exists: {output}")

    commit = subprocess.run(
        ["git", "-C", str(upstream), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if commit != UPSTREAM_COMMIT:
        raise BenchmarkError(f"upstream commit must be {UPSTREAM_COMMIT}; found {commit}")

    recommended_path = upstream / RECOMMENDED_CONFIG
    if _sha256(recommended_path) != UPSTREAM_RECOMMENDED_CONFIG_SHA256:
        raise BenchmarkError("the pinned upstream CTC recommendation config changed")

    dataset_manifest_path = dataset / "dataset-manifest.json"
    dataset_manifest = _load_json(dataset_manifest_path)
    upstream_manifest = dataset_manifest.get("upstream")
    if not isinstance(upstream_manifest, dict) or upstream_manifest.get("commit") != commit:
        raise BenchmarkError("dataset and trainer upstream commits do not match")
    rows_by_split = dataset_manifest.get("rows_by_split")
    if not isinstance(rows_by_split, dict) or any(
        not isinstance(rows_by_split.get(split), int) or rows_by_split[split] < 1
        for split in ("train", "dev", "test")
    ):
        raise BenchmarkError("dataset must contain non-empty train, dev, and test splits")

    files = dataset_manifest.get("files")
    if not isinstance(files, dict) or not files:
        raise BenchmarkError("dataset manifest has no file hashes")
    for relative, expected in files.items():
        path = (dataset / str(relative)).resolve()
        if not path.is_relative_to(dataset) or not path.is_file() or _sha256(path) != expected:
            raise BenchmarkError(f"dataset integrity failed: {relative}")

    config = yaml.safe_load(recommended_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise BenchmarkError("upstream recommendation is not a YAML object")
    dataset_id = _sha256(dataset_manifest_path)[:12]
    asset_name = f"mobtranslate_kuku_yalanji_v1_{dataset_id}"
    config["dataset"]["name"] = asset_name
    config["dataset"]["mixture_parquet_storage_config"]["dataset_summary_path"] = str(
        dataset / "language_distribution_0.tsv"
    )
    config["common"] = {"seed": seed}

    expected_contract = {
        "model": "omniASR_CTC_300M",
        "tokenizer": "omniASR_tokenizer_v1",
        "learning_rate": 1e-5,
        "steps": 5_000,
        "maximum_audio_samples": 960_000,
    }
    observed_contract = {
        "model": config["model"]["name"],
        "tokenizer": config["tokenizer"]["name"],
        "learning_rate": config["optimizer"]["config"]["lr"],
        "steps": config["regime"]["num_steps"],
        "maximum_audio_samples": config["dataset"]["asr_task_config"]["max_audio_len"],
    }
    if observed_contract != expected_contract:
        raise BenchmarkError(
            f"upstream recommendation contract changed: {observed_contract!r}"
        )

    output.mkdir(parents=True, mode=0o700)
    config_path = output / "ctc-finetune.yaml"
    config_path.write_text(
        yaml.safe_dump(config, sort_keys=False, allow_unicode=True), encoding="utf-8"
    )
    config_path.chmod(0o600)

    card = {
        "name": asset_name,
        "dataset_family": "mixture_parquet_asr_dataset",
        "dataset_config": {"data": str(dataset / "version=0")},
        "tokenizer_ref": "omniASR_tokenizer_v1",
    }
    card_path = upstream / "src/omnilingual_asr/cards/datasets" / f"{asset_name}.yaml"
    if card_path.exists():
        raise BenchmarkError(f"dataset card already exists in the upstream checkout: {card_path}")
    card_path.write_text(yaml.safe_dump(card, sort_keys=False), encoding="utf-8")

    command = [
        "python",
        "-m",
        "workflows.recipes.wav2vec2.asr",
        str(output / "artifacts"),
        "--config-file",
        str(config_path),
    ]
    run_manifest = {
        "schema_version": 1,
        "upstream_commit": commit,
        "upstream_recommended_config_sha256": UPSTREAM_RECOMMENDED_CONFIG_SHA256,
        "dataset_manifest_sha256": _sha256(dataset_manifest_path),
        "dataset_card": str(card_path),
        "dataset_card_sha256": _sha256(card_path),
        "config": str(config_path),
        "config_sha256": _sha256(config_path),
        "seed": seed,
        "contract": observed_contract,
        "command": command,
        "selection_rule": "select on dev WER; open the speaker/text-disjoint test split once",
    }
    (output / "run-manifest.json").write_text(
        json.dumps(run_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return run_manifest


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify and prepare a pinned Omnilingual CTC fine-tuning run."
    )
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()
    try:
        manifest = prepare_run(args.upstream, args.dataset, args.output, seed=args.seed)
    except (BenchmarkError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(2, f"error: {error}\n")
    print(json.dumps({"command": manifest["command"], "config_sha256": manifest["config_sha256"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

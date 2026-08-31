from __future__ import annotations

from argparse import Namespace
import hashlib
import json
from pathlib import Path

import pytest

from training.translation.build_wajarri_v3_controlled_hf_release import (
    BASE_REVISION,
    EXPECTED_SEEDS,
    sha256_file,
    stage_release,
)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True) + "\n", encoding="utf-8")


def write_file(path: Path, value: bytes | str = b"fixture") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(value, str):
        path.write_text(value, encoding="utf-8")
    else:
        path.write_bytes(value)


def build_result_manifest(root: Path, run_id: str) -> None:
    files = {}
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix()
        files[relative] = {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
    write_json(
        root / "RESULT-MANIFEST.json",
        {"schema_version": 1, "run_id": run_id, "files": files},
    )


def summary(adapter_hash: str, device: str, dtype: str) -> dict:
    return {
        "adapter_weight_sha256": adapter_hash,
        "device": device,
        "dtype": dtype,
    }


def fixture(tmp_path: Path) -> Namespace:
    confirmation = tmp_path / "confirmation"
    contract_path = tmp_path / "CONTRACT.json"
    cpu_dir = tmp_path / "cpu"
    run_id = "wbv-v3-forced-slot-confirmation-test-a2"
    dataset_sha = "d" * 64
    contract = {
        "run_id": run_id,
        "confirmation_seeds": list(EXPECTED_SEEDS),
        "arms": {"M8": {"schedule_sha256": dataset_sha}},
    }
    write_json(contract_path, contract)

    seed_results = {}
    for seed in EXPECTED_SEEDS:
        adapter_dir = confirmation / f"selected-adapters/seed-{seed}"
        adapter_bytes = f"adapter-{seed}".encode()
        write_file(adapter_dir / "adapter_model.safetensors", adapter_bytes)
        for name in (
            "added_tokens.json",
            "sentencepiece.bpe.model",
            "special_tokens_map.json",
            "tokenizer_config.json",
        ):
            write_file(adapter_dir / name)
        write_json(adapter_dir / "adapter_config.json", {"revision": None})
        write_json(
            adapter_dir / "snapshot-manifest.json",
            {
                "binding": {
                    "optimization": {"trainer_seed": seed, "trainer_data_seed": seed},
                    "dataset": {"release_sha256": dataset_sha},
                }
            },
        )
        adapter_hash = hashlib.sha256(adapter_bytes).hexdigest()
        seed_results[str(seed)] = {
            "selected_step": 40,
            "adapter_weight_sha256": adapter_hash,
            "trainer_seed_gates": {
                "trainer_seed_bound_to_run": True,
                "trainer_data_seed_bound_to_run": True,
            },
            "combined_gates": {"all": True},
        }
        gpu_dir = confirmation / f"seeds/{seed}/selected-forced-route"
        if seed == 17:
            write_json(gpu_dir / "SUMMARY.json", summary(adapter_hash, "cuda", "bfloat16"))
            for batch_size in (1, 16):
                write_file(gpu_dir / f"PREDICTIONS.batch-{batch_size}.jsonl", "{}\n")

    winner_hash = seed_results["17"]["adapter_weight_sha256"]
    result = {
        "run_id": run_id,
        "status": "POSITIVE_INTERNAL_FORCED_SLOT_CONFIRMATION",
        "confirmation_pass": True,
        "controlled_route_candidate": True,
        "free_form_sentence_generation_authorized": False,
        "natural_language_reliability_claimed": False,
        "winning_seed": 17,
        "winning_adapter_weight_sha256": winner_hash,
        "seed_results": seed_results,
        "seed_diversity_gates": {
            "selected_adapter_hashes_distinct_across_seeds": True
        },
        "claim_limit": "controlled route only",
    }
    write_json(confirmation / "RESULT.json", result)
    write_json(confirmation / "DELETION-LEDGER.json", {"retained": True})
    write_json(
        confirmation / "RUN-COMPLETE.json",
        {
            "run_id": run_id,
            "result_sha256": sha256_file(confirmation / "RESULT.json"),
        },
    )
    build_result_manifest(confirmation, run_id)

    write_json(cpu_dir / "SUMMARY.json", summary(winner_hash, "cpu", "float32"))
    for batch_size in (1, 16):
        write_file(cpu_dir / f"PREDICTIONS.batch-{batch_size}.jsonl", "{}\n")
    gpu_dir = confirmation / "seeds/17/selected-forced-route"
    parity_report = tmp_path / "CPU-PARITY.json"
    write_json(
        parity_report,
        {
            "status": "PASS_CPU_FLOAT32_PARITY",
            "passed": True,
            "expected_adapter_sha256": winner_hash,
            "gpu_summary_sha256": sha256_file(gpu_dir / "SUMMARY.json"),
            "cpu_summary_sha256": sha256_file(cpu_dir / "SUMMARY.json"),
            "gpu_gates": {"all": True},
            "cpu_gates": {"all": True},
            "identity_gates": {"all": True},
            "parity_gates": {"all": True},
            "differences_by_batch": {"1": [], "16": []},
        },
    )
    return Namespace(
        confirmation_dir=confirmation,
        confirmation_contract=contract_path,
        expected_contract_sha256=sha256_file(contract_path),
        cpu_parity_report=parity_report,
        cpu_evaluation_dir=cpu_dir,
        dataset_revision="dataset-commit",
        model_repo="ajaxdavis/mobtranslate-wajarri-v3-controlled",
        model_version="v3.0.0-controlled-subject-slot-s17-step40-test",
        output_dir=tmp_path / "release",
        invalid_repeat_adjudication=None,
        provider_deletion_ledger=None,
    )


def test_stages_only_hash_bound_controlled_release(tmp_path: Path) -> None:
    args = fixture(tmp_path)
    source_config = args.confirmation_dir / "selected-adapters/seed-17/adapter_config.json"
    source_config_sha256 = sha256_file(source_config)
    manifest = stage_release(args)
    release = json.loads((args.output_dir / "release.json").read_text())
    config = json.loads(
        (args.output_dir / "adapter/adapter_config.json").read_text()
    )

    assert manifest["confirmation_pass"] is True
    assert manifest["cpu_float32_parity_pass"] is True
    assert manifest["free_form_translation_authorized"] is False
    assert release["authorization"]["controlledSubjectSlotRoute"] is True
    assert release["authorization"]["freeFormSentenceTranslation"] is False
    assert len(release["task"]["templates"]) == 6
    assert config["base_model_name_or_path"] == "ajaxdavis/mobtranslate-wajarri-v1"
    assert config["revision"] == BASE_REVISION
    assert sha256_file(source_config) == source_config_sha256
    verify_result = json.loads(
        (args.confirmation_dir / "RESULT-MANIFEST.json").read_text()
    )
    declared_source = verify_result["files"][
        "selected-adapters/seed-17/adapter_config.json"
    ]
    assert sha256_file(source_config) == declared_source["sha256"]


def test_rejects_nonindependent_seed_artifacts(tmp_path: Path) -> None:
    args = fixture(tmp_path)
    result_path = args.confirmation_dir / "RESULT.json"
    result = json.loads(result_path.read_text())
    result["seed_results"]["42"]["adapter_weight_sha256"] = result[
        "seed_results"
    ]["17"]["adapter_weight_sha256"]
    write_json(result_path, result)
    write_json(
        args.confirmation_dir / "RUN-COMPLETE.json",
        {
            "run_id": result["run_id"],
            "result_sha256": sha256_file(result_path),
        },
    )
    (args.confirmation_dir / "RESULT-MANIFEST.json").unlink()
    build_result_manifest(args.confirmation_dir, result["run_id"])

    with pytest.raises(ValueError, match="not distinct"):
        stage_release(args)


def test_rejects_failed_cpu_parity(tmp_path: Path) -> None:
    args = fixture(tmp_path)
    report = json.loads(args.cpu_parity_report.read_text())
    report["passed"] = False
    report["status"] = "FAIL_CPU_FLOAT32_PARITY"
    write_json(args.cpu_parity_report, report)

    with pytest.raises(ValueError, match="did not pass"):
        stage_release(args)

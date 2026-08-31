#!/usr/bin/env python3
"""Stage the public dataset record for the Wajarri v3 controlled adapter."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any


DATASET_REPO = "ajaxdavis/mobtranslate-wajarri-synthetic-corpus-v1"
SOURCE_REVISION = "422b081a7dd28dbb95bc216648206c13acf4b317"
EXPECTED_SCHEDULE_SHA256 = (
    "47e9b5b2cff341ac99d3f0162410252589a34e1628da4df755b11f9a9b16a369"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--existing-release-dir", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--confirmation-dir", type=Path, required=True)
    parser.add_argument("--cpu-parity-report", type=Path, required=True)
    parser.add_argument("--dataset-version", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def line_count(path: Path) -> int:
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def verify_checksums(root: Path, manifest_name: str = "SHA256SUMS") -> int:
    manifest = root / manifest_name
    count = 0
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, relative = line.split(None, 1)
        relative = relative.strip().removeprefix("./")
        path = root / relative
        if not path.is_file() or sha256_file(path) != digest:
            raise ValueError(f"checksum failed: {path}")
        count += 1
    if count == 0:
        raise ValueError(f"empty checksum manifest: {manifest}")
    return count


def copy_file(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def copy_tree_files(source: Path, destination: Path) -> None:
    for path in sorted(item for item in source.rglob("*") if item.is_file()):
        relative = path.relative_to(source)
        if ".cache" in relative.parts or relative.name == "SHA256SUMS":
            continue
        copy_file(path, destination / relative)


def checksum_manifest(root: Path) -> str:
    return "\n".join(
        f"{sha256_file(path)}  {path.relative_to(root).as_posix()}"
        for path in sorted(item for item in root.rglob("*") if item.is_file())
        if path.name != "SHA256SUMS" and ".cache" not in path.parts
    )


def render_readme(version: str, adapter_sha256: str) -> str:
    return f"""---
license: cc-by-nc-4.0
language:
- wbv
- en
task_categories:
- translation
pretty_name: MobTranslate Wajarri controlled research corpus
---

# MobTranslate Wajarri controlled research corpus

This repository preserves the public Wajarri lexical, historical, and controlled
synthetic material used by MobTranslate. Version `{version}` adds the exact subject-slot
training and development record for the v3 controlled adapter.

## v3 controlled addition

The v3 intervention does **not** claim 7,680 new Wajarri sentences. It contains:

- 103 existing source-governed parent sentence pairs represented with a deterministic
  output slot;
- six unique masked model inputs, one for each already licensed complete predicate;
- one exact 7,680-presentation M8 optimizer schedule;
- a 140-row consumed development screen, of which 35 rows are the authorized masked route;
- frozen lexical, retention, synthetic, and historical regression sets;
- the three-seed confirmation and CPU float32 parity records.

The slot `<copy>` is nonlinguistic interface metadata. A dictionary supplies one governed
Wajarri subject and the model predicts only a complete source-supported predicate. This
release creates zero new Wajarri sentence pairs and does not license productive morphology
or free-form translation.

## Layout

```text
data/ and evaluation/       # public v2 corpus and frozen evaluations
living-books/               # dictionary and grammar editions used by v2
v3-controlled/commission/   # unique subject-slot representations and evidence
v3-controlled/training/     # exact M8 schedule and token accounting
v3-controlled/development/  # consumed 140-row development screen
v3-controlled/evaluation/   # confirmation and CPU parity evidence
v3-controlled/provenance/   # contracts, reports, hashes, and invalid-run adjudication
v3-controlled/methods/      # exact builders, trainer, evaluator, and runner
```

The selected adapter SHA-256 is `{adapter_sha256}`. The model release and full serving
guide are at https://huggingface.co/ajaxdavis/mobtranslate-wajarri-v3-controlled.

## Limits

- Synthetic and controlled rows are not speaker-attested natural references.
- Repeated schedule presentations are optimizer exposure, not independent linguistic data.
- Closed lexical reconstruction measures retention of known mappings.
- The five historical rows are diagnostic and cannot authorize natural translation.
- No unrestricted Wajarri sentence-generation claim is made.
"""


def stage_release(args: argparse.Namespace) -> dict[str, Any]:
    existing = args.existing_release_dir.resolve()
    program = args.program_root.resolve()
    confirmation = args.confirmation_dir.resolve()
    parity_path = args.cpu_parity_report.resolve()
    output = args.output_dir.resolve()
    if output.exists():
        raise FileExistsError(output)
    if not args.dataset_version.startswith("v3.0.0-controlled-subject-slot-"):
        raise ValueError("dataset version does not identify the controlled v3 release")
    verify_checksums(existing)

    result = read_json(confirmation / "RESULT.json")
    parity = read_json(parity_path)
    if result.get("confirmation_pass") is not True:
        raise ValueError("confirmation did not pass")
    diversity = result.get("seed_diversity_gates")
    if not isinstance(diversity, dict) or not diversity or not all(diversity.values()):
        raise ValueError("confirmation lacks a passing seed-diversity gate")
    seed_results = result.get("seed_results")
    if not isinstance(seed_results, dict) or set(seed_results) != {"17", "42", "73"}:
        raise ValueError("confirmation does not contain exactly seeds 17, 42, and 73")
    adapter_hashes = []
    for seed, seed_result in seed_results.items():
        combined = seed_result.get("combined_gates")
        trainer = seed_result.get("trainer_seed_gates")
        if not isinstance(combined, dict) or not combined or not all(combined.values()):
            raise ValueError(f"confirmation seed {seed} did not pass every gate")
        if not isinstance(trainer, dict) or not trainer or not all(trainer.values()):
            raise ValueError(f"confirmation seed {seed} is not Trainer-seed bound")
        adapter_hashes.append(str(seed_result["adapter_weight_sha256"]))
    if len(set(adapter_hashes)) != 3:
        raise ValueError("confirmation adapter hashes are not distinct")
    if parity.get("passed") is not True:
        raise ValueError("CPU parity did not pass")
    adapter_sha256 = str(result["winning_adapter_weight_sha256"])
    if parity.get("expected_adapter_sha256") != adapter_sha256:
        raise ValueError("confirmation and CPU parity identify different adapters")
    winning_adapter = (
        confirmation
        / f"selected-adapters/seed-{int(result['winning_seed'])}"
        / "adapter_model.safetensors"
    )
    if sha256_file(winning_adapter) != adapter_sha256:
        raise ValueError("winning adapter bytes do not match confirmation")

    commission = program / "analysis/corpus-requirements/wbv-v3-subject-slot-commission-v1"
    schedules = program / "experiments/commissions/wbv-v3-subject-slot-schedules-v1"
    kit = program / "experiments/kits/wbv-v3-forced-slot-confirmation-runpod-20260802-a2"
    verify_checksums(commission)
    verify_checksums(schedules)
    verify_checksums(kit, "SHA256SUMS.kit")
    schedule_path = schedules / "M8-SCHEDULE.jsonl"
    if sha256_file(schedule_path) != EXPECTED_SCHEDULE_SHA256:
        raise ValueError("M8 schedule changed")
    if line_count(schedule_path) != 7680:
        raise ValueError("M8 schedule row count changed")
    if line_count(schedules / "DEVELOPMENT-SCREEN.jsonl") != 140:
        raise ValueError("development screen row count changed")
    commission_report = read_json(commission / "REPORT.json")
    if commission_report["counts"]["new_wajarri_sentence_pairs"] != 0:
        raise ValueError("subject-slot commission unexpectedly claims new sentences")
    if commission_report["counts"]["sealed_test_rows_read"] != 0:
        raise ValueError("subject-slot commission opened the sealed test")

    output.mkdir(parents=True)
    copy_tree_files(existing, output)
    for path in sorted(item for item in commission.iterdir() if item.is_file()):
        if path.name != "SHA256SUMS":
            copy_file(path, output / "v3-controlled/commission" / path.name)
    for name in (
        "M8-SCHEDULE.jsonl",
        "SUBJECT-SLOT-MASKED-UNIQUE.jsonl",
        "RETENTION-UNIQUE.jsonl",
        "SENTENCE-PLAIN-UNIQUE.jsonl",
        "SENTENCE-INLINE-UNIQUE.jsonl",
        "TOKEN-ACCOUNTING.json",
        "REPORT.json",
        "MANIFEST.json",
    ):
        copy_file(schedules / name, output / "v3-controlled/training" / name)
    copy_file(
        schedules / "DEVELOPMENT-SCREEN.jsonl",
        output / "v3-controlled/development/DEVELOPMENT-SCREEN.jsonl",
    )
    for path in sorted((kit / "payload/data/evaluation").glob("*.jsonl")):
        copy_file(path, output / "v3-controlled/evaluation/frozen" / path.name)
    for source, relative in (
        (confirmation / "RESULT.json", "evaluation/three-seed-confirmation.json"),
        (confirmation / "RUN-COMPLETE.json", "evaluation/confirmation-run-complete.json"),
        (confirmation / "RESULT-MANIFEST.json", "evaluation/confirmation-result-manifest.json"),
        (parity_path, "evaluation/cpu-float32-parity.json"),
        (kit / "CONTRACT.json", "provenance/confirmation-contract.json"),
        (
            program / "analysis/audit-contracts/wbv-v3-forced-slot-confirmation-runpod-kit-v1-authorized-a2.json",
            "provenance/authorized-build-contract.json",
        ),
        (
            program / "analysis/adjudications/wbv-v3-forced-slot-confirmation-runpod-20260802-a1.json",
            "provenance/invalid-a1-repeat-adjudication.json",
        ),
        (
            program / "analysis/audit-contracts/wbv-v3-subject-slot-commission-v1.json",
            "provenance/subject-slot-commission-contract.json",
        ),
        (
            program / "analysis/audit-contracts/wbv-v3-subject-slot-schedules-v1.json",
            "provenance/subject-slot-schedule-contract.json",
        ),
    ):
        copy_file(source, output / "v3-controlled" / relative)
    method_names = (
        "build_wajarri_v3_subject_slot_commission.py",
        "build_wajarri_v3_subject_slot_schedules.py",
        "build_wajarri_v3_forced_slot_confirmation_kit.py",
        "run_wajarri_v3_forced_slot_confirmation.py",
        "evaluate_wajarri_v3_subject_slot.py",
        "verify_wajarri_v3_cpu_parity.py",
        "train_nllb_lora.py",
        "nllb_runtime_token_extension.py",
    )
    repo_training = Path(__file__).resolve().parent
    for name in method_names:
        copy_file(repo_training / name, output / "v3-controlled/methods" / name)

    release = {
        "schema_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_repo": DATASET_REPO,
        "version": args.dataset_version,
        "parent_revision": SOURCE_REVISION,
        "confirmation_run_id": result["run_id"],
        "adapter_weight_sha256": adapter_sha256,
        "winning_seed": int(result["winning_seed"]),
        "winning_step": int(
            result["seed_results"][str(result["winning_seed"])]["selected_step"]
        ),
        "m8_schedule_rows": 7680,
        "m8_schedule_sha256": EXPECTED_SCHEDULE_SHA256,
        "development_rows": 140,
        "controlled_route_rows": 35,
        "training_parent_pairs": 103,
        "unique_masked_model_pairs": 6,
        "new_wajarri_sentence_pairs": 0,
        "sealed_test_rows_read": 0,
        "cpu_float32_parity_pass": True,
        "free_form_translation_authorized": False,
    }
    write_json(output / "v3-controlled/release.json", release)
    write_text(output / "README.md", render_readme(args.dataset_version, adapter_sha256))
    write_text(output / "SHA256SUMS", checksum_manifest(output))
    return {
        **release,
        "file_count": sum(1 for path in output.rglob("*") if path.is_file()),
        "checksums_sha256": sha256_file(output / "SHA256SUMS"),
    }


def main() -> None:
    args = parse_args()
    result = stage_release(args)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

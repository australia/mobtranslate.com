#!/usr/bin/env python3
"""Stage a fail-closed Hugging Face release for Wajarri v3 controlled translation."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
from typing import Any


MODEL_ID = "mobtranslate-wajarri-v3-controlled"
BASE_REPO = "ajaxdavis/mobtranslate-wajarri-v1"
BASE_REVISION = "ddae6103913b7cab299d687bee2dc7904fd59459"
DATASET_REPO = "ajaxdavis/mobtranslate-wajarri-synthetic-corpus-v1"
BASE_WEIGHT_SHA256 = (
    "41ea844f30d6af1f2761d71126eb66a6d47c84c3294538bb1851afcd5043fe0e"
)
EXPECTED_SEEDS = (17, 42, 73)
ADAPTER_FILES = (
    "adapter_model.safetensors",
    "adapter_config.json",
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer_config.json",
)
CONTROLLED_TEMPLATES = {
    "coming-towards-speaker": {
        "english": "The {subject} is coming towards the speaker.",
        "model_input": "<translate> The <copy> is coming towards the speaker.",
        "raw_model_output": "<copy> yanajimanha.",
        "rendered_wajarri": "{wajarri_subject} yanajimanha.",
    },
    "going-away-from-speaker": {
        "english": "The {subject} is going away from the speaker.",
        "model_input": "<translate> The <copy> is going away from the speaker.",
        "raw_model_output": "<copy> yanmanha.",
        "rendered_wajarri": "{wajarri_subject} yanmanha.",
    },
    "running": {
        "english": "The {subject} is running.",
        "model_input": "<translate> The <copy> is running.",
        "raw_model_output": "<copy> jamarnimanha.",
        "rendered_wajarri": "{wajarri_subject} jamarnimanha.",
    },
    "sitting-down": {
        "english": "The {subject} is sitting down.",
        "model_input": "<translate> The <copy> is sitting down.",
        "raw_model_output": "<copy> nyinarangamanha.",
        "rendered_wajarri": "{wajarri_subject} nyinarangamanha.",
    },
    "sitting": {
        "english": "The {subject} is sitting.",
        "model_input": "<translate> The <copy> is sitting.",
        "raw_model_output": "<copy> nyinamanha.",
        "rendered_wajarri": "{wajarri_subject} nyinamanha.",
    },
    "standing": {
        "english": "The {subject} is standing.",
        "model_input": "<translate> The <copy> is standing.",
        "raw_model_output": "<copy> garrimanha.",
        "rendered_wajarri": "{wajarri_subject} garrimanha.",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmation-dir", type=Path, required=True)
    parser.add_argument("--confirmation-contract", type=Path, required=True)
    parser.add_argument("--expected-contract-sha256", required=True)
    parser.add_argument("--cpu-parity-report", type=Path, required=True)
    parser.add_argument("--cpu-evaluation-dir", type=Path, required=True)
    parser.add_argument("--dataset-revision", required=True)
    parser.add_argument("--model-repo", required=True)
    parser.add_argument("--model-version", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--invalid-repeat-adjudication", type=Path)
    parser.add_argument("--provider-deletion-ledger", type=Path)
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


def link_or_copy(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def require_hash(path: Path, expected: str, label: str) -> None:
    if not path.is_file():
        raise FileNotFoundError(path)
    observed = sha256_file(path)
    if observed != expected:
        raise ValueError(f"{label} hash changed: {observed} != {expected}")


def verify_result_manifest(root: Path) -> dict[str, Any]:
    manifest_path = root / "RESULT-MANIFEST.json"
    manifest = read_json(manifest_path)
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        raise ValueError("confirmation result manifest has no files")
    for relative, expected in files.items():
        path = root / relative
        if not path.is_file():
            raise FileNotFoundError(path)
        if path.stat().st_size != int(expected["bytes"]):
            raise ValueError(f"result file size changed: {relative}")
        require_hash(path, str(expected["sha256"]), f"result file {relative}")
    return manifest


def verify_confirmation(
    root: Path,
    contract_path: Path,
    expected_contract_sha256: str,
) -> tuple[dict[str, Any], dict[str, Any], Path]:
    require_hash(contract_path, expected_contract_sha256, "confirmation contract")
    contract = read_json(contract_path)
    result_manifest = verify_result_manifest(root)
    result_path = root / "RESULT.json"
    result = read_json(result_path)
    complete = read_json(root / "RUN-COMPLETE.json")

    if result_manifest.get("run_id") != contract.get("run_id"):
        raise ValueError("result manifest is bound to the wrong run")
    if result.get("run_id") != contract.get("run_id"):
        raise ValueError("confirmation result is bound to the wrong run")
    if complete.get("run_id") != contract.get("run_id"):
        raise ValueError("run-complete marker is bound to the wrong run")
    if complete.get("result_sha256") != sha256_file(result_path):
        raise ValueError("run-complete marker has the wrong result hash")
    if result.get("status") != "POSITIVE_INTERNAL_FORCED_SLOT_CONFIRMATION":
        raise ValueError("confirmation status is not positive")
    required_flags = (
        "confirmation_pass",
        "controlled_route_candidate",
    )
    if not all(result.get(field) is True for field in required_flags):
        raise ValueError("controlled confirmation did not pass")
    if result.get("free_form_sentence_generation_authorized") is not False:
        raise ValueError("confirmation improperly authorizes free-form translation")
    if result.get("natural_language_reliability_claimed") is not False:
        raise ValueError("confirmation improperly claims natural-language reliability")

    declared_seeds = tuple(int(seed) for seed in contract["confirmation_seeds"])
    if declared_seeds != EXPECTED_SEEDS:
        raise ValueError(f"confirmation seeds changed: {declared_seeds}")
    seed_results = result.get("seed_results")
    if not isinstance(seed_results, dict):
        raise ValueError("confirmation has no per-seed results")
    if tuple(sorted(int(seed) for seed in seed_results)) != EXPECTED_SEEDS:
        raise ValueError("confirmation does not contain exactly the declared seeds")
    hashes: list[str] = []
    for seed in EXPECTED_SEEDS:
        seed_result = seed_results[str(seed)]
        gates = seed_result.get("combined_gates")
        if not isinstance(gates, dict) or not gates or not all(gates.values()):
            raise ValueError(f"seed {seed} did not pass every gate")
        trainer_gates = seed_result.get("trainer_seed_gates")
        if not isinstance(trainer_gates, dict) or not all(trainer_gates.values()):
            raise ValueError(f"seed {seed} is not bound to its Trainer seed")
        hashes.append(str(seed_result["adapter_weight_sha256"]))
    if len(set(hashes)) != len(EXPECTED_SEEDS):
        raise ValueError("selected adapter hashes are not distinct across seeds")
    diversity = result.get("seed_diversity_gates")
    if not isinstance(diversity, dict) or not all(diversity.values()):
        raise ValueError("seed-diversity gate did not pass")

    winner = int(result["winning_seed"])
    if winner not in EXPECTED_SEEDS:
        raise ValueError("winning seed is outside the confirmation set")
    adapter_dir = root / f"selected-adapters/seed-{winner}"
    adapter_sha = sha256_file(adapter_dir / "adapter_model.safetensors")
    if adapter_sha != result["winning_adapter_weight_sha256"]:
        raise ValueError("winning adapter bytes do not match the result")
    if adapter_sha != seed_results[str(winner)]["adapter_weight_sha256"]:
        raise ValueError("winning adapter bytes do not match the seed result")

    snapshot = read_json(adapter_dir / "snapshot-manifest.json")
    optimization = snapshot["binding"]["optimization"]
    if int(optimization["trainer_seed"]) != winner:
        raise ValueError("winning snapshot has the wrong Trainer seed")
    if int(optimization["trainer_data_seed"]) != winner:
        raise ValueError("winning snapshot has the wrong Trainer data seed")
    schedule_sha256 = contract["arms"]["M8"]["schedule_sha256"]
    if snapshot["binding"]["dataset"]["release_sha256"] != schedule_sha256:
        raise ValueError("winning snapshot has the wrong training dataset")
    return contract, result, adapter_dir


def verify_cpu_parity(
    report_path: Path,
    cpu_dir: Path,
    gpu_dir: Path,
    adapter_sha256: str,
) -> dict[str, Any]:
    report = read_json(report_path)
    if report.get("status") != "PASS_CPU_FLOAT32_PARITY" or report.get("passed") is not True:
        raise ValueError("CPU float32 parity did not pass")
    if report.get("expected_adapter_sha256") != adapter_sha256:
        raise ValueError("CPU parity is bound to the wrong adapter")
    for group in ("gpu_gates", "cpu_gates", "identity_gates", "parity_gates"):
        gates = report.get(group)
        if not isinstance(gates, dict) or not gates or not all(gates.values()):
            raise ValueError(f"CPU parity group did not pass: {group}")
    require_hash(
        gpu_dir / "SUMMARY.json",
        str(report["gpu_summary_sha256"]),
        "GPU parity summary",
    )
    require_hash(
        cpu_dir / "SUMMARY.json",
        str(report["cpu_summary_sha256"]),
        "CPU parity summary",
    )
    if any(report.get("differences_by_batch", {}).get(str(size)) for size in (1, 16)):
        raise ValueError("CPU parity report contains output differences")
    return report


def render_readme(
    *, model_repo: str, model_version: str, adapter_sha256: str, winning_seed: int
) -> str:
    return f"""---
license: cc-by-nc-4.0
language:
- wbv
- en
library_name: peft
base_model: {BASE_REPO}
pipeline_tag: translation
tags:
- nllb
- lora
- controlled-generation
- wajarri
datasets:
- {DATASET_REPO}
---

# MobTranslate Wajarri v3 controlled adapter

This is a compact NLLB LoRA adapter for one deliberately bounded English-to-Wajarri
task. It accepts a dictionary-resolved Wajarri subject through a nonlinguistic
`<copy>` slot and generates one of six complete, source-supported predicate templates.

It is **not a free-form Wajarri translator** and has not passed an independent
speaker-diverse natural-language gate. Known words must come from deterministic
dictionary lookup. Inputs outside the six frozen constructions must be rejected or
routed elsewhere.

## Immutable identity

| Field | Value |
| --- | --- |
| Model repository | `{model_repo}` |
| Version/tag | `{model_version}` |
| Base repository | `{BASE_REPO}` |
| Base revision | `{BASE_REVISION}` |
| Base weights SHA-256 | `{BASE_WEIGHT_SHA256}` |
| Adapter weights SHA-256 | `{adapter_sha256}` |
| Winning confirmation seed | `{winning_seed}` |
| Adapter topology | rank-16 LoRA over q/k/v/out projections and fc1/fc2 |

## Authorized task

The caller first resolves one unique English subject to an approved Wajarri dictionary
surface. It then replaces the English subject with `<copy>`, generates with decoder
prefix `[decoder_start_token_id, wbv_Latn, <copy>]`, verifies the raw template exactly,
and replaces the single output slot with the dictionary surface.

| English construction | Required raw model output |
| --- | --- |
| `The <copy> is coming towards the speaker.` | `<copy> yanajimanha.` |
| `The <copy> is going away from the speaker.` | `<copy> yanmanha.` |
| `The <copy> is running.` | `<copy> jamarnimanha.` |
| `The <copy> is sitting down.` | `<copy> nyinarangamanha.` |
| `The <copy> is sitting.` | `<copy> nyinamanha.` |
| `The <copy> is standing.` | `<copy> garrimanha.` |

Generation is greedy (`num_beams=1`), deterministic, with `max_new_tokens=64`,
`no_repeat_ngram_size=0`, `repetition_penalty=1.0`, and `length_penalty=1.0`.

## Evidence and limits

- Three independently seeded deterministic training runs must pass the 35/35 controlled
  route, batch-1/batch-16 invariance, retained fixed-utterance noninferiority, synthetic
  holdout noninferiority, zero mechanical faults, and distinct-weight gates.
- The published winner must reproduce all 35 controlled outputs byte-for-byte under A40
  bfloat16 and CPU float32 execution.
- These are controlled template and runtime-parity findings. They do not establish broad
  sentence translation, naturalness, dialect suitability, or speaker approval.
- Closed dictionary reconstruction remains a research diagnostic; production dictionary
  answers should be returned from the database.

See `docs/COMPLETE-TRAINING-EVALUATION-AND-HOSTING-GUIDE.md`, `release.json`, and
the files under `evaluation/` and `provenance/` for the complete machine-checkable record.
The public training dataset is at
https://huggingface.co/datasets/{DATASET_REPO}.
"""


def render_guide(model_repo: str, model_version: str) -> str:
    return f"""# Wajarri v3 controlled model: training, evaluation, and hosting guide

## Scope

This release solves only the frozen subject-slot task documented in the model card. The
dictionary supplies the Wajarri subject and the adapter supplies one of six complete
predicate templates. Do not expose this adapter as unrestricted Wajarri translation.

## Artifact layout

```text
{BASE_REPO}@{BASE_REVISION}
  base/                         # shared 1.3B NLLB control base

{model_repo}@{model_version}
  adapter/                      # compact rank-16 LoRA and tokenizer additions
  evaluation/                   # GPU/CPU route outputs and parity result
  provenance/                   # confirmation contract, result, manifests, snapshot
  release.json                  # serving identity and decoder contract
  ADAPTER-SHA256SUMS            # adapter bundle hashes
  SHA256SUMS                    # complete release hashes
```

The base and adapter are separate by design. A host that supports dynamic LoRA should
load the immutable base once and cache this adapter by `(base revision, adapter version,
tokenizer hash, decoder policy)`.

## Training contract

- Parent: the frozen Wajarri v1 NLLB base plus the task-separated initial adapter.
- Data: a sequential, source-bound M8 schedule; no shuffled cap.
- Optimizer: AdamW, learning rate `1e-5`, linear schedule, 48 warmup updates.
- Effective batch: 4 examples x 4 accumulation = 16 examples per optimizer update.
- Maximum updates: 480; snapshots at 20, 40, 60, 80, 120, 160, 240, 320, 400, 480.
- LoRA: rank 16, alpha 32, dropout 0.05, q/k/v/out projections plus fc1/fc2.
- Trainable special rows: `wbv_Latn`, `<lexeme>`, `<translate>`, `<glossary>`, `<copy>`.
- Confirmation seeds: 17, 42, 73, passed through both Trainer `seed` and `data_seed`.
- Checkpoint selection: earliest route-perfect candidate after all frozen guards pass.

The exact schedule, hashes, per-seed checkpoint census, token accounting, and optimizer
binding are in `provenance/confirmation-result.json` and
`provenance/winning-snapshot-manifest.json`.

## Serving contract

1. Match one of the six English constructions exactly after conservative normalization.
2. Resolve the subject through the governed dictionary. Reject absent or ambiguous senses.
3. Replace only that subject span with `<copy>` and prepend `<translate> `.
4. Load the tokenizer from the pinned base and append `<copy>` at token ID 256208 using
   its base-decomposition mean before loading the adapter.
5. Generate with decoder IDs `[decoder_start_token_id, 256204, 256208]` and the decoder
   settings in `release.json`.
6. Decode while preserving token 256208 as literal `<copy>`.
7. Require one slot, in first position, and exact equality with the expected raw template.
8. Replace the slot with the dictionary Wajarri surface. Never let a later LLM rewrite it.
9. Return the immutable model ID, version, base hash, adapter hash, template ID, dictionary
   entry identity, and decoder policy in response metadata.

Any failed identity, template, slot, dictionary, or output check is a hard refusal for this
route. Unsupported sentences should use MobTranslate's separately labelled hosted draft
path, not this adapter.

## Resource expectations

The shared NLLB base is approximately 2.46 GB on disk; the compact adapter is roughly
35 MB. CPU float32 needs substantially more resident memory than artifact size and is
slower than GPU inference, but the published 35-row parity test proves exact behavior for
this controlled route. Capacity and concurrency must be measured on the host; this release
does not claim a universal throughput number.

## Verification before serving

```bash
sha256sum -c ADAPTER-SHA256SUMS
sha256sum -c SHA256SUMS
```

Then execute all six smoke constructions with a governed dictionary subject and verify
the exact raw and rendered outputs. The shared MobTranslate Space is the reference runtime.

## Claims that are not authorized

- Free-form or open-domain Wajarri translation.
- Natural-language reliability, speaker certification, or dialect coverage.
- Unseen dictionary prediction.
- Using lexical scores to authorize sentence generation.
- Using this model's result to authorize any other language adapter.
"""


def checksum_lines(root: Path, include: tuple[str, ...] | None = None) -> str:
    lines: list[str] = []
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix()
        if relative in {"SHA256SUMS", "ADAPTER-SHA256SUMS"}:
            continue
        if include is not None and not any(
            relative == prefix or relative.startswith(prefix + "/")
            for prefix in include
        ):
            continue
        lines.append(f"{sha256_file(path)}  {relative}")
    return "\n".join(lines)


def stage_release(args: argparse.Namespace) -> dict[str, Any]:
    confirmation_dir = args.confirmation_dir.resolve()
    contract_path = args.confirmation_contract.resolve()
    cpu_report_path = args.cpu_parity_report.resolve()
    cpu_dir = args.cpu_evaluation_dir.resolve()
    output = args.output_dir.resolve()
    if output.exists():
        raise FileExistsError(output)
    if args.model_repo != "ajaxdavis/mobtranslate-wajarri-v3-controlled":
        raise ValueError("unexpected Wajarri controlled model repository")
    if not args.model_version.startswith("v3.0.0-controlled-subject-slot-"):
        raise ValueError("model version does not identify the controlled v3 task")

    contract, result, adapter_dir = verify_confirmation(
        confirmation_dir,
        contract_path,
        args.expected_contract_sha256,
    )
    winning_seed = int(result["winning_seed"])
    winning_sha = str(result["winning_adapter_weight_sha256"])
    gpu_dir = confirmation_dir / f"seeds/{winning_seed}/selected-forced-route"
    cpu_report = verify_cpu_parity(
        cpu_report_path,
        cpu_dir,
        gpu_dir,
        winning_sha,
    )

    output.mkdir(parents=True)
    for name in ADAPTER_FILES:
        source = adapter_dir / name
        destination = output / "adapter" / name
        if name == "adapter_config.json":
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        else:
            link_or_copy(source, destination)
    original_config_sha = sha256_file(adapter_dir / "adapter_config.json")
    published_config = read_json(output / "adapter" / "adapter_config.json")
    published_config["base_model_name_or_path"] = BASE_REPO
    published_config["revision"] = BASE_REVISION
    write_json(output / "adapter" / "adapter_config.json", published_config)

    provenance_pairs = (
        (contract_path, "provenance/confirmation-contract.json"),
        (confirmation_dir / "RESULT.json", "provenance/confirmation-result.json"),
        (
            confirmation_dir / "RESULT-MANIFEST.json",
            "provenance/confirmation-result-manifest.json",
        ),
        (
            confirmation_dir / "RUN-COMPLETE.json",
            "provenance/confirmation-run-complete.json",
        ),
        (
            confirmation_dir / "DELETION-LEDGER.json",
            "provenance/confirmation-deletion-ledger.json",
        ),
        (
            adapter_dir / "snapshot-manifest.json",
            "provenance/winning-snapshot-manifest.json",
        ),
        (cpu_report_path, "evaluation/cpu-float32-parity.json"),
        (gpu_dir / "SUMMARY.json", "evaluation/gpu-bfloat16-summary.json"),
        (cpu_dir / "SUMMARY.json", "evaluation/cpu-float32-summary.json"),
    )
    for source, relative in provenance_pairs:
        link_or_copy(source, output / relative)
    for batch_size in (1, 16):
        link_or_copy(
            gpu_dir / f"PREDICTIONS.batch-{batch_size}.jsonl",
            output / f"evaluation/gpu-bfloat16-predictions-batch-{batch_size}.jsonl",
        )
        link_or_copy(
            cpu_dir / f"PREDICTIONS.batch-{batch_size}.jsonl",
            output / f"evaluation/cpu-float32-predictions-batch-{batch_size}.jsonl",
        )
    if args.invalid_repeat_adjudication is not None:
        link_or_copy(
            args.invalid_repeat_adjudication.resolve(),
            output / "provenance/invalid-a1-repeat-adjudication.json",
        )
    if args.provider_deletion_ledger is not None:
        link_or_copy(
            args.provider_deletion_ledger.resolve(),
            output / "provenance/provider-worker-deletion-ledger.json",
        )

    created_at = datetime.now(timezone.utc).isoformat()
    release = {
        "schemaVersion": 1,
        "createdAtUtc": created_at,
        "modelId": MODEL_ID,
        "version": args.model_version,
        "modelRepo": args.model_repo,
        "baseRepo": BASE_REPO,
        "baseRevision": BASE_REVISION,
        "baseModelSha256": BASE_WEIGHT_SHA256,
        "adapterModelSha256": winning_sha,
        "adapterConfigOriginalSha256": original_config_sha,
        "adapterConfigPublishedSha256": sha256_file(
            output / "adapter/adapter_config.json"
        ),
        "datasetRepo": DATASET_REPO,
        "datasetRevision": args.dataset_revision,
        "trainingDatasetSha256": contract["arms"]["M8"]["schedule_sha256"],
        "confirmationRunId": result["run_id"],
        "confirmationResultSha256": sha256_file(confirmation_dir / "RESULT.json"),
        "confirmationContractSha256": args.expected_contract_sha256,
        "winningSeed": winning_seed,
        "winningStep": int(result["seed_results"][str(winning_seed)]["selected_step"]),
        "confirmationSeeds": list(EXPECTED_SEEDS),
        "cpuFloat32Parity": {
            "passed": True,
            "rows": 35,
            "reportSha256": sha256_file(cpu_report_path),
            "gpuDtype": "bfloat16",
            "cpuDtype": "float32",
            "batchSizes": [1, 16],
        },
        "task": {
            "id": "subject_slot",
            "sourceLanguage": "eng_Latn",
            "targetLanguage": "wbv_Latn",
            "targetLanguageTokenId": 256204,
            "slotToken": "<copy>",
            "slotTokenId": 256208,
            "decoderPrefixTokenIds": [2, 256204, 256208],
            "templates": CONTROLLED_TEMPLATES,
        },
        "decoderPolicy": {
            "doSample": False,
            "numBeams": 1,
            "maxNewTokens": 64,
            "noRepeatNgramSize": 0,
            "repetitionPenalty": 1.0,
            "lengthPenalty": 1.0,
        },
        "authorization": {
            "controlledSubjectSlotRoute": True,
            "freeFormSentenceTranslation": False,
            "naturalLanguageReliability": False,
            "dictionaryLookupInsideModel": False,
        },
        "claimLimit": result["claim_limit"],
    }
    if cpu_report["expected_adapter_sha256"] != release["adapterModelSha256"]:
        raise ValueError("release and CPU parity adapter identities diverged")
    write_json(output / "release.json", release)
    write_json(output / "controlled-templates.json", CONTROLLED_TEMPLATES)
    write_text(
        output / "README.md",
        render_readme(
            model_repo=args.model_repo,
            model_version=args.model_version,
            adapter_sha256=winning_sha,
            winning_seed=winning_seed,
        ),
    )
    write_text(
        output / "docs/COMPLETE-TRAINING-EVALUATION-AND-HOSTING-GUIDE.md",
        render_guide(args.model_repo, args.model_version),
    )
    write_text(
        output / "requirements.txt",
        "torch==2.8.0\n"
        "transformers==4.48.3\n"
        "peft==0.19.1\n"
        "sentencepiece==0.2.2\n"
        "huggingface-hub==0.36.2\n"
        "safetensors==0.8.0\n"
        "accelerate==1.14.0\n"
        "protobuf==7.35.1\n",
    )
    runtime_source = Path(__file__).resolve().parent
    for source_name, published_name in (
        ("nllb_runtime_token_extension.py", "runtime/nllb_runtime_token_extension.py"),
        ("evaluate_wajarri_v3_subject_slot.py", "runtime/reference_evaluator.py"),
        ("verify_wajarri_v3_cpu_parity.py", "runtime/verify_cpu_parity.py"),
    ):
        link_or_copy(runtime_source / source_name, output / published_name)
    write_text(
        output / "ADAPTER-SHA256SUMS",
        checksum_lines(output, include=("adapter",)),
    )
    write_text(output / "SHA256SUMS", checksum_lines(output))

    manifest = {
        "schema_version": 1,
        "created_at_utc": created_at,
        "model_repo": args.model_repo,
        "model_version": args.model_version,
        "base_revision": BASE_REVISION,
        "base_weight_sha256": BASE_WEIGHT_SHA256,
        "adapter_weight_sha256": winning_sha,
        "winning_seed": winning_seed,
        "winning_step": release["winningStep"],
        "confirmation_pass": True,
        "cpu_float32_parity_pass": True,
        "controlled_route_authorized": True,
        "free_form_translation_authorized": False,
        "release_json_sha256": sha256_file(output / "release.json"),
        "adapter_checksums_sha256": sha256_file(output / "ADAPTER-SHA256SUMS"),
        "full_checksums_sha256": sha256_file(output / "SHA256SUMS"),
    }
    write_json(output.parent / f"{output.name}-BUILD-MANIFEST.json", manifest)
    return manifest


def main() -> None:
    args = parse_args()
    result = stage_release(args)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

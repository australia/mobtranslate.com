#!/usr/bin/env python3
"""Stage the immutable Mi'kmaq v3.3 Hugging Face research release."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
from typing import Any, Iterable


BASE_FILES = (
    "model.safetensors",
    "config.json",
    "generation_config.json",
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
)
ADAPTER_FILES = (
    "adapter_model.safetensors",
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
)
TOKENIZER_BUNDLE_FILES = BASE_FILES[3:]
REPOSITORY_TAGS = {
    "base_repo": "v1.0.0-rc1",
    "model_repo": "v3.3.0",
    "dataset_repo": "v3.3.0",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-contract", type=Path, required=True)
    parser.add_argument("--expected-contract-sha256", required=True)
    parser.add_argument("--release-amendment", type=Path, required=True)
    parser.add_argument("--expected-amendment-sha256", required=True)
    parser.add_argument("--merge-equivalence-report", type=Path, required=True)
    parser.add_argument("--adapter-release-verification", type=Path)
    parser.add_argument("--base-model-dir", type=Path, required=True)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--schedule-release", type=Path, required=True)
    parser.add_argument("--lessons-release", type=Path, required=True)
    parser.add_argument("--confirmation-dir", type=Path, required=True)
    parser.add_argument("--sealed-run-dir", type=Path, required=True)
    parser.add_argument("--qualitative-dir", type=Path, required=True)
    parser.add_argument("--templates-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def tokenizer_bundle_sha256(root: Path) -> str:
    digest = hashlib.sha256()
    for name in TOKENIZER_BUNDLE_FILES:
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(path)
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(sha256(path)))
    return digest.hexdigest()


def require_hash(path: Path, expected: str, label: str) -> None:
    if not path.is_file():
        raise FileNotFoundError(path)
    observed = sha256(path)
    if observed != expected:
        raise ValueError(f"{label} hash changed: {observed} != {expected}")


def link_or_copy(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def write_json(path: Path, value: Any) -> None:
    write_text(path, json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"Expected object at {path}:{line_number}")
            rows.append(row)
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def unique_training_pool(schedule_path: Path) -> list[dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    transient = {
        "control_source_id",
        "id",
        "natural_dialog_intervention",
        "schedule_arm",
        "schedule_position",
    }
    for row in read_jsonl(schedule_path):
        source_id = str(row.get("schedule_source_id") or "")
        if not source_id:
            raise ValueError("Schedule row is missing schedule_source_id")
        candidate = {key: value for key, value in row.items() if key not in transient}
        previous = selected.get(source_id)
        if previous is not None and previous != candidate:
            raise ValueError(f"Conflicting schedule presentations for {source_id}")
        selected[source_id] = candidate
    return [selected[key] for key in sorted(selected)]


def validate_merged_model(root: Path, contract: dict[str, Any]) -> None:
    for name in BASE_FILES:
        if not (root / name).is_file():
            raise FileNotFoundError(root / name)
    config = json.loads((root / "config.json").read_text(encoding="utf-8"))
    generation = json.loads(
        (root / "generation_config.json").read_text(encoding="utf-8")
    )
    target_id = contract["target_lang_token_id"]
    if config.get("vocab_size") != target_id + 1:
        raise ValueError(
            "Merged vocabulary size does not include the frozen target token"
        )
    expected = contract["decoder_policy"]
    keys = (
        "num_beams",
        "no_repeat_ngram_size",
        "repetition_penalty",
        "length_penalty",
    )
    observed = {key: generation.get(key) for key in keys}
    required = {key: expected[key] for key in keys}
    if observed != required:
        raise ValueError(f"Merged decoder contract changed: {observed} != {required}")
    if generation.get("forced_bos_token_id") != target_id:
        raise ValueError("Merged generation config has the wrong forced BOS token")
    expected_bundle = contract["source_artifacts"]["base_tokenizer_bundle"]
    if tokenizer_bundle_sha256(root) != expected_bundle:
        raise ValueError(
            "Merged tokenizer bundle changed from the frozen base tokenizer"
        )


def validate_adapter_release_verification(
    path: Path, contract: dict[str, Any], amendment: dict[str, Any]
) -> dict[str, Any]:
    report = json.loads(path.read_text(encoding="utf-8"))
    if report.get("passed") is not True:
        raise ValueError("Staged adapter release verification did not pass")
    if report.get("release_id") != contract["release_id"]:
        raise ValueError("Staged adapter verification has the wrong release ID")
    smoke = report.get("checks", {}).get("load_smoke", {})
    if (
        smoke.get("passed") is not True
        or smoke.get("passed_rows") != smoke.get("total_rows")
        or int(smoke.get("total_rows") or 0) < 6
    ):
        raise ValueError("Staged adapter verification lacks six passing smoke probes")
    static = report.get("checks", {}).get("static", {})
    if not static or not all(check.get("passed") is True for check in static.values()):
        raise ValueError("Staged adapter static identity checks did not all pass")
    reference = report.get("reference_report", {})
    if reference.get("sha256") != amendment["trigger"]["sha256"]:
        raise ValueError("Staged adapter verification used the wrong reference report")
    expected = contract["source_artifacts"]
    bound_hashes = {
        "base_model_sha256": expected["base_model_safetensors"],
        "adapter_model_sha256": expected["adapter_model_safetensors"],
        "base_tokenizer_json_sha256": expected["base_tokenizer_json"],
        "adapter_tokenizer_json_sha256": expected["base_tokenizer_json"],
    }
    for key, digest in bound_hashes.items():
        if static.get(key, {}).get("observed") != digest:
            raise ValueError(f"Staged adapter verification changed {key}")
    return report


def render_template(
    source: Path, destination: Path, replacements: dict[str, str]
) -> None:
    text = source.read_text(encoding="utf-8")
    for marker, value in replacements.items():
        text = text.replace(f"@@{marker}@@", value)
    unresolved = [part.split("@@", 1)[0] for part in text.split("@@")[1::2]]
    if unresolved:
        raise ValueError(f"Unresolved template markers in {source}: {unresolved}")
    write_text(destination, text)


def verify_inputs(args: argparse.Namespace, contract: dict[str, Any]) -> None:
    expected = contract["source_artifacts"]
    checks = (
        (
            args.base_model_dir / "model.safetensors",
            expected["base_model_safetensors"],
            "base weights",
        ),
        (
            args.base_model_dir / "config.json",
            expected["base_config_json"],
            "base config",
        ),
        (
            args.base_model_dir / "tokenizer.json",
            expected["base_tokenizer_json"],
            "base tokenizer",
        ),
        (
            args.adapter_dir / "adapter_model.safetensors",
            expected["adapter_model_safetensors"],
            "adapter weights",
        ),
        (
            args.adapter_dir / "adapter_config.json",
            expected["adapter_config_json_original"],
            "adapter config",
        ),
        (
            args.schedule_release / "schedules/dialog40-screen-600.eng-mic.jsonl",
            expected["dialog40_schedule"],
            "training schedule",
        ),
        (
            args.schedule_release / "manifest.json",
            expected["schedule_manifest"],
            "schedule manifest",
        ),
        (
            args.lessons_release / "manifest.json",
            expected["lessons_manifest"],
            "lessons manifest",
        ),
        (
            args.lessons_release / "evaluation/sealed-test.eng-mic.jsonl",
            expected["sealed_test"],
            "sealed source test",
        ),
        (
            args.confirmation_dir / "comparison.json",
            expected["multiseed_comparison"],
            "multi-seed comparison",
        ),
        (
            args.sealed_run_dir / "analysis/comparison.json",
            expected["sealed_comparison"],
            "sealed comparison",
        ),
        (
            args.qualitative_dir / "analysis.json",
            expected["qualitative_analysis"],
            "qualitative analysis",
        ),
    )
    for path, digest, label in checks:
        require_hash(path, digest, label)
    if (
        tokenizer_bundle_sha256(args.base_model_dir)
        != expected["base_tokenizer_bundle"]
    ):
        raise ValueError("Frozen base tokenizer bundle changed")


def stage_repository_payloads(
    args: argparse.Namespace,
    contract: dict[str, Any],
    amendment: dict[str, Any],
) -> tuple[dict[str, Path], int]:
    output = args.output_dir
    if output.exists():
        raise FileExistsError(output)
    verify_inputs(args, contract)
    if args.adapter_release_verification is not None:
        validate_adapter_release_verification(
            args.adapter_release_verification, contract, amendment
        )
    output.mkdir(parents=True)
    roots = {name: output / f"{name}-repo" for name in ("base", "model", "dataset")}
    for root in roots.values():
        root.mkdir()

    for name in BASE_FILES:
        link_or_copy(args.base_model_dir / name, roots["base"] / name)
    for name in ADAPTER_FILES:
        link_or_copy(args.adapter_dir / name, roots["model"] / name)

    adapter_config = json.loads(
        (args.adapter_dir / "adapter_config.json").read_text(encoding="utf-8")
    )
    repositories = amendment["hugging_face"]
    adapter_config["base_model_name_or_path"] = repositories["base_repo"]
    adapter_config["revision"] = REPOSITORY_TAGS["base_repo"]
    write_json(roots["model"] / "adapter_config.json", adapter_config)

    replacements = {
        "BASE_REPO": repositories["base_repo"],
        "MODEL_REPO": repositories["model_repo"],
        "DATASET_REPO": repositories["dataset_repo"],
        "BASE_REVISION": REPOSITORY_TAGS["base_repo"],
        "MODEL_REVISION": REPOSITORY_TAGS["model_repo"],
        "DATASET_REVISION": REPOSITORY_TAGS["dataset_repo"],
    }
    templates = {
        "base": "BASE-README.md",
        "model": "MODEL-README.md",
        "dataset": "DATASET-README.md",
    }
    for name, template in templates.items():
        render_template(
            args.templates_dir / template, roots[name] / "README.md", replacements
        )
    render_template(
        args.templates_dir / "inference.py",
        roots["model"] / "inference.py",
        replacements,
    )
    link_or_copy(
        args.templates_dir / "requirements.txt", roots["model"] / "requirements.txt"
    )

    model_pairs = [
        (
            args.confirmation_dir / "comparison.json",
            "evaluation/multiseed-comparison.json",
        ),
        (
            args.sealed_run_dir / "analysis/comparison.json",
            "evaluation/sealed-comparison.json",
        ),
        (
            args.sealed_run_dir / "analysis/paired-sealed-sentences.jsonl",
            "evaluation/paired-sealed-sentences.jsonl",
        ),
        (
            args.qualitative_dir / "analysis.json",
            "evaluation/sealed-qualitative-analysis.json",
        ),
        (
            args.qualitative_dir / "row-diagnostics.jsonl",
            "evaluation/sealed-row-diagnostics.jsonl",
        ),
        (
            args.qualitative_dir / "largest-improvements.jsonl",
            "evaluation/largest-improvements.jsonl",
        ),
        (
            args.qualitative_dir / "largest-regressions.jsonl",
            "evaluation/largest-regressions.jsonl",
        ),
        (
            args.merge_equivalence_report,
            "evaluation/merged-checkpoint-rejection.json",
        ),
        (args.release_contract, "provenance/release-contract.json"),
        (
            args.release_amendment,
            "provenance/release-amendment-01-adapter-only.json",
        ),
    ]
    if args.adapter_release_verification is not None:
        model_pairs.append(
            (
                args.adapter_release_verification,
                "evaluation/staged-adapter-load-smoke.json",
            )
        )
    for source, relative in model_pairs:
        link_or_copy(source, roots["model"] / relative)

    schedule_file = (
        args.schedule_release / "schedules/dialog40-screen-600.eng-mic.jsonl"
    )
    link_or_copy(
        schedule_file,
        roots["dataset"] / "training/dialog40-seed17-600-steps.eng-mic.jsonl",
    )
    unique_rows = unique_training_pool(schedule_file)
    expected_unique = contract["training"]["unique_source_rows"]
    if len(unique_rows) != expected_unique:
        raise ValueError(
            f"unique training rows changed: {len(unique_rows)} != {expected_unique}"
        )
    write_jsonl(
        roots["dataset"] / "training/unique-source-pool.eng-mic.jsonl",
        unique_rows,
    )

    dataset_pairs = (
        (
            args.schedule_release
            / "evaluation/existing-validation-unprefixed.eng-mic.jsonl",
            "evaluation/existing-validation.eng-mic.jsonl",
        ),
        (
            args.schedule_release
            / "evaluation/existing-opened-regression-unprefixed.eng-mic.jsonl",
            "evaluation/existing-opened-regression.eng-mic.jsonl",
        ),
        (
            args.schedule_release / "evaluation/lesson-validation-all.eng-mic.jsonl",
            "evaluation/listuguj-validation-all.eng-mic.jsonl",
        ),
        (
            args.schedule_release / "evaluation/lesson-validation-dialog.eng-mic.jsonl",
            "evaluation/listuguj-validation-dialog.eng-mic.jsonl",
        ),
        (
            args.schedule_release
            / "evaluation/lesson-validation-vocab-container.eng-mic.jsonl",
            "evaluation/listuguj-validation-vocab-phrases.eng-mic.jsonl",
        ),
        (
            args.schedule_release
            / "evaluation/lesson-validation-lexemes-plain.eng-mic.jsonl",
            "evaluation/listuguj-validation-lexemes.eng-mic.jsonl",
        ),
        (
            args.schedule_release / "evaluation/lexical-all-plain.eng-mic.jsonl",
            "evaluation/full-lexical-census.eng-mic.jsonl",
        ),
        (
            args.lessons_release / "evaluation/sealed-test.eng-mic.jsonl",
            "evaluation/listuguj-sealed-source-release.eng-mic.jsonl",
        ),
        (
            args.sealed_run_dir
            / "opened-sealed-data/sentence-unprefixed.eng-mic.jsonl",
            "evaluation/listuguj-sealed-sentences.eng-mic.jsonl",
        ),
        (args.schedule_release / "manifest.json", "provenance/schedule-manifest.json"),
        (
            args.lessons_release / "manifest.json",
            "provenance/listuguj-lessons-manifest.json",
        ),
        (
            args.confirmation_dir / "comparison.json",
            "provenance/multiseed-comparison.json",
        ),
        (
            args.sealed_run_dir / "analysis/comparison.json",
            "provenance/sealed-comparison.json",
        ),
        (args.release_contract, "provenance/release-contract.json"),
        (
            args.release_amendment,
            "provenance/release-amendment-01-adapter-only.json",
        ),
    )
    for source, relative in dataset_pairs:
        link_or_copy(source, roots["dataset"] / relative)
    return roots, len(unique_rows)


def write_checksum_manifest(root: Path) -> None:
    lines: list[str] = []
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix()
        if relative != "SHA256SUMS":
            lines.append(f"{sha256(path)}  {relative}")
    write_text(root / "SHA256SUMS", "\n".join(lines))


def main() -> None:
    args = parse_args()
    for name, value in vars(args).items():
        if isinstance(value, Path):
            setattr(args, name, value.expanduser().resolve())
    require_hash(
        args.release_contract,
        args.expected_contract_sha256,
        "release contract",
    )
    require_hash(
        args.release_amendment,
        args.expected_amendment_sha256,
        "release amendment",
    )
    contract = json.loads(args.release_contract.read_text(encoding="utf-8"))
    amendment = json.loads(args.release_amendment.read_text(encoding="utf-8"))
    require_hash(
        args.merge_equivalence_report,
        amendment["trigger"]["sha256"],
        "merge-equivalence rejection report",
    )
    roots, unique_rows = stage_repository_payloads(args, contract, amendment)
    manifest = {
        "schema_version": 1,
        "release_id": contract["release_id"],
        "created_at": contract["created_at"],
        "release_contract_sha256": args.expected_contract_sha256,
        "release_amendment_sha256": args.expected_amendment_sha256,
        "repositories": amendment["hugging_face"],
        "repository_tags": REPOSITORY_TAGS,
        "base_model_sha256": sha256(args.base_model_dir / "model.safetensors"),
        "adapter_model_sha256": sha256(args.adapter_dir / "adapter_model.safetensors"),
        "merged_model_published": False,
        "tokenizer_bundle_sha256": tokenizer_bundle_sha256(args.adapter_dir),
        "unique_training_rows": unique_rows,
        "deployment": {
            "research_hugging_face_publication": True,
            "homepage_sentence_routing": False,
            "production_api": False,
        },
    }
    if args.adapter_release_verification is not None:
        manifest["adapter_release_verification_sha256"] = sha256(
            args.adapter_release_verification
        )
    write_json(args.output_dir / "release-manifest.json", manifest)
    for root in roots.values():
        write_checksum_manifest(root)
    write_checksum_manifest(args.output_dir)
    print(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()

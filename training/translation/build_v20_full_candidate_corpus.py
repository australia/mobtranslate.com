#!/usr/bin/env python3
"""Build v20 full English->Kuku Yalanji candidate-corpus training data."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30"
)
DEFAULT_FULL_CORPUS_DIR = (
    ROOT / "datasets/kuku_yalanji_ebible_parallel_with_sentence_candidates_v0.1.0"
)
DEFAULT_V18_DIR = ROOT / "prepared/v18.0-v10-plus-elder-sentence-pair"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--full-corpus-dir", default=str(DEFAULT_FULL_CORPUS_DIR))
    parser.add_argument("--v18-dir", default=str(DEFAULT_V18_DIR))
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seed", default="v20-full-candidate-corpus-2026-07-02")
    parser.add_argument("--usage-oversample", type=int, default=4)
    parser.add_argument("--elder-sentence-pair-oversample", type=int, default=16)
    parser.add_argument("--train-sample-rows", type=int, default=1024)
    parser.add_argument("--manifest-name", default="v20_full_candidate_corpus_manifest.json")
    return parser.parse_args()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_key(seed: str, row: dict[str, Any]) -> str:
    return sha256_text(f"{seed}\t{row.get('id', '')}")


def stable_sort(rows: list[dict[str, Any]], seed: str) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: stable_key(seed, row))


def stable_sample(rows: list[dict[str, Any]], count: int, seed: str) -> list[dict[str, Any]]:
    return stable_sort(rows, seed)[: min(count, len(rows))]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            row["_source_line"] = line_number
            rows.append(row)
    return rows


def clean_row(row: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(row)
    cleaned.pop("_source_line", None)
    return cleaned


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(clean_row(row), ensure_ascii=False) + "\n")


def record_file(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(root)),
        "rows": sum(1 for line in path.open(encoding="utf-8") if line.strip()),
        "sha256": sha256_file(path),
    }


def assert_unique_ids(rows: list[dict[str, Any]], label: str) -> None:
    seen: set[str] = set()
    duplicates: list[str] = []
    for row in rows:
        row_id = str(row.get("id"))
        if row_id in seen:
            duplicates.append(row_id)
        seen.add(row_id)
    if duplicates:
        raise ValueError(f"{label} has duplicate ids: {duplicates[:8]}")


def validate_rows(rows: list[dict[str, Any]], label: str) -> None:
    for row in rows:
        if row.get("direction") != "eng-gvn":
            raise ValueError(f"{label} unexpected direction in {row.get('id')}")
        if not row.get("input_text"):
            raise ValueError(f"{label} missing input_text in {row.get('id')}")
        if not row.get("output_text"):
            raise ValueError(f"{label} missing output_text in {row.get('id')}")
        if "approved_for_training" in row and row.get("approved_for_training") is not True:
            raise ValueError(f"{label} row not approved_for_training: {row.get('id')}")


def tag_bible_row(row: dict[str, Any], task: str) -> dict[str, Any]:
    original_input = " ".join(str(row["input_text"]).split())
    canonical_ref = row.get("canonical_ref")
    tagged = clean_row(row)
    tagged["id"] = f"{row['id']}:{task}"
    tagged["unconditioned_input_text"] = original_input
    if task == "translate":
        tagged["input_text"] = f"<translate> {original_input}"
        template = "<translate> {input_text}"
    elif task == "bible_ref":
        tagged["input_text"] = f"<bible_ref> {canonical_ref} <eng> {original_input}"
        template = "<bible_ref> {canonical_ref} <eng> {input_text}"
    else:
        raise ValueError(f"unknown bible task: {task}")
    tagged["task_tagging"] = {
        "enabled": True,
        "task": task,
        "template": template,
        "canonical_ref": canonical_ref,
    }
    tagged["reference_conditioning"] = {
        "enabled": task == "bible_ref",
        "template": template if task == "bible_ref" else None,
        "canonical_ref": canonical_ref,
    }
    return tagged


def tag_bible_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    direct: list[dict[str, Any]] = []
    reference: list[dict[str, Any]] = []
    for row in rows:
        direct.append(tag_bible_row(row, "translate"))
        reference.append(tag_bible_row(row, "bible_ref"))
    return direct, reference


def oversample(rows: list[dict[str, Any]], copies: int, suffix: str) -> list[dict[str, Any]]:
    if copies < 1:
        raise ValueError("oversample copies must be >= 1")
    out: list[dict[str, Any]] = []
    for copy_index in range(copies):
        for row in rows:
            copied = clean_row(row)
            copied["id"] = f"{row['id']}:{suffix}{copy_index + 1}"
            copied["oversample"] = {
                "source_id": row["id"],
                "copy_index": copy_index + 1,
                "copies": copies,
                "reason": suffix.rstrip("-"),
            }
            out.append(copied)
    return out


def usage_word_ids(rows: list[dict[str, Any]]) -> set[str]:
    ids: set[str] = set()
    for row in rows:
        word_id = (row.get("db_usage_example") or {}).get("word_id")
        if word_id is not None:
            ids.add(str(word_id))
    return ids


def count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        value = str(row.get(key))
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def main() -> None:
    args = parse_args()
    full_corpus_dir = Path(args.full_corpus_dir)
    v18_dir = Path(args.v18_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    bible_train_raw = read_jsonl(full_corpus_dir / "train.eng-gvn.jsonl")
    bible_validation_raw = read_jsonl(full_corpus_dir / "validation.eng-gvn.jsonl")
    bible_test_raw = read_jsonl(full_corpus_dir / "test.eng-gvn.jsonl")
    usage_train = read_jsonl(v18_dir / "db_usage/train_usage.eng-gvn.jsonl")
    usage_heldout = read_jsonl(v18_dir / "db_usage/heldout_usage.eng-gvn.jsonl")
    usage_all = read_jsonl(v18_dir / "db_usage/all_usage_examples.eng-gvn.jsonl")
    elder_sentence_pair_rows = read_jsonl(
        v18_dir / "elder_sentence_pair/all_elder_sentence_pair.eng-gvn.jsonl"
    )

    for label, rows in [
        ("bible_train_raw", bible_train_raw),
        ("bible_validation_raw", bible_validation_raw),
        ("bible_test_raw", bible_test_raw),
        ("usage_train", usage_train),
        ("usage_heldout", usage_heldout),
        ("elder_sentence_pair_rows", elder_sentence_pair_rows),
    ]:
        validate_rows(rows, label)
        assert_unique_ids(rows, label)

    train_direct, train_ref = tag_bible_rows(bible_train_raw)
    validation_direct, validation_ref = tag_bible_rows(bible_validation_raw)
    test_direct, test_ref = tag_bible_rows(bible_test_raw)

    usage_oversampled = oversample(usage_train, args.usage_oversample, "usage-os")
    elder_sentence_pair_oversampled = oversample(
        elder_sentence_pair_rows,
        args.elder_sentence_pair_oversample,
        "elder-sentence-pair-os",
    )

    train_rows = stable_sort(
        train_direct + train_ref + usage_oversampled + elder_sentence_pair_oversampled,
        args.seed + ":train",
    )
    validation_rows = stable_sort(
        validation_direct + validation_ref + usage_heldout + elder_sentence_pair_rows,
        args.seed + ":validation",
    )
    test_rows = stable_sort(
        test_direct + test_ref + usage_heldout + elder_sentence_pair_rows,
        args.seed + ":test",
    )
    eval_train_sample = stable_sort(
        stable_sample(train_direct, args.train_sample_rows, args.seed + ":train-direct-sample")
        + stable_sample(train_ref, args.train_sample_rows, args.seed + ":train-ref-sample")
        + usage_train
        + elder_sentence_pair_rows,
        args.seed + ":eval-train-sample",
    )

    file_rows = [
        ("train.eng-gvn.jsonl", train_rows),
        ("validation.eng-gvn.jsonl", validation_rows),
        ("test.eng-gvn.jsonl", test_rows),
        ("bible/train_direct.eng-gvn.jsonl", train_direct),
        ("bible/train_ref.eng-gvn.jsonl", train_ref),
        ("bible/validation_direct.eng-gvn.jsonl", validation_direct),
        ("bible/validation_ref.eng-gvn.jsonl", validation_ref),
        ("bible/test_direct.eng-gvn.jsonl", test_direct),
        ("bible/test_ref.eng-gvn.jsonl", test_ref),
        ("bible/eval_train_sample.eng-gvn.jsonl", eval_train_sample),
        ("db_usage/all_usage_examples.eng-gvn.jsonl", usage_all),
        ("db_usage/train_usage.eng-gvn.jsonl", usage_train),
        ("db_usage/train_usage_oversampled.eng-gvn.jsonl", usage_oversampled),
        ("db_usage/heldout_usage.eng-gvn.jsonl", usage_heldout),
        ("elder_sentence_pair/all_elder_sentence_pair.eng-gvn.jsonl", elder_sentence_pair_rows),
        (
            "elder_sentence_pair/train_elder_sentence_pair_oversampled.eng-gvn.jsonl",
            elder_sentence_pair_oversampled,
        ),
    ]

    output_files: list[Path] = []
    for relative, rows in file_rows:
        assert_unique_ids(rows, relative)
        path = output_dir / relative
        write_jsonl(path, rows)
        output_files.append(path)

    train_word_ids = usage_word_ids(usage_train)
    heldout_word_ids = usage_word_ids(usage_heldout)
    manifest = {
        "created_at": "2026-07-02",
        "purpose": (
            "v20 full-corpus continuation set: all English->Kuku rows from the "
            "20,911-pair Bible+sentence-candidate export, with tagged direct and "
            "reference-conditioned Bible tasks plus DB usage and elder-shared sentence pairs."
        ),
        "full_corpus_dir": str(full_corpus_dir),
        "v18_dir": str(v18_dir),
        "output_dir": str(output_dir),
        "seed": args.seed,
        "usage_oversample": args.usage_oversample,
        "elder_sentence_pair_oversample": args.elder_sentence_pair_oversample,
        "train_sample_rows_per_bible_task": args.train_sample_rows,
        "usage_split": {
            "train_rows": len(usage_train),
            "heldout_rows": len(usage_heldout),
            "train_word_ids": len(train_word_ids),
            "heldout_word_ids": len(heldout_word_ids),
            "word_id_intersection": len(train_word_ids & heldout_word_ids),
        },
        "bible_input_counts": {
            "train_source_rows": len(bible_train_raw),
            "validation_source_rows": len(bible_validation_raw),
            "test_source_rows": len(bible_test_raw),
            "train_tiers": count_by(bible_train_raw, "tier"),
            "validation_tiers": count_by(bible_validation_raw, "tier"),
            "test_tiers": count_by(bible_test_raw, "tier"),
        },
        "input_counts": {
            "usage_train_rows": len(usage_train),
            "usage_heldout_rows": len(usage_heldout),
            "elder_sentence_pair_rows": len(elder_sentence_pair_rows),
        },
        "output_counts": {
            "train_rows": len(train_rows),
            "validation_rows": len(validation_rows),
            "test_rows": len(test_rows),
            "bible_train_direct_rows": len(train_direct),
            "bible_train_ref_rows": len(train_ref),
            "bible_validation_direct_rows": len(validation_direct),
            "bible_validation_ref_rows": len(validation_ref),
            "bible_test_direct_rows": len(test_direct),
            "bible_test_ref_rows": len(test_ref),
            "usage_oversampled_rows": len(usage_oversampled),
            "elder_sentence_pair_oversampled_rows": len(elder_sentence_pair_oversampled),
            "eval_train_sample_rows": len(eval_train_sample),
        },
        "outputs": [record_file(path, output_dir) for path in sorted(output_files)],
        "training_note": (
            "Train from the v12 merged model with target_lang=gvn_Latn, low LR, "
            "full train split, capped generated validation during training, and "
            "separate post-train evals for Bible direct/ref, DB usage, and elder-shared sentence pairs."
        ),
    }

    manifest_file = output_dir / args.manifest_name
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    checksum_file = output_dir / "SHA256SUMS.v20"
    with checksum_file.open("w", encoding="utf-8") as handle:
        for path in sorted(output_files + [manifest_file]):
            handle.write(f"{sha256_file(path)}  {path.relative_to(output_dir)}\n")

    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

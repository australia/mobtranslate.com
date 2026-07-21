#!/usr/bin/env python3
"""Build v19 balanced replay data after elder-shared sentence-pair ingest."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_BIBLE_DIR = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/prepared/"
    "v9.7-tagged-direct-plus-reference-bible"
)
DEFAULT_V18_DIR = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/prepared/"
    "v18.0-v10-plus-elder-sentence-pair"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bible-dir", default=DEFAULT_BIBLE_DIR)
    parser.add_argument("--v18-dir", default=DEFAULT_V18_DIR)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seed", default="v19-balanced-replay-2026-07-02")
    parser.add_argument("--usage-oversample", type=int, default=4)
    parser.add_argument("--elder-sentence-pair-oversample", type=int, default=8)
    parser.add_argument("--validation-bible-rows", type=int, default=128)
    parser.add_argument("--validation-usage-rows", type=int, default=64)
    parser.add_argument("--manifest-name", default="v19_balanced_replay_manifest.json")
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


def usage_word_ids(rows: list[dict[str, Any]]) -> set[str]:
    ids: set[str] = set()
    for row in rows:
        meta = row.get("db_usage_example") or {}
        word_id = meta.get("word_id")
        if word_id is not None:
            ids.add(str(word_id))
    return ids


def elder_sentence_pair_confidence_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        confidence = str((row.get("source_page") or {}).get("transcription_confidence"))
        counts[confidence] = counts.get(confidence, 0) + 1
    return counts


def validate_rows(rows: list[dict[str, Any]], label: str) -> None:
    for row in rows:
        if row.get("direction") != "eng-gvn":
            raise ValueError(f"{label} unexpected direction in {row.get('id')}")
        if not row.get("input_text"):
            raise ValueError(f"{label} missing input_text in {row.get('id')}")
        if not row.get("output_text"):
            raise ValueError(f"{label} missing output_text in {row.get('id')}")


def main() -> None:
    args = parse_args()
    bible_dir = Path(args.bible_dir)
    v18_dir = Path(args.v18_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    bible_train = read_jsonl(bible_dir / "v8_2048row/train.eng-gvn.jsonl")
    bible_eval_train = read_jsonl(bible_dir / "v8_2048row/eval_train.eng-gvn.jsonl")
    bible_train_direct = read_jsonl(bible_dir / "v8_2048row/eval_train_direct.eng-gvn.jsonl")
    bible_train_ref = read_jsonl(bible_dir / "v8_2048row/eval_train_ref.eng-gvn.jsonl")
    bible_heldout_direct = read_jsonl(bible_dir / "heldout_direct_325.eng-gvn.jsonl")
    bible_heldout_ref = read_jsonl(bible_dir / "heldout_ref_325.eng-gvn.jsonl")

    usage_train = read_jsonl(v18_dir / "db_usage/train_usage.eng-gvn.jsonl")
    usage_heldout = read_jsonl(v18_dir / "db_usage/heldout_usage.eng-gvn.jsonl")
    usage_all = read_jsonl(v18_dir / "db_usage/all_usage_examples.eng-gvn.jsonl")
    elder_sentence_pair_rows = read_jsonl(v18_dir / "elder_sentence_pair/all_elder_sentence_pair.eng-gvn.jsonl")

    for label, rows in [
        ("bible_train", bible_train),
        ("bible_eval_train", bible_eval_train),
        ("usage_train", usage_train),
        ("usage_heldout", usage_heldout),
        ("elder_sentence_pair_rows", elder_sentence_pair_rows),
    ]:
        validate_rows(rows, label)
        assert_unique_ids(rows, label)

    usage_oversampled = oversample(usage_train, args.usage_oversample, "usage-os")
    elder_sentence_pair_oversampled = oversample(elder_sentence_pair_rows, args.elder_sentence_pair_oversample, "elder-sentence-pair-os")
    train_rows = stable_sort(
        bible_train + usage_oversampled + elder_sentence_pair_oversampled,
        args.seed + ":train",
    )
    validation_rows = stable_sort(
        stable_sample(bible_eval_train, args.validation_bible_rows, args.seed + ":val-bible")
        + stable_sample(usage_train, args.validation_usage_rows, args.seed + ":val-usage")
        + elder_sentence_pair_rows,
        args.seed + ":validation",
    )
    eval_train_balanced = validation_rows
    heldout_all = stable_sort(
        bible_heldout_direct + bible_heldout_ref + usage_heldout,
        args.seed + ":heldout-all",
    )
    heldout_all_plus_elder_sentence_pair = stable_sort(
        heldout_all + elder_sentence_pair_rows,
        args.seed + ":heldout-all-plus-elder-sentence-pair",
    )

    file_rows = [
        ("train.eng-gvn.jsonl", train_rows),
        ("validation.eng-gvn.jsonl", validation_rows),
        ("eval_train_balanced.eng-gvn.jsonl", eval_train_balanced),
        ("heldout_all.eng-gvn.jsonl", heldout_all),
        ("heldout_all_plus_elder_sentence_pair_train.eng-gvn.jsonl", heldout_all_plus_elder_sentence_pair),
        ("bible/eval_train_direct.eng-gvn.jsonl", bible_train_direct),
        ("bible/eval_train_ref.eng-gvn.jsonl", bible_train_ref),
        ("bible/heldout_direct_325.eng-gvn.jsonl", bible_heldout_direct),
        ("bible/heldout_ref_325.eng-gvn.jsonl", bible_heldout_ref),
        ("db_usage/all_usage_examples.eng-gvn.jsonl", usage_all),
        ("db_usage/train_usage.eng-gvn.jsonl", usage_train),
        ("db_usage/train_usage_oversampled.eng-gvn.jsonl", usage_oversampled),
        ("db_usage/heldout_usage.eng-gvn.jsonl", usage_heldout),
        ("elder_sentence_pair/all_elder_sentence_pair.eng-gvn.jsonl", elder_sentence_pair_rows),
        ("elder_sentence_pair/train_elder_sentence_pair_oversampled.eng-gvn.jsonl", elder_sentence_pair_oversampled),
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
            "v19 balanced replay continuation set: v12 Bible replay plus "
            "DB usage and elder-shared sentence-pair rows."
        ),
        "bible_dir": str(bible_dir),
        "v18_dir": str(v18_dir),
        "output_dir": str(output_dir),
        "seed": args.seed,
        "usage_oversample": args.usage_oversample,
        "elder_sentence_pair_oversample": args.elder_sentence_pair_oversample,
        "validation_bible_rows": args.validation_bible_rows,
        "validation_usage_rows": args.validation_usage_rows,
        "usage_split": {
            "train_rows": len(usage_train),
            "heldout_rows": len(usage_heldout),
            "train_word_ids": len(train_word_ids),
            "heldout_word_ids": len(heldout_word_ids),
            "word_id_intersection": len(train_word_ids & heldout_word_ids),
        },
        "elder_sentence_pair": {
            "rows": len(elder_sentence_pair_rows),
            "confidence": elder_sentence_pair_confidence_counts(elder_sentence_pair_rows),
        },
        "input_counts": {
            "bible_train_tagged_rows": len(bible_train),
            "bible_eval_train_tagged_rows": len(bible_eval_train),
            "bible_train_direct_rows": len(bible_train_direct),
            "bible_train_ref_rows": len(bible_train_ref),
            "bible_heldout_direct_rows": len(bible_heldout_direct),
            "bible_heldout_ref_rows": len(bible_heldout_ref),
            "usage_train_rows": len(usage_train),
            "usage_heldout_rows": len(usage_heldout),
            "elder_sentence_pair_rows": len(elder_sentence_pair_rows),
        },
        "output_counts": {
            "train_rows": len(train_rows),
            "validation_rows": len(validation_rows),
            "eval_train_balanced_rows": len(eval_train_balanced),
            "usage_oversampled_rows": len(usage_oversampled),
            "elder_sentence_pair_oversampled_rows": len(elder_sentence_pair_oversampled),
            "heldout_all_rows": len(heldout_all),
            "heldout_all_plus_elder_sentence_pair_train_rows": len(heldout_all_plus_elder_sentence_pair),
        },
        "outputs": [record_file(path, output_dir) for path in sorted(output_files)],
        "training_note": (
            "Train from the v12 merged model with target_lang=gvn_Latn, low LR, "
            "and no target token reinitialization. Evaluate Bible direct/ref, "
            "DB usage, elder-shared sentence pairs, and combined heldout separately."
        ),
    }

    manifest_file = output_dir / args.manifest_name
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    checksum_file = output_dir / "SHA256SUMS.v19"
    with checksum_file.open("w", encoding="utf-8") as handle:
        for path in sorted(output_files + [manifest_file]):
            handle.write(f"{sha256_file(path)}  {path.relative_to(output_dir)}\n")

    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

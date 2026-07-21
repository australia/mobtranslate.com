#!/usr/bin/env python3
"""Build v18 dataset by adding elder-shared sentence pairs to v10."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


DEFAULT_V10_DIR = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/prepared/"
    "v10.0-tagged-bible-plus-glossary-usage"
)
DEFAULT_ELDER_SENTENCE_PAIRS = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/sources/"
    "elder-shared-sentence-pairs-2026-07-02/sentence_pairs.eng-gvn.jsonl"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--v10-dir", default=DEFAULT_V10_DIR)
    parser.add_argument("--elder-sentence-pairs", default=DEFAULT_ELDER_SENTENCE_PAIRS)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seed", default="v18-elder-sentence-pairs-2026-07-02")
    parser.add_argument("--elder-sentence-pair-oversample", type=int, default=12)
    parser.add_argument("--manifest-name", default="v18_elder_sentence_pair_manifest.json")
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


def oversample(rows: list[dict[str, Any]], copies: int) -> list[dict[str, Any]]:
    if copies < 1:
        raise ValueError("--elder_sentence_pair-oversample must be >= 1")
    out: list[dict[str, Any]] = []
    for copy_index in range(copies):
        for row in rows:
            copied = clean_row(row)
            copied["id"] = f"{row['id']}:elder-sentence-pair-os{copy_index + 1}"
            copied["oversample"] = {
                "source_id": row["id"],
                "copy_index": copy_index + 1,
                "copies": copies,
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


def validate_elder_sentence_pair_rows(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        if row.get("direction") != "eng-gvn":
            raise ValueError(f"Unexpected direction in {row.get('id')}")
        if not str(row.get("input_text", "")).startswith("<translate> "):
            raise ValueError(f"Elder sentence-pair row missing translate tag: {row.get('id')}")
        if not row.get("output_text"):
            raise ValueError(f"Elder sentence-pair row missing output_text: {row.get('id')}")
        if row.get("approved_for_training") is not True:
            raise ValueError(f"Elder sentence-pair row not approved_for_training: {row.get('id')}")


def copy_sidecar(source: Path, output: Path, files: list[Path]) -> None:
    if source.exists():
        target = output / source.name
        shutil.copy2(source, target)
        files.append(target)


def main() -> None:
    args = parse_args()
    v10_dir = Path(args.v10_dir)
    elder_sentence_pairs_file = Path(args.elder_sentence_pairs)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    v10_train = read_jsonl(v10_dir / "train.eng-gvn.jsonl")
    v10_eval_train = read_jsonl(v10_dir / "eval_train.eng-gvn.jsonl")
    v10_validation = read_jsonl(v10_dir / "validation.eng-gvn.jsonl")
    v10_heldout_all = read_jsonl(v10_dir / "heldout_all.eng-gvn.jsonl")
    usage_train = read_jsonl(v10_dir / "db_usage/train_usage.eng-gvn.jsonl")
    usage_train_oversampled = read_jsonl(
        v10_dir / "db_usage/train_usage_oversampled.eng-gvn.jsonl"
    )
    usage_heldout = read_jsonl(v10_dir / "db_usage/heldout_usage.eng-gvn.jsonl")
    usage_all = read_jsonl(v10_dir / "db_usage/all_usage_examples.eng-gvn.jsonl")
    bible_eval_train_direct = read_jsonl(v10_dir / "bible/eval_train_direct.eng-gvn.jsonl")
    bible_eval_train_ref = read_jsonl(v10_dir / "bible/eval_train_ref.eng-gvn.jsonl")
    bible_heldout_direct = read_jsonl(v10_dir / "bible/heldout_direct_325.eng-gvn.jsonl")
    bible_heldout_ref = read_jsonl(v10_dir / "bible/heldout_ref_325.eng-gvn.jsonl")
    elder_sentence_pair_rows = read_jsonl(elder_sentence_pairs_file)

    validate_elder_sentence_pair_rows(elder_sentence_pair_rows)
    assert_unique_ids(elder_sentence_pair_rows, "elder sentence-pair rows")

    elder_sentence_pair_oversampled = oversample(elder_sentence_pair_rows, args.elder_sentence_pair_oversample)
    train_plus_elder_sentence_pair = stable_sort(
        v10_train + elder_sentence_pair_oversampled,
        args.seed + ":train-plus-elder-sentence-pair",
    )
    eval_train_plus_elder_sentence_pair = stable_sort(
        v10_eval_train + elder_sentence_pair_rows,
        args.seed + ":eval-train-plus-elder-sentence-pair",
    )
    usage_elder_sentence_pair_continuation = stable_sort(
        usage_train_oversampled + elder_sentence_pair_oversampled,
        args.seed + ":usage-elder-sentence-pair-continuation",
    )
    eval_usage_elder_sentence_pair = stable_sort(
        usage_train + elder_sentence_pair_rows,
        args.seed + ":eval-usage-elder-sentence-pair",
    )
    heldout_all_plus_elder_sentence_pair = stable_sort(
        v10_heldout_all + elder_sentence_pair_rows,
        args.seed + ":heldout-all-plus-elder-sentence-pair",
    )

    file_rows = [
        ("train.eng-gvn.jsonl", train_plus_elder_sentence_pair),
        ("eval_train.eng-gvn.jsonl", eval_train_plus_elder_sentence_pair),
        ("validation.eng-gvn.jsonl", v10_validation),
        ("heldout_all.eng-gvn.jsonl", v10_heldout_all),
        ("heldout_all_plus_elder_sentence_pair_train.eng-gvn.jsonl", heldout_all_plus_elder_sentence_pair),
        ("bible/eval_train_direct.eng-gvn.jsonl", bible_eval_train_direct),
        ("bible/eval_train_ref.eng-gvn.jsonl", bible_eval_train_ref),
        ("bible/heldout_direct_325.eng-gvn.jsonl", bible_heldout_direct),
        ("bible/heldout_ref_325.eng-gvn.jsonl", bible_heldout_ref),
        ("db_usage/all_usage_examples.eng-gvn.jsonl", usage_all),
        ("db_usage/train_usage.eng-gvn.jsonl", usage_train),
        ("db_usage/train_usage_oversampled.eng-gvn.jsonl", usage_train_oversampled),
        ("db_usage/heldout_usage.eng-gvn.jsonl", usage_heldout),
        ("elder_sentence_pair/all_elder_sentence_pair.eng-gvn.jsonl", elder_sentence_pair_rows),
        ("elder_sentence_pair/train_elder_sentence_pair_oversampled.eng-gvn.jsonl", elder_sentence_pair_oversampled),
        (
            "db_usage_plus_elder_sentence_pair/train_usage_elder_sentence_pair_oversampled.eng-gvn.jsonl",
            usage_elder_sentence_pair_continuation,
        ),
        ("db_usage_plus_elder_sentence_pair/eval_train_usage_elder_sentence_pair.eng-gvn.jsonl", eval_usage_elder_sentence_pair),
    ]

    output_files: list[Path] = []
    for relative, rows in file_rows:
        assert_unique_ids(rows, relative)
        path = output_dir / relative
        write_jsonl(path, rows)
        output_files.append(path)

    copy_sidecar(v10_dir / "SHA256SUMS", output_dir, output_files)
    sha_path = output_dir / "SHA256SUMS.v18"
    with sha_path.open("w", encoding="utf-8") as handle:
        for path in sorted(output_files):
            handle.write(f"{sha256_file(path)}  {path.relative_to(output_dir)}\n")

    confidence_counts: dict[str, int] = {}
    for row in elder_sentence_pair_rows:
        confidence = str((row.get("source_page") or {}).get("transcription_confidence"))
        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1

    manifest = {
        "created_at": "2026-07-02",
        "purpose": "v10 tagged Bible/glossary-usage dataset plus elder-shared Kuku Yalanji sentence pairs.",
        "v10_dir": str(v10_dir),
        "elder_sentence_pairs_file": str(elder_sentence_pairs_file),
        "output_dir": str(output_dir),
        "seed": args.seed,
        "elder_sentence_pair_oversample": args.elder_sentence_pair_oversample,
        "input_counts": {
            "v10_train_rows": len(v10_train),
            "v10_eval_train_rows": len(v10_eval_train),
            "v10_validation_rows": len(v10_validation),
            "v10_heldout_all_rows": len(v10_heldout_all),
            "usage_train_rows": len(usage_train),
            "usage_train_oversampled_rows": len(usage_train_oversampled),
            "usage_heldout_rows": len(usage_heldout),
            "elder_sentence_pair_rows": len(elder_sentence_pair_rows),
            "elder_sentence_pair_confidence": confidence_counts,
        },
        "output_counts": {
            "train_rows": len(train_plus_elder_sentence_pair),
            "eval_train_rows": len(eval_train_plus_elder_sentence_pair),
            "usage_elder_sentence_pair_continuation_rows": len(usage_elder_sentence_pair_continuation),
            "eval_usage_elder_sentence_pair_rows": len(eval_usage_elder_sentence_pair),
            "heldout_all_plus_elder_sentence_pair_train_rows": len(heldout_all_plus_elder_sentence_pair),
            "elder_sentence_pair_oversampled_rows": len(elder_sentence_pair_oversampled),
        },
        "outputs": [record_file(path, output_dir) for path in sorted(output_files)],
        "training_note": (
            "For the next continuation run, train from the v10 merged model on "
            "db_usage_plus_elder_sentence_pair/train_usage_elder_sentence_pair_oversampled.eng-gvn.jsonl and "
            "evaluate db_usage heldout, elder_sentence_pair/all_elder_sentence_pair, and Bible heldout separately."
        ),
    }
    manifest_path = output_dir / args.manifest_name
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()

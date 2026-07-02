#!/usr/bin/env python3
"""Build v10 Bible + glossary-conditioned DB usage tagged MT JSONL files."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_BIBLE_DIR = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/prepared/v9.7-tagged-direct-plus-reference-bible"
)
DEFAULT_USAGE_DIR = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/prepared/v9.9C-glossary-usage-full"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bible-dir", default=DEFAULT_BIBLE_DIR)
    parser.add_argument("--usage-dir", default=DEFAULT_USAGE_DIR)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seed", default="v10-bible-glossary-usage-2026-07-02")
    parser.add_argument("--usage-oversample", type=int, default=4)
    parser.add_argument("--validation-bible-rows", type=int, default=64)
    parser.add_argument("--validation-usage-rows", type=int, default=64)
    parser.add_argument("--manifest-name", default="tagged_bible_db_manifest.json")
    return parser.parse_args()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_key(seed: str, value: str) -> str:
    return sha256_text(f"{seed}\t{value}")


def stable_sort(rows: list[dict[str, Any]], seed: str) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: stable_key(seed, str(row.get("id", ""))))


def read_jsonl(file: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with file.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_jsonl(file: Path, rows: list[dict[str, Any]]) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def record_file(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(root)),
        "rows": sum(1 for line in path.open(encoding="utf-8") if line.strip()),
        "sha256": sha256_file(path),
    }


def sample(rows: list[dict[str, Any]], count: int, seed: str) -> list[dict[str, Any]]:
    return stable_sort(rows, seed)[: min(count, len(rows))]


def oversample(rows: list[dict[str, Any]], times: int) -> list[dict[str, Any]]:
    if times < 1:
        raise ValueError("--usage-oversample must be >= 1")
    out: list[dict[str, Any]] = []
    for copy_index in range(times):
        for row in rows:
            copied = dict(row)
            copied["id"] = f"{row['id']}:os{copy_index + 1}"
            copied["oversample"] = {
                "source_id": row["id"],
                "copy_index": copy_index + 1,
                "copies": times,
            }
            out.append(copied)
    return out


def usage_word_ids(rows: list[dict[str, Any]]) -> set[str]:
    ids = set()
    for row in rows:
        meta = row.get("db_usage_example") or {}
        word_id = meta.get("word_id")
        if word_id is not None:
            ids.add(str(word_id))
    return ids


def main() -> None:
    args = parse_args()
    bible_dir = Path(args.bible_dir)
    usage_dir = Path(args.usage_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    bible_train = read_jsonl(bible_dir / "v8_2048row/train.eng-gvn.jsonl")
    bible_eval_train = read_jsonl(bible_dir / "v8_2048row/eval_train.eng-gvn.jsonl")
    bible_train_direct = read_jsonl(bible_dir / "v8_2048row/eval_train_direct.eng-gvn.jsonl")
    bible_train_ref = read_jsonl(bible_dir / "v8_2048row/eval_train_ref.eng-gvn.jsonl")
    bible_heldout_direct = read_jsonl(bible_dir / "heldout_direct_325.eng-gvn.jsonl")
    bible_heldout_ref = read_jsonl(bible_dir / "heldout_ref_325.eng-gvn.jsonl")

    usage_train = read_jsonl(usage_dir / "train_usage_glossary.eng-gvn.jsonl")
    usage_heldout = read_jsonl(usage_dir / "heldout_usage_glossary.eng-gvn.jsonl")
    usage_all = stable_sort(usage_train + usage_heldout, args.seed + ":usage-all")
    usage_train_oversampled = oversample(usage_train, args.usage_oversample)

    train_mixed = stable_sort(bible_train + usage_train_oversampled, args.seed + ":train-mixed")
    eval_train = stable_sort(bible_eval_train + usage_train, args.seed + ":eval-train")
    validation = stable_sort(
        sample(bible_eval_train, args.validation_bible_rows, args.seed + ":validation-bible")
        + sample(usage_train, args.validation_usage_rows, args.seed + ":validation-usage"),
        args.seed + ":validation",
    )
    heldout_all = stable_sort(
        bible_heldout_direct + bible_heldout_ref + usage_heldout,
        args.seed + ":heldout-all",
    )

    files: list[Path] = []
    file_rows = [
        ("train.eng-gvn.jsonl", train_mixed),
        ("eval_train.eng-gvn.jsonl", eval_train),
        ("validation.eng-gvn.jsonl", validation),
        ("bible/eval_train_direct.eng-gvn.jsonl", bible_train_direct),
        ("bible/eval_train_ref.eng-gvn.jsonl", bible_train_ref),
        ("bible/heldout_direct_325.eng-gvn.jsonl", bible_heldout_direct),
        ("bible/heldout_ref_325.eng-gvn.jsonl", bible_heldout_ref),
        ("db_usage/all_usage_examples.eng-gvn.jsonl", usage_all),
        ("db_usage/train_usage.eng-gvn.jsonl", usage_train),
        ("db_usage/train_usage_oversampled.eng-gvn.jsonl", usage_train_oversampled),
        ("db_usage/heldout_usage.eng-gvn.jsonl", usage_heldout),
        ("heldout_all.eng-gvn.jsonl", heldout_all),
    ]
    for relative, rows in file_rows:
        path = output_dir / relative
        write_jsonl(path, rows)
        files.append(path)

    train_word_ids = usage_word_ids(usage_train)
    heldout_word_ids = usage_word_ids(usage_heldout)
    manifest = {
        "created_at": "2026-07-02",
        "purpose": "Tagged Bible direct/reference plus glossary-conditioned DB usage-example MT dataset.",
        "bible_dir": str(bible_dir),
        "usage_dir": str(usage_dir),
        "output_dir": str(output_dir),
        "seed": args.seed,
        "usage_oversample": args.usage_oversample,
        "validation_bible_rows": args.validation_bible_rows,
        "validation_usage_rows": args.validation_usage_rows,
        "usage_split": {
            "train_rows": len(usage_train),
            "heldout_rows": len(usage_heldout),
            "train_word_ids": len(train_word_ids),
            "heldout_word_ids": len(heldout_word_ids),
            "word_id_intersection": len(train_word_ids & heldout_word_ids),
        },
        "input_counts": {
            "bible_train_tagged_rows": len(bible_train),
            "bible_eval_train_tagged_rows": len(bible_eval_train),
            "bible_train_direct_rows": len(bible_train_direct),
            "bible_train_ref_rows": len(bible_train_ref),
            "bible_heldout_direct_rows": len(bible_heldout_direct),
            "bible_heldout_ref_rows": len(bible_heldout_ref),
            "usage_all_rows": len(usage_all),
        },
        "output_counts": {
            "train_rows": len(train_mixed),
            "eval_train_rows": len(eval_train),
            "validation_rows": len(validation),
            "heldout_all_rows": len(heldout_all),
        },
        "outputs": [record_file(path, output_dir) for path in files],
    }

    manifest_file = output_dir / args.manifest_name
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    checksum_file = output_dir / "SHA256SUMS"
    with checksum_file.open("w", encoding="utf-8") as handle:
        for path in sorted(files + [manifest_file]):
            handle.write(f"{sha256_file(path)}  {path.relative_to(output_dir)}\n")

    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

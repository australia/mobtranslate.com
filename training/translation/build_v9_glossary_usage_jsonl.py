#!/usr/bin/env python3
"""Build glossary-conditioned DB usage-example MT JSONL files for v9.9B gates."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_DATA_ROOT = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/prepared/v9.8-tagged-bible-plus-db-usage"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", default=DEFAULT_DATA_ROOT)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seed", default="v9.9B-glossary-usage-2026-07-02")
    parser.add_argument("--gate-sizes", default="1,8,32")
    parser.add_argument(
        "--template",
        default="<glossary> {word} ; type={word_type} ; domain={semantic_domain} <usage_example> {input_text}",
    )
    parser.add_argument("--manifest-name", default="glossary_usage_manifest.json")
    return parser.parse_args()


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


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


def make_glossary_row(row: dict[str, Any], template: str) -> dict[str, Any]:
    meta = row.get("db_usage_example") or {}
    word = normalize_text(meta.get("normalized_word") or meta.get("word"))
    if not word:
        raise ValueError(f"usage row lacks glossary word: {row.get('id')}")
    source = normalize_text(row.get("unconditioned_input_text") or row.get("input_text"))
    glossary_input = normalize_text(
        template.format(
            word=word,
            input_text=source,
            word_type=normalize_text(meta.get("word_type")) or "unknown",
            semantic_domain=normalize_text(meta.get("semantic_domain")) or "unknown",
        )
    )
    out = dict(row)
    out["id"] = f"{row['id']}:glossary"
    out["input_text"] = glossary_input
    out["unconditioned_input_text"] = source
    out["task_tagging"] = {
        "enabled": True,
        "task": "usage_example_with_glossary",
        "template": template,
    }
    out["retrieval_glossary"] = {
        "source": "db_usage_example.word",
        "word": word,
        "word_type": meta.get("word_type"),
        "semantic_domain": meta.get("semantic_domain"),
        "leaks_full_target": False,
    }
    return out


def parse_gate_sizes(value: str) -> list[int]:
    sizes = sorted({int(part.strip()) for part in value.split(",") if part.strip()})
    if not sizes or any(size < 1 for size in sizes):
        raise ValueError("--gate-sizes must contain positive integers")
    return sizes


def main() -> None:
    args = parse_args()
    data_root = Path(args.data_root)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_plain = read_jsonl(data_root / "db_usage/train_usage.eng-gvn.jsonl")
    heldout_plain = read_jsonl(data_root / "db_usage/heldout_usage.eng-gvn.jsonl")
    train_glossary = stable_sort(
        [make_glossary_row(row, args.template) for row in train_plain],
        args.seed + ":train-glossary",
    )
    heldout_glossary = stable_sort(
        [make_glossary_row(row, args.template) for row in heldout_plain],
        args.seed + ":heldout-glossary",
    )
    gate_sizes = parse_gate_sizes(args.gate_sizes)

    files: list[Path] = []
    file_rows: list[tuple[str, list[dict[str, Any]]]] = [
        ("train_usage_glossary.eng-gvn.jsonl", train_glossary),
        ("heldout_usage_glossary.eng-gvn.jsonl", heldout_glossary),
    ]
    for gate_size in gate_sizes:
        gate_rows = train_glossary[: min(gate_size, len(train_glossary))]
        gate_dir = f"gates/{gate_size}row"
        file_rows.extend(
            [
                (f"{gate_dir}/train.eng-gvn.jsonl", gate_rows),
                (f"{gate_dir}/validation.eng-gvn.jsonl", gate_rows),
                (f"{gate_dir}/eval_train.eng-gvn.jsonl", gate_rows),
            ]
        )

    for relative, rows in file_rows:
        path = output_dir / relative
        write_jsonl(path, rows)
        files.append(path)

    train_word_ids = {str((row.get("db_usage_example") or {}).get("word_id")) for row in train_glossary}
    heldout_word_ids = {str((row.get("db_usage_example") or {}).get("word_id")) for row in heldout_glossary}
    manifest = {
        "created_at": "2026-07-02",
        "purpose": "Glossary-conditioned DB usage-example MT overfit gates.",
        "data_root": str(data_root),
        "output_dir": str(output_dir),
        "seed": args.seed,
        "template": args.template,
        "gate_sizes": gate_sizes,
        "input_counts": {
            "train_usage_rows": len(train_plain),
            "heldout_usage_rows": len(heldout_plain),
            "train_word_ids": len(train_word_ids),
            "heldout_word_ids": len(heldout_word_ids),
            "word_id_intersection": len(train_word_ids & heldout_word_ids),
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

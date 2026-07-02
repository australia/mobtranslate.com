#!/usr/bin/env python3
"""Build v11 ByT5 Bible-control datasets from the v9.7 tagged Bible data."""

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bible-dir", default=DEFAULT_BIBLE_DIR)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seed", default="v11-byt5-bible-control-2026-07-02")
    parser.add_argument("--gate-sizes", default="32,512")
    parser.add_argument("--manifest-name", default="byt5_bible_control_manifest.json")
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


def parse_gate_sizes(value: str) -> list[int]:
    sizes = sorted({int(part.strip()) for part in value.split(",") if part.strip()})
    if not sizes or any(size < 1 for size in sizes):
        raise ValueError("--gate-sizes must contain positive integers")
    return sizes


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


def main() -> None:
    args = parse_args()
    bible_dir = Path(args.bible_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    gate_sizes = parse_gate_sizes(args.gate_sizes)

    bible_train = stable_sort(read_jsonl(bible_dir / "v8_2048row/train.eng-gvn.jsonl"), args.seed + ":train")
    bible_eval_train = read_jsonl(bible_dir / "v8_2048row/eval_train.eng-gvn.jsonl")
    heldout_direct = read_jsonl(bible_dir / "heldout_direct_325.eng-gvn.jsonl")
    heldout_ref = read_jsonl(bible_dir / "heldout_ref_325.eng-gvn.jsonl")
    heldout_all = stable_sort(heldout_direct + heldout_ref, args.seed + ":heldout")

    files: list[Path] = []
    file_rows: list[tuple[str, list[dict[str, Any]]]] = [
        ("bible/heldout_direct_325.eng-gvn.jsonl", heldout_direct),
        ("bible/heldout_ref_325.eng-gvn.jsonl", heldout_ref),
        ("heldout_all_650.eng-gvn.jsonl", heldout_all),
    ]
    for gate_size in gate_sizes:
        gate_rows = bible_train[: min(gate_size, len(bible_train))]
        gate_eval = bible_eval_train[: min(gate_size, len(bible_eval_train))]
        gate_dir = f"gates/{gate_size}row"
        file_rows.extend(
            [
                (f"{gate_dir}/train.eng-gvn.jsonl", gate_rows),
                (f"{gate_dir}/validation.eng-gvn.jsonl", gate_rows),
                (f"{gate_dir}/eval_train.eng-gvn.jsonl", gate_eval),
            ]
        )

    for relative, rows in file_rows:
        path = output_dir / relative
        write_jsonl(path, rows)
        files.append(path)

    manifest = {
        "created_at": "2026-07-02",
        "purpose": "ByT5 byte-level Bible-control gates using v9.7 tagged Bible data.",
        "bible_dir": str(bible_dir),
        "output_dir": str(output_dir),
        "seed": args.seed,
        "gate_sizes": gate_sizes,
        "input_counts": {
            "bible_train_tagged_rows": len(bible_train),
            "bible_eval_train_tagged_rows": len(bible_eval_train),
            "heldout_direct_rows": len(heldout_direct),
            "heldout_ref_rows": len(heldout_ref),
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

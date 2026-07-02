#!/usr/bin/env python3
"""Build clean deterministic v8 diagnostic overfit/eval sets."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

from transformers import AutoTokenizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-file", required=True)
    parser.add_argument("--validation-file", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--tokenizer", default="facebook/nllb-200-distilled-1.3B")
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="tpi_Latn")
    parser.add_argument("--max-source-tokens", type=int, default=128)
    parser.add_argument("--max-target-tokens", type=int, default=160)
    parser.add_argument("--min-token-ratio", type=float, default=0.6)
    parser.add_argument("--max-token-ratio", type=float, default=1.8)
    parser.add_argument("--heldout-size", type=int, default=64)
    parser.add_argument("--gate-sizes", default="1,8,32,256")
    parser.add_argument("--seed-label", default="mobtranslate-kuku-yalanji-v8-2026-07-01")
    return parser.parse_args()


def normalize_text(text: str) -> str:
    return " ".join(str(text).split())


def read_rows(file: str, direction: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(file, "r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if row.get("direction") == direction:
                rows.append(row)
    return rows


def stable_key(row: dict[str, Any], seed_label: str) -> str:
    parts = [
        seed_label,
        str(row.get("canonical_ref") or ""),
        normalize_text(row.get("input_text", "")),
        normalize_text(row.get("output_text", "")),
    ]
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def token_len(tokenizer: Any, text: str, *, target: bool = False) -> int:
    if target:
        return len(tokenizer(text_target=normalize_text(text), truncation=False).input_ids)
    return len(tokenizer(normalize_text(text), truncation=False).input_ids)


def reject_reason(row: dict[str, Any], tokenizer: Any, args: argparse.Namespace) -> str | None:
    if row.get("pair_kind") != "verse":
        return "pair_kind_not_verse"
    if not row.get("canonical_ref"):
        return "missing_canonical_ref"
    source = normalize_text(row.get("input_text", ""))
    target = normalize_text(row.get("output_text", ""))
    if not source or not target:
        return "empty_source_or_target"
    source_len = token_len(tokenizer, source)
    target_len = token_len(tokenizer, target, target=True)
    if source_len > args.max_source_tokens:
        return "source_too_long"
    if target_len > args.max_target_tokens:
        return "target_too_long"
    ratio = target_len / max(source_len, 1)
    if ratio < args.min_token_ratio:
        return "target_source_ratio_too_low"
    if ratio > args.max_token_ratio:
        return "target_source_ratio_too_high"
    return None


def clean_rows(rows: list[dict[str, Any]], tokenizer: Any, args: argparse.Namespace) -> tuple[list[dict[str, Any]], Counter[str]]:
    seen_refs: set[str] = set()
    kept: list[dict[str, Any]] = []
    rejected: Counter[str] = Counter()
    for row in sorted(rows, key=lambda item: stable_key(item, args.seed_label)):
        reason = reject_reason(row, tokenizer, args)
        if reason:
            rejected[reason] += 1
            continue
        ref = str(row.get("canonical_ref"))
        if ref in seen_refs:
            rejected["duplicate_canonical_ref"] += 1
            continue
        seen_refs.add(ref)
        row = dict(row)
        row["v8_diagnostic"] = {
            "source_tokens": token_len(tokenizer, row["input_text"]),
            "target_tokens": token_len(tokenizer, row["output_text"], target=True),
            "stable_key": stable_key(row, args.seed_label),
        }
        kept.append(row)
    return kept, rejected


def write_jsonl(file: Path, rows: list[dict[str, Any]]) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    with open(file, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with open(file, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    gate_sizes = [int(item.strip()) for item in args.gate_sizes.split(",") if item.strip()]
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(args.tokenizer, src_lang=args.source_lang, tgt_lang=args.target_lang)
    train_rows_raw = read_rows(args.train_file, args.direction)
    validation_rows_raw = read_rows(args.validation_file, args.direction)
    train_rows, train_rejected = clean_rows(train_rows_raw, tokenizer, args)
    heldout_rows, heldout_rejected = clean_rows(validation_rows_raw, tokenizer, args)

    if len(train_rows) < max(gate_sizes):
        raise SystemExit(f"Only {len(train_rows)} clean train rows, need {max(gate_sizes)}")
    if len(heldout_rows) < args.heldout_size:
        raise SystemExit(f"Only {len(heldout_rows)} clean heldout rows, need {args.heldout_size}")

    files: list[dict[str, Any]] = []
    for size in gate_sizes:
        gate = output_dir / f"v8_{size:03d}row"
        train_file = gate / "train.eng-gvn.jsonl"
        eval_train_file = gate / "eval_train.eng-gvn.jsonl"
        rows = train_rows[:size]
        write_jsonl(train_file, rows)
        write_jsonl(eval_train_file, rows)
        files.extend([
            {"path": str(train_file.relative_to(output_dir)), "rows": len(rows), "sha256": sha256_file(train_file)},
            {"path": str(eval_train_file.relative_to(output_dir)), "rows": len(rows), "sha256": sha256_file(eval_train_file)},
        ])

    heldout_file = output_dir / "heldout_clean_064.eng-gvn.jsonl"
    write_jsonl(heldout_file, heldout_rows[: args.heldout_size])
    files.append({"path": str(heldout_file.relative_to(output_dir)), "rows": args.heldout_size, "sha256": sha256_file(heldout_file)})

    manifest = {
        "dataset_id": "kuku_yalanji_v8_diagnostic_sets",
        "created_at": "2026-07-01",
        "purpose": "Nested overfit/reproduction gates for v8 diagnostic suite.",
        "direction": args.direction,
        "source_lang": args.source_lang,
        "target_lang": args.target_lang,
        "tokenizer": args.tokenizer,
        "seed_label": args.seed_label,
        "filters": {
            "pair_kind": "verse",
            "max_source_tokens": args.max_source_tokens,
            "max_target_tokens": args.max_target_tokens,
            "min_token_ratio": args.min_token_ratio,
            "max_token_ratio": args.max_token_ratio,
            "dedupe": "one row per canonical_ref",
        },
        "raw_counts": {
            "train": len(train_rows_raw),
            "validation": len(validation_rows_raw),
        },
        "clean_counts": {
            "train": len(train_rows),
            "heldout": len(heldout_rows),
        },
        "rejections": {
            "train": dict(train_rejected),
            "heldout": dict(heldout_rejected),
        },
        "gate_sizes": gate_sizes,
        "heldout_size": args.heldout_size,
        "files": files,
    }
    manifest_file = output_dir / "manifest.json"
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build soft lexical-hint Bible MT JSONL files for v15 diagnostics."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
from pathlib import Path
from typing import Any


TOKEN_RE = re.compile(r"[A-Za-z0-9-]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--source-train", default="v8_2048row/train.eng-gvn.jsonl")
    parser.add_argument("--source-eval-train", default="v8_2048row/eval_train.eng-gvn.jsonl")
    parser.add_argument("--source-train-direct", default="v8_2048row/eval_train_direct.eng-gvn.jsonl")
    parser.add_argument("--source-train-ref", default="v8_2048row/eval_train_ref.eng-gvn.jsonl")
    parser.add_argument("--source-heldout-direct", default="heldout_direct_325.eng-gvn.jsonl")
    parser.add_argument("--source-heldout-ref", default="heldout_ref_325.eng-gvn.jsonl")
    parser.add_argument("--source-heldout-mixed", default="heldout_multitask_650.eng-gvn.jsonl")
    parser.add_argument("--max-hints", type=int, default=3)
    parser.add_argument("--min-hint-chars", type=int, default=4)
    parser.add_argument("--template", default="<lexical_hints> {hints} </lexical_hints> {input_text}")
    parser.add_argument("--separator", default=" ; ")
    parser.add_argument("--include-nohint-train", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--manifest-name", default="lexical_hint_manifest.json")
    return parser.parse_args()


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


def normalize_token(token: str) -> str:
    return "-".join(TOKEN_RE.findall(token)).casefold()


def words(text: Any) -> list[str]:
    return TOKEN_RE.findall(normalize_text(text))


def sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def target_frequency(rows: list[dict[str, Any]]) -> collections.Counter[str]:
    counts: collections.Counter[str] = collections.Counter()
    for row in rows:
        seen = {normalize_token(token) for token in words(row.get("output_text"))}
        counts.update(token for token in seen if token)
    return counts


def select_hints(
    row: dict[str, Any],
    frequencies: collections.Counter[str],
    *,
    max_hints: int,
    min_hint_chars: int,
) -> list[str]:
    candidates: dict[str, tuple[int, int, str]] = {}
    for position, token in enumerate(words(row.get("output_text"))):
        normalized = normalize_token(token)
        if not normalized or len(normalized) < min_hint_chars:
            continue
        if normalized not in candidates:
            candidates[normalized] = (frequencies.get(normalized, 0), position, token)
    ranked = sorted(candidates.values(), key=lambda item: (item[0], item[1], item[2].casefold()))
    return [item[2] for item in ranked[:max_hints]]


def make_hint_row(
    row: dict[str, Any],
    frequencies: collections.Counter[str],
    *,
    max_hints: int,
    min_hint_chars: int,
    template: str,
    separator: str,
) -> dict[str, Any]:
    original_input = normalize_text(row.get("input_text"))
    hints = select_hints(row, frequencies, max_hints=max_hints, min_hint_chars=min_hint_chars)
    hint_text = separator.join(hints)
    updated = dict(row)
    updated["id"] = f"{row['id']}:lexhint"
    updated["input_text"] = normalize_text(template.format(hints=hint_text, input_text=original_input))
    updated["lexical_hinting"] = {
        "enabled": True,
        "source": "oracle_target_reference_rare_tokens",
        "leaks_target_terms": True,
        "template": template,
        "separator": separator,
        "max_hints": max_hints,
        "min_hint_chars": min_hint_chars,
        "hints": hints,
        "original_input_text": original_input,
    }
    return updated


def make_nohint_row(row: dict[str, Any]) -> dict[str, Any]:
    updated = dict(row)
    updated["id"] = f"{row['id']}:nohint"
    updated["lexical_hinting"] = {
        "enabled": False,
        "source": "none",
        "leaks_target_terms": False,
        "original_input_text": normalize_text(row.get("input_text")),
    }
    return updated


def transform_rows(
    rows: list[dict[str, Any]],
    frequencies: collections.Counter[str],
    *,
    max_hints: int,
    min_hint_chars: int,
    template: str,
    separator: str,
    include_nohint: bool,
) -> list[dict[str, Any]]:
    transformed: list[dict[str, Any]] = []
    for row in rows:
        if include_nohint:
            transformed.append(make_nohint_row(row))
        transformed.append(
            make_hint_row(
                row,
                frequencies,
                max_hints=max_hints,
                min_hint_chars=min_hint_chars,
                template=template,
                separator=separator,
            )
        )
    return transformed


def record_file(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(root)),
        "rows": sum(1 for line in path.open(encoding="utf-8") if line.strip()),
        "sha256": sha256_file(path),
    }


def write_split(
    *,
    input_dir: Path,
    output_dir: Path,
    source_relative: str,
    output_relative: str,
    frequencies: collections.Counter[str],
    max_hints: int,
    min_hint_chars: int,
    template: str,
    separator: str,
    include_nohint: bool,
) -> Path:
    rows = read_jsonl(input_dir / source_relative)
    transformed = transform_rows(
        rows,
        frequencies,
        max_hints=max_hints,
        min_hint_chars=min_hint_chars,
        template=template,
        separator=separator,
        include_nohint=include_nohint,
    )
    output_path = output_dir / output_relative
    write_jsonl(output_path, transformed)
    return output_path


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_rows = read_jsonl(input_dir / args.source_train)
    frequencies = target_frequency(train_rows)
    files: list[Path] = []

    split_specs = [
        (args.source_train, "v8_2048row/train.eng-gvn.jsonl", args.include_nohint_train),
        (args.source_eval_train, "v8_2048row/eval_train.eng-gvn.jsonl", args.include_nohint_train),
        (args.source_train_direct, "v8_2048row/eval_train_direct.eng-gvn.jsonl", False),
        (args.source_train_ref, "v8_2048row/eval_train_ref.eng-gvn.jsonl", False),
        (args.source_heldout_direct, "heldout_direct_325.eng-gvn.jsonl", False),
        (args.source_heldout_ref, "heldout_ref_325.eng-gvn.jsonl", False),
        (args.source_heldout_mixed, "heldout_multitask_650.eng-gvn.jsonl", False),
    ]
    for source_relative, output_relative, include_nohint in split_specs:
        files.append(
            write_split(
                input_dir=input_dir,
                output_dir=output_dir,
                source_relative=source_relative,
                output_relative=output_relative,
                frequencies=frequencies,
                max_hints=args.max_hints,
                min_hint_chars=args.min_hint_chars,
                template=args.template,
                separator=args.separator,
                include_nohint=include_nohint,
            )
        )

    # Preserve plain no-hint evaluation files for regression checks after training.
    for source_relative, output_relative in [
        (args.source_train_direct, "nohint/eval_train_direct.eng-gvn.jsonl"),
        (args.source_train_ref, "nohint/eval_train_ref.eng-gvn.jsonl"),
        (args.source_heldout_direct, "nohint/heldout_direct_325.eng-gvn.jsonl"),
        (args.source_heldout_ref, "nohint/heldout_ref_325.eng-gvn.jsonl"),
        (args.source_heldout_mixed, "nohint/heldout_multitask_650.eng-gvn.jsonl"),
    ]:
        rows = [make_nohint_row(row) for row in read_jsonl(input_dir / source_relative)]
        path = output_dir / output_relative
        write_jsonl(path, rows)
        files.append(path)

    manifest = {
        "created_at": "2026-07-02",
        "purpose": "Soft lexical-hint Bible MT diagnostic following v14 hard-constraint failure.",
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "template": args.template,
        "separator": args.separator,
        "max_hints": args.max_hints,
        "min_hint_chars": args.min_hint_chars,
        "include_nohint_train": args.include_nohint_train,
        "hint_source": "oracle target-reference rare tokens selected by train-set document frequency",
        "product_realism": "upper_bound_only; heldout hints leak target-reference terms",
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

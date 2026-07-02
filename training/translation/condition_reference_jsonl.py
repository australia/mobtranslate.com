#!/usr/bin/env python3
"""Build reference-conditioned JSONL files for Bible reproduction runs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_FILES = (
    "v8_2048row/train.eng-gvn.jsonl,"
    "v8_2048row/eval_train.eng-gvn.jsonl,"
    "heldout_clean_064.eng-gvn.jsonl"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--files", default=DEFAULT_FILES)
    parser.add_argument("--template", default="<bible_ref> {canonical_ref} <eng> {input_text}")
    parser.add_argument("--manifest-name", default="reference_conditioning_manifest.json")
    return parser.parse_args()


def normalize_text(text: str) -> str:
    return " ".join(str(text).split())


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


def condition_row(row: dict[str, Any], template: str) -> dict[str, Any]:
    canonical_ref = normalize_text(row.get("canonical_ref", ""))
    input_text = normalize_text(row.get("input_text", ""))
    if not canonical_ref:
        raise ValueError(f"missing canonical_ref for row {row.get('id', '<unknown>')}")
    if not input_text:
        raise ValueError(f"missing input_text for row {row.get('id', '<unknown>')}")

    conditioned = dict(row)
    conditioned["unconditioned_input_text"] = input_text
    conditioned["input_text"] = normalize_text(
        template.format(
            canonical_ref=canonical_ref,
            input_text=input_text,
            id=normalize_text(row.get("id", "")),
        )
    )
    conditioned["reference_conditioning"] = {
        "enabled": True,
        "template": template,
        "canonical_ref": canonical_ref,
    }
    return conditioned


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    files = [item.strip() for item in args.files.split(",") if item.strip()]
    if not files:
        raise SystemExit("No files requested")

    manifest: dict[str, Any] = {
        "created_at": "2026-07-01",
        "purpose": "Reference-conditioned Bible reproduction dataset.",
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "template": args.template,
        "files": [],
    }
    source_manifest = input_dir / "manifest.json"
    if source_manifest.exists():
        manifest["source_manifest_sha256"] = sha256_file(source_manifest)

    for relative in files:
        source_file = input_dir / relative
        output_file = output_dir / relative
        rows = [condition_row(row, args.template) for row in read_jsonl(source_file)]
        write_jsonl(output_file, rows)
        manifest["files"].append(
            {
                "path": relative,
                "rows": len(rows),
                "source_sha256": sha256_file(source_file),
                "conditioned_sha256": sha256_file(output_file),
            }
        )

    manifest_file = output_dir / args.manifest_name
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Freeze a language-program artifact specification into a checksummed ledger."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--spec", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def jsonl_rows(path: Path) -> int:
    with path.open("rb") as handle:
        return sum(bool(line.strip()) for line in handle)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def freeze(program_root: Path, specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    ledger: list[dict[str, Any]] = []
    for index, spec in enumerate(specs, start=1):
        key = str(spec.get("artifact_key") or "").strip()
        raw_path = str(spec.get("path") or "").strip()
        if not key or not raw_path:
            raise ValueError(f"spec row {index} requires artifact_key and path")
        if key in seen:
            raise ValueError(f"duplicate artifact_key: {key}")
        seen.add(key)
        file_path = Path(raw_path)
        if not file_path.is_absolute():
            file_path = (program_root / file_path).resolve()
        if not file_path.is_file():
            raise FileNotFoundError(f"{key}: {file_path}")
        row_count = spec.get("row_count")
        if row_count == "jsonl_nonblank":
            row_count = jsonl_rows(file_path)
        elif row_count is not None and (not isinstance(row_count, int) or row_count < 0):
            raise ValueError(f"{key}: invalid row_count {row_count!r}")
        ledger.append(
            {
                "artifact_key": key,
                "stage_key": spec["stage_key"],
                "source_key": spec.get("source_key"),
                "artifact_kind": spec["artifact_kind"],
                "path": raw_path,
                "media_type": spec.get("media_type"),
                "sha256": sha256(file_path),
                "row_count": row_count,
                "status": spec.get("status", "verified"),
                "immutable": bool(spec.get("immutable", True)),
                "generated_by": spec.get("generated_by"),
                "metadata": spec.get("metadata") or {},
            }
        )
    return ledger


def write_atomic(path: Path, rows: list[dict[str, Any]], replace: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not replace:
        raise FileExistsError(f"refusing existing output without --replace: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    root = args.program_root.resolve()
    spec = args.spec or root / "ARTIFACT-SPEC.jsonl"
    output = args.output or root / "ARTIFACT-LEDGER.jsonl"
    rows = freeze(root, read_jsonl(spec))
    write_atomic(output, rows, args.replace)
    print(json.dumps({"output": str(output), "sha256": sha256(output), "artifacts": len(rows)}, indent=2))


if __name__ == "__main__":
    main()

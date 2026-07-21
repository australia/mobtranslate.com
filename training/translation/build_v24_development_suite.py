#!/usr/bin/env python3
"""Build one immutable, endpoint-labelled v24 development evaluation suite."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_endpoints(values: list[str]) -> list[tuple[str, Path]]:
    endpoints: list[tuple[str, Path]] = []
    labels: set[str] = set()
    for value in values:
        label, separator, raw_path = value.partition("=")
        label = label.strip()
        path = Path(raw_path).expanduser().resolve()
        if not separator or not label or not raw_path.strip():
            raise ValueError(f"invalid endpoint {value!r}; expected LABEL=PATH")
        if label in labels:
            raise ValueError(f"duplicate endpoint label: {label}")
        if not path.is_file():
            raise FileNotFoundError(path)
        labels.add(label)
        endpoints.append((label, path))
    return endpoints


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"expected object at {path}:{line_number}")
            if not str(row.get("input_text") or "").strip():
                raise ValueError(f"blank input_text at {path}:{line_number}")
            if not str(row.get("output_text") or "").strip():
                raise ValueError(f"blank output_text at {path}:{line_number}")
            rows.append(row)
    return rows


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def build(endpoints: list[tuple[str, Path]], output_dir: Path) -> dict[str, Any]:
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    source_manifest: dict[str, Any] = {}
    combined: list[dict[str, Any]] = []
    combined_ids: set[str] = set()
    for label, path in endpoints:
        rows = read_jsonl(path)
        source_manifest[label] = {"path": str(path), "sha256": sha256(path), "rows": len(rows)}
        for index, source in enumerate(rows, start=1):
            original_id = str(source.get("id") or f"row-{index}")
            identifier = f"v24-dev:{label}:{original_id}"
            if identifier in combined_ids:
                raise ValueError(f"duplicate combined row id: {identifier}")
            row = dict(source)
            row["id"] = identifier
            row["v24_original_id"] = original_id
            row["v24_endpoint"] = label
            combined.append(row)
            combined_ids.add(identifier)

    manifest = {
        "schema_version": 1,
        "dataset_id": "v24.0-lexicon-grounded-development-suite",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "development_only_not_blind_test",
        "sources": source_manifest,
        "endpoint_order": [label for label, _ in endpoints],
        "rows": len(combined),
        "interpretation": {
            "lexicon": "closed-set reconstruction on governed mappings used in treatment training",
            "synthetic": "same-process development regression signal",
            "natural_and_usage": "previously observed development or diagnostic material",
            "not_claimed": "speaker-diverse blind natural-language test",
        },
    }

    with tempfile.TemporaryDirectory(
        prefix=f".{output_dir.name}.building-", dir=output_dir.parent
    ) as temporary:
        staging = Path(temporary)
        suite_path = staging / "development-suite.eng-gvn.jsonl"
        with suite_path.open("w", encoding="utf-8") as handle:
            for row in combined:
                handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        write_json(staging / "MANIFEST.json", manifest)
        checksums = "".join(
            f"{sha256(path)}  {path.relative_to(staging)}\n"
            for path in sorted(staging.iterdir())
            if path.is_file()
        )
        (staging / "SHA256SUMS").write_text(checksums, encoding="utf-8")
        (staging / "BUILD_COMPLETE").touch()
        staging.rename(output_dir)
    return manifest


def main() -> None:
    args = parse_args()
    manifest = build(parse_endpoints(args.endpoint), args.output_dir)
    print(json.dumps({"rows": manifest["rows"], "sources": manifest["sources"]}, indent=2))


if __name__ == "__main__":
    main()

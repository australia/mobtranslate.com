#!/usr/bin/env python3
"""Verify a sealed Kuku Yalanji version benchmark before inference begins."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--kit-root", type=Path, required=True)
    parser.add_argument("--models-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(16 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON on {path}:{line_number}: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"row {line_number} is not an object")
            rows.append(row)
    return rows


def main() -> None:
    args = parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1:
        raise SystemExit("unsupported benchmark manifest schema")

    data_spec = manifest["data"]
    data_path = args.kit_root / data_spec["relative_path"]
    observed_data_hash = sha256(data_path)
    if observed_data_hash != data_spec["sha256"]:
        raise SystemExit(f"data SHA-256 mismatch: {observed_data_hash}")

    rows = read_jsonl(data_path)
    if len(rows) != data_spec["rows"]:
        raise SystemExit(f"data row mismatch: expected {data_spec['rows']}, observed {len(rows)}")
    ids = [str(row.get("id") or "") for row in rows]
    if not all(ids) or len(ids) != len(set(ids)):
        raise SystemExit("benchmark row ids must be nonempty and unique")
    directions = Counter(str(row.get("direction")) for row in rows)
    if dict(directions) != data_spec["directions"]:
        raise SystemExit(f"direction counts differ: {dict(directions)}")
    pair_kinds = Counter(str(row.get("pair_kind")) for row in rows)
    if dict(pair_kinds) != data_spec["pair_kinds"]:
        raise SystemExit(f"pair-kind counts differ: {dict(pair_kinds)}")

    model_specs = manifest.get("models")
    if not isinstance(model_specs, list) or not model_specs:
        raise SystemExit("manifest models must be a nonempty list")
    labels = [str(spec.get("label") or "") for spec in model_specs]
    directories = [str(spec.get("directory") or "") for spec in model_specs]
    if not all(labels) or len(labels) != len(set(labels)):
        raise SystemExit("model labels must be nonempty and unique")
    if not all(directories) or len(directories) != len(set(directories)):
        raise SystemExit("model directories must be nonempty and unique")

    model_results: list[dict[str, Any]] = []
    for model_spec in model_specs:
        model_dir = args.models_root / model_spec["directory"]
        expected_files = model_spec.get("files")
        if not isinstance(expected_files, dict) or not expected_files:
            raise SystemExit(f"missing file manifest for {model_spec['label']}")
        observed_files: dict[str, str] = {}
        for relative_path, expected_hash in expected_files.items():
            candidate = Path(relative_path)
            if candidate.is_absolute() or ".." in candidate.parts:
                raise SystemExit(f"unsafe model file path for {model_spec['label']}: {relative_path}")
            required = model_dir / candidate
            if not required.is_file():
                raise SystemExit(f"missing required model file: {required}")
            observed_hash = sha256(required)
            if observed_hash != expected_hash:
                raise SystemExit(
                    f"{model_spec['label']} {relative_path} SHA-256 mismatch: {observed_hash}"
                )
            observed_files[relative_path] = observed_hash
        observed_model_hash = observed_files.get("model.safetensors")
        if observed_model_hash != model_spec["model_safetensors_sha256"]:
            raise SystemExit(f"inconsistent weight hashes for {model_spec['label']}")
        config = json.loads((model_dir / "config.json").read_text(encoding="utf-8"))
        if config.get("model_type") != "m2m_100":
            raise SystemExit(f"unexpected model_type for {model_spec['label']}: {config.get('model_type')}")
        model_results.append(
            {
                "label": model_spec["label"],
                "directory": str(model_dir),
                "model_safetensors_sha256": observed_model_hash,
                "files": observed_files,
                "model_type": config["model_type"],
            }
        )

    result = {
        "status": "PASS",
        "manifest": str(args.manifest),
        "data": {
            "path": str(data_path),
            "sha256": observed_data_hash,
            "rows": len(rows),
            "directions": dict(directions),
            "pair_kinds": dict(pair_kinds),
        },
        "models": model_results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

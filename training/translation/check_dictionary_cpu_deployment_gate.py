#!/usr/bin/env python3
"""Refuse lexical-model loading unless its exact reconstruction gate and weights match."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


REQUIRED_CHECKS = (
    "benchmark_rows_at_least_minimum",
    "normalized_accepted_reference_exact_rate_ge_0_80",
    "wilson_95_lower_bound_ge_0_80",
    "empty_outputs_zero",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gate", type=Path, required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--model-file", type=Path, required=True)
    return parser.parse_args()


def load_object(path: Path) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return document


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()
    gate = load_object(args.gate)
    problems: list[str] = []
    if gate.get("gate_type") != "model_lexical_reconstruction":
        problems.append("gate type is not model_lexical_reconstruction")
    if gate.get("status") != "PASS":
        problems.append("gate status is not PASS")
    if gate.get("decision") != "MODEL_LEXICAL_RECONSTRUCTION_ALLOWED":
        problems.append("gate decision is not MODEL_LEXICAL_RECONSTRUCTION_ALLOWED")
    checks = gate.get("checks") or {}
    for check in REQUIRED_CHECKS:
        if checks.get(check) is not True:
            problems.append(f"required check is not true: {check}")
    model = gate.get("model") or {}
    if model.get("id") != args.model_id:
        problems.append("gate model ID does not match requested model")

    expected_sha = model.get("merged_model_sha256")
    if not problems:
        if not args.model_file.is_file():
            problems.append("requested model file does not exist")
        elif sha256(args.model_file) != expected_sha:
            problems.append("requested model SHA-256 does not match gate")

    result = {
        "allowed": not problems,
        "model_id": args.model_id,
        "model_file": str(args.model_file),
        "problems": problems,
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())

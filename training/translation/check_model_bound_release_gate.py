#!/usr/bin/env python3
"""Fail closed unless a release gate authorizes the exact requested model weights."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gate", type=Path, required=True)
    parser.add_argument("--gate-type", required=True)
    parser.add_argument("--allowed-decision", required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--model-file", type=Path)
    parser.add_argument(
        "--artifact",
        action="append",
        default=[],
        metavar="NAME=PATH",
        help="Version-bound runtime artifact. Repeat for base, adapter, tokenizer, etc.",
    )
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


def parse_artifacts(values: list[str]) -> dict[str, Path]:
    artifacts: dict[str, Path] = {}
    for value in values:
        name, separator, raw_path = value.partition("=")
        if not separator or not name or not raw_path:
            raise ValueError(f"invalid --artifact value: {value!r}; expected NAME=PATH")
        if name in artifacts:
            raise ValueError(f"duplicate --artifact name: {name}")
        artifacts[name] = Path(raw_path)
    return artifacts


def main() -> int:
    args = parse_args()
    gate = load_object(args.gate)
    problems: list[str] = []

    try:
        requested_artifacts = parse_artifacts(args.artifact)
    except ValueError as exc:
        requested_artifacts = {}
        problems.append(str(exc))

    if gate.get("gate_type") != args.gate_type:
        problems.append(f"gate type is not {args.gate_type}")
    if gate.get("status") != "PASS":
        problems.append("gate status is not PASS")
    if gate.get("decision") != args.allowed_decision:
        problems.append(f"gate decision is not {args.allowed_decision}")

    checks = gate.get("checks")
    if not isinstance(checks, dict) or not checks:
        problems.append("gate checks are absent")
    else:
        for name, passed in checks.items():
            if passed is not True:
                problems.append(f"required check is not true: {name}")

    model = gate.get("model") or {}
    if model.get("id") != args.model_id:
        problems.append("gate model ID does not match requested model")

    checked_artifacts: dict[str, str] = {}
    if requested_artifacts:
        expected_artifacts = model.get("artifacts")
        if not isinstance(expected_artifacts, dict) or not expected_artifacts:
            problems.append("gate model artifacts are absent")
        elif set(requested_artifacts) != set(expected_artifacts):
            problems.append("requested artifact names do not exactly match gate artifacts")

        if not problems:
            for name, path in requested_artifacts.items():
                expected = expected_artifacts.get(name)
                expected_sha = expected.get("sha256") if isinstance(expected, dict) else None
                if not path.is_file():
                    problems.append(f"requested artifact does not exist: {name}")
                    continue
                observed_sha = sha256(path)
                checked_artifacts[name] = observed_sha
                if observed_sha != expected_sha:
                    problems.append(f"requested artifact SHA-256 does not match gate: {name}")
    elif args.model_file is not None:
        expected_sha = model.get("merged_model_sha256")
        if not problems:
            if not args.model_file.is_file():
                problems.append("requested model file does not exist")
            elif sha256(args.model_file) != expected_sha:
                problems.append("requested model SHA-256 does not match gate")
    else:
        problems.append("either --model-file or at least one --artifact is required")

    result = {
        "allowed": not problems,
        "gate_type": args.gate_type,
        "model_id": args.model_id,
        "model_file": str(args.model_file) if args.model_file else None,
        "artifacts": checked_artifacts,
        "problems": problems,
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())

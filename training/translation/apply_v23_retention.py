#!/usr/bin/env python3
"""Prune v23 model weights according to the locked promotion decision.

Compact scientific evidence (predictions, metrics, manifests, analyses, and logs)
is never removed. Checkpoints are always disposable. A selected adapter and
merged model survive only when the preregistered promotion gate passes.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models-root", type=Path, required=True)
    parser.add_argument("--seed-selection", type=Path, required=True)
    parser.add_argument("--promotion-gate", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete the planned directories. Without this flag, emit a dry-run ledger.",
    )
    return parser.parse_args()


def load_object(path: Path) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return document


def directory_stats(path: Path) -> dict[str, int]:
    files = [item for item in path.rglob("*") if item.is_file()]
    return {
        "files": len(files),
        "bytes": sum(item.stat().st_size for item in files),
    }


def safe_child(root: Path, *parts: str) -> Path:
    candidate = root.joinpath(*parts).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ValueError(f"retention target escapes models root: {candidate}") from error
    return candidate


def candidate_labels(selection: dict[str, Any]) -> list[str]:
    candidates = selection.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("seed selection has no candidates")
    labels: list[str] = []
    for candidate in candidates:
        label = candidate.get("label") if isinstance(candidate, dict) else None
        if not isinstance(label, str) or not label or label in labels:
            raise ValueError(f"invalid or duplicate candidate label: {label!r}")
        labels.append(label)
    return labels


def atomic_write_json(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(document, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def main() -> int:
    args = parse_args()
    root = args.models_root.resolve()
    if not root.is_dir():
        raise ValueError(f"models root is not a directory: {root}")

    selection = load_object(args.seed_selection)
    gate = load_object(args.promotion_gate)
    labels = candidate_labels(selection)
    selected = selection.get("selected", {}).get("label")
    status = gate.get("status")
    if selected not in labels:
        raise ValueError(f"selected label is not a candidate: {selected!r}")
    if gate.get("selected_seed") != selected:
        raise ValueError("promotion gate and seed selection disagree on the selected seed")
    if status not in {"PASS", "FAIL"}:
        raise ValueError(f"promotion gate status must be PASS or FAIL, observed {status!r}")

    deletions: list[dict[str, Any]] = []
    retained_weight_dirs: list[str] = []
    for label in labels:
        model_dir = safe_child(root, label)
        if not model_dir.is_dir():
            raise ValueError(f"candidate model directory is missing: {model_dir}")

        targets: list[tuple[Path, str]] = []
        for checkpoint in sorted(model_dir.glob("checkpoint-*")):
            if checkpoint.is_dir():
                targets.append((safe_child(root, label, checkpoint.name), "checkpoint_always_disposable"))
        runs = safe_child(root, label, "runs")
        if runs.is_dir():
            targets.append((runs, "trainer_runtime_cache"))

        keep_selected_weights = status == "PASS" and label == selected
        for name in ("adapter", "merged"):
            path = safe_child(root, label, name)
            if keep_selected_weights:
                if not path.is_dir():
                    raise ValueError(f"promoted weight directory is missing: {path}")
                retained_weight_dirs.append(str(path.relative_to(root)))
            elif path.is_dir():
                reason = "gate_failed" if status == "FAIL" else "unselected_candidate"
                targets.append((path, reason))

        seen: set[Path] = set()
        for path, reason in targets:
            if path in seen:
                continue
            seen.add(path)
            stats = directory_stats(path)
            deletions.append(
                {
                    "path": str(path.relative_to(root)),
                    "reason": reason,
                    **stats,
                }
            )

    if args.apply:
        for record in deletions:
            shutil.rmtree(safe_child(root, record["path"]))
        remaining = [record["path"] for record in deletions if safe_child(root, record["path"]).exists()]
        if remaining:
            raise RuntimeError(f"retention deletion verification failed: {remaining}")

    ledger = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "mode": "APPLIED" if args.apply else "DRY_RUN",
        "promotion_status": status,
        "selected_seed": selected,
        "policy": {
            "compact_scientific_evidence": "preserve",
            "checkpoints": "delete_always",
            "unselected_model_weights": "delete_always",
            "selected_model_weights": "retain_only_when_promotion_status_is_PASS",
        },
        "deleted_or_planned": deletions,
        "retained_weight_dirs": retained_weight_dirs,
        "summary": {
            "directories": len(deletions),
            "files": sum(record["files"] for record in deletions),
            "bytes": sum(record["bytes"] for record in deletions),
        },
    }
    atomic_write_json(args.output, ledger)
    print(json.dumps(ledger, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

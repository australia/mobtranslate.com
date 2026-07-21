#!/usr/bin/env python3
"""Open the checksum-bound Listuguj lesson test into task-separated evaluations."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any, Iterable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sealed-file", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--expected-rows", type=int, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"invalid JSON at {path}:{line_number}: {error}"
                ) from error
            if not isinstance(row, dict):
                raise ValueError(f"non-object JSON at {path}:{line_number}")
            rows.append(row)
    return rows


def normalized_space(value: Any) -> str:
    return " ".join(str(value or "").split())


def validate_and_materialize(
    rows: list[dict[str, Any]], *, expected_rows: int
) -> dict[str, list[dict[str, Any]]]:
    if len(rows) != expected_rows:
        raise ValueError(f"sealed row count changed: {len(rows)} != {expected_rows}")
    ids = [str(row.get("id") or "") for row in rows]
    if any(not row_id for row_id in ids) or len(set(ids)) != len(ids):
        raise ValueError("sealed IDs are blank or non-unique")

    materialized: dict[str, list[dict[str, Any]]] = {
        "translate": [],
        "lexeme": [],
    }
    for row in rows:
        row_id = str(row["id"])
        if row.get("split") != "test":
            raise ValueError(f"non-test row in sealed file: {row_id}")
        if row.get("direction") != "eng-mic":
            raise ValueError(f"wrong direction in sealed file: {row_id}")
        task = str(row.get("task") or "")
        if task not in materialized:
            raise ValueError(f"unsupported task {task!r}: {row_id}")
        expected_prefix = "<translate>" if task == "translate" else "<lexeme>"
        if row.get("task_prefix") != expected_prefix:
            raise ValueError(f"task prefix mismatch: {row_id}")

        source = normalized_space(row.get("unconditioned_input_text"))
        target = normalized_space(row.get("output_text"))
        translation = row.get("translation") or {}
        if not source or not target:
            raise ValueError(f"blank model-facing side: {row_id}")
        if normalized_space(translation.get("eng_Latn")) != source:
            raise ValueError(f"English translation field mismatch: {row_id}")
        if normalized_space(translation.get("mic_Latn")) != target:
            raise ValueError(f"Mi'kmaq translation field mismatch: {row_id}")

        opened = dict(row)
        opened["source_task_input_text"] = row.get("input_text")
        opened["input_text"] = source
        opened["unconditioned_input_text"] = source
        opened["output_text"] = target
        opened["sealed_evaluation_input_contract"] = (
            "plain English input; task prefix removed before inference"
        )
        materialized[task].append(opened)

    if not materialized["translate"]:
        raise ValueError("sealed split contains no sentence-translation rows")
    return materialized


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("x", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            count += 1
    return count


def write_json(path: Path, value: Any) -> None:
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def main() -> None:
    args = parse_args()
    sealed_file = args.sealed_file.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not sealed_file.is_file():
        raise FileNotFoundError(sealed_file)
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    if sha256(sealed_file) != args.expected_sha256:
        raise ValueError("sealed file SHA-256 changed")

    rows = read_jsonl(sealed_file)
    materialized = validate_and_materialize(rows, expected_rows=args.expected_rows)
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=f".{output_dir.name}.", dir=output_dir.parent
    ) as temporary_name:
        staging = Path(temporary_name)
        sentence_path = staging / "sentence-unprefixed.eng-mic.jsonl"
        lexeme_path = staging / "lexeme-plain.eng-mic.jsonl"
        write_jsonl(sentence_path, materialized["translate"])
        write_jsonl(lexeme_path, materialized["lexeme"])
        manifest = {
            "schema_version": 1,
            "operation": "materialize_migmaq_sealed_lessons",
            "opened_at": datetime.now(timezone.utc).isoformat(),
            "input": {
                "path": str(sealed_file),
                "sha256": args.expected_sha256,
                "rows": len(rows),
                "split": "test",
            },
            "input_contract": (
                "Use unconditioned_input_text as input_text for both strata; "
                "score translate and lexeme rows separately."
            ),
            "counts": {
                "task": dict(sorted(Counter(str(row["task"]) for row in rows).items())),
                "container_kind": dict(
                    sorted(
                        Counter(str(row.get("container_kind")) for row in rows).items()
                    )
                ),
                "lesson": len({str(row.get("lesson_id")) for row in rows}),
                "component": len({str(row.get("split_component_id")) for row in rows}),
            },
            "outputs": {
                "sentence-unprefixed.eng-mic.jsonl": {
                    "rows": len(materialized["translate"]),
                    "sha256": sha256(sentence_path),
                },
                "lexeme-plain.eng-mic.jsonl": {
                    "rows": len(materialized["lexeme"]),
                    "sha256": sha256(lexeme_path),
                },
            },
        }
        manifest_path = staging / "manifest.json"
        write_json(manifest_path, manifest)
        checksum_path = staging / "SHA256SUMS"
        with checksum_path.open("x", encoding="utf-8") as handle:
            for path in sorted((sentence_path, lexeme_path, manifest_path)):
                handle.write(f"{sha256(path)}  {path.name}\n")
        staging.rename(output_dir)

    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

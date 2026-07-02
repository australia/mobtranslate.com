#!/usr/bin/env python3
"""Build task-tagged direct/reference Bible MT JSONL files."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_SOURCE_TRAIN = "v8_2048row/train.eng-gvn.jsonl"
DEFAULT_SOURCE_EVAL_TRAIN = "v8_2048row/eval_train.eng-gvn.jsonl"
DEFAULT_SOURCE_HELDOUT = "heldout_clean_064.eng-gvn.jsonl"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--source-train", default=DEFAULT_SOURCE_TRAIN)
    parser.add_argument("--source-eval-train", default=DEFAULT_SOURCE_EVAL_TRAIN)
    parser.add_argument("--source-heldout", default=DEFAULT_SOURCE_HELDOUT)
    parser.add_argument("--direct-template", default="<translate> {input_text}")
    parser.add_argument("--reference-template", default="<bible_ref> {canonical_ref} <eng> {input_text}")
    parser.add_argument("--manifest-name", default="tagged_multitask_manifest.json")
    return parser.parse_args()


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


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


def base_input(row: dict[str, Any]) -> str:
    text = normalize_text(row.get("unconditioned_input_text"))
    if text:
        return text
    raise ValueError(f"missing unconditioned_input_text for row {row.get('id', '<unknown>')}")


def make_task_row(row: dict[str, Any], task: str, template: str) -> dict[str, Any]:
    canonical_ref = normalize_text(row.get("canonical_ref"))
    input_text = base_input(row)
    if task == "bible_ref" and not canonical_ref:
        raise ValueError(f"missing canonical_ref for row {row.get('id', '<unknown>')}")

    tagged = dict(row)
    tagged["id"] = f"{row.get('id', '<unknown>')}:{task}"
    tagged["unconditioned_input_text"] = input_text
    tagged["input_text"] = normalize_text(
        template.format(
            canonical_ref=canonical_ref,
            input_text=input_text,
            id=normalize_text(row.get("id")),
        )
    )
    tagged["task_tagging"] = {
        "enabled": True,
        "task": task,
        "template": template,
        "canonical_ref": canonical_ref or None,
    }
    tagged["reference_conditioning"] = {
        "enabled": task == "bible_ref",
        "template": template if task == "bible_ref" else None,
        "canonical_ref": canonical_ref or None,
    }
    return tagged


def build_pair_rows(
    rows: list[dict[str, Any]],
    direct_template: str,
    reference_template: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    direct_rows: list[dict[str, Any]] = []
    reference_rows: list[dict[str, Any]] = []
    mixed_rows: list[dict[str, Any]] = []
    for row in rows:
        direct = make_task_row(row, "translate", direct_template)
        reference = make_task_row(row, "bible_ref", reference_template)
        direct_rows.append(direct)
        reference_rows.append(reference)
        mixed_rows.extend([direct, reference])
    return mixed_rows, direct_rows, reference_rows


def write_split(
    *,
    input_dir: Path,
    output_dir: Path,
    source_relative: str,
    mixed_relative: str,
    direct_relative: str,
    reference_relative: str,
    direct_template: str,
    reference_template: str,
) -> dict[str, Any]:
    source_file = input_dir / source_relative
    source_rows = read_jsonl(source_file)
    mixed_rows, direct_rows, reference_rows = build_pair_rows(
        source_rows,
        direct_template,
        reference_template,
    )

    outputs = [
        (mixed_relative, mixed_rows),
        (direct_relative, direct_rows),
        (reference_relative, reference_rows),
    ]
    output_records = []
    for relative, rows in outputs:
        output_file = output_dir / relative
        write_jsonl(output_file, rows)
        output_records.append(
            {
                "path": relative,
                "rows": len(rows),
                "sha256": sha256_file(output_file),
            }
        )

    return {
        "source_path": source_relative,
        "source_rows": len(source_rows),
        "source_sha256": sha256_file(source_file),
        "outputs": output_records,
    }


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "created_at": "2026-07-01",
        "purpose": "Tagged multi-task Bible MT dataset with direct and reference-conditioned source views.",
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "direct_template": args.direct_template,
        "reference_template": args.reference_template,
        "splits": [],
    }
    source_manifest = input_dir / "manifest.json"
    if source_manifest.exists():
        manifest["source_manifest_sha256"] = sha256_file(source_manifest)

    manifest["splits"].append(
        write_split(
            input_dir=input_dir,
            output_dir=output_dir,
            source_relative=args.source_train,
            mixed_relative="v8_2048row/train.eng-gvn.jsonl",
            direct_relative="v8_2048row/train_direct.eng-gvn.jsonl",
            reference_relative="v8_2048row/train_ref.eng-gvn.jsonl",
            direct_template=args.direct_template,
            reference_template=args.reference_template,
        )
    )
    manifest["splits"].append(
        write_split(
            input_dir=input_dir,
            output_dir=output_dir,
            source_relative=args.source_eval_train,
            mixed_relative="v8_2048row/eval_train.eng-gvn.jsonl",
            direct_relative="v8_2048row/eval_train_direct.eng-gvn.jsonl",
            reference_relative="v8_2048row/eval_train_ref.eng-gvn.jsonl",
            direct_template=args.direct_template,
            reference_template=args.reference_template,
        )
    )
    manifest["splits"].append(
        write_split(
            input_dir=input_dir,
            output_dir=output_dir,
            source_relative=args.source_heldout,
            mixed_relative="heldout_multitask_650.eng-gvn.jsonl",
            direct_relative="heldout_direct_325.eng-gvn.jsonl",
            reference_relative="heldout_ref_325.eng-gvn.jsonl",
            direct_template=args.direct_template,
            reference_template=args.reference_template,
        )
    )

    manifest_file = output_dir / args.manifest_name
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build a deterministic joint lexeme/sentence replay dataset."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import unicodedata
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexeme-file", type=Path, required=True)
    parser.add_argument("--sentence-file", type=Path, required=True)
    parser.add_argument("--sentence-validation-file", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--lexeme-repetitions", type=int, default=13)
    parser.add_argument("--sentence-repetitions", type=int, default=2)
    parser.add_argument("--monitor-rows-per-task", type=int, default=64)
    parser.add_argument("--exclude-pair-kind", action="append")
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--seed", default="v24.2-joint-replay-2026-07-15")
    parser.add_argument("--dataset-id", default="v24.2-joint-lexeme-sentence-replay")
    parser.add_argument("--row-id-prefix", default="v24.2")
    parser.add_argument("--checksum-filename", default="SHA256SUMS.v24.2")
    parser.add_argument(
        "--purpose",
        default="Test whether explicit lexical reconstruction can coexist with sentence retention.",
    )
    return parser.parse_args()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).casefold().split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_digest(seed: str, value: str) -> str:
    return hashlib.sha256(f"{seed}:{value}".encode()).hexdigest()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            missing = [field for field in ("id", "input_text", "output_text", "direction") if not row.get(field)]
            if missing:
                raise ValueError(f"missing {missing} at {path}:{line_number}")
            rows.append(row)
    if not rows:
        raise ValueError(f"empty input: {path}")
    ids = [str(row["id"]) for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError(f"duplicate row IDs in {path}")
    return rows


def source_key(row: dict[str, Any]) -> str:
    return normalize(row.get("unconditioned_input_text") or row["input_text"])


def target_key(row: dict[str, Any]) -> str:
    return normalize(row["output_text"])


def compact_row(
    row: dict[str, Any],
    *,
    task_family: str,
    source_dataset: str,
    replica_index: int,
    split_role: str,
    training_overlap: bool,
    args: argparse.Namespace,
) -> dict[str, Any]:
    source_id = str(row["id"])
    output_id = stable_digest(
        args.seed,
        f"{split_role}:{task_family}:{replica_index}:{source_dataset}:{source_id}",
    )[:24]
    return {
        "id": f"{args.row_id_prefix}:{split_role}:{task_family}:{output_id}",
        "input_text": str(row["input_text"]),
        "output_text": str(row["output_text"]),
        "direction": args.direction,
        "source_lang": args.source_lang,
        "target_lang": args.target_lang,
        "pair_kind": "dictionary_lexeme" if task_family == "lexeme" else str(row.get("pair_kind") or "sentence"),
        "split": "train" if split_role == "train" else "validation",
        "joint_replay": {
            "task_family": task_family,
            "source_dataset": source_dataset,
            "source_id": source_id,
            "source_pair_kind": str(row.get("pair_kind") or "unknown"),
            "source_split": str(row.get("split") or "unknown"),
            "replica_index": replica_index,
            "split_role": split_role,
            "training_overlap": training_overlap,
        },
    }


def stable_sample(rows: list[dict[str, Any]], count: int, seed: str) -> list[dict[str, Any]]:
    if count > len(rows):
        raise ValueError(f"cannot sample {count} rows from {len(rows)}")
    return sorted(rows, key=lambda row: stable_digest(seed, str(row["id"])))[:count]


def write_jsonl_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.chmod(0o664)
    temporary.replace(path)


def write_json_atomic(path: Path, value: Any) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.chmod(0o664)
    temporary.replace(path)


def build(args: argparse.Namespace) -> dict[str, Any]:
    if min(args.lexeme_repetitions, args.sentence_repetitions, args.monitor_rows_per_task) < 1:
        raise ValueError("repetition and monitor counts must be positive")
    for path in (args.lexeme_file, args.sentence_file, args.sentence_validation_file):
        if not path.is_file():
            raise FileNotFoundError(path)

    lexemes = [row for row in load_jsonl(args.lexeme_file) if row["direction"] == args.direction]
    sentence_source = [row for row in load_jsonl(args.sentence_file) if row["direction"] == args.direction]
    sentence_validation = [
        row for row in load_jsonl(args.sentence_validation_file) if row["direction"] == args.direction
    ]
    excluded_pair_kinds = set(args.exclude_pair_kind or ["verse"])
    sentences = [row for row in sentence_source if str(row.get("pair_kind")) not in excluded_pair_kinds]
    excluded_sentences = len(sentence_source) - len(sentences)
    if not lexemes or not sentences or not sentence_validation:
        raise ValueError("filtering left an empty task or validation source")

    sentence_source_overlap = {source_key(row) for row in sentences} & {
        source_key(row) for row in sentence_validation
    }
    sentence_target_overlap = {target_key(row) for row in sentences} & {
        target_key(row) for row in sentence_validation
    }
    if sentence_source_overlap or sentence_target_overlap:
        raise ValueError(
            "sentence train/validation leakage: "
            f"source={len(sentence_source_overlap)}, target_surface={len(sentence_target_overlap)}"
        )

    train_rows: list[dict[str, Any]] = []
    for replica in range(args.lexeme_repetitions):
        train_rows.extend(
            compact_row(
                row,
                task_family="lexeme",
                source_dataset="v24.1_C2724",
                replica_index=replica,
                split_role="train",
                training_overlap=True,
                args=args,
            )
            for row in lexemes
        )
    for replica in range(args.sentence_repetitions):
        train_rows.extend(
            compact_row(
                row,
                task_family="sentence",
                source_dataset="v21.2_non_bible_train",
                replica_index=replica,
                split_role="train",
                training_overlap=True,
                args=args,
            )
            for row in sentences
        )
    train_rows.sort(key=lambda row: stable_digest(args.seed, str(row["id"])))

    monitor_rows: list[dict[str, Any]] = []
    monitor_rows.extend(
        compact_row(
            row,
            task_family="lexeme",
            source_dataset="v24.1_C2724",
            replica_index=0,
            split_role="monitor",
            training_overlap=True,
            args=args,
        )
        for row in stable_sample(lexemes, args.monitor_rows_per_task, f"{args.seed}:lexeme-monitor")
    )
    monitor_rows.extend(
        compact_row(
            row,
            task_family="sentence",
            source_dataset="v21.2_validation",
            replica_index=0,
            split_role="monitor",
            training_overlap=False,
            args=args,
        )
        for row in stable_sample(
            sentence_validation,
            args.monitor_rows_per_task,
            f"{args.seed}:sentence-monitor",
        )
    )
    monitor_rows.sort(key=lambda row: stable_digest(args.seed, str(row["id"])))

    train_ids = [row["id"] for row in train_rows]
    monitor_ids = [row["id"] for row in monitor_rows]
    if len(train_ids) != len(set(train_ids)) or len(monitor_ids) != len(set(monitor_ids)):
        raise ValueError("generated IDs are not unique")

    args.output_dir.mkdir(parents=True, exist_ok=False)
    train_path = args.output_dir / "train.eng-gvn.jsonl"
    monitor_path = args.output_dir / "validation.eng-gvn.jsonl"
    manifest_path = args.output_dir / "MANIFEST.json"
    write_jsonl_atomic(train_path, train_rows)
    write_jsonl_atomic(monitor_path, monitor_rows)

    lexical_rows = len(lexemes) * args.lexeme_repetitions
    sentence_rows = len(sentences) * args.sentence_repetitions
    manifest = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_id": args.dataset_id,
        "purpose": args.purpose,
        "inputs": {
            "lexeme": {"path": str(args.lexeme_file.resolve()), "rows": len(lexemes), "sha256": sha256(args.lexeme_file)},
            "sentence_train": {
                "path": str(args.sentence_file.resolve()),
                "rows_before_filter": len(sentence_source),
                "eligible_rows": len(sentences),
                "excluded_rows": excluded_sentences,
                "excluded_pair_kinds": sorted(excluded_pair_kinds),
                "sha256": sha256(args.sentence_file),
            },
            "sentence_validation": {
                "path": str(args.sentence_validation_file.resolve()),
                "rows": len(sentence_validation),
                "sha256": sha256(args.sentence_validation_file),
            },
        },
        "mixture": {
            "lexeme_unique_rows": len(lexemes),
            "lexeme_repetitions": args.lexeme_repetitions,
            "lexeme_presentations": lexical_rows,
            "sentence_unique_rows": len(sentences),
            "sentence_repetitions": args.sentence_repetitions,
            "sentence_presentations": sentence_rows,
            "train_rows": len(train_rows),
            "lexeme_row_fraction": lexical_rows / len(train_rows),
            "sentence_row_fraction": sentence_rows / len(train_rows),
            "bible_rows": 0,
        },
        "monitor": {
            "rows": len(monitor_rows),
            "rows_per_task": args.monitor_rows_per_task,
            "lexeme_overlap_with_training": args.monitor_rows_per_task,
            "sentence_overlap_with_training": 0,
            "interpretation": "Optimization diagnostic only; lexical half overlaps training by design.",
        },
        "leakage_audit": {
            "sentence_train_validation_source_overlap": 0,
            "sentence_train_validation_target_surface_overlap": 0,
        },
        "contracts": {
            "closed_set_lexical_reconstruction": True,
            "sentence_translation_claim": False,
            "speaker_or_community_approval": False,
            "deployment_authorized": False,
            "bible_positive_objective": False,
        },
        "outputs": {},
        "seed": args.seed,
    }
    manifest["outputs"] = {
        "train": {"path": str(train_path.resolve()), "rows": len(train_rows), "sha256": sha256(train_path)},
        "validation": {
            "path": str(monitor_path.resolve()),
            "rows": len(monitor_rows),
            "sha256": sha256(monitor_path),
        },
    }
    write_json_atomic(manifest_path, manifest)
    checksum_path = args.output_dir / args.checksum_filename
    checksum_path.write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in (manifest_path, train_path, monitor_path)),
        encoding="utf-8",
    )
    checksum_path.chmod(0o664)
    return manifest


def main() -> None:
    manifest = build(parse_args())
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

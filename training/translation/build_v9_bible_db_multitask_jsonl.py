#!/usr/bin/env python3
"""Build v9.8 Bible + DB usage-example tagged MT JSONL files."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any


DEFAULT_BIBLE_DIR = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/prepared/v9.7-tagged-direct-plus-reference-bible"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bible-dir", default=DEFAULT_BIBLE_DIR)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--language-code", default="kuku_yalanji")
    parser.add_argument("--seed", default="v9.8-db-usage-split-2026-07-01")
    parser.add_argument("--holdout-ratio", type=float, default=0.20)
    parser.add_argument("--db-oversample", type=int, default=4)
    parser.add_argument("--validation-bible-rows", type=int, default=64)
    parser.add_argument("--validation-db-rows", type=int, default=64)
    parser.add_argument("--usage-template", default="<usage_example> {input_text}")
    parser.add_argument("--manifest-name", default="tagged_bible_db_manifest.json")
    return parser.parse_args()


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_key(seed: str, value: str) -> str:
    return sha256_text(f"{seed}\t{value}")


def stable_sort(rows: list[dict[str, Any]], seed: str) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: stable_key(seed, str(row.get("id", ""))))


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


def export_usage_examples(database_url: str, language_code: str) -> list[dict[str, Any]]:
    if not database_url:
        raise SystemExit("DATABASE_URL is required via --database-url or environment")

    language_literal = "'" + language_code.replace("'", "''") + "'"
    sql = f"""
  select jsonb_build_object(
    'id', ue.id::text,
    'word_id', w.id::text,
    'definition_id', ue.definition_id::text,
    'word', w.word,
    'normalized_word', w.normalized_word,
    'example_text', ue.example_text,
    'translation', ue.translation,
    'context', ue.context,
    'source', ue.source,
    'notes', ue.notes,
    'word_type', w.word_type,
    'semantic_domain', w.semantic_domain,
    'dialect', w.dialect,
    'entry_source', w.entry_source,
    'is_verified', w.is_verified,
    'quality_score', w.quality_score,
    'created_at', ue.created_at
  )::text
  from public.usage_examples ue
  join public.words w on w.id = ue.word_id
  join public.languages l on l.id = w.language_id
  where l.code = {language_literal}
    and nullif(btrim(ue.example_text), '') is not null
    and nullif(btrim(ue.translation), '') is not null
    and not coalesce(w.sensitive_content, false)
    and not coalesce(w.obsolete, false)
  order by w.word, ue.id;
"""
    result = subprocess.run(
        ["psql", database_url, "-v", "ON_ERROR_STOP=1", "-Atc", sql],
        check=True,
        text=True,
        capture_output=True,
    )
    rows = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    if not rows:
        raise SystemExit(f"no usage examples exported for {language_code}")
    return rows


def split_by_word(
    rows: list[dict[str, Any]],
    *,
    seed: str,
    holdout_ratio: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    word_ids = sorted({str(row["word_id"]) for row in rows}, key=lambda word_id: stable_key(seed, word_id))
    holdout_count = max(1, round(len(word_ids) * holdout_ratio))
    holdout_word_ids = set(word_ids[:holdout_count])
    train = [row for row in rows if str(row["word_id"]) not in holdout_word_ids]
    heldout = [row for row in rows if str(row["word_id"]) in holdout_word_ids]
    metadata = {
        "seed": seed,
        "holdout_ratio": holdout_ratio,
        "word_count": len(word_ids),
        "holdout_word_count": len(holdout_word_ids),
        "train_word_count": len(word_ids) - len(holdout_word_ids),
        "train_rows": len(train),
        "heldout_rows": len(heldout),
    }
    return stable_sort(train, seed + ":train"), stable_sort(heldout, seed + ":heldout"), metadata


def make_usage_task_row(row: dict[str, Any], template: str) -> dict[str, Any]:
    source = normalize_text(row["translation"])
    target = normalize_text(row["example_text"])
    if not source or not target:
        raise ValueError(f"empty usage pair for {row.get('id')}")
    return {
        "id": f"db-usage:{row['id']}",
        "direction": "eng-gvn",
        "input_text": normalize_text(template.format(input_text=source, word=normalize_text(row.get("word")))),
        "output_text": target,
        "unconditioned_input_text": source,
        "canonical_ref": None,
        "pair_kind": "usage_example",
        "task_tagging": {
            "enabled": True,
            "task": "usage_example",
            "template": template,
        },
        "db_usage_example": {
            "example_id": row["id"],
            "word_id": row["word_id"],
            "word": row.get("word"),
            "normalized_word": row.get("normalized_word"),
            "context": row.get("context"),
            "source": row.get("source"),
            "word_type": row.get("word_type"),
            "semantic_domain": row.get("semantic_domain"),
            "dialect": row.get("dialect"),
            "entry_source": row.get("entry_source"),
            "is_verified": row.get("is_verified"),
            "quality_score": row.get("quality_score"),
        },
    }


def oversample(rows: list[dict[str, Any]], times: int) -> list[dict[str, Any]]:
    if times < 1:
        raise ValueError("--db-oversample must be >= 1")
    out: list[dict[str, Any]] = []
    for copy_index in range(times):
        for row in rows:
            copied = dict(row)
            copied["id"] = f"{row['id']}:os{copy_index + 1}"
            copied["oversample"] = {
                "source_id": row["id"],
                "copy_index": copy_index + 1,
                "copies": times,
            }
            out.append(copied)
    return out


def sample(rows: list[dict[str, Any]], count: int, seed: str) -> list[dict[str, Any]]:
    return stable_sort(rows, seed)[: min(count, len(rows))]


def record_file(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(root)),
        "rows": sum(1 for line in path.open(encoding="utf-8") if line.strip()),
        "sha256": sha256_file(path),
    }


def main() -> None:
    args = parse_args()
    bible_dir = Path(args.bible_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    bible_train = read_jsonl(bible_dir / "v8_2048row/train.eng-gvn.jsonl")
    bible_eval_train = read_jsonl(bible_dir / "v8_2048row/eval_train.eng-gvn.jsonl")
    bible_train_direct = read_jsonl(bible_dir / "v8_2048row/eval_train_direct.eng-gvn.jsonl")
    bible_train_ref = read_jsonl(bible_dir / "v8_2048row/eval_train_ref.eng-gvn.jsonl")
    bible_heldout_direct = read_jsonl(bible_dir / "heldout_direct_325.eng-gvn.jsonl")
    bible_heldout_ref = read_jsonl(bible_dir / "heldout_ref_325.eng-gvn.jsonl")

    usage_raw = export_usage_examples(args.database_url, args.language_code)
    usage_train_raw, usage_heldout_raw, split_metadata = split_by_word(
        usage_raw,
        seed=args.seed,
        holdout_ratio=args.holdout_ratio,
    )
    usage_train = [make_usage_task_row(row, args.usage_template) for row in usage_train_raw]
    usage_heldout = [make_usage_task_row(row, args.usage_template) for row in usage_heldout_raw]
    usage_train_oversampled = oversample(usage_train, args.db_oversample)

    train_mixed = stable_sort(bible_train + usage_train_oversampled, args.seed + ":train-mixed")
    eval_train_raw = stable_sort(bible_eval_train + usage_train, args.seed + ":eval-train")
    validation = stable_sort(
        sample(bible_eval_train, args.validation_bible_rows, args.seed + ":validation-bible")
        + sample(usage_train, args.validation_db_rows, args.seed + ":validation-db"),
        args.seed + ":validation-mixed",
    )
    heldout_all = stable_sort(bible_heldout_direct + bible_heldout_ref + usage_heldout, args.seed + ":heldout-all")

    files: list[Path] = []
    file_rows = [
        ("train.eng-gvn.jsonl", train_mixed),
        ("eval_train.eng-gvn.jsonl", eval_train_raw),
        ("validation.eng-gvn.jsonl", validation),
        ("bible/eval_train_direct.eng-gvn.jsonl", bible_train_direct),
        ("bible/eval_train_ref.eng-gvn.jsonl", bible_train_ref),
        ("bible/heldout_direct_325.eng-gvn.jsonl", bible_heldout_direct),
        ("bible/heldout_ref_325.eng-gvn.jsonl", bible_heldout_ref),
        ("db_usage/all_usage_examples.eng-gvn.jsonl", [make_usage_task_row(row, args.usage_template) for row in usage_raw]),
        ("db_usage/train_usage.eng-gvn.jsonl", usage_train),
        ("db_usage/train_usage_oversampled.eng-gvn.jsonl", usage_train_oversampled),
        ("db_usage/heldout_usage.eng-gvn.jsonl", usage_heldout),
        ("heldout_all.eng-gvn.jsonl", heldout_all),
    ]
    for relative, rows in file_rows:
        path = output_dir / relative
        write_jsonl(path, rows)
        files.append(path)

    manifest = {
        "created_at": "2026-07-01",
        "purpose": "Tagged Bible direct/reference plus DB usage-example MT dataset.",
        "bible_dir": str(bible_dir),
        "output_dir": str(output_dir),
        "language_code": args.language_code,
        "usage_template": args.usage_template,
        "db_split": split_metadata,
        "db_oversample": args.db_oversample,
        "validation_bible_rows": args.validation_bible_rows,
        "validation_db_rows": args.validation_db_rows,
        "input_counts": {
            "bible_train_tagged_rows": len(bible_train),
            "bible_eval_train_tagged_rows": len(bible_eval_train),
            "bible_heldout_direct_rows": len(bible_heldout_direct),
            "bible_heldout_ref_rows": len(bible_heldout_ref),
            "db_usage_raw_rows": len(usage_raw),
        },
        "outputs": [record_file(path, output_dir) for path in files],
    }

    manifest_file = output_dir / args.manifest_name
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    checksum_file = output_dir / "SHA256SUMS"
    with checksum_file.open("w", encoding="utf-8") as handle:
        for path in sorted(files + [manifest_file]):
            handle.write(f"{sha256_file(path)}  {path.relative_to(output_dir)}\n")

    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

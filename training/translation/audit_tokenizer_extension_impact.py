#!/usr/bin/env python3
"""Audit a tokenizer extension on declared train and held-out bilingual corpora."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-tokenizer", type=Path, required=True)
    parser.add_argument("--candidate-tokenizer", type=Path, required=True)
    parser.add_argument("--corpus", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--task-field", default="pair_kind")
    parser.add_argument("--exclude-task", action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--row-output", type=Path, required=True)
    parser.add_argument("--top-new-pieces", type=int, default=100)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_labeled_paths(values: list[str]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for value in values:
        label, separator, raw_path = value.partition("=")
        label = label.strip()
        path = Path(raw_path).expanduser().resolve()
        if not separator or not label or not raw_path.strip():
            raise ValueError(f"invalid corpus {value!r}; expected LABEL=PATH")
        if label in result:
            raise ValueError(f"duplicate corpus label: {label}")
        if not path.is_file():
            raise FileNotFoundError(path)
        result[label] = path
    return result


def percentile(values: list[int], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = round((len(ordered) - 1) * fraction)
    return float(ordered[index])


def normalized_whitespace(value: str) -> str:
    return " ".join(value.split())


def text_views(row: dict[str, Any]) -> Iterable[tuple[str, str, int]]:
    conditioned = str(row.get("input_text") or "").strip()
    if conditioned:
        yield "source_conditioned", conditioned, 0
    unconditioned = str(row.get("unconditioned_input_text") or "").strip()
    if unconditioned:
        yield "source_unconditioned", unconditioned, 0
    selected = str(row.get("output_text") or row.get("reference") or "").strip()
    if selected:
        yield "target_selected", selected, 0
    references = [str(value).strip() for value in row.get("accepted_references") or [] if str(value).strip()]
    if not references and selected:
        references = [selected]
    for index, reference in enumerate(dict.fromkeys(references)):
        yield "target_all_references", reference, index


def summarize(records: list[dict[str, Any]], top_new_pieces: int) -> dict[str, Any]:
    base_counts = [int(record["base_token_count"]) for record in records]
    candidate_counts = [int(record["candidate_token_count"]) for record in records]
    whitespace_units = sum(int(record["whitespace_units"]) for record in records)
    base_total = sum(base_counts)
    candidate_total = sum(candidate_counts)
    new_piece_counts: Counter[str] = Counter()
    for record in records:
        new_piece_counts.update(record["new_candidate_pieces"])
    return {
        "observations": len(records),
        "unique_rows": len({record["row_id"] for record in records}),
        "whitespace_units": whitespace_units,
        "base_tokens": base_total,
        "candidate_tokens": candidate_total,
        "base_tokens_per_whitespace_unit": base_total / whitespace_units if whitespace_units else None,
        "candidate_tokens_per_whitespace_unit": candidate_total / whitespace_units if whitespace_units else None,
        "relative_token_change": (
            (candidate_total - base_total) / base_total if base_total else None
        ),
        "base_token_count_median": statistics.median(base_counts) if base_counts else None,
        "candidate_token_count_median": statistics.median(candidate_counts) if candidate_counts else None,
        "base_token_count_p90": percentile(base_counts, 0.90),
        "candidate_token_count_p90": percentile(candidate_counts, 0.90),
        "base_token_count_p99": percentile(base_counts, 0.99),
        "candidate_token_count_p99": percentile(candidate_counts, 0.99),
        "tokenization_changed_rows": sum(bool(record["tokenization_changed"]) for record in records),
        "candidate_new_piece_rows": sum(bool(record["new_candidate_pieces"]) for record in records),
        "candidate_unknown_rows": sum(bool(record["candidate_has_unknown"]) for record in records),
        "base_unknown_rows": sum(bool(record["base_has_unknown"]) for record in records),
        "candidate_round_trip_failures": sum(not bool(record["candidate_round_trip_exact"]) for record in records),
        "base_round_trip_failures": sum(not bool(record["base_round_trip_exact"]) for record in records),
        "base_one_token": sum(count == 1 for count in base_counts),
        "candidate_one_token": sum(count == 1 for count in candidate_counts),
        "base_five_plus_tokens": sum(count >= 5 for count in base_counts),
        "candidate_five_plus_tokens": sum(count >= 5 for count in candidate_counts),
        "top_new_candidate_pieces": [
            {"token": token, "occurrences": count}
            for token, count in new_piece_counts.most_common(top_new_pieces)
        ],
    }


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(content)
    temporary.chmod(0o664)
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    if args.top_new_pieces < 1:
        raise SystemExit("--top-new-pieces must be positive")

    from transformers import AutoTokenizer

    corpora = parse_labeled_paths(args.corpus)
    base = AutoTokenizer.from_pretrained(str(args.base_tokenizer), use_fast=False, local_files_only=True)
    candidate = AutoTokenizer.from_pretrained(
        str(args.candidate_tokenizer),
        use_fast=False,
        local_files_only=True,
    )
    base_vocabulary = set(base.get_vocab())
    candidate_vocabulary = set(candidate.get_vocab())
    new_candidate_tokens = candidate_vocabulary - base_vocabulary
    excluded_tasks = set(args.exclude_task)

    records: list[dict[str, Any]] = []
    corpus_counts: dict[str, dict[str, Any]] = {}
    for label, path in corpora.items():
        counts = Counter()
        with path.open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                row = json.loads(line)
                counts["input_rows"] += 1
                if args.direction and row.get("direction") != args.direction:
                    counts["skipped_direction_rows"] += 1
                    continue
                task = str(row.get(args.task_field) or "")
                if task in excluded_tasks:
                    counts["skipped_task_rows"] += 1
                    continue
                row_id = str(row.get("id") or f"{label}:{line_number}")
                counts["accepted_rows"] += 1
                for view, text, variant_index in text_views(row):
                    base_ids = [int(value) for value in base.encode(text, add_special_tokens=False)]
                    candidate_ids = [int(value) for value in candidate.encode(text, add_special_tokens=False)]
                    base_tokens = base.convert_ids_to_tokens(base_ids)
                    candidate_tokens = candidate.convert_ids_to_tokens(candidate_ids)
                    new_pieces = [token for token in candidate_tokens if token in new_candidate_tokens]
                    records.append(
                        {
                            "corpus": label,
                            "source_path": str(path),
                            "source_line": line_number,
                            "row_id": row_id,
                            "task": task,
                            "view": view,
                            "variant_index": variant_index,
                            "text": text,
                            "whitespace_units": max(1, len(text.split())),
                            "base_token_count": len(base_ids),
                            "candidate_token_count": len(candidate_ids),
                            "token_count_delta": len(candidate_ids) - len(base_ids),
                            "tokenization_changed": base_tokens != candidate_tokens,
                            "base_tokens": base_tokens,
                            "candidate_tokens": candidate_tokens,
                            "new_candidate_pieces": new_pieces,
                            "base_has_unknown": base.unk_token_id in base_ids,
                            "candidate_has_unknown": candidate.unk_token_id in candidate_ids,
                            "base_round_trip_exact": normalized_whitespace(
                                base.decode(base_ids, skip_special_tokens=False)
                            ) == normalized_whitespace(text),
                            "candidate_round_trip_exact": normalized_whitespace(
                                candidate.decode(candidate_ids, skip_special_tokens=False)
                            ) == normalized_whitespace(text),
                        }
                    )
        corpus_counts[label] = dict(counts)

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[f"{record['corpus']}::{record['view']}"] .append(record)
    summaries = {
        key: summarize(items, args.top_new_pieces)
        for key, items in sorted(grouped.items())
    }
    source_new_pieces: Counter[str] = Counter()
    target_new_pieces: Counter[str] = Counter()
    for record in records:
        destination = source_new_pieces if record["view"].startswith("source_") else target_new_pieces
        destination.update(record["new_candidate_pieces"])

    result = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operation": "paired_tokenizer_extension_impact_audit",
        "base_tokenizer": str(args.base_tokenizer.resolve()),
        "candidate_tokenizer": str(args.candidate_tokenizer.resolve()),
        "direction": args.direction,
        "task_field": args.task_field,
        "excluded_tasks": sorted(excluded_tasks),
        "base_vocabulary_size": len(base_vocabulary),
        "candidate_vocabulary_size": len(candidate_vocabulary),
        "new_candidate_token_count": len(new_candidate_tokens),
        "new_candidate_tokens_used_on_source": [
            {"token": token, "occurrences": count}
            for token, count in source_new_pieces.most_common()
        ],
        "new_candidate_tokens_used_on_target": [
            {"token": token, "occurrences": count}
            for token, count in target_new_pieces.most_common()
        ],
        "corpora": {
            label: {
                "path": str(path),
                "sha256": sha256(path),
                **corpus_counts[label],
            }
            for label, path in corpora.items()
        },
        "summaries": summaries,
        "interpretation": [
            "Whitespace units and subword counts are engineering measurements, not morphological analyses.",
            "A lower target fertility is an intrinsic mechanism check, not evidence of translation improvement.",
            "New Kuku-trained pieces used on English source text identify a possible shared-tokenizer interference path.",
            "Only declared training text may fit the candidate tokenizer; held-out corpora are audit inputs only.",
        ],
    }
    write_atomic(args.output, json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    write_atomic(
        args.row_output,
        "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records),
    )
    print(json.dumps({"output": str(args.output), "row_output": str(args.row_output), **result}, indent=2))


if __name__ == "__main__":
    main()

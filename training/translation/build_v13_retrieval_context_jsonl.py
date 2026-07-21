#!/usr/bin/env python3
"""Build retrieval-context Bible MT JSONL files for v13 diagnostics."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any


TOKEN_RE = re.compile(r"[A-Za-z0-9-]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--retrieval-index", default="v8_2048row/train_direct.eng-gvn.jsonl")
    parser.add_argument("--source-train", default="v8_2048row/train.eng-gvn.jsonl")
    parser.add_argument("--source-eval-train", default="v8_2048row/eval_train.eng-gvn.jsonl")
    parser.add_argument("--source-train-direct", default="v8_2048row/eval_train_direct.eng-gvn.jsonl")
    parser.add_argument("--source-train-ref", default="v8_2048row/eval_train_ref.eng-gvn.jsonl")
    parser.add_argument("--source-heldout-direct", default="heldout_direct_325.eng-gvn.jsonl")
    parser.add_argument("--source-heldout-ref", default="heldout_ref_325.eng-gvn.jsonl")
    parser.add_argument("--source-heldout-mixed", default="heldout_multitask_650.eng-gvn.jsonl")
    parser.add_argument("--top-k", type=int, default=1)
    parser.add_argument("--candidate-pool-size", type=int, default=48)
    parser.add_argument("--max-example-source-chars", type=int, default=220)
    parser.add_argument("--max-example-target-chars", type=int, default=260)
    parser.add_argument("--exclude-same-canonical-ref", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--manifest-name", default="retrieval_context_manifest.json")
    return parser.parse_args()


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


def stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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
    text = normalize_text(row.get("input_text"))
    for prefix in ("<translate>",):
        if text.startswith(prefix):
            return normalize_text(text[len(prefix) :])
    if text.startswith("<bible_ref>"):
        marker = "<eng>"
        if marker in text:
            return normalize_text(text.split(marker, 1)[1])
    return text


def char_ngrams(text: str, n: int = 3) -> collections.Counter[str]:
    normalized = f"  {normalize_text(text).casefold()}  "
    if len(normalized) < n:
        return collections.Counter([normalized])
    return collections.Counter(normalized[i : i + n] for i in range(len(normalized) - n + 1))


def cosine(left: collections.Counter[str], right: collections.Counter[str]) -> float:
    if not left or not right:
        return 0.0
    dot = sum(value * right.get(key, 0) for key, value in left.items())
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def counter_norm(counter: collections.Counter[str]) -> float:
    return math.sqrt(sum(value * value for value in counter.values()))


def tokens(text: str) -> set[str]:
    return {token.casefold() for token in TOKEN_RE.findall(normalize_text(text))}


def truncate_text(text: str, limit: int) -> str:
    text = normalize_text(text)
    if limit <= 0 or len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut if cut else text[:limit]


def build_index(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    index: list[dict[str, Any]] = []
    for row in rows:
        source = base_input(row)
        target = normalize_text(row.get("output_text"))
        if not source or not target:
            continue
        index.append(
            {
                "id": row.get("id"),
                "canonical_ref": row.get("canonical_ref"),
                "source": source,
                "target": target,
                "source_vector": char_ngrams(source),
                "source_tokens": tokens(source),
            }
        )
    return index


def build_token_index(index: list[dict[str, Any]]) -> dict[str, list[int]]:
    token_index: dict[str, list[int]] = collections.defaultdict(list)
    for position, candidate in enumerate(index):
        for token in candidate["source_tokens"]:
            token_index[token].append(position)
    return dict(token_index)


def retrieve(
    row: dict[str, Any],
    index: list[dict[str, Any]],
    token_index: dict[str, list[int]],
    *,
    top_k: int,
    exclude_same_canonical_ref: bool,
    candidate_pool_size: int,
) -> list[dict[str, Any]]:
    query = base_input(row)
    query_vector = char_ngrams(query)
    query_tokens = tokens(query)
    canonical_ref = normalize_text(row.get("canonical_ref"))
    candidate_votes: collections.Counter[int] = collections.Counter()
    for token in query_tokens:
        candidate_votes.update(token_index.get(token, []))
    if candidate_votes:
        candidate_positions = [
            position
            for position, _ in candidate_votes.most_common(candidate_pool_size)
        ]
    else:
        candidate_positions = list(range(len(index)))

    scored: list[tuple[float, dict[str, Any]]] = []
    for position in candidate_positions:
        candidate = index[position]
        if exclude_same_canonical_ref and canonical_ref and candidate.get("canonical_ref") == canonical_ref:
            continue
        score = cosine(query_vector, candidate["source_vector"])
        scored.append((score, candidate))
    scored.sort(key=lambda item: (-item[0], str(item[1].get("id") or "")))
    return [
        {
            "rank": rank,
            "score": score,
            "id": candidate.get("id"),
            "canonical_ref": candidate.get("canonical_ref"),
            "source": candidate["source"],
            "target": candidate["target"],
        }
        for rank, (score, candidate) in enumerate(scored[:top_k], 1)
    ]


def context_prefix(retrieved: list[dict[str, Any]], *, max_source_chars: int, max_target_chars: int) -> str:
    pieces: list[str] = []
    for item in retrieved:
        source = truncate_text(item["source"], max_source_chars)
        target = truncate_text(item["target"], max_target_chars)
        pieces.append(f"<retrieved_example> <eng> {source} <gvn> {target} </retrieved_example>")
    return normalize_text(" ".join(pieces))


def transform_rows(
    rows: list[dict[str, Any]],
    index: list[dict[str, Any]],
    token_index: dict[str, list[int]],
    *,
    top_k: int,
    candidate_pool_size: int,
    max_source_chars: int,
    max_target_chars: int,
    exclude_same_canonical_ref: bool,
) -> list[dict[str, Any]]:
    transformed: list[dict[str, Any]] = []
    for row in rows:
        retrieved = retrieve(
            row,
            index,
            token_index,
            top_k=top_k,
            exclude_same_canonical_ref=exclude_same_canonical_ref,
            candidate_pool_size=candidate_pool_size,
        )
        prefix = context_prefix(
            retrieved,
            max_source_chars=max_source_chars,
            max_target_chars=max_target_chars,
        )
        original_input = normalize_text(row.get("input_text"))
        updated = dict(row)
        updated["input_text"] = normalize_text(f"{prefix} {original_input}") if prefix else original_input
        updated["retrieval_context"] = {
            "enabled": bool(retrieved),
            "top_k": top_k,
            "exclude_same_canonical_ref": exclude_same_canonical_ref,
            "prefix_template": "<retrieved_example> <eng> {source} <gvn> {target} </retrieved_example>",
            "original_input_text": original_input,
            "retrieved": [
                {
                    "rank": item["rank"],
                    "score": item["score"],
                    "id": item["id"],
                    "canonical_ref": item["canonical_ref"],
                    "source_sha256": stable_hash(item["source"]),
                    "target_sha256": stable_hash(item["target"]),
                }
                for item in retrieved
            ],
        }
        transformed.append(updated)
    return transformed


def write_split(
    *,
    input_dir: Path,
    output_dir: Path,
    source_relative: str,
    output_relative: str,
    index: list[dict[str, Any]],
    token_index: dict[str, list[int]],
    top_k: int,
    candidate_pool_size: int,
    max_source_chars: int,
    max_target_chars: int,
    exclude_same_canonical_ref: bool,
) -> dict[str, Any]:
    source_file = input_dir / source_relative
    source_rows = read_jsonl(source_file)
    output_rows = transform_rows(
        source_rows,
        index,
        token_index,
        top_k=top_k,
        candidate_pool_size=candidate_pool_size,
        max_source_chars=max_source_chars,
        max_target_chars=max_target_chars,
        exclude_same_canonical_ref=exclude_same_canonical_ref,
    )
    output_file = output_dir / output_relative
    write_jsonl(output_file, output_rows)
    retrieval_scores = [
        item["score"]
        for row in output_rows
        for item in (row.get("retrieval_context") or {}).get("retrieved", [])
    ]
    return {
        "source_path": source_relative,
        "source_rows": len(source_rows),
        "source_sha256": sha256_file(source_file),
        "output_path": output_relative,
        "output_rows": len(output_rows),
        "output_sha256": sha256_file(output_file),
        "retrieval_score": {
            "mean": sum(retrieval_scores) / len(retrieval_scores) if retrieval_scores else 0.0,
            "min": min(retrieval_scores) if retrieval_scores else 0.0,
            "max": max(retrieval_scores) if retrieval_scores else 0.0,
        },
    }


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    index_file = input_dir / args.retrieval_index
    index_rows = read_jsonl(index_file)
    index = build_index(index_rows)
    token_index = build_token_index(index)

    split_pairs = [
        (args.source_train, "v8_2048row/train.eng-gvn.jsonl"),
        (args.source_eval_train, "v8_2048row/eval_train.eng-gvn.jsonl"),
        (args.source_train_direct, "v8_2048row/eval_train_direct.eng-gvn.jsonl"),
        (args.source_train_ref, "v8_2048row/eval_train_ref.eng-gvn.jsonl"),
        (args.source_heldout_direct, "heldout_direct_325.eng-gvn.jsonl"),
        (args.source_heldout_ref, "heldout_ref_325.eng-gvn.jsonl"),
        (args.source_heldout_mixed, "heldout_multitask_650.eng-gvn.jsonl"),
    ]

    manifest: dict[str, Any] = {
        "created_at": "2026-07-02",
        "purpose": "v13 retrieval-context Bible MT diagnostic data. Each source row is prefixed with nearest approved train examples, excluding the same canonical Bible reference by default.",
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "retrieval_index": args.retrieval_index,
        "retrieval_index_rows": len(index),
        "retrieval_index_sha256": sha256_file(index_file),
        "top_k": args.top_k,
        "candidate_pool_size": args.candidate_pool_size,
        "max_example_source_chars": args.max_example_source_chars,
        "max_example_target_chars": args.max_example_target_chars,
        "exclude_same_canonical_ref": args.exclude_same_canonical_ref,
        "splits": [],
    }
    source_manifest = input_dir / "tagged_multitask_manifest.json"
    if source_manifest.exists():
        manifest["source_tagged_manifest_sha256"] = sha256_file(source_manifest)

    for source_relative, output_relative in split_pairs:
        manifest["splits"].append(
            write_split(
                input_dir=input_dir,
                output_dir=output_dir,
                source_relative=source_relative,
                output_relative=output_relative,
                index=index,
                token_index=token_index,
                top_k=args.top_k,
                candidate_pool_size=args.candidate_pool_size,
                max_source_chars=args.max_example_source_chars,
                max_target_chars=args.max_example_target_chars,
                exclude_same_canonical_ref=args.exclude_same_canonical_ref,
            )
        )

    manifest_file = output_dir / args.manifest_name
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

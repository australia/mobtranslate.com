#!/usr/bin/env python3
"""Evaluate exact and nearest-example retrieval baselines for MT JSONL rows."""

from __future__ import annotations

import argparse
import collections
import json
import math
import re
import statistics
from pathlib import Path
from typing import Any

try:
    import sacrebleu  # type: ignore
except Exception:  # pragma: no cover - optional local dependency
    sacrebleu = None


TOKEN_RE = re.compile(r"[A-Za-z0-9-]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index-file", action="append", required=True)
    parser.add_argument("--eval-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--strategy", choices=["exact", "nearest"], required=True)
    parser.add_argument(
        "--key-field",
        choices=["auto", "canonical_ref", "unconditioned_input_text", "input_text", "id"],
        default="auto",
    )
    parser.add_argument(
        "--text-field",
        choices=["auto", "unconditioned_input_text", "input_text"],
        default="auto",
    )
    parser.add_argument("--exclude-same-id", action="store_true")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--min-score", type=float, default=0.0)
    return parser.parse_args()


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


def normalize_key(text: Any) -> str:
    return normalize_text(text).casefold()


def read_jsonl(path: Path, direction: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("direction") == direction:
                rows.append(row)
    return rows


def row_key(row: dict[str, Any], field: str) -> str:
    if field == "auto":
        if row.get("canonical_ref"):
            return normalize_key(row.get("canonical_ref"))
        return normalize_key(row.get("unconditioned_input_text") or row.get("input_text"))
    return normalize_key(row.get(field))


def row_text(row: dict[str, Any], field: str) -> str:
    if field == "auto":
        return normalize_text(row.get("unconditioned_input_text") or row.get("input_text"))
    return normalize_text(row.get(field))


def char_ngrams(text: str, n: int = 3) -> collections.Counter[str]:
    normalized = f"  {normalize_key(text)}  "
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


def tokens(text: str) -> list[str]:
    return TOKEN_RE.findall(normalize_key(text))


def token_recall(prediction: str, reference: str) -> float:
    ref = tokens(reference)
    if not ref:
        return 1.0
    pred = set(tokens(prediction))
    return sum(1 for token in ref if token in pred) / len(ref)


def length_ratio(prediction: str, reference: str) -> float:
    ref_len = max(1, len(tokens(reference)))
    return len(tokens(prediction)) / ref_len


def build_exact_index(rows: list[dict[str, Any]], key_field: str) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for row in rows:
        key = row_key(row, key_field)
        if key:
            index[key].append(row)
    return dict(index)


def choose_exact(
    query: dict[str, Any],
    candidates: list[dict[str, Any]],
    *,
    exclude_same_id: bool,
) -> tuple[dict[str, Any] | None, float]:
    for candidate in candidates:
        if exclude_same_id and candidate.get("id") == query.get("id"):
            continue
        return candidate, 1.0
    return None, 0.0


def choose_nearest(
    query: dict[str, Any],
    candidates: list[tuple[dict[str, Any], collections.Counter[str]]],
    *,
    text_field: str,
    exclude_same_id: bool,
    top_k: int,
) -> tuple[dict[str, Any] | None, float, list[dict[str, Any]]]:
    query_vector = char_ngrams(row_text(query, text_field))
    scored: list[tuple[float, dict[str, Any]]] = []
    for candidate, vector in candidates:
        if exclude_same_id and candidate.get("id") == query.get("id"):
            continue
        scored.append((cosine(query_vector, vector), candidate))
    scored.sort(key=lambda item: (-item[0], str(item[1].get("id", ""))))
    top = [
        {
            "score": score,
            "id": candidate.get("id"),
            "input_text": candidate.get("input_text"),
            "unconditioned_input_text": candidate.get("unconditioned_input_text"),
            "output_text": candidate.get("output_text"),
            "canonical_ref": candidate.get("canonical_ref"),
            "pair_kind": candidate.get("pair_kind"),
            "db_usage_example": candidate.get("db_usage_example"),
        }
        for score, candidate in scored[:top_k]
    ]
    if not scored:
        return None, 0.0, top
    return scored[0][1], scored[0][0], top


def summarize(predictions: list[dict[str, Any]]) -> dict[str, Any]:
    refs = [row["reference"] for row in predictions]
    preds = [row["prediction"] for row in predictions]
    exact = sum(1 for pred, ref in zip(preds, refs) if normalize_text(pred) == normalize_text(ref))
    empty = sum(1 for pred in preds if not normalize_text(pred))
    ratios = [length_ratio(pred, ref) for pred, ref in zip(preds, refs)]
    recalls = [token_recall(pred, ref) for pred, ref in zip(preds, refs)]
    headword_rows = [
        row
        for row in predictions
        if ((row.get("db_usage_example") or {}).get("word") or "").strip()
    ]
    headword_hits = 0
    for row in headword_rows:
        word = normalize_key((row.get("db_usage_example") or {}).get("word"))
        if word and word in normalize_key(row["prediction"]):
            headword_hits += 1
    metrics: dict[str, Any] = {
        "rows": len(predictions),
        "exact": exact,
        "empty": empty,
        "exact_rate": exact / len(predictions) if predictions else 0.0,
        "length_ratio": {
            "mean": statistics.mean(ratios) if ratios else 0.0,
            "median": statistics.median(ratios) if ratios else 0.0,
            "min": min(ratios) if ratios else 0.0,
            "max": max(ratios) if ratios else 0.0,
        },
        "reference_token_recall": {
            "mean": statistics.mean(recalls) if recalls else 0.0,
            "median": statistics.median(recalls) if recalls else 0.0,
            "min": min(recalls) if recalls else 0.0,
            "max": max(recalls) if recalls else 0.0,
        },
        "db_headword_hits": {
            "rows_with_headword": len(headword_rows),
            "hits": headword_hits,
            "rate": headword_hits / len(headword_rows) if headword_rows else None,
        },
    }
    if sacrebleu is not None and preds:
        metrics["sacrebleu"] = {
            "bleu": sacrebleu.corpus_bleu(preds, [refs]).score,
            "chrf": sacrebleu.corpus_chrf(preds, [refs], word_order=2).score,
        }
    else:
        metrics["sacrebleu"] = None
    return metrics


def main() -> None:
    args = parse_args()
    index_rows: list[dict[str, Any]] = []
    for file_name in args.index_file:
        index_rows.extend(read_jsonl(Path(file_name), args.direction))
    eval_rows = read_jsonl(Path(args.eval_file), args.direction)

    exact_index = build_exact_index(index_rows, args.key_field)
    nearest_index = [(row, char_ngrams(row_text(row, args.text_field))) for row in index_rows]

    predictions: list[dict[str, Any]] = []
    retrieval_scores: list[float] = []
    retrieval_hits_same_target = 0

    for row in eval_rows:
        retrieved: dict[str, Any] | None
        score: float
        top: list[dict[str, Any]]
        if args.strategy == "exact":
            candidates = exact_index.get(row_key(row, args.key_field), [])
            retrieved, score = choose_exact(row, candidates, exclude_same_id=args.exclude_same_id)
            top = []
        else:
            retrieved, score, top = choose_nearest(
                row,
                nearest_index,
                text_field=args.text_field,
                exclude_same_id=args.exclude_same_id,
                top_k=args.top_k,
            )
            if score < args.min_score:
                retrieved = None

        prediction = normalize_text(retrieved.get("output_text")) if retrieved else ""
        reference = normalize_text(row.get("output_text"))
        if retrieved and normalize_text(retrieved.get("output_text")) == reference:
            retrieval_hits_same_target += 1
        retrieval_scores.append(score)
        predictions.append(
            {
                **row,
                "prediction": prediction,
                "reference": reference,
                "retrieval": {
                    "strategy": args.strategy,
                    "score": score,
                    "key": row_key(row, args.key_field),
                    "retrieved_id": retrieved.get("id") if retrieved else None,
                    "retrieved_input_text": retrieved.get("input_text") if retrieved else None,
                    "retrieved_unconditioned_input_text": retrieved.get("unconditioned_input_text") if retrieved else None,
                    "retrieved_canonical_ref": retrieved.get("canonical_ref") if retrieved else None,
                    "retrieved_pair_kind": retrieved.get("pair_kind") if retrieved else None,
                    "top": top,
                },
            }
        )

    metrics = summarize(predictions)
    metrics["retrieval"] = {
        "strategy": args.strategy,
        "index_rows": len(index_rows),
        "eval_rows": len(eval_rows),
        "key_field": args.key_field,
        "text_field": args.text_field,
        "exclude_same_id": args.exclude_same_id,
        "min_score": args.min_score,
        "same_target_hits": retrieval_hits_same_target,
        "score": {
            "mean": statistics.mean(retrieval_scores) if retrieval_scores else 0.0,
            "median": statistics.median(retrieval_scores) if retrieval_scores else 0.0,
            "min": min(retrieval_scores) if retrieval_scores else 0.0,
            "max": max(retrieval_scores) if retrieval_scores else 0.0,
        },
    }

    output = {
        "metrics": metrics,
        "index_files": args.index_file,
        "eval_file": args.eval_file,
        "predictions": predictions,
    }
    output_file = Path(args.output_file)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

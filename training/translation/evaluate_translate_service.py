#!/usr/bin/env python3
"""Evaluate a running MobTranslate translate service on JSONL rows."""

from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from pathlib import Path
from typing import Any

import requests


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8765/translate")
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="tpi_Latn")
    parser.add_argument("--max-rows", type=int)
    parser.add_argument("--max-new-tokens", type=int, default=192)
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=0)
    parser.add_argument("--repetition-penalty", type=float, default=1.0)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--progress-every", type=int, default=5)
    return parser.parse_args()


def normalize_text(text: str) -> str:
    return " ".join(text.split())


def read_rows(file: str, direction: str, max_rows: int | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(file, "r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if row.get("direction") != direction:
                continue
            rows.append(row)
            if max_rows is not None and len(rows) >= max_rows:
                break
    return rows


def ngrams(text: str, order: int) -> Counter[str]:
    compact = " ".join(text.split())
    if len(compact) < order:
        return Counter()
    return Counter(compact[i : i + order] for i in range(len(compact) - order + 1))


def char_overlap_f(prediction: str, reference: str, max_order: int = 6) -> float:
    scores: list[float] = []
    for order in range(1, max_order + 1):
        pred = ngrams(prediction, order)
        ref = ngrams(reference, order)
        if not pred or not ref:
            continue
        overlap = sum((pred & ref).values())
        precision = overlap / sum(pred.values())
        recall = overlap / sum(ref.values())
        if precision + recall:
            scores.append(2 * precision * recall / (precision + recall))
    return sum(scores) / len(scores) if scores else 0.0


def main() -> None:
    args = parse_args()
    rows = read_rows(args.data_file, args.direction, args.max_rows)
    predictions: list[dict[str, Any]] = []
    started = time.monotonic()

    with requests.Session() as session:
        for index, row in enumerate(rows, start=1):
            request_started = time.monotonic()
            payload = {
                "text": normalize_text(row["input_text"]),
                "sourceLang": args.source_lang,
                "targetLang": args.target_lang,
                "maxNewTokens": args.max_new_tokens,
                "numBeams": args.num_beams,
                "noRepeatNgramSize": args.no_repeat_ngram_size,
                "repetitionPenalty": args.repetition_penalty,
                "lengthPenalty": args.length_penalty,
            }
            response = session.post(args.endpoint, json=payload, timeout=args.timeout)
            response.raise_for_status()
            body = response.json()
            prediction = normalize_text(body.get("translation") or "")
            reference = normalize_text(row["output_text"])
            predictions.append(
                {
                    **row,
                    "prediction": prediction,
                    "reference": reference,
                    "service": {
                        "endpoint": args.endpoint,
                        "latencyMs": body.get("latencyMs"),
                        "sourceLang": body.get("sourceLang"),
                        "targetLang": body.get("targetLang"),
                        "requestedTargetLang": body.get("requestedTargetLang"),
                    },
                    "diagnostics": {
                        "char_overlap_f": char_overlap_f(prediction, reference),
                        "wallMs": round((time.monotonic() - request_started) * 1000),
                    },
                }
            )
            if args.progress_every > 0 and index % args.progress_every == 0:
                elapsed = time.monotonic() - started
                print(f"{index}/{len(rows)} rows in {elapsed:.1f}s")

    char_scores = [row["diagnostics"]["char_overlap_f"] for row in predictions]
    metrics = {
        "rows": len(predictions),
        "preview": True,
        "mean_char_overlap_f": sum(char_scores) / len(char_scores) if char_scores else 0.0,
        "num_beams": args.num_beams,
        "max_new_tokens": args.max_new_tokens,
        "no_repeat_ngram_size": args.no_repeat_ngram_size,
        "repetition_penalty": args.repetition_penalty,
        "length_penalty": args.length_penalty,
        "service_endpoint": args.endpoint,
        "source_family": "mobtranslate_db_usage_examples",
    }
    out = {"metrics": metrics, "predictions": predictions}
    Path(args.output_file).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()

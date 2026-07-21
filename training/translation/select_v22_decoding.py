#!/usr/bin/env python3
"""Select a deterministic v22 decoder from development predictions only."""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import statistics
from typing import Any

import sacrebleu


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--candidate",
        action="append",
        required=True,
        metavar="ID=FILE",
        help="Ordered decoder ID and development prediction document; repeat for each candidate.",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chrf-noninferiority-margin", type=float, default=1.0)
    return parser.parse_args()


def normalize(value: str | None) -> str:
    return " ".join((value or "").split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_candidate(value: str) -> tuple[str, Path]:
    identifier, separator, raw_path = value.partition("=")
    if not separator or not identifier.strip() or not raw_path.strip():
        raise ValueError(f"invalid --candidate {value!r}; expected ID=FILE")
    return identifier.strip(), Path(raw_path).resolve()


def segment_repetition(text: str) -> tuple[float, int]:
    segments = re.findall(r"[^\W\d_]+", text.casefold(), flags=re.UNICODE)
    if not segments:
        return 0.0, 0
    highest = max(collections.Counter(segments).values())
    return highest / len(segments), highest


def identity(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("id") or ""),
        normalize(row.get("input_text")),
        normalize(row.get("reference") or row.get("output_text")),
    )


def analyze(identifier: str, path: Path, order: int) -> tuple[dict[str, Any], list[tuple[str, str, str]]]:
    document = json.loads(path.read_text(encoding="utf-8"))
    rows = document.get("predictions")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{path}: predictions must be a nonempty list")
    predictions = [normalize(row.get("prediction")) for row in rows]
    references = [normalize(row.get("reference") or row.get("output_text")) for row in rows]
    token_ratios = [
        len(prediction.split()) / max(1, len(reference.split()))
        for prediction, reference in zip(predictions, references)
    ]
    character_ratios = [
        len(prediction) / max(1, len(reference))
        for prediction, reference in zip(predictions, references)
    ]
    repetitions = [segment_repetition(prediction) for prediction in predictions]
    repeated_rows = sum(count >= 10 for _, count in repetitions)
    underlength_rows = sum(ratio < 0.5 for ratio in token_ratios)
    overlength_rows = sum(ratio > 2.0 for ratio in character_ratios)
    metrics = document.get("metrics") or {}
    record = {
        "id": identifier,
        "order": order,
        "path": str(path),
        "sha256": sha256(path),
        "rows": len(rows),
        "decode": {
            "num_beams": int(metrics.get("num_beams", 1)),
            "no_repeat_ngram_size": int(metrics.get("no_repeat_ngram_size", 0)),
            "repetition_penalty": float(metrics.get("repetition_penalty", 1.0)),
            "length_penalty": float(metrics.get("length_penalty", 1.0)),
        },
        "corpus_chrf": sacrebleu.corpus_chrf(predictions, [references], word_order=2).score,
        "corpus_bleu": sacrebleu.corpus_bleu(predictions, [references]).score,
        "mean_sentence_chrf": statistics.mean(
            sacrebleu.sentence_chrf(prediction, [reference], word_order=2).score
            for prediction, reference in zip(predictions, references)
        ),
        "empty": sum(not prediction for prediction in predictions),
        "rows_repeated_segment_at_least_10_times": repeated_rows,
        "rows_token_ratio_below_0_5": underlength_rows,
        "rows_character_ratio_above_2_0": overlength_rows,
        "severe_shape_failures": underlength_rows + overlength_rows,
        "maximum_repeated_segment_count": max(count for _, count in repetitions),
        "mean_token_length_ratio": statistics.mean(token_ratios),
    }
    return record, [identity(row) for row in rows]


def main() -> int:
    args = parse_args()
    if args.chrf_noninferiority_margin < 0:
        raise SystemExit("--chrf-noninferiority-margin cannot be negative")
    parsed = [parse_candidate(value) for value in args.candidate]
    identifiers = [identifier for identifier, _ in parsed]
    if len(identifiers) != len(set(identifiers)):
        raise SystemExit("decoder candidate IDs must be unique")

    records: list[dict[str, Any]] = []
    expected_identities: list[tuple[str, str, str]] | None = None
    for order, (identifier, path) in enumerate(parsed):
        record, identities = analyze(identifier, path, order)
        if expected_identities is None:
            expected_identities = identities
        elif identities != expected_identities:
            raise SystemExit(f"ordered development inputs/references differ for {identifier}")
        records.append(record)

    best_chrf = max(record["corpus_chrf"] for record in records)
    floor = best_chrf - args.chrf_noninferiority_margin
    for record in records:
        record["eligible"] = record["empty"] == 0 and record["corpus_chrf"] >= floor
        record["chrf_delta_from_best"] = record["corpus_chrf"] - best_chrf
    eligible = [record for record in records if record["eligible"]]
    if not eligible:
        raise SystemExit("no decoder met the preregistered eligibility rules")
    selected = min(
        eligible,
        key=lambda record: (
            record["rows_repeated_segment_at_least_10_times"],
            record["severe_shape_failures"],
            record["maximum_repeated_segment_count"],
            -record["corpus_chrf"],
            record["order"],
        ),
    )
    output = {
        "schema_version": 1,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "selection_data": "development-only",
        "rows_aligned": len(expected_identities or []),
        "chrf_noninferiority_margin": args.chrf_noninferiority_margin,
        "best_corpus_chrf": best_chrf,
        "eligibility_floor": floor,
        "selection_order": [
            "fewest repeated-segment>=10 rows",
            "fewest severe shape failures",
            "lowest maximum repeated-segment count",
            "highest corpus chrF++",
            "predeclared candidate order",
        ],
        "candidates": records,
        "selected": selected,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(selected, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

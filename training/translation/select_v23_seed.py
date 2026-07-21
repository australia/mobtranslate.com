#!/usr/bin/env python3
"""Select one v23 training seed using only the frozen Text 36 validation set."""

from __future__ import annotations

import argparse
import collections
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import statistics
from typing import Any

import sacrebleu


DECODE_KEYS = (
    "num_beams",
    "no_repeat_ngram_size",
    "repetition_penalty",
    "length_penalty",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def parse_candidate(value: str) -> tuple[str, Path]:
    label, separator, path = value.partition("=")
    if not separator or not label or not path:
        raise ValueError(f"invalid candidate specification: {value}")
    return label, Path(path)


def normalize(text: str | None) -> str:
    return " ".join((text or "").split())


def identity(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("id") or ""),
        normalize(row.get("input_text")),
        normalize(row.get("reference") or row.get("output_text")),
    )


def segment_count(text: str) -> int:
    segments = re.findall(r"[^\W\d_]+", text.casefold(), flags=re.UNICODE)
    return max(collections.Counter(segments).values(), default=0)


def summarize(document: dict[str, Any]) -> dict[str, Any]:
    rows = document.get("predictions") or []
    predictions = [normalize(row.get("prediction")) for row in rows]
    references = [normalize(row.get("reference") or row.get("output_text")) for row in rows]
    sentence_scores = [
        sacrebleu.sentence_chrf(prediction, [reference], word_order=2).score
        for prediction, reference in zip(predictions, references)
    ]
    ratios = [
        len(prediction.split()) / max(1, len(reference.split()))
        for prediction, reference in zip(predictions, references)
    ]
    return {
        "rows": len(rows),
        "corpus_chrf": sacrebleu.corpus_chrf(predictions, [references], word_order=2).score,
        "mean_sentence_chrf": statistics.mean(sentence_scores),
        "empty": sum(not prediction for prediction in predictions),
        "repeated_segment_at_least_10": sum(segment_count(prediction) >= 10 for prediction in predictions),
        "maximum_repeated_segment_count": max(map(segment_count, predictions), default=0),
        "mean_token_length_ratio": statistics.mean(ratios),
        "decode": {key: document.get("metrics", {}).get(key) for key in DECODE_KEYS},
    }


def load(path: Path) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document.get("predictions"), list):
        raise ValueError(f"prediction payload missing at {path}")
    return document


def main() -> int:
    args = parse_args()
    baseline_document = load(args.baseline)
    baseline_identities = [identity(row) for row in baseline_document["predictions"]]
    baseline = summarize(baseline_document)
    candidates: list[dict[str, Any]] = []
    for specification in args.candidate:
        label, path = parse_candidate(specification)
        document = load(path)
        if [identity(row) for row in document["predictions"]] != baseline_identities:
            raise ValueError(f"ordered validation rows differ for {label}")
        result = summarize(document)
        if result["decode"] != baseline["decode"]:
            raise ValueError(f"decoder differs for {label}: {result['decode']} != {baseline['decode']}")
        eligible = (
            result["rows"] == 53
            and result["empty"] == 0
            and result["repeated_segment_at_least_10"] == 0
            and 0.5 <= result["mean_token_length_ratio"] <= 2.0
        )
        candidates.append(
            {
                "label": label,
                "path": str(path),
                "eligible": eligible,
                "metrics": result,
                "delta_vs_baseline": {
                    "corpus_chrf": result["corpus_chrf"] - baseline["corpus_chrf"],
                    "mean_sentence_chrf": result["mean_sentence_chrf"] - baseline["mean_sentence_chrf"],
                },
            }
        )
    eligible = [candidate for candidate in candidates if candidate["eligible"]]
    if not eligible:
        raise SystemExit("no seed passed the development-set safety eligibility rules")
    selected = max(
        eligible,
        key=lambda candidate: (
            candidate["metrics"]["corpus_chrf"],
            candidate["metrics"]["mean_sentence_chrf"],
            -candidate["metrics"]["maximum_repeated_segment_count"],
            candidate["label"],
        ),
    )
    output = {
        "schema_version": 1,
        "locked_at": datetime.now(timezone.utc).isoformat(),
        "selection_data": "Patz Text 36, Nyungkul, Bobby Roberts, 53 clauses",
        "test_data_opened_for_selection": False,
        "criterion": (
            "Among safety-eligible seeds, maximize corpus chrF++; then mean sentence chrF++; "
            "then minimize maximum segment repetition; then lexical label."
        ),
        "baseline": {"path": str(args.baseline), "metrics": baseline},
        "candidates": candidates,
        "replication": {
            "eligible_seeds": len(eligible),
            "seeds_improving_baseline_corpus_chrf": sum(
                candidate["delta_vs_baseline"]["corpus_chrf"] > 0 for candidate in candidates
            ),
            "seeds_improving_baseline_mean_sentence_chrf": sum(
                candidate["delta_vs_baseline"]["mean_sentence_chrf"] > 0 for candidate in candidates
            ),
        },
        "selected": selected,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

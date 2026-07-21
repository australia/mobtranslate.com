#!/usr/bin/env python3
"""Produce auditable aggregate and linguistic-slice metrics for v21 predictions."""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path
import re
import statistics
from typing import Any, Iterable

import sacrebleu


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prediction_file", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--minimum-slice-rows", type=int, default=20)
    return parser.parse_args()


def normalize(text: str | None) -> str:
    return " ".join((text or "").split())


def describe(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"mean": None, "median": None, "min": None, "max": None}
    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
    }


def repeat_share(tokens: list[str]) -> float:
    return max(collections.Counter(tokens).values()) / len(tokens) if tokens else 0.0


def segment_repetition(text: str) -> tuple[float, int]:
    """Measure generic orthographic words/morpheme segments, including hyphen chains."""
    segments = re.findall(r"[^\W\d_]+", text.casefold(), flags=re.UNICODE)
    if not segments:
        return 0.0, 0
    highest = max(collections.Counter(segments).values())
    return highest / len(segments), highest


def token_recall(prediction: str, reference: str) -> float:
    predicted = {token.casefold() for token in prediction.split()}
    reference_tokens = reference.split()
    return (
        sum(token.casefold() in predicted for token in reference_tokens) / len(reference_tokens)
        if reference_tokens
        else 0.0
    )


def lexical_surface_recall(row: dict[str, Any], prediction: str) -> float | None:
    targets = (row.get("synthetic_corpus") or {}).get("lexical_targets") or []
    targets = [normalize(str(target)).casefold() for target in targets if normalize(str(target))]
    if not targets:
        return None
    surface = prediction.casefold()
    return sum(target in surface for target in targets) / len(targets)


def metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    predictions = [normalize(row.get("prediction")) for row in rows]
    references = [normalize(row.get("reference") or row.get("output_text")) for row in rows]
    exact = sum(prediction == reference for prediction, reference in zip(predictions, references))
    length_ratios = [
        len(prediction.split()) / (len(reference.split()) or 1)
        for prediction, reference in zip(predictions, references)
    ]
    repetition = [repeat_share(prediction.split()) for prediction in predictions]
    segment_repetitions = [segment_repetition(prediction) for prediction in predictions]
    character_ratios = [
        len(prediction) / (len(reference) or 1)
        for prediction, reference in zip(predictions, references)
    ]
    token_recalls = [token_recall(prediction, reference) for prediction, reference in zip(predictions, references)]
    lexical_recalls = [
        recall
        for row, prediction in zip(rows, predictions)
        if (recall := lexical_surface_recall(row, prediction)) is not None
    ]
    sentence_chrf = [
        sacrebleu.sentence_chrf(prediction, [reference], word_order=2).score
        for prediction, reference in zip(predictions, references)
    ]
    return {
        "rows": len(rows),
        "bleu": sacrebleu.corpus_bleu(predictions, [references]).score if rows else None,
        "chrf": sacrebleu.corpus_chrf(predictions, [references], word_order=2).score if rows else None,
        "exact": exact,
        "exact_rate": exact / len(rows) if rows else None,
        "empty": sum(not prediction for prediction in predictions),
        "length_ratio": describe(length_ratios),
        "max_token_repeat_share": describe(repetition),
        "output_safety": {
            "rows_token_ratio_below_0_5": sum(ratio < 0.5 for ratio in length_ratios),
            "rows_token_ratio_above_2_0": sum(ratio > 2.0 for ratio in length_ratios),
            "rows_character_ratio_above_2_0": sum(ratio > 2.0 for ratio in character_ratios),
            "rows_repeated_segment_at_least_10_times": sum(
                count >= 10 for _, count in segment_repetitions
            ),
            "rows_repeated_segment_share_above_0_5": sum(
                share > 0.5 for share, _ in segment_repetitions
            ),
            "maximum_repeated_segment_count": max(
                (count for _, count in segment_repetitions), default=0
            ),
            "maximum_repeated_segment_share": max(
                (share for share, _ in segment_repetitions), default=0.0
            ),
            "character_length_ratio": describe(character_ratios),
        },
        "reference_token_recall": describe(token_recalls),
        "lexical_target_surface_recall": {
            "rows": len(lexical_recalls),
            **describe(lexical_recalls),
        },
        "sentence_chrf": describe(sentence_chrf),
    }


def add_slice(
    groups: dict[tuple[str, str], list[dict[str, Any]]],
    dimension: str,
    values: Iterable[str | None],
    row: dict[str, Any],
) -> None:
    for value in values:
        if value:
            groups[(dimension, str(value))].append(row)


def main() -> int:
    args = parse_args()
    document = json.loads(args.prediction_file.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = document.get("predictions", [])
    groups: dict[tuple[str, str], list[dict[str, Any]]] = collections.defaultdict(list)
    for row in rows:
        synthetic = row.get("synthetic_corpus") or {}
        add_slice(groups, "frame", [synthetic.get("frame")], row)
        add_slice(groups, "domain", [synthetic.get("domain")], row)
        add_slice(groups, "quality_tier", [synthetic.get("quality_tier")], row)
        add_slice(groups, "template_family", [synthetic.get("template_family")], row)
        add_slice(groups, "grammar", synthetic.get("grammar") or ["none"], row)

    slices: dict[str, dict[str, Any]] = collections.defaultdict(dict)
    ranked: list[dict[str, Any]] = []
    for (dimension, value), grouped_rows in sorted(groups.items()):
        result = metrics(grouped_rows)
        slices[dimension][value] = result
        if len(grouped_rows) >= args.minimum_slice_rows:
            ranked.append({"dimension": dimension, "value": value, **result})
    ranked.sort(key=lambda item: (item["chrf"] if item["chrf"] is not None else 101.0, -item["rows"]))

    output = {
        "prediction_file": str(args.prediction_file),
        "input_metrics": document.get("metrics", {}),
        "aggregate": metrics(rows),
        "slices": dict(slices),
        "lowest_chrf_slices_minimum_20_rows": ranked[:10],
        "method": {
            "normalization": "Unicode preserved; whitespace collapsed; exact comparison after whitespace collapse.",
            "chrf": "sacrebleu chrF++ with word_order=2",
            "lexical_target_surface_recall": (
                "Strict casefolded substring presence of exported lexical_targets; inflected allomorphs can be "
                "under-counted, so this is a diagnostic and not a lemma-recall claim."
            ),
            "minimum_slice_rows": args.minimum_slice_rows,
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(output["aggregate"], indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

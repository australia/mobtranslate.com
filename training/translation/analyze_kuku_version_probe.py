#!/usr/bin/env python3
"""Score multi-reference lexicon probes and elder sentence reports by model version."""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

import sacrebleu


TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", re.UNICODE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexicon-prediction", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--elder-prediction", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--output-md", type=Path, required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=10_000)
    parser.add_argument("--seed", default="kuku-version-probe-2026-07-14")
    return parser.parse_args()


def labeled_paths(values: list[str]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for value in values:
        label, separator, path = value.partition("=")
        if not separator or not label or not path:
            raise ValueError(f"expected LABEL=PATH, got {value!r}")
        if label in result:
            raise ValueError(f"duplicate label: {label}")
        result[label] = Path(path)
    return result


def normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).casefold().split())


def lexical_tokens(text: str) -> set[str]:
    return {normalize(token) for token in TOKEN_RE.findall(text)}


def levenshtein(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_char in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_char != right_char),
                )
            )
        previous = current
    return previous[-1]


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def bootstrap_difference(
    left: list[float], right: list[float], samples: int, seed: str
) -> dict[str, float]:
    if len(left) != len(right) or not left:
        raise ValueError("paired bootstrap inputs must be non-empty and aligned")
    rng = random.Random(seed)
    differences: list[float] = []
    for _ in range(samples):
        indices = [rng.randrange(len(left)) for _ in left]
        differences.append(mean([left[index] - right[index] for index in indices]))
    differences.sort()
    lower = differences[math.floor(0.025 * (samples - 1))]
    upper = differences[math.ceil(0.975 * (samples - 1))]
    return {"difference": mean(left) - mean(right), "ci95_low": lower, "ci95_high": upper}


def load_predictions(path: Path, pair_kind: str) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("predictions")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"missing predictions in {path}")
    selected = [row for row in rows if row.get("pair_kind") == pair_kind]
    if not selected:
        raise ValueError(f"no {pair_kind} predictions in {path}")
    return selected


def assert_aligned(reports: dict[str, list[dict[str, Any]]]) -> list[str]:
    first_ids: list[str] | None = None
    for label, rows in reports.items():
        ids = [str(row.get("id")) for row in rows]
        if len(ids) != len(set(ids)):
            raise ValueError(f"duplicate ids in {label}")
        if first_ids is None:
            first_ids = ids
        elif ids != first_ids:
            raise ValueError(f"row order or membership differs in {label}")
    return first_ids or []


def score_lexicon_row(row: dict[str, Any], chrf: sacrebleu.metrics.CHRF) -> dict[str, Any]:
    prediction = str(row.get("prediction") or "")
    references = [str(value) for value in row.get("accepted_references") or []]
    if not references:
        raise ValueError(f"missing accepted references for {row.get('id')}")
    normalized_prediction = normalize(prediction)
    normalized_references = [normalize(reference) for reference in references]
    distances = [levenshtein(normalized_prediction, reference) for reference in normalized_references]
    char_error_rates = [
        distance / max(1, len(reference)) for distance, reference in zip(distances, normalized_references)
    ]
    return {
        "id": row["id"],
        "raw_exact": prediction in references,
        "normalized_exact": normalized_prediction in normalized_references,
        "token_contains_reference": bool(lexical_tokens(prediction) & set(normalized_references)),
        "minimum_edit_distance": min(distances),
        "minimum_character_error_rate": min(char_error_rates),
        "maximum_sentence_chrf": max(
            chrf.sentence_score(prediction, [reference]).score for reference in references
        ),
        "empty": not normalized_prediction,
        "source_copy": normalized_prediction == normalize(str(row.get("unconditioned_input_text") or "")),
        "target_seen_as_training_token": bool(row.get("target_seen_as_training_token")),
        "source_seen_as_isolated_training_input": bool(row.get("source_seen_as_isolated_training_input")),
        "identity_translation": bool(row.get("identity_translation")),
    }


def aggregate_lexicon(rows: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(rows)
    return {
        "rows": count,
        "raw_exact_count": sum(row["raw_exact"] for row in rows),
        "raw_exact_percent": 100 * mean([float(row["raw_exact"]) for row in rows]),
        "normalized_exact_count": sum(row["normalized_exact"] for row in rows),
        "normalized_exact_percent": 100 * mean([float(row["normalized_exact"]) for row in rows]),
        "token_contains_reference_percent": 100
        * mean([float(row["token_contains_reference"]) for row in rows]),
        "mean_minimum_character_error_rate": mean(
            [row["minimum_character_error_rate"] for row in rows]
        ),
        "mean_maximum_sentence_chrf": mean([row["maximum_sentence_chrf"] for row in rows]),
        "empty_outputs": sum(row["empty"] for row in rows),
        "source_copy_outputs": sum(row["source_copy"] for row in rows),
    }


def strata(rows: list[dict[str, Any]]) -> dict[str, Any]:
    selectors: dict[str, Callable[[dict[str, Any]], bool]] = {
        "target_seen_in_training": lambda row: row["target_seen_as_training_token"],
        "target_unseen_in_training": lambda row: not row["target_seen_as_training_token"],
        "identity_translation": lambda row: row["identity_translation"],
        "non_identity_translation": lambda row: not row["identity_translation"],
        "isolated_source_seen_in_training": lambda row: row["source_seen_as_isolated_training_input"],
        "isolated_source_unseen_in_training": lambda row: not row["source_seen_as_isolated_training_input"],
    }
    return {
        name: aggregate_lexicon([row for row in rows if selector(row)])
        for name, selector in selectors.items()
        if any(selector(row) for row in rows)
    }


def score_elder(rows: list[dict[str, Any]], chrf: sacrebleu.metrics.CHRF) -> tuple[dict[str, Any], list[float]]:
    predictions = [str(row.get("prediction") or "") for row in rows]
    references = [str(row.get("reference") or row.get("output_text") or "") for row in rows]
    sentence_scores = [
        chrf.sentence_score(prediction, [reference]).score
        for prediction, reference in zip(predictions, references)
    ]
    corpus_score = chrf.corpus_score(predictions, [references]).score
    return (
        {
            "rows": len(rows),
            "exact_match_count": sum(
                normalize(prediction) == normalize(reference)
                for prediction, reference in zip(predictions, references)
            ),
            "exact_match_percent": 100
            * mean(
                [
                    float(normalize(prediction) == normalize(reference))
                    for prediction, reference in zip(predictions, references)
                ]
            ),
            "corpus_chrf": corpus_score,
            "mean_sentence_chrf": mean(sentence_scores),
            "empty_outputs": sum(not normalize(prediction) for prediction in predictions),
            "source_copy_outputs": sum(
                normalize(prediction)
                == normalize(str(row.get("unconditioned_input_text") or row.get("input_text") or ""))
                for prediction, row in zip(predictions, rows)
            ),
        },
        sentence_scores,
    )


def pairwise(
    labels: list[str], vectors: dict[str, dict[str, list[float]]], samples: int, seed: str
) -> list[dict[str, Any]]:
    comparisons: list[dict[str, Any]] = []
    for left_index, left in enumerate(labels):
        for right in labels[left_index + 1 :]:
            comparisons.append(
                {
                    "left": left,
                    "right": right,
                    "lexicon_normalized_exact_percentage_points": {
                        key: 100 * value
                        for key, value in bootstrap_difference(
                            vectors[left]["lexicon_exact"],
                            vectors[right]["lexicon_exact"],
                            samples,
                            f"{seed}:lexicon:{left}:{right}",
                        ).items()
                    },
                    "lexicon_mean_sentence_chrf": bootstrap_difference(
                        vectors[left]["lexicon_chrf"],
                        vectors[right]["lexicon_chrf"],
                        samples,
                        f"{seed}:lexicon-chrf:{left}:{right}",
                    ),
                    "elder_mean_sentence_chrf": bootstrap_difference(
                        vectors[left]["elder_chrf"],
                        vectors[right]["elder_chrf"],
                        samples,
                        f"{seed}:elder:{left}:{right}",
                    ),
                }
            )
    return comparisons


def markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Kuku Yalanji Model-Version Lexicon and Elder Benchmark",
        "",
        "The isolated-word result accepts every canonical dictionary headword attached to the same English gloss.",
        "The elder corpus is reported separately and is not pooled with dictionary words.",
        "",
        "## Isolated dictionary glosses",
        "",
        "| Model | Rows | Exact accepted | Token contains accepted | Mean chrF++ | Mean CER | Empty |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for label, result in payload["models"].items():
        metric = result["lexicon"]["overall"]
        lines.append(
            f"| {label} | {metric['rows']} | {metric['normalized_exact_percent']:.2f}% "
            f"({metric['normalized_exact_count']}) | {metric['token_contains_reference_percent']:.2f}% | "
            f"{metric['mean_maximum_sentence_chrf']:.2f} | "
            f"{metric['mean_minimum_character_error_rate']:.3f} | {metric['empty_outputs']} |"
        )
    lines.extend(
        [
            "",
            "## Elder sentences",
            "",
            "| Model | Rows | Exact | Corpus chrF++ | Mean sentence chrF++ | Empty |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for label, result in payload["models"].items():
        metric = result["elder"]
        lines.append(
            f"| {label} | {metric['rows']} | {metric['exact_match_percent']:.2f}% "
            f"({metric['exact_match_count']}) | {metric['corpus_chrf']:.2f} | "
            f"{metric['mean_sentence_chrf']:.2f} | {metric['empty_outputs']} |"
        )
    lines.extend(
        [
            "",
            "## Interpretation limits",
            "",
            "- Dictionary exact match is strict canonical-form retrieval, not semantic adequacy for free sentences.",
            "- The dictionary informed earlier corpus work; this is a coverage probe, not an untouched test sample.",
            "- The 43 elder rows are rights-cleared and excluded from training, but were observed in earlier evaluations.",
            "- Pairwise 95% intervals in the JSON are paired row-level bootstrap intervals, not estimates over speakers, texts, or training seeds.",
            "- Near misses require human linguistic review; character similarity is diagnostic and does not establish grammatical correctness.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    lexicon_paths = labeled_paths(args.lexicon_prediction)
    elder_paths = labeled_paths(args.elder_prediction)
    if list(lexicon_paths) != list(elder_paths):
        raise SystemExit("lexicon and elder labels must match in the same order")

    lexicon_reports = {
        label: load_predictions(path, "dictionary_single_gloss_probe")
        for label, path in lexicon_paths.items()
    }
    elder_reports = {
        label: load_predictions(path, "elder_sentence_pair_parallel")
        for label, path in elder_paths.items()
    }
    assert_aligned(lexicon_reports)
    assert_aligned(elder_reports)

    chrf = sacrebleu.metrics.CHRF(word_order=2)
    models: dict[str, Any] = {}
    vectors: dict[str, dict[str, list[float]]] = defaultdict(dict)
    for label in lexicon_paths:
        lexicon_rows = [score_lexicon_row(row, chrf) for row in lexicon_reports[label]]
        elder_metrics, elder_sentence_scores = score_elder(elder_reports[label], chrf)
        models[label] = {
            "lexicon": {"overall": aggregate_lexicon(lexicon_rows), "strata": strata(lexicon_rows)},
            "elder": elder_metrics,
            "prediction_files": {
                "lexicon": str(lexicon_paths[label]),
                "elder": str(elder_paths[label]),
            },
        }
        vectors[label] = {
            "lexicon_exact": [float(row["normalized_exact"]) for row in lexicon_rows],
            "lexicon_chrf": [row["maximum_sentence_chrf"] for row in lexicon_rows],
            "elder_chrf": elder_sentence_scores,
        }

    labels = list(lexicon_paths)
    payload = {
        "schema_version": 1,
        "decoder": {
            "num_beams": 1,
            "no_repeat_ngram_size": 4,
            "repetition_penalty": 1.10,
            "length_penalty": 1.0,
        },
        "bootstrap": {"samples": args.bootstrap_samples, "seed": args.seed},
        "models": models,
        "pairwise": pairwise(labels, vectors, args.bootstrap_samples, args.seed),
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    args.output_md.write_text(markdown(payload), encoding="utf-8")
    print(json.dumps({label: result["lexicon"]["overall"] for label, result in models.items()}, indent=2))


if __name__ == "__main__":
    main()

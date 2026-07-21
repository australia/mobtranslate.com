#!/usr/bin/env python3
"""Produce reproducible Mi'gmaq translation diagnostics and confidence intervals."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, Callable

import numpy as np
import sacrebleu


TOKEN_RE = re.compile(r"\w+(?:['’]\w+)*|[^\w\s]", re.UNICODE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evaluation", required=True)
    parser.add_argument("--train-file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--baseline-evaluation")
    parser.add_argument("--bootstrap-samples", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20260712)
    return parser.parse_args()


def normalize(text: Any) -> str:
    return " ".join(str(text or "").split())


def tokens(text: str) -> list[str]:
    return TOKEN_RE.findall(normalize(text).lower())


def read_json(file: str) -> dict[str, Any]:
    return json.loads(Path(file).read_text(encoding="utf-8"))


def read_jsonl(file: str) -> list[dict[str, Any]]:
    with open(file, "r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def scores(predictions: list[str], references: list[str]) -> dict[str, float | str]:
    bleu = sacrebleu.metrics.BLEU()
    chrf = sacrebleu.metrics.CHRF(word_order=2)
    bleu_score = bleu.corpus_score(predictions, [references])
    chrf_score = chrf.corpus_score(predictions, [references])
    return {
        "bleu": bleu_score.score,
        "bleu_signature": str(bleu.get_signature()),
        "chrf": chrf_score.score,
        "chrf_signature": str(chrf.get_signature()),
        "exact_match": sum(prediction == reference for prediction, reference in zip(predictions, references)) / len(predictions),
    }


def percentile_interval(values: list[float]) -> dict[str, float]:
    return {
        "lower_95": float(np.percentile(values, 2.5)),
        "median": float(np.percentile(values, 50)),
        "upper_95": float(np.percentile(values, 97.5)),
    }


def bootstrap_intervals(
    predictions: list[str], references: list[str], samples: int, seed: int,
) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    bleu = sacrebleu.metrics.BLEU()
    chrf = sacrebleu.metrics.CHRF(word_order=2)
    values: dict[str, list[float]] = {"bleu": [], "chrf": [], "exact_match": []}
    size = len(predictions)
    for _ in range(samples):
        indexes = rng.integers(0, size, size=size)
        sample_predictions = [predictions[int(index)] for index in indexes]
        sample_references = [references[int(index)] for index in indexes]
        values["bleu"].append(bleu.corpus_score(sample_predictions, [sample_references]).score)
        values["chrf"].append(chrf.corpus_score(sample_predictions, [sample_references]).score)
        values["exact_match"].append(
            sum(prediction == reference for prediction, reference in zip(sample_predictions, sample_references)) / size)
    return {metric: percentile_interval(metric_values) for metric, metric_values in values.items()}


def repeated_ngram(text: str, size: int) -> bool:
    row_tokens = tokens(text)
    ngrams = [tuple(row_tokens[index:index + size]) for index in range(max(0, len(row_tokens) - size + 1))]
    return len(ngrams) != len(set(ngrams))


def terminal_punctuation(text: str) -> str:
    stripped = normalize(text).rstrip()
    if not stripped:
        return ""
    character = stripped[-1]
    return character if unicodedata.category(character).startswith("P") else ""


def row_headwords(row: dict[str, Any]) -> set[str]:
    records = row.get("source_records", [])
    if not isinstance(records, list):
        return set()
    return {
        normalize(record.get("headword", "")).casefold()
        for record in records
        if isinstance(record, dict) and normalize(record.get("headword", ""))
    }


def slice_metrics(
    rows: list[dict[str, Any]], predicate: Callable[[dict[str, Any]], bool],
) -> dict[str, Any]:
    selected = [row for row in rows if predicate(row)]
    if not selected:
        return {"rows": 0}
    predictions = [normalize(row["prediction"]) for row in selected]
    references = [normalize(row["reference"]) for row in selected]
    return {"rows": len(selected), **scores(predictions, references)}


def paired_baseline_delta(
    rows: list[dict[str, Any]], baseline_file: str, samples: int, seed: int,
) -> dict[str, Any]:
    baseline_rows = {str(row["id"]): row for row in read_json(baseline_file).get("predictions", [])}
    if set(baseline_rows) != {str(row["id"]) for row in rows}:
        raise ValueError("Candidate and baseline evaluations do not contain identical row IDs")
    candidate_predictions = [normalize(row["prediction"]) for row in rows]
    baseline_predictions = [normalize(baseline_rows[str(row["id"])]["prediction"]) for row in rows]
    references = [normalize(row["reference"]) for row in rows]
    rng = np.random.default_rng(seed)
    bleu = sacrebleu.metrics.BLEU()
    chrf = sacrebleu.metrics.CHRF(word_order=2)
    deltas: dict[str, list[float]] = {"bleu": [], "chrf": [], "exact_match": []}
    size = len(rows)
    for _ in range(samples):
        indexes = rng.integers(0, size, size=size)
        candidate = [candidate_predictions[int(index)] for index in indexes]
        baseline = [baseline_predictions[int(index)] for index in indexes]
        refs = [references[int(index)] for index in indexes]
        deltas["bleu"].append(bleu.corpus_score(candidate, [refs]).score - bleu.corpus_score(baseline, [refs]).score)
        deltas["chrf"].append(chrf.corpus_score(candidate, [refs]).score - chrf.corpus_score(baseline, [refs]).score)
        candidate_exact = sum(prediction == reference for prediction, reference in zip(candidate, refs)) / size
        baseline_exact = sum(prediction == reference for prediction, reference in zip(baseline, refs)) / size
        deltas["exact_match"].append(candidate_exact - baseline_exact)
    candidate_scores = scores(candidate_predictions, references)
    baseline_scores = scores(baseline_predictions, references)
    return {
        "baseline_file": str(Path(baseline_file).resolve()),
        "point_estimate": {
            metric: float(candidate_scores[metric]) - float(baseline_scores[metric])
            for metric in ("bleu", "chrf", "exact_match")
        },
        "bootstrap_delta_95": {metric: percentile_interval(values) for metric, values in deltas.items()},
    }


def main() -> None:
    args = parse_args()
    evaluation = read_json(args.evaluation)
    rows = evaluation.get("predictions", [])
    if not rows:
        raise ValueError("Evaluation contains no predictions")
    ids = [str(row.get("id")) for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Evaluation row IDs are not unique")

    predictions = [normalize(row["prediction"]) for row in rows]
    references = [normalize(row["reference"]) for row in rows]
    inputs = [normalize(row["input_text"]) for row in rows]
    train_rows = read_jsonl(args.train_file)
    train_targets = {normalize(row["output_text"]) for row in train_rows}
    train_target_tokens = {token for row in train_rows for token in tokens(row["output_text"])}
    train_headwords = {headword for row in train_rows for headword in row_headwords(row)}
    reference_token_list = [token for reference in references for token in tokens(reference)]
    prediction_token_list = [token for prediction in predictions for token in tokens(prediction)]
    output_counts = Counter(predictions)
    ratios = [len(prediction) / max(1, len(reference)) for prediction, reference in zip(predictions, references)]
    sentence_chrf = sacrebleu.metrics.CHRF(word_order=2)

    report: dict[str, Any] = {
        "evaluation_file": str(Path(args.evaluation).resolve()),
        "train_file": str(Path(args.train_file).resolve()),
        "rows": len(rows),
        "metrics": scores(predictions, references),
        "bootstrap": {
            "samples": args.bootstrap_samples,
            "seed": args.seed,
            "intervals_95": bootstrap_intervals(predictions, references, args.bootstrap_samples, args.seed),
        },
        "surface_diagnostics": {
            "empty_outputs": sum(not prediction for prediction in predictions),
            "source_copy_outputs": sum(prediction == source for prediction, source in zip(predictions, inputs)),
            "outputs_exactly_matching_any_training_target": sum(prediction in train_targets for prediction in predictions),
            "unique_outputs": len(output_counts),
            "maximum_output_frequency": max(output_counts.values()),
            "outputs_with_repeated_bigram": sum(repeated_ngram(prediction, 2) for prediction in predictions),
            "outputs_with_repeated_trigram": sum(repeated_ngram(prediction, 3) for prediction in predictions),
            "mean_character_length_ratio": float(np.mean(ratios)),
            "median_character_length_ratio": float(np.median(ratios)),
            "p05_character_length_ratio": float(np.percentile(ratios, 5)),
            "p95_character_length_ratio": float(np.percentile(ratios, 95)),
            "terminal_punctuation_match": sum(
                terminal_punctuation(prediction) == terminal_punctuation(reference)
                for prediction, reference in zip(predictions, references)
            ) / len(rows),
            "apostrophe_presence_match": sum(
                ("'" in prediction or "’" in prediction) == ("'" in reference or "’" in reference)
                for prediction, reference in zip(predictions, references)
            ) / len(rows),
            "reference_tokens_seen_in_training": sum(token in train_target_tokens for token in reference_token_list) / max(1, len(reference_token_list)),
            "prediction_tokens_seen_in_training": sum(token in train_target_tokens for token in prediction_token_list) / max(1, len(prediction_token_list)),
        },
        "length_slices": {
            "short_1_to_5_source_tokens": slice_metrics(rows, lambda row: len(tokens(row["input_text"])) <= 5),
            "medium_6_to_10_source_tokens": slice_metrics(rows, lambda row: 6 <= len(tokens(row["input_text"])) <= 10),
            "long_11_plus_source_tokens": slice_metrics(rows, lambda row: len(tokens(row["input_text"])) >= 11),
        },
        "headword_slices": {
            "definition": "A held-out row is seen-headword when any normalized source-record headword occurs in the training rows.",
            "train_unique_headwords": len(train_headwords),
            "seen_headword": slice_metrics(rows, lambda row: bool(row_headwords(row) & train_headwords)),
            "unseen_headword": slice_metrics(rows, lambda row: not bool(row_headwords(row) & train_headwords)),
            "rows_without_headword_metadata": sum(not row_headwords(row) for row in rows),
        },
        "lowest_sentence_chrf": sorted([
            {
                "id": row.get("id"),
                "canonical_ref": row.get("canonical_ref"),
                "source": normalize(row.get("input_text")),
                "prediction": normalize(row.get("prediction")),
                "reference": normalize(row.get("reference")),
                "sentence_chrf": sentence_chrf.sentence_score(
                    normalize(row.get("prediction")), [normalize(row.get("reference"))]).score,
            }
            for row in rows
        ], key=lambda row: row["sentence_chrf"])[:50],
        "interpretation_boundary": "These are corpus and surface-form diagnostics, not speaker judgements of grammatical, dialectal, or cultural adequacy.",
    }
    if args.baseline_evaluation:
        report["paired_baseline_comparison"] = paired_baseline_delta(
            rows, args.baseline_evaluation, args.bootstrap_samples, args.seed + 1)
    Path(args.output).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "rows": report["rows"],
        "metrics": report["metrics"],
        "intervals_95": report["bootstrap"]["intervals_95"],
        "surface_diagnostics": report["surface_diagnostics"],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

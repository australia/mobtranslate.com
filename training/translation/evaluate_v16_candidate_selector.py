#!/usr/bin/env python3
"""Evaluate cheap candidate selectors against v16 oracle ceilings."""

from __future__ import annotations

import argparse
import collections
import itertools
import json
import re
import statistics
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path(
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30"
)
TOKEN_RE = re.compile(r"[A-Za-z0-9-]+")
TAG_RE = re.compile(r"<[^>]+>")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument(
        "--v16-dir",
        type=Path,
        default=DEFAULT_ROOT / "analysis" / "v16-router-candidate-diagnostic-2026-07-02",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_ROOT / "analysis" / "v16.2-candidate-selector-diagnostic-2026-07-02",
    )
    parser.add_argument("--folds", type=int, default=5)
    return parser.parse_args()


def clean(text: Any) -> str:
    return " ".join(str(text or "").split())


def untag(text: Any) -> str:
    return clean(TAG_RE.sub(" ", str(text or "")))


def norm(text: Any) -> str:
    return clean(text).casefold()


def tokens(text: Any) -> list[str]:
    return TOKEN_RE.findall(norm(text))


def ngrams(text: str, n: int) -> dict[str, int]:
    value = clean(text)
    if len(value) < n:
        return {}
    output: dict[str, int] = {}
    for index in range(len(value) - n + 1):
        gram = value[index : index + n]
        output[gram] = output.get(gram, 0) + 1
    return output


def ngram_set(text: str, n: int = 3) -> set[str]:
    value = clean(text)
    if len(value) < n:
        return set()
    return {value[index : index + n] for index in range(len(value) - n + 1)}


def set_overlap_f(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    overlap = len(left & right)
    precision = overlap / len(left)
    recall = overlap / len(right)
    return 100 * ((2 * precision * recall) / (precision + recall)) if precision + recall else 0.0


def char_overlap_f(left_text: str, right_text: str, max_order: int = 6) -> float:
    scores: list[float] = []
    for n in range(1, max_order + 1):
        left = ngrams(left_text, n)
        right = ngrams(right_text, n)
        if not left or not right:
            continue
        overlap = sum(min(count, right.get(gram, 0)) for gram, count in left.items())
        precision = overlap / sum(left.values())
        recall = overlap / sum(right.values())
        if precision + recall:
            scores.append((2 * precision * recall) / (precision + recall))
    return 100 * average(scores) if scores else 0.0


def repeat_share(text: str) -> float:
    parts = tokens(text)
    if not parts:
        return 0.0
    counts = collections.Counter(parts)
    return max(counts.values()) / len(parts)


def token_recall(prediction: str, reference: str) -> float:
    ref_tokens = tokens(reference)
    if not ref_tokens:
        return 1.0
    pred_tokens = set(tokens(prediction))
    return sum(1 for token in ref_tokens if token in pred_tokens) / len(ref_tokens)


def length_ratio(prediction: str, reference: str) -> float:
    return len(tokens(prediction)) / max(len(tokens(reference)), 1)


def average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def describe(values: list[float]) -> dict[str, float]:
    if not values:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0}
    return {
        "mean": average(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
    }


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    char_scores = [
        float(row.get("candidate_char_f", char_overlap_f(row["prediction"], row["reference"])))
        for row in rows
    ]
    exact = sum(1 for row in rows if clean(row["prediction"]) == clean(row["reference"]))
    return {
        "rows": len(rows),
        "exact": exact,
        "exact_rate": exact / len(rows) if rows else 0.0,
        "empty": sum(1 for row in rows if not clean(row["prediction"])),
        "sentence_char_f": describe(char_scores),
        "reference_token_recall": describe([token_recall(row["prediction"], row["reference"]) for row in rows]),
        "length_ratio": describe([length_ratio(row["prediction"], row["reference"]) for row in rows]),
        "repeat_share": describe([repeat_share(row["prediction"]) for row in rows]),
    }


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def source_overlap(prediction: str, source: str) -> float:
    pred = tokens(prediction)
    if not pred:
        return 0.0
    source_tokens = set(tokens(untag(source)))
    if not source_tokens:
        return 0.0
    return sum(1 for token in pred if token in source_tokens) / len(pred)


def candidate_consensus(index: int, trigram_sets: list[set[str]]) -> dict[str, float]:
    scores = [
        set_overlap_f(trigram_sets[index], other)
        for other_index, other in enumerate(trigram_sets)
        if other_index != index
    ]
    return {
        "consensus_mean": average(scores) if scores else 0.0,
        "consensus_max": max(scores) if scores else 0.0,
    }


def row_source_token_ratio(row: dict[str, Any], text: str) -> float:
    return len(tokens(text)) / max(len(tokens(untag(row.get("input_text", "")))), 1)


def ratio_fit(value: float, target: float) -> float:
    if target <= 0:
        return 0.0
    return 100 / (1 + abs(value - target) / target)


def prepare_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in data["rows"]:
        candidates = row.get("candidates", [])
        trigram_sets = [ngram_set(candidate.get("prediction", "")) for candidate in candidates]
        for index, candidate in enumerate(candidates):
            consensus = candidate_consensus(index, trigram_sets)
            prediction = clean(candidate.get("prediction", ""))
            candidate["target_char_f"] = float(candidate.get("sentence_char_f", 0.0))
            candidate["features"] = {
                **consensus,
                "repeat_penalty": 100 * repeat_share(prediction),
                "source_overlap_penalty": 100 * source_overlap(prediction, row.get("input_text", "")),
                "pred_source_token_ratio": row_source_token_ratio(row, prediction),
                "pred_source_char_ratio": len(prediction) / max(len(untag(row.get("input_text", ""))), 1),
            }
        rows.append(row)
    return rows


def train_stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_label: dict[str, list[float]] = collections.defaultdict(list)
    target_token_ratios: list[float] = []
    target_char_ratios: list[float] = []
    for row in rows:
        reference = clean(row["reference"])
        target_token_ratios.append(row_source_token_ratio(row, reference))
        target_char_ratios.append(len(reference) / max(len(untag(row.get("input_text", ""))), 1))
        for candidate in row["candidates"]:
            by_label[candidate["label"]].append(candidate["target_char_f"])
    label_prior = {
        label: average(values)
        for label, values in by_label.items()
        if values
    }
    return {
        "label_prior": label_prior,
        "target_token_ratio": average(target_token_ratios) if target_token_ratios else 1.0,
        "target_char_ratio": average(target_char_ratios) if target_char_ratios else 1.0,
    }


def score_candidate(candidate: dict[str, Any], stats: dict[str, Any], weights: dict[str, float]) -> float:
    features = candidate["features"]
    label_prior = stats["label_prior"].get(candidate["label"], 0.0)
    token_fit = ratio_fit(features["pred_source_token_ratio"], stats["target_token_ratio"])
    char_fit = ratio_fit(features["pred_source_char_ratio"], stats["target_char_ratio"])
    return (
        weights["label_prior"] * label_prior
        + weights["consensus_mean"] * features["consensus_mean"]
        + weights["consensus_max"] * features["consensus_max"]
        + weights["token_length_fit"] * token_fit
        + weights["char_length_fit"] * char_fit
        - weights["repeat_penalty"] * features["repeat_penalty"]
        - weights["source_overlap_penalty"] * features["source_overlap_penalty"]
    )


def choose_by_label(row: dict[str, Any], label: str) -> dict[str, Any]:
    for candidate in row["candidates"]:
        if candidate["label"] == label:
            return candidate
    return row["candidates"][0]


def choose_by_score(row: dict[str, Any], stats: dict[str, Any], weights: dict[str, float]) -> dict[str, Any]:
    return max(
        row["candidates"],
        key=lambda candidate: (score_candidate(candidate, stats, weights), candidate["label"]),
    )


def selected_row(row: dict[str, Any], candidate: dict[str, Any], selector: str) -> dict[str, Any]:
    return {
        "key": row.get("key"),
        "id": row.get("id"),
        "input_text": row.get("input_text"),
        "reference": clean(row.get("reference", "")),
        "prediction": clean(candidate.get("prediction", "")),
        "label": candidate.get("label"),
        "selector": selector,
        "candidate_char_f": float(
            candidate.get("target_char_f", candidate.get("sentence_char_f", 0.0))
        ),
        "oracle_label": (row.get("winner") or {}).get("label"),
        "oracle_char_f": (row.get("winner") or {}).get("sentence_char_f"),
    }


def fold_indices(rows: list[dict[str, Any]], folds: int) -> list[list[int]]:
    buckets = [[] for _ in range(folds)]
    for index, row in enumerate(sorted(range(len(rows)), key=lambda pos: str(rows[pos].get("key", "")))):
        buckets[index % folds].append(row)
    return buckets


def grid_weights() -> list[dict[str, float]]:
    base = [
        {"label_prior": 1.0},
        {"consensus_mean": 1.0},
        {"consensus_max": 1.0},
        {"token_length_fit": 1.0},
        {"char_length_fit": 1.0},
        {"label_prior": 1.0, "consensus_mean": 0.5},
        {"label_prior": 1.0, "consensus_max": 0.5},
        {"label_prior": 1.0, "token_length_fit": 0.5},
        {"label_prior": 1.0, "char_length_fit": 0.5},
        {"consensus_mean": 1.0, "token_length_fit": 0.5},
        {"consensus_mean": 1.0, "char_length_fit": 0.5},
        {"label_prior": 1.0, "consensus_mean": 0.5, "token_length_fit": 0.5},
        {"label_prior": 1.0, "consensus_mean": 0.5, "char_length_fit": 0.5},
        {"label_prior": 1.0, "consensus_mean": 1.0, "token_length_fit": 0.5, "char_length_fit": 0.5},
        {"label_prior": 2.0, "consensus_mean": 1.0, "token_length_fit": 0.5, "char_length_fit": 0.5},
    ]
    output: list[dict[str, float]] = []
    penalties = [
        {},
        {"repeat_penalty": 0.25},
        {"source_overlap_penalty": 0.25},
        {"repeat_penalty": 0.25, "source_overlap_penalty": 0.25},
    ]
    keys = [
        "label_prior",
        "consensus_mean",
        "consensus_max",
        "token_length_fit",
        "char_length_fit",
        "repeat_penalty",
        "source_overlap_penalty",
    ]
    for item, penalty in itertools.product(base, penalties):
        weights = {key: 0.0 for key in keys}
        weights.update(item)
        weights.update(penalty)
        output.append(weights)
    return output


def evaluate_weights(rows: list[dict[str, Any]], stats: dict[str, Any], weights: dict[str, float]) -> float:
    scores = []
    for row in rows:
        chosen = choose_by_score(row, stats, weights)
        scores.append(chosen["target_char_f"])
    return average(scores)


def train_best_weights(rows: list[dict[str, Any]], stats: dict[str, Any]) -> tuple[dict[str, float], float]:
    best_weights: dict[str, float] | None = None
    best_score = -1.0
    for weights in grid_weights():
        score = evaluate_weights(rows, stats, weights)
        if score > best_score:
            best_score = score
            best_weights = weights
    if best_weights is None:
        raise RuntimeError("weight grid is empty")
    return best_weights, best_score


def run_selectors(name: str, data: dict[str, Any], default_label: str, folds: int) -> dict[str, Any]:
    rows = prepare_rows(data)

    fixed_rows = [
        selected_row(row, choose_by_label(row, default_label), "fixed_default")
        for row in rows
    ]
    consensus_rows = [
        selected_row(
            row,
            max(row["candidates"], key=lambda candidate: (candidate["features"]["consensus_mean"], candidate["label"])),
            "consensus_mean",
        )
        for row in rows
    ]

    fold_outputs: list[dict[str, Any]] = []
    label_prior_rows: list[dict[str, Any]] = []
    grid_rows: list[dict[str, Any]] = []
    folds_indices = fold_indices(rows, max(2, folds))
    for fold_number, test_positions in enumerate(folds_indices, 1):
        test_set = set(test_positions)
        train_rows = [row for index, row in enumerate(rows) if index not in test_set]
        test_rows = [row for index, row in enumerate(rows) if index in test_set]
        stats = train_stats(train_rows)
        best_label = max(stats["label_prior"], key=lambda label: stats["label_prior"][label])
        weights, train_score = train_best_weights(train_rows, stats)
        fold_label_rows = [
            selected_row(row, choose_by_label(row, best_label), "cv_label_prior")
            for row in test_rows
        ]
        fold_grid_rows = [
            selected_row(row, choose_by_score(row, stats, weights), "cv_grid_selector")
            for row in test_rows
        ]
        label_prior_rows.extend(fold_label_rows)
        grid_rows.extend(fold_grid_rows)
        fold_outputs.append(
            {
                "fold": fold_number,
                "train_rows": len(train_rows),
                "test_rows": len(test_rows),
                "best_label": best_label,
                "best_weights": weights,
                "train_score": train_score,
                "label_prior_test": summarize(fold_label_rows),
                "grid_selector_test": summarize(fold_grid_rows),
            }
        )

    oracle_rows = [
        selected_row(row, row["winner"], "oracle")
        for row in rows
        if row.get("winner")
    ]

    selectors = {
        "fixed_default": summarize(fixed_rows),
        "consensus_mean": summarize(consensus_rows),
        "cv_label_prior": summarize(label_prior_rows),
        "cv_grid_selector": summarize(grid_rows),
        "oracle": summarize(oracle_rows),
    }
    selections = {
        "fixed_default": collections.Counter(row["label"] for row in fixed_rows),
        "consensus_mean": collections.Counter(row["label"] for row in consensus_rows),
        "cv_label_prior": collections.Counter(row["label"] for row in label_prior_rows),
        "cv_grid_selector": collections.Counter(row["label"] for row in grid_rows),
        "oracle": collections.Counter(row["label"] for row in oracle_rows),
    }
    return {
        "domain": name,
        "default_label": default_label,
        "folds": fold_outputs,
        "metrics": {
            "rows": len(rows),
            "candidate_labels": data["metrics"]["candidate_labels"],
            "selector_metrics": selectors,
            "selection_counts": {selector: dict(counter.most_common()) for selector, counter in selections.items()},
            "oracle_minus_cv_grid_mean_char_f": (
                selectors["oracle"]["sentence_char_f"]["mean"]
                - selectors["cv_grid_selector"]["sentence_char_f"]["mean"]
            ),
            "cv_grid_minus_fixed_default_mean_char_f": (
                selectors["cv_grid_selector"]["sentence_char_f"]["mean"]
                - selectors["fixed_default"]["sentence_char_f"]["mean"]
            ),
        },
        "selected_rows": {
            "fixed_default": fixed_rows,
            "consensus_mean": consensus_rows,
            "cv_label_prior": label_prior_rows,
            "cv_grid_selector": grid_rows,
            "oracle": oracle_rows,
        },
    }


def metric_line(label: str, metrics: dict[str, Any]) -> str:
    return (
        f"| {label} | {metrics['rows']} | {metrics['exact']} | {metrics['exact_rate']:.3f} | "
        f"{metrics['sentence_char_f']['mean']:.2f} | "
        f"{metrics['reference_token_recall']['mean']:.3f} | "
        f"{metrics['length_ratio']['mean']:.3f} |"
    )


def write_markdown(path: Path, bible: dict[str, Any], usage: dict[str, Any]) -> None:
    lines = [
        "# v16.2 Candidate Selector Diagnostic",
        "",
        "Date: 2026-07-02 UTC",
        "",
        "This is a local no-GPU diagnostic over the v16.1 candidate-ceiling rows.",
        "It tests whether simple selectors can approach the reference-leaking oracle",
        "using only candidate/source features and model labels.",
        "",
    ]
    for title, result in [("Bible Heldout References", bible), ("DB Usage Heldout", usage)]:
        metrics = result["metrics"]["selector_metrics"]
        lines.extend(
            [
                f"## {title}",
                "",
                "| selector | rows | exact | exact rate | mean sentence char-F | mean token recall | mean length ratio |",
                "|---|---:|---:|---:|---:|---:|---:|",
                metric_line("fixed_default", metrics["fixed_default"]),
                metric_line("consensus_mean", metrics["consensus_mean"]),
                metric_line("cv_label_prior", metrics["cv_label_prior"]),
                metric_line("cv_grid_selector", metrics["cv_grid_selector"]),
                metric_line("oracle", metrics["oracle"]),
                "",
                "```text",
                f"default label: {result['default_label']}",
                f"oracle - cv_grid mean char-F: {result['metrics']['oracle_minus_cv_grid_mean_char_f']:.2f}",
                f"cv_grid - fixed_default mean char-F: {result['metrics']['cv_grid_minus_fixed_default_mean_char_f']:.2f}",
                f"cv_grid selection counts: {json.dumps(result['metrics']['selection_counts']['cv_grid_selector'], ensure_ascii=False)}",
                "```",
                "",
            ]
        )
    lines.extend(
        [
            "## Decision",
            "",
            "The selector path is useful only if cross-validated selection beats the fixed",
            "default enough to justify adding another component. If it mostly collapses",
            "to label priors or remains far below oracle, spend the next GPU budget on",
            "domain-separated draft generation instead of a reranker.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    bible = run_selectors(
        "bible",
        read_json(args.v16_dir / "v16.1-bible-candidate-ceiling.json"),
        default_label="v12_direct",
        folds=args.folds,
    )
    usage = run_selectors(
        "usage",
        read_json(args.v16_dir / "v16.1-usage-candidate-ceiling.json"),
        default_label="v10_usage",
        folds=args.folds,
    )
    summary = {
        "root": str(args.root),
        "v16_dir": str(args.v16_dir),
        "output_dir": str(args.output_dir),
        "bible": bible["metrics"],
        "usage": usage["metrics"],
    }
    write_json(args.output_dir / "v16.2-bible-selector.json", bible)
    write_json(args.output_dir / "v16.2-usage-selector.json", usage)
    write_json(args.output_dir / "v16.2-summary.json", summary)
    write_markdown(args.output_dir / "v16.2-candidate-selector-diagnostic-2026-07-02.md", bible, usage)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

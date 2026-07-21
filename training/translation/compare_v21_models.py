#!/usr/bin/env python3
"""Compare two sealed v21 prediction archives with paired statistics.

The script never runs inference or mutates a model archive. It validates that
each shared evaluation has the same ordered inputs and references, recomputes
the metrics from stored predictions, and writes one machine-readable audit.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
from typing import Any, Iterable

import numpy as np
import sacrebleu


EVALUATIONS = (
    "synthetic_dev_1609",
    "synthetic_test_tagged_1606",
    "synthetic_test_untagged_1606",
    "elder_sentence_pair_43",
    "db_usage_heldout_84",
    "bible_direct_heldout_325",
    "bible_ref_heldout_325",
)
DECODE_KEYS = (
    "num_beams",
    "no_repeat_ngram_size",
    "repetition_penalty",
    "length_penalty",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-a-dir", type=Path, required=True)
    parser.add_argument("--model-b-dir", type=Path, required=True)
    parser.add_argument("--label-a", default="v21.1-codex-synthetic-direct")
    parser.add_argument("--label-b", default="v21.2-claude-balanced-replay")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bootstrap-replicates", type=int, default=50_000)
    parser.add_argument("--slice-bootstrap-replicates", type=int, default=20_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--minimum-slice-rows", type=int, default=20)
    return parser.parse_args()


def normalize(text: str | None) -> str:
    return " ".join((text or "").split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_prediction_document(path: Path) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict) or not isinstance(document.get("predictions"), list):
        raise ValueError(f"invalid prediction document: {path}")
    return document


def identity(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("id") or ""),
        normalize(row.get("input_text")),
        normalize(row.get("reference") or row.get("output_text")),
    )


def sentence_chrf(prediction: str, reference: str) -> float:
    return sacrebleu.sentence_chrf(prediction, [reference], word_order=2).score


def exact_binomial_two_sided(successes: int, trials: int) -> float | None:
    """Exact two-sided p-value under Binomial(n, 0.5), ties already removed."""
    if trials == 0:
        return None
    tail = min(successes, trials - successes)
    numerator = sum(math.comb(trials, index) for index in range(tail + 1))
    return min(1.0, 2.0 * (numerator / (2**trials)))


def paired_bootstrap(
    differences: np.ndarray,
    replicates: int,
    seed: int,
) -> dict[str, Any]:
    if differences.size == 0:
        return {"replicates": replicates, "seed": seed, "ci95": [None, None]}
    rng = np.random.default_rng(seed)
    sampled_means = np.empty(replicates, dtype=np.float64)
    offset = 0
    chunk_size = 1_000
    while offset < replicates:
        count = min(chunk_size, replicates - offset)
        indices = rng.integers(0, differences.size, size=(count, differences.size), dtype=np.int32)
        sampled_means[offset : offset + count] = differences[indices].mean(axis=1)
        offset += count
    low, high = np.quantile(sampled_means, [0.025, 0.975])
    return {
        "replicates": replicates,
        "seed": seed,
        "ci95": [float(low), float(high)],
        "bootstrap_mean": float(sampled_means.mean()),
    }


def token_length_ratio(prediction: str, reference: str) -> float:
    return len(prediction.split()) / max(1, len(reference.split()))


def describe(values: Iterable[float]) -> dict[str, float]:
    materialized = list(values)
    return {
        "mean": statistics.mean(materialized),
        "median": statistics.median(materialized),
        "min": min(materialized),
        "max": max(materialized),
    }


def segment_repetition(prediction: str) -> tuple[float, int]:
    """Measure repeated orthographic word/morpheme segments, including hyphen chains."""
    segments = re.findall(r"[^\W\d_]+", prediction.casefold(), flags=re.UNICODE)
    if not segments:
        return 0.0, 0
    highest = max(collections.Counter(segments).values())
    return highest / len(segments), highest


def output_diagnostics(predictions: list[str], references: list[str]) -> dict[str, Any]:
    token_ratios = [
        token_length_ratio(prediction, reference)
        for prediction, reference in zip(predictions, references)
    ]
    character_ratios = [
        len(prediction) / max(1, len(reference))
        for prediction, reference in zip(predictions, references)
    ]
    repetition = [segment_repetition(prediction) for prediction in predictions]
    return {
        "token_length_ratio": describe(token_ratios),
        "character_length_ratio": describe(character_ratios),
        "rows_token_ratio_below_0_5": sum(ratio < 0.5 for ratio in token_ratios),
        "rows_token_ratio_above_2_0": sum(ratio > 2.0 for ratio in token_ratios),
        "rows_character_ratio_above_2_0": sum(ratio > 2.0 for ratio in character_ratios),
        "rows_repeated_segment_at_least_10_times": sum(count >= 10 for _, count in repetition),
        "rows_repeated_segment_share_above_0_5": sum(share > 0.5 for share, _ in repetition),
        "maximum_repeated_segment_count": max(count for _, count in repetition),
        "maximum_repeated_segment_share": max(share for share, _ in repetition),
    }


def paired_metrics(
    rows_a: list[dict[str, Any]],
    rows_b: list[dict[str, Any]],
    replicates: int,
    seed: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    predictions_a = [normalize(row.get("prediction")) for row in rows_a]
    predictions_b = [normalize(row.get("prediction")) for row in rows_b]
    references = [normalize(row.get("reference") or row.get("output_text")) for row in rows_a]
    scores_a = np.asarray(
        [sentence_chrf(prediction, reference) for prediction, reference in zip(predictions_a, references)],
        dtype=np.float64,
    )
    scores_b = np.asarray(
        [sentence_chrf(prediction, reference) for prediction, reference in zip(predictions_b, references)],
        dtype=np.float64,
    )
    differences = scores_b - scores_a
    epsilon = 1e-12
    wins_b = int(np.sum(differences > epsilon))
    wins_a = int(np.sum(differences < -epsilon))
    ties = int(differences.size - wins_a - wins_b)
    exact_a_flags = np.asarray(
        [prediction == reference for prediction, reference in zip(predictions_a, references)], dtype=bool
    )
    exact_b_flags = np.asarray(
        [prediction == reference for prediction, reference in zip(predictions_b, references)], dtype=bool
    )
    exact_a_only = int(np.sum(exact_a_flags & ~exact_b_flags))
    exact_b_only = int(np.sum(exact_b_flags & ~exact_a_flags))
    paired_rows = []
    for row_a, prediction_a, prediction_b, reference, score_a, score_b in zip(
        rows_a, predictions_a, predictions_b, references, scores_a, scores_b
    ):
        paired_rows.append(
            {
                "id": str(row_a.get("id") or ""),
                "input": normalize(row_a.get("unconditioned_input_text") or row_a.get("input_text")),
                "reference": reference,
                "prediction_a": prediction_a,
                "prediction_b": prediction_b,
                "sentence_chrf_a": float(score_a),
                "sentence_chrf_b": float(score_b),
                "delta_b_minus_a": float(score_b - score_a),
                "metadata": row_a.get("synthetic_corpus") or {},
            }
        )
    result = {
        "rows": len(rows_a),
        "model_a": {
            "corpus_chrf": sacrebleu.corpus_chrf(predictions_a, [references], word_order=2).score,
            "corpus_bleu": sacrebleu.corpus_bleu(predictions_a, [references]).score,
            "mean_sentence_chrf": float(scores_a.mean()),
            "exact": int(exact_a_flags.sum()),
            "exact_rate": float(exact_a_flags.mean()),
            "empty": sum(not prediction for prediction in predictions_a),
            "mean_length_ratio": statistics.mean(
                token_length_ratio(prediction, reference)
                for prediction, reference in zip(predictions_a, references)
            ),
            "output_diagnostics": output_diagnostics(predictions_a, references),
        },
        "model_b": {
            "corpus_chrf": sacrebleu.corpus_chrf(predictions_b, [references], word_order=2).score,
            "corpus_bleu": sacrebleu.corpus_bleu(predictions_b, [references]).score,
            "mean_sentence_chrf": float(scores_b.mean()),
            "exact": int(exact_b_flags.sum()),
            "exact_rate": float(exact_b_flags.mean()),
            "empty": sum(not prediction for prediction in predictions_b),
            "mean_length_ratio": statistics.mean(
                token_length_ratio(prediction, reference)
                for prediction, reference in zip(predictions_b, references)
            ),
            "output_diagnostics": output_diagnostics(predictions_b, references),
        },
        "delta_b_minus_a": {
            "corpus_chrf": sacrebleu.corpus_chrf(predictions_b, [references], word_order=2).score
            - sacrebleu.corpus_chrf(predictions_a, [references], word_order=2).score,
            "corpus_bleu": sacrebleu.corpus_bleu(predictions_b, [references]).score
            - sacrebleu.corpus_bleu(predictions_a, [references]).score,
            "mean_sentence_chrf": float(differences.mean()),
            "exact": int(exact_b_flags.sum() - exact_a_flags.sum()),
            "mean_length_ratio": statistics.mean(
                token_length_ratio(prediction, reference)
                for prediction, reference in zip(predictions_b, references)
            )
            - statistics.mean(
                token_length_ratio(prediction, reference)
                for prediction, reference in zip(predictions_a, references)
            ),
        },
        "paired_sentence_chrf": {
            "wins_b": wins_b,
            "ties": ties,
            "wins_a": wins_a,
            "sign_test_two_sided_p": exact_binomial_two_sided(wins_b, wins_a + wins_b),
            **paired_bootstrap(differences, replicates, seed),
        },
        "paired_exact": {
            "b_only": exact_b_only,
            "both": int(np.sum(exact_a_flags & exact_b_flags)),
            "a_only": exact_a_only,
            "neither": int(np.sum(~exact_a_flags & ~exact_b_flags)),
            "mcnemar_exact_two_sided_p": exact_binomial_two_sided(
                exact_b_only, exact_a_only + exact_b_only
            ),
        },
        "identical_prediction_rows": sum(
            prediction_a == prediction_b for prediction_a, prediction_b in zip(predictions_a, predictions_b)
        ),
    }
    return result, paired_rows


def slice_rows(
    paired_rows: list[dict[str, Any]],
    minimum_rows: int,
    replicates: int,
    seed: int,
) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = collections.defaultdict(list)
    ordered = sorted(paired_rows, key=lambda row: int((row["metadata"] or {}).get("source_line") or 0))
    quartile_by_id: dict[str, str] = {}
    quartile_names = ("Q1_earliest", "Q2", "Q3", "Q4_latest")
    for index, row in enumerate(ordered):
        quartile_index = min(3, (index * 4) // max(1, len(ordered)))
        quartile_by_id[row["id"]] = quartile_names[quartile_index]
    for row in paired_rows:
        metadata = row["metadata"] or {}
        grammar = metadata.get("grammar") or ["none"]
        for value in grammar:
            groups[("grammar", str(value))].append(row)
        quality = metadata.get("quality_tier")
        if quality:
            groups[("quality_tier", str(quality))].append(row)
        groups[("source_order_quartile", quartile_by_id[row["id"]])].append(row)

    output = []
    for offset, ((dimension, value), rows) in enumerate(sorted(groups.items())):
        if len(rows) < minimum_rows:
            continue
        differences = np.asarray([row["delta_b_minus_a"] for row in rows], dtype=np.float64)
        wins_b = int(np.sum(differences > 1e-12))
        wins_a = int(np.sum(differences < -1e-12))
        output.append(
            {
                "dimension": dimension,
                "value": value,
                "rows": len(rows),
                "model_a_mean_sentence_chrf": statistics.mean(row["sentence_chrf_a"] for row in rows),
                "model_b_mean_sentence_chrf": statistics.mean(row["sentence_chrf_b"] for row in rows),
                "delta_b_minus_a_mean_sentence_chrf": float(differences.mean()),
                "wins_b": wins_b,
                "ties": len(rows) - wins_a - wins_b,
                "wins_a": wins_a,
                "sign_test_two_sided_p": exact_binomial_two_sided(wins_b, wins_a + wins_b),
                **paired_bootstrap(differences, replicates, seed + offset + 1),
            }
        )
    return output


def representative_examples(rows: list[dict[str, Any]], count: int = 5) -> dict[str, Any]:
    ordered = sorted(rows, key=lambda row: (row["delta_b_minus_a"], row["id"]))
    fields = (
        "id",
        "input",
        "reference",
        "prediction_a",
        "prediction_b",
        "sentence_chrf_a",
        "sentence_chrf_b",
        "delta_b_minus_a",
    )

    def compact(row: dict[str, Any]) -> dict[str, Any]:
        return {field: row[field] for field in fields}

    return {
        "largest_a_advantage": [compact(row) for row in ordered[:count]],
        "largest_b_advantage": [compact(row) for row in reversed(ordered[-count:])],
    }


def model_record(model_dir: Path) -> dict[str, Any]:
    manifest_path = model_dir / "model_manifest.json"
    resource_path = model_dir / "resource_summary.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    resources = json.loads(resource_path.read_text(encoding="utf-8"))
    return {
        "model_dir": str(model_dir),
        "model_manifest_sha256": sha256(manifest_path),
        "merged_model_sha256": sha256(model_dir / "merged/model.safetensors"),
        "adapter_sha256": sha256(model_dir / "adapter/adapter_model.safetensors"),
        "dataset_rows": manifest["dataset"]["split_rows"],
        "training_args": manifest["training_args"],
        "training_metrics": manifest["metrics"],
        "resource_summary": resources,
    }


def main() -> int:
    args = parse_args()
    if args.bootstrap_replicates <= 0 or args.slice_bootstrap_replicates <= 0:
        raise SystemExit("bootstrap replicate counts must be positive")
    model_a_dir = args.model_a_dir.resolve()
    model_b_dir = args.model_b_dir.resolve()
    model_a = model_record(model_a_dir)
    model_b = model_record(model_b_dir)
    training_args_match = model_a["training_args"] == model_b["training_args"]
    evaluations: dict[str, Any] = {}
    synthetic_paired_rows: list[dict[str, Any]] = []
    all_aligned = True
    decode_controls_match = True

    for evaluation_index, evaluation in enumerate(EVALUATIONS):
        path_a = model_a_dir / f"eval_{evaluation}_predictions_greedy.json"
        path_b = model_b_dir / f"eval_{evaluation}_predictions_greedy.json"
        document_a = load_prediction_document(path_a)
        document_b = load_prediction_document(path_b)
        rows_a = document_a["predictions"]
        rows_b = document_b["predictions"]
        identities_a = [identity(row) for row in rows_a]
        identities_b = [identity(row) for row in rows_b]
        aligned = identities_a == identities_b
        if not aligned:
            raise SystemExit(f"ordered input/reference mismatch: {evaluation}")
        decode_a = {key: document_a.get("metrics", {}).get(key) for key in DECODE_KEYS}
        decode_b = {key: document_b.get("metrics", {}).get(key) for key in DECODE_KEYS}
        decode_match = decode_a == decode_b
        if not decode_match:
            raise SystemExit(f"decode-control mismatch: {evaluation}: {decode_a} != {decode_b}")
        metrics, paired_rows = paired_metrics(
            rows_a,
            rows_b,
            args.bootstrap_replicates,
            args.seed + evaluation_index,
        )
        evaluations[evaluation] = {
            "path_a": str(path_a),
            "path_b": str(path_b),
            "sha256_a": sha256(path_a),
            "sha256_b": sha256(path_b),
            "ordered_inputs_and_references_match": aligned,
            "decode_controls_match": decode_match,
            "decode_controls": decode_a,
            "metrics": metrics,
            "representative_examples": representative_examples(paired_rows),
        }
        all_aligned = all_aligned and aligned
        decode_controls_match = decode_controls_match and decode_match
        if evaluation == "synthetic_test_tagged_1606":
            synthetic_paired_rows = paired_rows

    output = {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "labels": {"model_a": args.label_a, "model_b": args.label_b},
        "models": {"model_a": model_a, "model_b": model_b},
        "control_checks": {
            "shared_evaluations": list(EVALUATIONS),
            "all_ordered_inputs_and_references_match": all_aligned,
            "all_decode_controls_match": decode_controls_match,
            "training_args_match": training_args_match,
            "excluded_from_comparison": {
                "train_sample_1024": "Treatment-specific samples have different hashes and membership.",
                "gate_128": "Treatment-specific tiny-gate datasets have different hashes and are readiness checks, not shared heldouts.",
            },
        },
        "evaluations": evaluations,
        "synthetic_test_slices": slice_rows(
            synthetic_paired_rows,
            args.minimum_slice_rows,
            args.slice_bootstrap_replicates,
            args.seed + 10_000,
        ),
        "method": {
            "metric": "sacrebleu 2.x chrF++ (word_order=2), plus corpus BLEU and whitespace-normalized exact match",
            "paired_primary_estimand": "mean per-sentence chrF++ difference (model_b minus model_a)",
            "paired_bootstrap": "Nonparametric paired row bootstrap with percentile 95% confidence interval.",
            "sign_test": "Exact two-sided Binomial(n, 0.5) test after removing sentence-chrF ties.",
            "mcnemar": "Exact two-sided binomial test over discordant exact-match outcomes.",
            "multiple_comparisons": "Slice p-values and intervals are descriptive and unadjusted; no slice-level confirmatory claims are licensed.",
            "inference": "No model inference was rerun; the sealed greedy prediction archives are the evaluated observations.",
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(output["control_checks"], indent=2))
    for evaluation, record in evaluations.items():
        delta = record["metrics"]["delta_b_minus_a"]
        interval = record["metrics"]["paired_sentence_chrf"]["ci95"]
        print(
            f"{evaluation}: corpus chrF delta={delta['corpus_chrf']:+.3f}; "
            f"mean sentence chrF delta={delta['mean_sentence_chrf']:+.3f}; "
            f"paired 95% CI=[{interval[0]:+.3f}, {interval[1]:+.3f}]"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

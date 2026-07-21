#!/usr/bin/env python3
"""Run post-hoc, cluster-aware diagnostics on the opened Mi'kmaq sealed test."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
import hashlib
import json
import math
from pathlib import Path
import random
import statistics
import tempfile
from typing import Any, Callable, Iterable, Sequence

from sacrebleu.metrics import CHRF

from analyze_migmaq_v3_2_lesson_failures import (
    coverage_bucket,
    exposure_summary,
    fraction,
    length_bucket,
    multiset_overlap,
    normalize,
    punctuation_shape,
    schedule_token_counts,
    word_tokens,
)
from compare_migmaq_v3_3_sealed_test import has_repeated_ngram


ARMS = ("base", "retention", "candidate")
EXPECTED_SHA256 = {
    "base": "5772c5aa28d4d59e03045dfbd2c51533fdbb3e9d223b38951c7c6e369ee54182",
    "retention": "f7a7f0f1210f07849a1ff36701ba4852c50625d35c3a7f01755d137e5e67db8d",
    "candidate": "67019549ec1b5c7dd1e32b183e78d130a29dab9b54d208da6c5a5364163054cc",
    "comparison": "db39f9322fe5ac0646d400c9089b0a2d43e49948df149e5e24f00b907e3c5977",
    "retention_schedule": "7cfa501305992c561781a18ff72816d2721fbd53d387b6b8751af488bb969aee",
    "candidate_schedule": "26f46486c0901dfb24223579a6e4ba32edb5e16ca60335ee7271c6083610536e",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    for arm in ARMS:
        parser.add_argument(f"--{arm}-evaluation", type=Path, required=True)
    parser.add_argument("--sealed-comparison", type=Path, required=True)
    parser.add_argument("--retention-schedule", type=Path, required=True)
    parser.add_argument("--candidate-schedule", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=5000)
    parser.add_argument("--bootstrap-seed", type=int, default=20260725)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"non-object at {path}:{line_number}")
            rows.append(value)
    return rows


def percentile(values: Sequence[float], fraction_value: float) -> float:
    if not values:
        raise ValueError("cannot take percentile of empty values")
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction_value
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def align_payloads(payloads: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    indexed: dict[str, dict[str, dict[str, Any]]] = {}
    for arm, payload in payloads.items():
        rows = payload.get("predictions")
        if not isinstance(rows, list) or len(rows) != 133:
            raise ValueError(f"{arm} does not contain 133 sealed predictions")
        indexed[arm] = {str(row["id"]): row for row in rows}
        if len(indexed[arm]) != len(rows):
            raise ValueError(f"duplicate prediction IDs for {arm}")
    ids = [str(row["id"]) for row in payloads["base"]["predictions"]]
    if any(set(indexed[arm]) != set(ids) for arm in ARMS):
        raise ValueError("sealed prediction IDs differ across arms")

    aligned: list[dict[str, Any]] = []
    for row_id in ids:
        source = str(indexed["base"][row_id]["input_text"])
        reference = str(
            indexed["base"][row_id].get("reference")
            or indexed["base"][row_id]["output_text"]
        )
        for arm in ARMS:
            row = indexed[arm][row_id]
            if row.get("split") != "test" or row.get("task") != "translate":
                raise ValueError(f"wrong split/task for {row_id}")
            if str(row["input_text"]) != source:
                raise ValueError(f"source changed across arms: {row_id}")
            if str(row.get("reference") or row["output_text"]) != reference:
                raise ValueError(f"reference changed across arms: {row_id}")
        metadata = indexed["candidate"][row_id]
        aligned.append(
            {
                "id": row_id,
                "input_text": source,
                "reference": reference,
                "predictions": {
                    arm: str(indexed[arm][row_id]["prediction"]) for arm in ARMS
                },
                "lesson_id": str(metadata.get("lesson_id")),
                "lesson_title": str(
                    (metadata.get("source_locator") or {}).get("lesson_title") or ""
                ),
                "container_kind": str(metadata.get("container_kind")),
                "split_component_id": str(metadata.get("split_component_id")),
                "quality_flags": metadata.get("quality_flags") or [],
            }
        )
    return aligned


def nearest_training_source(
    source_tokens: Sequence[str],
    source: str,
    unique_training: dict[str, set[str]],
    inverted: dict[str, set[str]],
) -> dict[str, Any]:
    source_set = set(source_tokens)
    candidates = set().union(*(inverted.get(token, set()) for token in source_set))
    if not candidates:
        return {
            "source": None,
            "token_jaccard": 0.0,
            "character_sequence_ratio": 0.0,
            "exact": False,
        }
    ranked = sorted(
        candidates,
        key=lambda candidate: (
            len(source_set & unique_training[candidate])
            / max(1, len(source_set | unique_training[candidate])),
            candidate,
        ),
        reverse=True,
    )
    best_candidates = ranked[:25]
    best = max(
        best_candidates,
        key=lambda candidate: SequenceMatcher(
            None, normalize(source), candidate
        ).ratio(),
    )
    return {
        "source": best,
        "token_jaccard": len(source_set & unique_training[best])
        / max(1, len(source_set | unique_training[best])),
        "character_sequence_ratio": SequenceMatcher(
            None, normalize(source), best
        ).ratio(),
        "exact": normalize(source) == best,
    }


def nearest_bucket(value: float) -> str:
    if value >= 0.9:
        return "0.90-1.00"
    if value >= 0.7:
        return "0.70-0.89"
    if value >= 0.5:
        return "0.50-0.69"
    return "below-0.50"


def score_subset(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    metric = CHRF(word_order=2)
    references = [str(row["reference"]) for row in rows]
    scores = {
        arm: metric.corpus_score(
            [str(row["predictions"][arm]) for row in rows], [references]
        ).score
        for arm in ARMS
    }
    deltas = [
        float(row["scores"]["candidate"]["sentence_chrf_delta_retention"])
        for row in rows
    ]
    return {
        "rows": len(rows),
        "corpus_chrf": scores,
        "candidate_delta_vs_retention": scores["candidate"] - scores["retention"],
        "candidate_delta_vs_base": scores["candidate"] - scores["base"],
        "candidate_improved_rows_vs_retention": sum(value > 0 for value in deltas),
        "candidate_tied_rows_vs_retention": sum(value == 0 for value in deltas),
        "candidate_worsened_rows_vs_retention": sum(value < 0 for value in deltas),
        "mean_candidate_sentence_chrf_delta_vs_retention": statistics.fmean(deltas),
    }


def aggregate(
    rows: Sequence[dict[str, Any]], key: Callable[[dict[str, Any]], str]
) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[key(row)].append(row)
    return {label: score_subset(members) for label, members in sorted(grouped.items())}


def cluster_bootstrap(
    rows: Sequence[dict[str, Any]],
    *,
    cluster_field: str,
    control: str,
    samples: int,
    seed: int,
) -> dict[str, Any]:
    metric = CHRF(word_order=2)
    clusters: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        clusters[str(row[cluster_field])].append(row)
    cluster_ids = sorted(clusters)

    def delta(members: Sequence[dict[str, Any]]) -> float:
        references = [str(row["reference"]) for row in members]
        candidate = [str(row["predictions"]["candidate"]) for row in members]
        controls = [str(row["predictions"][control]) for row in members]
        return (
            metric.corpus_score(candidate, [references]).score
            - metric.corpus_score(controls, [references]).score
        )

    by_cluster = {
        cluster_id: {
            "rows": len(clusters[cluster_id]),
            "chrf_delta": delta(clusters[cluster_id]),
        }
        for cluster_id in cluster_ids
    }
    rng = random.Random(seed)
    replicates: list[float] = []
    for _ in range(samples):
        sampled: list[dict[str, Any]] = []
        for _ in cluster_ids:
            sampled.extend(clusters[rng.choice(cluster_ids)])
        replicates.append(delta(sampled))
    return {
        "cluster_field": cluster_field,
        "clusters": len(cluster_ids),
        "rows": len(rows),
        "control": control,
        "observed_chrf_delta": delta(rows),
        "percentile_90_interval": {
            "low": percentile(replicates, 0.05),
            "high": percentile(replicates, 0.95),
        },
        "percentile_95_interval": {
            "low": percentile(replicates, 0.025),
            "high": percentile(replicates, 0.975),
        },
        "probability_delta_above_zero": sum(value > 0 for value in replicates)
        / samples,
        "positive_clusters": sum(
            item["chrf_delta"] > 0 for item in by_cluster.values()
        ),
        "negative_clusters": sum(
            item["chrf_delta"] < 0 for item in by_cluster.values()
        ),
        "tied_clusters": sum(item["chrf_delta"] == 0 for item in by_cluster.values()),
        "by_cluster": by_cluster,
        "samples": samples,
        "seed": seed,
        "interpretation": (
            "Post-hoc cluster bootstrap over this fixed source split. It is descriptive, "
            "not a speaker-population interval or preregistered release gate."
        ),
    }


def compact_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "lesson_id": row["lesson_id"],
        "lesson_title": row["lesson_title"],
        "container_kind": row["container_kind"],
        "input_text": row["input_text"],
        "reference": row["reference"],
        "base_prediction": row["predictions"]["base"],
        "retention_prediction": row["predictions"]["retention"],
        "candidate_prediction": row["predictions"]["candidate"],
        "candidate_sentence_chrf": row["scores"]["candidate"]["sentence_chrf"],
        "candidate_delta_vs_retention": row["scores"]["candidate"][
            "sentence_chrf_delta_retention"
        ],
        "candidate_delta_vs_base": row["scores"]["candidate"][
            "sentence_chrf_delta_base"
        ],
        "candidate_reference_token_recall": row["scores"]["candidate"][
            "reference_token_recall"
        ],
        "candidate_target_token_coverage": row["exposure"]["candidate"]["target"][
            "token_occurrence_coverage"
        ],
        "nearest_training_source": row["nearest_candidate_training_source"],
        "observable_flags": row["observable_flags"],
    }


def write_json(path: Path, value: Any) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    inputs = {
        arm: getattr(args, f"{arm}_evaluation").expanduser().resolve() for arm in ARMS
    }
    inputs.update(
        {
            "comparison": args.sealed_comparison.expanduser().resolve(),
            "retention_schedule": args.retention_schedule.expanduser().resolve(),
            "candidate_schedule": args.candidate_schedule.expanduser().resolve(),
        }
    )
    for label, path in inputs.items():
        actual = sha256(path)
        if actual != EXPECTED_SHA256[label]:
            raise ValueError(f"{label} hash mismatch: {actual}")
    comparison = read_json(inputs["comparison"])
    if not comparison["decision"]["passed"]:
        raise ValueError("sealed automatic gate did not pass")

    payloads = {arm: read_json(inputs[arm]) for arm in ARMS}
    rows = align_payloads(payloads)
    schedules = {
        "retention": read_jsonl(inputs["retention_schedule"]),
        "candidate": read_jsonl(inputs["candidate_schedule"]),
    }
    if any(len(schedule) != 19200 for schedule in schedules.values()):
        raise ValueError("frozen schedule row count changed")
    schedule_counts = {
        arm: schedule_token_counts(schedule) for arm, schedule in schedules.items()
    }

    unique_training = {
        normalize(row["input_text"]): set(word_tokens(row["input_text"]))
        for row in schedules["candidate"]
    }
    inverted: dict[str, set[str]] = defaultdict(set)
    for source, tokens in unique_training.items():
        for token in tokens:
            inverted[token].add(source)
    exact_training_sources = set(unique_training)
    exact_training_targets = {
        normalize(row["output_text"]) for row in schedules["candidate"]
    }
    reference_index: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        reference_index[normalize(row["reference"])].add(str(row["id"]))
    metric = CHRF(word_order=2)

    enriched: list[dict[str, Any]] = []
    for row in rows:
        source_tokens = word_tokens(row["input_text"])
        reference_tokens = word_tokens(row["reference"])
        row["source_tokens"] = source_tokens
        row["reference_tokens"] = reference_tokens
        row["source_length_bucket"] = length_bucket(len(source_tokens))
        row["target_length_bucket"] = length_bucket(len(reference_tokens))
        row["punctuation_shape"] = punctuation_shape(str(row["input_text"]))
        row["nearest_candidate_training_source"] = nearest_training_source(
            source_tokens,
            str(row["input_text"]),
            unique_training,
            inverted,
        )
        row["exposure"] = {
            arm: {
                "source": exposure_summary(
                    source_tokens, schedule_counts[arm]["source"]
                ),
                "target": exposure_summary(
                    reference_tokens, schedule_counts[arm]["target"]
                ),
            }
            for arm in ("retention", "candidate")
        }
        scores: dict[str, Any] = {}
        for arm in ARMS:
            prediction = str(row["predictions"][arm])
            prediction_tokens = word_tokens(prediction)
            overlap = multiset_overlap(reference_tokens, prediction_tokens)
            scores[arm] = {
                "sentence_chrf": metric.sentence_score(
                    prediction, [str(row["reference"])]
                ).score,
                "normalized_exact": normalize(prediction)
                == normalize(row["reference"]),
                "reference_token_recall": fraction(overlap, len(reference_tokens)),
                "prediction_surface_precision": fraction(
                    overlap, len(prediction_tokens)
                ),
                "prediction_reference_token_ratio": fraction(
                    len(prediction_tokens), len(reference_tokens)
                ),
            }
        scores["candidate"]["sentence_chrf_delta_retention"] = (
            scores["candidate"]["sentence_chrf"] - scores["retention"]["sentence_chrf"]
        )
        scores["candidate"]["sentence_chrf_delta_base"] = (
            scores["candidate"]["sentence_chrf"] - scores["base"]["sentence_chrf"]
        )
        row["scores"] = scores

        candidate_prediction = str(row["predictions"]["candidate"])
        candidate_ratio = float(
            scores["candidate"]["prediction_reference_token_ratio"] or 0
        )
        other_reference_ids = reference_index.get(
            normalize(candidate_prediction), set()
        ) - {str(row["id"])}
        flags = []
        if scores["candidate"]["normalized_exact"]:
            flags.append("normalized_exact")
        if normalize(candidate_prediction) == normalize(row["input_text"]):
            flags.append("source_copy")
        if has_repeated_ngram(candidate_prediction):
            flags.append("repeated_trigram")
        if candidate_ratio < 0.60:
            flags.append("severe_undertranslation")
        if candidate_ratio > 1.50:
            flags.append("severe_overtranslation")
        if other_reference_ids:
            flags.append("matches_different_sealed_reference")
        if normalize(candidate_prediction) == normalize(
            row["predictions"]["retention"]
        ):
            flags.append("unchanged_from_retention")
        if scores["candidate"]["sentence_chrf_delta_retention"] >= 5:
            flags.append("surface_gain_at_least_5_chrf")
        if scores["candidate"]["sentence_chrf_delta_retention"] <= -5:
            flags.append("surface_regression_at_least_5_chrf")
        row["observable_flags"] = sorted(flags)
        row["wrong_reference_match_ids"] = sorted(other_reference_ids)
        row["exact_training_overlap"] = {
            "source": normalize(row["input_text"]) in exact_training_sources,
            "target": normalize(row["reference"]) in exact_training_targets,
        }
        enriched.append(row)

    if any(
        row["exact_training_overlap"][side]
        for row in enriched
        for side in ("source", "target")
    ):
        raise ValueError("sealed exact source/target leakage into candidate schedule")

    aggregates = {
        "overall": score_subset(enriched),
        "by_container_kind": aggregate(enriched, lambda row: row["container_kind"]),
        "by_source_length": aggregate(
            enriched, lambda row: row["source_length_bucket"]
        ),
        "by_target_length": aggregate(
            enriched, lambda row: row["target_length_bucket"]
        ),
        "by_punctuation_shape": aggregate(
            enriched, lambda row: row["punctuation_shape"]
        ),
        "by_candidate_target_token_coverage": aggregate(
            enriched,
            lambda row: coverage_bucket(
                row["exposure"]["candidate"]["target"]["token_occurrence_coverage"]
            ),
        ),
        "by_nearest_training_source_similarity": aggregate(
            enriched,
            lambda row: nearest_bucket(
                row["nearest_candidate_training_source"]["character_sequence_ratio"]
            ),
        ),
        "by_component": aggregate(enriched, lambda row: row["split_component_id"]),
        "by_lesson": aggregate(
            enriched, lambda row: f"{row['lesson_id']} | {row['lesson_title']}"
        ),
    }
    cluster_uncertainty = {
        "component_candidate_vs_retention": cluster_bootstrap(
            enriched,
            cluster_field="split_component_id",
            control="retention",
            samples=args.bootstrap_samples,
            seed=args.bootstrap_seed,
        ),
        "component_candidate_vs_base": cluster_bootstrap(
            enriched,
            cluster_field="split_component_id",
            control="base",
            samples=args.bootstrap_samples,
            seed=args.bootstrap_seed + 1,
        ),
        "lesson_candidate_vs_retention": cluster_bootstrap(
            enriched,
            cluster_field="lesson_id",
            control="retention",
            samples=args.bootstrap_samples,
            seed=args.bootstrap_seed + 2,
        ),
    }
    flag_counts = Counter(flag for row in enriched for flag in row["observable_flags"])
    ordered = sorted(
        enriched,
        key=lambda row: row["scores"]["candidate"]["sentence_chrf_delta_retention"],
    )
    report = {
        "schema_version": 1,
        "analysis_kind": "migmaq_v3_3_sealed_posthoc_qualitative_diagnostics",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "rows": len(enriched),
        "inputs": {
            label: {"path": str(path), "sha256": EXPECTED_SHA256[label]}
            for label, path in inputs.items()
        },
        "method": {
            "sentence_metric": str(metric.get_signature()),
            "training_exposure": "Exact normalized word-token counts over each 19,200-presentation frozen schedule.",
            "nearest_source": "Maximum token-overlap candidate followed by normalized character SequenceMatcher among the top 25; descriptive only.",
            "cluster_bootstrap": "Resample complete source-defined components or lessons with replacement and preserve all rows within each sampled cluster.",
            "surface_warning": "chrF++, word overlap, length, and nearest-source similarity do not establish semantic or grammatical correctness.",
        },
        "exact_schedule_leakage": {"source_rows": 0, "target_rows": 0},
        "aggregates": aggregates,
        "cluster_uncertainty": cluster_uncertainty,
        "observable_flag_counts": dict(sorted(flag_counts.items())),
        "rankings": {
            "largest_regressions": [compact_row(row) for row in ordered[:25]],
            "largest_improvements": [
                compact_row(row) for row in reversed(ordered[-25:])
            ],
        },
        "claim_limit": "Post-hoc observable error analysis. Fluent Mi'kmaq review is still required for meaning, morphology, naturalness, dialect, and cultural acceptability.",
    }

    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(output_dir)
    output_dir.mkdir(parents=True)
    write_json(output_dir / "analysis.json", report)
    write_jsonl(output_dir / "row-diagnostics.jsonl", enriched)
    write_jsonl(
        output_dir / "largest-regressions.jsonl",
        [compact_row(row) for row in ordered[:25]],
    )
    write_jsonl(
        output_dir / "largest-improvements.jsonl",
        [compact_row(row) for row in reversed(ordered[-25:])],
    )
    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "overall": aggregates["overall"],
                "cluster_uncertainty": cluster_uncertainty,
                "observable_flag_counts": dict(sorted(flag_counts.items())),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

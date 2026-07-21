#!/usr/bin/env python3
"""Analyze paired Mi'kmaq v3.2 lesson-domain failures without opening the sealed test."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import random
import re
import statistics
import tempfile
from typing import Any, Callable, Iterable, Sequence

from sacrebleu.metrics import CHRF


ARMS = ("base", "retention", "lessons20", "lessons40")
CANDIDATES = ("lessons20", "lessons40")
EXPECTED_SHA256 = {
    "paired": "75c64bb02a8a12e427d0b28c723489378ed968e3329551d7943de3bca43ead03",
    "validation": "1b03c1b60457be16ec9c6b4131ff0b7199a1de813b81d730786c50e7ebd94de7",
    "retention": "1cadc3565e46c2aabb33b1890c4eb089dd7e0527d06f1ea047c8adf301c37037",
    "lessons20": "49d490b32875649ac870eec3fae788f5d5336248933d0c775fc01ced585d59d4",
    "lessons40": "9a70d249ea53e4025c6e5967efdaddca840d7536336e07b5452f194467aab2ec",
}
WORD_RE = re.compile(r"[^\W\d_]+(?:['\N{RIGHT SINGLE QUOTATION MARK}-][^\W\d_]+)*", re.UNICODE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paired-ledger", type=Path, required=True)
    parser.add_argument("--lesson-validation", type=Path, required=True)
    parser.add_argument("--retention-schedule", type=Path, required=True)
    parser.add_argument("--lessons20-schedule", type=Path, required=True)
    parser.add_argument("--lessons40-schedule", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def normalize(text: Any) -> str:
    return " ".join(str(text or "").casefold().split())


def word_tokens(text: Any) -> list[str]:
    return [match.group(0).casefold() for match in WORD_RE.finditer(str(text or ""))]


def multiset_overlap(reference: Sequence[str], prediction: Sequence[str]) -> int:
    reference_counts = Counter(reference)
    prediction_counts = Counter(prediction)
    return sum(min(count, prediction_counts[token]) for token, count in reference_counts.items())


def fraction(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def length_bucket(length: int) -> str:
    if length <= 2:
        return "01-02"
    if length <= 5:
        return "03-05"
    if length <= 9:
        return "06-09"
    return "10-plus"


def coverage_bucket(value: float | None) -> str:
    if value is None:
        return "not-applicable"
    if value == 1.0:
        return "100-percent"
    if value >= 0.75:
        return "75-to-99-percent"
    if value >= 0.50:
        return "50-to-74-percent"
    if value > 0:
        return "01-to-49-percent"
    return "zero"


def new_type_bucket(count: int) -> str:
    if count == 0:
        return "zero"
    if count == 1:
        return "one"
    return "two-plus"


def punctuation_shape(text: str) -> str:
    if "?" in text:
        return "question-marked"
    if "/" in text:
        return "slash-alternative"
    if "(" in text or ")" in text or "[" in text or "]" in text:
        return "parenthetical-or-bracketed"
    if "," in text or ";" in text or ":" in text:
        return "multi-part-punctuation"
    if "'" in text or "\N{RIGHT SINGLE QUOTATION MARK}" in text:
        return "apostrophe-bearing"
    return "plain"


def schedule_token_counts(rows: Sequence[dict[str, Any]]) -> dict[str, Counter[str]]:
    return {
        "source": Counter(token for row in rows for token in word_tokens(row["input_text"])),
        "target": Counter(token for row in rows for token in word_tokens(row["output_text"])),
    }


def exposure_summary(tokens: Sequence[str], counts: Counter[str]) -> dict[str, Any]:
    presentations = [counts[token] for token in tokens]
    seen = sum(value > 0 for value in presentations)
    unique = set(tokens)
    return {
        "token_occurrences": len(tokens),
        "seen_token_occurrences": seen,
        "token_occurrence_coverage": fraction(seen, len(tokens)),
        "unique_types": len(unique),
        "seen_unique_types": sum(counts[token] > 0 for token in unique),
        "unseen_unique_types": sorted(token for token in unique if counts[token] == 0),
        "minimum_presentations": min(presentations, default=0),
        "mean_presentations": statistics.fmean(presentations) if presentations else None,
    }


def safe_mean(values: Iterable[float | int | None]) -> float | None:
    finite = [float(value) for value in values if value is not None]
    return statistics.fmean(finite) if finite else None


def percentile(values: Sequence[float], fraction_value: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction_value
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def paired_corpus_bootstrap(
    rows: Sequence[dict[str, Any]],
    candidate: str,
    *,
    samples: int,
    seed: int,
) -> dict[str, Any]:
    metric = CHRF(word_order=2)
    references = [str(row["reference"]) for row in rows]
    retention = [str(row["predictions"]["retention"]) for row in rows]
    treatment = [str(row["predictions"][candidate]) for row in rows]
    observed = metric.corpus_score(treatment, [references]).score - metric.corpus_score(
        retention, [references]
    ).score
    rng = random.Random(seed)
    deltas: list[float] = []
    for _ in range(samples):
        indices = [rng.randrange(len(rows)) for _ in rows]
        sampled_references = [references[index] for index in indices]
        deltas.append(
            metric.corpus_score([treatment[index] for index in indices], [sampled_references]).score
            - metric.corpus_score([retention[index] for index in indices], [sampled_references]).score
        )
    return {
        "rows": len(rows),
        "observed_chrf_delta": observed,
        "percentile_90_interval": {
            "low": percentile(deltas, 0.05),
            "high": percentile(deltas, 0.95),
        },
        "bootstrap_probability_delta_above_zero": sum(value > 0 for value in deltas) / samples,
        "samples": samples,
        "seed": seed,
    }


def aggregate(rows: Sequence[dict[str, Any]], key: Callable[[dict[str, Any]], str]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(key(row), []).append(row)
    result: dict[str, Any] = {}
    metric = CHRF(word_order=2)
    for label, members in sorted(grouped.items()):
        references = [str(row["reference"]) for row in members]
        corpus_chrf = {
            arm: metric.corpus_score(
                [str(row["predictions"][arm]) for row in members],
                [references],
            ).score
            for arm in ARMS
        }
        item: dict[str, Any] = {
            "rows": len(members),
            "corpus_chrf": corpus_chrf,
            "mean_sentence_chrf": {
                arm: safe_mean(row["scores"][arm]["sentence_chrf"] for row in members) for arm in ARMS
            },
            "mean_reference_token_recall": {
                arm: safe_mean(row["scores"][arm]["reference_token_recall"] for row in members)
                for arm in ARMS
            },
            "mean_prediction_reference_token_ratio": {
                arm: safe_mean(row["scores"][arm]["prediction_reference_token_ratio"] for row in members)
                for arm in ARMS
            },
        }
        for candidate in CANDIDATES:
            deltas = [row["deltas_vs_retention"][candidate]["sentence_chrf"] for row in members]
            item[f"{candidate}_vs_retention"] = {
                "corpus_chrf_delta": corpus_chrf[candidate] - corpus_chrf["retention"],
                "mean_sentence_chrf_delta": safe_mean(deltas),
                "improved_rows": sum(value > 1e-12 for value in deltas),
                "tied_rows": sum(abs(value) <= 1e-12 for value in deltas),
                "worsened_rows": sum(value < -1e-12 for value in deltas),
            }
        result[label] = item
    return result


def compact_row(row: dict[str, Any], candidate: str) -> dict[str, Any]:
    return {
        "id": row["id"],
        "lesson_id": row["lesson_id"],
        "lesson_title": row["lesson_title"],
        "container_kind": row["container_kind"],
        "input_text": row["input_text"],
        "reference": row["reference"],
        "retention_prediction": row["predictions"]["retention"],
        "candidate_prediction": row["predictions"][candidate],
        "retention_sentence_chrf": row["scores"]["retention"]["sentence_chrf"],
        "candidate_sentence_chrf": row["scores"][candidate]["sentence_chrf"],
        "sentence_chrf_delta": row["deltas_vs_retention"][candidate]["sentence_chrf"],
        "new_target_types_vs_retention": row["exposure"][candidate]["new_target_types_vs_retention"],
        "candidate_target_token_coverage": row["exposure"][candidate]["target"]["token_occurrence_coverage"],
    }


def write_json_atomic(path: Path, value: Any) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    inputs = {
        "paired": args.paired_ledger.expanduser().resolve(),
        "validation": args.lesson_validation.expanduser().resolve(),
        "retention": args.retention_schedule.expanduser().resolve(),
        "lessons20": args.lessons20_schedule.expanduser().resolve(),
        "lessons40": args.lessons40_schedule.expanduser().resolve(),
    }
    for label, path in inputs.items():
        actual = sha256(path)
        if actual != EXPECTED_SHA256[label]:
            raise ValueError(f"{label} input hash mismatch: {actual}")

    paired = read_jsonl(inputs["paired"])
    validation_rows = [row for row in read_jsonl(inputs["validation"]) if row["task"] == "translate"]
    metadata = {f"{row['id']}:v1-unprefixed": row for row in validation_rows}
    if len(paired) != 117 or len(metadata) != 117 or set(metadata) != {str(row["id"]) for row in paired}:
        raise ValueError("paired rows do not exactly match the 117 unsealed translation-validation rows")
    if any(set(row["predictions"]) != set(ARMS) for row in paired):
        raise ValueError("paired prediction arms differ from the frozen four-arm contract")

    schedule_rows = {arm: read_jsonl(inputs[arm]) for arm in ("retention", *CANDIDATES)}
    if any(len(rows) != 19200 for rows in schedule_rows.values()):
        raise ValueError("a frozen schedule does not contain exactly 19,200 presentations")
    schedule_counts = {arm: schedule_token_counts(rows) for arm, rows in schedule_rows.items()}
    metric = CHRF(word_order=2)
    enriched: list[dict[str, Any]] = []

    for paired_row in paired:
        row_meta = metadata[str(paired_row["id"])]
        source_tokens = word_tokens(paired_row["input_text"])
        reference_tokens = word_tokens(paired_row["reference"])
        exposure: dict[str, Any] = {}
        for arm in ("retention", *CANDIDATES):
            source_exposure = exposure_summary(source_tokens, schedule_counts[arm]["source"])
            target_exposure = exposure_summary(reference_tokens, schedule_counts[arm]["target"])
            retention_target = schedule_counts["retention"]["target"]
            retention_source = schedule_counts["retention"]["source"]
            exposure[arm] = {
                "source": source_exposure,
                "target": target_exposure,
                "new_source_types_vs_retention": sorted(
                    token for token in set(source_tokens)
                    if schedule_counts[arm]["source"][token] > 0 and retention_source[token] == 0
                ),
                "new_target_types_vs_retention": sorted(
                    token for token in set(reference_tokens)
                    if schedule_counts[arm]["target"][token] > 0 and retention_target[token] == 0
                ),
            }

        scores: dict[str, Any] = {}
        for arm in ARMS:
            prediction = str(paired_row["predictions"][arm])
            prediction_tokens = word_tokens(prediction)
            overlap = multiset_overlap(reference_tokens, prediction_tokens)
            scores[arm] = {
                "sentence_chrf": metric.sentence_score(prediction, [str(paired_row["reference"])]).score,
                "normalized_exact": normalize(prediction) == normalize(paired_row["reference"]),
                "reference_token_recall": fraction(overlap, len(reference_tokens)),
                "prediction_surface_precision": fraction(overlap, len(prediction_tokens)),
                "prediction_reference_token_ratio": fraction(len(prediction_tokens), len(reference_tokens)),
                "prediction_tokens": prediction_tokens,
            }

        source_locator = row_meta["source_locator"]
        item = {
            "id": paired_row["id"],
            "source_record_id": row_meta["id"],
            "lesson_id": row_meta["lesson_id"],
            "lesson_title": source_locator["lesson_title"],
            "unit_title": source_locator["unit_title"],
            "section_title": source_locator["section_title"],
            "container_kind": row_meta["container_kind"],
            "quality_flags": row_meta["quality_flags"],
            "input_text": paired_row["input_text"],
            "reference": paired_row["reference"],
            "predictions": paired_row["predictions"],
            "source_tokens": source_tokens,
            "reference_tokens": reference_tokens,
            "source_length_bucket": length_bucket(len(source_tokens)),
            "target_length_bucket": length_bucket(len(reference_tokens)),
            "punctuation_shape": punctuation_shape(str(paired_row["input_text"])),
            "exposure": exposure,
            "scores": scores,
            "deltas_vs_retention": {
                candidate: {
                    "sentence_chrf": scores[candidate]["sentence_chrf"]
                    - scores["retention"]["sentence_chrf"],
                    "reference_token_recall": (
                        (scores[candidate]["reference_token_recall"] or 0)
                        - (scores["retention"]["reference_token_recall"] or 0)
                    ),
                }
                for candidate in CANDIDATES
            },
        }
        enriched.append(item)

    aggregate_report: dict[str, Any] = {
        "overall": aggregate(enriched, lambda _: "all")["all"],
        "by_container_kind": aggregate(enriched, lambda row: row["container_kind"]),
        "by_source_length": aggregate(enriched, lambda row: row["source_length_bucket"]),
        "by_target_length": aggregate(enriched, lambda row: row["target_length_bucket"]),
        "by_punctuation_shape": aggregate(enriched, lambda row: row["punctuation_shape"]),
        "by_lesson": aggregate(enriched, lambda row: f"{row['lesson_id']} | {row['lesson_title']}"),
    }
    for candidate in CANDIDATES:
        aggregate_report[f"{candidate}_by_new_target_types_vs_retention"] = aggregate(
            enriched,
            lambda row, arm=candidate: new_type_bucket(
                len(row["exposure"][arm]["new_target_types_vs_retention"])
            ),
        )
        aggregate_report[f"{candidate}_by_target_token_coverage"] = aggregate(
            enriched,
            lambda row, arm=candidate: coverage_bucket(
                row["exposure"][arm]["target"]["token_occurrence_coverage"]
            ),
        )

    rankings: dict[str, Any] = {}
    for candidate in CANDIDATES:
        ordered = sorted(
            enriched,
            key=lambda row: row["deltas_vs_retention"][candidate]["sentence_chrf"],
        )
        rankings[candidate] = {
            "largest_regressions": [compact_row(row, candidate) for row in ordered[:30]],
            "largest_improvements": [compact_row(row, candidate) for row in reversed(ordered[-30:])],
        }

    container_groups = {
        label: [row for row in enriched if row["container_kind"] == label]
        for label in sorted({str(row["container_kind"]) for row in enriched})
    }
    exploratory_container_bootstrap = {
        label: {
            candidate: paired_corpus_bootstrap(
                members,
                candidate,
                samples=5000,
                seed=20260721 + group_index * 10 + candidate_index,
            )
            for candidate_index, candidate in enumerate(CANDIDATES)
        }
        for group_index, (label, members) in enumerate(container_groups.items())
    }

    report = {
        "schema_version": 1,
        "analysis_kind": "migmaq_v3_2_paired_lesson_failure_analysis",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "rows": len(enriched),
        "sealed_test_opened": False,
        "inputs": {
            label: {"path": str(path), "sha256": EXPECTED_SHA256[label]}
            for label, path in inputs.items()
        },
        "method": {
            "sentence_metric": str(metric.get_signature()),
            "comparison": "paired development rows against the step-matched retention continuation",
            "schedule_exposure": "exact word-token counts over each 19,200-presentation frozen schedule",
            "surface_overlap_warning": (
                "Reference-token recall and prediction precision are orthographic diagnostics, not semantic "
                "adequacy measures; legitimate variants can score poorly and wrong same-form outputs can score well."
            ),
            "inference_limit": (
                "Subgroup summaries are descriptive on 117 development rows. Lessons, structures, and speakers "
                "are not independent random population samples."
            ),
        },
        "aggregates": aggregate_report,
        "exploratory_container_bootstrap": {
            "strata": exploratory_container_bootstrap,
            "interpretation": (
                "Post-hoc paired row bootstrap within source-defined container strata. Intervals are descriptive; "
                "the split was not preregistered as a confirmatory endpoint and rows are clustered by lesson."
            ),
        },
        "rankings": rankings,
        "claim_limit": (
            "This analysis diagnoses a failed single-seed development screen. It cannot certify linguistic "
            "adequacy, justify deployment, or replace fluent-speaker error annotation."
        ),
    }

    output = args.output_dir.expanduser().resolve()
    if output.exists():
        raise FileExistsError(output)
    output.mkdir(parents=True)
    write_json_atomic(output / "failure-analysis.json", report)
    write_jsonl_atomic(output / "row-diagnostics.jsonl", enriched)
    files = sorted(path for path in output.iterdir() if path.is_file())
    (output / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files), encoding="utf-8"
    )
    print(json.dumps({"rows": len(enriched), "overall": aggregate_report["overall"]}, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Analyze whether Mi'kmaq lexical adapters respond to gloss or prompt controls."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable

try:
    from .evaluate_migmaq_lexical_baseline import (
        error_rate,
        graphemes,
        normalize,
        sha256,
    )
except ImportError:
    from evaluate_migmaq_lexical_baseline import (
        error_rate,
        graphemes,
        normalize,
        sha256,
    )


EXPECTED_VARIANTS = {
    "original",
    "no_pos",
    "plain",
    "pos_only",
    "same_pos_shuffled",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument(
        "--model",
        action="append",
        required=True,
        help="Label and predictions path as LABEL=PATH; may be repeated.",
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-anchors", type=int, default=960)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"invalid JSON at {path}:{line_number}: {error}"
                ) from error
            if not isinstance(row, dict):
                raise ValueError(f"non-object JSON at {path}:{line_number}")
            rows.append(row)
    return rows


def keyed(rows: Iterable[dict[str, Any]], label: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        row_id = str(row.get("id") or "")
        if not row_id or row_id in result:
            raise ValueError(f"blank or duplicate ID in {label}: {row_id!r}")
        result[row_id] = row
    return result


def parse_models(values: Iterable[str]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for value in values:
        if "=" not in value:
            raise ValueError(f"model argument must be LABEL=PATH: {value!r}")
        label, raw_path = value.split("=", 1)
        path = Path(raw_path).expanduser().resolve()
        if not label or label in result or not path.is_file():
            raise ValueError(f"invalid model argument: {value!r}")
        result[label] = path
    return result


def normalized_references(row: dict[str, Any]) -> list[str]:
    references = [
        normalize(value)
        for value in row.get("accepted_references") or [row.get("output_text")]
    ]
    references = list(dict.fromkeys(value for value in references if value))
    if not references:
        raise ValueError(f"row has no references: {row.get('id')}")
    return references


def min_cer(prediction: str, references: Iterable[str]) -> float:
    return min(
        error_rate(graphemes(prediction), graphemes(reference))
        for reference in references
    )


def output_summary(rows: list[dict[str, Any]], score: bool) -> dict[str, Any]:
    predictions = [str(row["prediction_normalized"]) for row in rows]
    counts = Counter(predictions)
    result: dict[str, Any] = {
        "rows": len(rows),
        "unique_normalized_outputs": len(counts),
        "maximum_normalized_output_frequency": max(counts.values(), default=0),
        "empty_outputs": counts.get("", 0),
        "most_common_outputs": [
            {"prediction": prediction, "rows": count}
            for prediction, count in counts.most_common(10)
        ],
    }
    if score:
        exact = sum(bool(row["accepted_exact"]) for row in rows)
        result.update(
            {
                "accepted_exact_count": exact,
                "accepted_exact_rate": exact / len(rows),
                "mean_grapheme_cer": statistics.fmean(
                    float(row["grapheme_cer"]) for row in rows
                ),
            }
        )
    else:
        result["reference_interpretation"] = (
            "No exact/CER claim: a POS-only prompt has no well-defined lexical target."
        )
    return result


def analyze_model(
    benchmark: dict[str, dict[str, Any]],
    predictions: dict[str, dict[str, Any]],
    expected_anchors: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if set(predictions) != set(benchmark):
        raise ValueError(
            "prediction IDs differ from ablation benchmark: "
            f"missing={len(set(benchmark) - set(predictions))} "
            f"extra={len(set(predictions) - set(benchmark))}"
        )
    by_variant: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_anchor: dict[str, dict[str, tuple[dict[str, Any], dict[str, Any]]]] = (
        defaultdict(dict)
    )
    for row_id, benchmark_row in benchmark.items():
        variant = str(benchmark_row["ablation_variant"])
        if variant not in EXPECTED_VARIANTS:
            raise ValueError(f"unknown ablation variant: {variant}")
        prediction = predictions[row_id]
        by_variant[variant].append(prediction)
        anchor_id = str(benchmark_row["anchor_id"])
        if variant in by_anchor[anchor_id]:
            raise ValueError(f"duplicate anchor variant: {anchor_id}/{variant}")
        by_anchor[anchor_id][variant] = (benchmark_row, prediction)
    if len(by_anchor) != expected_anchors:
        raise ValueError(
            f"anchor count changed: {len(by_anchor)} != {expected_anchors}"
        )
    if any(set(variants) != EXPECTED_VARIANTS for variants in by_anchor.values()):
        raise ValueError("an anchor does not have exactly one of every variant")

    paired_rows: list[dict[str, Any]] = []
    equality_counts: Counter[str] = Counter()
    shuffle_alignment: Counter[str] = Counter()
    for anchor_id, variants in sorted(by_anchor.items()):
        original_benchmark, original = variants["original"]
        original_prediction = str(original["prediction_normalized"])
        anchor_references = normalized_references(original_benchmark)
        record: dict[str, Any] = {
            "anchor_id": anchor_id,
            "anchor_gloss": original_benchmark["anchor_gloss"],
            "part_of_speech": original_benchmark.get("part_of_speech"),
            "anchor_references": anchor_references,
            "variants": {},
        }
        for variant in sorted(EXPECTED_VARIANTS):
            benchmark_row, prediction = variants[variant]
            normalized_prediction = str(prediction["prediction_normalized"])
            same_as_original = normalized_prediction == original_prediction
            if variant != "original" and same_as_original:
                equality_counts[f"original_equals_{variant}"] += 1
            record["variants"][variant] = {
                "input_text": benchmark_row["input_text"],
                "semantic_source_id": benchmark_row["semantic_source_id"],
                "semantic_gloss": benchmark_row["semantic_gloss"],
                "prediction": prediction["prediction"],
                "prediction_normalized": normalized_prediction,
                "same_as_original": same_as_original,
                "accepted_exact": (
                    prediction["accepted_exact"]
                    if benchmark_row["score_as_translation"]
                    else None
                ),
            }

        shuffled_benchmark, shuffled = variants["same_pos_shuffled"]
        shuffled_prediction = str(shuffled["prediction_normalized"])
        donor_references = normalized_references(shuffled_benchmark)
        anchor_cer = min_cer(shuffled_prediction, anchor_references)
        donor_cer = min_cer(shuffled_prediction, donor_references)
        if donor_cer < anchor_cer:
            relation = "closer_to_visible_shuffled_gloss_target"
        elif anchor_cer < donor_cer:
            relation = "closer_to_original_anchor_target"
        else:
            relation = "equal_surface_distance"
        shuffle_alignment[relation] += 1
        shuffle_alignment["exact_visible_shuffled_target"] += int(
            shuffled_prediction in donor_references
        )
        shuffle_alignment["exact_original_anchor_target"] += int(
            shuffled_prediction in anchor_references
        )
        shuffle_alignment["output_changed_from_original"] += int(
            shuffled_prediction != original_prediction
        )
        record["shuffle_alignment"] = {
            "donor_id": shuffled_benchmark["semantic_source_id"],
            "donor_gloss": shuffled_benchmark["semantic_gloss"],
            "donor_references": donor_references,
            "cer_to_visible_shuffled_target": donor_cer,
            "cer_to_original_anchor_target": anchor_cer,
            "relation": relation,
        }
        paired_rows.append(record)

    variant_summary = {
        variant: output_summary(rows, score=variant != "pos_only")
        for variant, rows in sorted(by_variant.items())
    }
    return {
        "anchors": len(paired_rows),
        "variants": variant_summary,
        "prediction_identity_with_original": {
            variant: equality_counts[f"original_equals_{variant}"] / len(paired_rows)
            for variant in ("no_pos", "plain", "pos_only", "same_pos_shuffled")
        },
        "same_pos_shuffle": {
            **dict(sorted(shuffle_alignment.items())),
            "output_change_rate": shuffle_alignment["output_changed_from_original"]
            / len(paired_rows),
            "closer_to_visible_target_rate": shuffle_alignment[
                "closer_to_visible_shuffled_gloss_target"
            ]
            / len(paired_rows),
            "closer_to_original_target_rate": shuffle_alignment[
                "closer_to_original_anchor_target"
            ]
            / len(paired_rows),
        },
        "interpretation_contract": {
            "original_vs_no_pos": "Tests whether the recorded POS suffix helps valid lexical reconstruction.",
            "original_vs_plain": "Tests whether the lexeme task token helps valid lexical reconstruction.",
            "original_vs_pos_only": "High identity indicates class/control dominance; POS-only has no correct translation target.",
            "original_vs_same_pos_shuffled": "A semantic model should change output and move toward the target of the visible shuffled gloss.",
        },
    }, paired_rows


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> None:
    args = parse_args()
    benchmark_path = args.benchmark.expanduser().resolve()
    if not benchmark_path.is_file():
        raise FileNotFoundError(benchmark_path)
    model_paths = parse_models(args.model)
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    benchmark = keyed(read_jsonl(benchmark_path), "benchmark")
    expected_rows = args.expected_anchors * len(EXPECTED_VARIANTS)
    if len(benchmark) != expected_rows:
        raise ValueError(f"benchmark rows changed: {len(benchmark)} != {expected_rows}")

    report: dict[str, Any] = {
        "schema_version": 1,
        "analysis_kind": "migmaq_lexical_prompt_identity_ablation",
        "created_at": utc_now(),
        "benchmark": {
            "path": str(benchmark_path),
            "rows": len(benchmark),
            "sha256": sha256(benchmark_path),
        },
        "claim_limit": "This is a prompt-sensitivity diagnostic on 960 development lexemes, not a translation release gate.",
        "models": {},
        "analyzer": {
            "path": str(Path(__file__).resolve()),
            "sha256": sha256(Path(__file__).resolve()),
        },
    }
    paired_by_model: dict[str, list[dict[str, Any]]] = {}
    for label, path in model_paths.items():
        predictions = keyed(read_jsonl(path), label)
        analysis, paired_rows = analyze_model(
            benchmark, predictions, args.expected_anchors
        )
        report["models"][label] = {
            "predictions": {
                "path": str(path),
                "rows": len(predictions),
                "sha256": sha256(path),
            },
            **analysis,
        }
        paired_by_model[label] = paired_rows

    combined_rows: list[dict[str, Any]] = []
    for anchor_id in sorted(
        next(iter(paired_by_model.values())), key=lambda row: row["anchor_id"]
    ):
        row_id = anchor_id["anchor_id"]
        combined_rows.append(
            {
                "anchor_id": row_id,
                "anchor_gloss": anchor_id["anchor_gloss"],
                "part_of_speech": anchor_id["part_of_speech"],
                "models": {
                    label: next(row for row in rows if row["anchor_id"] == row_id)
                    for label, rows in paired_by_model.items()
                },
            }
        )

    with tempfile.TemporaryDirectory(
        prefix=f".{output_dir.name}.", dir=output_dir.parent
    ) as temporary_name:
        staging = Path(temporary_name)
        report_path = staging / "prompt-ablation-report.json"
        paired_path = staging / "prompt-ablation-paired.jsonl"
        write_json(report_path, report)
        write_jsonl(paired_path, combined_rows)
        with (staging / "SHA256SUMS").open("w", encoding="utf-8") as handle:
            for path in (report_path, paired_path):
                handle.write(f"{sha256(path)}  {path.relative_to(staging)}\n")
        staging.rename(output_dir)
    print(json.dumps(report["models"], indent=2, sort_keys=True))
    print(f"output={output_dir}")


if __name__ == "__main__":
    main()

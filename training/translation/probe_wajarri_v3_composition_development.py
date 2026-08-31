#!/usr/bin/env python3
"""Probe the immutable public Wajarri v2 model on the corrected v3 development cells."""

from __future__ import annotations

import argparse
import json
import statistics
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from training.translation.probe_wajarri_v3_pre_census import (
        canonical_json,
        load_json,
        normalize_surface,
        post_task,
        request_json,
        resolve_input,
        sha256_file,
        surface_tokens,
        validate_model_info,
        write_json_atomic,
        write_jsonl_atomic,
        write_text_atomic,
    )
except ModuleNotFoundError:
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.probe_wajarri_v3_pre_census import (
        canonical_json,
        load_json,
        normalize_surface,
        post_task,
        request_json,
        resolve_input,
        sha256_file,
        surface_tokens,
        validate_model_info,
        write_json_atomic,
        write_jsonl_atomic,
        write_text_atomic,
    )


METHOD_ID = "wajarri-v3-composition-development-baseline-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def validate_development_rows(rows: list[dict[str, Any]]) -> None:
    identifiers = set()
    pairs = set()
    for row in rows:
        row_id = row["cell_id"]
        if row_id in identifiers:
            raise ValueError(f"duplicate development cell: {row_id}")
        identifiers.add(row_id)
        if row.get("training_eligibility") != "not_allowed":
            raise ValueError(f"development cell is unexpectedly trainable: {row_id}")
        if row.get("benchmark_eligibility") != "development_only_not_sealed":
            raise ValueError(f"development cell is not marked development-only: {row_id}")
        pair = (
            normalize_surface(row["input_text"]),
            normalize_surface(row["output_text"]),
        )
        if pair in pairs:
            raise ValueError(f"duplicate normalized development pair: {row_id}")
        pairs.add(pair)
        target_tokens = surface_tokens(row["output_text"])
        if len(target_tokens) != 2:
            raise ValueError(f"development target is not a two-slot clause: {row_id}")


def score_development_row(
    row: dict[str, Any],
    response: dict[str, Any],
    wall_ms: int,
    known_subjects: set[str],
    known_predicates: set[str],
) -> dict[str, Any]:
    prediction = str(response["translation"])
    prediction_normalized = normalize_surface(prediction)
    predicted_tokens = surface_tokens(prediction)
    expected_tokens = surface_tokens(row["output_text"])
    expected_subject, expected_predicate = expected_tokens
    subject_present = expected_subject in predicted_tokens
    predicate_present = expected_predicate in predicted_tokens
    exact = prediction_normalized == normalize_surface(row["output_text"])
    failure_codes = []
    if not exact:
        if not prediction_normalized:
            failure_codes.append("blank_output")
        if prediction_normalized == normalize_surface(row["source_text"]):
            failure_codes.append("source_copy")
        if not subject_present:
            failure_codes.append("expected_subject_missing")
        if not predicate_present:
            failure_codes.append("expected_predicate_missing")
        observed_subjects = sorted(set(predicted_tokens) & known_subjects)
        observed_predicates = sorted(set(predicted_tokens) & known_predicates)
        if observed_subjects and not subject_present:
            failure_codes.append("known_subject_substitution")
        if observed_predicates and not predicate_present:
            failure_codes.append("known_predicate_substitution")
    return {
        "schema_version": 1,
        "cell_id": row["cell_id"],
        "subject_id": row["subject_id"],
        "predicate_id": row["predicate_id"],
        "source_text": row["source_text"],
        "input_text": row["input_text"],
        "reference": row["output_text"],
        "prediction": prediction,
        "exact": exact,
        "expected_subject": expected_subject,
        "expected_predicate": expected_predicate,
        "expected_subject_present": subject_present,
        "expected_predicate_present": predicate_present,
        "both_expected_slots_present": subject_present and predicate_present,
        "failure_codes": failure_codes,
        "prior_baseline_status": row["baseline_status"],
        "wall_ms": wall_ms,
        "response": response,
        "claim_limit": "A model-bound development result is not linguistic evidence or a natural-translation reliability estimate.",
    }


def summarize(rows: list[dict[str, Any]], model_info: dict[str, Any]) -> dict[str, Any]:
    latencies = [row["wall_ms"] for row in rows]
    prediction_counts = Counter(
        normalize_surface(row["prediction"]) for row in rows
    )
    return {
        "rows": len(rows),
        "exact": sum(row["exact"] for row in rows),
        "subject_present": sum(row["expected_subject_present"] for row in rows),
        "predicate_present": sum(row["expected_predicate_present"] for row in rows),
        "both_slots_present": sum(row["both_expected_slots_present"] for row in rows),
        "blank": sum("blank_output" in row["failure_codes"] for row in rows),
        "source_copy": sum("source_copy" in row["failure_codes"] for row in rows),
        "by_subject": {
            subject: {
                "rows": len(group),
                "exact": sum(row["exact"] for row in group),
                "both_slots_present": sum(
                    row["both_expected_slots_present"] for row in group
                ),
            }
            for subject in sorted({row["subject_id"] for row in rows})
            for group in [[row for row in rows if row["subject_id"] == subject]]
        },
        "by_predicate": {
            predicate: {
                "rows": len(group),
                "exact": sum(row["exact"] for row in group),
                "both_slots_present": sum(
                    row["both_expected_slots_present"] for row in group
                ),
            }
            for predicate in sorted({row["predicate_id"] for row in rows})
            for group in [[row for row in rows if row["predicate_id"] == predicate]]
        },
        "prediction_collapses": [
            {"prediction": prediction, "rows": count}
            for prediction, count in sorted(
                prediction_counts.items(), key=lambda item: (-item[1], item[0])
            )
            if count > 1
        ],
        "latency_ms": {
            "minimum": min(latencies),
            "median": statistics.median(latencies),
            "maximum": max(latencies),
        },
        "serving_device": model_info.get("status", {}).get("device"),
        "serving_dtype": model_info.get("status", {}).get("dtype"),
    }


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    contract = load_json(contract_path)
    if contract["analysis_id"] != METHOD_ID:
        raise ValueError(f"unexpected analysis_id: {contract['analysis_id']}")
    program_root = args.program_root.resolve()
    _, development_rows = resolve_input(program_root, contract["development_rows"])
    validate_development_rows(development_rows)

    base_url = contract["base_url"].rstrip("/")
    model_request = urllib.request.Request(
        f"{base_url}/v1/model?"
        + urllib.parse.urlencode({"language": contract["language"]}),
        headers={"User-Agent": f"MobTranslate/{METHOD_ID}"},
    )
    settings = contract["request"]
    model_info, model_status, model_wall_ms = request_json(
        model_request,
        timeout_seconds=float(settings["timeout_seconds"]),
        attempts=int(settings["attempts"]),
        retry_delay_seconds=float(settings["retry_delay_seconds"]),
    )
    if model_status != 200:
        raise ValueError(f"model endpoint returned HTTP {model_status}")
    validate_model_info(model_info, contract)

    known_subjects = {
        surface_tokens(row["output_text"])[0] for row in development_rows
    }
    known_predicates = {
        surface_tokens(row["output_text"])[1] for row in development_rows
    }
    results = []
    for row in sorted(development_rows, key=lambda value: value["cell_id"]):
        response, wall_ms = post_task(
            contract, "translate", row["source_text"], row["cell_id"]
        )
        results.append(
            score_development_row(
                row, response, wall_ms, known_subjects, known_predicates
            )
        )

    summary = summarize(results, model_info)
    created_at = datetime.now(timezone.utc).isoformat()
    report = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": created_at,
        "status": "COMPLETE_MODEL_BOUND_DEVELOPMENT_BASELINE",
        "summary": summary,
        "model_endpoint_wall_ms": model_wall_ms,
        "runpod_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "MODEL-INFO.json", model_info)
    write_jsonl_atomic(output_dir / "RESULTS.jsonl", results)
    write_json_atomic(output_dir / "REPORT.json", report)
    manifest = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": created_at,
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
        },
        "contract": {"path": str(contract_path), "sha256": sha256_file(contract_path)},
        "input": contract["development_rows"],
        "outputs": {
            "MODEL-INFO.json": {"rows": 1},
            "RESULTS.jsonl": {"rows": len(results)},
            "REPORT.json": {"rows": 1},
        },
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    checksummed = sorted(path for path in output_dir.iterdir() if path.is_file())
    write_text_atomic(
        output_dir / "OUTPUT-SHA256SUMS",
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in checksummed),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

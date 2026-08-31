#!/usr/bin/env python3
"""Probe plain, suffix, inline-append, and code-switch terminology formats."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


METHOD_ID = "wajarri-v3-terminology-format-space-probe-v1"
CONDITIONS = ("plain", "suffix", "inline_append", "code_switch")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"{path}: expected object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise TypeError(f"{path}:{number}: expected object")
            rows.append(value)
    return rows


def normalize(value: Any) -> str:
    return " ".join(str(value or "").casefold().strip(" .?!,;:").split())


def surface_tokens(value: Any) -> list[str]:
    return normalize(value).split()


def glossary_slots(row: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    pairs = {pair["slot"]: pair for pair in row["glossary_pairs"]}
    if set(pairs) != {"subject", "predicate"}:
        raise ValueError(f"row lacks exactly two glossary slots: {row['id']}")
    return pairs["subject"], pairs["predicate"]


def condition_text(row: dict[str, Any], condition: str) -> str:
    subject, predicate = glossary_slots(row)
    if condition == "plain":
        value = row["unconditioned_input_text"]
    elif condition == "suffix":
        value = row["input_text"]
    elif condition == "inline_append":
        value = (
            f"<translate> The {subject['english_surface']} "
            f"({subject['wajarri_surface']}) is {predicate['english_surface']} "
            f"({predicate['wajarri_surface']})."
        )
    elif condition == "code_switch":
        value = (
            f"<translate> The {subject['wajarri_surface']} is "
            f"{predicate['wajarri_surface']}."
        )
    else:
        raise ValueError(f"unsupported condition: {condition}")
    value = " ".join(value.split())
    if not value.startswith("<translate> "):
        raise ValueError(f"condition lacks <translate> prefix: {condition}")
    return value.removeprefix("<translate> ")


def verify_identity(payload: dict[str, Any], contract: dict[str, Any]) -> None:
    expected = contract["expected_identity"]
    fields = {
        "languageCode": expected["language_code"],
        "modelId": expected["model_id"],
        "model": expected["model_version"],
        "sourceLang": expected["source_lang"],
        "targetLang": expected["target_lang"],
        "task": "translate",
    }
    mismatches = {
        field: {"expected": value, "observed": payload.get(field)}
        for field, value in fields.items()
        if payload.get(field) != value
    }
    if mismatches:
        raise ValueError(f"hosted model identity mismatch: {mismatches}")
    if not str(payload.get("translation") or "").strip():
        raise ValueError("hosted model returned blank translation")


def request_translation(
    endpoint: str,
    language: str,
    text: str,
    timeout_seconds: float,
    maximum_attempts: int,
) -> tuple[dict[str, Any], int, float]:
    body = json.dumps({"text": text, "language": language}).encode()
    last_error: Exception | None = None
    for attempt in range(1, maximum_attempts + 1):
        started = time.monotonic()
        request = Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                payload = json.loads(response.read().decode())
            if not isinstance(payload, dict):
                raise TypeError("hosted response is not an object")
            return payload, attempt, time.monotonic() - started
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < maximum_attempts:
                time.sleep(min(10.0, 2.0**attempt))
    raise RuntimeError(
        f"hosted request failed after {maximum_attempts} attempts: {last_error}"
    )


def score_prediction(
    row: dict[str, Any], condition: str, prediction: str
) -> dict[str, Any]:
    reference_tokens = surface_tokens(row["output_text"])
    if len(reference_tokens) != 2:
        raise ValueError(f"target is not a two-slot clause: {row['id']}")
    predicted_tokens = surface_tokens(prediction)
    expected_subject, expected_predicate = reference_tokens
    return {
        "schema_version": 1,
        "row_id": row["id"],
        "parent_row_id": row["parent_row_id"],
        "subject_id": row["subject_id"],
        "predicate_id": row["predicate_id"],
        "contrast_family": row["contrast_family"],
        "condition": condition,
        "request_text": condition_text(row, condition),
        "reference": row["output_text"],
        "prediction": " ".join(prediction.split()),
        "exact": normalize(prediction) == normalize(row["output_text"]),
        "expected_subject_present": expected_subject in predicted_tokens,
        "expected_predicate_present": expected_predicate in predicted_tokens,
        "both_expected_slots_present": (
            expected_subject in predicted_tokens and expected_predicate in predicted_tokens
        ),
        "blank": not predicted_tokens,
    }


def metric_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "rows": len(rows),
        "exact": sum(row["exact"] for row in rows),
        "subject_present": sum(row["expected_subject_present"] for row in rows),
        "predicate_present": sum(row["expected_predicate_present"] for row in rows),
        "both_slots_present": sum(row["both_expected_slots_present"] for row in rows),
        "blank": sum(row["blank"] for row in rows),
    }


def summarize_condition(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        **metric_counts(rows),
        "by_subject": {
            value: metric_counts([row for row in rows if row["subject_id"] == value])
            for value in sorted({row["subject_id"] for row in rows})
        },
        "by_predicate": {
            value: metric_counts([row for row in rows if row["predicate_id"] == value])
            for value in sorted({row["predicate_id"] for row in rows})
        },
        "prediction_collapses": [
            {"prediction": prediction, "rows": count}
            for prediction, count in sorted(
                Counter(normalize(row["prediction"]) for row in rows).items(),
                key=lambda item: (-item[1], item[0]),
            )
            if count > 1
        ],
    }


def paired_transitions(
    rows: list[dict[str, Any]], left: str, right: str, field: str
) -> dict[str, int]:
    grouped: dict[str, dict[str, dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row["parent_row_id"], {})[row["condition"]] = row
    result: Counter[str] = Counter()
    for row_id, conditions in grouped.items():
        if left not in conditions or right not in conditions:
            raise ValueError(f"incomplete comparison for {row_id}: {left}/{right}")
        state = (bool(conditions[left][field]), bool(conditions[right][field]))
        result[
            {
                (False, False): "remained_absent",
                (False, True): "gained",
                (True, False): "lost",
                (True, True): "retained",
            }[state]
        ] += 1
    return dict(sorted(result.items()))


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    contract = load_json(contract_path)
    if contract.get("method_id") != METHOD_ID:
        raise ValueError(f"unexpected method ID: {contract.get('method_id')}")
    program_root = args.program_root.resolve()
    binding = contract["input"]
    input_path = (program_root / binding["path"]).resolve()
    input_path.relative_to(program_root)
    if sha256_file(input_path) != binding["sha256"]:
        raise ValueError("input SHA-256 mismatch")
    rows = load_jsonl(input_path)
    if len(rows) != int(binding["rows"]):
        raise ValueError("input row-count mismatch")

    output_dir = args.output_dir.resolve()
    raw_path = output_dir / "RAW-RESPONSES.jsonl"
    if output_dir.exists() and not args.resume:
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    completed: dict[tuple[str, str], dict[str, Any]] = {}
    if raw_path.exists():
        for response in load_jsonl(raw_path):
            key = (response["parent_row_id"], response["condition"])
            if key in completed:
                raise ValueError(f"duplicate resumed response: {key}")
            verify_identity(response["response"], contract)
            completed[key] = response

    total = len(rows) * len(CONDITIONS)
    with raw_path.open("a", encoding="utf-8") as handle:
        for row in rows:
            for condition in CONDITIONS:
                key = (row["parent_row_id"], condition)
                if key in completed:
                    continue
                text = condition_text(row, condition)
                payload, attempts, wall_seconds = request_translation(
                    contract["endpoint"],
                    contract["expected_identity"]["language_code"],
                    text,
                    float(contract["request_policy"]["timeout_seconds"]),
                    int(contract["request_policy"]["maximum_attempts"]),
                )
                verify_identity(payload, contract)
                record = {
                    "schema_version": 1,
                    "captured_at_utc": utc_now(),
                    "parent_row_id": row["parent_row_id"],
                    "condition": condition,
                    "request_text": text,
                    "attempts": attempts,
                    "wall_seconds": wall_seconds,
                    "response": payload,
                }
                handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
                completed[key] = record
                print(
                    f"[{len(completed)}/{total}] {row['parent_row_id']} {condition} "
                    f"{wall_seconds:.2f}s",
                    flush=True,
                )

    predictions: list[dict[str, Any]] = []
    for row in rows:
        for condition in CONDITIONS:
            response = completed[(row["parent_row_id"], condition)]
            predictions.append(
                {
                    **score_prediction(
                        row, condition, response["response"]["translation"]
                    ),
                    "attempts": response["attempts"],
                    "wall_seconds": response["wall_seconds"],
                    "model_ms": response["response"]["ms"],
                    "queue_ms": response["response"]["queueMs"],
                }
            )
    predictions_path = output_dir / "PREDICTIONS.jsonl"
    predictions_path.write_text(
        "".join(
            json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
            for row in predictions
        ),
        encoding="utf-8",
    )
    summaries = {
        condition: summarize_condition(
            [row for row in predictions if row["condition"] == condition]
        )
        for condition in CONDITIONS
    }
    comparisons = {}
    for condition in CONDITIONS[1:]:
        comparisons[f"plain_to_{condition}"] = {
            field: paired_transitions(predictions, "plain", condition, field)
            for field in (
                "exact",
                "expected_subject_present",
                "expected_predicate_present",
                "both_expected_slots_present",
            )
        }
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": utc_now(),
        "status": "COMPLETE_HOSTED_TERMINOLOGY_FORMAT_PROBE",
        "identity": contract["expected_identity"],
        "conditions": summaries,
        "paired_comparisons": comparisons,
        "latency": {
            "requests": len(predictions),
            "wall_seconds_total": sum(row["wall_seconds"] for row in predictions),
            "model_ms_total": sum(row["model_ms"] for row in predictions),
            "queue_ms_total": sum(row["queue_ms"] for row in predictions),
            "requests_retried": sum(row["attempts"] > 1 for row in predictions),
        },
        "selection_rule": contract["selection_rule"],
        "claim_limit": contract["claim_limit"],
    }
    write_json(output_dir / "REPORT.json", report)
    names = ["PREDICTIONS.jsonl", "RAW-RESPONSES.jsonl", "REPORT.json"]
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "contract": {
            "path": str(contract_path),
            "sha256": sha256_file(contract_path),
        },
        "input": binding,
        "outputs": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
            }
            for name in names
        },
        "status": report["status"],
    }
    write_json(output_dir / "MANIFEST.json", manifest)
    checksum_names = sorted([*names, "MANIFEST.json"])
    (output_dir / "SHA256SUMS").write_text(
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n" for name in checksum_names
        ),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

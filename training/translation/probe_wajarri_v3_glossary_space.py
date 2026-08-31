#!/usr/bin/env python3
"""Run a resumable paired plain/glossary probe against the hosted Wajarri model."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

METHOD_ID = "wajarri-v3-glossary-space-probe-v1"


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
        raise TypeError(f"{path}: expected a JSON object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise TypeError(f"{path}:{number}: expected a JSON object")
        rows.append(value)
    return rows


def normalize(value: Any) -> str:
    return " ".join(str(value or "").casefold().strip(" .?!,;:").split())


def surface_tokens(value: Any) -> list[str]:
    return normalize(value).split()


def condition_text(row: dict[str, Any], condition: str) -> str:
    field = {
        "plain": "unconditioned_input_text",
        "glossary": "input_text",
    }.get(condition)
    if field is None:
        raise ValueError(f"unsupported condition: {condition}")
    value = " ".join(str(row.get(field) or "").split())
    if not value.startswith("<translate> "):
        raise ValueError(f"{field} lacks the translation task prefix")
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
        raise ValueError("hosted model returned a blank translation")


def request_translation(
    endpoint: str,
    language: str,
    text: str,
    timeout_seconds: float,
    maximum_attempts: int,
) -> tuple[dict[str, Any], int, float]:
    body = json.dumps({"text": text, "language": language}).encode("utf-8")
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
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, dict):
                raise TypeError("hosted model response is not an object")
            return payload, attempt, time.monotonic() - started
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < maximum_attempts:
                time.sleep(min(10.0, 2.0**attempt))
    raise RuntimeError(
        f"hosted translation failed after {maximum_attempts} attempts: {last_error}"
    )


def score_prediction(
    row: dict[str, Any], condition: str, prediction: str
) -> dict[str, Any]:
    reference_tokens = surface_tokens(row["output_text"])
    if len(reference_tokens) != 2:
        raise ValueError(f"development target is not a two-slot clause: {row['id']}")
    predicted_tokens = surface_tokens(prediction)
    expected_subject, expected_predicate = reference_tokens
    return {
        "schema_version": 1,
        "cell_id": row.get("cell_id") or row["parent_row_id"],
        "parent_row_id": row["parent_row_id"],
        "subject_id": row["subject_id"],
        "predicate_id": row["predicate_id"],
        "condition": condition,
        "request_text": condition_text(row, condition),
        "reference": row["output_text"],
        "prediction": " ".join(prediction.split()),
        "exact": normalize(prediction) == normalize(row["output_text"]),
        "expected_subject": expected_subject,
        "expected_predicate": expected_predicate,
        "expected_subject_present": expected_subject in predicted_tokens,
        "expected_predicate_present": expected_predicate in predicted_tokens,
        "both_expected_slots_present": (
            expected_subject in predicted_tokens and expected_predicate in predicted_tokens
        ),
        "blank": not predicted_tokens,
        "source_copy": normalize(prediction)
        == normalize(condition_text(row, condition)),
    }


def summarize_condition(rows: list[dict[str, Any]]) -> dict[str, Any]:
    def counts(group: list[dict[str, Any]]) -> dict[str, int]:
        return {
            "rows": len(group),
            "exact": sum(row["exact"] for row in group),
            "subject_present": sum(
                row["expected_subject_present"] for row in group
            ),
            "predicate_present": sum(
                row["expected_predicate_present"] for row in group
            ),
            "both_slots_present": sum(
                row["both_expected_slots_present"] for row in group
            ),
        }

    return {
        **counts(rows),
        "blank": sum(row["blank"] for row in rows),
        "source_copy": sum(row["source_copy"] for row in rows),
        "by_subject": {
            key: counts([row for row in rows if row["subject_id"] == key])
            for key in sorted({row["subject_id"] for row in rows})
        },
        "by_predicate": {
            key: counts([row for row in rows if row["predicate_id"] == key])
            for key in sorted({row["predicate_id"] for row in rows})
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


def summarize_pairs(rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in rows:
        grouped[row["parent_row_id"]][row["condition"]] = row
    if any(set(pair) != {"plain", "glossary"} for pair in grouped.values()):
        raise ValueError("paired probe is incomplete")

    def transitions(field: str) -> dict[str, int]:
        result = Counter()
        for pair in grouped.values():
            left = bool(pair["plain"][field])
            right = bool(pair["glossary"][field])
            result[
                {
                    (False, False): "remained_absent",
                    (False, True): "gained",
                    (True, False): "lost",
                    (True, True): "retained",
                }[(left, right)]
            ] += 1
        return dict(sorted(result.items()))

    return {
        "pairs": len(grouped),
        "exact": transitions("exact"),
        "subject_present": transitions("expected_subject_present"),
        "predicate_present": transitions("expected_predicate_present"),
        "both_slots_present": transitions("both_expected_slots_present"),
    }


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
    source_path = (program_root / binding["path"]).resolve()
    source_path.relative_to(program_root)
    if sha256_file(source_path) != binding["sha256"]:
        raise ValueError("glossary development fixture SHA-256 mismatch")
    rows = load_jsonl(source_path)
    if len(rows) != binding["rows"]:
        raise ValueError("glossary development fixture row-count mismatch")

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

    total_requests = len(rows) * 2
    with raw_path.open("a", encoding="utf-8") as raw_handle:
        for row in rows:
            for condition in ("plain", "glossary"):
                key = (row["parent_row_id"], condition)
                if key in completed:
                    continue
                request_text = condition_text(row, condition)
                payload, attempts, wall_seconds = request_translation(
                    contract["endpoint"],
                    contract["expected_identity"]["language_code"],
                    request_text,
                    float(contract["request_policy"]["timeout_seconds"]),
                    int(contract["request_policy"]["maximum_attempts"]),
                )
                verify_identity(payload, contract)
                record = {
                    "schema_version": 1,
                    "captured_at_utc": utc_now(),
                    "parent_row_id": row["parent_row_id"],
                    "condition": condition,
                    "request_text": request_text,
                    "attempts": attempts,
                    "wall_seconds": wall_seconds,
                    "response": payload,
                }
                raw_handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
                raw_handle.flush()
                os.fsync(raw_handle.fileno())
                completed[key] = record
                print(
                    f"[{len(completed)}/{total_requests}] {row['parent_row_id']} {condition} "
                    f"{wall_seconds:.2f}s",
                    flush=True,
                )

    predictions = []
    for row in rows:
        for condition in ("plain", "glossary"):
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
    conditions = {
        condition: summarize_condition(
            [row for row in predictions if row["condition"] == condition]
        )
        for condition in ("plain", "glossary")
    }
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": utc_now(),
        "status": "COMPLETE_PAIRED_HOSTED_GLOSSARY_PROBE",
        "endpoint": contract["endpoint"],
        "identity": contract["expected_identity"],
        "conditions": conditions,
        "paired_transitions": summarize_pairs(predictions),
        "latency": {
            "requests": len(predictions),
            "wall_seconds_total": sum(row["wall_seconds"] for row in predictions),
            "model_ms_total": sum(row["model_ms"] for row in predictions),
            "queue_ms_total": sum(row["queue_ms"] for row in predictions),
            "requests_retried": sum(row["attempts"] > 1 for row in predictions),
        },
        "claim_limit": contract["claim_limit"],
    }
    write_json(output_dir / "REPORT.json", report)
    artifact_names = ["PREDICTIONS.jsonl", "RAW-RESPONSES.jsonl", "REPORT.json"]
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": report["created_at_utc"],
        "contract_sha256": sha256_file(contract_path),
        "input": {
            "path": str(source_path),
            "rows": len(rows),
            "sha256": sha256_file(source_path),
        },
        "files": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
            }
            for name in artifact_names
        },
    }
    write_json(output_dir / "MANIFEST.json", manifest)
    (output_dir / "SHA256SUMS").write_text(
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in sorted(artifact_names + ["MANIFEST.json"])
        ),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

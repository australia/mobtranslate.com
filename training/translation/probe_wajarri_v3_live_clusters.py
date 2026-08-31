#!/usr/bin/env python3
"""Run a model-bound live Wajarri cluster and backend-conformance probe."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import statistics
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-live-cluster-probe-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_surface(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split()).strip(
        " .?!,;:"
    )


def load_contract(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("unsupported probe contract")
    return value


def write_text_atomic(path: Path, value: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(value, encoding="utf-8")
    os.replace(temporary, path)


def write_json_atomic(path: Path, value: Any) -> None:
    write_text_atomic(
        path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    write_text_atomic(path, "".join(canonical_json(row) + "\n" for row in rows))


def request_json(
    request: urllib.request.Request,
    *,
    timeout_seconds: float,
    attempts: int,
    retry_delay_seconds: float,
) -> tuple[dict[str, Any], int, int]:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("endpoint returned a non-object JSON value")
                return payload, response.status, round((time.monotonic() - started) * 1000)
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(retry_delay_seconds * attempt)
    raise RuntimeError(f"request failed after {attempts} attempts: {last_error}")


def validate_model_info(model_info: dict[str, Any], contract: dict[str, Any]) -> None:
    expected = contract["model"]
    checks = {
        "languageCode": contract["language"],
        "modelId": expected["model_id"],
        "version": expected["version"],
        "revision": expected["revision"],
        "baseRevision": expected["base_revision"],
    }
    for key, expected_value in checks.items():
        if model_info.get(key) != expected_value:
            raise ValueError(
                f"model identity mismatch for {key}: expected {expected_value!r}, "
                f"got {model_info.get(key)!r}"
            )
    for task, expected_decoder in expected["tasks"].items():
        actual_decoder = model_info.get("tasks", {}).get(task)
        if actual_decoder != expected_decoder:
            raise ValueError(
                f"decoder mismatch for {task}: expected {expected_decoder!r}, "
                f"got {actual_decoder!r}"
            )


def score_probe(
    probe: dict[str, Any],
    response: dict[str, Any],
) -> dict[str, Any]:
    translation = str(response["translation"])
    accepted = [normalize_surface(value) for value in probe["accepted_references"]]
    frozen_prediction = probe.get("frozen_prediction")
    return {
        "probe_id": probe["probe_id"],
        "cluster_id": probe["cluster_id"],
        "task": probe["task"],
        "text": probe["text"],
        "accepted_references": probe["accepted_references"],
        "translation": translation,
        "accepted_exact": normalize_surface(translation) in accepted,
        "frozen_prediction": frozen_prediction,
        "frozen_prediction_match": (
            normalize_surface(translation) == normalize_surface(frozen_prediction)
            if frozen_prediction is not None
            else None
        ),
        "source_record_ids": probe.get("source_record_ids", []),
        "response": response,
        "claim_limit": (
            "A live API response is a backend-conformance and qualitative diagnostic. "
            "It is not an independent benchmark row or linguistic evidence."
        ),
    }


def summarize(rows: list[dict[str, Any]], model_info: dict[str, Any]) -> dict[str, Any]:
    frozen_comparable = [row for row in rows if row["frozen_prediction_match"] is not None]
    mismatches = [row for row in frozen_comparable if not row["frozen_prediction_match"]]
    latencies = [int(row["wall_ms"]) for row in rows]
    return {
        "probe_rows": len(rows),
        "accepted_exact": sum(row["accepted_exact"] for row in rows),
        "frozen_comparable_rows": len(frozen_comparable),
        "frozen_prediction_matches": len(frozen_comparable) - len(mismatches),
        "frozen_prediction_mismatches": len(mismatches),
        "mismatch_probe_ids": [row["probe_id"] for row in mismatches],
        "api_wall_ms_median": statistics.median(latencies) if latencies else None,
        "api_wall_ms_max": max(latencies, default=None),
        "serving_device": model_info.get("status", {}).get("device"),
        "serving_dtype": model_info.get("status", {}).get("dtype"),
    }


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_contract(contract_path)
    frozen_summary_path = (
        program_root / contract["frozen_runtime"]["summary_path"]
    ).resolve()
    if program_root not in frozen_summary_path.parents:
        raise ValueError(f"frozen summary escapes program root: {frozen_summary_path}")
    if sha256_file(frozen_summary_path) != contract["frozen_runtime"]["summary_sha256"]:
        raise ValueError("frozen runtime summary SHA-256 mismatch")
    with frozen_summary_path.open(encoding="utf-8") as handle:
        frozen_summary = json.load(handle)
    frozen_environment = frozen_summary["environment"]
    frozen_checks = {
        "gpu": contract["frozen_runtime"]["hardware"],
        "dtype": contract["frozen_runtime"]["dtype"],
        "torch": contract["frozen_runtime"]["torch"],
        "cuda_runtime": contract["frozen_runtime"]["cuda_runtime"],
    }
    if frozen_environment != frozen_checks:
        raise ValueError(
            f"frozen runtime environment mismatch: expected {frozen_checks!r}, "
            f"got {frozen_environment!r}"
        )
    base_url = contract["base_url"].rstrip("/")
    request_settings = contract["request"]
    user_agent = f"MobTranslate/{METHOD_ID}"

    model_url = (
        f"{base_url}/v1/model?"
        + urllib.parse.urlencode({"language": contract["language"]})
    )
    model_request = urllib.request.Request(model_url, headers={"User-Agent": user_agent})
    model_info, model_status, model_wall_ms = request_json(
        model_request,
        timeout_seconds=float(request_settings["timeout_seconds"]),
        attempts=int(request_settings["attempts"]),
        retry_delay_seconds=float(request_settings["retry_delay_seconds"]),
    )
    if model_status != 200:
        raise ValueError(f"model endpoint returned HTTP {model_status}")
    validate_model_info(model_info, contract)

    rows = []
    for probe in contract["probes"]:
        endpoint = f"{base_url}/v1/{probe['task']}"
        body = json.dumps(
            {"language": contract["language"], "text": probe["text"]}
        ).encode("utf-8")
        request = urllib.request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": user_agent},
            method="POST",
        )
        response, status, wall_ms = request_json(
            request,
            timeout_seconds=float(request_settings["timeout_seconds"]),
            attempts=int(request_settings["attempts"]),
            retry_delay_seconds=float(request_settings["retry_delay_seconds"]),
        )
        if status != 200:
            raise ValueError(f"{probe['probe_id']}: endpoint returned HTTP {status}")
        identity_checks = {
            "languageCode": contract["language"],
            "modelId": contract["model"]["model_id"],
            "model": contract["model"]["version"],
            "task": probe["task"],
        }
        for key, expected_value in identity_checks.items():
            if response.get(key) != expected_value:
                raise ValueError(
                    f"{probe['probe_id']}: response {key} mismatch: "
                    f"expected {expected_value!r}, got {response.get(key)!r}"
                )
        scored = score_probe(probe, response)
        scored["http_status"] = status
        scored["wall_ms"] = wall_ms
        rows.append(scored)

    summary = summarize(rows, model_info)
    created_at = datetime.now(timezone.utc).isoformat()
    status = (
        "PASS_LIVE_CONFORMANCE_WITH_BACKEND_DIVERGENCE"
        if summary["frozen_prediction_mismatches"]
        else "PASS_LIVE_CONFORMANCE"
    )
    report = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": created_at,
        "status": status,
        "summary": summary,
        "model_endpoint_wall_ms": model_wall_ms,
        "frozen_runtime": contract["frozen_runtime"],
        "serving_runtime": {
            "device": summary["serving_device"],
            "dtype": summary["serving_dtype"],
        },
        "interpretation": (
            "Matching hashes and decoder settings do not guarantee byte-identical greedy "
            "outputs across GPU and CPU BF16 kernels. Live API behavior must be regression "
            "tested as its own runtime contract. Quality conclusions remain bound to the "
            "frozen benchmark environment."
        ),
        "training_authorized": False,
        "runpod_authorized": False,
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "MODEL-INFO.json", model_info)
    write_jsonl_atomic(output_dir / "PROBES.jsonl", rows)
    write_json_atomic(output_dir / "REPORT.json", report)
    manifest = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": created_at,
        "status": status,
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
        },
        "contract": {
            "path": str(contract_path),
            "sha256": sha256_file(contract_path),
        },
        "frozen_runtime_summary": {
            "path": str(frozen_summary_path),
            "sha256": sha256_file(frozen_summary_path),
        },
        "outputs": {
            "MODEL-INFO.json": {"rows": 1},
            "PROBES.jsonl": {"rows": len(rows)},
            "REPORT.json": {"rows": 1},
        },
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    checksummed = sorted(path for path in output_dir.iterdir() if path.is_file())
    checksums = "".join(f"{sha256_file(path)}  {path.name}\n" for path in checksummed)
    write_text_atomic(output_dir / "OUTPUT-SHA256SUMS", checksums)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

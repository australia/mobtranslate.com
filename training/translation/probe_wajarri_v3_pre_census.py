#!/usr/bin/env python3
"""Run a model-bound live census over source-bound Wajarri sentence previews."""

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
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-live-pre-census-v1"


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


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number}: expected a JSON object")
            rows.append(value)
    return rows


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


def normalize_surface(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(normalized.split()).strip(" .?!,;:")


def surface_tokens(value: str) -> list[str]:
    return normalize_surface(value).split()


def resolve_input(
    program_root: Path, component: dict[str, Any]
) -> tuple[Path, list[dict[str, Any]]]:
    path = (program_root / component["path"]).resolve()
    if program_root.resolve() not in path.parents:
        raise ValueError(f"input escapes program root: {path}")
    if sha256_file(path) != component["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows = load_jsonl(path)
    if len(rows) != int(component["rows"]):
        raise ValueError(
            f"row-count mismatch for {path}: expected {component['rows']}, got {len(rows)}"
        )
    return path, rows


def merge_realizations(rows: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    identity_fields = (
        "english_surface",
        "target_surface",
        "part_of_speech",
        "slot_classes",
        "grammatical_features",
        "morphology_status",
        "entry_candidate_id",
        "form_candidate_id",
        "sense_candidate_id",
    )
    merge_fields = (
        "limitations",
        "evidence_record_ids",
        "source_cluster_ids",
        "source_ids",
        "source_record_ids",
    )
    for row in rows:
        realization_id = row["realization_id"]
        existing = result.get(realization_id)
        if existing is None:
            result[realization_id] = dict(row)
            continue
        for field in identity_fields:
            if existing.get(field) != row.get(field):
                raise ValueError(
                    f"conflicting realization identity for {realization_id}: {field}"
                )
        for field in merge_fields:
            existing[field] = sorted(set(existing.get(field, [])) | set(row.get(field, [])))
    return result


def validate_candidates(
    candidates: list[dict[str, Any]], realizations: dict[str, dict[str, Any]]
) -> None:
    seen = set()
    for row in candidates:
        pair_id = row["pairId"]
        if pair_id in seen:
            raise ValueError(f"duplicate pairId: {pair_id}")
        seen.add(pair_id)
        if row["acceptanceStatus"] != "candidate_preview_only":
            raise ValueError(f"{pair_id}: row is not a candidate preview")
        if row["trainingEligibility"] != "not_allowed":
            raise ValueError(f"{pair_id}: pre-census input unexpectedly training eligible")
        binding = row["bindings"]
        subject = realizations.get(binding["subject"])
        predicate = realizations.get(binding["predicate"])
        if subject is None or predicate is None:
            raise ValueError(f"{pair_id}: unresolved lexical realization")
        expected = f"{subject['target_surface']} {predicate['target_surface']}"
        if normalize_surface(row["targetText"]) != normalize_surface(expected):
            raise ValueError(f"{pair_id}: target does not match bound lexical surfaces")


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
    for task in ("translate", "lexeme"):
        if model_info.get("tasks", {}).get(task) != expected["tasks"][task]:
            raise ValueError(f"decoder mismatch for {task}")


def validate_response(
    response: dict[str, Any], contract: dict[str, Any], task: str, row_id: str
) -> None:
    checks = {
        "languageCode": contract["language"],
        "modelId": contract["model"]["model_id"],
        "model": contract["model"]["version"],
        "task": task,
    }
    for key, expected in checks.items():
        if response.get(key) != expected:
            raise ValueError(
                f"{row_id}: response {key} mismatch: expected {expected!r}, "
                f"got {response.get(key)!r}"
            )


def post_task(
    contract: dict[str, Any], task: str, text: str, row_id: str
) -> tuple[dict[str, Any], int]:
    request_settings = contract["request"]
    request = urllib.request.Request(
        f"{contract['base_url'].rstrip('/')}/v1/{task}",
        data=json.dumps({"language": contract["language"], "text": text}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": f"MobTranslate/{METHOD_ID}",
        },
        method="POST",
    )
    response, status, wall_ms = request_json(
        request,
        timeout_seconds=float(request_settings["timeout_seconds"]),
        attempts=int(request_settings["attempts"]),
        retry_delay_seconds=float(request_settings["retry_delay_seconds"]),
    )
    if status != 200:
        raise ValueError(f"{row_id}: endpoint returned HTTP {status}")
    validate_response(response, contract, task, row_id)
    return response, wall_ms


def score_lexeme(row: dict[str, Any], response: dict[str, Any], wall_ms: int) -> dict[str, Any]:
    prediction = str(response["translation"])
    expected = row["target_surface"]
    return {
        "schema_version": 1,
        "realization_id": row["realization_id"],
        "english_surface": row["english_surface"],
        "expected_surface": expected,
        "prediction": prediction,
        "exact": normalize_surface(prediction) == normalize_surface(expected),
        "part_of_speech": row["part_of_speech"],
        "slot_classes": row["slot_classes"],
        "source_record_ids": row["source_record_ids"],
        "wall_ms": wall_ms,
        "response": response,
        "claim_limit": "A direct live-model diagnostic is not linguistic evidence.",
    }


def score_sentence(
    row: dict[str, Any],
    response: dict[str, Any],
    wall_ms: int,
    realizations: dict[str, dict[str, Any]],
    known_subjects: set[str],
    known_predicates: set[str],
) -> dict[str, Any]:
    prediction = str(response["translation"])
    prediction_normalized = normalize_surface(prediction)
    tokens = surface_tokens(prediction)
    subject = realizations[row["bindings"]["subject"]]
    predicate = realizations[row["bindings"]["predicate"]]
    expected_subject = normalize_surface(subject["target_surface"])
    expected_predicate = normalize_surface(predicate["target_surface"])
    subject_present = expected_subject in tokens
    predicate_present = expected_predicate in tokens
    observed_subjects = sorted(set(tokens) & known_subjects)
    observed_predicates = sorted(set(tokens) & known_predicates)
    exact = prediction_normalized == normalize_surface(row["targetText"])
    failure_codes = []
    if not exact:
        if not prediction_normalized:
            failure_codes.append("blank_output")
        if normalize_surface(row["sourceText"]) == prediction_normalized:
            failure_codes.append("source_copy")
        if not subject_present:
            failure_codes.append("expected_subject_missing")
        if not predicate_present:
            failure_codes.append("expected_predicate_missing")
        if observed_subjects and not subject_present:
            failure_codes.append("known_subject_substitution")
        if observed_predicates and not predicate_present:
            failure_codes.append("known_predicate_substitution")
        if subject_present and predicate_present:
            failure_codes.append("both_slots_present_surface_or_order_mismatch")
        if not failure_codes:
            failure_codes.append("unclassified_surface_failure")
    return {
        "schema_version": 1,
        "pair_id": row["pairId"],
        "review_id": row["reviewId"],
        "construction_family": row["constructionFamily"],
        "source_text": row["sourceText"],
        "reference": row["targetText"],
        "prediction": prediction,
        "exact": exact,
        "bindings": row["bindings"],
        "expected_subject": subject["target_surface"],
        "expected_predicate": predicate["target_surface"],
        "expected_subject_present": subject_present,
        "expected_predicate_present": predicate_present,
        "both_expected_slots_present": subject_present and predicate_present,
        "observed_known_subjects": observed_subjects,
        "observed_known_predicates": observed_predicates,
        "failure_codes": failure_codes,
        "wall_ms": wall_ms,
        "response": response,
        "claim_limit": "A pre-census candidate is development evidence, not a sealed test row.",
    }


def build_failure_clusters(
    sentences: list[dict[str, Any]], lexemes: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    groups: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in sentences:
        groups[("subject", row["bindings"]["subject"])].append(row)
        groups[("predicate", row["bindings"]["predicate"])].append(row)
    result = []
    for (role, realization_id), rows in sorted(groups.items()):
        lexical = lexemes[realization_id]
        failed = [row for row in rows if not row["exact"]]
        missing_key = f"expected_{role}_present"
        missing = [row for row in rows if not row[missing_key]]
        result.append(
            {
                "schema_version": 1,
                "role": role,
                "realization_id": realization_id,
                "english_surface": lexical["english_surface"],
                "expected_surface": lexical["expected_surface"],
                "lexeme_exact": lexical["exact"],
                "sentence_rows": len(rows),
                "sentence_exact": len(rows) - len(failed),
                "sentence_failures": len(failed),
                "expected_slot_missing": len(missing),
                "failed_pair_ids": [row["pair_id"] for row in failed],
                "failure_codes": sorted(
                    {code for row in failed for code in row["failure_codes"]}
                ),
                "claim_limit": "Failure counts are clustered diagnostics over development rows.",
            }
        )
    return result


def summarize(
    sentences: list[dict[str, Any]],
    lexemes: list[dict[str, Any]],
    model_info: dict[str, Any],
) -> dict[str, Any]:
    lexical_by_id = {row["realization_id"]: row for row in lexemes}
    composition = defaultdict(int)
    for row in sentences:
        subject_exact = lexical_by_id[row["bindings"]["subject"]]["exact"]
        predicate_exact = lexical_by_id[row["bindings"]["predicate"]]["exact"]
        key = (
            "both_lexemes_exact" if subject_exact and predicate_exact else "lexical_failure",
            "sentence_exact" if row["exact"] else "sentence_failure",
        )
        composition["__".join(key)] += 1
    latencies = [row["wall_ms"] for row in [*sentences, *lexemes]]
    families = {}
    for family in sorted({row["construction_family"] for row in sentences}):
        family_rows = [row for row in sentences if row["construction_family"] == family]
        families[family] = {
            "rows": len(family_rows),
            "exact": sum(row["exact"] for row in family_rows),
            "both_expected_slots_present": sum(
                row["both_expected_slots_present"] for row in family_rows
            ),
        }
    return {
        "sentence_rows": len(sentences),
        "sentence_exact": sum(row["exact"] for row in sentences),
        "sentence_both_expected_slots_present": sum(
            row["both_expected_slots_present"] for row in sentences
        ),
        "sentence_expected_subject_present": sum(
            row["expected_subject_present"] for row in sentences
        ),
        "sentence_expected_predicate_present": sum(
            row["expected_predicate_present"] for row in sentences
        ),
        "unique_lexical_realizations": len(lexemes),
        "lexeme_exact": sum(row["exact"] for row in lexemes),
        "composition_table": dict(sorted(composition.items())),
        "family_results": families,
        "blank_outputs": sum(not normalize_surface(row["prediction"]) for row in sentences),
        "source_copies": sum(
            normalize_surface(row["prediction"]) == normalize_surface(row["source_text"])
            for row in sentences
        ),
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
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("unsupported contract schema")

    candidates = []
    realization_rows = []
    manifest_inputs = {}
    for set_name, components in contract["candidate_sets"].items():
        for kind in ("candidates", "realizations"):
            _, rows = resolve_input(program_root, components[kind])
            manifest_inputs[f"{set_name}.{kind}"] = components[kind]
            if kind == "candidates":
                candidates.extend(rows)
            else:
                realization_rows.extend(rows)
    realizations = merge_realizations(realization_rows)
    validate_candidates(candidates, realizations)

    base_url = contract["base_url"].rstrip("/")
    model_request = urllib.request.Request(
        f"{base_url}/v1/model?" + urllib.parse.urlencode({"language": contract["language"]}),
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

    lexeme_rows = []
    for realization_id in sorted(realizations):
        row = realizations[realization_id]
        response, wall_ms = post_task(
            contract, "lexeme", row["english_surface"], realization_id
        )
        lexeme_rows.append(score_lexeme(row, response, wall_ms))

    known_subjects = {
        normalize_surface(row["target_surface"])
        for row in realizations.values()
        if "subject" in " ".join(row["slot_classes"])
    }
    known_predicates = {
        normalize_surface(row["target_surface"])
        for row in realizations.values()
        if "predicate" in " ".join(row["slot_classes"])
    }
    sentence_rows = []
    for row in sorted(candidates, key=lambda value: value["pairId"]):
        response, wall_ms = post_task(contract, "translate", row["sourceText"], row["pairId"])
        sentence_rows.append(
            score_sentence(
                row,
                response,
                wall_ms,
                realizations,
                known_subjects,
                known_predicates,
            )
        )

    lexeme_by_id = {row["realization_id"]: row for row in lexeme_rows}
    clusters = build_failure_clusters(sentence_rows, lexeme_by_id)
    summary = summarize(sentence_rows, lexeme_rows, model_info)
    created_at = datetime.now(timezone.utc).isoformat()
    report = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": created_at,
        "status": "COMPLETE_DEVELOPMENT_CENSUS",
        "summary": summary,
        "model_endpoint_wall_ms": model_wall_ms,
        "interpretation": (
            "This census separates direct reconstruction of every bound lexical surface "
            "from sentence-level preservation of the same subject and predicate. It can "
            "locate composition and substitution failures, but the candidate rows are "
            "development-consumed and do not estimate natural-translation reliability."
        ),
        "training_authorized": False,
        "runpod_authorized": False,
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "MODEL-INFO.json", model_info)
    write_jsonl_atomic(output_dir / "LEXEME-RESULTS.jsonl", lexeme_rows)
    write_jsonl_atomic(output_dir / "SENTENCE-RESULTS.jsonl", sentence_rows)
    write_jsonl_atomic(output_dir / "FAILURE-CLUSTERS.jsonl", clusters)
    write_json_atomic(output_dir / "REPORT.json", report)
    manifest = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": created_at,
        "status": report["status"],
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
        },
        "contract": {"path": str(contract_path), "sha256": sha256_file(contract_path)},
        "inputs": manifest_inputs,
        "outputs": {
            "MODEL-INFO.json": {"rows": 1},
            "LEXEME-RESULTS.jsonl": {"rows": len(lexeme_rows)},
            "SENTENCE-RESULTS.jsonl": {"rows": len(sentence_rows)},
            "FAILURE-CLUSTERS.jsonl": {"rows": len(clusters)},
            "REPORT.json": {"rows": 1},
        },
        "claim_limit": contract["claim_limit"],
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

#!/usr/bin/env python3
"""Build source-bound intervention dossiers for clustered Wajarri v2 failures."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import unicodedata
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-cluster-dossiers-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


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


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def write_text_atomic(path: Path, text: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def write_json_atomic(path: Path, value: Any) -> None:
    write_text_atomic(
        path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    write_text_atomic(path, "".join(canonical_json(row) + "\n" for row in rows))


def normalize_surface(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split()).strip(
        " .?!,;:"
    )


def index_unique(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = str(row[key])
        if value in result:
            raise ValueError(f"duplicate {key}: {value}")
        result[value] = row
    return result


def build_dossiers(
    contract: dict[str, Any],
    resolved: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    open_by_form = index_unique(resolved["open_source_lexemes"], "source_form_id")
    census_by_id = index_unique(resolved["source_census"], "sourceRecordId")
    outcome_by_id = index_unique(resolved["source_record_outcomes"], "source_record_id")
    holdout_by_id = index_unique(resolved["holdout_composition"], "row_id")
    probe_by_id = index_unique(resolved["live_probes"], "probe_id")

    dossiers = []
    for cluster in contract["clusters"]:
        source_lexeme = open_by_form.get(cluster["source_form_id"])
        if source_lexeme is None:
            raise ValueError(f"missing source form: {cluster['source_form_id']}")
        if normalize_surface(source_lexeme["output_text"]) != normalize_surface(
            cluster["source_target"]
        ):
            raise ValueError(f"source target mismatch for {cluster['cluster_id']}")

        census_rows = []
        for source_record_id in cluster["local_source_record_ids"]:
            if source_record_id not in census_by_id:
                raise ValueError(f"missing census row: {source_record_id}")
            census_rows.append(census_by_id[source_record_id])
        outcome = outcome_by_id.get(cluster["diagnostic_source_record_id"])
        if outcome is None:
            raise ValueError(
                f"missing source outcome: {cluster['diagnostic_source_record_id']}"
            )

        sentence_rows = []
        for row_id in cluster["sentence_row_ids"]:
            row = holdout_by_id.get(row_id)
            if row is None:
                raise ValueError(f"missing sentence row: {row_id}")
            if normalize_surface(row["expected_subject"]) != normalize_surface(
                cluster["source_target"]
            ):
                raise ValueError(f"sentence subject mismatch for {row_id}")
            sentence_rows.append(row)

        probes = []
        for probe_id in cluster["live_probe_ids"]:
            probe = probe_by_id.get(probe_id)
            if probe is None:
                raise ValueError(f"missing live probe: {probe_id}")
            if probe["cluster_id"] != cluster["cluster_id"]:
                raise ValueError(f"live probe cluster mismatch for {probe_id}")
            probes.append(probe)

        local_targets = sorted(
            {row["sourceTargetCandidate"]["source"] for row in census_rows},
            key=normalize_surface,
        )
        model_surfaces = sorted(
            {
                value
                for value in [
                    outcome["direct"]["prediction"],
                    outcome["context"]["prediction"],
                    *(row["sentence_prediction"] for row in sentence_rows),
                    *(row["translation"] for row in probes),
                ]
                if value
            },
            key=normalize_surface,
        )
        dossier = {
            "schema_version": 1,
            "cluster_id": cluster["cluster_id"],
            "english_lemma": cluster["english_lemma"],
            "source_scoped_mapping": {
                "source_form_id": source_lexeme["source_form_id"],
                "input_text": source_lexeme["input_text"],
                "target": source_lexeme["output_text"],
                "source_id": source_lexeme["source_id"],
                "license": source_lexeme["license"],
                "part_of_speech_status": source_lexeme["part_of_speech_status"],
                "sentence_slot_eligible": source_lexeme["sentence_slot_eligible"],
            },
            "local_dictionary_candidates": [
                {
                    "source_record_id": row["sourceRecordId"],
                    "prompt": row["sourcePromptCandidate"]["source"],
                    "target": row["sourceTargetCandidate"]["source"],
                    "training_eligibility": row["trainingEligibility"],
                    "blocker_codes": row["blockerCodes"],
                }
                for row in census_rows
            ],
            "local_accepted_target_candidates": local_targets,
            "frozen_source_record_behavior": {
                "source_record_id": outcome["source_record_id"],
                "source_prompt": outcome["source_prompt"],
                "source_target": outcome["source_target"],
                "direct": outcome["direct"],
                "context": outcome["context"],
                "outcome_class": outcome["outcome_class"],
            },
            "sentence_behavior": [
                {
                    "row_id": row["row_id"],
                    "input_text": row["input_text"],
                    "reference": row["reference"],
                    "prediction": row["sentence_prediction"],
                    "exact": row["sentence_exact"],
                    "construction_family": row["construction_family"],
                }
                for row in sentence_rows
            ],
            "live_behavior": [
                {
                    "probe_id": row["probe_id"],
                    "task": row["task"],
                    "text": row["text"],
                    "translation": row["translation"],
                    "accepted_exact": row["accepted_exact"],
                    "frozen_prediction_match": row["frozen_prediction_match"],
                }
                for row in probes
            ],
            "observed_model_surfaces": model_surfaces,
            "analyst_disposition": cluster["analyst_disposition"],
            "claim_limit": (
                "This dossier binds source and model evidence for intervention design. "
                "Model outputs are never promoted to dictionary forms or accepted "
                "references without independent source adjudication."
            ),
        }
        dossiers.append(dossier)
    return sorted(dossiers, key=lambda row: row["cluster_id"])


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

    resolved: dict[str, list[dict[str, Any]]] = {}
    manifest_inputs = {}
    for name, component in contract["inputs"].items():
        _, rows = resolve_input(program_root, component)
        resolved[name] = rows
        manifest_inputs[name] = dict(component)

    dossiers = build_dossiers(contract, resolved)
    counts = {
        "clusters": len(dossiers),
        "sentence_rows": sum(len(row["sentence_behavior"]) for row in dossiers),
        "live_probes": sum(len(row["live_behavior"]) for row in dossiers),
        "source_scoped_mappings": len(dossiers),
        "local_source_records": sum(
            len(row["local_dictionary_candidates"]) for row in dossiers
        ),
        "clusters_requiring_reference_adjudication": sum(
            row["analyst_disposition"]["reference_status"]
            == "source_scoped_only_pending_cross_source_adjudication"
            for row in dossiers
        ),
        "clusters_authorized_for_sealed_test": sum(
            row["analyst_disposition"]["sealed_test_eligible"] for row in dossiers
        ),
    }
    for key, expected in contract["expected"].items():
        if counts.get(key) != int(expected):
            raise ValueError(
                f"count mismatch for {key}: expected {expected}, got {counts.get(key)}"
            )

    report = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_SOURCE_BOUND_CLUSTER_TRIAGE",
        "counts": counts,
        "decisions": [
            "Do not add any model-generated surface to the dictionary or accepted-reference set.",
            "Keep all three clusters out of sealed evaluation because they are development-consumed and require cross-source adjudication.",
            "Use source-licensed target forms only in bounded development interventions.",
            "Separate prompt conditioning, exact surface realization, and sentence-conditioned lexical selection in v3 evaluation.",
        ],
        "training_authorized": False,
        "runpod_authorized": False,
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    write_jsonl_atomic(output_dir / "CLUSTER-DOSSIERS.jsonl", dossiers)
    write_json_atomic(output_dir / "REPORT.json", report)
    manifest = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": report["status"],
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
        },
        "contract": {
            "path": str(contract_path),
            "sha256": sha256_file(contract_path),
        },
        "inputs": manifest_inputs,
        "outputs": {
            "CLUSTER-DOSSIERS.jsonl": {"rows": len(dossiers)},
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

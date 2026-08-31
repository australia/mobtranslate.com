#!/usr/bin/env python3
"""Build a fail-closed tokenizer/readiness assessment for Anindilyakwa research training."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_within(root: Path, relative: str) -> Path:
    if Path(relative).is_absolute():
        raise ValueError(f"bound path must be relative: {relative}")
    resolved = (root / relative).resolve()
    resolved.relative_to(root)
    return resolved


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"JSON document is not an object: {path}")
    return value


def verify_bound(root: Path, binding: dict[str, Any]) -> Path:
    path = resolve_within(root, str(binding["path"]))
    observed = sha256_file(path)
    expected = str(binding["sha256"])
    if observed != expected:
        raise ValueError(f"SHA-256 mismatch for {path}: {observed} != {expected}")
    return path


def percentile(values: list[int], fraction: float) -> int:
    if not values:
        raise ValueError("cannot calculate percentile of an empty collection")
    ordered = sorted(values)
    return ordered[round((len(ordered) - 1) * fraction)]


def summarize(values: list[int], whitespace_units: int, token_total: int) -> dict[str, Any]:
    return {
        "rows": len(values),
        "whitespace_units": whitespace_units,
        "tokens": token_total,
        "tokens_per_whitespace_unit": token_total / whitespace_units,
        "token_count_p50": percentile(values, 0.50),
        "token_count_p90": percentile(values, 0.90),
        "token_count_p99": percentile(values, 0.99),
        "token_count_max": max(values),
    }


def write_immutable(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_text(encoding="utf-8") != content:
            raise FileExistsError(f"refusing to rewrite immutable artifact: {path}")
        return
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        handle.write(content)
    temporary.chmod(0o664)
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    contract_path = args.contract.resolve()
    contract_path.relative_to(program_root)
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("unsupported contract schema")
    if contract.get("program_id") != "anindilyakwa-v1":
        raise ValueError("unexpected program identity")

    input_paths = {
        name: verify_bound(program_root, binding)
        for name, binding in contract["inputs"].items()
    }
    for binding in contract.get("implementation", []):
        path = Path(str(binding["path"])).resolve()
        if sha256_file(path) != binding["sha256"]:
            raise ValueError(f"implementation hash mismatch: {path}")

    audit = load_json(input_paths["tokenizer_audit_report"])
    tokenizer = load_json(input_paths["control_tokenizer_manifest"])
    view = load_json(input_paths["training_view_manifest"])
    if audit.get("direction") != "eng-aoi" or view.get("direction") != "eng-aoi":
        raise ValueError("direction mismatch")
    if tokenizer.get("status") != "PASS" or audit.get("operation") != (
        "paired_tokenizer_extension_impact_audit"
    ):
        raise ValueError("tokenizer evidence is not a passing audit")
    if tokenizer["extension"]["target_language"]["token"] != "aoi_Latn":
        raise ValueError("target language token mismatch")
    if tokenizer["extension"]["rows_requiring_model_growth"] != 0:
        raise ValueError("control token unexpectedly requires model vocabulary growth")

    expected_component_hashes = {
        "train": view["components"]["train"]["sha256"],
        "development": view["components"]["development"]["sha256"],
    }
    for label, expected in expected_component_hashes.items():
        if audit["corpora"][label]["sha256"] != expected:
            raise ValueError(f"audit/view corpus hash mismatch: {label}")

    policy = contract["policy"]
    limits = {
        "source_conditioned": int(policy["max_source_length"]),
        "target_selected": int(policy["max_target_length"]),
    }
    values: dict[str, list[int]] = {view_name: [] for view_name in limits}
    whitespace = Counter()
    token_totals = Counter()
    unknown_rows = Counter()
    round_trip_failures = Counter()
    changed_rows = Counter()
    over_limit = Counter()
    row_ids: dict[str, set[str]] = {view_name: set() for view_name in limits}
    with input_paths["tokenizer_audit_rows"].open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            view_name = str(row["view"])
            if view_name not in limits:
                continue
            row_id = str(row["row_id"])
            split_identity = f"{row['corpus']}:{row_id}"
            if split_identity in row_ids[view_name]:
                raise ValueError(
                    f"duplicate {view_name} row at audit line {line_number}: {split_identity}"
                )
            row_ids[view_name].add(split_identity)
            count = int(row["candidate_token_count"])
            values[view_name].append(count)
            whitespace[view_name] += int(row["whitespace_units"])
            token_totals[view_name] += count
            unknown_rows[view_name] += bool(row["candidate_has_unknown"])
            round_trip_failures[view_name] += not bool(row["candidate_round_trip_exact"])
            changed_rows[view_name] += bool(row["tokenization_changed"])
            over_limit[view_name] += count + int(policy["special_token_allowance"]) > limits[
                view_name
            ]

    expected_rows = sum(int(value) for value in view["rows"].values())
    checks = {
        "control_tokenizer_passes_reload_audit": tokenizer["status"] == "PASS",
        "all_base_named_token_ids_preserved": (
            tokenizer["extension"]["base_tokens_relocated"] == 0
        ),
        "aoi_control_token_is_exact_special_row": (
            tokenizer["extension"]["target_language"]["token"] == "aoi_Latn"
            and tokenizer["extension"]["target_language"]["token_id"] == 256204
        ),
        "source_rows_reconcile": len(values["source_conditioned"]) == expected_rows,
        "target_rows_reconcile": len(values["target_selected"]) == expected_rows,
        "source_unknown_rows_zero": unknown_rows["source_conditioned"] == 0,
        "target_unknown_rows_zero": unknown_rows["target_selected"] == 0,
        "source_round_trip_failures_zero": round_trip_failures["source_conditioned"]
        == 0,
        "target_round_trip_failures_zero": round_trip_failures["target_selected"] == 0,
        "content_tokenization_unchanged_by_control_registration": sum(
            changed_rows.values()
        )
        == 0,
        "source_truncation_rows_zero": over_limit["source_conditioned"] == 0,
        "target_truncation_rows_zero": over_limit["target_selected"] == 0,
    }
    status = "PASS" if all(checks.values()) else "FAIL"
    report = {
        "schema_version": 1,
        "assessment_id": contract["assessment_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": status,
        "program_id": contract["program_id"],
        "direction": "eng-aoi",
        "base_model": tokenizer["base"],
        "control_token": tokenizer["extension"]["target_language"],
        "control_initialization": tokenizer["extension"]["ordered_extension_rows"][0][
            "initialization"
        ],
        "training_view": {
            "edition_id": view["edition_id"],
            "manifest_sha256": contract["inputs"]["training_view_manifest"]["sha256"],
            "rows": view["rows"],
            "normalization": view["normalization"],
        },
        "policy": policy,
        "measurements": {
            view_name: {
                **summarize(
                    values[view_name],
                    whitespace[view_name],
                    token_totals[view_name],
                ),
                "unknown_rows": unknown_rows[view_name],
                "round_trip_failures": round_trip_failures[view_name],
                "tokenization_changed_rows": changed_rows[view_name],
                "rows_exceeding_limit_with_special_allowance": over_limit[view_name],
            }
            for view_name in limits
        },
        "checks": checks,
        "decision": {
            "tokenizer_ready": status == "PASS",
            "paid_gpu_execution_ready": status == "PASS",
            "lexical_tokenizer_extension_required_for_baseline": False,
            "reason": (
                "The exact aoi_Latn control token reloads without moving any named base token, "
                "the normalized model-facing corpus has no unknown or round-trip failures, and "
                "the frozen source/target lengths avoid truncation. This is an engineering gate "
                "only and establishes no translation quality."
            ),
        },
        "inputs": contract["inputs"],
        "implementation": contract.get("implementation", []),
        "claim_limit": (
            "Tokenizer readiness admits a paid private research baseline only. It does not "
            "authorize public data, public weights, sentence-quality claims, a Space, or homepage inference."
        ),
    }
    output_path = resolve_within(program_root, contract["output"])
    content = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    write_immutable(output_path, content)
    write_immutable(
        output_path.with_name("SHA256SUMS"),
        f"{hashlib.sha256(content.encode('utf-8')).hexdigest()}  {output_path.name}\n",
    )
    print(json.dumps({"output": str(output_path), **report}, ensure_ascii=False, indent=2))
    if status != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()

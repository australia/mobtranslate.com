#!/usr/bin/env python3
"""Audit a completed Wajarri v3 composition screen and freeze paired deltas."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


METHOD_ID_PREFIX = "wajarri-v3-composition-screen-result-v1"
FAULT_FIELDS = ("blank", "source_copy", "repeated_token_4gram")


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
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected JSON object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_number}: expected JSON object")
        rows.append(value)
    return rows


def resolve_under(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as error:
        raise ValueError(f"path escapes program root: {path}") from error
    return path


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


def row_key(row: dict[str, Any]) -> str:
    for key in ("id", "cell_id"):
        value = row.get(key)
        if isinstance(value, str) and value:
            return value
    value = row.get("input_text")
    if isinstance(value, str) and value:
        return value
    raise ValueError("prediction row lacks a stable alignment key")


def index_rows(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = row_key(row)
        if key in indexed:
            raise ValueError(f"duplicate prediction alignment key: {key}")
        indexed[key] = row
    return indexed


def transition(before: dict[str, Any], after: dict[str, Any]) -> str:
    if bool(before["exact"]) and not bool(after["exact"]):
        return "loss"
    if not bool(before["exact"]) and bool(after["exact"]):
        return "gain"
    if before.get("prediction") != after.get("prediction"):
        return "changed_nonexact" if not before["exact"] else "changed_exact"
    return "unchanged"


def compare_rows(
    baseline_rows: list[dict[str, Any]],
    candidate_rows: list[dict[str, Any]],
    *,
    baseline_label: str,
    candidate_label: str,
    suite: str,
) -> list[dict[str, Any]]:
    baseline = index_rows(baseline_rows)
    candidate = index_rows(candidate_rows)
    if set(baseline) != set(candidate):
        raise ValueError(f"unaligned {suite} rows for {candidate_label}")
    compared = []
    for key in sorted(baseline):
        before = baseline[key]
        after = candidate[key]
        compared.append(
            {
                "schema_version": 1,
                "suite": suite,
                "row_key": key,
                "input_text": before.get("input_text"),
                "accepted_references": before.get("accepted_references"),
                "reference": before.get("reference"),
                "ambiguity_class": before.get("ambiguity_class"),
                "baseline_label": baseline_label,
                "baseline_prediction": before.get("prediction"),
                "baseline_exact": bool(before["exact"]),
                "candidate_label": candidate_label,
                "candidate_prediction": after.get("prediction"),
                "candidate_exact": bool(after["exact"]),
                "transition": transition(before, after),
                "baseline_surface_class": before.get("surface_class"),
                "candidate_surface_class": after.get("surface_class"),
            }
        )
    return compared


def transition_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(row["transition"] for row in rows)
    return {key: counts.get(key, 0) for key in (
        "loss", "gain", "changed_exact", "changed_nonexact", "unchanged"
    )}


def development_metrics(summary: dict[str, Any]) -> dict[str, Any]:
    metrics = summary["metrics"]
    return {
        key: metrics[key]
        for key in (
            "rows",
            "exact",
            "subject_present",
            "predicate_present",
            "both_slots_present",
            "mean_chrf2",
            "faults",
        )
    }


def suite_metrics(summary: dict[str, Any], suite: str) -> dict[str, Any]:
    metrics = summary["suites"][suite]
    return {
        key: metrics[key]
        for key in ("rows", "exact", "exact_rate", "mean_chrf2", "mean_grapheme_cer", "faults")
    }


def fault_rows(result_root: Path, arms: Iterable[str]) -> list[dict[str, Any]]:
    rows = []
    for arm in arms:
        prediction_dir = result_root / "full-evaluation" / arm / "predictions"
        for path in sorted(prediction_dir.glob("*.jsonl")):
            for row in load_jsonl(path):
                active = [field for field in FAULT_FIELDS if row.get(field)]
                if active:
                    rows.append(
                        {
                            "schema_version": 1,
                            "arm": arm,
                            "suite": path.stem,
                            "row_key": row_key(row),
                            "input_text": row.get("input_text"),
                            "accepted_references": row.get("accepted_references"),
                            "prediction": row.get("prediction"),
                            "faults": active,
                        }
                    )
    return rows


def verify_bound_result(
    program_root: Path, contract: dict[str, Any]
) -> tuple[Path, dict[str, Any], dict[str, Any], dict[str, Any]]:
    binding = contract["result"]
    result_root = resolve_under(program_root, binding["path"])
    if not result_root.is_dir():
        raise ValueError(f"missing result directory: {result_root}")
    manifest_path = result_root / "RESULT-MANIFEST.json"
    result_path = result_root / "RESULT.json"
    complete_path = result_root / "RUN-COMPLETE.json"
    expected = binding["required_sha256"]
    for name, path in (
        ("RESULT-MANIFEST.json", manifest_path),
        ("RESULT.json", result_path),
        ("RUN-COMPLETE.json", complete_path),
    ):
        if sha256_file(path) != expected[name]:
            raise ValueError(f"bound result SHA-256 mismatch: {name}")
    manifest = load_json(manifest_path)
    omitted_prefixes = tuple(binding.get("allowed_omitted_prefixes", []))
    missing = []
    for relative, metadata in manifest["files"].items():
        path = result_root / relative
        if not path.is_file():
            if any(relative.startswith(prefix) for prefix in omitted_prefixes):
                continue
            missing.append(relative)
            continue
        if path.stat().st_size != metadata["bytes"] or sha256_file(path) != metadata["sha256"]:
            raise ValueError(f"result-manifest mismatch: {relative}")
    if missing:
        raise ValueError(f"missing retained result files: {missing}")
    result = load_json(result_path)
    complete = load_json(complete_path)
    if result["run_id"] != contract["run_id"] or complete["run_id"] != contract["run_id"]:
        raise ValueError("run ID mismatch")
    if complete["result_sha256"] != sha256_file(result_path):
        raise ValueError("RUN-COMPLETE result hash mismatch")
    return result_root, result, complete, manifest


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    contract = load_json(args.contract.resolve())
    if not contract["analysis_id"].startswith(METHOD_ID_PREFIX):
        raise ValueError(f"unexpected analysis ID: {contract['analysis_id']}")
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    result_root, result, complete, result_manifest = verify_bound_result(
        program_root, contract
    )

    selected = result["selected_checkpoints"]
    labels = {
        "B0": "B0",
        "C0": selected["C0"]["label"],
        "T1": selected["T1"]["label"],
    }
    development_summaries = {
        arm: load_json(result_root / "development-evaluation" / label / "SUMMARY.json")
        for arm, label in labels.items()
    }
    development_predictions = {
        arm: load_jsonl(result_root / "development-evaluation" / label / "PREDICTIONS.jsonl")
        for arm, label in labels.items()
    }
    full_summaries = {
        arm: load_json(result_root / "full-evaluation" / arm / "SUMMARY.json")
        for arm in labels
    }

    development_comparisons = []
    for arm in ("C0", "T1"):
        development_comparisons.extend(
            compare_rows(
                development_predictions["B0"],
                development_predictions[arm],
                baseline_label="B0",
                candidate_label=arm,
                suite="composition_development",
            )
        )

    lexical_predictions = {
        arm: load_jsonl(
            result_root
            / "full-evaluation"
            / arm
            / "predictions/lexical_direct_closed.jsonl"
        )
        for arm in labels
    }
    lexical_changes = []
    one_target_comparisons = []
    one_target_changes = []
    for arm in ("C0", "T1"):
        compared = compare_rows(
            lexical_predictions["B0"],
            lexical_predictions[arm],
            baseline_label="B0",
            candidate_label=arm,
            suite="lexical_direct_closed",
        )
        lexical_changes.extend(row for row in compared if row["transition"] != "unchanged")
        one_target = [
            row for row in compared if row["ambiguity_class"] == "one_target"
        ]
        one_target_comparisons.extend(one_target)
        one_target_changes.extend(
            row for row in one_target if row["transition"] != "unchanged"
        )

    sentence_changes = []
    for suite_file in ("synthetic_holdout.jsonl", "historical_holdout.jsonl", "retention.jsonl"):
        baseline_rows = load_jsonl(
            result_root / "full-evaluation/B0/predictions" / suite_file
        )
        for arm in ("C0", "T1"):
            candidate_rows = load_jsonl(
                result_root / f"full-evaluation/{arm}/predictions" / suite_file
            )
            sentence_changes.extend(
                row
                for row in compare_rows(
                    baseline_rows,
                    candidate_rows,
                    baseline_label="B0",
                    candidate_label=arm,
                    suite=suite_file.removesuffix(".jsonl"),
                )
                if row["transition"] != "unchanged"
            )

    faults = fault_rows(result_root, labels)
    fault_counts = Counter(row["arm"] for row in faults)
    baseline_fault_count = fault_counts["B0"]
    gate_requires_absolute_zero = bool(
        contract["completed_run_gate_contract"]["mechanical_faults_must_be_zero"]
    )

    output_dir.mkdir(parents=True)
    output_rows = {
        "DEVELOPMENT-COMPARISONS.jsonl": development_comparisons,
        "LEXICAL-ALL-CHANGES.jsonl": lexical_changes,
        "LEXICAL-ONE-TARGET-CHANGES.jsonl": one_target_changes,
        "SENTENCE-CHANGES.jsonl": sentence_changes,
        "MECHANICAL-FAULTS.jsonl": faults,
    }
    for name, rows in output_rows.items():
        write_jsonl_atomic(output_dir / name, rows)

    report = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": contract["created_at_utc"],
        "run_id": result["run_id"],
        "run_status": result["status"],
        "run_completed_at_utc": complete["completed_at_utc"],
        "promotion_authorized": False,
        "selected_checkpoints": selected,
        "development": {
            arm: development_metrics(development_summaries[arm]) for arm in labels
        },
        "full_regression": {
            arm: {
                "direct_one_target": full_summaries[arm]["direct_one_target"],
                "synthetic_holdout": suite_metrics(full_summaries[arm], "synthetic_holdout"),
                "historical_holdout": suite_metrics(full_summaries[arm], "historical_holdout"),
                "retention": suite_metrics(full_summaries[arm], "retention"),
                "mechanical_fault_count_all_suites": fault_counts[arm],
            }
            for arm in labels
        },
        "paired_changes": {
            "development_B0_to_C0": transition_counts(
                [row for row in development_comparisons if row["candidate_label"] == "C0"]
            ),
            "development_B0_to_T1": transition_counts(
                [row for row in development_comparisons if row["candidate_label"] == "T1"]
            ),
            "one_target_B0_to_C0": transition_counts(
                [
                    row
                    for row in one_target_comparisons
                    if row["candidate_label"] == "C0"
                ]
            ),
            "one_target_B0_to_T1": transition_counts(
                [
                    row
                    for row in one_target_comparisons
                    if row["candidate_label"] == "T1"
                ]
            ),
        },
        "gate_audit": {
            "completed_result_unchanged": True,
            "absolute_zero_fault_gate_required": gate_requires_absolute_zero,
            "untouched_baseline_fault_count": baseline_fault_count,
            "absolute_zero_gate_was_unreachable_by_untouched_baseline": (
                gate_requires_absolute_zero and baseline_fault_count > 0
            ),
            "candidate_fault_counts": {arm: fault_counts[arm] for arm in ("C0", "T1")},
            "next_contract": (
                "Separate deployment-relevant zero-fault suites from the retired raw-definition-context diagnostic; require no new diagnostic faults relative to B0."
            ),
        },
        "diagnosis": [
            "The source-reviewed intervention caused compositional learning on held-out subjects: exact cells rose from 0/13 to 3/13 and expected predicates from 1/13 to 7/13.",
            "The 36-row intervention was repeated 16 times, creating a concentrated four-predicate target distribution. One-target lexical reconstruction gained 8 rows but lost 23, a net loss of 15 exact rows.",
            "The treatment retained all 55 fixed utterances and stayed within the synthetic chrF++ noninferiority margin, but failed lexical noninferiority and introduced one definition-context source copy.",
            "This is evidence that direct composition supervision can move the model, not evidence of broad Wajarri grammar or natural-sentence reliability.",
        ],
        "next_experiment_requirements": [
            "Do not promote or upload the T1 adapter.",
            "Do not commission 3,000 rows yet.",
            "Build a new held-subject development matrix before tuning another recipe; the 13 current cells are consumed.",
            "Test a lower composition dose with broad one-target lexical anchoring at the same optimizer and token budget.",
            "Keep the sentence intervention, lexical anchor, and retention populations visible as separate task classes and report their token shares.",
            "Use deployment-relevant zero-fault gates plus baseline-relative diagnostics for the retired definition-context task.",
        ],
        "claim_limit": (
            "This is a paired analysis of one seed and a development-consumed synthetic matrix. It supports the next internal experiment only; it does not establish translation reliability, grammatical competence, speaker validation, or public-release fitness."
        ),
        "bound_result_manifest_sha256": sha256_file(result_root / "RESULT-MANIFEST.json"),
        "bound_result_manifest_entries": len(result_manifest["files"]),
    }
    write_json_atomic(output_dir / "REPORT.json", report)

    materialized = list(output_rows) + ["REPORT.json"]
    manifest = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": contract["created_at_utc"],
        "contract_path": str(args.contract.resolve()),
        "contract_sha256": sha256_file(args.contract.resolve()),
        "files": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
            }
            for name in sorted(materialized)
        },
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in sorted(materialized + ["MANIFEST.json"])
        ),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

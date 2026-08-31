#!/usr/bin/env python3
"""Explain the Wajarri v3 copy/composition screen and freeze its next hypothesis."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result-dir", type=Path, required=True)
    parser.add_argument("--commission-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"JSON root must be an object: {path}")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not all(isinstance(row, dict) for row in rows):
        raise TypeError(f"JSONL contains a non-object: {path}")
    return rows


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def fault_count(metrics: dict[str, Any]) -> int:
    return sum(
        int(value)
        for endpoint in metrics["by_endpoint"].values()
        for value in endpoint["faults"].values()
    )


def compact_endpoint(metrics: dict[str, Any], endpoint: str) -> dict[str, Any]:
    value = metrics["by_endpoint"][endpoint]
    return {
        "rows": int(value["rows"]),
        "exact": int(value["exact"]),
        "both_slots_present": int(value["both_slots_present"]),
        "subject_present": int(value["subject_present"]),
        "predicate_present": int(value["predicate_present"]),
        "copy_surface_present": int(value["copy_surface_present"]),
        "mean_chrf2": float(value["mean_chrf2"]),
        "faults": {key: int(count) for key, count in value["faults"].items()},
        "failure_codes": {
            key: int(count) for key, count in value["failure_codes"].items()
        },
    }


def group_held_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(str(row["subject_id"]), str(row["expected_subject"]))].append(row)
    return [
        {
            "schema_version": 1,
            "subject_id": subject_id,
            "expected_subject": expected_subject,
            "rows": len(values),
            "exact": sum(bool(row["exact"]) for row in values),
            "subject_present": sum(
                bool(row["expected_subject_present"]) for row in values
            ),
            "predicate_present": sum(
                bool(row["expected_predicate_present"]) for row in values
            ),
            "predictions": sorted({str(row["prediction"]) for row in values}),
        }
        for (subject_id, expected_subject), values in sorted(grouped.items())
    ]


def copy_task_confound(
    baseline_copy: dict[str, Any], commission_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    lexical_parent_rows = sum(
        bool(row.get("parent_lexical_id")) and bool(row.get("source_prompt"))
        for row in commission_rows
    )
    rows = len(commission_rows)
    baseline_exact = int(baseline_copy["exact"])
    return {
        "rows": rows,
        "rows_derived_from_true_lexical_pairs": lexical_parent_rows,
        "untreated_baseline_exact": baseline_exact,
        "untreated_baseline_exact_rate": baseline_exact / rows if rows else 0.0,
        "confounded": rows > 0 and lexical_parent_rows == rows and baseline_exact > 0,
        "reason": (
            "Every copy row retains the true English gloss paired with its true "
            "Wajarri target, and the untreated lexical model already solves many rows. "
            "Exact output therefore cannot distinguish bracket copying from ordinary "
            "lexical reconstruction."
        ),
    }


def trajectory_rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for arm, checkpoints in sorted(result["checkpoint_census"].items()):
        for checkpoint in checkpoints:
            metrics = checkpoint["metrics"]
            rows.append(
                {
                    "schema_version": 1,
                    "arm": arm,
                    "step": int(checkpoint["step"]),
                    "label": str(checkpoint["label"]),
                    "composition_plain": compact_endpoint(
                        metrics, "composition_plain"
                    ),
                    "composition_inline": compact_endpoint(
                        metrics, "composition_inline"
                    ),
                    "held_lexeme_inline": compact_endpoint(
                        metrics, "held_lexeme_inline"
                    ),
                    "copy_screen": compact_endpoint(metrics, "copy_screen"),
                    "fault_count": fault_count(metrics),
                }
            )
    return rows


def failure_rows(
    predictions: list[dict[str, Any]], endpoint: str
) -> list[dict[str, Any]]:
    fields = [
        "row_id",
        "evaluation_endpoint",
        "source_text",
        "input_text",
        "reference",
        "prediction",
        "subject_id",
        "predicate_id",
        "expected_subject",
        "expected_predicate",
        "expected_subject_present",
        "expected_predicate_present",
        "copy_surface_present",
        "failure_codes",
    ]
    return [
        {"schema_version": 1, **{field: row.get(field) for field in fields}}
        for row in predictions
        if row["evaluation_endpoint"] == endpoint and not row["exact"]
    ]


def markdown_report(report: dict[str, Any]) -> str:
    selected = report["selected_checkpoints"]
    k5 = selected["K5"]["development"]
    s5 = selected["S5"]["development"]
    held = report["winning_candidate_analysis"]["held_by_subject"]
    lines = [
        "# Wajarri v3 copy/composition a1 analysis",
        "",
        f"Run: `{report['run_id']}`",
        "",
        f"Formal result: **{report['run_status']}**. No model was promoted and the sealed test was not opened.",
        "",
        "## Selected checkpoints",
        "",
        "| Arm | Step | Composition | Held inline | Copy | Faults |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for arm in ("C5", "K5", "S5"):
        value = selected[arm]
        dev = value["development"]
        lines.append(
            f"| `{arm}` | {value['step']} | {dev['composition_plain']['exact']} / {dev['composition_plain']['rows']} | "
            f"{dev['held_lexeme_inline']['exact']} / {dev['held_lexeme_inline']['rows']} | "
            f"{dev['copy_screen']['exact']} / {dev['copy_screen']['rows']} | {dev['fault_count']} |"
        )
    lines.extend(
        [
            "",
            "`K5` cleared composition, copy, family, retention, synthetic, and mechanical gates. It failed only the held-inline minimum: "
            f"{k5['held_lexeme_inline']['exact']} / {k5['held_lexeme_inline']['rows']} versus 18 / 24. "
            f"`S5` reached {s5['composition_plain']['exact']} composition rows but also failed held uptake and copy.",
            "",
            "## Held-form localization",
            "",
            "| Subject | Surface | Exact | Subject present | Predicate present |",
            "| --- | --- | ---: | ---: | ---: |",
        ]
    )
    for row in held:
        lines.append(
            f"| {row['subject_id']} | `{row['expected_subject']}` | {row['exact']} / {row['rows']} | "
            f"{row['subject_present']} / {row['rows']} | {row['predicate_present']} / {row['rows']} |"
        )
    confound = report["copy_task_confound"]
    lines.extend(
        [
            "",
            "All twelve held failures are concentrated in `miginy` and `jurliny`; `mirdi` and `bigurda` each pass all six predicates. This is not a diffuse sentence-learning failure.",
            "",
            "## Copy-task confound",
            "",
            f"Untreated v2 already scored {confound['untreated_baseline_exact']} / {confound['rows']} on the copy screen. "
            "Every row kept the correct English gloss next to the correct bracketed Wajarri form, so the task could be solved by lexical reconstruction. The 58 / 64 K5 result does not isolate productive copying.",
            "",
            "## Next falsifiable experiment",
            "",
            "Compile disjoint neutral-copy rows whose English carrier supplies no translation clue. Compare one-slot and ordered two-slot copy curricula under the same retention and sentence schedule. Keep all held and sealed surfaces excluded from training. The two-slot arm must emit both bracketed forms in order, because that is the operation required by terminology-conditioned sentence translation.",
            "",
            "No further epoch-only continuation of `S5` or `K5` is justified by this result.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    result_dir = args.result_dir.resolve()
    commission_dir = args.commission_dir.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")

    result_path = result_dir / "RESULT.json"
    complete_path = result_dir / "RUN-COMPLETE.json"
    copy_source_path = commission_dir / "COPY-AUXILIARY-DEVELOPMENT-SCREEN.jsonl"
    result = load_json(result_path)
    complete = load_json(complete_path)
    copy_source_rows = load_jsonl(copy_source_path)
    if result["public_promotion_authorized"] or result["sealed_test_opened"]:
        raise ValueError("analysis expects a non-promoted screening run with sealed data closed")
    if result["winning_candidate"] != "K5":
        raise ValueError("analysis contract expects K5 as the diagnostic winner")

    selected: dict[str, Any] = {}
    for arm in ("C5", "K5", "S5"):
        value = result["selected_checkpoints"][arm]
        metrics = value["development"]["metrics"]
        selected[arm] = {
            "step": int(value["step"]),
            "label": str(value["label"]),
            "adapter_weight_sha256": str(value["adapter_weight_sha256"]),
            "development": {
                endpoint: compact_endpoint(metrics, endpoint)
                for endpoint in (
                    "composition_plain",
                    "composition_inline",
                    "held_lexeme_inline",
                    "held_lexeme_plain",
                    "copy_screen",
                )
            },
        }
        selected[arm]["development"]["fault_count"] = fault_count(metrics)

    winner_label = selected["K5"]["label"]
    prediction_path = result_dir / "development" / winner_label / "PREDICTIONS.jsonl"
    predictions = load_jsonl(prediction_path)
    held_rows = [
        row for row in predictions if row["evaluation_endpoint"] == "held_lexeme_inline"
    ]
    held_by_subject = group_held_rows(held_rows)
    held_failures = failure_rows(predictions, "held_lexeme_inline")
    copy_failures = failure_rows(predictions, "copy_screen")
    composition_failures = failure_rows(predictions, "composition_plain")
    baseline_copy = result["baseline"]["development"]["metrics"]["by_endpoint"]
    confound = copy_task_confound(baseline_copy["copy_screen"], copy_source_rows)

    report = {
        "schema_version": 1,
        "analysis_id": "wbv-v3-copy-composition-screen-a1-analysis-v1",
        "created_at_utc": complete["completed_at_utc"],
        "status": "PASS_NEGATIVE_SCREEN_MECHANISM_LOCALIZATION",
        "run_id": result["run_id"],
        "run_status": result["status"],
        "result_sha256": sha256_file(result_path),
        "screen_pass": bool(result["screen_pass"]),
        "public_promotion_authorized": bool(result["public_promotion_authorized"]),
        "sealed_test_opened": bool(result["sealed_test_opened"]),
        "selected_checkpoints": selected,
        "candidate_gate_results": result["candidate_gate_results"],
        "full_gate_results": result["full_gate_results"],
        "copy_task_confound": confound,
        "winning_candidate_analysis": {
            "held_by_subject": held_by_subject,
            "held_failure_rows": len(held_failures),
            "copy_failure_rows": len(copy_failures),
            "composition_failure_rows": len(composition_failures),
            "all_held_failures_localized_to_subjects": sorted(
                {str(row["subject_id"]) for row in held_failures}
            ),
        },
        "next_experiment": {
            "name": "neutral single-slot versus ordered two-slot copy intervention",
            "start_from": "the same immutable v2 plus task-token union adapter",
            "fixed_components": [
                "retention schedule",
                "plain sentence schedule",
                "inline sentence schedule",
                "optimizer updates and learning-rate trajectory",
                "held and composition development rows",
                "decoder",
            ],
            "changed_component": "copy auxiliary input representation only",
            "training_exclusions": [
                "all held development target surfaces",
                "all sealed target surfaces by predeclared exclusion binding",
            ],
            "arms": {
                "N6": "one neutral bracketed surface to exact output",
                "D6": "two neutral bracketed surfaces to ordered two-surface output",
            },
            "primary_gate": "at least 18/24 exact held-inline rows with at least 8/11 exact plain compositions and zero faults",
            "claim_limit": "Auxiliary rows test copy mechanics only and are not Wajarri sentences or linguistic evidence.",
        },
        "claim_limit": (
            "The screen establishes improvement on consumed controlled regression rows, "
            "not natural Wajarri translation. The held failure set is now development "
            "evidence and may not be reported as a sealed generalization test."
        ),
    }

    output_dir.mkdir(parents=True)
    trajectory = trajectory_rows(result)
    generated = {
        "TRAJECTORY.jsonl": trajectory,
        "HELD-FAILURES.jsonl": held_failures,
        "COPY-FAILURES.jsonl": copy_failures,
        "COMPOSITION-FAILURES.jsonl": composition_failures,
    }
    for name, rows in generated.items():
        write_jsonl(output_dir / name, rows)
    write_json(output_dir / "REPORT.json", report)
    (output_dir / "REPORT.md").write_text(markdown_report(report), encoding="utf-8")

    source_files = [result_path, complete_path, prediction_path, copy_source_path]
    artifact_files = [
        output_dir / name
        for name in [*generated, "REPORT.json", "REPORT.md"]
    ]
    manifest = {
        "schema_version": 1,
        "analysis_id": report["analysis_id"],
        "created_at_utc": report["created_at_utc"],
        "status": report["status"],
        "sources": {
            str(path): {"sha256": sha256_file(path), "bytes": path.stat().st_size}
            for path in source_files
        },
        "artifacts": {
            path.name: {"sha256": sha256_file(path), "bytes": path.stat().st_size}
            for path in artifact_files
        },
    }
    write_json(output_dir / "MANIFEST.json", manifest)
    sums = [*artifact_files, output_dir / "MANIFEST.json"]
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in sums),
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

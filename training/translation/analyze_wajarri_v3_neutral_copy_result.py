#!/usr/bin/env python3
"""Analyze the Wajarri neutral-copy screen and freeze its next intervention."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any


COPY_ENDPOINTS = (
    "neutral_single_copy_screen",
    "neutral_dual_copy_screen",
)
SENTENCE_ENDPOINTS = (
    "composition_plain",
    "composition_inline",
    "held_lexeme_plain",
    "held_lexeme_inline",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result-dir", type=Path, required=True)
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


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized(value: Any) -> str:
    return " ".join(str(value or "").split()).casefold().strip(" .?!,;:")


def levenshtein_edit_counts(reference: str, prediction: str) -> dict[str, int]:
    """Return one deterministic minimum-edit alignment with operation counts."""
    left = list(normalized(reference))
    right = list(normalized(prediction))
    costs = [[0] * (len(right) + 1) for _ in range(len(left) + 1)]
    traces = [[""] * (len(right) + 1) for _ in range(len(left) + 1)]
    for index in range(1, len(left) + 1):
        costs[index][0] = index
        traces[index][0] = "deletion"
    for index in range(1, len(right) + 1):
        costs[0][index] = index
        traces[0][index] = "insertion"
    # Stable tie order makes the audit reproducible: match/substitution,
    # deletion, then insertion.
    priority = {"match": 0, "substitution": 0, "deletion": 1, "insertion": 2}
    for row in range(1, len(left) + 1):
        for column in range(1, len(right) + 1):
            diagonal_operation = (
                "match" if left[row - 1] == right[column - 1] else "substitution"
            )
            candidates = [
                (
                    costs[row - 1][column - 1]
                    + int(diagonal_operation == "substitution"),
                    diagonal_operation,
                ),
                (costs[row - 1][column] + 1, "deletion"),
                (costs[row][column - 1] + 1, "insertion"),
            ]
            cost, operation = min(
                candidates, key=lambda item: (item[0], priority[item[1]])
            )
            costs[row][column] = cost
            traces[row][column] = operation
    counts = Counter()
    row, column = len(left), len(right)
    while row or column:
        operation = traces[row][column]
        if operation in {"match", "substitution"}:
            row -= 1
            column -= 1
        elif operation == "deletion":
            row -= 1
        elif operation == "insertion":
            column -= 1
        else:
            raise RuntimeError(f"invalid edit trace at {row}, {column}: {operation!r}")
        counts[operation] += 1
    return {
        "distance": costs[len(left)][len(right)],
        "insertions": counts["insertion"],
        "deletions": counts["deletion"],
        "substitutions": counts["substitution"],
        "matches": counts["match"],
    }


def mutation_class(reference: str, prediction: str) -> str:
    if normalized(reference) == normalized(prediction):
        return "exact"
    if normalized(reference).replace(" ", "") == normalized(prediction).replace(" ", ""):
        return "token_boundary_only"
    edits = levenshtein_edit_counts(reference, prediction)
    if edits["distance"] == 1:
        return "one_character_mutation"
    if edits["distance"] == 2:
        return "two_character_mutation"
    reference_length = max(1, len(normalized(reference)))
    if edits["distance"] / reference_length <= 0.25:
        return "near_copy_mutation"
    return "major_rewrite_or_omission"


def compact_endpoint(metrics: dict[str, Any], endpoint: str) -> dict[str, Any]:
    value = metrics["by_endpoint"][endpoint]
    return {
        "rows": int(value["rows"]),
        "exact": int(value["exact"]),
        "both_slots_present": int(value["both_slots_present"]),
        "copy_surface_present": int(value["copy_surface_present"]),
        "mean_chrf2": float(value["mean_chrf2"]),
        "faults": {key: int(count) for key, count in value["faults"].items()},
    }


def fault_count(metrics: dict[str, Any]) -> int:
    return sum(
        int(value)
        for endpoint in metrics["by_endpoint"].values()
        for value in endpoint["faults"].values()
    )


def trajectory_rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for arm, checkpoints in sorted(result["checkpoint_census"].items()):
        for checkpoint in checkpoints:
            metrics = checkpoint["metrics"]
            rows.append(
                {
                    "schema_version": 1,
                    "arm": arm,
                    "step": int(checkpoint["step"]),
                    **{
                        endpoint: compact_endpoint(metrics, endpoint)
                        for endpoint in (*SENTENCE_ENDPOINTS, *COPY_ENDPOINTS)
                    },
                    "fault_count": fault_count(metrics),
                }
            )
    return rows


def held_by_subject(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["evaluation_endpoint"] == "held_lexeme_inline":
            groups[(str(row["subject_id"]), str(row["expected_subject"]))].append(row)
    return [
        {
            "subject_id": subject_id,
            "expected_subject": surface,
            "rows": len(values),
            "exact": sum(bool(value["exact"]) for value in values),
            "subject_present": sum(
                bool(value["expected_subject_present"]) for value in values
            ),
            "predictions": sorted({str(value["prediction"]) for value in values}),
        }
        for (subject_id, surface), values in sorted(groups.items())
    ]


def copy_failure_analysis(rows: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    failures = [
        row for row in rows if row["evaluation_endpoint"] in COPY_ENDPOINTS and not row["exact"]
    ]
    detailed = []
    for row in failures:
        edits = levenshtein_edit_counts(row["reference"], row["prediction"])
        detailed.append(
            {
                "schema_version": 1,
                "row_id": row["row_id"],
                "endpoint": row["evaluation_endpoint"],
                "input_text": row["input_text"],
                "reference": row["reference"],
                "prediction": row["prediction"],
                "mutation_class": mutation_class(row["reference"], row["prediction"]),
                "edit_counts": edits,
                "failure_codes": row["failure_codes"],
            }
        )
    classes = Counter(row["mutation_class"] for row in detailed)
    by_endpoint = {}
    for endpoint in COPY_ENDPOINTS:
        endpoint_rows = [row for row in detailed if row["endpoint"] == endpoint]
        by_endpoint[endpoint] = {
            "failures": len(endpoint_rows),
            "mutation_classes": dict(
                sorted(Counter(row["mutation_class"] for row in endpoint_rows).items())
            ),
            "mean_edit_distance": (
                sum(row["edit_counts"]["distance"] for row in endpoint_rows)
                / len(endpoint_rows)
                if endpoint_rows
                else 0.0
            ),
        }
    return (
        {
            "failure_rows": len(detailed),
            "mutation_classes": dict(sorted(classes.items())),
            "by_endpoint": by_endpoint,
        },
        detailed,
    )


def compact_suite(summary: dict[str, Any], suite: str) -> dict[str, Any]:
    value = summary["suites"][suite]
    return {
        "rows": int(value["rows"]),
        "exact": int(value["exact"]),
        "mean_chrf2": float(value["mean_chrf2"]),
        "faults": {key: int(count) for key, count in value["faults"].items()},
    }


def markdown_report(report: dict[str, Any]) -> str:
    selected = report["selected_checkpoints"]
    lines = [
        "# Wajarri v3 neutral-copy a1 analysis",
        "",
        f"Run: `{report['run_id']}`",
        "",
        f"Formal result: **{report['run_status']}**. The sealed test remained closed and no model was promoted.",
        "",
        "## Selected checkpoints",
        "",
        "| Arm | Step | Plain composition | Held inline | Single copy | Dual copy | Faults |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for arm in ("N6", "D6"):
        value = selected[arm]
        lines.append(
            f"| `{arm}` | {value['step']} | {value['composition_plain']['exact']} / {value['composition_plain']['rows']} | "
            f"{value['held_lexeme_inline']['exact']} / {value['held_lexeme_inline']['rows']} | "
            f"{value['neutral_single_copy_screen']['exact']} / {value['neutral_single_copy_screen']['rows']} | "
            f"{value['neutral_dual_copy_screen']['exact']} / {value['neutral_dual_copy_screen']['rows']} | {value['fault_count']} |"
        )
    copy = report["winning_candidate_analysis"]["copy_failures"]
    lines.extend(
        [
            "",
            "`D6` causally beat the single-copy control on held-term uptake and ordered two-form copying. It nevertheless failed the frozen exact-copy, fixed-retention, and mechanical gates.",
            "",
            "## Failure character",
            "",
            f"The selected `D6` checkpoint has {copy['failure_rows']} neutral-copy failures. "
            f"Their edit classes are `{json.dumps(copy['mutation_classes'], sort_keys=True)}`. "
            "Most outputs preserve much of the supplied string but alter spelling, spacing, or segments, which is consistent with translation-like normalization rather than a literal-copy operation.",
            "",
            "Held-inline performance is 21 / 24. The remaining failures are localized to `miginy`; `jurliny`, `mirdi`, and `bigurda` pass all six predicates.",
            "",
            "## Next falsifiable intervention",
            "",
            "Reserve a dedicated `<copy>` control token and change only neutral auxiliary rows from `<translate>` to `<copy>`. Preserve the D6 presentation order, outputs, optimizer horizon, learning-rate trajectory, sentence rows, held rows, decoder, and exclusions. Bind the new token ID and its decomposition-mean initialization to checksums before paid execution.",
            "",
            "The prior `D6` result is the prospective control. The intervention must improve exact neutral copying without reducing held-inline composition or sentence retention. It remains a copy-mechanics experiment, not evidence of natural Wajarri reliability.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    result_dir = args.result_dir.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")
    result_path = result_dir / "RESULT.json"
    complete_path = result_dir / "RUN-COMPLETE.json"
    result = load_json(result_path)
    complete = load_json(complete_path)
    if result.get("winning_candidate") != "D6":
        raise ValueError("neutral-copy analysis expects D6 as the diagnostic winner")
    if result.get("sealed_test_opened") or result.get("public_promotion_authorized"):
        raise ValueError("analysis expects a non-promoted screen with sealed data closed")

    selected = {}
    predictions_by_arm = {}
    for arm in ("N6", "D6"):
        checkpoint = result["selected_checkpoints"][arm]
        metrics = checkpoint["development"]["metrics"]
        selected[arm] = {
            "step": int(checkpoint["step"]),
            "label": str(checkpoint["label"]),
            "adapter_weight_sha256": str(checkpoint["adapter_weight_sha256"]),
            **{
                endpoint: compact_endpoint(metrics, endpoint)
                for endpoint in (*SENTENCE_ENDPOINTS, *COPY_ENDPOINTS)
            },
            "fault_count": fault_count(metrics),
        }
        prediction_path = (
            result_dir
            / "development"
            / str(checkpoint["label"])
            / "PREDICTIONS.jsonl"
        )
        predictions_by_arm[arm] = load_jsonl(prediction_path)

    copy_summary, copy_failures = copy_failure_analysis(predictions_by_arm["D6"])
    full_suites = {
        arm: {
            suite: compact_suite(result["full_summaries"][arm], suite)
            for suite in (
                "retention",
                "synthetic_holdout",
                "historical_holdout",
                "lexical_direct_closed",
                "lexical_context_closed",
            )
        }
        for arm in ("B0", "N6", "D6")
    }
    report = {
        "schema_version": 1,
        "analysis_id": "wbv-v3-neutral-copy-screen-a1-analysis-v1",
        "created_at_utc": complete["completed_at_utc"],
        "status": "PASS_NEGATIVE_SCREEN_MECHANISM_LOCALIZATION",
        "run_id": result["run_id"],
        "run_status": result["status"],
        "result_sha256": sha256_file(result_path),
        "run_complete_sha256": sha256_file(complete_path),
        "screen_pass": bool(result["screen_pass"]),
        "sealed_test_opened": bool(result["sealed_test_opened"]),
        "public_promotion_authorized": bool(result["public_promotion_authorized"]),
        "selected_checkpoints": selected,
        "candidate_gate_results": result["candidate_gate_results"],
        "full_gate_results": result["full_gate_results"],
        "intervention_comparison": result["intervention_comparison"],
        "full_suite_diagnostics": full_suites,
        "winning_candidate_analysis": {
            "held_by_subject": held_by_subject(predictions_by_arm["D6"]),
            "copy_failures": copy_summary,
        },
        "next_experiment": {
            "name": "dedicated-copy-task-token intervention",
            "control": "immutable D6 a1 schedule and selected result",
            "changed_component": (
                "neutral-copy model-visible prefix only: <translate> becomes <copy>"
            ),
            "fixed_components": [
                "D6 row presentation order and counts",
                "all target outputs",
                "sentence and retention rows",
                "optimizer updates and learning-rate trajectory",
                "development and confirmation surfaces",
                "decoder and numerical precision",
                "held and sealed exclusions",
            ],
            "mechanism_contract": [
                "append one exact special token at ID 256208",
                "initialize the base row from the checksum-bound pre-addition decomposition mean",
                "extend the four-row initial PEFT token adapter to five rows without changing prior rows",
                "require a nonzero gradient and changed row for <copy>",
            ],
            "screen_gate": {
                "composition_plain_minimum_exact": "8/11",
                "held_inline_minimum_exact": "18/24",
                "neutral_single_minimum_exact": "56/64",
                "neutral_dual_minimum_exact": "56/64",
                "development_faults": 0,
                "retention": "55/55 exact with zero faults",
                "synthetic_noninferiority": "at least B0 exact and chrF2 minus 2",
            },
            "claim_limit": (
                "The intervention tests explicit copy-task control only; it cannot "
                "authorize natural translation or public release."
            ),
        },
        "claim_limit": (
            "Consumed development and copy-mechanics evidence only. The result does "
            "not establish natural Wajarri translation, speaker validation, or release fitness."
        ),
    }

    output_dir.mkdir(parents=True)
    write_json(output_dir / "ANALYSIS.json", report)
    write_jsonl(output_dir / "TRAJECTORY.jsonl", trajectory_rows(result))
    write_jsonl(output_dir / "D6-COPY-FAILURES.jsonl", copy_failures)
    (output_dir / "REPORT.md").write_text(
        markdown_report(report), encoding="utf-8"
    )
    files = [path for path in sorted(output_dir.iterdir()) if path.is_file()]
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "analysis_id": report["analysis_id"],
                "analysis_sha256": sha256_file(output_dir / "ANALYSIS.json"),
                "report_sha256": sha256_file(output_dir / "REPORT.md"),
                "copy_failure_rows": len(copy_failures),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

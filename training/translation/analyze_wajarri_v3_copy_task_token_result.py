#!/usr/bin/env python3
"""Analyze the Wajarri dedicated-copy-token screen against its frozen D6 control."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from training.translation.analyze_wajarri_v3_neutral_copy_result import (
    COPY_ENDPOINTS,
    SENTENCE_ENDPOINTS,
    compact_endpoint,
    compact_suite,
    copy_failure_analysis,
    fault_count,
    load_json,
    load_jsonl,
    mutation_class,
    normalized,
    trajectory_rows,
    write_json,
    write_jsonl,
)


FULL_SUITES = (
    "retention",
    "synthetic_holdout",
    "historical_holdout",
    "lexical_direct_closed",
    "lexical_context_closed",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--t7-result-dir", type=Path, required=True)
    parser.add_argument("--d6-result-dir", type=Path, required=True)
    parser.add_argument("--schedule-file", type=Path, required=True)
    parser.add_argument("--retention-file", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def selected_checkpoint(result: dict[str, Any], arm: str) -> dict[str, Any]:
    checkpoint = result["selected_checkpoints"][arm]
    metrics = checkpoint["development"]["metrics"]
    return {
        "step": int(checkpoint["step"]),
        "label": str(checkpoint["label"]),
        "adapter_weight_sha256": str(checkpoint["adapter_weight_sha256"]),
        **{
            endpoint: compact_endpoint(metrics, endpoint)
            for endpoint in (*SENTENCE_ENDPOINTS, *COPY_ENDPOINTS)
        },
        "fault_count": fault_count(metrics),
    }


def index_rows(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        row_id = str(row["row_id"])
        if row_id in indexed:
            raise ValueError(f"duplicate evaluation row_id: {row_id}")
        indexed[row_id] = row
    return indexed


def copy_transitions(
    control_rows: list[dict[str, Any]], treatment_rows: list[dict[str, Any]]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    control = index_rows(control_rows)
    treatment = index_rows(treatment_rows)
    if set(control) != set(treatment):
        raise ValueError("D6 and T7 development row identities differ")

    details: list[dict[str, Any]] = []
    by_endpoint: dict[str, Any] = {}
    for endpoint in COPY_ENDPOINTS:
        endpoint_rows = []
        for row_id in sorted(control):
            left = control[row_id]
            right = treatment[row_id]
            if left["evaluation_endpoint"] != right["evaluation_endpoint"]:
                raise ValueError(f"endpoint drift for {row_id}")
            if normalized(left["reference"]) != normalized(right["reference"]):
                raise ValueError(f"reference drift for {row_id}")
            if left["evaluation_endpoint"] != endpoint:
                continue
            left_exact = bool(left["exact"])
            right_exact = bool(right["exact"])
            transition = (
                "exact_to_exact"
                if left_exact and right_exact
                else "fail_to_exact"
                if not left_exact and right_exact
                else "exact_to_fail"
                if left_exact and not right_exact
                else "fail_to_fail"
            )
            prediction_changed = normalized(left["prediction"]) != normalized(
                right["prediction"]
            )
            detail = {
                "schema_version": 1,
                "row_id": row_id,
                "endpoint": endpoint,
                "input_text": right["input_text"],
                "reference": right["reference"],
                "d6_prediction": left["prediction"],
                "t7_prediction": right["prediction"],
                "d6_exact": left_exact,
                "t7_exact": right_exact,
                "transition": transition,
                "prediction_changed": prediction_changed,
                "d6_mutation_class": mutation_class(
                    left["reference"], left["prediction"]
                ),
                "t7_mutation_class": mutation_class(
                    right["reference"], right["prediction"]
                ),
            }
            endpoint_rows.append(detail)
            if prediction_changed or transition in {"fail_to_exact", "exact_to_fail"}:
                details.append(detail)
        by_endpoint[endpoint] = {
            "rows": len(endpoint_rows),
            "transitions": dict(
                sorted(Counter(row["transition"] for row in endpoint_rows).items())
            ),
            "predictions_changed": sum(
                bool(row["prediction_changed"]) for row in endpoint_rows
            ),
            "net_exact_change": sum(
                int(row["t7_exact"]) - int(row["d6_exact"])
                for row in endpoint_rows
            ),
        }
    return {"by_endpoint": by_endpoint, "changed_rows": len(details)}, details


def training_inventory(rows: list[dict[str, Any]]) -> dict[str, Any]:
    populations = Counter(str(row["schedule_population"]) for row in rows)
    return {
        "presentations": len(rows),
        "optimizer_updates": len({int(row["optimizer_update"]) for row in rows}),
        "unique_accounting_parents": len(
            {str(row["accounting_parent_id"]) for row in rows}
        ),
        "unique_source_rows": len({str(row["source_row_id"]) for row in rows}),
        "unique_input_output_pairs": len(
            {
                (normalized(row["input_text"]), normalized(row["output_text"]))
                for row in rows
            }
        ),
        "presentations_by_population": dict(sorted(populations.items())),
        "tokens": {
            key: sum(int(row["token_accounting"][key]) for row in rows)
            for key in (
                "source_tokens_with_specials",
                "target_tokens_with_specials",
                "non_padding_tokens_with_specials",
            )
        },
    }


def retention_inventory(rows: list[dict[str, Any]]) -> dict[str, Any]:
    tasks = Counter(
        "translate"
        if str(row["input_text"]).startswith("<translate>")
        else "lexeme"
        if str(row["input_text"]).startswith("<lexeme>")
        else "other"
        for row in rows
    )
    return {
        "rows": len(rows),
        "rows_by_model_visible_task": dict(sorted(tasks.items())),
        "gate_issue": (
            "The legacy aggregate mixes sentence and lexical tasks. A sentence adapter "
            "must be gated on the translate subset independently; lexical lookup and "
            "lexical reconstruction retain separate gates."
        ),
    }


def markdown_report(report: dict[str, Any]) -> str:
    t7 = report["selected_checkpoints"]["T7"]
    d6 = report["selected_checkpoints"]["D6"]
    transitions = report["copy_transition_analysis"]["by_endpoint"]
    suites = report["full_suite_diagnostics"]
    lines = [
        "# Wajarri v3 dedicated copy-token screen analysis",
        "",
        f"Run: `{report['run_id']}`",
        "",
        f"Formal result: **{report['run_status']}**. The sealed test stayed closed and no adapter was promoted.",
        "",
        "## Frozen screen result",
        "",
        "| Candidate | Plain composition | Held inline | Single copy | Dual copy | Development faults |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        f"| `D6` control | {d6['composition_plain']['exact']} / {d6['composition_plain']['rows']} | {d6['held_lexeme_inline']['exact']} / {d6['held_lexeme_inline']['rows']} | {d6['neutral_single_copy_screen']['exact']} / {d6['neutral_single_copy_screen']['rows']} | {d6['neutral_dual_copy_screen']['exact']} / {d6['neutral_dual_copy_screen']['rows']} | {d6['fault_count']} |",
        f"| `T7` copy token | {t7['composition_plain']['exact']} / {t7['composition_plain']['rows']} | {t7['held_lexeme_inline']['exact']} / {t7['held_lexeme_inline']['rows']} | {t7['neutral_single_copy_screen']['exact']} / {t7['neutral_single_copy_screen']['rows']} | {t7['neutral_dual_copy_screen']['exact']} / {t7['neutral_dual_copy_screen']['rows']} | {t7['fault_count']} |",
        "",
        "The intervention missed both frozen copy thresholds (56/64 each). It changed only "
        f"{transitions['neutral_single_copy_screen']['predictions_changed']} of 64 single-copy predictions and "
        f"{transitions['neutral_dual_copy_screen']['predictions_changed']} of 64 dual-copy predictions. "
        "The dedicated prefix therefore did not create a reliable literal-copy operation.",
        "",
        "## Full regression",
        "",
        "| Suite | B0 exact | D6 exact | T7 exact | T7 faults |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for suite in FULL_SUITES:
        b0 = suites["B0"][suite]
        d6_suite = suites["D6"][suite]
        t7_suite = suites["T7"][suite]
        lines.append(
            f"| `{suite}` | {b0['exact']} / {b0['rows']} | {d6_suite['exact']} / {d6_suite['rows']} | {t7_suite['exact']} / {t7_suite['rows']} | {sum(t7_suite['faults'].values())} |"
        )
    retention = report["retention_task_inventory"]
    lines.extend(
        [
            "",
            "The retained 55-row suite is task-mixed: "
            f"{retention['rows_by_model_visible_task'].get('translate', 0)} `<translate>` rows and "
            f"{retention['rows_by_model_visible_task'].get('lexeme', 0)} `<lexeme>` rows. "
            "Future gates must report these separately because the sentence adapter will not serve dictionary lookup.",
            "",
            "## Decision",
            "",
            "Do not spend another run on a larger copy dose or extra epochs. T7 preserves a useful signal: "
            "glossary-conditioned composition is strong and the synthetic holdout improves, but arbitrary supplied "
            "surfaces are still normalized or rewritten. Exact terminology should therefore move to a deterministic "
            "slot renderer, while the adapter learns sentence structure and slot order.",
            "",
            "The next screen must train and score model-visible output slots before rendering, then score exact "
            "dictionary surfaces after deterministic substitution. It must keep raw placeholder validity, order, "
            "sentence retention, synthetic retention, degeneration, and source-bound diagnostics as independent gates. "
            "This is a routed translation-system experiment, not evidence of unrestricted Wajarri competence.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    t7_dir = args.t7_result_dir.resolve()
    d6_dir = args.d6_result_dir.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise SystemExit(f"refusing existing output directory: {output_dir}")

    t7_result_path = t7_dir / "RESULT.json"
    d6_result_path = d6_dir / "RESULT.json"
    t7_result = load_json(t7_result_path)
    d6_result = load_json(d6_result_path)
    complete = load_json(t7_dir / "RUN-COMPLETE.json")
    if t7_result.get("winning_candidate") != "T7":
        raise ValueError("dedicated-copy-token analysis expects T7")
    if t7_result.get("sealed_test_opened") or t7_result.get(
        "public_promotion_authorized"
    ):
        raise ValueError("analysis expects a non-promoted screen with sealed data closed")

    t7_rows = load_jsonl(t7_dir / "development/T7-step-480/PREDICTIONS.jsonl")
    d6_rows = load_jsonl(d6_dir / "development/D6-step-480/PREDICTIONS.jsonl")
    transition_summary, changed_rows = copy_transitions(d6_rows, t7_rows)
    t7_copy_summary, t7_copy_failures = copy_failure_analysis(t7_rows)
    d6_copy_summary, _ = copy_failure_analysis(d6_rows)

    report = {
        "schema_version": 1,
        "analysis_id": "wbv-v3-copy-task-token-screen-a1-analysis-v1",
        "created_at_utc": complete["completed_at_utc"],
        "status": "PASS_NEGATIVE_SCREEN_DIAGNOSIS_AND_NEXT_ARCHITECTURE",
        "run_id": t7_result["run_id"],
        "run_status": t7_result["status"],
        "t7_result_sha256": sha256_file(t7_result_path),
        "d6_result_sha256": sha256_file(d6_result_path),
        "run_complete_sha256": sha256_file(t7_dir / "RUN-COMPLETE.json"),
        "screen_pass": bool(t7_result["screen_pass"]),
        "sealed_test_opened": bool(t7_result["sealed_test_opened"]),
        "public_promotion_authorized": bool(
            t7_result["public_promotion_authorized"]
        ),
        "selected_checkpoints": {
            "D6": selected_checkpoint(d6_result, "D6"),
            "T7": selected_checkpoint(t7_result, "T7"),
        },
        "candidate_gate_results": t7_result["candidate_gate_results"],
        "full_gate_results": t7_result["full_gate_results"],
        "copy_transition_analysis": transition_summary,
        "copy_failure_analysis": {"D6": d6_copy_summary, "T7": t7_copy_summary},
        "training_inventory": training_inventory(load_jsonl(args.schedule_file)),
        "retention_task_inventory": retention_inventory(
            load_jsonl(args.retention_file)
        ),
        "full_suite_diagnostics": {
            "B0": {
                suite: compact_suite(t7_result["full_summaries"]["B0"], suite)
                for suite in FULL_SUITES
            },
            "D6": {
                suite: compact_suite(d6_result["full_summaries"]["D6"], suite)
                for suite in FULL_SUITES
            },
            "T7": {
                suite: compact_suite(t7_result["full_summaries"]["T7"], suite)
                for suite in FULL_SUITES
            },
        },
        "next_experiment": {
            "name": "deterministic target-slot rendering screen",
            "hypothesis": (
                "A task-separated sentence adapter can learn output-slot structure and "
                "predicate realization without being required to regenerate arbitrary "
                "dictionary surfaces."
            ),
            "model_raw_endpoint": (
                "Exact placeholder inventory, order, multiplicity, sentence skeleton, "
                "and zero unresolved or extra slots."
            ),
            "rendered_endpoint": (
                "Exact governed dictionary surfaces after deterministic substitution, "
                "plus sentence-level exact and chrF2."
            ),
            "controls": [
                "untouched B0",
                "frozen D6 and T7 development results",
                "same source-bound sentence parents and split identities",
                "same optimizer and token accounting unless preregistered otherwise",
            ],
            "hard_limits": [
                "No SCSA curriculum row enters training under its current rights ledger.",
                "No output-slot score authorizes lexical lookup or unrestricted translation.",
                "No sealed or natural suite opens until development and confirmation gates pass.",
            ],
        },
        "claim_limit": (
            "The analysis consumes controlled synthetic, fixed-utterance, closed lexical, "
            "and nonlinguistic copy-mechanics evidence. It establishes no natural Wajarri "
            "translation reliability or public-release fitness."
        ),
    }

    output_dir.mkdir(parents=True)
    write_json(output_dir / "ANALYSIS.json", report)
    write_jsonl(output_dir / "TRAJECTORY.jsonl", trajectory_rows(t7_result))
    write_jsonl(output_dir / "D6-T7-COPY-TRANSITIONS.jsonl", changed_rows)
    write_jsonl(output_dir / "T7-COPY-FAILURES.jsonl", t7_copy_failures)
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
                "changed_copy_rows": len(changed_rows),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

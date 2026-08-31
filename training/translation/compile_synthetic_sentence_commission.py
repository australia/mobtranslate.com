#!/usr/bin/env python3
"""Compile failure-derived synthetic sentence commissions without generating text."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

EXPECTED_ANALYSIS_ARTIFACTS = {
    "FAILURE-DIAGNOSTICS.jsonl",
    "FAILURE-JOIN.jsonl",
    "KNOWLEDGE-FEEDBACK.json",
    "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl",
    "PREDICTION-COLLAPSE.jsonl",
    "QUALITATIVE-SAMPLE.jsonl",
    "SOURCE-RECORD-CONTRASTS.jsonl",
    "SOURCE-RECORD-PROFILES.jsonl",
    "SUMMARY.json",
}
EXPECTED_SUPPLEMENTAL_ANALYSIS_ARTIFACTS = {
    "COVERAGE-REVIEW-QUEUE.jsonl",
    "INPUT-MANIFEST.json",
    "REPORT.json",
    "ROWS.jsonl",
}
SENTENCE_GENERATION_USE = "controlled_synthetic_sentence_generation"
MODEL_TRAINING_USE = "model_training"
ELIGIBLE_STATUS = "accepted_for_controlled_sentence_generation"
ELIGIBLE_FLAG = "eligible"
ALLOWED_FLAG = "allowed"
HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"expected an object at {path}:{line_number}")
            rows.append(value)
    return rows


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        for row in rows:
            handle.write(
                json.dumps(
                    row, ensure_ascii=False, sort_keys=True, separators=(",", ":")
                )
                + "\n"
            )
        temporary = Path(handle.name)
    temporary.replace(path)


def resolve_within(root: Path, value: str | Path, label: str) -> Path:
    candidate = Path(value)
    path = (candidate if candidate.is_absolute() else root / candidate).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes program root: {value}") from error
    return path


def require_string(row: dict[str, Any], key: str, label: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} requires nonempty {key}")
    return value


def require_string_list(row: dict[str, Any], key: str, label: str) -> list[str]:
    value = row.get(key)
    if (
        not isinstance(value, list)
        or not value
        or any(not isinstance(item, str) or not item.strip() for item in value)
    ):
        raise ValueError(f"{label} requires a nonempty string list in {key}")
    if len(set(value)) != len(value):
        raise ValueError(f"{label} contains duplicate values in {key}")
    return value


def parse_checksum_manifest(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), 1
    ):
        if not line:
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2 or not HEX_SHA256.fullmatch(parts[0]) or not parts[1]:
            raise ValueError(f"invalid checksum line at {path}:{line_number}")
        digest, name = parts
        if name in result:
            raise ValueError(f"duplicate checksum path in {path}: {name}")
        if Path(name).name != name:
            raise ValueError(f"analysis checksum path must be a basename: {name}")
        result[name] = digest
    return result


def verify_analysis(
    analysis_dir: Path, census_contract: dict[str, Any]
) -> dict[str, Any]:
    checksums = parse_checksum_manifest(analysis_dir / "OUTPUT-SHA256SUMS")
    if set(checksums) != EXPECTED_ANALYSIS_ARTIFACTS:
        missing = sorted(EXPECTED_ANALYSIS_ARTIFACTS - set(checksums))
        extra = sorted(set(checksums) - EXPECTED_ANALYSIS_ARTIFACTS)
        raise ValueError(
            f"analysis checksum population mismatch; missing={missing}, extra={extra}"
        )
    for name, expected in checksums.items():
        path = analysis_dir / name
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"analysis artifact hash mismatch: {path}")

    expected_rows = sum(int(suite["rows"]) for suite in census_contract["suites"])
    summary = read_json(analysis_dir / "SUMMARY.json")
    analysis_id = require_string(summary, "analysis_id", "analysis summary")
    if not analysis_id.endswith("-qualitative-analysis-v10"):
        raise ValueError(f"unsupported qualitative analysis contract: {analysis_id}")
    if int(summary.get("rows", -1)) != expected_rows:
        raise ValueError("analysis summary does not cover the complete census")
    if int((summary.get("overall") or {}).get("rows", -1)) != expected_rows:
        raise ValueError("analysis overall summary does not cover the complete census")

    rows = read_jsonl(analysis_dir / "FAILURE-JOIN.jsonl")
    if len(rows) != expected_rows:
        raise ValueError(
            f"failure join is incomplete: expected={expected_rows}, observed={len(rows)}"
        )
    identifiers = [require_string(row, "row_id", "failure row") for row in rows]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("failure-join row IDs are not unique")
    expected_suites = {str(suite["suite_key"]) for suite in census_contract["suites"]}
    observed_suites = {str(row.get("suite_key")) for row in rows}
    if observed_suites != expected_suites:
        raise ValueError("failure join does not cover the declared suite population")
    expected_suite_counts = {
        str(suite["suite_key"]): int(suite["rows"])
        for suite in census_contract["suites"]
    }
    observed_suite_counts = Counter(str(row.get("suite_key")) for row in rows)
    if dict(observed_suite_counts) != expected_suite_counts:
        raise ValueError(
            "failure join suite counts differ from the census contract: "
            f"expected={expected_suite_counts}, observed={dict(observed_suite_counts)}"
        )
    for row in rows:
        require_string_list(row, "source_record_ids", f"failure row {row['row_id']}")
        require_string_list(row, "accepted_references", f"failure row {row['row_id']}")
        if not isinstance(row.get("accepted_exact"), bool):
            raise ValueError(
                f"failure row {row['row_id']} lacks boolean accepted_exact"
            )
        if row.get("claim_limit") is None:
            raise ValueError(f"failure row {row['row_id']} lacks its claim limit")
        require_string_list(
            row,
            "failure_diagnostic_classes",
            f"failure row {row['row_id']}",
        )
        require_string(
            row,
            "synthetic_commission_input_status",
            f"failure row {row['row_id']}",
        )
        confounders = row.get("analysis_confounder_codes")
        if (
            not isinstance(confounders, list)
            or any(not isinstance(value, str) or not value for value in confounders)
            or len(confounders) != len(set(confounders))
        ):
            raise ValueError(
                f"failure row {row['row_id']} has invalid analysis confounder codes"
            )

    feedback = read_json(analysis_dir / "KNOWLEDGE-FEEDBACK.json")
    if feedback.get("trigger") != "complete_zero_step_lexical_census":
        raise ValueError(
            "knowledge feedback is not bound to a complete zero-step census"
        )
    if feedback.get("model_output_is_linguistic_evidence") is not False:
        raise ValueError(
            "analysis incorrectly treats model output as linguistic evidence"
        )
    if feedback.get("dictionary_changed") is not False:
        raise ValueError("analysis cannot automatically change the dictionary")
    if feedback.get("grammar_changed") is not False:
        raise ValueError("analysis cannot automatically change the grammar")
    return {
        "summary": summary,
        "rows": rows,
        "feedback": feedback,
        "checksums": checksums,
        "expected_rows": expected_rows,
    }


def verify_supplemental_analysis(
    analysis_dir: Path, analysis_contract: dict[str, Any]
) -> dict[str, Any]:
    checksum_path = analysis_dir / "SHA256SUMS.analysis"
    checksums = parse_checksum_manifest(checksum_path)
    if set(checksums) != EXPECTED_SUPPLEMENTAL_ANALYSIS_ARTIFACTS:
        missing = sorted(EXPECTED_SUPPLEMENTAL_ANALYSIS_ARTIFACTS - set(checksums))
        extra = sorted(set(checksums) - EXPECTED_SUPPLEMENTAL_ANALYSIS_ARTIFACTS)
        raise ValueError(
            "supplemental analysis checksum population mismatch; "
            f"missing={missing}, extra={extra}"
        )
    for name, expected in checksums.items():
        path = analysis_dir / name
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"supplemental analysis artifact hash mismatch: {path}")

    outputs = analysis_contract.get("outputs") or {}
    expected_rows = int(outputs.get("expected_joined_rows", -1))
    if expected_rows <= 0:
        raise ValueError("supplemental analysis contract has no positive row count")
    report = read_json(analysis_dir / "REPORT.json")
    if report.get("analysis_id") != analysis_contract.get("method_id"):
        raise ValueError("supplemental analysis ID differs from its method contract")
    population = report.get("population") or {}
    frozen_inputs = analysis_contract.get("frozen_benchmark_inputs") or {}
    expected_lexical = int((frozen_inputs.get("lexical") or {}).get("rows", -1))
    expected_sentence = int(
        (frozen_inputs.get("fixed_utterance") or {}).get("rows", -1)
    )
    expected_population = {
        "rows": expected_rows,
        "lexical_rows": expected_lexical,
        "fixed_utterance_rows": expected_sentence,
    }
    for key, expected in expected_population.items():
        if int(population.get(key, -1)) != expected:
            raise ValueError(
                f"supplemental analysis population mismatch for {key}: "
                f"expected={expected}, observed={population.get(key)}"
            )
    authorization = report.get("authorization") or {}
    if (
        int(authorization.get("synthetic_coverage_cells", -1)) != 0
        or int(authorization.get("controlled_synthetic_sentence_pairs", -1)) != 0
        or int(authorization.get("training_eligible_rows", -1)) != 0
        or authorization.get("model_output_is_linguistic_evidence") is not False
    ):
        raise ValueError("supplemental analysis unexpectedly authorizes a derivative")

    rows = read_jsonl(analysis_dir / "ROWS.jsonl")
    if len(rows) != expected_rows:
        raise ValueError(
            "supplemental failure rows are incomplete: "
            f"expected={expected_rows}, observed={len(rows)}"
        )
    identifiers = [
        require_string(row, "id", "supplemental failure row") for row in rows
    ]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("supplemental failure row IDs are not unique")
    expected_suites = {
        "lexeme": str((frozen_inputs.get("lexical") or {}).get("suite_key")),
        "fixed_utterance": str(
            (frozen_inputs.get("fixed_utterance") or {}).get("suite_key")
        ),
    }
    task_counts = Counter(str(row.get("task_family")) for row in rows)
    if task_counts != Counter(
        {"lexeme": expected_lexical, "fixed_utterance": expected_sentence}
    ):
        raise ValueError(f"supplemental task-family population mismatch: {task_counts}")
    for row in rows:
        label = f"supplemental failure row {row['id']}"
        task_family = require_string(row, "task_family", label)
        if task_family not in expected_suites:
            raise ValueError(f"{label} has unsupported task family: {task_family}")
        if row.get("suite_key") != expected_suites[task_family]:
            raise ValueError(f"{label} has the wrong suite key")
        require_string(row, "source_record_id", label)
        require_string_list(row, "accepted_references_normalized", label)
        if not isinstance(row.get("accepted_exact"), bool):
            raise ValueError(f"{label} lacks boolean accepted_exact")
        if not isinstance(row.get("grapheme_cer"), (int, float)):
            raise ValueError(f"{label} lacks numeric grapheme_cer")
        for key in ("failure_labels", "review_actions"):
            values = row.get(key)
            if (
                not isinstance(values, list)
                or any(not isinstance(value, str) or not value for value in values)
                or len(values) != len(set(values))
            ):
                raise ValueError(f"{label} has invalid {key}")
        if row.get("model_output_is_linguistic_evidence") is not False:
            raise ValueError(f"{label} treats model output as linguistic evidence")
        if row.get("synthetic_coverage_cell_authorized") is not False:
            raise ValueError(f"{label} authorizes a synthetic coverage cell")
        if row.get("training_eligible") is not False:
            raise ValueError(f"{label} is unexpectedly training eligible")

    queue = read_jsonl(analysis_dir / "COVERAGE-REVIEW-QUEUE.jsonl")
    failed_ids = {str(row["id"]) for row in rows if not row["accepted_exact"]}
    queue_ids = [
        require_string(row, "benchmark_row_id", "supplemental review queue row")
        for row in queue
    ]
    if len(set(queue_ids)) != len(queue_ids) or set(queue_ids) != failed_ids:
        raise ValueError("supplemental review queue does not exactly cover failures")
    for row in queue:
        if row.get("synthetic_coverage_cell_status") != "blocked_review_question_only":
            raise ValueError("supplemental review queue opens a coverage cell")
        if row.get("model_output_is_linguistic_evidence") is not False:
            raise ValueError(
                "supplemental review queue treats model output as evidence"
            )

    input_manifest = read_json(analysis_dir / "INPUT-MANIFEST.json")
    inputs = input_manifest.get("inputs") or {}
    for family, benchmark_key, prediction_key in (
        ("lexical", "lexical_benchmark", "lexical_predictions"),
        ("fixed_utterance", "sentence_benchmark", "sentence_predictions"),
    ):
        frozen = frozen_inputs.get(family) or {}
        benchmark = inputs.get(benchmark_key) or {}
        predictions = inputs.get(prediction_key) or {}
        if benchmark.get("sha256") != frozen.get("sha256"):
            raise ValueError(f"supplemental {family} benchmark hash drift")
        if int(benchmark.get("rows", -1)) != int(frozen.get("rows", -1)):
            raise ValueError(f"supplemental {family} benchmark row drift")
        if not HEX_SHA256.fullmatch(str(predictions.get("sha256") or "")) or int(
            predictions.get("rows", -1)
        ) != int(frozen.get("rows", -1)):
            raise ValueError(f"supplemental {family} prediction binding is invalid")

    return {
        "report": report,
        "rows": rows,
        "queue": queue,
        "input_manifest": input_manifest,
        "checksums": checksums,
        "expected_rows": expected_rows,
        "checksum_path": checksum_path,
    }


def verify_current_edition(
    program_root: Path, pointer_path: Path, artifact: str
) -> dict[str, Any]:
    pointer = read_json(pointer_path)
    if pointer.get("artifact") != artifact:
        raise ValueError(f"expected a {artifact} pointer: {pointer_path}")
    manifest_path = resolve_within(
        program_root, pointer.get("manifest_path", ""), f"{artifact} manifest"
    )
    if sha256(manifest_path) != pointer.get("manifest_sha256"):
        raise ValueError(f"{artifact} current-manifest hash mismatch")
    manifest = read_json(manifest_path)
    if manifest.get("edition_id") != pointer.get("current_edition_id"):
        raise ValueError(f"{artifact} current-edition ID mismatch")
    lineage: list[dict[str, Any]] = []
    lineage_path = manifest_path
    lineage_manifest = manifest
    visited: set[Path] = set()
    while True:
        if lineage_path in visited:
            raise ValueError(f"{artifact} edition lineage contains a cycle")
        visited.add(lineage_path)
        lineage.append(
            {
                "manifest_path": lineage_path,
                "manifest_sha256": sha256(lineage_path),
                "manifest": lineage_manifest,
            }
        )
        parent = lineage_manifest.get("parent_manifest")
        if parent is None:
            break
        if (
            not isinstance(parent, dict)
            or not isinstance(parent.get("path"), str)
            or not HEX_SHA256.fullmatch(str(parent.get("sha256") or ""))
        ):
            raise ValueError(f"{artifact} edition has an invalid parent declaration")
        parent_path = resolve_within(
            program_root, parent["path"], f"{artifact} parent manifest"
        )
        if sha256(parent_path) != parent["sha256"]:
            raise ValueError(f"{artifact} parent-manifest hash mismatch")
        inheritance = lineage_manifest.get("component_inheritance") or {}
        inherited_parent_hash = inheritance.get("parent_manifest_sha256")
        if (
            inherited_parent_hash is not None
            and inherited_parent_hash != parent["sha256"]
        ):
            raise ValueError(f"{artifact} component-inheritance parent hash mismatch")
        lineage_path = parent_path
        lineage_manifest = read_json(parent_path)
    components: dict[str, dict[str, Any]] = {}
    for key, component in sorted((manifest.get("components") or {}).items()):
        if not isinstance(component, dict):
            raise ValueError(f"invalid {artifact} component declaration: {key}")
        path = resolve_within(
            program_root, component.get("path", ""), f"{artifact} component {key}"
        )
        if sha256(path) != component.get("sha256"):
            raise ValueError(f"{artifact} component hash mismatch: {key}")
        rows = read_jsonl(path)
        if component.get("rows") is not None and len(rows) != int(component["rows"]):
            raise ValueError(f"{artifact} component row mismatch: {key}")
        components[key] = {"path": path, "rows": rows, "binding": component}
    return {
        "pointer_path": pointer_path,
        "pointer_sha256": sha256(pointer_path),
        "pointer": pointer,
        "manifest_path": manifest_path,
        "manifest_sha256": sha256(manifest_path),
        "manifest": manifest,
        "lineage": lineage,
        "components": components,
    }


def verify_reviewed_living_book_children(
    *,
    analysis_dir: Path,
    analysis: dict[str, Any],
    census_contract_path: Path,
    dictionary: dict[str, Any],
    grammar: dict[str, Any],
) -> dict[str, Any]:
    summary = analysis["summary"]
    feedback = analysis["feedback"]
    if summary.get("contract_sha256") != sha256(census_contract_path):
        raise ValueError("analysis is not bound to the supplied census contract")
    baseline = summary.get("review_knowledge_baseline") or {}
    feedback_checkpoint = feedback.get("required_living_book_checkpoint") or {}
    result: dict[str, Any] = {}
    for artifact, edition in (("dictionary", dictionary), ("grammar", grammar)):
        baseline_record = baseline.get(artifact) or {}
        baseline_id = baseline_record.get("edition_id")
        baseline_hash = baseline_record.get("manifest_sha256")
        if not isinstance(baseline_id, str) or not HEX_SHA256.fullmatch(
            str(baseline_hash or "")
        ):
            raise ValueError(f"analysis lacks a valid {artifact} review baseline")
        feedback_id = feedback.get(f"review_{artifact}_edition")
        feedback_hash = feedback.get(f"review_{artifact}_manifest_sha256")
        if feedback_id != baseline_id or feedback_hash != baseline_hash:
            raise ValueError(
                f"{artifact} feedback baseline differs from analysis summary"
            )
        if feedback_checkpoint.get(f"{artifact}_parent_edition") != baseline_id:
            raise ValueError(f"{artifact} living-book checkpoint has the wrong parent")

        baseline_lineage_entry = next(
            (
                entry
                for entry in edition["lineage"]
                if entry["manifest_sha256"] == baseline_hash
                and entry["manifest"].get("edition_id") == baseline_id
            ),
            None,
        )
        if baseline_lineage_entry is None:
            raise ValueError(
                f"current {artifact} edition does not descend from the analysis baseline"
            )
        if edition["manifest_sha256"] == baseline_hash:
            raise ValueError(f"current {artifact} edition is not a reviewed child")

        matching_checkpoint = None
        for entry in edition["lineage"]:
            if entry["manifest_sha256"] == baseline_hash:
                break
            checkpoint = entry["manifest"].get("qualitative_failure_review_checkpoint")
            if not isinstance(checkpoint, dict):
                continue
            if checkpoint.get("analysis_id") == summary["analysis_id"]:
                matching_checkpoint = (entry, checkpoint)
                break
        if matching_checkpoint is None:
            raise ValueError(
                f"current {artifact} lineage lacks an analysis-bound review checkpoint"
            )
        checkpoint_entry, checkpoint = matching_checkpoint
        expected_checkpoint_values = {
            "analysis_summary_sha256": sha256(analysis_dir / "SUMMARY.json"),
            "analysis_output_checksums_sha256": sha256(
                analysis_dir / "OUTPUT-SHA256SUMS"
            ),
        }
        for key, expected in expected_checkpoint_values.items():
            if checkpoint.get(key) != expected:
                raise ValueError(f"{artifact} review checkpoint has a wrong {key}")
        if checkpoint.get("review_outcome") not in {
            "reviewed_no_change_child_edition",
            "evidence_supported_change_child_edition",
        }:
            raise ValueError(f"{artifact} review checkpoint has no accepted outcome")
        if checkpoint.get("model_output_is_linguistic_evidence") is not False:
            raise ValueError(
                f"{artifact} review checkpoint accepts model output as evidence"
            )
        if checkpoint.get("synthetic_output_is_linguistic_evidence") is not False:
            raise ValueError(
                f"{artifact} review checkpoint accepts synthetic output as evidence"
            )
        result[artifact] = {
            "baseline_edition_id": baseline_id,
            "baseline_manifest_sha256": baseline_hash,
            "review_checkpoint_edition_id": checkpoint_entry["manifest"].get(
                "edition_id"
            ),
            "review_checkpoint_manifest_sha256": checkpoint_entry["manifest_sha256"],
            "review_outcome": checkpoint["review_outcome"],
            "current_edition_id": edition["manifest"].get("edition_id"),
            "current_manifest_sha256": edition["manifest_sha256"],
        }
    return result


def supplemental_living_book_baselines(
    program_root: Path, analysis_contract: dict[str, Any]
) -> dict[str, list[dict[str, str]]]:
    baselines: dict[str, list[dict[str, str]]] = {
        "dictionary": [],
        "grammar": [],
    }
    frozen_inputs = analysis_contract.get("frozen_benchmark_inputs") or {}
    for family in ("lexical", "fixed_utterance"):
        frozen = frozen_inputs.get(family) or {}
        manifest_path = resolve_within(
            program_root,
            frozen.get("manifest_path", ""),
            f"supplemental {family} benchmark manifest",
        )
        if sha256(manifest_path) != frozen.get("manifest_sha256"):
            raise ValueError(f"supplemental {family} benchmark manifest hash drift")
        manifest = read_json(manifest_path)
        if manifest.get("suite_key") != frozen.get("suite_key") and (
            manifest.get("suite") or {}
        ).get("suite_key") != frozen.get("suite_key"):
            raise ValueError(f"supplemental {family} benchmark suite drift")
        inputs = manifest.get("inputs") or {}
        for artifact in ("dictionary", "grammar"):
            binding = inputs.get(f"{artifact}_edition")
            if binding is None:
                continue
            baseline_path = resolve_within(
                program_root,
                binding.get("path", ""),
                f"supplemental {family} {artifact} baseline",
            )
            if sha256(baseline_path) != binding.get("sha256"):
                raise ValueError(
                    f"supplemental {family} {artifact} baseline hash drift"
                )
            baseline_manifest = read_json(baseline_path)
            edition_id = require_string(
                baseline_manifest,
                "edition_id",
                f"supplemental {family} {artifact} baseline",
            )
            record = {
                "edition_id": edition_id,
                "manifest_path": str(baseline_path.relative_to(program_root)),
                "manifest_sha256": sha256(baseline_path),
                "benchmark_family": family,
            }
            if record not in baselines[artifact]:
                baselines[artifact].append(record)
    if not baselines["dictionary"] or not baselines["grammar"]:
        raise ValueError("supplemental analyses lack living-book baselines")
    for artifact in baselines:
        baselines[artifact].sort(
            key=lambda row: (
                row["edition_id"],
                row["manifest_sha256"],
                row["benchmark_family"],
            )
        )
    return baselines


def verify_supplemental_living_book_reviews(
    *,
    analysis_dir: Path,
    analysis: dict[str, Any],
    baselines: dict[str, list[dict[str, str]]],
    dictionary: dict[str, Any],
    grammar: dict[str, Any],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    expected_checkpoint = {
        "analysis_id": analysis["report"]["analysis_id"],
        "analysis_report_sha256": sha256(analysis_dir / "REPORT.json"),
        "analysis_output_checksums_sha256": sha256(
            analysis_dir / "SHA256SUMS.analysis"
        ),
        "lexical_rows": int(analysis["report"]["population"]["lexical_rows"]),
        "fixed_utterance_rows": int(
            analysis["report"]["population"]["fixed_utterance_rows"]
        ),
    }
    for artifact, edition in (("dictionary", dictionary), ("grammar", grammar)):
        lineage_positions = {
            (entry["manifest"].get("edition_id"), entry["manifest_sha256"]): index
            for index, entry in enumerate(edition["lineage"])
        }
        positions: list[int] = []
        for baseline in baselines[artifact]:
            position = lineage_positions.get(
                (baseline["edition_id"], baseline["manifest_sha256"])
            )
            if position is None:
                raise ValueError(
                    f"current {artifact} edition does not descend from supplemental "
                    f"baseline {baseline['edition_id']}"
                )
            positions.append(position)
        newest_baseline_position = min(positions)
        if newest_baseline_position == 0:
            raise ValueError(
                f"current {artifact} edition is not a reviewed child of the "
                "supplemental analysis baseline"
            )
        matching_checkpoint = None
        for entry in edition["lineage"][:newest_baseline_position]:
            checkpoint = entry["manifest"].get(
                "supplemental_50words_failure_review_checkpoint"
            )
            if not isinstance(checkpoint, dict):
                continue
            if checkpoint.get("analysis_id") == expected_checkpoint["analysis_id"]:
                matching_checkpoint = (entry, checkpoint)
                break
        if matching_checkpoint is None:
            raise ValueError(
                f"current {artifact} lineage lacks a supplemental 50 Words "
                "failure-review checkpoint"
            )
        checkpoint_entry, checkpoint = matching_checkpoint
        for key, expected in expected_checkpoint.items():
            if checkpoint.get(key) != expected:
                raise ValueError(
                    f"{artifact} supplemental review checkpoint has a wrong {key}"
                )
        if checkpoint.get("review_outcome") not in {
            "reviewed_no_change_child_edition",
            "evidence_supported_change_child_edition",
        }:
            raise ValueError(
                f"{artifact} supplemental review checkpoint has no accepted outcome"
            )
        if checkpoint.get("model_output_is_linguistic_evidence") is not False:
            raise ValueError(
                f"{artifact} supplemental checkpoint accepts model output as evidence"
            )
        if checkpoint.get("synthetic_output_is_linguistic_evidence") is not False:
            raise ValueError(
                f"{artifact} supplemental checkpoint accepts synthetic output as evidence"
            )
        result[artifact] = {
            "baseline_editions": baselines[artifact],
            "review_checkpoint_edition_id": checkpoint_entry["manifest"].get(
                "edition_id"
            ),
            "review_checkpoint_manifest_sha256": checkpoint_entry["manifest_sha256"],
            "review_outcome": checkpoint["review_outcome"],
            "current_edition_id": edition["manifest"].get("edition_id"),
            "current_manifest_sha256": edition["manifest_sha256"],
        }
    return result


def id_index(
    rows: list[dict[str, Any]], keys: tuple[str, ...], label: str
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        identifier = next(
            (
                row.get(key)
                for key in keys
                if isinstance(row.get(key), str) and row.get(key)
            ),
            None,
        )
        if identifier is None:
            continue
        if identifier in result:
            raise ValueError(f"duplicate {label} ID: {identifier}")
        result[identifier] = row
    return result


def component_rows(edition: dict[str, Any], key: str) -> list[dict[str, Any]]:
    component = edition["components"].get(key)
    return list(component["rows"]) if component else []


def accepted_synthetic_lexemes(
    dictionary: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    component = dictionary["components"].get("syntheticLexemes")
    if component is None:
        return [], ["dictionary_missing_synthetic_lexeme_component"]

    entries = id_index(
        component_rows(dictionary, "entries"),
        ("entry_candidate_id", "entryCandidateId"),
        "dictionary entry",
    )
    senses = id_index(
        component_rows(dictionary, "senses"),
        ("sense_candidate_id", "senseCandidateId"),
        "dictionary sense",
    )
    forms = id_index(
        component_rows(dictionary, "forms"),
        ("form_candidate_id", "formCandidateId"),
        "dictionary form",
    )
    eligible: list[dict[str, Any]] = []
    for row in component["rows"]:
        label = f"synthetic lexeme {row.get('synthetic_lexeme_id', '(missing)')}"
        if row.get("acceptance_status") != ELIGIBLE_STATUS:
            continue
        if row.get("synthetic_eligibility") != ELIGIBLE_FLAG:
            raise ValueError(f"{label} has inconsistent synthetic eligibility")
        if row.get("model_output_is_linguistic_evidence") is not False:
            raise ValueError(f"{label} is model-derived linguistic evidence")
        if row.get("synthetic_output_is_linguistic_evidence") is not False:
            raise ValueError(f"{label} is synthetic-derived linguistic evidence")
        allowed_use = set(require_string_list(row, "allowed_use", label))
        if not {SENTENCE_GENERATION_USE, MODEL_TRAINING_USE} <= allowed_use:
            raise ValueError(f"{label} does not allow sentence generation and training")
        for key in (
            "synthetic_lexeme_id",
            "sense_candidate_id",
            "entry_candidate_id",
            "form_candidate_id",
            "english_lemma",
            "target_lemma",
            "part_of_speech",
            "morphology_class_id",
            "variety",
            "orthography",
            "parent_split",
            "derivative_split",
            "rights_status",
        ):
            require_string(row, key, label)
        for key in (
            "source_record_ids",
            "slot_classes",
            "parent_evidence_ids",
            "source_cluster_ids",
        ):
            require_string_list(row, key, label)
        if row["parent_split"] != row["derivative_split"]:
            raise ValueError(f"{label} violates split inheritance")
        entry = entries.get(row["entry_candidate_id"])
        sense = senses.get(row["sense_candidate_id"])
        form = forms.get(row["form_candidate_id"])
        if not entry or entry.get("status") != "accepted":
            raise ValueError(f"{label} has no accepted parent entry")
        if not sense or sense.get("status") != "accepted":
            raise ValueError(f"{label} has no accepted parent sense")
        if not form or form.get("status") != "accepted":
            raise ValueError(f"{label} has no accepted parent form")
        eligible.append(row)
    return sorted(eligible, key=lambda row: row["synthetic_lexeme_id"]), []


def grammar_claim_index(grammar: dict[str, Any]) -> dict[str, dict[str, Any]]:
    claims: list[dict[str, Any]] = []
    claims.extend(component_rows(grammar, "assertions"))
    claims.extend(component_rows(grammar, "syntheses"))
    return id_index(
        claims,
        ("grammar_claim_id", "assertionId", "synthesisId"),
        "grammar claim",
    )


def accepted_synthetic_templates(
    grammar: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    component = grammar["components"].get("syntheticTemplates")
    if component is None:
        return [], ["grammar_missing_productive_synthetic_template_component"]
    claims = grammar_claim_index(grammar)
    eligible: list[dict[str, Any]] = []
    for row in component["rows"]:
        label = f"synthetic template {row.get('template_id', '(missing)')}"
        if row.get("acceptance_status") != ELIGIBLE_STATUS:
            continue
        if row.get("synthetic_eligibility") != ELIGIBLE_FLAG:
            raise ValueError(f"{label} has inconsistent synthetic eligibility")
        if row.get("model_output_is_linguistic_evidence") is not False:
            raise ValueError(f"{label} is model-derived linguistic evidence")
        if row.get("synthetic_output_is_linguistic_evidence") is not False:
            raise ValueError(f"{label} is synthetic-derived linguistic evidence")
        allowed_use = set(require_string_list(row, "allowed_use", label))
        if not {SENTENCE_GENERATION_USE, MODEL_TRAINING_USE} <= allowed_use:
            raise ValueError(f"{label} does not allow sentence generation and training")
        for key in (
            "template_id",
            "task_id",
            "construction_family",
            "predicate_and_valency_frame",
            "participant_configuration",
            "polarity_tam_and_mood",
            "sentence_length_and_clause_depth",
            "required_evidence_class",
            "acceptance_test",
            "rights_status",
        ):
            require_string(row, key, label)
        for key in (
            "compatible_lexeme_slot_classes",
            "grammar_claim_ids",
            "parent_evidence_ids",
            "source_cluster_ids",
        ):
            require_string_list(row, key, label)
        if not isinstance(row.get("grammatical_features"), dict):
            raise ValueError(f"{label} requires grammatical_features object")
        if not isinstance(row.get("variety_and_register"), dict):
            raise ValueError(f"{label} requires variety_and_register object")
        if not isinstance(row.get("source_text_and_speaker_diversity"), dict):
            raise ValueError(
                f"{label} requires source_text_and_speaker_diversity object"
            )
        count = row.get("target_independent_instances_per_lexeme")
        if not isinstance(count, int) or isinstance(count, bool) or count <= 0:
            raise ValueError(f"{label} requires a positive instance count")
        for claim_id in row["grammar_claim_ids"]:
            claim = claims.get(claim_id)
            if claim is None:
                raise ValueError(f"{label} references unknown grammar claim {claim_id}")
            if claim.get("syntheticEligibility") != ALLOWED_FLAG:
                raise ValueError(f"{label} parent claim is not synthetic-eligible")
            if claim.get("trainingEligibility") != ALLOWED_FLAG:
                raise ValueError(f"{label} parent claim is not training-eligible")
            if claim.get("modelOutputIsLinguisticEvidence") is not False:
                raise ValueError(f"{label} parent claim is model-derived")
        eligible.append(row)
    return sorted(eligible, key=lambda row: row["template_id"]), []


def suite_reuse_statuses(
    program_root: Path, census_contract: dict[str, Any]
) -> dict[str, str]:
    statuses: dict[str, str] = {}
    for suite in census_contract["suites"]:
        manifest_path = resolve_within(
            program_root,
            suite["manifest_path"],
            f"suite manifest {suite['suite_key']}",
        )
        if sha256(manifest_path) != suite["manifest_sha256"]:
            raise ValueError(f"suite manifest hash mismatch: {manifest_path}")
        policy = read_json(manifest_path).get("policy") or {}
        if policy.get("model_output_is_linguistic_evidence") is not False:
            raise ValueError(
                "benchmark suite treats model output as linguistic evidence"
            )
        statuses[suite["suite_key"]] = (
            "final_test_analysis_only"
            if policy.get("sealed")
            else "development_consumed"
        )
    return statuses


def build_failure_requirements(
    rows: list[dict[str, Any]],
    reuse_by_suite: dict[str, str],
    *,
    analysis_population: str = "full_lexical_census",
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str, str], list[dict[str, Any]]] = defaultdict(
        list
    )
    for row in rows:
        if row["accepted_exact"]:
            continue
        reuse_status = reuse_by_suite[str(row["suite_key"])]
        commission_status = str(row["synthetic_commission_input_status"])
        task_family = str(row.get("task_family") or "lexical_census")
        for source_id in row["source_record_ids"]:
            grouped[
                (
                    analysis_population,
                    task_family,
                    source_id,
                    reuse_status,
                    commission_status,
                )
            ].append(row)
    requirements: list[dict[str, Any]] = []
    for (
        population,
        task_family,
        source_id,
        benchmark_reuse_status,
        commission_input_status,
    ), failures in sorted(grouped.items()):
        suite_keys = sorted({str(row["suite_key"]) for row in failures})
        identity = {
            "analysis_population": population,
            "task_family": task_family,
            "source_record_id": source_id,
            "benchmark_reuse_status": benchmark_reuse_status,
            "synthetic_commission_input_status": commission_input_status,
            "analysis_row_ids": sorted(str(row["row_id"]) for row in failures),
        }
        requirements.append(
            {
                "failure_requirement_id": (
                    f"synthetic-failure-requirement:{canonical_sha256(identity)[:20]}"
                ),
                "analysis_population": population,
                "task_family": task_family,
                "source_record_id": source_id,
                "analysis_row_ids": identity["analysis_row_ids"],
                "failed_benchmark_strata": {
                    "suite_keys": suite_keys,
                    "tasks": sorted(
                        {str(row.get("task") or "(missing)") for row in failures}
                    ),
                    "source_prompts": sorted(
                        {str(row.get("source_prompt") or "") for row in failures}
                    ),
                    "accepted_references": sorted(
                        {
                            str(reference)
                            for row in failures
                            for reference in row["accepted_references"]
                        }
                    ),
                    "edit_error_types": sorted(
                        {
                            str(row.get("edit_error_type") or "(missing)")
                            for row in failures
                        }
                    ),
                    "ambiguity_statuses": sorted(
                        {
                            str(row.get("ambiguity_status") or "(missing)")
                            for row in failures
                        }
                    ),
                    "target_subword_counts": sorted(
                        {int(row.get("target_subword_count") or 0) for row in failures}
                    ),
                    "orthographic_surface_cluster_ids": sorted(
                        {
                            str(cluster_id)
                            for row in failures
                            for cluster_id in row.get(
                                "reference_orthographic_suffix_cluster_ids", []
                            )
                        }
                    ),
                    "orthographic_surface_cluster_labels": sorted(
                        {
                            str(label)
                            for row in failures
                            for label in row.get(
                                "reference_orthographic_suffix_cluster_labels", []
                            )
                        }
                    ),
                    "source_structural_strata": sorted(
                        {
                            str(value)
                            for row in failures
                            for value in row.get("source_structural_strata", [])
                        }
                    ),
                    "source_blocker_codes": sorted(
                        {
                            str(value)
                            for row in failures
                            for value in row.get("source_blocker_codes", [])
                        }
                    ),
                    "failure_diagnostic_classes": sorted(
                        {
                            str(value)
                            for row in failures
                            for value in row.get("failure_diagnostic_classes", [])
                        }
                    ),
                    "failure_review_priority_classes": sorted(
                        {
                            str(row.get("failure_review_priority_class") or "(missing)")
                            for row in failures
                        }
                    ),
                    "nearest_accepted_references": sorted(
                        {
                            str(row.get("nearest_accepted_reference") or "")
                            for row in failures
                            if row.get("nearest_accepted_reference")
                        }
                    ),
                    "prediction_population_counts": sorted(
                        {
                            int(row.get("prediction_population_count") or 0)
                            for row in failures
                        }
                    ),
                    "prediction_unique_source_record_counts": sorted(
                        {
                            int(row.get("prediction_unique_source_record_count") or 0)
                            for row in failures
                        }
                    ),
                    "prediction_target_inventory_owner_source_record_ids": sorted(
                        {
                            str(value)
                            for row in failures
                            for value in row.get(
                                "prediction_target_inventory_owner_source_record_ids",
                                [],
                            )
                        }
                    ),
                },
                "failure_count": len(failures),
                "mean_grapheme_cer": sum(float(row["grapheme_cer"]) for row in failures)
                / len(failures),
                "evaluation_input_contains_reference_surface": any(
                    bool(row.get("evaluation_input_contains_reference_surface"))
                    for row in failures
                ),
                "analysis_confounder_codes": sorted(
                    {
                        str(value)
                        for row in failures
                        for value in row.get("analysis_confounder_codes", [])
                    }
                ),
                "synthetic_commission_input_status": commission_input_status,
                "benchmark_reuse_status": benchmark_reuse_status,
                "model_output_is_linguistic_evidence": False,
                "synthetic_output_is_linguistic_evidence": False,
                "claim_limit": (
                    "This measured failure can prioritize a sentence-context commission. "
                    "It cannot establish a lexical mapping, grammatical rule, or target form."
                ),
            }
        )
    return requirements


def normalize_supplemental_failure_rows(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    prediction_counts = Counter(
        str(row.get("prediction_normalized") or "") for row in rows
    )
    prediction_sources: dict[str, set[str]] = defaultdict(set)
    target_owners: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        prediction_sources[str(row.get("prediction_normalized") or "")].add(
            str(row["source_record_id"])
        )
        for reference in row["accepted_references_normalized"]:
            target_owners[str(reference)].add(str(row["source_record_id"]))

    normalized: list[dict[str, Any]] = []
    for row in rows:
        task_family = str(row["task_family"])
        fixed_utterance = task_family == "fixed_utterance"
        prediction = str(row.get("prediction_normalized") or "")
        target_subwords = row.get("target_subword_count")
        if not isinstance(target_subwords, int) or target_subwords < 1:
            target_subwords = 0
        failure_labels = [str(value) for value in row.get("failure_labels", [])]
        if not failure_labels and not row["accepted_exact"]:
            failure_labels = [str(row.get("edit_error_type") or "surface_mismatch")]
        confounders = (
            ["attested_fixed_utterance_requires_productive_analysis"]
            if fixed_utterance and not row["accepted_exact"]
            else []
        )
        normalized.append(
            {
                "row_id": str(row["id"]),
                "suite_key": str(row["suite_key"]),
                "task": (
                    "S0_attested_fixed_utterance_reconstruction"
                    if fixed_utterance
                    else "L1_direct_lexical_reconstruction"
                ),
                "task_family": task_family,
                "source_record_ids": [str(row["source_record_id"])],
                "source_prompt": str(row.get("source_prompt") or ""),
                "accepted_references": list(row["accepted_references_normalized"]),
                "accepted_exact": bool(row["accepted_exact"]),
                "grapheme_cer": float(row["grapheme_cer"]),
                "target_subword_count": target_subwords,
                "edit_error_type": str(row.get("edit_error_type") or "(missing)"),
                "ambiguity_status": str(
                    row.get("current_dictionary_relation")
                    or (
                        "fixed_utterance_not_lexical"
                        if fixed_utterance
                        else "(missing)"
                    )
                ),
                "reference_orthographic_suffix_cluster_ids": [],
                "reference_orthographic_suffix_cluster_labels": [],
                "source_structural_strata": [f"supplemental_task:{task_family}"],
                "source_blocker_codes": sorted(
                    set(str(value) for value in row.get("review_actions", []))
                ),
                "evaluation_input_contains_reference_surface": False,
                "nearest_accepted_reference": str(
                    row.get("selected_closest_reference") or ""
                ),
                "prediction_population_count": prediction_counts[prediction],
                "prediction_unique_source_record_count": len(
                    prediction_sources[prediction]
                ),
                "prediction_target_inventory_owner_source_record_ids": sorted(
                    target_owners.get(prediction, set())
                    - {str(row["source_record_id"])}
                ),
                "failure_diagnostic_classes": sorted(set(failure_labels)),
                "failure_review_priority_class": (
                    "attested_fixed_utterance_reconstruction_review_only"
                    if fixed_utterance
                    else "supplemental_direct_lexical_reconstruction_failure"
                ),
                "analysis_confounder_codes": confounders,
                "synthetic_commission_input_status": (
                    "analysis_only_nonproductive_fixed_utterance"
                    if fixed_utterance and not row["accepted_exact"]
                    else (
                        "no_commission_exact_success"
                        if row["accepted_exact"]
                        else "eligible_for_evidence_gated_priority_review"
                    )
                ),
                "model_output_is_linguistic_evidence": False,
                "synthetic_output_is_linguistic_evidence": False,
                "claim_limit": (
                    "This supplemental reconstruction result can prioritize review only. "
                    "It cannot establish a lexical mapping, productive construction, "
                    "target form, or sentence capability."
                ),
            }
        )
    return normalized


def build_supplemental_failure_requirements(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    normalized = normalize_supplemental_failure_rows(rows)
    reuse = {
        str(row["suite_key"]): "training_cluster_pretraining_baseline_consumed"
        for row in normalized
    }
    return build_failure_requirements(
        normalized,
        reuse,
        analysis_population="50words_pretraining_supplement",
    )


def build_commission(
    failure_requirements: list[dict[str, Any]],
    lexemes: list[dict[str, Any]],
    templates: list[dict[str, Any]],
    global_blockers: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    lexemes_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for lexeme in lexemes:
        for source_id in lexeme["source_record_ids"]:
            lexemes_by_source[source_id].append(lexeme)

    cells: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []
    for requirement in failure_requirements:
        reasons = list(global_blockers)
        matching_lexemes = sorted(
            lexemes_by_source.get(requirement["source_record_id"], []),
            key=lambda row: row["synthetic_lexeme_id"],
        )
        if not matching_lexemes:
            reasons.append("no_accepted_slot_qualified_synthetic_lexeme")
        if requirement["benchmark_reuse_status"] == "final_test_analysis_only":
            reasons.append("final_test_failure_cannot_authorize_training_derivative")
        if (
            requirement["synthetic_commission_input_status"]
            != "eligible_for_evidence_gated_priority_review"
        ):
            reasons.append("analysis_status_cannot_authorize_training_derivative")
            reasons.append("analysis_confounder_cannot_authorize_training_derivative")
            reasons.extend(
                f"analysis_confounder:{value}"
                for value in requirement["analysis_confounder_codes"]
            )

        compatible_pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
        for lexeme in matching_lexemes:
            lexeme_slots = set(lexeme["slot_classes"])
            compatible = [
                template
                for template in templates
                if lexeme_slots & set(template["compatible_lexeme_slot_classes"])
            ]
            if not compatible:
                reasons.append(
                    "no_compatible_productive_template_for_lexeme:"
                    + lexeme["synthetic_lexeme_id"]
                )
            compatible_pairs.extend((lexeme, template) for template in compatible)

        if reasons:
            blocked.append(
                {
                    "failure_requirement_id": requirement["failure_requirement_id"],
                    "analysis_population": requirement["analysis_population"],
                    "task_family": requirement["task_family"],
                    "source_record_id": requirement["source_record_id"],
                    "blocker_codes": sorted(set(reasons)),
                    "candidate_lexeme_ids": [
                        row["synthetic_lexeme_id"] for row in matching_lexemes
                    ],
                    "candidate_template_ids": sorted(
                        {template["template_id"] for _, template in compatible_pairs}
                    ),
                    "generation_authorized": False,
                }
            )
            continue

        for lexeme, template in compatible_pairs:
            identity = {
                "failure_requirement_id": requirement["failure_requirement_id"],
                "synthetic_lexeme_id": lexeme["synthetic_lexeme_id"],
                "template_id": template["template_id"],
                "dictionary_record_ids": [
                    lexeme["entry_candidate_id"],
                    lexeme["sense_candidate_id"],
                    lexeme["form_candidate_id"],
                ],
                "grammar_claim_ids": template["grammar_claim_ids"],
            }
            cells.append(
                {
                    "coverage_cell_id": f"synthetic-coverage-cell:{canonical_sha256(identity)[:20]}",
                    "failure_requirement_id": requirement["failure_requirement_id"],
                    "analysis_population": requirement["analysis_population"],
                    "task_family": requirement["task_family"],
                    "synthetic_lexeme_id": lexeme["synthetic_lexeme_id"],
                    "template_id": template["template_id"],
                    "failed_benchmark_strata": requirement["failed_benchmark_strata"],
                    "failure_diagnostic_profile": {
                        "failure_diagnostic_classes": requirement[
                            "failed_benchmark_strata"
                        ]["failure_diagnostic_classes"],
                        "failure_review_priority_classes": requirement[
                            "failed_benchmark_strata"
                        ]["failure_review_priority_classes"],
                        "nearest_accepted_references": requirement[
                            "failed_benchmark_strata"
                        ]["nearest_accepted_references"],
                        "prediction_population_counts": requirement[
                            "failed_benchmark_strata"
                        ]["prediction_population_counts"],
                        "prediction_unique_source_record_counts": requirement[
                            "failed_benchmark_strata"
                        ]["prediction_unique_source_record_counts"],
                        "claim_limit": (
                            "Diagnostic associations prioritize coverage only and do not "
                            "establish a causal failure mechanism or linguistic rule."
                        ),
                    },
                    "task_id": template["task_id"],
                    "construction_family": template["construction_family"],
                    "grammatical_features": template["grammatical_features"],
                    "lexeme_and_sense_family": {
                        "synthetic_lexeme_id": lexeme["synthetic_lexeme_id"],
                        "english_lemma": lexeme["english_lemma"],
                        "target_lemma": lexeme["target_lemma"],
                        "part_of_speech": lexeme["part_of_speech"],
                        "morphology_class_id": lexeme["morphology_class_id"],
                        "slot_classes": lexeme["slot_classes"],
                    },
                    "predicate_and_valency_frame": template[
                        "predicate_and_valency_frame"
                    ],
                    "participant_configuration": template["participant_configuration"],
                    "polarity_tam_and_mood": template["polarity_tam_and_mood"],
                    "sentence_length_and_clause_depth": template[
                        "sentence_length_and_clause_depth"
                    ],
                    "variety_and_register": template["variety_and_register"],
                    "parent_evidence_ids": sorted(
                        set(lexeme["parent_evidence_ids"])
                        | set(template["parent_evidence_ids"])
                    ),
                    "dictionary_record_ids": identity["dictionary_record_ids"],
                    "grammar_claim_ids": template["grammar_claim_ids"],
                    "required_evidence_class": template["required_evidence_class"],
                    "target_independent_instances": template[
                        "target_independent_instances_per_lexeme"
                    ],
                    "source_text_and_speaker_diversity": template[
                        "source_text_and_speaker_diversity"
                    ],
                    "acceptance_test": template["acceptance_test"],
                    "why_existing_rows_are_insufficient": {
                        "failure_requirement_id": requirement["failure_requirement_id"],
                        "analysis_row_ids": requirement["analysis_row_ids"],
                        "failure_count": requirement["failure_count"],
                        "mean_grapheme_cer": requirement["mean_grapheme_cer"],
                    },
                    "parent_split": lexeme["parent_split"],
                    "derivative_split": lexeme["derivative_split"],
                    "benchmark_reuse_status": requirement["benchmark_reuse_status"],
                }
            )
    cells.sort(key=lambda row: row["coverage_cell_id"])
    blocked.sort(key=lambda row: row["failure_requirement_id"])
    cell_ids = [row["coverage_cell_id"] for row in cells]
    if len(set(cell_ids)) != len(cell_ids):
        raise ValueError("coverage cell IDs are not unique")
    return cells, blocked


def validate_coverage_contract(
    synthetic_contract: dict[str, Any], cells: list[dict[str, Any]]
) -> None:
    required = set(synthetic_contract["coverage_cell_contract"]["required_fields"])
    for row in cells:
        missing = sorted(required - set(row))
        if missing:
            raise ValueError(
                f"coverage cell {row.get('coverage_cell_id')} misses fields: {missing}"
            )
        if row["parent_split"] != row["derivative_split"]:
            raise ValueError("coverage cell violates split inheritance")
        for key in (
            "parent_evidence_ids",
            "dictionary_record_ids",
            "grammar_claim_ids",
        ):
            require_string_list(row, key, f"coverage cell {row['coverage_cell_id']}")


def compile_sentence_commission(
    *,
    program_root: Path,
    analysis_dir: Path,
    census_contract_path: Path,
    synthetic_contract_path: Path,
    dictionary_current_path: Path,
    grammar_current_path: Path,
    created_at_utc: str,
    supplemental_analysis_dir: Path | None = None,
    supplemental_analysis_contract_path: Path | None = None,
) -> dict[str, Any]:
    program_root = program_root.resolve()
    created_at = datetime.fromisoformat(created_at_utc.replace("Z", "+00:00"))
    if created_at.tzinfo is None or created_at.utcoffset() is None:
        raise ValueError("created-at timestamp must include a UTC offset")
    if (supplemental_analysis_dir is None) != (
        supplemental_analysis_contract_path is None
    ):
        raise ValueError(
            "supplemental analysis directory and contract must be supplied together"
        )
    analysis_dir = resolve_within(program_root, analysis_dir, "analysis directory")
    census_contract_path = resolve_within(
        program_root, census_contract_path, "census contract"
    )
    synthetic_contract_path = resolve_within(
        program_root, synthetic_contract_path, "synthetic sentence-pair contract"
    )
    dictionary_current_path = resolve_within(
        program_root, dictionary_current_path, "dictionary current pointer"
    )
    grammar_current_path = resolve_within(
        program_root, grammar_current_path, "grammar current pointer"
    )
    supplemental_analysis = None
    supplemental_contract = None
    supplemental_analysis_path = None
    supplemental_contract_path = None
    if supplemental_analysis_dir is not None:
        supplemental_analysis_path = resolve_within(
            program_root,
            supplemental_analysis_dir,
            "supplemental analysis directory",
        )
        supplemental_contract_path = resolve_within(
            program_root,
            supplemental_analysis_contract_path,
            "supplemental analysis contract",
        )
        supplemental_contract = read_json(supplemental_contract_path)
        supplemental_analysis = verify_supplemental_analysis(
            supplemental_analysis_path, supplemental_contract
        )
    census_contract = read_json(census_contract_path)
    synthetic_contract = read_json(synthetic_contract_path)
    if synthetic_contract.get("immutable") is not True:
        raise ValueError("synthetic sentence-pair contract must be immutable")
    goal_binding = synthetic_contract.get("goal_binding") or {}
    if goal_binding.get("required_by_active_goal") is not True:
        raise ValueError("synthetic sentence pairs are not bound to the active goal")
    if goal_binding.get("method_id") != "kuku_yalanji_coverage_ledger":
        raise ValueError(
            "synthetic contract does not use the Kuku Yalanji ledger method"
        )
    if (synthetic_contract.get("opening_gate") or {}).get("generation_authorized"):
        raise ValueError("input contract unexpectedly authorizes generation")
    if (
        int((synthetic_contract.get("population") or {}).get("candidate_pairs", -1))
        != 0
    ):
        raise ValueError("commission compiler requires a zero-pair opening contract")

    analysis = verify_analysis(analysis_dir, census_contract)
    dictionary = verify_current_edition(
        program_root, dictionary_current_path, "dictionary"
    )
    grammar = verify_current_edition(program_root, grammar_current_path, "grammar")
    full_census_living_book_reviews = verify_reviewed_living_book_children(
        analysis_dir=analysis_dir,
        analysis=analysis,
        census_contract_path=census_contract_path,
        dictionary=dictionary,
        grammar=grammar,
    )
    supplemental_living_book_reviews = None
    if supplemental_analysis is not None and supplemental_contract is not None:
        baselines = supplemental_living_book_baselines(
            program_root, supplemental_contract
        )
        supplemental_living_book_reviews = verify_supplemental_living_book_reviews(
            analysis_dir=supplemental_analysis_path,
            analysis=supplemental_analysis,
            baselines=baselines,
            dictionary=dictionary,
            grammar=grammar,
        )
    reuse = suite_reuse_statuses(program_root, census_contract)
    requirements = build_failure_requirements(
        analysis["rows"], reuse, analysis_population="full_lexical_census"
    )
    supplemental_requirements: list[dict[str, Any]] = []
    if supplemental_analysis is not None:
        supplemental_requirements = build_supplemental_failure_requirements(
            supplemental_analysis["rows"]
        )
        requirements.extend(supplemental_requirements)
        requirements.sort(key=lambda row: row["failure_requirement_id"])
    lexemes, lexical_blockers = accepted_synthetic_lexemes(dictionary)
    templates, grammar_blockers = accepted_synthetic_templates(grammar)
    cells, blocked = build_commission(
        requirements,
        lexemes,
        templates,
        lexical_blockers + grammar_blockers,
    )
    validate_coverage_contract(synthetic_contract, cells)
    source_records_with_failures = {row["source_record_id"] for row in requirements}
    requirements_by_id = {row["failure_requirement_id"]: row for row in requirements}
    if len(requirements_by_id) != len(requirements):
        raise ValueError("failure requirement IDs are not unique")
    covered_requirement_ids = {cell["failure_requirement_id"] for cell in cells}
    blocked_requirement_ids = {row["failure_requirement_id"] for row in blocked}
    expected_requirement_ids = set(requirements_by_id)
    if covered_requirement_ids & blocked_requirement_ids:
        raise ValueError("a failure requirement is both covered and blocked")
    if covered_requirement_ids | blocked_requirement_ids != expected_requirement_ids:
        raise ValueError("a failure requirement was dropped by the commission compiler")
    source_records_with_cells = {
        requirements_by_id[cell["failure_requirement_id"]]["source_record_id"]
        for cell in cells
    }
    living_book_reviews: dict[str, Any] | dict[str, dict[str, Any]]
    if supplemental_living_book_reviews is None:
        living_book_reviews = full_census_living_book_reviews
    else:
        living_book_reviews = {
            "full_lexical_census": full_census_living_book_reviews,
            "fiftywords_pretraining_supplement": supplemental_living_book_reviews,
        }
    supplemental_rows = (
        int(supplemental_analysis["expected_rows"])
        if supplemental_analysis is not None
        else 0
    )
    supplemental_failed_rows = (
        sum(not row["accepted_exact"] for row in supplemental_analysis["rows"])
        if supplemental_analysis is not None
        else 0
    )
    summary = {
        "schema_version": 1,
        "commission_id": (
            f"{census_contract['experiment_id']}-synthetic-sentence-commission-"
            + ("v2" if supplemental_analysis is not None else "v1")
        ),
        "created_at_utc": created_at_utc,
        "status": "reviewable_commission_not_generation_authorization",
        "bindings": {
            "analysis_id": analysis["summary"]["analysis_id"],
            "analysis_summary_sha256": sha256(analysis_dir / "SUMMARY.json"),
            "analysis_output_checksums_sha256": sha256(
                analysis_dir / "OUTPUT-SHA256SUMS"
            ),
            "census_contract_sha256": sha256(census_contract_path),
            "synthetic_sentence_pair_contract_id": synthetic_contract["contract_id"],
            "synthetic_sentence_pair_contract_sha256": sha256(synthetic_contract_path),
            "dictionary_edition_id": dictionary["manifest"]["edition_id"],
            "dictionary_manifest_sha256": dictionary["manifest_sha256"],
            "grammar_edition_id": grammar["manifest"]["edition_id"],
            "grammar_manifest_sha256": grammar["manifest_sha256"],
            "living_book_reviews": living_book_reviews,
        },
        "counts": {
            "census_rows": analysis["expected_rows"],
            "supplemental_50words_rows": supplemental_rows,
            "total_measured_rows": analysis["expected_rows"] + supplemental_rows,
            "full_census_failed_benchmark_rows": sum(
                not row["accepted_exact"] for row in analysis["rows"]
            ),
            "supplemental_50words_failed_benchmark_rows": supplemental_failed_rows,
            "failed_benchmark_rows": sum(
                not row["accepted_exact"] for row in analysis["rows"]
            )
            + supplemental_failed_rows,
            "source_records_with_failures": len(source_records_with_failures),
            "analysis_only_confounded_failure_requirements": sum(
                row["synthetic_commission_input_status"]
                != "eligible_for_evidence_gated_priority_review"
                for row in requirements
            ),
            "accepted_synthetic_lexemes": len(lexemes),
            "accepted_productive_templates": len(templates),
            "coverage_cells": len(cells),
            "covered_failure_requirements": len(covered_requirement_ids),
            "source_records_with_coverage_cells": len(source_records_with_cells),
            "commissioned_sentence_pair_instances": sum(
                int(cell["target_independent_instances"]) for cell in cells
            ),
            "blocked_requirements": len(blocked),
            "candidate_sentence_pairs": 0,
            "training_eligible_sentence_pairs": 0,
        },
        "global_blockers": sorted(set(lexical_blockers + grammar_blockers)),
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": (
            "This artifact commissions reviewable English-target-language sentence "
            "coverage from measured failures. It generates no text, accepts no linguistic "
            "claim, and authorizes neither training nor release."
        ),
    }
    if supplemental_analysis is not None and supplemental_contract_path is not None:
        summary["bindings"]["supplemental_50words_analysis_id"] = supplemental_analysis[
            "report"
        ]["analysis_id"]
        summary["bindings"]["supplemental_50words_report_sha256"] = sha256(
            supplemental_analysis_path / "REPORT.json"
        )
        summary["bindings"]["supplemental_50words_output_checksums_sha256"] = sha256(
            supplemental_analysis_path / "SHA256SUMS.analysis"
        )
        summary["bindings"]["supplemental_50words_contract_sha256"] = sha256(
            supplemental_contract_path
        )
    return {
        "summary": summary,
        "failure_requirements": requirements,
        "coverage_cells": cells,
        "blocked_requirements": blocked,
    }


def write_commission(output_dir: Path, result: dict[str, Any]) -> None:
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "SUMMARY.json", result["summary"])
    write_jsonl_atomic(
        output_dir / "FAILURE-REQUIREMENTS.jsonl", result["failure_requirements"]
    )
    write_jsonl_atomic(output_dir / "COVERAGE-CELLS.jsonl", result["coverage_cells"])
    write_jsonl_atomic(
        output_dir / "BLOCKED-REQUIREMENTS.jsonl", result["blocked_requirements"]
    )
    outputs = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "OUTPUT-SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in outputs),
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--analysis-dir", type=Path, required=True)
    parser.add_argument("--census-contract", type=Path, required=True)
    parser.add_argument("--synthetic-contract", type=Path, required=True)
    parser.add_argument("--dictionary-current", type=Path, required=True)
    parser.add_argument("--grammar-current", type=Path, required=True)
    parser.add_argument("--supplemental-analysis-dir", type=Path)
    parser.add_argument("--supplemental-analysis-contract", type=Path)
    parser.add_argument("--created-at-utc", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = compile_sentence_commission(
        program_root=args.program_root,
        analysis_dir=args.analysis_dir,
        census_contract_path=args.census_contract,
        synthetic_contract_path=args.synthetic_contract,
        dictionary_current_path=args.dictionary_current,
        grammar_current_path=args.grammar_current,
        created_at_utc=args.created_at_utc,
        supplemental_analysis_dir=args.supplemental_analysis_dir,
        supplemental_analysis_contract_path=args.supplemental_analysis_contract,
    )
    write_commission(args.output_dir, result)
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

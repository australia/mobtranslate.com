#!/usr/bin/env python3
"""Audit row-level project exposure and evaluation-input leakage for NLLB."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import tempfile
import unicodedata
from typing import Any, Iterable


QUOTE_FOLD = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u02bc": "'",
        "`": "'",
        "\u00b4": "'",
        "\u201c": '"',
        "\u201d": '"',
    }
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).translate(QUOTE_FOLD)
    return " ".join(text.casefold().split())


def is_lexical_character(value: str) -> bool:
    if not value:
        return False
    return unicodedata.category(value)[0] in {"L", "M", "N"} or value in {"'", "-"}


def contains_bounded_surface(text: str, surface: str) -> bool:
    haystack = normalize(text)
    needle = normalize(surface)
    if not needle:
        return False
    offset = 0
    while True:
        index = haystack.find(needle, offset)
        if index < 0:
            return False
        end = index + len(needle)
        before_ok = index == 0 or not is_lexical_character(haystack[index - 1])
        after_ok = end == len(haystack) or not is_lexical_character(haystack[end])
        if before_ok and after_ok:
            return True
        offset = index + 1


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"expected object at {path}:{line_number}")
            rows.append(value)
    return rows


def row_id(row: dict[str, Any]) -> str:
    value = row.get("rowId") or row.get("id")
    if not isinstance(value, str) or not value:
        raise ValueError("benchmark row is missing an ID")
    return value


def references(row: dict[str, Any]) -> list[str]:
    raw = row.get("acceptedReferences") or row.get("accepted_references") or []
    result = list(dict.fromkeys(normalize(value) for value in raw if normalize(value)))
    if not result:
        raise ValueError(f"benchmark row {row_id(row)} has no accepted references")
    return result


def source_record_ids(row: dict[str, Any]) -> list[str]:
    values = row.get("sourceRecordIds") or (row.get("analysisJoin") or {}).get(
        "sourceRecordIds"
    )
    if not isinstance(values, list) or not values:
        raise ValueError(f"benchmark row {row_id(row)} has no source-record join")
    result = [str(value) for value in values]
    if len(set(result)) != len(result):
        raise ValueError(f"benchmark row {row_id(row)} repeats a source-record ID")
    return result


def one_matching_row(
    rows: list[dict[str, Any]], predicate: Any, description: str
) -> dict[str, Any]:
    matches = [row for row in rows if predicate(row)]
    if len(matches) != 1:
        raise ValueError(f"expected one {description}, found {len(matches)}")
    return matches[0]


def assert_zero_step_lineage(
    contract: dict[str, Any],
    model_manifest: dict[str, Any],
    model_registry: list[dict[str, Any]],
    experiment_registry: list[dict[str, Any]],
) -> dict[str, Any]:
    if contract.get("optimizer_steps") != 0:
        raise ValueError("lineage audit is restricted to a zero-step control")
    model_contract = contract["model"]
    if model_manifest.get("artifact_id") != model_contract["artifact_id"]:
        raise ValueError("control-model artifact ID mismatch")
    if model_manifest.get("artifact_kind") != "untrained_nllb_control_model":
        raise ValueError("model manifest is not an untrained control")
    weights = model_manifest.get("artifact_files", {}).get("model.safetensors", {})
    if weights.get("sha256") != model_contract["weights_sha256"]:
        raise ValueError("control-model weights mismatch")
    if model_manifest.get("base", {}).get("revision") != model_contract["base_revision"]:
        raise ValueError("upstream base revision mismatch")

    model_row = one_matching_row(
        model_registry,
        lambda row: row.get("merged_weights_sha256") == model_contract["weights_sha256"],
        "model-registry row for the control weights",
    )
    task_contract = model_row.get("task_contract") or {}
    if task_contract.get("optimizer_steps") != 0:
        raise ValueError("model registry does not declare zero optimizer steps")
    if model_row.get("adapter_sha256") is not None:
        raise ValueError("zero-step control unexpectedly declares an adapter")

    experiment_row = one_matching_row(
        experiment_registry,
        lambda row: row.get("experiment_key") == contract["experiment_id"],
        "experiment-registry row",
    )
    if experiment_row.get("observed_global_step") != 0:
        raise ValueError("experiment registry does not declare zero observed steps")
    accounting = experiment_row.get("token_accounting") or {}
    zero_fields = (
        "training_examples_presented",
        "source_training_tokens",
        "target_training_tokens",
        "optimizer_updates",
    )
    nonzero = {field: accounting.get(field) for field in zero_fields if accounting.get(field) != 0}
    if nonzero:
        raise ValueError(f"nonzero project training exposure: {nonzero}")
    if experiment_row.get("provider_run_id") is not None:
        raise ValueError("zero-step local control unexpectedly has a provider run ID")

    extension_rows = model_manifest.get("extension", {}).get("ordered_extension_rows") or []
    target_rows = [row for row in extension_rows if row.get("role") == "target_language"]
    if len(target_rows) != 1:
        raise ValueError("expected one target-language extension row")
    initialization = target_rows[0].get("initialization") or {}
    if initialization.get("source_token") == contract["task"]["target_token"]:
        raise ValueError("target row claims self-initialization")

    return {
        "classification": "zero_project_training_exposure_upstream_unknown",
        "mobtranslate_direct_lexical_pair_exposure": False,
        "mobtranslate_sentence_context_exposure": False,
        "mobtranslate_prior_ancestor_exposure": False,
        "current_experiment_optimizer_steps": 0,
        "current_experiment_training_examples_presented": 0,
        "target_reference_used_to_fit_tokenizer": False,
        "target_reference_used_to_initialize_model_rows": False,
        "target_references_used_for_posthoc_tokenizer_audit": True,
        "upstream_nllb_pretraining_exposure": "unknown",
        "upstream_unknown_reason": (
            "The upstream NLLB training inventory cannot prove presence or absence for "
            "each Wajarri lexical mapping."
        ),
        "target_language_row_initialization": initialization,
    }


def audit_rows(
    contract: dict[str, Any], program_root: Path, lineage: dict[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    audited: list[dict[str, Any]] = []
    suite_summaries: dict[str, dict[str, Any]] = {}
    seen_ids: set[str] = set()
    for suite in contract["suites"]:
        path = program_root / suite["path"]
        if sha256(path) != suite["sha256"]:
            raise ValueError(f"suite hash mismatch: {path}")
        benchmark_rows = read_jsonl(path)
        if len(benchmark_rows) != suite["rows"]:
            raise ValueError(f"suite row mismatch: {path}")
        input_surface_rows = 0
        input_surface_references = 0
        for benchmark in benchmark_rows:
            identifier = row_id(benchmark)
            if identifier in seen_ids:
                raise ValueError(f"duplicate benchmark row ID: {identifier}")
            seen_ids.add(identifier)
            accepted = references(benchmark)
            input_text = str(benchmark.get("inputText") or "")
            present = [
                reference
                for reference in accepted
                if contains_bounded_surface(input_text, reference)
            ]
            if present:
                input_surface_rows += 1
                input_surface_references += len(present)
            audited.append(
                {
                    "schema_version": 1,
                    "row_id": identifier,
                    "suite_key": suite["suite_key"],
                    "source_record_ids": source_record_ids(benchmark),
                    "accepted_references": accepted,
                    "evaluation_input_contains_reference_surface": bool(present),
                    "reference_surfaces_present_in_evaluation_input": present,
                    "documented_project_training_exposure": lineage["classification"],
                    "mobtranslate_direct_lexical_pair_exposure": False,
                    "mobtranslate_sentence_context_exposure": False,
                    "mobtranslate_prior_ancestor_exposure": False,
                    "current_experiment_optimizer_steps": 0,
                    "target_reference_used_to_fit_tokenizer": False,
                    "target_reference_used_to_initialize_model_rows": False,
                    "upstream_nllb_pretraining_exposure": "unknown",
                    "benchmark_reference_opened_for_evaluation": True,
                    "benchmark_is_sealed": bool(benchmark.get("sealed")),
                    "claim_limit": (
                        "This row distinguishes documented project exposure, unknown "
                        "upstream exposure, and reference-surface presence in the input. "
                        "It does not infer semantic leakage or linguistic correctness."
                    ),
                }
            )
        suite_summaries[suite["suite_key"]] = {
            "rows": len(benchmark_rows),
            "sha256": suite["sha256"],
            "evaluation_input_reference_surface_rows": input_surface_rows,
            "evaluation_input_reference_surface_references": input_surface_references,
        }

    return audited, suite_summaries


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(f"refusing to overwrite {path}")
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(f"refusing to overwrite {path}")
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--model-manifest", type=Path, required=True)
    parser.add_argument("--model-registry", type=Path, required=True)
    parser.add_argument("--experiment-registry", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--created-at", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    contract = read_json(args.contract)
    model_manifest = read_json(args.model_manifest)
    model_registry = read_jsonl(args.model_registry)
    experiment_registry = read_jsonl(args.experiment_registry)
    lineage = assert_zero_step_lineage(
        contract, model_manifest, model_registry, experiment_registry
    )
    rows, suite_summaries = audit_rows(contract, program_root, lineage)
    source_records = {
        source_id for row in rows for source_id in row["source_record_ids"]
    }
    present = [row for row in rows if row["evaluation_input_contains_reference_surface"]]
    report = {
        "schema_version": 1,
        "audit_id": f"{contract['experiment_id']}-lineage-leakage-audit-v1",
        "created_at": args.created_at,
        "contract_sha256": sha256(args.contract),
        "model_manifest_sha256": sha256(args.model_manifest),
        "model_registry_sha256": sha256(args.model_registry),
        "experiment_registry_sha256": sha256(args.experiment_registry),
        "rows": len(rows),
        "unique_source_records": len(source_records),
        "suite_summaries": suite_summaries,
        "documented_project_training_exposure_counts": dict(
            sorted(Counter(row["documented_project_training_exposure"] for row in rows).items())
        ),
        "upstream_nllb_pretraining_exposure_counts": dict(
            sorted(Counter(row["upstream_nllb_pretraining_exposure"] for row in rows).items())
        ),
        "evaluation_input_reference_surface_rows": len(present),
        "lineage_contract": lineage,
        "interpretation": [
            "All project-controlled optimizer exposure is proven zero for this control.",
            "Upstream NLLB exposure remains unknown and is not relabelled unseen.",
            "A reference surface in an evaluation input is reported separately from "
            "training exposure and requires row-level interpretation.",
            "The tokenizer audit was posthoc and did not fit or alter the control tokenizer.",
            "These development suites are open internal censuses, not sealed final tests.",
        ],
        "claim_limit": (
            "This audit establishes documented MobTranslate lineage and evaluation-input "
            "surface overlap. It cannot prove upstream absence, semantic leakage, or "
            "translation competence."
        ),
    }

    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "REPORT.json", report)
    write_jsonl_atomic(output_dir / "ROWS.jsonl", rows)
    write_jsonl_atomic(output_dir / "TARGET-IN-INPUT.jsonl", present)
    checksummed = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "OUTPUT-SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in checksummed),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

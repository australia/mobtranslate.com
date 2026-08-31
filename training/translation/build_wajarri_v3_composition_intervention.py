#!/usr/bin/env python3
"""Freeze a source-bound Wajarri composition intervention commission."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-composition-intervention-v1"


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
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(normalized.split()).strip(" .?!,;:")


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


def resolve_input(
    program_root: Path, binding: dict[str, Any]
) -> tuple[Path, list[dict[str, Any]] | dict[str, Any]]:
    path = (program_root / binding["path"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"input escapes program root: {path}") from error
    if not path.is_file():
        raise ValueError(f"missing input: {path}")
    if sha256_file(path) != binding["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    if binding["format"] == "jsonl":
        value: list[dict[str, Any]] | dict[str, Any] = load_jsonl(path)
        if len(value) != int(binding["rows"]):
            raise ValueError(
                f"row-count mismatch for {path}: expected {binding['rows']}, "
                f"got {len(value)}"
            )
    elif binding["format"] == "json":
        value = load_json(path)
    else:
        raise ValueError(f"unsupported input format: {binding['format']}")
    return path, value


def resolve_contract(
    program_root: Path, contract_path: Path, raw_contract: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    base_binding = raw_contract.get("base_contract")
    if base_binding is None:
        return raw_contract, None
    base_path = (program_root / base_binding["path"]).resolve()
    try:
        base_path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"base contract escapes program root: {base_path}") from error
    if sha256_file(base_path) != base_binding["sha256"]:
        raise ValueError("base contract SHA-256 mismatch")
    contract = copy.deepcopy(load_json(base_path))
    for field in ("analysis_id", "created_at_utc", "claim_limit"):
        contract[field] = raw_contract[field]
    predicate_by_id = {
        row["predicate_id"]: row for row in contract["predicates"]
    }
    for override in raw_contract.get("predicate_overrides", []):
        predicate = predicate_by_id.get(override["predicate_id"])
        if predicate is None:
            raise ValueError(
                f"predicate override has unknown ID: {override['predicate_id']}"
            )
        predicate.update({key: value for key, value in override.items() if key != "predicate_id"})
    if "retired_baseline_predicates" in raw_contract:
        contract["retired_baseline_predicates"] = raw_contract[
            "retired_baseline_predicates"
        ]
    if "retired_baseline_summary" in raw_contract:
        contract["retired_baseline_summary"] = raw_contract[
            "retired_baseline_summary"
        ]
    contract["expected"].update(raw_contract.get("expected_overrides", {}))
    return contract, {
        "path": str(base_path),
        "sha256": sha256_file(base_path),
        "child_path": str(contract_path),
    }


def index_controlled_realizations(
    rows: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for lexeme in rows:
        for surface in lexeme.get("surface_realizations", []):
            realization_id = surface["realization_id"]
            if realization_id in result:
                raise ValueError(f"duplicate controlled realization: {realization_id}")
            result[realization_id] = {
                "realization_id": realization_id,
                "english_lemma": lexeme["english_lemma"],
                "english_surface": surface["english_surface"],
                "target_surface": surface["target_surface"],
                "part_of_speech": lexeme["part_of_speech"],
                "slot_class": surface["slot_class"],
                "source_record_ids": lexeme["source_record_ids"],
                "parent_evidence_ids": surface["parent_evidence_ids"],
                "source_kind": "controlled_synthetic_lexeme",
            }
    return result


def index_candidate_realizations(
    row_sets: Iterable[list[dict[str, Any]]],
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    identity_fields = (
        "english_surface",
        "target_surface",
        "part_of_speech",
        "slot_classes",
        "grammatical_features",
        "source_record_ids",
    )
    for rows in row_sets:
        for row in rows:
            realization_id = row["realization_id"]
            existing = result.get(realization_id)
            if existing is not None:
                for field in identity_fields:
                    if existing.get(field) != row.get(field):
                        raise ValueError(
                            f"conflicting candidate realization {realization_id}: {field}"
                        )
                continue
            result[realization_id] = dict(row, source_kind="candidate_realization")
    return result


def resolve_realization(
    spec: dict[str, Any],
    controlled: dict[str, dict[str, Any]],
    candidates: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    source = spec["source"]
    index = controlled if source == "controlled" else candidates
    realization_id = spec["realization_id"]
    row = index.get(realization_id)
    if row is None:
        raise ValueError(f"unresolved {source} realization: {realization_id}")
    observed_english = row.get("english_lemma", row.get("english_surface"))
    if normalize_surface(str(observed_english)) != normalize_surface(
        spec["expected_english"]
    ):
        raise ValueError(f"English identity mismatch for {realization_id}")
    if normalize_surface(row["target_surface"]) != normalize_surface(
        spec["expected_target"]
    ):
        raise ValueError(f"target identity mismatch for {realization_id}")
    return row


def existing_pair_index(
    rows: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        index[normalize_surface(row["input_text"])].append(row)
    return index


def baseline_index(
    rows: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    result = {}
    for row in rows:
        key = normalize_surface(row["source_text"])
        if key in result:
            raise ValueError(f"duplicate baseline source: {row['source_text']}")
        result[key] = row
    return result


def classify_cell(
    subject_disposition: str,
    input_text: str,
    target_text: str,
    existing: dict[str, list[dict[str, Any]]],
) -> tuple[str, list[str]]:
    if subject_disposition == "blocked_subject_adjudication":
        return subject_disposition, []
    if subject_disposition == "excluded_semantic_compatibility":
        return subject_disposition, []

    matched = existing.get(normalize_surface(input_text), [])
    target = normalize_surface(target_text)
    matching_ids = sorted(
        row["id"] for row in matched if normalize_surface(row["output_text"]) == target
    )
    competing = {
        normalize_surface(row["output_text"])
        for row in matched
        if normalize_surface(row["output_text"]) != target
    }
    if matching_ids and competing:
        return "blocked_reference_conflict", matching_ids
    if matching_ids:
        return "existing_retention", matching_ids
    if subject_disposition == "training_matrix_subject":
        return "novel_train_candidate", []
    if subject_disposition == "development_matrix_subject":
        return "development_candidate", []
    raise ValueError(f"unknown subject disposition: {subject_disposition}")


def build_cells(
    contract: dict[str, Any],
    controlled_realizations: dict[str, dict[str, Any]],
    candidate_realizations: dict[str, dict[str, Any]],
    controlled_pairs: list[dict[str, Any]],
    baseline_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    existing = existing_pair_index(controlled_pairs)
    baselines = baseline_index(baseline_rows)
    predicates = {row["predicate_id"]: row for row in contract["predicates"]}
    cells = []
    seen = set()
    for subject_spec in contract["subjects"]:
        subject = resolve_realization(
            subject_spec, controlled_realizations, candidate_realizations
        )
        for predicate_id in subject_spec["predicate_ids"]:
            predicate_spec = predicates.get(predicate_id)
            if predicate_spec is None:
                raise ValueError(f"unknown predicate in subject policy: {predicate_id}")
            predicate = resolve_realization(
                predicate_spec, controlled_realizations, candidate_realizations
            )
            first_person = subject_spec["person"] == "first"
            clause = predicate_spec[
                "first_person_clause" if first_person else "third_person_clause"
            ]
            source_text = f"{subject_spec['source_surface']} {clause}."
            input_text = f"<translate> {source_text}"
            target_text = f"{subject_spec['target_sentence_surface']} {predicate['target_surface']}."
            cell_id = f"wbv-v3-cell:{subject_spec['subject_id']}:{predicate_id}"
            if cell_id in seen:
                raise ValueError(f"duplicate cell: {cell_id}")
            seen.add(cell_id)

            disposition, existing_ids = classify_cell(
                subject_spec["disposition"], input_text, target_text, existing
            )
            baseline = baselines.get(normalize_surface(source_text))
            baseline_summary = None
            if baseline is not None:
                baseline_summary = {
                    "pair_id": baseline["pair_id"],
                    "prediction": baseline["prediction"],
                    "reference": baseline["reference"],
                    "exact": baseline["exact"],
                    "failure_codes": baseline["failure_codes"],
                }
            cells.append(
                {
                    "schema_version": 1,
                    "cell_id": cell_id,
                    "construction_family": "positive-present-intransitive",
                    "subject_id": subject_spec["subject_id"],
                    "predicate_id": predicate_id,
                    "input_text": input_text,
                    "source_text": source_text,
                    "target_text": target_text,
                    "subject_realization_id": subject_spec["realization_id"],
                    "predicate_realization_id": predicate_spec["realization_id"],
                    "subject_source_record_ids": subject.get("source_record_ids", []),
                    "predicate_source_record_ids": predicate.get(
                        "source_record_ids", []
                    ),
                    "semantic_compatibility_rationale": subject_spec[
                        "semantic_compatibility_rationale"
                    ],
                    "disposition": disposition,
                    "existing_retention_row_ids": existing_ids,
                    "live_baseline": baseline_summary,
                    "baseline_status": (
                        "development_consumed" if baseline else "not_measured_live"
                    ),
                    "pair_kind": "composition_intervention_candidate",
                    "training_eligibility": "not_allowed_pending_commission_review",
                    "benchmark_eligibility": (
                        "development_only"
                        if disposition == "development_candidate"
                        else "not_allowed"
                    ),
                    "synthetic_output_is_linguistic_evidence": False,
                    "model_output_is_linguistic_evidence": False,
                    "claim_limit": (
                        "This cell composes complete source-bound surfaces without "
                        "inflecting them. It is a reviewable intervention candidate, "
                        "not attested language or an authorized training row."
                    ),
                }
            )
    return sorted(cells, key=lambda row: row["cell_id"])


def retired_baseline_rows(
    contract: dict[str, Any], baseline_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if "retired_baseline_predicates" in contract:
        retirement_policy = {
            row["realization_id"]: row
            for row in contract["retired_baseline_predicates"]
        }
    else:
        retirement_policy = {
            realization_id: {
                "reason": (
                    "The bound Wajarri form is source-defined as motion away from the "
                    "speaker, while this English prompt says only generic going."
                ),
                "replacement_prompt_policy": "Use going away, not generic going.",
            }
            for realization_id in contract[
                "retired_baseline_predicate_realization_ids"
            ]
        }
    rows = []
    for row in baseline_rows:
        policy = retirement_policy.get(row["bindings"]["predicate"])
        if policy is None:
            continue
        rows.append(
            {
                "schema_version": 1,
                "pair_id": row["pair_id"],
                "source_text": row["source_text"],
                "reference": row["reference"],
                "prediction": row["prediction"],
                "exact": row["exact"],
                "retirement_reason": policy["reason"],
                "replacement_prompt_policy": policy[
                    "replacement_prompt_policy"
                ],
                "benchmark_eligibility": "retired_from_future_comparison",
            }
        )
    return sorted(rows, key=lambda row: row["pair_id"])


def verify_expected(contract: dict[str, Any], counts: dict[str, int]) -> None:
    for key, expected in contract["expected"].items():
        observed = counts.get(key)
        if observed != int(expected):
            raise ValueError(f"count mismatch for {key}: expected {expected}, got {observed}")


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    raw_contract = load_json(contract_path)
    if raw_contract.get("schema_version") != 1:
        raise ValueError("unsupported contract schema")
    contract, base_contract = resolve_contract(
        program_root, contract_path, raw_contract
    )

    loaded: dict[str, list[dict[str, Any]] | dict[str, Any]] = {}
    manifest_inputs = {}
    for name, binding in contract["inputs"].items():
        _, value = resolve_input(program_root, binding)
        loaded[name] = value
        manifest_inputs[name] = dict(binding)

    controlled_lexemes = loaded["controlled_lexemes"]
    common_candidates = loaded["common_candidate_realizations"]
    first_person_candidates = loaded["first_person_candidate_realizations"]
    controlled_pairs = loaded["controlled_sentence_corpus"]
    baseline_rows = loaded["live_pre_census_sentences"]
    if not all(
        isinstance(value, list)
        for value in (
            controlled_lexemes,
            common_candidates,
            first_person_candidates,
            controlled_pairs,
            baseline_rows,
        )
    ):
        raise ValueError("composition inputs must be JSONL row sets")

    controlled_realizations = index_controlled_realizations(controlled_lexemes)
    candidate_realizations = index_candidate_realizations(
        [common_candidates, first_person_candidates]
    )
    cells = build_cells(
        contract,
        controlled_realizations,
        candidate_realizations,
        controlled_pairs,
        baseline_rows,
    )
    retired = retired_baseline_rows(contract, baseline_rows)
    dispositions = Counter(row["disposition"] for row in cells)
    baseline_bound = [row for row in cells if row["live_baseline"] is not None]
    counts = {
        "matrix_cells": len(cells),
        "novel_train_candidates": dispositions["novel_train_candidate"],
        "existing_retention_cells": dispositions["existing_retention"],
        "development_candidates": dispositions["development_candidate"],
        "blocked_reference_conflicts": dispositions["blocked_reference_conflict"],
        "blocked_subject_adjudication": dispositions[
            "blocked_subject_adjudication"
        ],
        "excluded_semantic_cells": dispositions[
            "excluded_semantic_compatibility"
        ],
        "baseline_linked_semantically_bound_cells": len(baseline_bound),
        "baseline_exact_semantically_bound_cells": sum(
            bool(row["live_baseline"]["exact"]) for row in baseline_bound
        ),
        "retired_underspecified_baseline_prompts": len(retired),
        "contrastive_requirements": len(contract["contrastive_requirements"]),
        "training_eligible_rows": sum(
            row["training_eligibility"] == "allowed" for row in cells
        ),
    }
    verify_expected(contract, counts)

    report = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "FROZEN_INTERVENTION_COMMISSION_NOT_TRAINING_DATA",
        "counts": counts,
        "measured_diagnosis": {
            "direct_lexical_reconstruction": "7/9 exact",
            "original_live_sentence_census": "2/20 exact",
            "semantically_bound_live_subset": (
                f"{counts['baseline_exact_semantically_bound_cells']}/"
                f"{counts['baseline_linked_semantically_bound_cells']} exact"
            ),
            "reason_for_subset": contract.get(
                "retired_baseline_summary",
                "Generic-going prompts were retired because the target form is explicitly going away.",
            ),
        },
        "intervention": {
            "primary_change": (
                "Add matrix-balanced sentence composition for four new predicates "
                "while retaining source-correct going-away rows."
            ),
            "novel_candidate_rows": counts["novel_train_candidates"],
            "development_rows": counts["development_candidates"],
            "training_authorized": False,
            "runpod_authorized": False,
            "expansion_policy": (
                "Do not expand to 3,000 rows unless this narrow intervention improves "
                "held-out subject-predicate composition under a fixed-compute screen."
            ),
        },
        "decisions": [
            "Treat composition and conflicting prompt supervision as the immediate bottleneck, not raw lexical recall.",
            "Retire source-underspecified prompts and use source-qualified English prompts for exact comparison.",
            "Keep the child-going-away cell blocked because the selected corpus contains Mayu and Jura for the same English prompt.",
            "Keep woman cells blocked until the nyarlu subject realization and competing Jurdu behavior are adjudicated.",
            "Exclude fish from this posture-and-motion matrix rather than create weak synthetic combinations.",
            "Use the current 20-row census only for development; it can never become sealed final evidence.",
        ],
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    write_jsonl_atomic(output_dir / "COMPOSITION-CELLS.jsonl", cells)
    write_jsonl_atomic(output_dir / "RETIRED-BASELINE-PROMPTS.jsonl", retired)
    write_jsonl_atomic(
        output_dir / "CONTRASTIVE-REQUIREMENTS.jsonl",
        contract["contrastive_requirements"],
    )
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
            "COMPOSITION-CELLS.jsonl": {"rows": len(cells)},
            "RETIRED-BASELINE-PROMPTS.jsonl": {"rows": len(retired)},
            "CONTRASTIVE-REQUIREMENTS.jsonl": {
                "rows": len(contract["contrastive_requirements"])
            },
            "REPORT.json": {"rows": 1},
        },
        "claim_limit": contract["claim_limit"],
    }
    if base_contract is not None:
        manifest["contract"]["base_contract"] = base_contract
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    output_names = (
        "COMPOSITION-CELLS.jsonl",
        "CONTRASTIVE-REQUIREMENTS.jsonl",
        "MANIFEST.json",
        "REPORT.json",
        "RETIRED-BASELINE-PROMPTS.jsonl",
    )
    checksum_text = "".join(
        f"{sha256_file(output_dir / name)}  {name}\n" for name in output_names
    )
    write_text_atomic(output_dir / "OUTPUT-SHA256SUMS", checksum_text)
    print(canonical_json({"output_dir": str(output_dir), **counts}))


if __name__ == "__main__":
    main()

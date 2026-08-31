#!/usr/bin/env python3
"""Render controlled bilingual sentence pairs from a reviewed commission."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import string
import tempfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PLACEHOLDER_RE = re.compile(r"^[a-z][a-z0-9_]*$")
RENDERER_ID = "deterministic-explicit-form-renderer@1.0.0"
EXPLICIT_SURFACE_ORIGINS = {
    "accepted_dictionary_form",
    "attested_form",
    "grammar_licensed_explicit_form",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def canonical_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    require(isinstance(value, dict), f"expected JSON object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        value = json.loads(line)
        require(
            isinstance(value, dict),
            f"expected JSON object at {path}:{line_number}",
        )
        rows.append(value)
    return rows


def resolve_within(root: Path, value: str | Path, label: str) -> Path:
    path = Path(value)
    resolved = path.resolve() if path.is_absolute() else (root / path).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes program root: {value}") from error
    return resolved


def require_sha256(value: Any, label: str) -> str:
    require(isinstance(value, str) and bool(SHA256_RE.fullmatch(value)), label)
    return value


def require_string(value: Any, label: str) -> str:
    require(isinstance(value, str) and bool(value.strip()), label)
    require(value == value.strip(), f"{label} has surrounding whitespace")
    return value


def require_string_list(
    row: dict[str, Any], key: str, label: str, *, allow_empty: bool = False
) -> list[str]:
    value = row.get(key)
    require(isinstance(value, list), f"{label}.{key} must be a list")
    require(allow_empty or bool(value), f"{label}.{key} cannot be empty")
    require(
        all(isinstance(item, str) and item.strip() == item and item for item in value),
        f"{label}.{key} must contain nonempty trimmed strings",
    )
    require(len(value) == len(set(value)), f"{label}.{key} contains duplicates")
    return value


def parse_checksum_manifest(path: Path) -> dict[str, str]:
    rows: dict[str, str] = {}
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        parts = line.split("  ", maxsplit=1)
        require(len(parts) == 2, f"invalid checksum row at {path}:{line_number}")
        digest, relative = parts
        require_sha256(digest, f"invalid checksum at {path}:{line_number}")
        relative_path = Path(relative)
        require(
            not relative_path.is_absolute() and ".." not in relative_path.parts,
            f"unsafe checksum path at {path}:{line_number}",
        )
        require(relative not in rows, f"duplicate checksum path: {relative}")
        rows[relative] = digest
    return rows


def verify_checksum_population(directory: Path, manifest_name: str) -> dict[str, str]:
    manifest = directory / manifest_name
    require(manifest.is_file(), f"missing checksum manifest: {manifest}")
    checksums = parse_checksum_manifest(manifest)
    require(bool(checksums), f"empty checksum manifest: {manifest}")
    for relative, expected in checksums.items():
        path = resolve_within(directory, relative, "checksum member")
        require(path.is_file(), f"missing checksum member: {relative}")
        require(sha256(path) == expected, f"checksum mismatch: {relative}")
    actual = {
        path.relative_to(directory).as_posix()
        for path in directory.rglob("*")
        if path.is_file() and path.name != manifest_name
    }
    require(actual == set(checksums), "checksum population does not match directory")
    return checksums


def verify_bound_file(program_root: Path, binding: dict[str, Any], label: str) -> Path:
    path = resolve_within(program_root, binding.get("path", ""), label)
    require(path.is_file(), f"missing {label}: {path}")
    expected = require_sha256(binding.get("sha256"), f"invalid {label} SHA-256")
    require(sha256(path) == expected, f"{label} hash mismatch")
    return path


def load_current_edition(
    program_root: Path, pointer_path: Path, artifact: str
) -> dict[str, Any]:
    pointer_path = resolve_within(program_root, pointer_path, f"{artifact} pointer")
    pointer = read_json(pointer_path)
    require(pointer.get("artifact") == artifact, f"wrong {artifact} pointer")
    manifest_path = resolve_within(
        program_root, pointer.get("manifest_path", ""), f"{artifact} manifest"
    )
    require(manifest_path.is_file(), f"missing {artifact} manifest")
    manifest_hash = sha256(manifest_path)
    require(
        manifest_hash == pointer.get("manifest_sha256"),
        f"{artifact} pointer manifest hash mismatch",
    )
    manifest = read_json(manifest_path)
    require(
        manifest.get("edition_id") == pointer.get("current_edition_id"),
        f"{artifact} pointer edition mismatch",
    )
    components = manifest.get("components")
    require(isinstance(components, dict), f"{artifact} components missing")
    for name, binding in components.items():
        require(isinstance(binding, dict), f"invalid {artifact} component: {name}")
        component_path = resolve_within(
            program_root,
            binding.get("path", ""),
            f"{artifact} component {name}",
        )
        require(component_path.is_file(), f"missing {artifact} component: {name}")
        require(
            sha256(component_path) == binding.get("sha256"),
            f"{artifact} component hash mismatch: {name}",
        )
        rows = read_jsonl(component_path)
        require(
            len(rows) == binding.get("rows"),
            f"{artifact} component row-count mismatch: {name}",
        )
    return {
        "pointer": pointer,
        "pointer_path": pointer_path,
        "pointer_sha256": sha256(pointer_path),
        "manifest": manifest,
        "manifest_path": manifest_path,
        "manifest_sha256": manifest_hash,
    }


def read_component(
    program_root: Path, edition: dict[str, Any], component_name: str
) -> list[dict[str, Any]]:
    binding = edition["manifest"]["components"].get(component_name)
    require(isinstance(binding, dict), f"missing component: {component_name}")
    return read_jsonl(resolve_within(program_root, binding["path"], component_name))


def verify_commission(
    program_root: Path,
    commission_dir: Path,
    synthetic_contract: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    commission_dir = resolve_within(
        program_root, commission_dir, "commission directory"
    )
    checksums = verify_checksum_population(commission_dir, "OUTPUT-SHA256SUMS")
    required = {
        "SUMMARY.json",
        "FAILURE-REQUIREMENTS.jsonl",
        "COVERAGE-CELLS.jsonl",
        "BLOCKED-REQUIREMENTS.jsonl",
    }
    require(required <= set(checksums), "commission checksum population is incomplete")
    summary = read_json(commission_dir / "SUMMARY.json")
    cells = read_jsonl(commission_dir / "COVERAGE-CELLS.jsonl")
    require(
        summary.get("status") == "reviewable_commission_not_generation_authorization",
        "wrong commission status",
    )
    counts = summary.get("counts")
    require(isinstance(counts, dict), "commission counts missing")
    require(counts.get("coverage_cells") == len(cells), "coverage-cell count drift")
    expected_instances = sum(
        int(cell.get("target_independent_instances", -1)) for cell in cells
    )
    require(
        counts.get("commissioned_sentence_pair_instances") == expected_instances,
        "commissioned instance count drift",
    )
    require(counts.get("candidate_sentence_pairs") == 0, "commission contains pairs")
    require(summary.get("generation_authorized") is False, "commission changed role")
    cell_ids = [
        require_string(row.get("coverage_cell_id"), "coverage cell ID") for row in cells
    ]
    require(len(cell_ids) == len(set(cell_ids)), "duplicate coverage-cell ID")
    required_fields = set(
        synthetic_contract["coverage_cell_contract"]["required_fields"]
    )
    allowed_reuse = set(
        synthetic_contract["pair_record_contract"]["enumerated_values"][
            "benchmark_reuse_status"
        ]
    )
    for row in cells:
        label = f"coverage cell {row['coverage_cell_id']}"
        require(not (required_fields - set(row)), f"{label} misses required fields")
        for key in (
            "parent_evidence_ids",
            "dictionary_record_ids",
            "grammar_claim_ids",
        ):
            require_string_list(row, key, label)
        require_string(row.get("parent_split"), f"{label}.parent_split")
        require_string(row.get("derivative_split"), f"{label}.derivative_split")
        require(row["parent_split"] == row["derivative_split"], f"{label} split drift")
        require(
            row.get("benchmark_reuse_status") in allowed_reuse,
            f"{label} has invalid benchmark reuse status",
        )
        require(
            isinstance(row.get("target_independent_instances"), int)
            and row["target_independent_instances"] > 0,
            f"{label} has invalid instance target",
        )
    return summary, cells


def verify_generation_contract(
    program_root: Path,
    contract_path: Path,
    renderer_path: Path,
    commission_dir: Path,
    commission_summary: dict[str, Any],
    dictionary: dict[str, Any],
    grammar: dict[str, Any],
    synthetic_contract_path: Path,
) -> dict[str, Any]:
    contract_path = resolve_within(program_root, contract_path, "generation contract")
    contract = read_json(contract_path)
    require(contract.get("immutable") is True, "generation contract must be immutable")
    require(
        contract.get("status") == "authorized_for_candidate_generation",
        "generation contract is not authorized",
    )
    require(contract.get("direction") == "eng-wbv", "wrong generation direction")
    require_string(contract.get("generation_id"), "generation contract ID")
    require_string(contract.get("synthetic_version"), "synthetic version")
    authorization = contract.get("authorization")
    require(isinstance(authorization, dict), "generation authorization missing")
    for field in (
        "census_complete",
        "qualitative_analysis_complete",
        "coverage_cells_frozen",
        "living_books_reviewed",
        "generation_authorized",
    ):
        require(authorization.get(field) is True, f"generation gate closed: {field}")
    bindings = contract.get("bindings")
    require(isinstance(bindings, dict), "generation bindings missing")
    expected_bindings = {
        "commission_summary": commission_dir / "SUMMARY.json",
        "commission_output_checksums": commission_dir / "OUTPUT-SHA256SUMS",
        "dictionary_pointer": dictionary["pointer_path"],
        "dictionary_manifest": dictionary["manifest_path"],
        "grammar_pointer": grammar["pointer_path"],
        "grammar_manifest": grammar["manifest_path"],
        "synthetic_sentence_pair_contract": synthetic_contract_path,
        "renderer": renderer_path,
    }
    for name, path in expected_bindings.items():
        binding = bindings.get(name)
        require(isinstance(binding, dict), f"missing generation binding: {name}")
        bound_path = verify_bound_file(program_root, binding, name)
        require(bound_path == path.resolve(), f"generation binding path drift: {name}")
    require(
        commission_summary.get("bindings", {}).get("dictionary_edition_id")
        == dictionary["manifest"].get("edition_id"),
        "commission/dictionary edition drift",
    )
    require(
        commission_summary.get("bindings", {}).get("grammar_edition_id")
        == grammar["manifest"].get("edition_id"),
        "commission/grammar edition drift",
    )
    require(
        isinstance(contract.get("seed"), int) and contract["seed"] >= 0,
        "generation seed must be a nonnegative integer",
    )
    maximum = contract.get("max_template_share")
    require(
        isinstance(maximum, (int, float)) and 0 < float(maximum) <= 1,
        "max_template_share must be in (0, 1]",
    )
    require_string_list(contract, "authorization_evidence_ids", "generation contract")
    return contract


def verify_synthetic_contract(path: Path) -> dict[str, Any]:
    contract = read_json(path)
    require(contract.get("immutable") is True, "synthetic contract must be immutable")
    require(
        contract.get("goal_binding", {}).get("method_id")
        == "kuku_yalanji_coverage_ledger",
        "synthetic contract lost the Kuku Yalanji method binding",
    )
    require(
        contract.get("goal_binding", {}).get("required_by_active_goal") is True,
        "synthetic sentence pairs are not goal-bound",
    )
    record = contract.get("pair_record_contract")
    require(isinstance(record, dict), "pair-record contract missing")
    require(record.get("additional_fields_allowed") is False, "pair schema is open")
    require_string_list(record, "required_fields", "pair-record contract")
    coverage = contract.get("coverage_cell_contract")
    require(isinstance(coverage, dict), "coverage-cell contract missing")
    require_string_list(coverage, "required_fields", "coverage-cell contract")
    return contract


def validate_realization(
    realization: dict[str, Any], lexeme: dict[str, Any], label: str
) -> None:
    require_string(realization.get("realization_id"), f"{label}.realization_id")
    require_string(realization.get("slot_class"), f"{label}.slot_class")
    require(
        realization["slot_class"] in lexeme["slot_classes"],
        f"{label} uses undeclared slot class",
    )
    features = realization.get("grammatical_features")
    require(isinstance(features, dict), f"{label}.grammatical_features missing")
    source = require_string(
        realization.get("english_surface"), f"{label}.english_surface"
    )
    target = require_string(
        realization.get("target_surface"), f"{label}.target_surface"
    )
    require("{" not in source and "}" not in source, f"{label} source is not explicit")
    require("{" not in target and "}" not in target, f"{label} target is not explicit")
    require(
        realization.get("target_analysis") not in (None, "", {}),
        f"{label} analysis missing",
    )
    require(
        realization.get("surface_origin") in EXPLICIT_SURFACE_ORIGINS,
        f"{label} is not an evidence-licensed explicit form",
    )
    require(
        realization.get("inferred_morphology") is False,
        f"{label} uses inferred morphology",
    )
    require_string_list(realization, "parent_evidence_ids", label)
    require(
        realization.get("acceptance_status") == "accepted_explicit_surface_realization",
        f"{label} is not accepted",
    )
    require(
        realization.get("model_output_is_linguistic_evidence") is False,
        f"{label} model evidence",
    )
    require(
        realization.get("synthetic_output_is_linguistic_evidence") is False,
        f"{label} synthetic evidence",
    )


def load_lexemes(
    program_root: Path, dictionary: dict[str, Any]
) -> tuple[dict[str, dict[str, Any]], dict[str, tuple[dict[str, Any], dict[str, Any]]]]:
    rows = read_component(program_root, dictionary, "syntheticLexemes")
    lexemes: dict[str, dict[str, Any]] = {}
    realizations: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    for index, row in enumerate(rows):
        label = f"synthetic lexeme row {index + 1}"
        lexeme_id = require_string(row.get("synthetic_lexeme_id"), f"{label}.id")
        require(lexeme_id not in lexemes, f"duplicate synthetic lexeme: {lexeme_id}")
        for key in (
            "entry_candidate_id",
            "sense_candidate_id",
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
            require_string(row.get(key), f"{label}.{key}")
        for key in (
            "source_record_ids",
            "slot_classes",
            "parent_evidence_ids",
            "source_cluster_ids",
            "allowed_use",
        ):
            require_string_list(row, key, label)
        require(row["parent_split"] == row["derivative_split"], f"{label} split drift")
        require(
            row.get("acceptance_status")
            == "accepted_for_controlled_sentence_generation",
            f"{label} is not accepted",
        )
        require(row.get("synthetic_eligibility") == "eligible", f"{label} ineligible")
        require(
            row.get("model_output_is_linguistic_evidence") is False,
            f"{label} model evidence",
        )
        require(
            row.get("synthetic_output_is_linguistic_evidence") is False,
            f"{label} synthetic evidence",
        )
        require(
            {"controlled_synthetic_sentence_generation", "model_training"}
            <= set(row["allowed_use"]),
            f"{label} use is not authorized",
        )
        surfaces = row.get("surface_realizations")
        require(isinstance(surfaces, list) and surfaces, f"{label} has no realizations")
        for surface in surfaces:
            require(isinstance(surface, dict), f"{label} has invalid realization")
            validate_realization(surface, row, label)
            realization_id = surface["realization_id"]
            require(
                realization_id not in realizations,
                f"duplicate realization: {realization_id}",
            )
            realizations[realization_id] = (row, surface)
        lexemes[lexeme_id] = row
    require(bool(lexemes), "no accepted synthetic lexemes")
    return lexemes, realizations


def pattern_slots(pattern: str, label: str) -> list[str]:
    require_string(pattern, label)
    names: list[str] = []
    for _, field_name, format_spec, conversion in string.Formatter().parse(pattern):
        if field_name is None:
            continue
        require(
            bool(PLACEHOLDER_RE.fullmatch(field_name)),
            f"invalid placeholder in {label}",
        )
        require(
            not format_spec and conversion is None,
            f"format operators forbidden in {label}",
        )
        names.append(field_name)
    require(bool(names), f"{label} has no placeholders")
    require(len(names) == len(set(names)), f"{label} repeats a placeholder")
    return names


def load_templates(
    program_root: Path,
    grammar: dict[str, Any],
    synthetic_contract: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    rows = read_component(program_root, grammar, "syntheticTemplates")
    templates: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows):
        label = f"synthetic template row {index + 1}"
        template_id = require_string(row.get("template_id"), f"{label}.id")
        require(template_id not in templates, f"duplicate template: {template_id}")
        for key in (
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
            require_string(row.get(key), f"{label}.{key}")
        enumerations = synthetic_contract["pair_record_contract"]["enumerated_values"]
        for key in (
            "source_unit_type",
            "target_unit_type",
            "generation_tier",
            "confidence",
        ):
            require_string(row.get(key), f"{label}.{key}")
            require(
                row[key] in enumerations[key],
                f"{label}.{key} is outside the frozen pair contract",
            )
        for key in (
            "compatible_lexeme_slot_classes",
            "grammar_claim_ids",
            "parent_evidence_ids",
            "source_cluster_ids",
            "allowed_use",
            "fixed_target_evidence_ids",
        ):
            require_string_list(row, key, label)
        require(
            isinstance(row.get("grammatical_features"), dict),
            f"{label} features missing",
        )
        require(
            isinstance(row.get("variety_and_register"), dict),
            f"{label} variety missing",
        )
        require(
            row.get("acceptance_status")
            == "accepted_for_controlled_sentence_generation",
            f"{label} is not accepted",
        )
        require(row.get("synthetic_eligibility") == "eligible", f"{label} ineligible")
        require(
            row.get("model_output_is_linguistic_evidence") is False,
            f"{label} model evidence",
        )
        require(
            row.get("synthetic_output_is_linguistic_evidence") is False,
            f"{label} synthetic evidence",
        )
        require(
            {"controlled_synthetic_sentence_generation", "model_training"}
            <= set(row["allowed_use"]),
            f"{label} use is not authorized",
        )
        source_slots = pattern_slots(
            row.get("source_pattern", ""), f"{label}.source_pattern"
        )
        target_slots = pattern_slots(
            row.get("target_pattern", ""), f"{label}.target_pattern"
        )
        require(
            set(source_slots) == set(target_slots), f"{label} pattern slot mismatch"
        )
        contracts = row.get("slot_contracts")
        require(
            isinstance(contracts, list) and contracts, f"{label} slot contracts missing"
        )
        by_name: dict[str, dict[str, Any]] = {}
        for slot in contracts:
            require(isinstance(slot, dict), f"{label} invalid slot contract")
            name = require_string(slot.get("slot_name"), f"{label}.slot_name")
            require(name not in by_name, f"{label} duplicate slot contract: {name}")
            require_string_list(slot, "allowed_slot_classes", f"{label}.{name}")
            require(
                isinstance(slot.get("required_grammatical_features"), dict),
                f"{label}.{name} feature contract missing",
            )
            require_string_list(
                slot, "distinct_from", f"{label}.{name}", allow_empty=True
            )
            by_name[name] = slot
        require(set(by_name) == set(source_slots), f"{label} slot-contract mismatch")
        bindings = row.get("binding_sets")
        require(
            isinstance(bindings, list) and bindings, f"{label} binding sets missing"
        )
        binding_ids: set[str] = set()
        for binding in bindings:
            require(isinstance(binding, dict), f"{label} invalid binding set")
            binding_id = require_string(
                binding.get("binding_id"), f"{label}.binding_id"
            )
            require(binding_id not in binding_ids, f"{label} duplicate binding ID")
            binding_ids.add(binding_id)
            values = binding.get("bindings")
            require(
                isinstance(values, dict) and set(values) == set(by_name),
                f"{label} incomplete binding",
            )
            require(
                all(isinstance(value, str) and value for value in values.values()),
                f"{label} invalid realization binding",
            )
            require(
                binding.get("semantic_compatibility_status")
                == "accepted_for_this_template",
                f"{label} binding is not reviewed",
            )
            require_string_list(binding, "parent_evidence_ids", f"{label}.{binding_id}")
            require_string_list(binding, "source_cluster_ids", f"{label}.{binding_id}")
            require(
                binding.get("model_output_is_linguistic_evidence") is False,
                f"{label} binding model evidence",
            )
            require(
                binding.get("synthetic_output_is_linguistic_evidence") is False,
                f"{label} binding synthetic evidence",
            )
        templates[template_id] = row
    require(bool(templates), "no accepted productive templates")
    return templates


def features_satisfy(actual: dict[str, Any], required: dict[str, Any]) -> bool:
    return all(actual.get(key) == value for key, value in required.items())


def validate_binding(
    template: dict[str, Any],
    binding: dict[str, Any],
    realizations: dict[str, tuple[dict[str, Any], dict[str, Any]]],
) -> dict[str, tuple[dict[str, Any], dict[str, Any]]]:
    contracts = {row["slot_name"]: row for row in template["slot_contracts"]}
    resolved: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    for name, realization_id in binding["bindings"].items():
        require(
            realization_id in realizations, f"unknown realization: {realization_id}"
        )
        lexeme, realization = realizations[realization_id]
        contract = contracts[name]
        require(
            realization["slot_class"] in contract["allowed_slot_classes"],
            f"realization {realization_id} violates slot class for {name}",
        )
        require(
            features_satisfy(
                realization["grammatical_features"],
                contract["required_grammatical_features"],
            ),
            f"realization {realization_id} violates features for {name}",
        )
        resolved[name] = (lexeme, realization)
    for name, contract in contracts.items():
        for other in contract["distinct_from"]:
            require(other in resolved, f"unknown distinct slot: {other}")
            require(
                resolved[name][0]["synthetic_lexeme_id"]
                != resolved[other][0]["synthetic_lexeme_id"],
                f"binding violates distinct lexeme rule: {name}/{other}",
            )
    return resolved


def render_pattern(pattern: str, values: dict[str, str]) -> str:
    rendered = pattern.format_map(values)
    require(
        rendered == rendered.strip() and rendered, "rendered text is blank or padded"
    )
    require("{" not in rendered and "}" not in rendered, "unresolved placeholder")
    require("  " not in rendered, "rendered text has repeated spaces")
    return rendered


def pair_record(
    *,
    cell: dict[str, Any],
    template: dict[str, Any],
    binding: dict[str, Any],
    resolved: dict[str, tuple[dict[str, Any], dict[str, Any]]],
    dictionary: dict[str, Any],
    grammar: dict[str, Any],
    generation_contract: dict[str, Any],
    created_at_utc: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    english_values = {
        name: realization["english_surface"]
        for name, (_, realization) in resolved.items()
    }
    target_values = {
        name: realization["target_surface"]
        for name, (_, realization) in resolved.items()
    }
    english = render_pattern(template["source_pattern"], english_values)
    target = render_pattern(template["target_pattern"], target_values)
    target_analysis = {
        "template_id": template["template_id"],
        "binding_set_id": binding["binding_id"],
        "slot_realizations": {
            name: {
                "synthetic_lexeme_id": lexeme["synthetic_lexeme_id"],
                "realization_id": realization["realization_id"],
                "analysis": realization["target_analysis"],
            }
            for name, (lexeme, realization) in sorted(resolved.items())
        },
    }
    instruction = {
        "coverage_cell_id": cell["coverage_cell_id"],
        "template_id": template["template_id"],
        "binding_set_id": binding["binding_id"],
        "source_pattern": template["source_pattern"],
        "target_pattern": template["target_pattern"],
        "english_values": english_values,
        "target_values": target_values,
    }
    rendered_output = {
        "english_source": english,
        "wajarri_target": target,
        "target_analysis": target_analysis,
    }
    prompt_hash = canonical_sha256(instruction)
    output_hash = canonical_sha256(rendered_output)
    identity = {
        "synthetic_version": generation_contract["synthetic_version"],
        "coverage_cell_id": cell["coverage_cell_id"],
        "template_id": template["template_id"],
        "binding_set_id": binding["binding_id"],
        "english_source": english,
        "wajarri_target": target,
    }
    lexemes = [value[0] for value in resolved.values()]
    realizations = [value[1] for value in resolved.values()]
    rights = {template["rights_status"], *(row["rights_status"] for row in lexemes)}
    require(len(rights) == 1, "binding mixes rights statuses")
    allowed_use = set(template["allowed_use"])
    for lexeme in lexemes:
        allowed_use &= set(lexeme["allowed_use"])
    require(
        {"controlled_synthetic_sentence_generation", "model_training"} <= allowed_use,
        "binding lacks generation or training permission",
    )
    parent_evidence = sorted(
        set(cell["parent_evidence_ids"])
        | set(template["parent_evidence_ids"])
        | set(template["fixed_target_evidence_ids"])
        | set(binding["parent_evidence_ids"])
        | {item for row in lexemes for item in row["parent_evidence_ids"]}
        | {item for row in realizations for item in row["parent_evidence_ids"]}
    )
    dictionary_ids = sorted(
        set(cell["dictionary_record_ids"])
        | {
            item
            for row in lexemes
            for item in (
                row["entry_candidate_id"],
                row["sense_candidate_id"],
                row["form_candidate_id"],
            )
        }
    )
    source_clusters = sorted(
        set(template["source_cluster_ids"])
        | set(binding["source_cluster_ids"])
        | {item for row in lexemes for item in row["source_cluster_ids"]}
    )
    base_ids = sorted({row["synthetic_lexeme_id"] for row in lexemes})
    varieties = {row["variety"] for row in lexemes}
    orthographies = {row["orthography"] for row in lexemes}
    require(len(varieties) == 1, "binding mixes varieties")
    require(len(orthographies) == 1, "binding mixes orthographies")
    split = cell["derivative_split"]
    require(split == cell["parent_split"], "coverage cell split drift")
    require(split != "final-test", "synthetic final-test rows are forbidden")
    reuse = cell["benchmark_reuse_status"]
    require(
        reuse != "final_test_analysis_only", "final-test-derived generation forbidden"
    )
    record = {
        "pair_id": f"wbv-synthetic-pair:{canonical_sha256(identity)[:24]}",
        "synthetic_version": generation_contract["synthetic_version"],
        "split": split,
        "parent_split": cell["parent_split"],
        "direction": "eng-wbv",
        "source_lang": "eng_Latn",
        "target_lang": "wbv_Latn",
        "task": "translate",
        "source_unit_type": template["source_unit_type"],
        "target_unit_type": template["target_unit_type"],
        "english_source": english,
        "wajarri_target": target,
        "input_text": f"<translate> {english}",
        "output_text": target,
        "target_analysis": target_analysis,
        "pair_kind": "synthetic_candidate",
        "generation_tier": template["generation_tier"],
        "synthetic_method": "reviewed_explicit_form_template_rendering",
        "template_id": template["template_id"],
        "confidence": template["confidence"],
        "coverage_cell_ids": [cell["coverage_cell_id"]],
        "parent_evidence_ids": parent_evidence,
        "dictionary_record_ids": dictionary_ids,
        "grammar_claim_ids": sorted(
            set(cell["grammar_claim_ids"]) | set(template["grammar_claim_ids"])
        ),
        "dictionary_edition_id": dictionary["manifest"]["edition_id"],
        "grammar_edition_id": grammar["manifest"]["edition_id"],
        "base_lexeme_ids": base_ids,
        "construction_family": template["construction_family"],
        "grammatical_features": template["grammatical_features"],
        "variety": next(iter(varieties)),
        "orthography": next(iter(orthographies)),
        "source_cluster_ids": source_clusters,
        "generator_model_and_version": RENDERER_ID,
        "generator_seed": generation_contract["seed"],
        "prompt_sha256": prompt_hash,
        "raw_output_sha256": output_hash,
        "generated_at_utc": created_at_utc,
        "selection_reason": (
            "Explicit reviewed binding selected for measured coverage cell "
            + cell["coverage_cell_id"]
        ),
        "review_status": "generated_unreviewed",
        "review_evidence_ids": [],
        "rights_status": next(iter(rights)),
        "allowed_use": sorted(allowed_use),
        "approved_for_training": False,
        "lexical_audit": {
            "status": "pass",
            "explicit_realization_ids": sorted(
                row["realization_id"] for row in realizations
            ),
            "inferred_morphology": False,
        },
        "grammar_audit": {
            "status": "pass",
            "template_id": template["template_id"],
            "binding_set_id": binding["binding_id"],
            "reviewed_binding": True,
        },
        "tokenization_audit": {
            "status": "pending",
            "reason": "candidate generation precedes frozen tokenizer audit",
        },
        "degeneration_audit": {
            "status": "pass",
            "blank": False,
            "unresolved_placeholder": False,
        },
        "leakage_audit": {
            "status": "pass",
            "parent_split_preserved": True,
            "final_test_derivative": False,
            "benchmark_reuse_status": reuse,
        },
        "benchmark_reuse_status": reuse,
        "notes": [
            "Synthetic candidate, not attested reference gold.",
            "Training remains false until all post-generation audits and review pass.",
            "Model and synthetic output are not linguistic evidence.",
        ],
    }
    trace = {
        "pair_id": record["pair_id"],
        "instruction": instruction,
        "instruction_canonical_sha256": prompt_hash,
        "rendered_output": rendered_output,
        "rendered_output_canonical_sha256": output_hash,
    }
    return record, trace


def validate_pair_contract(
    contract: dict[str, Any], rows: list[dict[str, Any]]
) -> None:
    pair_contract = contract["pair_record_contract"]
    required = set(pair_contract["required_fields"])
    constants = pair_contract.get("constant_values", {})
    enumerations = pair_contract.get("enumerated_values", {})
    for row in rows:
        require(set(row) == required, f"pair field set differs: {row.get('pair_id')}")
        for key, value in constants.items():
            require(row[key] == value, f"pair constant differs: {key}")
        for key, allowed in enumerations.items():
            require(row[key] in allowed, f"pair enumeration differs: {key}")
        require(
            row["input_text"] == f"<translate> {row['english_source']}", "input drift"
        )
        require(row["output_text"] == row["wajarri_target"], "output drift")
        require(row["split"] == row["parent_split"], "pair split drift")
        require(row["approved_for_training"] is False, "generated pair auto-approved")
        for key in (
            "coverage_cell_ids",
            "parent_evidence_ids",
            "dictionary_record_ids",
            "grammar_claim_ids",
            "base_lexeme_ids",
            "source_cluster_ids",
        ):
            require_string_list(row, key, f"pair {row['pair_id']}")
        require_sha256(row["prompt_sha256"], "invalid prompt hash")
        require_sha256(row["raw_output_sha256"], "invalid output hash")


def generate_pairs(
    *,
    program_root: Path,
    commission_dir: Path,
    dictionary_current_path: Path,
    grammar_current_path: Path,
    synthetic_contract_path: Path,
    generation_contract_path: Path,
    renderer_path: Path,
    created_at_utc: str,
) -> dict[str, Any]:
    program_root = program_root.resolve()
    require(
        created_at_utc.endswith("Z"), "created-at timestamp must use canonical UTC Z"
    )
    created_at = datetime.fromisoformat(created_at_utc.replace("Z", "+00:00"))
    require(
        created_at.tzinfo is not None
        and created_at.utcoffset() is not None
        and created_at.utcoffset().total_seconds() == 0,
        "created-at timestamp must be UTC",
    )
    commission_dir = resolve_within(
        program_root, commission_dir, "commission directory"
    )
    renderer_path = resolve_within(program_root, renderer_path, "renderer")
    synthetic_contract_path = resolve_within(
        program_root, synthetic_contract_path, "synthetic contract"
    )
    synthetic_contract = verify_synthetic_contract(synthetic_contract_path)
    commission_summary, cells = verify_commission(
        program_root, commission_dir, synthetic_contract
    )
    dictionary = load_current_edition(
        program_root, dictionary_current_path, "dictionary"
    )
    grammar = load_current_edition(program_root, grammar_current_path, "grammar")
    generation_contract = verify_generation_contract(
        program_root,
        generation_contract_path,
        renderer_path,
        commission_dir,
        commission_summary,
        dictionary,
        grammar,
        synthetic_contract_path,
    )
    require(bool(cells), "commission has no coverage cells")
    expected_cells = generation_contract.get("coverage_cell_ids")
    require(
        isinstance(expected_cells, list) and expected_cells,
        "generation cell set missing",
    )
    actual_cell_ids = sorted(row["coverage_cell_id"] for row in cells)
    require(
        sorted(expected_cells) == actual_cell_ids, "generation coverage-cell set drift"
    )
    lexemes, realizations = load_lexemes(program_root, dictionary)
    templates = load_templates(program_root, grammar, synthetic_contract)
    output_rows: list[dict[str, Any]] = []
    traces: list[dict[str, Any]] = []
    pair_surfaces: set[tuple[str, str]] = set()
    used_binding_keys: set[tuple[str, str]] = set()
    for cell in sorted(cells, key=lambda row: row["coverage_cell_id"]):
        lexeme_id = require_string(cell.get("synthetic_lexeme_id"), "cell lexeme ID")
        template_id = require_string(cell.get("template_id"), "cell template ID")
        require(lexeme_id in lexemes, f"cell references unknown lexeme: {lexeme_id}")
        require(
            template_id in templates, f"cell references unknown template: {template_id}"
        )
        lexeme = lexemes[lexeme_id]
        template = templates[template_id]
        template_fields = (
            "task_id",
            "construction_family",
            "grammatical_features",
            "predicate_and_valency_frame",
            "participant_configuration",
            "polarity_tam_and_mood",
            "sentence_length_and_clause_depth",
            "variety_and_register",
            "required_evidence_class",
            "acceptance_test",
        )
        for key in template_fields:
            require(
                cell.get(key) == template[key],
                f"cell/template {key} drift: {cell['coverage_cell_id']}",
            )
        expected_family = {
            "synthetic_lexeme_id": lexeme["synthetic_lexeme_id"],
            "english_lemma": lexeme["english_lemma"],
            "target_lemma": lexeme["target_lemma"],
            "part_of_speech": lexeme["part_of_speech"],
            "morphology_class_id": lexeme["morphology_class_id"],
            "slot_classes": lexeme["slot_classes"],
        }
        require(
            cell.get("lexeme_and_sense_family") == expected_family,
            f"cell/lexeme family drift: {cell['coverage_cell_id']}",
        )
        require(
            cell["parent_split"] == lexeme["parent_split"]
            and cell["derivative_split"] == lexeme["derivative_split"],
            f"cell/lexeme split drift: {cell['coverage_cell_id']}",
        )
        expected_dictionary_ids = {
            lexeme["entry_candidate_id"],
            lexeme["sense_candidate_id"],
            lexeme["form_candidate_id"],
        }
        require(
            set(cell["dictionary_record_ids"]) == expected_dictionary_ids,
            f"cell/lexeme dictionary lineage drift: {cell['coverage_cell_id']}",
        )
        require(
            set(cell["grammar_claim_ids"]) == set(template["grammar_claim_ids"]),
            f"cell/template grammar lineage drift: {cell['coverage_cell_id']}",
        )
        require(
            bool(
                set(lexeme["slot_classes"])
                & set(template["compatible_lexeme_slot_classes"])
            ),
            f"cell lexeme is incompatible with template: {cell['coverage_cell_id']}",
        )
        requested = cell.get("target_independent_instances")
        require(isinstance(requested, int) and requested > 0, "invalid instance target")
        candidates: list[
            tuple[str, dict[str, Any], dict[str, tuple[dict[str, Any], dict[str, Any]]]]
        ] = []
        for binding in template["binding_sets"]:
            resolved = validate_binding(template, binding, realizations)
            bound_ids = {row[0]["synthetic_lexeme_id"] for row in resolved.values()}
            if lexeme_id not in bound_ids:
                continue
            rank = canonical_sha256(
                {
                    "seed": generation_contract["seed"],
                    "coverage_cell_id": cell["coverage_cell_id"],
                    "binding_id": binding["binding_id"],
                }
            )
            candidates.append((rank, binding, resolved))
        candidates.sort(key=lambda row: (row[0], row[1]["binding_id"]))
        require(
            len(candidates) >= requested,
            f"insufficient reviewed bindings for {cell['coverage_cell_id']}",
        )
        emitted = 0
        for _, binding, resolved in candidates:
            binding_key = (template_id, binding["binding_id"])
            if binding_key in used_binding_keys:
                continue
            record, trace = pair_record(
                cell=cell,
                template=template,
                binding=binding,
                resolved=resolved,
                dictionary=dictionary,
                grammar=grammar,
                generation_contract=generation_contract,
                created_at_utc=created_at_utc,
            )
            surface_key = (record["english_source"], record["wajarri_target"])
            require(surface_key not in pair_surfaces, "duplicate bilingual pair")
            pair_surfaces.add(surface_key)
            used_binding_keys.add(binding_key)
            output_rows.append(record)
            traces.append(trace)
            emitted += 1
            if emitted == requested:
                break
        require(
            emitted == requested,
            f"could not satisfy independent instance target for {cell['coverage_cell_id']}",
        )
    output_rows.sort(key=lambda row: row["pair_id"])
    traces.sort(key=lambda row: row["pair_id"])
    pair_ids = [row["pair_id"] for row in output_rows]
    require(len(pair_ids) == len(set(pair_ids)), "duplicate pair ID")
    validate_pair_contract(synthetic_contract, output_rows)
    template_counts = Counter(row["template_id"] for row in output_rows)
    largest_share = max(template_counts.values()) / len(output_rows)
    require(
        largest_share <= float(generation_contract["max_template_share"]),
        "template concentration exceeds generation contract",
    )
    maximum_pairs = generation_contract.get("max_candidate_pairs")
    require(
        isinstance(maximum_pairs, int) and maximum_pairs > 0,
        "max_candidate_pairs must be positive",
    )
    require(len(output_rows) <= maximum_pairs, "candidate-pair ceiling exceeded")
    summary = {
        "schema_version": 1,
        "generation_id": generation_contract["generation_id"],
        "synthetic_version": generation_contract["synthetic_version"],
        "created_at_utc": created_at_utc,
        "status": "generated_candidates_pending_review_and_post_generation_audits",
        "renderer": RENDERER_ID,
        "bindings": {
            "generation_contract_sha256": sha256(
                resolve_within(
                    program_root, generation_contract_path, "generation contract"
                )
            ),
            "commission_summary_sha256": sha256(commission_dir / "SUMMARY.json"),
            "commission_output_checksums_sha256": sha256(
                commission_dir / "OUTPUT-SHA256SUMS"
            ),
            "synthetic_sentence_pair_contract_sha256": sha256(synthetic_contract_path),
            "dictionary_edition_id": dictionary["manifest"]["edition_id"],
            "dictionary_manifest_sha256": dictionary["manifest_sha256"],
            "grammar_edition_id": grammar["manifest"]["edition_id"],
            "grammar_manifest_sha256": grammar["manifest_sha256"],
            "renderer_sha256": sha256(renderer_path),
        },
        "counts": {
            "coverage_cells": len(cells),
            "candidate_sentence_pairs": len(output_rows),
            "reviewed_sentence_pairs": 0,
            "training_eligible_sentence_pairs": 0,
            "unique_bilingual_pairs": len(pair_surfaces),
            "templates": len(template_counts),
            "base_lexemes": len(
                {item for row in output_rows for item in row["base_lexeme_ids"]}
            ),
        },
        "template_counts": dict(sorted(template_counts.items())),
        "largest_template_share": largest_share,
        "max_template_share": float(generation_contract["max_template_share"]),
        "generation_authorized": True,
        "training_authorized": False,
        "release_authorized": False,
        "claim_limit": (
            "These are deterministic, explicitly realized synthetic candidates. "
            "They are not attested reference gold, linguistic evidence, training-ready "
            "rows, or evidence of Wajarri translation capability."
        ),
    }
    audit = {
        "schema_version": 1,
        "generation_id": generation_contract["generation_id"],
        "status": "automatic_generation_checks_passed_pending_external_audits",
        "checks": {
            "explicit_surface_realizations_only": True,
            "reviewed_binding_sets_only": True,
            "inferred_morphology": False,
            "split_inheritance": True,
            "final_test_derivatives": 0,
            "duplicate_pair_ids": 0,
            "duplicate_bilingual_pairs": 0,
            "template_concentration_pass": True,
            "auto_approved_training_rows": 0,
            "model_output_used_as_linguistic_evidence": False,
            "synthetic_output_used_as_linguistic_evidence": False,
        },
        "pending": [
            "frozen tokenizer audit",
            "degeneration suite",
            "benchmark leakage reconciliation",
            "qualified linguistic review",
            "post-generation living-book checkpoint",
        ],
    }
    return {"summary": summary, "pairs": output_rows, "traces": traces, "audit": audit}


def write_json_atomic(path: Path, value: Any) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    temporary.replace(path)


def write_generation(output_dir: Path, result: dict[str, Any]) -> None:
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "SUMMARY.json", result["summary"])
    write_jsonl_atomic(output_dir / "CANDIDATE-PAIRS.eng-wbv.jsonl", result["pairs"])
    write_jsonl_atomic(output_dir / "RENDER-TRACE.jsonl", result["traces"])
    write_json_atomic(output_dir / "AUTOMATIC-AUDIT.json", result["audit"])
    outputs = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "OUTPUT-SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in outputs),
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--commission-dir", type=Path, required=True)
    parser.add_argument("--dictionary-current", type=Path, required=True)
    parser.add_argument("--grammar-current", type=Path, required=True)
    parser.add_argument("--synthetic-contract", type=Path, required=True)
    parser.add_argument("--generation-contract", type=Path, required=True)
    parser.add_argument("--renderer", type=Path, default=Path(__file__).resolve())
    parser.add_argument("--created-at-utc", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    result = generate_pairs(
        program_root=program_root,
        commission_dir=args.commission_dir,
        dictionary_current_path=args.dictionary_current,
        grammar_current_path=args.grammar_current,
        synthetic_contract_path=args.synthetic_contract,
        generation_contract_path=args.generation_contract,
        renderer_path=args.renderer,
        created_at_utc=args.created_at_utc,
    )
    output_dir = resolve_within(program_root, args.output_dir, "output directory")
    write_generation(output_dir, result)
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

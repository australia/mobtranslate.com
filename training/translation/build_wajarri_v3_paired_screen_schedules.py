#!/usr/bin/env python3
"""Build token-accounted paired schedules for the narrow Wajarri v3 screen."""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import os
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

try:
    from training.translation.build_wajarri_v3_composition_intervention import (
        canonical_json,
        load_json,
        load_jsonl,
        normalize_surface,
        sha256_file,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_composition_intervention import (
        canonical_json,
        load_json,
        load_jsonl,
        normalize_surface,
        sha256_file,
    )


METHOD_ID_PREFIX = "wajarri-v3-paired-screen-schedules-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


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


def resolve_under(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as error:
        raise ValueError(f"path escapes program root: {path}") from error
    return path


def resolve_rows(
    program_root: Path, binding: dict[str, Any]
) -> tuple[Path, list[dict[str, Any]]]:
    path = resolve_under(program_root, binding["path"])
    if sha256_file(path) != binding["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(
            f"row-count mismatch for {path}: expected {binding['rows']}, got {len(rows)}"
        )
    return path, rows


def merge_contract_values(base: Any, override: Any) -> Any:
    if isinstance(base, dict) and isinstance(override, dict):
        keys = set(base) | set(override)
        return {
            key: (
                merge_contract_values(base[key], override[key])
                if key in base and key in override
                else override[key]
                if key in override
                else base[key]
            )
            for key in keys
        }
    return override


def resolve_contract(
    program_root: Path, raw_contract: dict[str, Any]
) -> dict[str, Any]:
    binding = raw_contract.get("base_contract")
    if binding is None:
        return raw_contract
    base_path = resolve_under(program_root, binding["path"])
    if sha256_file(base_path) != binding["sha256"]:
        raise ValueError("base contract SHA-256 mismatch")
    base = resolve_contract(program_root, load_json(base_path))
    override = {key: value for key, value in raw_contract.items() if key != "base_contract"}
    return merge_contract_values(base, override)


def validate_bound_directory(
    program_root: Path, binding: dict[str, Any]
) -> Path:
    directory = resolve_under(program_root, binding["path"])
    if not directory.is_dir():
        raise ValueError(f"missing bound directory: {directory}")
    for name, expected in sorted(binding["files"].items()):
        path = directory / name
        if not path.is_file():
            raise ValueError(f"missing bound file: {path}")
        actual = sha256_file(path)
        if actual != expected:
            raise ValueError(
                f"bound file SHA-256 mismatch for {path}: {actual} != {expected}"
            )
    return directory


def nested_subject_id(row: dict[str, Any]) -> str | None:
    return (
        row.get("target_analysis", {})
        .get("slot_realizations", {})
        .get("subject", {})
        .get("realization_id")
    )


def nested_predicate_id(row: dict[str, Any]) -> str | None:
    return (
        row.get("target_analysis", {})
        .get("slot_realizations", {})
        .get("predicate", {})
        .get("realization_id")
    )


def row_identifier(row: dict[str, Any]) -> str:
    for key in ("id", "cell_id", "pair_id"):
        value = row.get(key)
        if isinstance(value, str) and value:
            return value
    raise ValueError("row has no stable identifier")


def compatibility_corpus_id(review: dict[str, Any]) -> str:
    prefix = "wbv-v2-compatibility:"
    review_id = str(review["review_id"])
    if not review_id.startswith(prefix):
        raise ValueError(f"unexpected compatibility review ID: {review_id}")
    return "wbv-v2-synthetic:" + review_id.removeprefix(prefix)


def reviewed_legacy_ids(
    sentence_reviews: list[dict[str, Any]],
    compatibility_reviews: list[dict[str, Any]],
) -> set[str]:
    sentence_ids = {
        row["id"]
        for row in sentence_reviews
        if row.get("automatic_structure_checks") == "pass"
        and row.get("source_bound") is True
        and row.get("training_eligible_for_research") is True
        and row.get("split") == "train"
    }
    compatibility_ids = {
        compatibility_corpus_id(row)
        for row in compatibility_reviews
        if row.get("decision") == "include_research_synthetic"
    }
    return sentence_ids & compatibility_ids


def token_length(tokenizer: Any, text: str, *, target: bool) -> int:
    if target:
        encoded = tokenizer(text_target=text, add_special_tokens=True, truncation=False)
    else:
        encoded = tokenizer(text, add_special_tokens=True, truncation=False)
    ids = encoded["input_ids"]
    if ids and isinstance(ids[0], list):
        ids = ids[0]
    return len(ids)


def annotate_tokens(row: dict[str, Any], tokenizer: Any) -> dict[str, Any]:
    result = dict(row)
    source_tokens = token_length(tokenizer, row["input_text"], target=False)
    target_tokens = token_length(tokenizer, row["output_text"], target=True)
    result["token_accounting"] = {
        "source_tokens_with_specials": source_tokens,
        "target_tokens_with_specials": target_tokens,
        "non_padding_tokens_with_specials": source_tokens + target_tokens,
    }
    return result


def pair_cost(treatment: dict[str, Any], control: dict[str, Any]) -> tuple[int, int, int]:
    treatment_tokens = treatment["token_accounting"]
    control_tokens = control["token_accounting"]
    source_difference = abs(
        treatment_tokens["source_tokens_with_specials"]
        - control_tokens["source_tokens_with_specials"]
    )
    target_difference = abs(
        treatment_tokens["target_tokens_with_specials"]
        - control_tokens["target_tokens_with_specials"]
    )
    total_difference = abs(
        treatment_tokens["non_padding_tokens_with_specials"]
        - control_tokens["non_padding_tokens_with_specials"]
    )
    return source_difference + target_difference + total_difference, source_difference, target_difference


def minimum_cost_assignment(costs: list[list[int]]) -> list[int]:
    """Return one distinct column per row using a rectangular Hungarian assignment."""
    if not costs or not costs[0]:
        raise ValueError("assignment cost matrix cannot be empty")
    row_count = len(costs)
    column_count = len(costs[0])
    if any(len(row) != column_count for row in costs):
        raise ValueError("assignment cost matrix is ragged")
    if row_count > column_count:
        raise ValueError("assignment requires at least as many columns as rows")

    u = [0] * (row_count + 1)
    v = [0] * (column_count + 1)
    p = [0] * (column_count + 1)
    way = [0] * (column_count + 1)
    for i in range(1, row_count + 1):
        p[0] = i
        min_values = [10**30] * (column_count + 1)
        used = [False] * (column_count + 1)
        j0 = 0
        while True:
            used[j0] = True
            i0 = p[j0]
            delta = 10**30
            j1 = 0
            for j in range(1, column_count + 1):
                if used[j]:
                    continue
                current = costs[i0 - 1][j - 1] - u[i0] - v[j]
                if current < min_values[j]:
                    min_values[j] = current
                    way[j] = j0
                if min_values[j] < delta:
                    delta = min_values[j]
                    j1 = j
            for j in range(column_count + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    min_values[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    assignment = [-1] * row_count
    for j in range(1, column_count + 1):
        if p[j] != 0:
            assignment[p[j] - 1] = j - 1
    if any(index < 0 for index in assignment):
        raise ValueError("assignment algorithm left an unmatched row")
    return assignment


def eligible_control_rows(
    controlled_rows: list[dict[str, Any]],
    *,
    allowed_splits: set[str],
    externally_reviewed_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    externally_reviewed_ids = externally_reviewed_ids or set()
    normalized_outputs: dict[str, set[str]] = defaultdict(set)
    for row in controlled_rows:
        normalized_outputs[normalize_surface(row["input_text"])].add(
            normalize_surface(row["output_text"])
        )
    eligible = []
    for row in controlled_rows:
        if row.get("task") != "translate" or row.get("split") not in allowed_splits:
            continue
        inline_pass = (
            row.get("grammar_audit", {}).get("status") == "pass"
            and row.get("lexical_audit", {}).get("status") == "pass"
        )
        if not inline_pass and row.get("id") not in externally_reviewed_ids:
            continue
        if len(normalized_outputs[normalize_surface(row["input_text"])]) != 1:
            continue
        eligible.append(row)
    return eligible


def build_match(
    treatment: dict[str, Any], control: dict[str, Any], pair_slot_id: str
) -> dict[str, Any]:
    cost, source_difference, target_difference = pair_cost(treatment, control)
    return {
        "schema_version": 1,
        "pair_slot_id": pair_slot_id,
        "subject_realization_id": treatment["subject_realization_id"],
        "treatment_id": treatment["id"],
        "treatment_predicate_realization_id": treatment[
            "predicate_realization_id"
        ],
        "treatment_input_text": treatment["input_text"],
        "treatment_output_text": treatment["output_text"],
        "treatment_pair_kind": treatment["pair_kind"],
        "treatment_token_accounting": treatment["token_accounting"],
        "control_id": control["id"],
        "control_subject_realization_id": nested_subject_id(control),
        "control_predicate_realization_id": nested_predicate_id(control)
        or "legacy_external_review_binding",
        "control_input_text": control["input_text"],
        "control_output_text": control["output_text"],
        "control_pair_kind": control["pair_kind"],
        "control_original_split": control["split"],
        "control_token_accounting": control["token_accounting"],
        "pair_cost": cost,
        "absolute_source_token_difference": source_difference,
        "absolute_target_token_difference": target_difference,
    }


def select_global_token_matches(
    treatment_rows: list[dict[str, Any]],
    controlled_rows: list[dict[str, Any]],
    excluded_inputs: set[str],
    externally_reviewed_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    treatments = sorted(
        treatment_rows,
        key=lambda row: (
            row["subject_realization_id"],
            row["predicate_realization_id"],
            row["id"],
        ),
    )
    candidates = sorted(
        (
            row
            for row in eligible_control_rows(
                controlled_rows,
                allowed_splits={"train"},
                externally_reviewed_ids=externally_reviewed_ids,
            )
            if normalize_surface(row["input_text"]) not in excluded_inputs
        ),
        key=lambda row: row["id"],
    )
    if len(candidates) < len(treatments):
        raise ValueError("not enough training-split controls for global token matching")

    costs: list[list[int]] = []
    for treatment in treatments:
        cost_row = []
        for rank, control in enumerate(candidates):
            combined, source_difference, target_difference = pair_cost(
                treatment, control
            )
            cost_row.append(
                combined * 1_000_000
                + source_difference * 10_000
                + target_difference * 100
                + rank
            )
        costs.append(cost_row)
    assignment = minimum_cost_assignment(costs)
    return [
        build_match(
            treatment,
            candidates[candidate_index],
            f"wbv-v3-screen-slot:global:{index:02d}",
        )
        for index, (treatment, candidate_index) in enumerate(
            zip(treatments, assignment), start=1
        )
    ]


def select_aggregate_token_matches(
    treatment_rows: list[dict[str, Any]],
    controlled_rows: list[dict[str, Any]],
    excluded_inputs: set[str],
    *,
    maximum_overshoot_tokens: int,
    externally_reviewed_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    treatments = sorted(
        treatment_rows,
        key=lambda row: (
            row["subject_realization_id"],
            row["predicate_realization_id"],
            row["id"],
        ),
    )
    candidates = sorted(
        (
            row
            for row in eligible_control_rows(
                controlled_rows,
                allowed_splits={"train"},
                externally_reviewed_ids=externally_reviewed_ids,
            )
            if normalize_surface(row["input_text"]) not in excluded_inputs
        ),
        key=lambda row: row["id"],
    )
    required_count = len(treatments)
    if len(candidates) < required_count:
        raise ValueError("not enough training-split controls for aggregate matching")

    target_source = sum(
        row["token_accounting"]["source_tokens_with_specials"] for row in treatments
    )
    target_target = sum(
        row["token_accounting"]["target_tokens_with_specials"] for row in treatments
    )
    groups: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for row in candidates:
        accounting = row["token_accounting"]
        groups[
            (
                accounting["source_tokens_with_specials"],
                accounting["target_tokens_with_specials"],
            )
        ].append(row)

    # State: (selected count, source tokens, target tokens) ->
    # (shape-distance cost, tuple[(source length, target length, count), ...]).
    states: dict[
        tuple[int, int, int], tuple[int, tuple[tuple[int, int, int], ...]]
    ] = {(0, 0, 0): (0, ())}
    for (source_length, target_length), rows in sorted(groups.items()):
        capacity = min(len(rows), required_count)
        local_cost = min(
            pair_cost(
                treatment,
                {
                    "token_accounting": {
                        "source_tokens_with_specials": source_length,
                        "target_tokens_with_specials": target_length,
                        "non_padding_tokens_with_specials": source_length
                        + target_length,
                    }
                },
            )[0]
            for treatment in treatments
        )
        next_states = dict(states)
        for (count, source_sum, target_sum), (cost, path) in states.items():
            for quantity in range(1, min(capacity, required_count - count) + 1):
                new_source = source_sum + quantity * source_length
                new_target = target_sum + quantity * target_length
                if new_source > target_source + maximum_overshoot_tokens:
                    break
                if new_target > target_target + maximum_overshoot_tokens:
                    continue
                key = (count + quantity, new_source, new_target)
                value = (
                    cost + quantity * local_cost,
                    path + ((source_length, target_length, quantity),),
                )
                if key not in next_states or value < next_states[key]:
                    next_states[key] = value
        states = next_states

    completed = [
        (key, value) for key, value in states.items() if key[0] == required_count
    ]
    if not completed:
        raise ValueError("aggregate token matcher found no complete control subset")
    (count, selected_source, selected_target), (_, selected_path) = min(
        completed,
        key=lambda item: (
            abs(item[0][1] - target_source) + abs(item[0][2] - target_target),
            abs(
                (item[0][1] + item[0][2])
                - (target_source + target_target)
            ),
            item[1],
        ),
    )
    assert count == required_count
    selected_controls = []
    for source_length, target_length, quantity in selected_path:
        selected_controls.extend(groups[(source_length, target_length)][:quantity])
    if len({row["id"] for row in selected_controls}) != required_count:
        raise ValueError("aggregate token matcher did not select distinct controls")

    pair_matrix = []
    for treatment in treatments:
        pair_matrix.append(
            [
                pair_cost(treatment, control)[0] * 10_000 + rank
                for rank, control in enumerate(selected_controls)
            ]
        )
    assignment = minimum_cost_assignment(pair_matrix)
    matches = [
        build_match(
            treatment,
            selected_controls[candidate_index],
            f"wbv-v3-screen-slot:aggregate:{index:02d}",
        )
        for index, (treatment, candidate_index) in enumerate(
            zip(treatments, assignment), start=1
        )
    ]
    selected_totals = (
        sum(
            row["control_token_accounting"]["source_tokens_with_specials"]
            for row in matches
        ),
        sum(
            row["control_token_accounting"]["target_tokens_with_specials"]
            for row in matches
        ),
    )
    if selected_totals != (selected_source, selected_target):
        raise ValueError("aggregate token accounting drifted during row assignment")
    return matches


def select_control_matches(
    treatment_rows: list[dict[str, Any]],
    controlled_rows: list[dict[str, Any]],
    subject_ids: list[str],
) -> list[dict[str, Any]]:
    treatments: dict[str, list[dict[str, Any]]] = defaultdict(list)
    controls: dict[str, list[dict[str, Any]]] = defaultdict(list)
    expected_subjects = set(subject_ids)

    for row in treatment_rows:
        subject_id = row.get("subject_realization_id")
        if subject_id in expected_subjects:
            treatments[subject_id].append(row)

    for row in eligible_control_rows(
        controlled_rows, allowed_splits={"train", "holdout"}
    ):
        subject_id = nested_subject_id(row)
        if subject_id not in expected_subjects:
            continue
        controls[subject_id].append(row)

    matches: list[dict[str, Any]] = []
    for subject_id in subject_ids:
        treatment_group = sorted(
            treatments[subject_id], key=lambda row: row["predicate_realization_id"]
        )
        if len(treatment_group) != 4:
            raise ValueError(
                f"subject {subject_id} requires four treatment rows, got {len(treatment_group)}"
            )
        train_controls = sorted(
            (row for row in controls[subject_id] if row["split"] == "train"),
            key=lambda row: row["id"],
        )
        if len(train_controls) >= 4:
            candidate_pool = train_controls
        else:
            holdout_controls = sorted(
                (row for row in controls[subject_id] if row["split"] == "holdout"),
                key=lambda row: row["id"],
            )
            candidate_pool = train_controls + holdout_controls
        if len(candidate_pool) < 4:
            raise ValueError(
                f"subject {subject_id} has only {len(candidate_pool)} eligible controls"
            )

        best: tuple[Any, ...] | None = None
        best_permutation: tuple[dict[str, Any], ...] | None = None
        for permutation in itertools.permutations(candidate_pool, 4):
            costs = [
                pair_cost(treatment, control)
                for treatment, control in zip(treatment_group, permutation)
            ]
            key = (
                sum(cost[0] for cost in costs),
                sum(cost[1] for cost in costs),
                sum(cost[2] for cost in costs),
                tuple(row["id"] for row in permutation),
            )
            if best is None or key < best:
                best = key
                best_permutation = permutation
        assert best_permutation is not None

        subject_slug = subject_id.removeprefix("wbv-realization:").removesuffix(
            ":subject:v1"
        )
        for index, (treatment, control) in enumerate(
            zip(treatment_group, best_permutation), start=1
        ):
            matches.append(
                build_match(
                    treatment,
                    control,
                    f"wbv-v3-screen-slot:{subject_slug}:{index:02d}",
                )
            )
    return matches


def build_schedules(
    matches: list[dict[str, Any]], *, cycles: int, seed: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    control_schedule: list[dict[str, Any]] = []
    treatment_schedule: list[dict[str, Any]] = []
    ordered = sorted(matches, key=lambda row: row["pair_slot_id"])
    for cycle in range(1, cycles + 1):
        indices = list(range(len(ordered)))
        random.Random(seed + cycle * 1009).shuffle(indices)
        for index in indices:
            match = ordered[index]
            presentation_index = len(control_schedule) + 1
            shared = {
                "schema_version": 1,
                "schedule_cycle": cycle,
                "presentation_index": presentation_index,
                "pair_slot_id": match["pair_slot_id"],
                "subject_realization_id": match["subject_realization_id"],
                "source_lang": "eng_Latn",
                "target_lang": "wbv_Latn",
                "direction": "eng-wbv",
                "task": "translate",
            }
            control_schedule.append(
                {
                    **shared,
                    "id": f"wbv-v3-screen:c0:presentation:{presentation_index:06d}",
                    "arm": "C0",
                    "accounting_parent_id": match["control_id"],
                    "input_text": match["control_input_text"],
                    "output_text": match["control_output_text"],
                    "pair_kind": match["control_pair_kind"],
                    "token_accounting": match["control_token_accounting"],
                }
            )
            treatment_schedule.append(
                {
                    **shared,
                    "id": f"wbv-v3-screen:t1:presentation:{presentation_index:06d}",
                    "arm": "T1",
                    "accounting_parent_id": match["treatment_id"],
                    "input_text": match["treatment_input_text"],
                    "output_text": match["treatment_output_text"],
                    "pair_kind": match["treatment_pair_kind"],
                    "token_accounting": match["treatment_token_accounting"],
                }
            )
    return control_schedule, treatment_schedule


def schedule_token_accounting(
    rows: list[dict[str, Any]], *, physical_batch_size: int
) -> dict[str, Any]:
    source_tokens = sum(
        row["token_accounting"]["source_tokens_with_specials"] for row in rows
    )
    target_tokens = sum(
        row["token_accounting"]["target_tokens_with_specials"] for row in rows
    )
    padded_source_tokens = 0
    padded_target_tokens = 0
    micro_batches = []
    for start in range(0, len(rows), physical_batch_size):
        batch = rows[start : start + physical_batch_size]
        if len(batch) != physical_batch_size:
            raise ValueError("schedule does not end on a complete physical batch")
        source_lengths = [
            row["token_accounting"]["source_tokens_with_specials"] for row in batch
        ]
        target_lengths = [
            row["token_accounting"]["target_tokens_with_specials"] for row in batch
        ]
        padded_source = max(source_lengths) * len(batch)
        padded_target = max(target_lengths) * len(batch)
        padded_source_tokens += padded_source
        padded_target_tokens += padded_target
        micro_batches.append(
            {
                "micro_batch": len(micro_batches) + 1,
                "source_non_padding_tokens": sum(source_lengths),
                "target_non_padding_tokens": sum(target_lengths),
                "source_padded_tokens": padded_source,
                "target_padded_tokens": padded_target,
            }
        )
    return {
        "presentations": len(rows),
        "source_non_padding_tokens_with_specials": source_tokens,
        "target_non_padding_tokens_with_specials": target_tokens,
        "total_non_padding_tokens_with_specials": source_tokens + target_tokens,
        "source_padded_tokens": padded_source_tokens,
        "target_padded_tokens": padded_target_tokens,
        "total_padded_tokens": padded_source_tokens + padded_target_tokens,
        "micro_batches": micro_batches,
    }


def validate_schedule_pairing(
    control: list[dict[str, Any]], treatment: list[dict[str, Any]], expected: int
) -> None:
    if len(control) != expected or len(treatment) != expected:
        raise ValueError("schedule presentation count mismatch")
    for control_row, treatment_row in zip(control, treatment):
        for key in (
            "schedule_cycle",
            "presentation_index",
            "pair_slot_id",
            "subject_realization_id",
        ):
            if control_row[key] != treatment_row[key]:
                raise ValueError(f"paired schedule drift at {key}")


def stable_manifest(output_dir: Path, names: list[str]) -> dict[str, Any]:
    return {
        name: {
            "sha256": sha256_file(output_dir / name),
            "bytes": (output_dir / name).stat().st_size,
        }
        for name in sorted(names)
    }


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    contract = resolve_contract(program_root, load_json(args.contract.resolve()))
    analysis_id = contract["analysis_id"]
    if not analysis_id.startswith(METHOD_ID_PREFIX):
        raise ValueError(f"unexpected analysis_id: {contract['analysis_id']}")

    loaded: dict[str, list[dict[str, Any]]] = {}
    resolved_inputs: dict[str, str] = {}
    for name, binding in contract["inputs"].items():
        path, rows = resolve_rows(program_root, binding)
        loaded[name] = rows
        resolved_inputs[name] = str(path)

    adapter_dir = validate_bound_directory(program_root, contract["initial_adapter"])
    adapter_config = load_json(adapter_dir / "adapter_config.json")
    topology = contract["training"]["lora_topology"]
    for key in ("r", "lora_alpha", "lora_dropout"):
        if adapter_config.get(key) != topology[key]:
            raise ValueError(f"initial adapter topology mismatch at {key}")
    if set(adapter_config.get("target_modules", [])) != set(
        topology["target_modules"]
    ):
        raise ValueError("initial adapter target-module mismatch")

    try:
        from transformers import NllbTokenizer
    except ImportError as error:
        raise RuntimeError("transformers is required to freeze tokenizer accounting") from error
    tokenizer = NllbTokenizer.from_pretrained(
        adapter_dir,
        src_lang="eng_Latn",
        tgt_lang="wbv_Latn",
        local_files_only=True,
    )
    if len(tokenizer) != int(contract["tokenizer"]["expected_vocabulary_size"]):
        raise ValueError("tokenizer vocabulary-size mismatch")
    token_identity = {}
    for token in contract["tokenizer"]["required_tokens"]:
        token_id = tokenizer.convert_tokens_to_ids(token)
        if token_id is None or token_id == tokenizer.unk_token_id:
            raise ValueError(f"required tokenizer token is unavailable: {token}")
        token_identity[token] = int(token_id)

    treatment_rows = [
        annotate_tokens(row, tokenizer) for row in loaded["treatment_rows"]
    ]
    controlled_rows = [
        annotate_tokens(row, tokenizer) for row in loaded["controlled_sentence_corpus"]
    ]
    development_rows = [
        annotate_tokens(row, tokenizer) for row in loaded["development_rows"]
    ]
    external_ids = reviewed_legacy_ids(
        loaded.get("sentence_reviews", []),
        loaded.get("compatibility_reviews", []),
    )
    subject_ids = contract["schedule"]["subject_realization_ids"]
    strategy = contract["schedule"].get("control_strategy", "same_subject")
    if strategy == "same_subject":
        matches = select_control_matches(treatment_rows, controlled_rows, subject_ids)
    elif strategy == "global_token_match":
        excluded_inputs = {
            normalize_surface(row["input_text"])
            for row in treatment_rows + development_rows
        }
        matches = select_global_token_matches(
            treatment_rows,
            controlled_rows,
            excluded_inputs,
            externally_reviewed_ids=external_ids,
        )
    elif strategy == "aggregate_token_match":
        excluded_inputs = {
            normalize_surface(row["input_text"])
            for row in treatment_rows + development_rows
        }
        matches = select_aggregate_token_matches(
            treatment_rows,
            controlled_rows,
            excluded_inputs,
            maximum_overshoot_tokens=int(
                contract["schedule"].get("maximum_overshoot_tokens", 32)
            ),
            externally_reviewed_ids=external_ids,
        )
    else:
        raise ValueError(f"unsupported control strategy: {strategy}")
    if len(matches) != int(contract["expected"]["paired_unique_rows"]):
        raise ValueError("paired unique-row count mismatch")

    control_by_id = {row["id"]: row for row in controlled_rows}
    treatment_by_id = {row["id"]: row for row in treatment_rows}
    control_unique = [
        control_by_id[match["control_id"]]
        for match in sorted(matches, key=lambda row: row["pair_slot_id"])
    ]
    treatment_unique = [
        treatment_by_id[match["treatment_id"]]
        for match in sorted(matches, key=lambda row: row["pair_slot_id"])
    ]
    if len({row["id"] for row in control_unique}) != len(control_unique):
        raise ValueError("control assignment reused a row")
    if len({row["id"] for row in treatment_unique}) != len(treatment_unique):
        raise ValueError("treatment assignment reused a row")

    schedule = contract["schedule"]
    control_schedule, treatment_schedule = build_schedules(
        matches, cycles=int(schedule["cycles"]), seed=int(schedule["seed"])
    )
    expected_presentations = int(contract["expected"]["presentations_per_arm"])
    validate_schedule_pairing(
        control_schedule, treatment_schedule, expected_presentations
    )
    physical_batch_size = int(contract["training"]["physical_batch_size"])
    gradient_accumulation = int(contract["training"]["gradient_accumulation_steps"])
    effective_batch_size = physical_batch_size * gradient_accumulation
    if expected_presentations % effective_batch_size:
        raise ValueError("schedule does not end on an optimizer boundary")
    optimizer_updates = expected_presentations // effective_batch_size
    if optimizer_updates != int(contract["training"]["optimizer_updates"]):
        raise ValueError("optimizer-update contract mismatch")

    control_accounting = schedule_token_accounting(
        control_schedule, physical_batch_size=physical_batch_size
    )
    treatment_accounting = schedule_token_accounting(
        treatment_schedule, physical_batch_size=physical_batch_size
    )
    token_differences = {
        key: treatment_accounting[key] - control_accounting[key]
        for key in (
            "source_non_padding_tokens_with_specials",
            "target_non_padding_tokens_with_specials",
            "total_non_padding_tokens_with_specials",
            "source_padded_tokens",
            "target_padded_tokens",
            "total_padded_tokens",
        )
    }
    maximum_relative_difference = float(
        contract["schedule"].get(
            "maximum_relative_non_padding_token_difference", 1.0
        )
    )
    relative_non_padding_difference = abs(
        token_differences["total_non_padding_tokens_with_specials"]
    ) / control_accounting["total_non_padding_tokens_with_specials"]
    if relative_non_padding_difference > maximum_relative_difference:
        raise ValueError(
            "paired schedule exceeds relative non-padding token-difference limit: "
            f"{relative_non_padding_difference:.6f} > {maximum_relative_difference:.6f}"
        )
    control_holdout_rows = [
        row for row in control_unique if row.get("split") == "holdout"
    ]
    expected_holdout = int(contract["expected"]["control_holdout_rows_consumed"])
    if len(control_holdout_rows) != expected_holdout:
        raise ValueError(
            f"expected {expected_holdout} consumed holdout controls, got {len(control_holdout_rows)}"
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    if any(output_dir.iterdir()):
        raise SystemExit(f"refusing non-empty output directory: {output_dir}")
    output_files = {
        "CONTROL-UNIQUE.jsonl": control_unique,
        "TREATMENT-UNIQUE.jsonl": treatment_unique,
        "PAIR-MATCHES.jsonl": sorted(matches, key=lambda row: row["pair_slot_id"]),
        "C0-SCHEDULE.jsonl": control_schedule,
        "T1-SCHEDULE.jsonl": treatment_schedule,
        "DEVELOPMENT.jsonl": sorted(development_rows, key=row_identifier),
        "RETIRED-RETENTION-ROWS.jsonl": sorted(
            control_holdout_rows, key=lambda row: row["id"]
        ),
    }
    for name, rows in output_files.items():
        write_jsonl_atomic(output_dir / name, rows)

    token_accounting = {
        "schema_version": 1,
        "method_id": analysis_id,
        "tokenizer": {
            "directory": contract["initial_adapter"]["path"],
            "vocabulary_size": len(tokenizer),
            "required_token_ids": token_identity,
            "source_lang": "eng_Latn",
            "target_lang": "wbv_Latn",
        },
        "control": control_accounting,
        "treatment": treatment_accounting,
        "treatment_minus_control": token_differences,
        "accounting_note": (
            "Counts include tokenizer-added language/EOS tokens. Non-padding and "
            "dynamic physical-batch padding totals are both reported; neither is "
            "mistaken for independent linguistic evidence."
        ),
    }
    write_json_atomic(output_dir / "TOKEN-ACCOUNTING.json", token_accounting)

    control_predicates = Counter(
        match["control_predicate_realization_id"] for match in matches
    )
    treatment_predicates = Counter(
        match["treatment_predicate_realization_id"] for match in matches
    )
    report = {
        "schema_version": 1,
        "method_id": analysis_id,
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_PAIRED_SCHEDULES_RUNPOD_BLOCKED_PENDING_BASELINE_AND_KIT",
        "claim_limit": contract["claim_limit"],
        "resolved_inputs": resolved_inputs,
        "initial_adapter": {
            "path": contract["initial_adapter"]["path"],
            "adapter_weight_sha256": contract["initial_adapter"]["files"][
                "adapter_model.safetensors"
            ],
            "topology": topology,
        },
        "design": {
            "arms": {
                "B0": "untouched public Wajarri v2 adapter; evaluation only",
                "C0": contract["schedule"].get(
                    "control_arm_description",
                    "same-subject continuation using four existing controlled rows per subject",
                ),
                "T1": "same nine subjects with four reviewed composition-intervention predicates",
            },
            "subjects": len(subject_ids),
            "paired_unique_rows": len(matches),
            "cycles": int(schedule["cycles"]),
            "presentations_per_arm": expected_presentations,
            "physical_batch_size": physical_batch_size,
            "gradient_accumulation_steps": gradient_accumulation,
            "effective_batch_size": effective_batch_size,
            "optimizer_updates": optimizer_updates,
            "checkpoint_updates": contract["training"]["checkpoint_updates"],
            "seed": int(schedule["seed"]),
            "learning_rate": contract["training"]["learning_rate"],
            "warmup_updates": contract["training"]["warmup_updates"],
            "lr_scheduler_type": contract["training"]["lr_scheduler_type"],
        },
        "control": {
            "unique_rows": len(control_unique),
            "train_rows": sum(row.get("split") == "train" for row in control_unique),
            "old_development_rows_consumed_and_retired": len(control_holdout_rows),
            "inline_binding_rows": sum(
                bool((row.get("grammar_audit") or {}).get("binding_set_id"))
                for row in control_unique
            ),
            "external_review_ledger_rows": sum(
                not bool((row.get("grammar_audit") or {}).get("binding_set_id"))
                and row["id"] in external_ids
                for row in control_unique
            ),
            "predicate_counts": dict(sorted(control_predicates.items())),
        },
        "treatment": {
            "unique_rows": len(treatment_unique),
            "predicate_counts": dict(sorted(treatment_predicates.items())),
            "attested_reference_rows": 0,
            "public_release_authorizing_rows": 0,
        },
        "token_accounting_summary": {
            "control_total_non_padding_tokens": control_accounting[
                "total_non_padding_tokens_with_specials"
            ],
            "treatment_total_non_padding_tokens": treatment_accounting[
                "total_non_padding_tokens_with_specials"
            ],
            "non_padding_difference": token_differences[
                "total_non_padding_tokens_with_specials"
            ],
            "relative_non_padding_difference": relative_non_padding_difference,
            "control_total_padded_tokens": control_accounting["total_padded_tokens"],
            "treatment_total_padded_tokens": treatment_accounting[
                "total_padded_tokens"
            ],
            "padded_difference": token_differences["total_padded_tokens"],
        },
        "runpod_authorized": False,
        "remaining_gates": [
            "Probe all 13 corrected development rows against the immutable B0 runtime.",
            "Build and checksum the two-arm RunPod kit around these schedules.",
            "Verify base, adapter, tokenizer, training, evaluation, and shutdown preflights.",
        ],
    }
    write_json_atomic(output_dir / "REPORT.json", report)

    materialized = list(output_files) + ["TOKEN-ACCOUNTING.json", "REPORT.json"]
    manifest = {
        "schema_version": 1,
        "method_id": analysis_id,
        "created_at_utc": contract["created_at_utc"],
        "contract_path": str(args.contract.resolve()),
        "contract_sha256": sha256_file(args.contract.resolve()),
        "files": stable_manifest(output_dir, materialized),
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    checksum_names = materialized + ["MANIFEST.json"]
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in sorted(checksum_names)
        ),
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

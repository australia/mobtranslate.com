#!/usr/bin/env python3
"""Build token-identical mixed composition and lexical replay schedules."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path
from typing import Any, Iterable

try:
    from training.translation.build_wajarri_v3_paired_screen_schedules import (
        annotate_tokens,
        canonical_json,
        load_json,
        load_jsonl,
        schedule_token_accounting,
        sha256_file,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_paired_screen_schedules import (
        annotate_tokens,
        canonical_json,
        load_json,
        load_jsonl,
        schedule_token_accounting,
        sha256_file,
    )


METHOD_ID = "wajarri-v3-mixed-replay-schedules-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def resolve_rows(
    program_root: Path, binding: dict[str, Any]
) -> list[dict[str, Any]]:
    path = (program_root / binding["path"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"input escapes program root: {path}") from error
    if sha256_file(path) != binding["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(f"row-count mismatch for {path}")
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


def stable_rank(seed: int, value: str) -> str:
    return hashlib.sha256(f"{seed}:{value}".encode()).hexdigest()


def lexical_training_row(
    prediction: dict[str, Any], tokenizer: Any, *, pair_kind: str
) -> dict[str, Any]:
    references = prediction["accepted_references"]
    if prediction["ambiguity_class"] != "one_target" or len(references) != 1:
        raise ValueError(f"lexical replay row is not one-target: {prediction['id']}")
    row = {
        "schema_version": 1,
        "id": prediction["id"],
        "input_text": prediction["input_text"],
        "output_text": references[0],
        "task": "lexeme",
        "direction": "eng-wbv",
        "pair_kind": pair_kind,
        "source_record_ids": prediction["source_record_ids"],
        "baseline_exact": bool(prediction["exact"]),
        "baseline_prediction": prediction["prediction"],
        "reference_token_length_bucket": prediction["reference_token_length_bucket"],
    }
    return annotate_tokens(row, tokenizer)


def token_shape(row: dict[str, Any]) -> tuple[int, int]:
    accounting = row["token_accounting"]
    return (
        int(accounting["source_tokens_with_specials"]),
        int(accounting["target_tokens_with_specials"]),
    )


def token_total(row: dict[str, Any]) -> int:
    return int(row["token_accounting"]["non_padding_tokens_with_specials"])


def select_balanced_controls(
    anchors: list[dict[str, Any]],
    eligible: list[dict[str, Any]],
    *,
    seed: int,
) -> list[dict[str, Any]]:
    anchor_ids = {row["id"] for row in anchors}
    anchors_by_total: dict[int, list[dict[str, Any]]] = defaultdict(list)
    candidates_by_total: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in anchors:
        anchors_by_total[token_total(row)].append(row)
    for row in eligible:
        if row["id"] not in anchor_ids:
            candidates_by_total[token_total(row)].append(row)

    group_options: dict[int, dict[int, tuple[dict[str, Any], ...]]] = {}
    for total, group_anchors in sorted(anchors_by_total.items()):
        required = len(group_anchors)
        candidates = sorted(
            candidates_by_total[total],
            key=lambda row: (stable_rank(seed, row["id"]), row["id"]),
        )
        states: dict[tuple[int, int], tuple[dict[str, Any], ...]] = {(0, 0): ()}
        for candidate in candidates:
            source_tokens = token_shape(candidate)[0]
            additions = {}
            for (count, source_sum), selected in states.items():
                if count >= required:
                    continue
                key = (count + 1, source_sum + source_tokens)
                if key not in states and key not in additions:
                    additions[key] = selected + (candidate,)
            states.update(additions)
        options = {
            source_sum: selected
            for (count, source_sum), selected in states.items()
            if count == required
        }
        if not options:
            raise ValueError(f"cannot select {required} controls at token total {total}")
        group_options[total] = options

    combined: dict[int, dict[int, tuple[dict[str, Any], ...]]] = {0: {}}
    for total, options in sorted(group_options.items()):
        next_combined = {}
        for cumulative, selections in combined.items():
            for group_source, selected in options.items():
                source_sum = cumulative + group_source
                if source_sum not in next_combined:
                    next_combined[source_sum] = {**selections, total: selected}
        combined = next_combined
    target_source_tokens = sum(token_shape(row)[0] for row in anchors)
    selected_by_total = combined.get(target_source_tokens)
    if selected_by_total is None:
        closest = min(combined, key=lambda value: abs(value - target_source_tokens))
        raise ValueError(
            "cannot match lexical source-token total exactly: "
            f"target {target_source_tokens}, closest {closest}"
        )

    control_by_anchor = {}
    for total, group_anchors in anchors_by_total.items():
        ordered_anchors = sorted(
            group_anchors, key=lambda row: (token_shape(row)[0], row["id"])
        )
        ordered_controls = sorted(
            selected_by_total[total],
            key=lambda row: (token_shape(row)[0], row["id"]),
        )
        for anchor, control in zip(ordered_anchors, ordered_controls):
            control_by_anchor[anchor["id"]] = {
                **control,
                "pair_kind": "lexical_control_replay",
            }
    controls = [control_by_anchor[row["id"]] for row in anchors]
    if len({row["id"] for row in controls}) != len(controls):
        raise ValueError("balanced lexical control selection reused a row")
    return controls


def select_lexical_pairs(
    predictions: list[dict[str, Any]],
    mandatory_ids: set[str],
    excluded_source_record_ids: set[str],
    tokenizer: Any,
    *,
    target_pairs: int,
    seed: int,
) -> list[dict[str, Any]]:
    eligible = [
        lexical_training_row(row, tokenizer, pair_kind="lexical_anchor_replay")
        for row in predictions
        if row.get("ambiguity_class") == "one_target"
        and row.get("exact") is True
        and not (set(row.get("source_record_ids", [])) & excluded_source_record_ids)
    ]
    by_id = {row["id"]: row for row in eligible}
    missing = sorted(mandatory_ids - by_id.keys())
    if missing:
        raise ValueError(f"mandatory lexical anchors are not eligible: {missing}")

    groups: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in eligible:
        groups[token_total(row)].append(row)
    for total in groups:
        groups[total].sort(key=lambda row: (stable_rank(seed, row["id"]), row["id"]))

    anchors: list[dict[str, Any]] = []
    controls: list[dict[str, Any]] = []
    used: set[str] = set()

    def add_anchor(anchor: dict[str, Any]) -> bool:
        if anchor["id"] in used:
            return False
        control = next(
            (
                row
                for row in groups[token_total(anchor)]
                if row["id"] not in used
                and row["id"] != anchor["id"]
                and row["id"] not in mandatory_ids
            ),
            None,
        )
        if control is None:
            return False
        used.update((anchor["id"], control["id"]))
        anchors.append(anchor)
        controls.append({**control, "pair_kind": "lexical_control_replay"})
        return True

    for anchor_id in sorted(mandatory_ids):
        if not add_anchor(by_id[anchor_id]):
            raise ValueError(f"cannot token-match mandatory anchor: {anchor_id}")

    strata: dict[str, deque[dict[str, Any]]] = defaultdict(deque)
    for row in eligible:
        if row["id"] in used or row["id"] in mandatory_ids:
            continue
        strata[row["reference_token_length_bucket"]].append(row)
    stratum_order = sorted(strata)
    while len(anchors) < target_pairs:
        progress = False
        for stratum in stratum_order:
            queue = strata[stratum]
            while queue:
                candidate = queue.popleft()
                if add_anchor(candidate):
                    progress = True
                    break
            if len(anchors) == target_pairs:
                break
        if not progress:
            raise ValueError("eligible lexical population cannot fill paired replay quota")

    controls = select_balanced_controls(anchors, eligible, seed=seed)

    return [
        {
            "schema_version": 1,
            "pair_id": f"wbv-v3-mixed-lexical-pair:{index:03d}",
            "anchor": anchor,
            "control": control,
            "token_shape": {
                "anchor_source_tokens_with_specials": token_shape(anchor)[0],
                "anchor_target_tokens_with_specials": token_shape(anchor)[1],
                "control_source_tokens_with_specials": token_shape(control)[0],
                "control_target_tokens_with_specials": token_shape(control)[1],
                "total_non_padding_tokens_with_specials": token_total(anchor),
            },
            "mandatory_regression_anchor": anchor["id"] in mandatory_ids,
        }
        for index, (anchor, control) in enumerate(zip(anchors, controls), start=1)
    ]


def build_presentation_pairs(
    old_control_schedule: list[dict[str, Any]],
    old_treatment_schedule: list[dict[str, Any]],
    lexical_pairs: list[dict[str, Any]],
    *,
    composition_cycles: int,
    lexical_cycles: int,
    optimizer_updates: int,
    seed: int,
) -> list[dict[str, Any]]:
    composition = []
    for control, treatment in zip(old_control_schedule, old_treatment_schedule):
        if treatment["schedule_cycle"] > composition_cycles:
            continue
        composition.append(
            {
                "pair_kind": "composition",
                "pair_id": f"mixed-composition:{treatment['id']}",
                "control": control,
                "treatment": treatment,
            }
        )
    lexical = []
    for cycle in range(1, lexical_cycles + 1):
        ordered = list(lexical_pairs)
        random.Random(seed + cycle * 2029).shuffle(ordered)
        for pair in ordered:
            lexical.append(
                {
                    "pair_kind": "lexical",
                    "pair_id": f"mixed-lexical:c{cycle}:{pair['pair_id']}",
                    "control": pair["control"],
                    "treatment": pair["anchor"],
                }
            )
    if len(composition) != len(lexical):
        raise ValueError("mixed schedule requires equal composition and lexical presentations")
    if len(composition) % optimizer_updates:
        raise ValueError("mixed population cannot be distributed evenly over updates")
    per_type = len(composition) // optimizer_updates
    pairs = []
    for update in range(optimizer_updates):
        block = (
            composition[update * per_type : (update + 1) * per_type]
            + lexical[update * per_type : (update + 1) * per_type]
        )
        random.Random(seed + update * 4099).shuffle(block)
        for item in block:
            pairs.append({**item, "optimizer_update": update + 1})
    return pairs


def materialize_schedules(
    pairs: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    control_rows = []
    treatment_rows = []
    for index, pair in enumerate(pairs, start=1):
        shared = {
            "schema_version": 1,
            "presentation_index": index,
            "optimizer_update": pair["optimizer_update"],
            "mixed_pair_id": pair["pair_id"],
            "mixed_pair_kind": pair["pair_kind"],
            "source_lang": "eng_Latn",
            "target_lang": "wbv_Latn",
            "direction": "eng-wbv",
        }
        for arm, source, destination in (
            ("C2", pair["control"], control_rows),
            ("T2", pair["treatment"], treatment_rows),
        ):
            destination.append(
                {
                    **shared,
                    "id": f"wbv-v3-mixed:{arm.lower()}:presentation:{index:06d}",
                    "arm": arm,
                    "accounting_parent_id": source.get("accounting_parent_id", source["id"]),
                    "input_text": source["input_text"],
                    "output_text": source["output_text"],
                    "task": source["task"],
                    "pair_kind": source["pair_kind"],
                    "token_accounting": source["token_accounting"],
                }
            )
    return control_rows, treatment_rows


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    contract = load_json(args.contract.resolve())
    if contract["method_id"] != METHOD_ID:
        raise ValueError(f"unexpected method ID: {contract['method_id']}")
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    inputs = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }

    adapter_dir = (program_root / contract["tokenizer"]["path"]).resolve()
    if sha256_file(adapter_dir / "sentencepiece.bpe.model") != contract["tokenizer"]["sentencepiece_sha256"]:
        raise ValueError("tokenizer SentencePiece hash mismatch")
    try:
        from transformers import NllbTokenizer
    except ImportError as error:
        raise RuntimeError("transformers is required for token accounting") from error
    tokenizer = NllbTokenizer.from_pretrained(
        adapter_dir,
        src_lang="eng_Latn",
        tgt_lang="wbv_Latn",
        local_files_only=True,
    )
    if len(tokenizer) != int(contract["tokenizer"]["vocabulary_size"]):
        raise ValueError("tokenizer vocabulary-size mismatch")

    mandatory_ids = {
        row["row_key"]
        for row in inputs["one_target_changes"]
        if row["candidate_label"] == "T1" and row["transition"] == "loss"
    }
    excluded_source_ids = {
        source_id
        for row in inputs["fresh_subject_reviews"]
        for source_id in [row["source_record_id"]]
    }
    design = contract["design"]
    lexical_pairs = select_lexical_pairs(
        inputs["baseline_lexical_predictions"],
        mandatory_ids,
        excluded_source_ids,
        tokenizer,
        target_pairs=int(design["lexical_unique_pairs"]),
        seed=int(design["seed"]),
    )
    pairs = build_presentation_pairs(
        inputs["old_control_schedule"],
        inputs["old_treatment_schedule"],
        lexical_pairs,
        composition_cycles=int(design["composition_cycles"]),
        lexical_cycles=int(design["lexical_cycles"]),
        optimizer_updates=int(design["optimizer_updates"]),
        seed=int(design["seed"]),
    )
    control, treatment = materialize_schedules(pairs)
    expected_presentations = int(design["presentations_per_arm"])
    if len(control) != expected_presentations or len(treatment) != expected_presentations:
        raise ValueError("mixed schedule presentation count mismatch")
    if any(
        token_total(left) != token_total(right)
        for left, right in zip(control, treatment)
        if left["mixed_pair_kind"] == "lexical"
    ):
        raise ValueError("lexical replay pairs are not total-token identical")

    physical_batch_size = int(design["physical_batch_size"])
    control_accounting = schedule_token_accounting(
        control, physical_batch_size=physical_batch_size
    )
    treatment_accounting = schedule_token_accounting(
        treatment, physical_batch_size=physical_batch_size
    )
    if (
        control_accounting["total_non_padding_tokens_with_specials"]
        != treatment_accounting["total_non_padding_tokens_with_specials"]
    ):
        raise ValueError("mixed schedules are not non-padding-token identical")
    if (
        control_accounting["source_non_padding_tokens_with_specials"]
        != treatment_accounting["source_non_padding_tokens_with_specials"]
        or control_accounting["target_non_padding_tokens_with_specials"]
        != treatment_accounting["target_non_padding_tokens_with_specials"]
    ):
        raise ValueError("mixed schedules do not match source and target token totals")
    task_counts = Counter(row["mixed_pair_kind"] for row in treatment)
    if task_counts != Counter({"composition": 288, "lexical": 288}):
        raise ValueError(f"unexpected mixed task counts: {task_counts}")

    output_dir.mkdir(parents=True)
    lexical_anchor_rows = [pair["anchor"] for pair in lexical_pairs]
    lexical_control_rows = [pair["control"] for pair in lexical_pairs]
    composition_treatment_unique = {
        row["accounting_parent_id"]: row
        for row in treatment
        if row["mixed_pair_kind"] == "composition"
    }
    composition_control_unique = {
        row["accounting_parent_id"]: row
        for row in control
        if row["mixed_pair_kind"] == "composition"
    }
    files = {
        "C2-SCHEDULE.jsonl": control,
        "T2-SCHEDULE.jsonl": treatment,
        "LEXICAL-ANCHORS.jsonl": lexical_anchor_rows,
        "LEXICAL-CONTROLS.jsonl": lexical_control_rows,
        "LEXICAL-PAIR-MATCHES.jsonl": lexical_pairs,
        "C2-COMPOSITION-UNIQUE.jsonl": sorted(
            composition_control_unique.values(), key=lambda row: row["accounting_parent_id"]
        ),
        "T2-COMPOSITION-UNIQUE.jsonl": sorted(
            composition_treatment_unique.values(), key=lambda row: row["accounting_parent_id"]
        ),
        "DEVELOPMENT.jsonl": inputs["fresh_development"],
    }
    for name, rows in files.items():
        write_jsonl_atomic(output_dir / name, rows)
    token_report = {
        "schema_version": 1,
        "control": control_accounting,
        "treatment": treatment_accounting,
        "non_padding_difference": 0,
        "padded_difference": (
            treatment_accounting["total_padded_tokens"]
            - control_accounting["total_padded_tokens"]
        ),
    }
    write_json_atomic(output_dir / "TOKEN-ACCOUNTING.json", token_report)
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_MIXED_REPLAY_SCHEDULES_GPU_BLOCKED_PENDING_BASELINE_AND_KIT",
        "design": design,
        "mandatory_regression_anchors": len(mandatory_ids),
        "lexical_anchor_rows": len(lexical_anchor_rows),
        "lexical_control_rows": len(lexical_control_rows),
        "fresh_development_rows": len(inputs["fresh_development"]),
        "presentations_per_arm": len(treatment),
        "presentation_classes": dict(sorted(task_counts.items())),
        "non_padding_tokens_per_arm": treatment_accounting[
            "total_non_padding_tokens_with_specials"
        ],
        "non_padding_token_difference": 0,
        "lexical_pairs_with_different_source_target_split": sum(
            token_shape(pair["anchor"]) != token_shape(pair["control"])
            for pair in lexical_pairs
        ),
        "runpod_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "REPORT.json", report)
    names = list(files) + ["REPORT.json", "TOKEN-ACCOUNTING.json"]
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "contract_path": str(args.contract.resolve()),
        "contract_sha256": sha256_file(args.contract.resolve()),
        "files": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
            }
            for name in sorted(names)
        },
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in sorted(names + ["MANIFEST.json"])
        ),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

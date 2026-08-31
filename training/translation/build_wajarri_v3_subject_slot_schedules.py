#!/usr/bin/env python3
"""Build paired fixed-step Wajarri subject-slot screening schedules."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from training.translation.build_wajarri_v3_copy_composition_schedules import (
    accounting_summary,
    build_schedule,
    exposure_summary,
    resolve_rows,
    validate_schedule,
    verify_software_contract,
    write_json_atomic,
    write_jsonl_atomic,
    write_text_atomic,
)
from training.translation.build_wajarri_v3_paired_screen_schedules import (
    annotate_tokens,
    load_json,
    schedule_token_accounting,
    sha256_file,
)


METHOD_ID = "wajarri-v3-subject-slot-schedules-v1"
SLOT_TOKEN = "<copy>"
ARMS = {"M8": "masked_source", "D8": "declared_source"}
ORDINARY_SENTENCE_ENDPOINTS = {
    "composition_plain",
    "composition_inline",
    "held_lexeme_plain",
    "held_lexeme_inline",
}
TRANSPORT_FIELDS = {
    "accounting_parent_id",
    "arm",
    "id",
    "optimizer_update",
    "population_cycle",
    "population_presentation",
    "presentation_index",
    "schedule_population",
    "source_schedule_id",
    "target_pair_parent_id",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def unique_population(
    schedule: list[dict[str, Any]], population: str
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in schedule:
        if row.get("schedule_population") != population:
            continue
        source_id = str(row.get("source_row_id") or "")
        if not source_id:
            raise ValueError(f"{population} row lacks source_row_id")
        grouped.setdefault(source_id, []).append(row)
    if not grouped:
        raise ValueError(f"schedule has no {population} rows")

    unique = []
    for source_id, rows in sorted(grouped.items()):
        normalized = [
            {key: value for key, value in row.items() if key not in TRANSPORT_FIELDS}
            for row in rows
        ]
        if len({canonical(row) for row in normalized}) != 1:
            raise ValueError(f"{population} source row changes across presentations: {source_id}")
        row = dict(normalized[0])
        row["id"] = source_id
        row["source_row_id"] = source_id
        row["source_population"] = population
        unique.append(row)
    return unique


def slot_training_row(row: dict[str, Any], tokenizer: Any) -> dict[str, Any]:
    required = {
        "approved_for_training": True,
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
        "slot_token": SLOT_TOKEN,
        "slot_count": 1,
    }
    for field, expected in required.items():
        if row.get(field) != expected:
            raise ValueError(f"slot row has invalid {field}: {row.get('id')}")
    if str(row["output_text"]).count(SLOT_TOKEN) != 1:
        raise ValueError(f"slot target does not contain one marker: {row.get('id')}")
    if str(row["input_text"]).count(SLOT_TOKEN) != 1:
        raise ValueError(f"slot input does not contain one marker: {row.get('id')}")
    result = {
        "schema_version": 1,
        "id": str(row["id"]),
        "input_text": str(row["input_text"]),
        "output_text": str(row["output_text"]),
        "task": "subject_slot_conditioned_translation",
        "direction": "eng-wbv",
        "pair_kind": str(row["pair_kind"]),
        "source_population": "subject_slot",
        "source_row_id": str(row["parent_row_id"]),
        "representation": str(row["representation"]),
        "slot_token": SLOT_TOKEN,
        "slot_binding": row["slot_binding"],
        "predicate_binding": row["predicate_binding"],
        "creates_new_target_sentence": False,
        "synthetic_output_is_linguistic_evidence": False,
    }
    annotated = annotate_tokens(result, tokenizer)
    source_ids = tokenizer(
        annotated["input_text"], add_special_tokens=False, truncation=False
    )["input_ids"]
    target_ids = tokenizer(
        text_target=annotated["output_text"],
        add_special_tokens=False,
        truncation=False,
    )["input_ids"]
    copy_id = int(tokenizer.convert_tokens_to_ids(SLOT_TOKEN))
    if source_ids.count(copy_id) != 1 or target_ids.count(copy_id) != 1:
        raise ValueError(f"slot marker is not one exact tokenizer row: {row.get('id')}")
    return annotated


def paired_non_slot_signature(rows: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
    return sorted(
        (
            int(row["optimizer_update"]),
            int(row["presentation_index"]),
            str(row["schedule_population"]),
            str(row["target_pair_parent_id"]),
            str(row["input_text"]),
            str(row["output_text"]),
        )
        for row in rows
        if row["schedule_population"] != "subject_slot"
    )


def endpoint_slot_rows(
    rows: list[dict[str, Any]], endpoint: str
) -> list[dict[str, Any]]:
    return [
        {
            **row,
            "evaluation_endpoint": endpoint,
            "evaluation_condition": row["representation"],
            "approved_for_training": False,
        }
        for row in rows
    ]


def build_development(
    ordinary: list[dict[str, Any]], inputs: dict[str, list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    ordinary_rows = [
        row
        for row in ordinary
        if row.get("evaluation_endpoint") in ORDINARY_SENTENCE_ENDPOINTS
    ]
    if len(ordinary_rows) != 70:
        raise ValueError(f"ordinary sentence development census changed: {len(ordinary_rows)}")
    slot_rows = [
        *endpoint_slot_rows(
            inputs["composition_masked"], "slot_composition_masked"
        ),
        *endpoint_slot_rows(
            inputs["composition_declared"], "slot_composition_declared"
        ),
        *endpoint_slot_rows(inputs["held_masked"], "slot_held_masked"),
        *endpoint_slot_rows(inputs["held_declared"], "slot_held_declared"),
    ]
    def component_key(row: dict[str, Any]) -> tuple[str, str]:
        return str(row.get("subject_id") or ""), str(row.get("predicate_id") or "")

    ordinary_components = Counter(component_key(row) for row in ordinary_rows)
    slot_components = Counter(component_key(row) for row in slot_rows)
    if set(ordinary_components) != set(slot_components):
        raise ValueError("ordinary and slot development component sets differ")
    if set(ordinary_components.values()) != {2} or set(slot_components.values()) != {2}:
        raise ValueError("each development component pair must have two representations")
    result = sorted([*ordinary_rows, *slot_rows], key=lambda row: str(row["id"]))
    if len({str(row["id"]) for row in result}) != len(result):
        raise ValueError("development identifiers are not unique")
    return result


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1 or contract.get("method_id") != METHOD_ID:
        raise ValueError("unsupported subject-slot schedule contract")
    software = verify_software_contract(contract)
    inputs = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }

    source_schedule = inputs["source_schedule"]
    populations = {
        name: unique_population(source_schedule, name)
        for name in ("retention", "sentence_plain", "sentence_inline")
    }
    observed_unique = {name: len(rows) for name, rows in populations.items()}
    if observed_unique != contract["expected_source_unique_populations"]:
        raise ValueError(f"source unique census changed: {observed_unique}")

    tokenizer_binding = contract["tokenizer"]
    tokenizer_dir = (program_root / tokenizer_binding["path"]).resolve()
    try:
        tokenizer_dir.relative_to(program_root)
    except ValueError as error:
        raise ValueError("tokenizer escapes program root") from error
    for name, expected in tokenizer_binding["files"].items():
        if sha256_file(tokenizer_dir / name) != expected:
            raise ValueError(f"tokenizer file failed checksum binding: {name}")
    from transformers import NllbTokenizer

    tokenizer = NllbTokenizer.from_pretrained(
        tokenizer_dir,
        src_lang="eng_Latn",
        tgt_lang="wbv_Latn",
        local_files_only=True,
    )
    if len(tokenizer) != int(tokenizer_binding["vocabulary_size"]):
        raise ValueError("tokenizer vocabulary-size mismatch")
    if int(tokenizer.convert_tokens_to_ids(SLOT_TOKEN)) != int(
        tokenizer_binding["slot_token_id"]
    ):
        raise ValueError("slot token ID mismatch")

    slot_populations = {
        "M8": [slot_training_row(row, tokenizer) for row in inputs["training_masked"]],
        "D8": [slot_training_row(row, tokenizer) for row in inputs["training_declared"]],
    }
    design = contract["design"]
    updates = int(design["optimizer_updates"])
    seed = int(design["seed"])
    per_update = {name: int(value) for name, value in design["per_update"].items()}
    schedules: dict[str, list[dict[str, Any]]] = {}
    for arm in ARMS:
        arm_populations = {**populations, "subject_slot": slot_populations[arm]}
        built = build_schedule(
            arm,
            arm_populations,
            per_update,
            optimizer_updates=updates,
            seed=seed,
        )
        schedules[arm] = [
            {
                **row,
                "id": f"wbv-v3-subject-slot:{arm.lower()}:{index:06d}",
            }
            for index, row in enumerate(built, start=1)
        ]
        validate_schedule(schedules[arm], per_update, updates=updates)
    if paired_non_slot_signature(schedules["M8"]) != paired_non_slot_signature(
        schedules["D8"]
    ):
        raise ValueError("M8/D8 non-slot presentations are not position-paired")

    development = build_development(inputs["source_development"], inputs)
    expected = contract["expected"]
    observed = {
        "schedule_rows_per_arm": {arm: len(rows) for arm, rows in schedules.items()},
        "slot_unique_rows_per_arm": {
            arm: len(rows) for arm, rows in slot_populations.items()
        },
        "development_rows": len(development),
        "development_endpoint_rows": dict(
            sorted(Counter(str(row["evaluation_endpoint"]) for row in development).items())
        ),
        "sealed_test_rows_read": 0,
    }
    if observed != expected:
        raise ValueError(f"schedule census changed: {observed} != {expected}")
    accounting = {
        arm: schedule_token_accounting(
            rows, physical_batch_size=int(design["physical_batch_size"])
        )
        for arm, rows in schedules.items()
    }

    output_dir.mkdir(parents=True)
    files = {
        **{f"{arm}-SCHEDULE.jsonl": rows for arm, rows in schedules.items()},
        "RETENTION-UNIQUE.jsonl": populations["retention"],
        "SENTENCE-PLAIN-UNIQUE.jsonl": populations["sentence_plain"],
        "SENTENCE-INLINE-UNIQUE.jsonl": populations["sentence_inline"],
        "SUBJECT-SLOT-MASKED-UNIQUE.jsonl": slot_populations["M8"],
        "SUBJECT-SLOT-DECLARED-UNIQUE.jsonl": slot_populations["D8"],
        "DEVELOPMENT-SCREEN.jsonl": development,
    }
    for name, rows in files.items():
        write_jsonl_atomic(output_dir / name, rows)
    write_json_atomic(output_dir / "TOKEN-ACCOUNTING.json", accounting)
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_PAIRED_SUBJECT_SLOT_SCREENING_SCHEDULES",
        "software": software,
        "design": design,
        "census": observed,
        "source_unique_populations": observed_unique,
        "arm_exposure": {
            arm: {
                **exposure_summary(rows),
                "token_accounting": accounting_summary(accounting[arm]),
            }
            for arm, rows in schedules.items()
        },
        "non_slot_presentations_position_paired": True,
        "slot_target_marker": SLOT_TOKEN,
        "slot_target_marker_token_id": int(tokenizer_binding["slot_token_id"]),
        "new_wajarri_sentence_pairs": 0,
        "sealed_test_rows_read": 0,
        "opaque_sealed_test_binding": contract["sealed_test_binding"],
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "REPORT.json", report)
    names = [*files, "TOKEN-ACCOUNTING.json", "REPORT.json"]
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "builder_implementation_sha256": sha256_file(Path(__file__).resolve()),
        "contract_path": str(contract_path),
        "contract_sha256": sha256_file(contract_path),
        "inputs": contract["inputs"],
        "files": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
                **({"rows": len(files[name])} if name in files else {}),
            }
            for name in sorted(names)
        },
        "opaque_sealed_test_binding": contract["sealed_test_binding"],
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n"
            for name in sorted([*names, "MANIFEST.json"])
        ),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

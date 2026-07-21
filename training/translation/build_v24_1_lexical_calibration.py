#!/usr/bin/env python3
"""Build explicit closed-set lexical calibration datasets for Kuku Yalanji."""

from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import unicodedata
from typing import Any


COHORTS = {
    "H297": "historical_297_gate_records",
    "C2724": "curated_dictionary_census",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--historical-probe", type=Path, required=True)
    parser.add_argument("--curated-census", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--monitor-rows", type=int, default=128)
    parser.add_argument("--seed", default="v24.1-lexical-calibration-2026-07-15")
    return parser.parse_args()


def clean(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def normalize(value: Any) -> str:
    return clean(value).casefold()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise FileNotFoundError(path)
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"row is not an object at {path}:{line_number}")
            rows.append(row)
    if not rows:
        raise ValueError(f"no rows in {path}")
    return rows


def accepted_references(row: dict[str, Any]) -> list[str]:
    references = [clean(value) for value in row.get("accepted_references") or [] if clean(value)]
    if not references:
        selected = clean(row.get("output_text"))
        references = [selected] if selected else []
    return list(dict.fromkeys(references))


def validate_rows(rows: list[dict[str, Any]], cohort: str) -> None:
    ids: set[str] = set()
    prompts: set[str] = set()
    for index, row in enumerate(rows, start=1):
        row_id = clean(row.get("id"))
        prompt = normalize(row.get("unconditioned_input_text"))
        input_text = clean(row.get("input_text"))
        selected = normalize(row.get("output_text"))
        references = {normalize(value) for value in accepted_references(row)}
        if not row_id or row_id in ids:
            raise ValueError(f"{cohort} has a missing or duplicate id at row {index}: {row_id!r}")
        if not prompt or prompt in prompts:
            raise ValueError(f"{cohort} has a missing or duplicate normalized prompt at row {index}: {prompt!r}")
        if row.get("direction") != "eng-gvn":
            raise ValueError(f"{cohort} row {row_id} is not eng-gvn")
        if not input_text.startswith("<lexeme> "):
            raise ValueError(f"{cohort} row {row_id} lacks the <lexeme> task prefix")
        if not selected or not references:
            raise ValueError(f"{cohort} row {row_id} has no usable selected or accepted reference")
        ids.add(row_id)
        prompts.add(prompt)


def calibration_rows(rows: list[dict[str, Any]], cohort: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for source_row in rows:
        row = deepcopy(source_row)
        source_output = clean(row.get("output_text"))
        selected_output = accepted_references(row)[0]
        row["source_pair_kind"] = row.get("pair_kind")
        row["source_output_text"] = source_output
        row["output_text"] = selected_output
        row["pair_kind"] = "dictionary_closed_set_calibration"
        row["approved_for_training"] = True
        row["promotion_eligible"] = False
        row["calibration"] = {
            "cohort": cohort,
            "cohort_description": COHORTS[cohort],
            "source_row_id": source_row["id"],
            "selected_target_rule": "first_declared_accepted_reference",
            "selected_target_changed_from_source": normalize(source_output) != normalize(selected_output),
            "training_overlap": "complete_by_design",
            "monitor_overlap": "not_in_monitor_subset",
            "claim": "closed_set_reconstruction_only",
        }
        result.append(row)
    return result


def monitor_rows(rows: list[dict[str, Any]], cohort: str, count: int, seed: str) -> list[dict[str, Any]]:
    ordered = sorted(
        rows,
        key=lambda row: hashlib.sha256(f"{seed}\0{cohort}\0{row['id']}".encode()).digest(),
    )
    result = deepcopy(ordered[: min(count, len(ordered))])
    for row in result:
        row["calibration"]["monitor_overlap"] = "row_is_also_in_training_by_design"
    return result


def prompt_map(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {normalize(row["unconditioned_input_text"]): row for row in rows}


def overlap_summary(historical: list[dict[str, Any]], curated: list[dict[str, Any]]) -> dict[str, int]:
    historical_by_prompt = prompt_map(historical)
    curated_by_prompt = prompt_map(curated)
    common_prompts = sorted(set(historical_by_prompt).intersection(curated_by_prompt))
    shared_forms = 0
    for prompt in common_prompts:
        historical_forms = {normalize(value) for value in accepted_references(historical_by_prompt[prompt])}
        curated_forms = {normalize(value) for value in accepted_references(curated_by_prompt[prompt])}
        shared_forms += bool(historical_forms.intersection(curated_forms))
    return {
        "historical_prompts": len(historical_by_prompt),
        "curated_prompts": len(curated_by_prompt),
        "prompt_overlap": len(common_prompts),
        "overlap_with_shared_accepted_form": shared_forms,
        "overlap_without_shared_accepted_form": len(common_prompts) - shared_forms,
        "historical_prompts_absent_from_curated": len(set(historical_by_prompt).difference(curated_by_prompt)),
    }


def write_jsonl_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    if args.monitor_rows < 1:
        raise SystemExit("--monitor-rows must be positive")
    if args.output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {args.output_dir}")

    source_rows = {
        "H297": load_jsonl(args.historical_probe),
        "C2724": load_jsonl(args.curated_census),
    }
    for cohort, rows in source_rows.items():
        validate_rows(rows, cohort)

    outputs: dict[str, Any] = {}
    for cohort, rows in source_rows.items():
        train = calibration_rows(rows, cohort)
        monitor = monitor_rows(train, cohort, args.monitor_rows, args.seed)
        train_path = args.output_dir / "arms" / cohort / "train.eng-gvn.jsonl"
        monitor_path = args.output_dir / "arms" / cohort / "monitor.eng-gvn.jsonl"
        write_jsonl_atomic(train_path, train)
        write_jsonl_atomic(monitor_path, monitor)
        outputs[cohort] = {
            "train": {"path": str(train_path.resolve()), "rows": len(train), "sha256": sha256(train_path)},
            "monitor": {
                "path": str(monitor_path.resolve()),
                "rows": len(monitor),
                "sha256": sha256(monitor_path),
                "overlap_with_train": len(monitor),
            },
        }

    manifest = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_id": "v24.1-kuku-yalanji-closed-set-lexical-calibration",
        "status": "built_not_trained",
        "purpose": "Test whether the current NLLB-LoRA stack can reconstruct explicitly trained dictionary records.",
        "task_contract": {
            "input_template": "<lexeme> {English prompt}",
            "selected_target": "first declared accepted reference in each frozen source row",
            "scoring": "NFC/casefolded exact match against any accepted reference",
            "control_token": "<lexeme> must be registered and trained as one special token",
            "decoder": "greedy with no repetition guard for lexical reconstruction",
        },
        "sources": {
            "H297": {
                "path": str(args.historical_probe.resolve()),
                "rows": len(source_rows["H297"]),
                "sha256": sha256(args.historical_probe),
                "source_selected_target_not_accepted": sum(
                    normalize(row.get("output_text"))
                    not in {normalize(value) for value in accepted_references(row)}
                    for row in source_rows["H297"]
                ),
            },
            "C2724": {
                "path": str(args.curated_census.resolve()),
                "rows": len(source_rows["C2724"]),
                "sha256": sha256(args.curated_census),
                "source_selected_target_not_accepted": sum(
                    normalize(row.get("output_text"))
                    not in {normalize(value) for value in accepted_references(row)}
                    for row in source_rows["C2724"]
                ),
            },
        },
        "cross_resource_overlap": overlap_summary(source_rows["H297"], source_rows["C2724"]),
        "outputs": outputs,
        "interpretation": [
            "Every scored row is also a training row by design; this is memorization/reconstruction calibration, not generalization.",
            "The monitor subsets overlap training and exist only to detect optimization failures during a run.",
            "Conflicting source records are not silently adjudicated or merged.",
            "Passing a lexical calibration gate does not authorize sentence translation or deployment.",
        ],
    }
    write_json_atomic(args.output_dir / "MANIFEST.json", manifest)
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

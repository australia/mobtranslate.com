#!/usr/bin/env python3
"""Join a Wajarri live pre-census to selected-checkpoint and dictionary lineage."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-pre-census-lineage-v1"


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


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected JSON object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number}: expected JSON object")
            rows.append(value)
    return rows


def resolve_input(
    program_root: Path, component: dict[str, Any]
) -> tuple[Path, list[dict[str, Any]] | dict[str, Any]]:
    path = (program_root / component["path"]).resolve()
    if program_root.resolve() not in path.parents:
        raise ValueError(f"input escapes program root: {path}")
    if sha256_file(path) != component["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows: list[dict[str, Any]] | dict[str, Any]
    if path.suffix == ".jsonl":
        rows = load_jsonl(path)
        if len(rows) != int(component["rows"]):
            raise ValueError(f"row-count mismatch for {path}")
    else:
        rows = load_json(path)
        if int(component["rows"]) != 1:
            raise ValueError(f"JSON object input must declare one row: {path}")
    return path, rows


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


def normalize_surface(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(normalized.split()).strip(" .?!,;:")


def strip_task_prefix(value: str) -> str:
    return re.sub(r"^<[^>]+>\s*", "", value).strip()


def text_tokens(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKC", strip_task_prefix(value)).casefold()
    return re.findall(r"[^\W_]+(?:['’][^\W_]+)?", normalized, flags=re.UNICODE)


def target_tokens(value: str) -> list[str]:
    return text_tokens(value)


def tfidf_vectors(documents: list[str]) -> tuple[list[dict[str, float]], Counter[str]]:
    tokenized = [text_tokens(document) for document in documents]
    document_frequency: Counter[str] = Counter()
    for tokens in tokenized:
        document_frequency.update(set(tokens))
    count = len(documents)
    vectors = []
    for tokens in tokenized:
        frequency = Counter(tokens)
        vector = {
            token: occurrences * (math.log((1 + count) / (1 + document_frequency[token])) + 1)
            for token, occurrences in frequency.items()
        }
        vectors.append(vector)
    return vectors, document_frequency


def query_vector(
    query: str, document_count: int, document_frequency: Counter[str]
) -> dict[str, float]:
    frequency = Counter(text_tokens(query))
    return {
        token: occurrences
        * (math.log((1 + document_count) / (1 + document_frequency[token])) + 1)
        for token, occurrences in frequency.items()
    }


def cosine(left: dict[str, float], right: dict[str, float]) -> float:
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if not left_norm or not right_norm:
        return 0.0
    dot = sum(value * right.get(token, 0.0) for token, value in left.items())
    return dot / (left_norm * right_norm)


def nearest_training_rows(
    sentences: list[dict[str, Any]],
    schedule: list[dict[str, Any]],
    result_limit: int,
) -> list[dict[str, Any]]:
    translate_rows = [row for row in schedule if row["task"] == "translate"]
    vectors, document_frequency = tfidf_vectors(
        [row["input_text"] for row in translate_rows]
    )
    results = []
    for sentence in sentences:
        vector = query_vector(
            sentence["source_text"], len(translate_rows), document_frequency
        )
        scored = sorted(
            (
                (cosine(vector, row_vector), index, row)
                for index, (row, row_vector) in enumerate(zip(translate_rows, vectors))
            ),
            key=lambda item: (-item[0], item[1]),
        )[:result_limit]
        results.append(
            {
                "schema_version": 1,
                "pair_id": sentence["pair_id"],
                "source_text": sentence["source_text"],
                "reference": sentence["reference"],
                "prediction": sentence["prediction"],
                "nearest_selected_checkpoint_rows": [
                    {
                        "rank": rank,
                        "tfidf_cosine": round(score, 6),
                        "schedule_row_index": index + 1,
                        "presentation_id": row["id"],
                        "input_text": row["input_text"],
                        "output_text": row["output_text"],
                        "pair_kind": row["pair_kind"],
                        "accounting_parent_id": row.get("accounting_parent_id"),
                    }
                    for rank, (score, index, row) in enumerate(scored, start=1)
                ],
                "claim_limit": (
                    "TF-IDF proximity is an auditable lexical diagnostic, not proof that "
                    "a particular training row caused the output."
                ),
            }
        )
    return results


def build_token_lineage(
    sentences: list[dict[str, Any]],
    lexemes: list[dict[str, Any]],
    schedule: list[dict[str, Any]],
    source_outcomes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    surfaces = set()
    for row in sentences:
        surfaces.update(target_tokens(row["reference"]))
        surfaces.update(target_tokens(row["prediction"]))
    for row in lexemes:
        surfaces.update(target_tokens(row["expected_surface"]))
        surfaces.update(target_tokens(row["prediction"]))

    dictionary_by_target: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in source_outcomes:
        target = normalize_surface(row["source_target"])
        if len(target_tokens(target)) == 1:
            dictionary_by_target[target].append(row)

    schedule_token_rows: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row_index, row in enumerate(schedule, start=1):
        for token in set(target_tokens(row["output_text"])):
            schedule_token_rows[token].append({"row_index": row_index, **row})

    results = []
    for surface in sorted(surfaces):
        dictionary_rows = dictionary_by_target.get(surface, [])
        exposure_rows = schedule_token_rows.get(surface, [])
        results.append(
            {
                "schema_version": 1,
                "surface": surface,
                "selected_checkpoint_token_presentations": len(exposure_rows),
                "selected_checkpoint_pair_kinds": dict(
                    sorted(Counter(row["pair_kind"] for row in exposure_rows).items())
                ),
                "selected_checkpoint_examples": [
                    {
                        "row_index": row["row_index"],
                        "presentation_id": row["id"],
                        "input_text": row["input_text"],
                        "output_text": row["output_text"],
                        "pair_kind": row["pair_kind"],
                    }
                    for row in exposure_rows[:8]
                ],
                "dictionary_source_record_count": len(dictionary_rows),
                "dictionary_source_records": [
                    {
                        "source_record_id": row["source_record_id"],
                        "source_prompt": row["source_prompt"],
                        "source_definition": row["source_definition"],
                        "source_target": row["source_target"],
                    }
                    for row in dictionary_rows[:12]
                ],
                "claim_limit": (
                    "A token match establishes recorded surface exposure or a source-record "
                    "string match, not sense identity, morphology, or causal influence."
                ),
            }
        )
    return results


def build_prompt_conflicts(schedule: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for index, row in enumerate(schedule, start=1):
        if row["task"] == "translate":
            grouped[normalize_surface(strip_task_prefix(row["input_text"]))].append(
                {"row_index": index, **row}
            )
    conflicts = []
    for prompt, rows in grouped.items():
        targets = sorted({normalize_surface(row["output_text"]) for row in rows})
        if len(targets) < 2:
            continue
        conflicts.append(
            {
                "schema_version": 1,
                "normalized_prompt": prompt,
                "presentations": len(rows),
                "distinct_targets": len(targets),
                "target_surfaces": targets,
                "rows": [
                    {
                        "row_index": row["row_index"],
                        "presentation_id": row["id"],
                        "input_text": row["input_text"],
                        "output_text": row["output_text"],
                        "pair_kind": row["pair_kind"],
                    }
                    for row in rows
                ],
                "claim_limit": (
                    "A prompt-level target conflict is a training-lineage fact; it does not "
                    "by itself decide synonymy, error, variety, or preferred form."
                ),
            }
        )
    return sorted(conflicts, key=lambda row: row["normalized_prompt"])


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("unsupported contract schema")

    inputs = {}
    for name, component in contract["inputs"].items():
        _, value = resolve_input(program_root, component)
        inputs[name] = value
    sentences = inputs["sentence_results"]
    lexemes = inputs["lexeme_results"]
    schedule_all = inputs["selected_checkpoint_schedule"]
    source_outcomes = inputs["source_record_outcomes"]
    report_input = inputs["pre_census_report"]
    assert isinstance(sentences, list)
    assert isinstance(lexemes, list)
    assert isinstance(schedule_all, list)
    assert isinstance(source_outcomes, list)
    assert isinstance(report_input, dict)

    selected_count = int(contract["selected_checkpoint_presentations"])
    schedule = schedule_all[:selected_count]
    if len(schedule) != selected_count:
        raise ValueError("selected checkpoint presentation count exceeds schedule")
    if report_input["analysis_id"] != contract["source_analysis_id"]:
        raise ValueError("pre-census report identity mismatch")

    nearest = nearest_training_rows(
        sentences, schedule, int(contract["nearest_training_rows_per_candidate"])
    )
    token_lineage = build_token_lineage(sentences, lexemes, schedule, source_outcomes)
    conflicts = build_prompt_conflicts(schedule)
    token_by_surface = {row["surface"]: row for row in token_lineage}
    nonreference_prediction_tokens = {
        token
        for row in sentences
        for token in target_tokens(row["prediction"])
        if token not in set(target_tokens(row["reference"]))
    }
    exposed_nonreference = [
        token
        for token in sorted(nonreference_prediction_tokens)
        if token_by_surface[token]["selected_checkpoint_token_presentations"]
    ]
    dictionary_nonreference = [
        token
        for token in sorted(nonreference_prediction_tokens)
        if token_by_surface[token]["dictionary_source_record_count"]
    ]
    exact_prompt_overlap = 0
    schedule_prompts = {
        normalize_surface(strip_task_prefix(row["input_text"]))
        for row in schedule
        if row["task"] == "translate"
    }
    for row in sentences:
        exact_prompt_overlap += normalize_surface(row["source_text"]) in schedule_prompts

    report = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "status": "COMPLETE_LINEAGE_JOIN",
        "source_analysis_id": contract["source_analysis_id"],
        "counts": {
            "selected_checkpoint_presentations": len(schedule),
            "selected_translate_presentations": sum(
                row["task"] == "translate" for row in schedule
            ),
            "candidate_sentence_rows": len(sentences),
            "candidate_exact_prompt_overlap_with_selected_checkpoint": exact_prompt_overlap,
            "token_lineage_surfaces": len(token_lineage),
            "selected_translate_prompt_conflicts": len(conflicts),
            "nonreference_prediction_tokens": len(nonreference_prediction_tokens),
            "nonreference_prediction_tokens_seen_in_selected_checkpoint": len(
                exposed_nonreference
            ),
            "nonreference_prediction_tokens_matching_dictionary_records": len(
                dictionary_nonreference
            ),
        },
        "observed_nonreference_surfaces": {
            "seen_in_selected_checkpoint": exposed_nonreference,
            "matching_dictionary_source_records": dictionary_nonreference,
        },
        "interpretation": (
            "The join records lexical exposure, exact prompt conflicts, source-record string "
            "matches, and TF-IDF-nearest selected-checkpoint rows. These are auditable "
            "correlates and hypothesis generators, not causal estimates."
        ),
        "training_authorized": False,
        "runpod_authorized": False,
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    write_jsonl_atomic(output_dir / "TOKEN-LINEAGE.jsonl", token_lineage)
    write_jsonl_atomic(output_dir / "NEAREST-TRAINING-ROWS.jsonl", nearest)
    write_jsonl_atomic(output_dir / "SELECTED-PROMPT-CONFLICTS.jsonl", conflicts)
    write_json_atomic(output_dir / "REPORT.json", report)
    manifest = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "status": report["status"],
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
        },
        "contract": {"path": str(contract_path), "sha256": sha256_file(contract_path)},
        "inputs": contract["inputs"],
        "outputs": {
            "TOKEN-LINEAGE.jsonl": {"rows": len(token_lineage)},
            "NEAREST-TRAINING-ROWS.jsonl": {"rows": len(nearest)},
            "SELECTED-PROMPT-CONFLICTS.jsonl": {"rows": len(conflicts)},
            "REPORT.json": {"rows": 1},
        },
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    checksummed = sorted(path for path in output_dir.iterdir() if path.is_file())
    write_text_atomic(
        output_dir / "OUTPUT-SHA256SUMS",
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in checksummed),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

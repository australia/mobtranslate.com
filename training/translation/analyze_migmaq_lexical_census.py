#!/usr/bin/env python3
"""Produce reproducible coverage and review slices for the Mi'kmaq census."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any, Iterable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--generated-at-utc")
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def token_bucket(value: str) -> str:
    count = len(value.split())
    if count <= 4:
        return str(count)
    if count <= 8:
        return "5-8"
    return "9+"


def count_bucket(value: int) -> str:
    if value == 0:
        return "0"
    if value == 1:
        return "1"
    if value <= 3:
        return "2-3"
    if value <= 7:
        return "4-7"
    return "8+"


def character_bucket(value: str) -> str:
    count = len(value)
    if count <= 5:
        return "1-5"
    if count <= 10:
        return "6-10"
    if count <= 15:
        return "11-15"
    if count <= 20:
        return "16-20"
    return "21+"


def sorted_counter(counter: Counter[Any]) -> dict[str, int]:
    return {str(key): counter[key] for key in sorted(counter, key=lambda item: str(item))}


def build_analysis(program_root: Path, generated_at_utc: str) -> dict[str, Any]:
    paths = {
        "entries": program_root / "dictionary/entries.jsonl",
        "senses": program_root / "dictionary/sense-candidates.jsonl",
        "forms": program_root / "dictionary/forms-raw.jsonl",
        "examples": program_root / "dictionary/examples.jsonl",
        "census": program_root / "benchmarks/lexical/lexical-census.eng-mic.jsonl",
        "ready": program_root / "benchmarks/lexical/benchmark-ready.eng-mic.jsonl",
        "review": program_root / "benchmarks/lexical/review-queue.jsonl",
    }
    for path in paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)
    entries = read_jsonl(paths["entries"])
    senses = read_jsonl(paths["senses"])
    forms = read_jsonl(paths["forms"])
    examples = read_jsonl(paths["examples"])
    census = read_jsonl(paths["census"])
    ready = read_jsonl(paths["ready"])
    review = read_jsonl(paths["review"])

    entry_by_id = {row["id"]: row for row in entries}
    all_entry_ids = set(entry_by_id)
    ready_entry_ids = {entry_id for row in ready for entry_id in row["source_entry_ids"]}
    ambiguous_groups = [row for row in census if row["distinct_target_count"] > 1]
    ambiguous_entry_ids = {
        entry_id
        for row in ambiguous_groups
        for target in row["targets"]
        for entry_id in target["entry_ids"]
    }
    missing_gloss_entry_ids = {row["entry_id"] for row in review if row["review_kind"] == "entry_without_english_gloss"}

    entry_coverage_by_pos: dict[str, Counter[str]] = defaultdict(Counter)
    for entry in entries:
        pos = entry["part_of_speech"] or "(missing)"
        entry_coverage_by_pos[pos]["total"] += 1
        if entry["id"] in ready_entry_ids:
            entry_coverage_by_pos[pos]["ready"] += 1
        if entry["id"] in ambiguous_entry_ids:
            entry_coverage_by_pos[pos]["ambiguous"] += 1
        if entry["id"] in ambiguous_entry_ids and entry["id"] not in ready_entry_ids:
            entry_coverage_by_pos[pos]["ambiguous_only"] += 1
        if entry["id"] in missing_gloss_entry_ids:
            entry_coverage_by_pos[pos]["missing_gloss"] += 1

    groups_by_pos: dict[str, Counter[str]] = defaultdict(Counter)
    for row in census:
        pos = row["part_of_speech"] or "(missing)"
        groups_by_pos[pos]["all"] += 1
        groups_by_pos[pos]["ready" if row["distinct_target_count"] == 1 else "ambiguous"] += 1

    ready_token_buckets = Counter(token_bucket(row["unconditioned_input_text"]) for row in ready)
    target_character_buckets = Counter()
    target_apostrophe = Counter()
    legacy_split_sets = Counter()
    for row in ready:
        for reference in row["accepted_references"]:
            target_character_buckets[character_bucket(reference)] += 1
            target_apostrophe["apostrophe" if "'" in reference or "’" in reference else "no_apostrophe"] += 1
        legacy_split_sets["+".join(row["legacy_v1_splits"]) or "(not_crosswalked)"] += 1

    ambiguity_target_histogram = Counter(row["distinct_target_count"] for row in ambiguous_groups)
    ambiguity_by_pos = Counter(row["part_of_speech"] or "(missing)" for row in ambiguous_groups)
    largest_ambiguities = sorted(
        (
            {
                "id": row["id"],
                "input_text": row["input_text"],
                "part_of_speech": row["part_of_speech"],
                "distinct_target_count": row["distinct_target_count"],
                "headwords": [headword for target in row["targets"] for headword in target["headwords"]],
            }
            for row in ambiguous_groups
        ),
        key=lambda row: (-row["distinct_target_count"], row["input_text"], row["id"]),
    )[:100]

    forms_by_entry = Counter(row["entry_id"] for row in forms)
    examples_by_entry = Counter(row["entry_id"] for row in examples)
    form_count_buckets = Counter(count_bucket(forms_by_entry.get(entry_id, 0)) for entry_id in all_entry_ids)
    example_count_buckets = Counter(count_bucket(examples_by_entry.get(entry_id, 0)) for entry_id in all_entry_ids)
    form_labels = Counter(row["grammatical_label"] for row in forms if row.get("grammatical_label"))
    form_labels_by_pos: dict[str, Counter[str]] = defaultdict(Counter)
    for row in forms:
        if row.get("grammatical_label"):
            form_labels_by_pos[row["part_of_speech"] or "(missing)"][row["grammatical_label"]] += 1

    sense_source_kinds = Counter(row["candidate_kind"] for row in senses)
    sense_token_buckets = Counter(token_bucket(row["english_gloss"]) for row in senses)
    ready_sense_ids = {sense_id for row in ready for sense_id in row["source_gloss_candidate_ids"]}

    return {
        "schema_version": 1,
        "program_id": "migmaq-listuguj-v2",
        "generated_at_utc": generated_at_utc,
        "analysis_kind": "pre_model_lexical_coverage_and_ambiguity_slices",
        "inputs": {
            name: {"path": str(path.resolve()), "sha256": sha256(path)}
            for name, path in paths.items()
        },
        "coverage": {
            "entries_total": len(entries),
            "entries_with_at_least_one_ready_prompt": len(ready_entry_ids),
            "entries_with_at_least_one_ambiguous_prompt": len(ambiguous_entry_ids),
            "entries_ambiguous_only": len(ambiguous_entry_ids - ready_entry_ids),
            "entries_missing_gloss": len(missing_gloss_entry_ids),
            "entries_neither_ready_ambiguous_nor_missing": len(
                all_entry_ids - ready_entry_ids - ambiguous_entry_ids - missing_gloss_entry_ids
            ),
            "source_gloss_candidates_total": len(senses),
            "source_gloss_candidates_in_ready_rows": len(ready_sense_ids),
            "prompt_pos_groups_total": len(census),
            "prompt_pos_groups_ready": len(ready),
            "prompt_pos_groups_ambiguous": len(ambiguous_groups),
            "entry_coverage_by_part_of_speech": {
                pos: sorted_counter(counts) for pos, counts in sorted(entry_coverage_by_pos.items())
            },
            "groups_by_part_of_speech": {
                pos: sorted_counter(counts) for pos, counts in sorted(groups_by_pos.items())
            },
        },
        "ready_benchmark_slices": {
            "english_token_count": sorted_counter(ready_token_buckets),
            "target_character_count": sorted_counter(target_character_buckets),
            "target_apostrophe": sorted_counter(target_apostrophe),
            "legacy_v1_split_sets": sorted_counter(legacy_split_sets),
            "source_candidate_kind": sorted_counter(sense_source_kinds),
            "source_gloss_token_count": sorted_counter(sense_token_buckets),
        },
        "ambiguity": {
            "target_count_histogram": sorted_counter(ambiguity_target_histogram),
            "groups_by_part_of_speech": sorted_counter(ambiguity_by_pos),
            "largest_100_groups": largest_ambiguities,
            "interpretation": "These groups require relation classification; multiple targets are not automatically accepted synonyms.",
        },
        "morphology_source_surface": {
            "raw_form_rows": len(forms),
            "source_layout_recovered": sum(row["structure_parse_status"] == "source_layout_recovered_unadjudicated" for row in forms),
            "unparsed": sum(row["structure_parse_status"] == "unparsed" for row in forms),
            "entries_with_forms": len(forms_by_entry),
            "forms_per_entry": sorted_counter(form_count_buckets),
            "unique_raw_labels": len(form_labels),
            "raw_label_counts": sorted_counter(form_labels),
            "raw_label_counts_by_part_of_speech": {
                pos: sorted_counter(counts) for pos, counts in sorted(form_labels_by_pos.items())
            },
            "interpretation": "Recovered fields reflect the source list layout only; labels and forms are not yet adjudicated paradigm analyses.",
        },
        "natural_example_surface": {
            "example_rows": len(examples),
            "entries_with_examples": len(examples_by_entry),
            "examples_per_entry": sorted_counter(example_count_buckets),
            "interpretation": "Rows come from one dictionary source ecosystem and do not constitute independent speaker/text clusters.",
        },
        "next_measurement": {
            "required": "Run the current v1 artifact over every ready development row and join predictions to these slices.",
            "prediction_fields": [
                "row_id", "model_id", "model_hash", "decoder_policy_hash", "prediction",
                "normalized_exact", "codepoint_cer", "grapheme_cer", "latency_ms",
            ],
            "mandatory_slices": [
                "part_of_speech", "English token count", "target character count", "apostrophe",
                "legacy split", "source candidate kind", "tokenizer fertility", "lineage exposure",
            ],
            "claim_limit": "Coverage analysis is not a model result; do not generate corrective synthetic data until predictions identify measured failure cells.",
        },
    }


def write_json_atomic(path: Path, value: Any, replace: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not replace:
        raise FileExistsError(f"refusing existing output without --replace: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    output = args.output or args.program_root / "analysis/inventories/lexical-coverage-slices.json"
    generated_at = args.generated_at_utc or datetime.now(timezone.utc).isoformat()
    analysis = build_analysis(args.program_root, generated_at)
    write_json_atomic(output, analysis, args.replace)
    print(json.dumps({"output": str(output), "sha256": sha256(output), "coverage": analysis["coverage"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

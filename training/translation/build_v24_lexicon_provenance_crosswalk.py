#!/usr/bin/env python3
"""Crosswalk v24 grammar-extracted lexical prompts against the curated dictionary."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import unicodedata
from typing import Any

import yaml


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexical-pairs", type=Path, required=True)
    parser.add_argument("--dictionary", type=Path, required=True)
    parser.add_argument("--output-jsonl", type=Path, required=True)
    parser.add_argument("--summary-output", type=Path, required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).casefold().split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"expected object at {path}:{line_number}")
            rows.append(row)
    if not rows:
        raise ValueError(f"no rows in {path}")
    return rows


def load_dictionary(path: Path) -> list[dict[str, Any]]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    words = payload.get("words") if isinstance(payload, dict) else None
    if not isinstance(words, list) or not words:
        raise ValueError(f"dictionary has no words list: {path}")
    if any(not isinstance(entry, dict) or not normalize(entry.get("word")) for entry in words):
        raise ValueError(f"dictionary contains a malformed word entry: {path}")
    return words


def canonical_senses(entry: dict[str, Any]) -> set[str]:
    values = [entry.get("gloss")]
    values.extend(entry.get("translations") or [])
    values.extend(entry.get("definitions") or [])
    return {normalize(value) for value in values if normalize(value)}


def public_dictionary_entry(index: int, entry: dict[str, Any], prompt: str) -> dict[str, Any]:
    fields = (
        "word",
        "type",
        "gloss",
        "definitions",
        "translations",
        "examples",
        "usages",
        "verb_class",
        "derivation",
        "reduplication",
        "semantic_domain",
        "loanword",
        "dialect",
        "source",
        "needs_review",
        "commentary",
    )
    result = {field: entry[field] for field in fields if field in entry}
    result["canonical_index"] = index
    result["exact_prompt_match"] = normalize(prompt) in canonical_senses(entry)
    return result


def build_crosswalk(
    lexical_rows: list[dict[str, Any]], dictionary_entries: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    dictionary_by_headword: dict[str, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    for index, entry in enumerate(dictionary_entries):
        dictionary_by_headword[normalize(entry["word"])].append((index, entry))

    output: list[dict[str, Any]] = []
    status_counts: Counter[str] = Counter()
    part_of_speech_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for row in lexical_rows:
        row_id = str(row.get("id") or "")
        prompt = str(row.get("unconditioned_input_text") or row.get("input_text") or "")
        selected = str(row.get("output_text") or "")
        if not row_id or not normalize(prompt) or not normalize(selected):
            raise ValueError(f"malformed lexical row: {row_id or '<missing id>'}")
        matches = dictionary_by_headword[normalize(selected)]
        public_matches = [public_dictionary_entry(index, entry, prompt) for index, entry in matches]
        if any(match["exact_prompt_match"] for match in public_matches):
            status = "curated_exact_headword_and_prompt"
        elif public_matches:
            status = "curated_headword_only"
        else:
            status = "grammar_extraction_only_unadjudicated"
        status_counts[status] += 1
        for pos in (row.get("lexicon") or {}).get("parts_of_speech") or ["unknown"]:
            part_of_speech_counts[status][str(pos)] += 1
        output.append(
            {
                "schema_version": 1,
                "lexical_pair_id": row_id,
                "prompt": prompt,
                "selected_form": selected,
                "accepted_references": row.get("accepted_references") or [selected],
                "grammar_extraction_entry_ids": (row.get("lexicon") or {}).get("entry_ids") or [],
                "grammar_extraction_parts_of_speech": (row.get("lexicon") or {}).get("parts_of_speech") or [],
                "crosswalk_status": status,
                "curated_dictionary_matches": public_matches,
                "automatic_sentence_generation_authorized": False,
                "required_next_action": (
                    "review sense, variety, morphology, rights, and sentence frame before generation"
                ),
            }
        )

    summary = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "structured_exact_provenance_crosswalk_not_semantic_adjudication",
        "lexical_rows": len(lexical_rows),
        "curated_dictionary_rows": len(dictionary_entries),
        "crosswalk_status_counts": dict(sorted(status_counts.items())),
        "part_of_speech_by_status": {
            status: dict(sorted(counts.items())) for status, counts in sorted(part_of_speech_counts.items())
        },
        "interpretation": [
            "An exact match establishes a structured crosswalk, not speaker approval or semantic interchangeability.",
            "A grammar-extraction-only row is unresolved, not automatically invalid.",
            "No row is automatically authorized for synthetic sentence generation.",
        ],
    }
    return output, summary


def write_json_atomic(path: Path, value: Any, jsonl: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        if jsonl:
            for row in value:
                handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        else:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    for path in (args.lexical_pairs, args.dictionary):
        if not path.is_file():
            raise FileNotFoundError(path)
    rows = read_jsonl(args.lexical_pairs)
    dictionary = load_dictionary(args.dictionary)
    crosswalk, summary = build_crosswalk(rows, dictionary)
    summary["inputs"] = {
        "lexical_pairs": {"path": str(args.lexical_pairs.resolve()), "sha256": sha256(args.lexical_pairs)},
        "dictionary": {"path": str(args.dictionary.resolve()), "sha256": sha256(args.dictionary)},
    }
    summary["output_jsonl"] = str(args.output_jsonl.resolve())
    write_json_atomic(args.output_jsonl, crosswalk, jsonl=True)
    write_json_atomic(args.summary_output, summary)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

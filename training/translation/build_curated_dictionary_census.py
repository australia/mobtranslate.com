#!/usr/bin/env python3
"""Build an immutable closed-set lexical census from the curated dictionary YAML."""

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
    parser.add_argument("--dictionary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest-output", type=Path, required=True)
    parser.add_argument("--language", default="kuku_yalanji")
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--task-prefix", default="<lexeme>")
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


def load_dictionary(path: Path) -> list[dict[str, Any]]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    words = payload.get("words") if isinstance(payload, dict) else None
    if not isinstance(words, list) or not words:
        raise ValueError(f"dictionary has no words list: {path}")
    return words


def prompt_values(entry: dict[str, Any]) -> list[tuple[str, str]]:
    translations = [clean(value) for value in entry.get("translations") or [] if clean(value)]
    if translations:
        return [(value, "translation") for value in translations]
    gloss = clean(entry.get("gloss"))
    return [(gloss, "gloss_fallback")] if gloss else []


def stable_id(language: str, prompt: str) -> str:
    digest = hashlib.sha256(f"{language}\0{normalize(prompt)}".encode()).hexdigest()[:20]
    return f"curated-lexeme-census:{language}:{digest}"


def entry_record(index: int, entry: dict[str, Any], prompt_source: str) -> dict[str, Any]:
    fields = (
        "word",
        "type",
        "gloss",
        "semantic_domain",
        "verb_class",
        "derivation",
        "reduplication",
        "dialect",
        "source",
        "loanword",
        "examples",
    )
    result = {field: entry[field] for field in fields if field in entry}
    result["canonical_index"] = index
    result["prompt_source"] = prompt_source
    return result


def build_rows(
    entries: list[dict[str, Any]],
    language: str,
    direction: str,
    source_lang: str,
    target_lang: str,
    task_prefix: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    exclusions: Counter[str] = Counter()
    included_entry_indices: set[int] = set()
    for index, entry in enumerate(entries):
        headword = clean(entry.get("word"))
        if not headword:
            exclusions["missing_headword"] += 1
            continue
        if entry.get("needs_review"):
            exclusions["needs_review"] += 1
            continue
        prompts = prompt_values(entry)
        if not prompts:
            exclusions["missing_translation_and_gloss"] += 1
            continue
        included_entry_indices.add(index)
        for prompt, prompt_source in prompts:
            grouped[normalize(prompt)].append(
                {
                    "headword": headword,
                    "prompt": prompt,
                    "entry": entry_record(index, entry, prompt_source),
                }
            )

    rows: list[dict[str, Any]] = []
    for normalized_prompt, mappings in sorted(grouped.items()):
        display_prompt = mappings[0]["prompt"]
        references: list[str] = []
        seen_references: set[str] = set()
        for mapping in mappings:
            normalized_reference = normalize(mapping["headword"])
            if normalized_reference not in seen_references:
                seen_references.add(normalized_reference)
                references.append(mapping["headword"])
        rows.append(
            {
                "schema_version": 1,
                "id": stable_id(language, normalized_prompt),
                "language": language,
                "direction": direction,
                "input_text": f"{task_prefix} {display_prompt}",
                "unconditioned_input_text": display_prompt,
                "output_text": references[0],
                "accepted_references": references,
                "pair_kind": "curated_dictionary_closed_set_census",
                "source_lang": source_lang,
                "target_lang": target_lang,
                "task_tagging": {"enabled": True, "task": "lexeme", "template": f"{task_prefix} {{input_text}}"},
                "curated_dictionary": {
                    "normalized_prompt": normalized_prompt,
                    "ambiguous_surface_prompt": len(references) > 1,
                    "identity_translation": normalized_prompt in seen_references,
                    "entry_records": [mapping["entry"] for mapping in mappings],
                },
                "promotion_eligible": False,
                "interpretation": "closed-set curated dictionary reconstruction; not sentence-translation evidence",
            }
        )

    summary = {
        "dictionary_rows": len(entries),
        "included_dictionary_rows": len(included_entry_indices),
        "excluded_dictionary_rows": sum(exclusions.values()),
        "exclusions": dict(sorted(exclusions.items())),
        "unique_prompts": len(rows),
        "prompt_headword_mappings": sum(len(row["curated_dictionary"]["entry_records"]) for row in rows),
        "unique_prompt_headword_mappings": sum(len(row["accepted_references"]) for row in rows),
        "ambiguous_surface_prompts": sum(row["curated_dictionary"]["ambiguous_surface_prompt"] for row in rows),
        "identity_translation_prompts": sum(row["curated_dictionary"]["identity_translation"] for row in rows),
        "single_source_word_prompts": sum(len(row["unconditioned_input_text"].split()) == 1 for row in rows),
        "single_source_and_target_word_prompts": sum(
            len(row["unconditioned_input_text"].split()) == 1
            and all(len(reference.split()) == 1 for reference in row["accepted_references"])
            for row in rows
        ),
    }
    return rows, summary


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
    if not args.dictionary.is_file():
        raise FileNotFoundError(args.dictionary)
    entries = load_dictionary(args.dictionary)
    rows, counts = build_rows(
        entries,
        args.language,
        args.direction,
        args.source_lang,
        args.target_lang,
        args.task_prefix,
    )
    manifest = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "frozen_before_v24_candidate_inference",
        "analysis_kind": "exploratory_curated_dictionary_closed_set_census",
        "counts": counts,
        "construction": {
            "prompt_source": "all non-empty translations; gloss only when translations are absent",
            "grouping": "NFC casefolded whitespace-normalized English prompt",
            "references": "all curated headwords attached to the grouped prompt in canonical source order",
            "exclusions": "entries flagged needs_review, entries without headwords, and entries without translations or gloss",
            "task_prefix": args.task_prefix,
        },
        "interpretation": [
            "This is a full curated-resource census, not a random sample of user queries.",
            "Accepted-reference exact match does not resolve sense, register, variety, or contextual morphology.",
            "The census measures lexical reconstruction only and cannot authorize sentence generation.",
            "No v24 candidate output was inspected when this file was frozen.",
        ],
        "inputs": {
            "dictionary": {"path": str(args.dictionary.resolve()), "sha256": sha256(args.dictionary)},
            "builder": {"path": str(Path(__file__).resolve()), "sha256": sha256(Path(__file__))},
        },
        "output": {"path": str(args.output.resolve())},
    }
    write_json_atomic(args.output, rows, jsonl=True)
    manifest["output"]["sha256"] = sha256(args.output)
    write_json_atomic(args.manifest_output, manifest)
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

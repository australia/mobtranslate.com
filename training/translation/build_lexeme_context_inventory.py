#!/usr/bin/env python3
"""Build a sense-preserving inventory of sentence-context evidence for curated headwords."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unicodedata
from typing import Any, Iterable


TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-'][^\W\d_]+)*|\d+", re.UNICODE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--curated-census", type=Path, required=True)
    parser.add_argument("--synthetic-train", type=Path, required=True)
    parser.add_argument("--usage-file", type=Path, required=True)
    parser.add_argument("--xigt-audit-rows", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary-output", type=Path, required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).casefold().split())


def surface_key(value: Any) -> str:
    return " ".join(TOKEN_RE.findall(normalize(value)))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                yield json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error


def present_headwords(text: Any, headwords: set[str], maximum_tokens: int) -> set[str]:
    tokens = TOKEN_RE.findall(normalize(text))
    result = set()
    for size in range(1, min(maximum_tokens, len(tokens)) + 1):
        for offset in range(len(tokens) - size + 1):
            candidate = " ".join(tokens[offset : offset + size])
            if candidate in headwords:
                result.add(candidate)
    return result


def clean_record(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if value not in (None, "", [], {})}


def unique_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for record in records:
        key = json.dumps(record, ensure_ascii=False, sort_keys=True)
        if key not in seen:
            seen.add(key)
            result.append(record)
    return result


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
    temporary.chmod(0o664)
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    states: dict[str, dict[str, Any]] = {}
    for row in read_jsonl(args.curated_census):
        references = [surface_key(value) for value in row.get("accepted_references") or []]
        entry_records = (row.get("curated_dictionary") or {}).get("entry_records") or []
        for headword in references:
            if not headword:
                continue
            state = states.setdefault(
                headword,
                {
                    "display_forms": [],
                    "entry_records": [],
                    "prompt_records": [],
                    "synthetic_explicit_rows": 0,
                    "synthetic_surface_rows": 0,
                    "synthetic_quality_tiers": Counter(),
                    "usage_rows": 0,
                    "usage_verified_rows": 0,
                    "usage_unverified_rows": 0,
                    "xigt_source_backed_rows": 0,
                    "xigt_source_backed_clause_rows": 0,
                    "xigt_minimum_line_distance": None,
                },
            )
            state["display_forms"].extend(
                value for value in row.get("accepted_references") or [] if surface_key(value) == headword
            )
            state["entry_records"].extend(
                clean_record(record)
                for record in entry_records
                if surface_key(record.get("word")) == headword
            )
            state["prompt_records"].append(
                {
                    "id": row.get("id"),
                    "prompt": row.get("unconditioned_input_text"),
                    "ambiguous_surface_prompt": bool(
                        (row.get("curated_dictionary") or {}).get("ambiguous_surface_prompt")
                    ),
                    "identity_translation": bool(
                        (row.get("curated_dictionary") or {}).get("identity_translation")
                    ),
                }
            )

    headwords = set(states)
    if not headwords:
        raise ValueError("curated census yielded no headwords")
    maximum_tokens = max(len(headword.split()) for headword in headwords)

    for row in read_jsonl(args.synthetic_train):
        metadata = row.get("meta") or {}
        explicit = {
            surface_key(value) for value in metadata.get("lexical_targets") or []
        }.intersection(headwords)
        surface = present_headwords(row.get("ku") or row.get("output_text"), headwords, maximum_tokens)
        for headword in explicit:
            states[headword]["synthetic_explicit_rows"] += 1
            states[headword]["synthetic_quality_tiers"][str(metadata.get("quality_tier") or "unknown")] += 1
        for headword in surface:
            states[headword]["synthetic_surface_rows"] += 1

    for row in read_jsonl(args.usage_file):
        usage = row.get("db_usage_example") or {}
        headword = surface_key(usage.get("word") or (row.get("word") or {}).get("headword"))
        if headword not in states:
            continue
        verified = usage.get("is_verified") is True
        states[headword]["usage_rows"] += 1
        states[headword]["usage_verified_rows"] += int(verified)
        states[headword]["usage_unverified_rows"] += int(not verified)

    for row in read_jsonl(args.xigt_audit_rows):
        if not row.get("source_backed_same_chunk"):
            continue
        present = present_headwords(row.get("transcript"), headwords, maximum_tokens)
        for headword in present:
            state = states[headword]
            state["xigt_source_backed_rows"] += 1
            state["xigt_source_backed_clause_rows"] += int(row.get("candidate_kind") == "clause_like")
            distance = row.get("minimum_source_line_distance")
            if distance is not None:
                current = state["xigt_minimum_line_distance"]
                state["xigt_minimum_line_distance"] = distance if current is None else min(current, distance)

    output_rows = []
    for headword, state in sorted(states.items()):
        records = unique_records(state["entry_records"])
        prompts = unique_records(state["prompt_records"])
        synthetic_explicit = int(state["synthetic_explicit_rows"])
        synthetic_surface = int(state["synthetic_surface_rows"])
        usage_rows = int(state["usage_rows"])
        xigt_rows = int(state["xigt_source_backed_rows"])
        output_rows.append(
            {
                "schema_version": 1,
                "headword": state["display_forms"][0] if state["display_forms"] else headword,
                "normalized_headword": headword,
                "entry_records": records,
                "prompt_records": prompts,
                "parts_of_speech": sorted(
                    {normalize(record.get("type")) for record in records if normalize(record.get("type"))}
                ),
                "semantic_domains": sorted(
                    {
                        normalize(record.get("semantic_domain"))
                        for record in records
                        if normalize(record.get("semantic_domain"))
                    }
                ),
                "dictionary_sources": sorted(
                    {normalize(record.get("source")) for record in records if normalize(record.get("source"))}
                ),
                "dialects": sorted(
                    {normalize(record.get("dialect")) for record in records if normalize(record.get("dialect"))}
                ),
                "context_evidence": {
                    "synthetic_explicit_rows": synthetic_explicit,
                    "synthetic_surface_rows": synthetic_surface,
                    "synthetic_quality_tiers": dict(sorted(state["synthetic_quality_tiers"].items())),
                    "usage_rows": usage_rows,
                    "usage_verified_rows": int(state["usage_verified_rows"]),
                    "usage_unverified_rows": int(state["usage_unverified_rows"]),
                    "xigt_source_backed_rows": xigt_rows,
                    "xigt_source_backed_clause_rows": int(state["xigt_source_backed_clause_rows"]),
                    "xigt_minimum_source_line_distance": state["xigt_minimum_line_distance"],
                },
                "coverage_flags": {
                    "has_synthetic_explicit_context": synthetic_explicit > 0,
                    "has_synthetic_surface_context": synthetic_surface > 0,
                    "has_usage_context": usage_rows > 0,
                    "has_source_backed_xigt_context": xigt_rows > 0,
                    "has_any_identified_context": any(
                        (synthetic_explicit, synthetic_surface, usage_rows, xigt_rows)
                    ),
                },
                "automatic_sentence_generation_authorized": False,
                "required_next_action": (
                    "join model failures, adjudicate sense/POS/variety and evidence quality, then decide whether "
                    "to validate an existing context or commission a new sentence"
                ),
            }
        )

    flags = Counter()
    for row in output_rows:
        for flag, value in row["coverage_flags"].items():
            flags[flag] += int(value)
    summary = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "curated_headword_sentence_context_inventory",
        "headwords": len(output_rows),
        "maximum_headword_tokens": maximum_tokens,
        "coverage_flag_counts": dict(sorted(flags.items())),
        "zero_identified_context_headwords": sum(
            not row["coverage_flags"]["has_any_identified_context"] for row in output_rows
        ),
        "inputs": {
            "curated_census": {"path": str(args.curated_census.resolve()), "sha256": sha256(args.curated_census)},
            "synthetic_train": {"path": str(args.synthetic_train.resolve()), "sha256": sha256(args.synthetic_train)},
            "usage_file": {"path": str(args.usage_file.resolve()), "sha256": sha256(args.usage_file)},
            "xigt_audit_rows": {"path": str(args.xigt_audit_rows.resolve()), "sha256": sha256(args.xigt_audit_rows)},
        },
        "interpretation": [
            "Coverage is surface or metadata evidence, not proof that a sentence uses the intended sense or morphology.",
            "Usage rows are counted with their verification state; XIGT rows retain their separate source-review state.",
            "No row in this inventory automatically authorizes synthetic generation or model training.",
        ],
        "output": {"path": str(args.output.resolve())},
    }
    write_json_atomic(args.output, output_rows, jsonl=True)
    summary["output"]["sha256"] = sha256(args.output)
    write_json_atomic(args.summary_output, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

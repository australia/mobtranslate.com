#!/usr/bin/env python3
"""Audit extracted XIGT examples against source chunks and documented training data."""

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
from typing import Any


TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-'][^\W\d_]+)*|\d+", re.UNICODE)
TASK_PREFIX_RE = re.compile(r"^\s*<[^>]+>\s*")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--examples-json", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--source-glob", default="*.md")
    parser.add_argument("--training-file", action="append", type=Path, default=[])
    parser.add_argument("--prompt-document", action="append", type=Path, default=[])
    parser.add_argument("--output-summary", type=Path, required=True)
    parser.add_argument("--output-rows", type=Path, required=True)
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


def source_index(paths: list[Path]) -> list[dict[str, Any]]:
    result = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        result.append(
            {
                "path": str(path.resolve()),
                "name": path.name,
                "normalized": normalize(text),
                "surface": surface_key(text),
                "normalized_lines": [normalize(line) for line in text.splitlines()],
                "surface_lines": [surface_key(line) for line in text.splitlines()],
            }
        )
    return result


def matching_chunks(value: str, sources: list[dict[str, Any]], key: str) -> list[str]:
    if not value:
        return []
    return [source["name"] for source in sources if value in source[key]]


def line_positions(value: str, sources: list[dict[str, Any]], key: str) -> list[tuple[str, int]]:
    if not value:
        return []
    result = []
    line_key = f"{key}_lines"
    for source in sources:
        for line_number, line in enumerate(source[line_key], start=1):
            if value in line:
                result.append((source["name"], line_number))
    return result


def closest_line_anchor(
    target_positions: list[tuple[str, int]], translation_positions: list[tuple[str, int]]
) -> dict[str, Any] | None:
    candidates = [
        (abs(target_line - translation_line), chunk, target_line, translation_line)
        for chunk, target_line in target_positions
        for translation_chunk, translation_line in translation_positions
        if chunk == translation_chunk
    ]
    if not candidates:
        return None
    distance, chunk, target_line, translation_line = min(candidates)
    return {
        "source_chunk": chunk,
        "target_line": target_line,
        "translation_line": translation_line,
        "line_distance": distance,
    }


def distance_bucket(value: int) -> str:
    if value == 0:
        return "0_same_line"
    if value <= 2:
        return "1-2_lines"
    if value <= 5:
        return "3-5_lines"
    if value <= 10:
        return "6-10_lines"
    if value <= 25:
        return "11-25_lines"
    return "26+_lines"


def read_training_pairs(paths: list[Path]) -> tuple[set[tuple[str, str]], Counter[str]]:
    pairs: set[tuple[str, str]] = set()
    target_surfaces: Counter[str] = Counter()
    for path in paths:
        with path.open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
                source = row.get("unconditioned_input_text") or row.get("input_text") or row.get("en") or ""
                source = TASK_PREFIX_RE.sub("", str(source), count=1)
                target = row.get("output_text") or row.get("ku") or ""
                source_normalized = normalize(source)
                target_normalized = normalize(target)
                target_surface = surface_key(target_normalized)
                if source_normalized and target_normalized:
                    pairs.add((source_normalized, target_normalized))
                if target_surface:
                    target_surfaces[target_surface] += 1
    return pairs, target_surfaces


def candidate_kind(transcript: str, translation: str) -> str:
    target_words = len(TOKEN_RE.findall(transcript))
    source_words = len(TOKEN_RE.findall(translation))
    if target_words <= 1:
        return "lexical"
    if target_words <= 3 or source_words <= 3:
        return "phrasal"
    return "clause_like"


def alignment_status(
    exact_target: list[str],
    exact_translation: list[str],
    surface_target: list[str],
    surface_translation: list[str],
) -> str:
    if set(exact_target).intersection(exact_translation):
        return "exact_both_same_source_chunk"
    if set(surface_target).intersection(surface_translation):
        return "surface_both_same_source_chunk"
    target_found = bool(exact_target or surface_target)
    translation_found = bool(exact_translation or surface_translation)
    if target_found and translation_found:
        return "both_in_different_source_chunks"
    if target_found:
        return "target_only"
    if translation_found:
        return "translation_only"
    return "no_source_anchor"


def load_examples(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("items") if isinstance(payload, dict) else payload
    if not isinstance(rows, list) or not rows:
        raise ValueError("examples JSON must contain a non-empty items array")
    return rows


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.chmod(0o664)
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.chmod(0o664)
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    source_paths = sorted(args.source_dir.glob(args.source_glob))
    if not source_paths:
        raise SystemExit("source glob matched no files")
    sources = source_index(source_paths)
    examples = load_examples(args.examples_json)
    training_pairs, target_surfaces = read_training_pairs(args.training_file)
    prompt_surface = ""
    if args.prompt_document:
        prompt_surface = "\n".join(
            surface_key(path.read_text(encoding="utf-8")) for path in args.prompt_document
        )

    output_rows = []
    for index, example in enumerate(examples):
        transcript = normalize(example.get("transcript"))
        translation = normalize(example.get("translation"))
        transcript_surface = surface_key(transcript)
        translation_surface = surface_key(translation)
        exact_target = matching_chunks(transcript, sources, "normalized")
        exact_translation = matching_chunks(translation, sources, "normalized")
        surface_target = matching_chunks(transcript_surface, sources, "surface")
        surface_translation = matching_chunks(translation_surface, sources, "surface")
        status = alignment_status(exact_target, exact_translation, surface_target, surface_translation)
        exact_anchor = closest_line_anchor(
            line_positions(transcript, sources, "normalized"),
            line_positions(translation, sources, "normalized"),
        )
        surface_anchor = closest_line_anchor(
            line_positions(transcript_surface, sources, "surface"),
            line_positions(translation_surface, sources, "surface"),
        )
        closest_anchor = exact_anchor or surface_anchor
        if closest_anchor:
            closest_anchor["match_kind"] = "exact" if exact_anchor else "surface"
        prompt_pair = bool(
            transcript_surface
            and translation_surface
            and transcript_surface in prompt_surface
            and translation_surface in prompt_surface
        )
        output_rows.append(
            {
                "schema_version": 1,
                "example_index": index,
                "transcript": example.get("transcript"),
                "translation": example.get("translation"),
                "gloss": example.get("gloss"),
                "extracted_source_label": example.get("source"),
                "candidate_kind": candidate_kind(transcript, translation),
                "alignment_status": status,
                "source_backed_same_chunk": status in {
                    "exact_both_same_source_chunk",
                    "surface_both_same_source_chunk",
                },
                "exact_target_chunks": exact_target,
                "exact_translation_chunks": exact_translation,
                "surface_target_chunks": surface_target,
                "surface_translation_chunks": surface_translation,
                "closest_source_line_anchor": closest_anchor,
                "minimum_source_line_distance": (
                    closest_anchor["line_distance"] if closest_anchor else None
                ),
                "prompt_document_pair_present": prompt_pair,
                "prompt_contamination_candidate": prompt_pair and status == "no_source_anchor",
                "exact_pair_in_documented_training": (translation, transcript) in training_pairs,
                "target_surface_occurrences_in_documented_training": int(target_surfaces[transcript_surface]),
                "automatic_training_authorized": False,
                "required_next_action": (
                    "verify against the cited grammar page, confirm transcription/gloss/translation and variety, "
                    "resolve rights and governance, then assign a split by source cluster"
                ),
            }
        )

    status_counts = Counter(row["alignment_status"] for row in output_rows)
    kind_counts = Counter(row["candidate_kind"] for row in output_rows)
    backed_by_kind = Counter(
        row["candidate_kind"] for row in output_rows if row["source_backed_same_chunk"]
    )
    line_distance_counts = Counter(
        distance_bucket(row["minimum_source_line_distance"])
        for row in output_rows
        if row["minimum_source_line_distance"] is not None
    )
    unique_pairs = {
        (normalize(row["transcript"]), normalize(row["translation"])) for row in output_rows
    }
    summary = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "source_alignment_audit_of_extracted_xigt_examples",
        "examples": len(output_rows),
        "unique_normalized_pairs": len(unique_pairs),
        "alignment_status_counts": dict(sorted(status_counts.items())),
        "candidate_kind_counts": dict(sorted(kind_counts.items())),
        "source_backed_same_chunk_by_kind": dict(sorted(backed_by_kind.items())),
        "source_backed_same_chunk_total": sum(row["source_backed_same_chunk"] for row in output_rows),
        "closest_source_line_distance_counts": dict(sorted(line_distance_counts.items())),
        "prompt_contamination_candidates": sum(row["prompt_contamination_candidate"] for row in output_rows),
        "exact_pair_in_documented_training": sum(
            row["exact_pair_in_documented_training"] for row in output_rows
        ),
        "zero_target_surface_in_documented_training": sum(
            row["target_surface_occurrences_in_documented_training"] == 0 for row in output_rows
        ),
        "inputs": {
            "examples_json": {"path": str(args.examples_json.resolve()), "sha256": sha256(args.examples_json)},
            "source_chunks": [
                {"path": str(path.resolve()), "sha256": sha256(path)} for path in source_paths
            ],
            "training_files": [
                {"path": str(path.resolve()), "sha256": sha256(path)} for path in args.training_file
            ],
            "prompt_documents": [
                {"path": str(path.resolve()), "sha256": sha256(path)}
                for path in args.prompt_document
            ],
        },
        "interpretation": [
            "Same-chunk surface alignment is a triage signal, not a completed linguistic validation.",
            "Extracted rows remain unauthorized for training until source, rights, governance, variety, and split review.",
            "Rows found only in the extraction prompt are prompt-contamination candidates, not language evidence.",
        ],
    }
    write_json_atomic(args.output_summary, summary)
    write_jsonl_atomic(args.output_rows, output_rows)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

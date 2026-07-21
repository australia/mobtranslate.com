#!/usr/bin/env python3
"""Freeze an isolated-gloss Kuku Yalanji dictionary probe before inference."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


WORD_RE = re.compile(r"^[^\W\d_]+(?:[-'][^\W\d_]+)*$", re.UNICODE)
TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", re.UNICODE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexicon", type=Path, required=True)
    parser.add_argument("--training-file", type=Path, required=True)
    parser.add_argument("--elder-file", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--task-prefix", default="<translate>")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).casefold().split())


def tokens(text: str) -> set[str]:
    return {normalize(token) for token in TOKEN_RE.findall(text)}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
    return rows


def eligible_entries(lexicon: dict[str, Any]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for entry in lexicon.get("@graph", []):
        headword = entry.get("ontolex:canonicalForm", {}).get("ontolex:writtenRep", "")
        definition = entry.get("ontolex:sense", {}).get("ontolex:definition", {}).get("@value", "")
        if not isinstance(headword, str) or not isinstance(definition, str):
            continue
        headword = unicodedata.normalize("NFC", headword).strip()
        definition = unicodedata.normalize("NFC", definition).strip()
        if not WORD_RE.fullmatch(headword) or not WORD_RE.fullmatch(definition):
            continue
        # Uppercase material in this source is overwhelmingly names or grammatical
        # abbreviations. The probe is deliberately restricted to lowercase lexical forms.
        if headword != headword.lower() or definition != definition.lower():
            continue
        entries.append(
            {
                "entry_id": str(entry.get("@id", "")),
                "headword": headword,
                "definition": definition,
                "part_of_speech": str(entry.get("lexinfo:partOfSpeech", "unknown")),
            }
        )
    return entries


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    lexicon = json.loads(args.lexicon.read_text(encoding="utf-8"))
    entries = eligible_entries(lexicon)
    if not entries:
        raise SystemExit("no eligible lexicon entries")

    training_rows = read_jsonl(args.training_file)
    isolated_training_sources = {
        normalize(str(row.get("unconditioned_input_text") or row.get("input_text") or ""))
        for row in training_rows
    }
    training_target_tokens: set[str] = set()
    for row in training_rows:
        training_target_tokens.update(tokens(str(row.get("output_text") or "")))

    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for entry in entries:
        grouped[normalize(entry["definition"])].append(entry)

    rows: list[dict[str, Any]] = []
    for gloss in sorted(grouped):
        source_entries = grouped[gloss]
        accepted_references = list(dict.fromkeys(entry["headword"] for entry in source_entries))
        accepted_normalized = {normalize(reference) for reference in accepted_references}
        rows.append(
            {
                "id": f"kuku-lexicon-single-gloss:{gloss}",
                "direction": "eng-gvn",
                "input_text": f"{args.task_prefix} {gloss}",
                "unconditioned_input_text": gloss,
                "output_text": accepted_references[0],
                "accepted_references": accepted_references,
                "pair_kind": "dictionary_single_gloss_probe",
                "source_lang": "eng_Latn",
                "target_lang": "gvn_Latn",
                "lexicon_entry_ids": [entry["entry_id"] for entry in source_entries],
                "parts_of_speech": sorted({entry["part_of_speech"] for entry in source_entries}),
                "source_seen_as_isolated_training_input": gloss in isolated_training_sources,
                "target_seen_as_training_token": any(
                    reference in training_target_tokens for reference in accepted_normalized
                ),
                "identity_translation": gloss in accepted_normalized,
            }
        )

    probe_path = args.output_dir / "single_gloss_probe.eng-gvn.jsonl"
    probe_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )
    elder_rows = read_jsonl(args.elder_file)
    if not elder_rows or any(row.get("pair_kind") != "elder_sentence_pair_parallel" for row in elder_rows):
        raise ValueError("elder file must contain only elder_sentence_pair_parallel rows")
    combined_path = args.output_dir / "combined_lexicon_elder_probe.eng-gvn.jsonl"
    combined_path.write_text(
        "".join(
            json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
            for row in [*rows, *elder_rows]
        ),
        encoding="utf-8",
    )

    manifest = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "frozen_before_inference",
        "purpose": "Isolated English-gloss to Kuku Yalanji canonical-headword diagnostic.",
        "selection": {
            "entry_type": "Every @graph entry is considered; no semantic allowlist is used.",
            "form_rule": "Headword and English definition must each be one Unicode letter token, optionally internally hyphenated or apostrophized.",
            "case_rule": "Both forms must already be lowercase; names and uppercase grammatical abbreviations are excluded.",
            "grouping": "Casefolded NFC English gloss; every surviving headword in the group is an accepted reference.",
        },
        "interpretation": {
            "primary_endpoint": "normalized accepted-reference exact match",
            "secondary_endpoints": [
                "raw accepted-reference exact match",
                "accepted-headword token containment",
                "minimum character error rate",
                "maximum sentence chrF++ across accepted references",
            ],
            "warning": "This is a dictionary-coverage probe, not an estimate of unrestricted translation quality. Lexicon material may have influenced training-corpus construction.",
        },
        "counts": {
            "lexicon_graph_entries": len(lexicon.get("@graph", [])),
            "eligible_entries": len(entries),
            "unique_english_gloss_rows": len(rows),
            "rows_with_multiple_accepted_references": sum(
                len(row["accepted_references"]) > 1 for row in rows
            ),
            "source_seen_as_isolated_training_input": sum(
                row["source_seen_as_isolated_training_input"] for row in rows
            ),
            "target_seen_as_training_token": sum(row["target_seen_as_training_token"] for row in rows),
            "identity_translation": sum(row["identity_translation"] for row in rows),
        },
        "inputs": {
            "lexicon": {"path": str(args.lexicon), "sha256": sha256(args.lexicon)},
            "training_file": {
                "path": str(args.training_file),
                "sha256": sha256(args.training_file),
                "rows": len(training_rows),
            },
            "elder_file": {
                "path": str(args.elder_file),
                "sha256": sha256(args.elder_file),
                "rows": len(elder_rows),
            },
            "builder": {"path": str(Path(__file__).resolve()), "sha256": sha256(Path(__file__))},
        },
        "probe": {"path": str(probe_path), "sha256": sha256(probe_path)},
        "combined_probe": {
            "path": str(combined_path),
            "sha256": sha256(combined_path),
            "rows": len(rows) + len(elder_rows),
        },
    }
    manifest_path = args.output_dir / "probe_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    protocol = f"""# Kuku Yalanji Isolated-Lexicon Version Probe

Status: **frozen before model inference**  
Created: `{manifest['created_at']}`

## Question

Under one fixed decoder, what percentage of isolated English dictionary glosses does each model return as one of
the canonical Kuku Yalanji headwords recorded for that gloss? How does that result differ for target forms observed
or unobserved as complete tokens in v21.2 training outputs, and how do the same versions perform on the separate
43-row elder sentence corpus?

## Fixed construction

- Source lexicon SHA-256: `{manifest['inputs']['lexicon']['sha256']}`
- Training split SHA-256: `{manifest['inputs']['training_file']['sha256']}`
- Frozen probe SHA-256: `{manifest['probe']['sha256']}`
- Elder file SHA-256: `{manifest['inputs']['elder_file']['sha256']}`
- Combined inference file SHA-256: `{manifest['combined_probe']['sha256']}`
- Lexicon entries considered: {manifest['counts']['lexicon_graph_entries']}
- Eligible single-gloss entries: {manifest['counts']['eligible_entries']}
- Unique English prompts: {manifest['counts']['unique_english_gloss_rows']}
- Multi-reference prompts: {manifest['counts']['rows_with_multiple_accepted_references']}

The mechanical inclusion and grouping rules are recorded in `probe_manifest.json`. No prediction has been inspected
to add, remove, or rewrite a reference. Hyphens and apostrophes remain meaningful characters. Every canonical
headword sharing the same normalized English gloss is accepted; an arbitrary single-reference exact score is not
used as the primary word endpoint.

The combined inference file contains the dictionary rows followed by the unchanged 43 elder rows. The scorer splits
them by their structured `pair_kind`; they are never pooled into one metric.

## Fixed decoding and endpoints

All checkpoints will use: one beam, `no_repeat_ngram_size=4`, repetition penalty `1.10`, length penalty `1.0`.
The primary word endpoint is NFC/casefolded exact agreement with any accepted headword. Raw exact, token
containment, character error rate, chrF++, empty output, and source copying are secondary diagnostics. The elder set
is scored separately with corpus chrF++, exact match, empties, and paired row-level bootstrap intervals.

This probe is post-training and cannot affect checkpoint or decoder selection. It is not blind: the dictionary was
available during corpus construction, and the elder set has been observed in prior analyses. Results therefore
describe frozen regression and dictionary coverage, not independent population-level translation validity.
"""
    (args.output_dir / "PREREGISTRATION.md").write_text(protocol, encoding="utf-8")
    print(json.dumps(manifest["counts"], indent=2))


if __name__ == "__main__":
    main()

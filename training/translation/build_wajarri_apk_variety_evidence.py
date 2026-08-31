#!/usr/bin/env python3
"""Build exact variety-label evidence from the signed Bundiyarra Wajarri APK.

This inventory deliberately stops short of updating the living dictionary. It
records source-visible labels and byte lineage so later review can decide how a
label applies to a lexical sense, form, or synthetic construction.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable


INDEX_MEMBER = "assets/www/index.html"
DICTIONARY_MEMBER = "assets/www/wajarriDic19052015.json"
PARENTHETICAL_RE = re.compile(r"\(([^()]*)\)")
TITLE_TOKEN_RE = re.compile(r"^[A-Z][A-Za-z-]*$")


class ParagraphParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._paragraph_depth = 0
        self._parts: list[str] = []
        self.paragraphs: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        del attrs
        if tag.casefold() == "p":
            self._paragraph_depth += 1
            if self._paragraph_depth == 1:
                self._parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() != "p" or self._paragraph_depth == 0:
            return
        self._paragraph_depth -= 1
        if self._paragraph_depth == 0:
            paragraph = normalize_space(" ".join(self._parts))
            if paragraph:
                self.paragraphs.append(paragraph)
            self._parts = []

    def handle_data(self, data: str) -> None:
        if self._paragraph_depth > 0:
            self._parts.append(data)


@dataclass(frozen=True)
class BuildResult:
    manifest: dict[str, Any]
    report: dict[str, Any]
    rows: list[dict[str, Any]]


def normalize_space(value: str) -> str:
    return " ".join(value.split())


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )


def canonical_data_hash(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def parse_dictionary(value: bytes, label: str) -> list[dict[str, str]]:
    try:
        parsed = json.loads(value.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{label} is not valid UTF-8 JSON") from error
    if not isinstance(parsed, list):
        raise ValueError(f"{label} must contain a JSON array")

    required = ("Wajarri", "English", "description", "sound", "image")
    rows: list[dict[str, str]] = []
    for index, raw_row in enumerate(parsed, start=1):
        if not isinstance(raw_row, dict):
            raise ValueError(f"{label} row {index} must be an object")
        row: dict[str, str] = {}
        for field in required:
            value = raw_row.get(field)
            if not isinstance(value, str):
                raise ValueError(
                    f"{label} row {index} field {field!r} must be a string"
                )
            row[field] = value
        if set(raw_row) != set(required):
            raise ValueError(
                f"{label} row {index} has unexpected fields: "
                f"{sorted(set(raw_row) - set(required))}"
            )
        rows.append(row)
    return rows


def extract_dialect_paragraph(index_html: bytes) -> str:
    try:
        text = index_html.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError("APK index.html is not valid UTF-8") from error
    parser = ParagraphParser()
    parser.feed(text)
    candidates = [
        paragraph
        for paragraph in parser.paragraphs
        if "dialect information" in paragraph.casefold()
    ]
    if len(candidates) != 1:
        raise ValueError(
            "expected exactly one source paragraph containing 'dialect information', "
            f"found {len(candidates)}"
        )
    return candidates[0]


def parenthetical_title_tokens(description: str) -> Iterable[tuple[str, list[str]]]:
    for match in PARENTHETICAL_RE.finditer(description):
        exact = match.group(1).strip()
        tokens = [part.strip() for part in exact.split(",")]
        if tokens and all(TITLE_TOKEN_RE.fullmatch(token) for token in tokens):
            yield exact, tokens


def discover_declared_varieties(
    rows: list[dict[str, str]], dialect_paragraph: str
) -> list[str]:
    paragraph_words = set(re.findall(r"\b[A-Za-z][A-Za-z-]*\b", dialect_paragraph))
    labels: set[str] = set()
    for row in rows:
        for _exact, tokens in parenthetical_title_tokens(row["description"]):
            labels.update(token for token in tokens if token in paragraph_words)
    if not labels:
        raise ValueError(
            "no parenthetical dictionary labels could be verified against the "
            "source dialect paragraph"
        )
    return sorted(labels)


def extract_row_labels(description: str, declared: set[str]) -> tuple[list[str], list[str]]:
    labels: list[str] = []
    spans: list[str] = []
    for exact, tokens in parenthetical_title_tokens(description):
        if tokens and all(token in declared for token in tokens):
            spans.append(f"({exact})")
            labels.extend(tokens)
    return list(dict.fromkeys(labels)), spans


def build(
    *,
    apk_path: Path,
    dictionary_snapshot_path: Path,
    source_id: str,
    inventory_id: str,
) -> BuildResult:
    apk_bytes = apk_path.read_bytes()
    with zipfile.ZipFile(apk_path) as archive:
        names = set(archive.namelist())
        missing = sorted({INDEX_MEMBER, DICTIONARY_MEMBER} - names)
        if missing:
            raise ValueError(f"APK is missing required members: {missing}")
        index_bytes = archive.read(INDEX_MEMBER)
        embedded_dictionary_bytes = archive.read(DICTIONARY_MEMBER)

    embedded_rows = parse_dictionary(
        embedded_dictionary_bytes, f"APK member {DICTIONARY_MEMBER}"
    )
    snapshot_bytes = dictionary_snapshot_path.read_bytes()
    snapshot_rows = parse_dictionary(snapshot_bytes, str(dictionary_snapshot_path))
    embedded_canonical_hash = canonical_data_hash(embedded_rows)
    snapshot_canonical_hash = canonical_data_hash(snapshot_rows)
    if embedded_canonical_hash != snapshot_canonical_hash:
        raise ValueError(
            "dictionary snapshot is not semantically identical to the signed APK "
            f"member: {snapshot_canonical_hash} != {embedded_canonical_hash}"
        )

    dialect_paragraph = extract_dialect_paragraph(index_bytes)
    declared_varieties = discover_declared_varieties(embedded_rows, dialect_paragraph)
    declared = set(declared_varieties)
    evidence_rows: list[dict[str, Any]] = []
    for row_index, row in enumerate(embedded_rows, start=1):
        labels, spans = extract_row_labels(row["description"], declared)
        if not labels:
            continue
        evidence_rows.append(
            {
                "evidence_id": f"wbv-apk-variety-{row_index:06d}",
                "source_id": source_id,
                "source_member": DICTIONARY_MEMBER,
                "source_row_number": row_index,
                "source_record_id": f"wbv-src-local-{row_index:06d}",
                "wajarri_source": row["Wajarri"],
                "english_source": row["English"],
                "description_source": row["description"],
                "sound_source": row["sound"],
                "image_source": row["image"],
                "explicit_variety_labels": labels,
                "evidence_spans": spans,
                "evidence_kind": "explicit_parenthetical_source_label",
                "interpretation_status": "source_label_only_pending_sense_review",
                "morphology_inferred": False,
                "part_of_speech_inferred": False,
                "synthetic_eligibility": "not_authorized",
            }
        )

    label_counts = Counter(
        label for row in evidence_rows for label in row["explicit_variety_labels"]
    )
    combination_counts = Counter(
        ", ".join(row["explicit_variety_labels"]) for row in evidence_rows
    )
    report = {
        "schema_version": 1,
        "inventory_id": inventory_id,
        "language": {"name": "Wajarri", "iso_639_3": "wbv"},
        "claim_limit": (
            "Exact source-visible variety-label evidence only. This inventory does "
            "not adjudicate sense, substitutability, morphology, part of speech, "
            "orthographic normalization, sentence variety, or synthetic eligibility."
        ),
        "dialect_information_paragraph": dialect_paragraph,
        "declared_varieties_discovered": declared_varieties,
        "counts": {
            "embedded_dictionary_rows": len(embedded_rows),
            "rows_with_explicit_variety_labels": len(evidence_rows),
            "rows_without_explicit_variety_labels": len(embedded_rows)
            - len(evidence_rows),
            "label_mentions": sum(label_counts.values()),
            "labels": dict(sorted(label_counts.items())),
            "label_combinations": dict(sorted(combination_counts.items())),
        },
        "lineage": {
            "apk_path": str(apk_path),
            "apk_sha256": sha256_bytes(apk_bytes),
            "index_member": INDEX_MEMBER,
            "index_member_sha256": sha256_bytes(index_bytes),
            "dictionary_member": DICTIONARY_MEMBER,
            "dictionary_member_sha256": sha256_bytes(embedded_dictionary_bytes),
            "dictionary_member_canonical_sha256": embedded_canonical_hash,
            "dictionary_snapshot_path": str(dictionary_snapshot_path),
            "dictionary_snapshot_sha256": sha256_bytes(snapshot_bytes),
            "dictionary_snapshot_canonical_sha256": snapshot_canonical_hash,
            "semantic_identity_verified": True,
        },
        "training_authorized": False,
        "generation_authorized": False,
    }
    rows_bytes = jsonl_bytes(evidence_rows)
    report_bytes = json_bytes(report)
    manifest = {
        "schema_version": 1,
        "inventory_id": inventory_id,
        "status": "source_evidence_inventory",
        "immutable": True,
        "source_id": source_id,
        "artifacts": {
            "variety_evidence": {
                "path": "variety-evidence.jsonl",
                "sha256": sha256_bytes(rows_bytes),
                "rows": len(evidence_rows),
            },
            "report": {
                "path": "REPORT.json",
                "sha256": sha256_bytes(report_bytes),
            },
        },
        "synthetic_sentence_pairs_added": 0,
        "dictionary_rows_mutated": 0,
        "training_authorized": False,
    }
    return BuildResult(manifest=manifest, report=report, rows=evidence_rows)


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=True, sort_keys=True) + "\n").encode(
        "utf-8"
    )


def jsonl_bytes(rows: list[dict[str, Any]]) -> bytes:
    return b"".join((canonical_json(row) + "\n").encode("utf-8") for row in rows)


def write_immutable(path: Path, value: bytes) -> None:
    if path.exists():
        if path.read_bytes() != value:
            raise ValueError(f"refusing to rewrite immutable artifact: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)


def write_result(output_dir: Path, result: BuildResult) -> None:
    rows_bytes = jsonl_bytes(result.rows)
    report_bytes = json_bytes(result.report)
    manifest_bytes = json_bytes(result.manifest)
    write_immutable(output_dir / "variety-evidence.jsonl", rows_bytes)
    write_immutable(output_dir / "REPORT.json", report_bytes)
    write_immutable(output_dir / "MANIFEST.json", manifest_bytes)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--dictionary-snapshot", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--inventory-id", required=True)
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = build(
        apk_path=args.apk.resolve(),
        dictionary_snapshot_path=args.dictionary_snapshot.resolve(),
        source_id=args.source_id,
        inventory_id=args.inventory_id,
    )
    if args.write:
        write_result(args.output_dir.resolve(), result)
    print(json.dumps(result.manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

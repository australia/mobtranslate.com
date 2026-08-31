#!/usr/bin/env python3
"""Build a page-image OCR witness for the Douglas Wajarri examples.

The output is a review aid, not a corrected transcription. It preserves the
existing text-layer extraction alongside deterministic Poppler renders and
Tesseract witnesses, then aligns numbered markers without promoting any form,
translation, grammar rule, or synthetic sentence pair.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from statistics import fmean
from typing import Any, Iterable, Sequence


MARKER_RE = re.compile(r"^\((\d{1,3})\)$")


@dataclass(frozen=True)
class OcrWord:
    text: str
    confidence: float
    left: int
    top: int
    width: int
    height: int
    word_number: int


@dataclass(frozen=True)
class OcrLine:
    line_key: tuple[int, int, int]
    words: tuple[OcrWord, ...]
    text: str
    left: int
    top: int
    width: int
    height: int


@dataclass(frozen=True)
class ObservedMarker:
    number: int
    line_index: int
    word_index: int
    word: OcrWord
    line_text: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")


def jsonl_bytes(rows: Iterable[dict[str, Any]]) -> bytes:
    return b"".join(
        (
            json.dumps(
                row,
                ensure_ascii=True,
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n"
        ).encode("utf-8")
        for row in rows
    )


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"expected an object at {path}:{line_number}")
        rows.append(value)
    return rows


def resolve(root: Path, raw_path: str) -> Path:
    path = Path(raw_path)
    return path if path.is_absolute() else root / path


def require_hash(path: Path, expected: str, label: str) -> None:
    actual = sha256_file(path)
    if actual != expected:
        raise ValueError(f"{label} hash mismatch: {actual} != {expected}")


def command_output(command: Sequence[str]) -> str:
    completed = subprocess.run(
        command,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return completed.stdout.strip()


def run_command(command: Sequence[str]) -> None:
    subprocess.run(
        command,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def tool_version(command: Sequence[str]) -> str:
    output = command_output(command)
    if not output:
        raise ValueError(f"empty version output: {command}")
    return output.splitlines()[0]


def parse_tsv(path: Path) -> list[OcrLine]:
    grouped: dict[tuple[int, int, int], list[OcrWord]] = defaultdict(list)
    order: list[tuple[int, int, int]] = []
    raw_lines = path.read_text(encoding="utf-8").splitlines()
    if not raw_lines:
        raise ValueError(f"empty Tesseract TSV: {path}")
    field_names = raw_lines[0].split("\t")
    required = {
        "level",
        "block_num",
        "par_num",
        "line_num",
        "word_num",
        "left",
        "top",
        "width",
        "height",
        "conf",
        "text",
    }
    if not required <= set(field_names):
        raise ValueError(f"Tesseract TSV schema mismatch: {path}")
    for line_number, raw_line in enumerate(raw_lines[1:], start=2):
        # Tesseract TSV is tab-delimited but not RFC CSV. Source tokens can
        # contain unescaped quote characters, so csv.DictReader would merge
        # unrelated physical lines when it sees an unmatched double quote.
        values = raw_line.split("\t", len(field_names) - 1)
        if len(values) != len(field_names):
            raise ValueError(f"malformed Tesseract TSV row at {path}:{line_number}")
        raw = dict(zip(field_names, values, strict=True))
        text = raw["text"].strip()
        if raw["level"] != "5" or not text:
            continue
        key = (
            int(raw["block_num"]),
            int(raw["par_num"]),
            int(raw["line_num"]),
        )
        if key not in grouped:
            order.append(key)
        grouped[key].append(
            OcrWord(
                text=text,
                confidence=float(raw["conf"]),
                left=int(raw["left"]),
                top=int(raw["top"]),
                width=int(raw["width"]),
                height=int(raw["height"]),
                word_number=int(raw["word_num"]),
            )
        )

    lines: list[OcrLine] = []
    for key in order:
        words = tuple(sorted(grouped[key], key=lambda word: word.word_number))
        left = min(word.left for word in words)
        top = min(word.top for word in words)
        right = max(word.left + word.width for word in words)
        bottom = max(word.top + word.height for word in words)
        lines.append(
            OcrLine(
                line_key=key,
                words=words,
                text=" ".join(word.text for word in words),
                left=left,
                top=top,
                width=right - left,
                height=bottom - top,
            )
        )
    return lines


def observed_markers(lines: Sequence[OcrLine]) -> list[ObservedMarker]:
    markers: list[ObservedMarker] = []
    for line_index, line in enumerate(lines):
        for word_index, word in enumerate(line.words[:3]):
            match = MARKER_RE.fullmatch(word.text)
            if match:
                markers.append(
                    ObservedMarker(
                        number=int(match.group(1)),
                        line_index=line_index,
                        word_index=word_index,
                        word=word,
                        line_text=line.text,
                    )
                )
                break
    return markers


def align_marker_numbers(
    expected: Sequence[int], observed: Sequence[int]
) -> tuple[list[int], list[int]]:
    """Return observed indexes matched to every expected marker plus extras."""

    expected_count = len(expected)
    observed_count = len(observed)
    dp = [
        [0 for _ in range(observed_count + 1)]
        for _ in range(expected_count + 1)
    ]
    for expected_index in range(expected_count - 1, -1, -1):
        for observed_index in range(observed_count - 1, -1, -1):
            best = max(
                dp[expected_index + 1][observed_index],
                dp[expected_index][observed_index + 1],
            )
            if expected[expected_index] == observed[observed_index]:
                best = max(best, 1 + dp[expected_index + 1][observed_index + 1])
            dp[expected_index][observed_index] = best

    matches: list[int] = []
    expected_index = 0
    observed_index = 0
    while expected_index < expected_count and observed_index < observed_count:
        can_match = (
            expected[expected_index] == observed[observed_index]
            and dp[expected_index][observed_index]
            == 1 + dp[expected_index + 1][observed_index + 1]
        )
        if can_match:
            matches.append(observed_index)
            expected_index += 1
            observed_index += 1
        elif (
            dp[expected_index][observed_index + 1]
            >= dp[expected_index + 1][observed_index]
        ):
            observed_index += 1
        else:
            expected_index += 1

    if len(matches) != expected_count:
        matched_numbers = [observed[index] for index in matches]
        raise ValueError(
            "not every expected marker aligned: "
            f"expected={list(expected)} matched={matched_numbers} "
            f"observed={list(observed)}"
        )
    matched_set = set(matches)
    extras = [index for index in range(observed_count) if index not in matched_set]
    return matches, extras


def compact_text(value: str) -> str:
    return "".join(character.casefold() for character in value if character.isalnum())


def similarity(left: str, right: str) -> float:
    left_compact = compact_text(left)
    right_compact = compact_text(right)
    if not left_compact and not right_compact:
        return 1.0
    if not left_compact or not right_compact:
        return 0.0
    return round(SequenceMatcher(None, left_compact, right_compact).ratio(), 6)


def line_block_text(
    lines: Sequence[OcrLine], start_line: int, end_line: int
) -> str:
    if not (0 <= start_line < end_line <= len(lines)):
        raise ValueError(
            f"invalid OCR line block: start={start_line} end={end_line} "
            f"lines={len(lines)}"
        )
    return "\n".join(line.text for line in lines[start_line:end_line]) + "\n"


def confidence_summary(lines: Sequence[OcrLine]) -> dict[str, float | int | None]:
    values = [
        word.confidence
        for line in lines
        for word in line.words
        if word.confidence >= 0
    ]
    if not values:
        return {
            "word_count": 0,
            "mean": None,
            "minimum": None,
            "below_50": 0,
        }
    return {
        "word_count": len(values),
        "mean": round(fmean(values), 6),
        "minimum": round(min(values), 6),
        "below_50": sum(value < 50 for value in values),
    }


def flatten_expected_examples(
    numbered_examples: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for example in numbered_examples:
        for occurrence in example["occurrences"]:
            flattened.append(
                {
                    "source_example_id": example["exampleId"],
                    "example_number": example["exampleNumber"],
                    "occurrence_index": occurrence["occurrenceIndex"],
                    "chapter_page_ordinal": occurrence["chapterPageOrdinal"],
                    "printed_page": occurrence["printedPage"],
                    "source_pdf_page": occurrence["sourcePdfPage"],
                    "line_start": occurrence["lineStart"],
                    "line_end": occurrence["lineEnd"],
                    "page_sha256": occurrence["pageSha256"],
                    "source_span_sha256": occurrence["sourceSpanSha256"],
                    "source_text": occurrence["sourceText"],
                    "ocr_diagnostics": occurrence["ocrDiagnostics"],
                }
            )
    return sorted(
        flattened,
        key=lambda row: (
            row["chapter_page_ordinal"],
            row["line_start"],
            row["example_number"],
            row["occurrence_index"],
        ),
    )


def review_reasons(
    expected: dict[str, Any],
    *,
    curated_numbers: set[int],
    page_has_extra_markers: bool,
    confidence: dict[str, float | int | None],
) -> list[str]:
    reasons: list[str] = []
    if expected["example_number"] in curated_numbers:
        reasons.append("existing_curated_grammar_example")
    diagnostics = expected["ocr_diagnostics"]
    if diagnostics["digitOneCount"] > 0:
        reasons.append("text_layer_digit_one_risk")
    if diagnostics["interiorWhitespaceSequenceCount"] > 0:
        reasons.append("text_layer_interior_spacing_risk")
    if expected["line_end"] > expected["line_start"]:
        reasons.append("multiline_source_block")
    if page_has_extra_markers:
        reasons.append("page_contains_extra_numeric_marker")
    if confidence["below_50"]:
        reasons.append("ocr_low_confidence_words")
    return reasons or ["routine_source_image_review"]


def write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)


def build_inventory(
    *,
    program_root: Path,
    contract_path: Path,
    build_root: Path,
) -> dict[str, Any]:
    contract = load_json(contract_path)
    source = contract["source"]
    inputs = contract["inputs"]
    rendering = contract["rendering"]

    pdf_path = resolve(program_root, source["pdf_path"])
    numbered_path = resolve(program_root, inputs["numbered_examples"]["path"])
    curated_path = resolve(program_root, inputs["curated_examples"]["path"])
    page_index_path = resolve(program_root, inputs["page_index"]["path"])
    require_hash(pdf_path, source["pdf_sha256"], "source PDF")
    require_hash(
        numbered_path,
        inputs["numbered_examples"]["sha256"],
        "numbered examples",
    )
    require_hash(
        curated_path,
        inputs["curated_examples"]["sha256"],
        "curated examples",
    )
    require_hash(page_index_path, inputs["page_index"]["sha256"], "page index")

    poppler_version = tool_version([rendering["pdftoppm_binary"], "-v"])
    tesseract_version = tool_version([rendering["tesseract_binary"], "--version"])
    if poppler_version != rendering["required_pdftoppm_version_line"]:
        raise ValueError(f"unexpected pdftoppm version: {poppler_version}")
    if tesseract_version != rendering["required_tesseract_version_line"]:
        raise ValueError(f"unexpected Tesseract version: {tesseract_version}")

    numbered_examples = load_jsonl(numbered_path)
    curated_examples = load_jsonl(curated_path)
    expected_rows = flatten_expected_examples(numbered_examples)
    if len(numbered_examples) != contract["expected_counts"]["example_numbers"]:
        raise ValueError("numbered example count changed")
    if len(expected_rows) != contract["expected_counts"]["example_occurrences"]:
        raise ValueError("numbered example occurrence count changed")
    curated_numbers = {row["exampleNumber"] for row in curated_examples}

    expected_by_page: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in expected_rows:
        expected_by_page[row["chapter_page_ordinal"]].append(row)
    pages = sorted(expected_by_page)
    if len(pages) != contract["expected_counts"]["example_pages"]:
        raise ValueError("example-bearing page count changed")

    page_dir = build_root / "pages"
    page_dir.mkdir(parents=True, exist_ok=True)
    derived_files: list[dict[str, Any]] = []
    page_witnesses: list[dict[str, Any]] = []
    example_witnesses: list[dict[str, Any]] = []
    review_queue: list[dict[str, Any]] = []
    total_observed_markers = 0
    total_extra_markers = 0

    for page in pages:
        stem = f"page-{page:03d}"
        png_path = page_dir / f"{stem}.png"
        output_base = page_dir / stem
        run_command(
            [
                rendering["pdftoppm_binary"],
                "-f",
                str(page),
                "-l",
                str(page),
                "-singlefile",
                "-png",
                "-r",
                str(rendering["dpi"]),
                str(pdf_path),
                str(output_base),
            ]
        )
        run_command(
            [
                rendering["tesseract_binary"],
                str(png_path),
                str(output_base),
                "-l",
                rendering["tesseract_language"],
                "--psm",
                str(rendering["page_segmentation_mode"]),
                "txt",
                "tsv",
            ]
        )
        txt_path = page_dir / f"{stem}.txt"
        tsv_path = page_dir / f"{stem}.tsv"
        for kind, path in (("page_png", png_path), ("ocr_text", txt_path), ("ocr_tsv", tsv_path)):
            relative = path.relative_to(build_root).as_posix()
            derived_files.append(
                {
                    "chapter_page_ordinal": page,
                    "kind": kind,
                    "path": relative,
                    "sha256": sha256_file(path),
                    "bytes": path.stat().st_size,
                }
            )

        lines = parse_tsv(tsv_path)
        markers = observed_markers(lines)
        expected_page = expected_by_page[page]
        expected_numbers = [row["example_number"] for row in expected_page]
        observed_numbers = [marker.number for marker in markers]
        matched_indexes, extra_indexes = align_marker_numbers(
            expected_numbers, observed_numbers
        )
        total_observed_markers += len(markers)
        total_extra_markers += len(extra_indexes)
        page_witnesses.append(
            {
                "page_witness_id": f"wbv-douglas-ocr-page-{page:03d}",
                "chapter_page_ordinal": page,
                "printed_page": expected_page[0]["printed_page"],
                "source_pdf_page": expected_page[0]["source_pdf_page"],
                "expected_example_numbers": expected_numbers,
                "expected_occurrences": len(expected_page),
                "observed_numeric_markers": len(markers),
                "matched_occurrences": len(matched_indexes),
                "extra_numeric_markers": [
                    {
                        "number": markers[index].number,
                        "line_index": markers[index].line_index,
                        "line_text": markers[index].line_text,
                    }
                    for index in extra_indexes
                ],
                "png_path": png_path.relative_to(build_root).as_posix(),
                "png_sha256": sha256_file(png_path),
                "ocr_text_path": txt_path.relative_to(build_root).as_posix(),
                "ocr_text_sha256": sha256_file(txt_path),
                "ocr_tsv_path": tsv_path.relative_to(build_root).as_posix(),
                "ocr_tsv_sha256": sha256_file(tsv_path),
                "marker_alignment_status": "all_expected_markers_aligned",
            }
        )

        matched_markers = [markers[index] for index in matched_indexes]
        for page_index, (expected, marker) in enumerate(
            zip(expected_page, matched_markers, strict=True)
        ):
            start_line = marker.line_index
            end_line = (
                matched_markers[page_index + 1].line_index
                if page_index + 1 < len(matched_markers)
                else len(lines)
            )
            block_lines = lines[start_line:end_line]
            witness_text = line_block_text(lines, start_line, end_line)
            confidence = confidence_summary(block_lines)
            reasons = review_reasons(
                expected,
                curated_numbers=curated_numbers,
                page_has_extra_markers=bool(extra_indexes),
                confidence=confidence,
            )
            witness_id = (
                f"wbv-douglas-ocr-example-{expected['example_number']:03d}-"
                f"{expected['occurrence_index']:02d}"
            )
            example_witnesses.append(
                {
                    "witness_id": witness_id,
                    "source_example_id": expected["source_example_id"],
                    "example_number": expected["example_number"],
                    "occurrence_index": expected["occurrence_index"],
                    "chapter_page_ordinal": page,
                    "printed_page": expected["printed_page"],
                    "source_pdf_page": expected["source_pdf_page"],
                    "source_text_layer_line_start": expected["line_start"],
                    "source_text_layer_line_end": expected["line_end"],
                    "source_page_sha256": expected["page_sha256"],
                    "source_span_sha256": expected["source_span_sha256"],
                    "source_text_layer_witness": expected["source_text"],
                    "source_text_layer_witness_sha256": sha256_bytes(
                        expected["source_text"].encode("utf-8")
                    ),
                    "source_text_layer_ocr_diagnostics": expected[
                        "ocr_diagnostics"
                    ],
                    "secondary_ocr_witness": witness_text,
                    "secondary_ocr_witness_sha256": sha256_bytes(
                        witness_text.encode("utf-8")
                    ),
                    "secondary_ocr_line_start": start_line,
                    "secondary_ocr_line_end": end_line - 1,
                    "secondary_ocr_confidence": confidence,
                    "text_layer_secondary_ocr_compact_similarity": similarity(
                        expected["source_text"], witness_text
                    ),
                    "marker": {
                        "text": marker.word.text,
                        "line_index": marker.line_index,
                        "word_index": marker.word_index,
                        "confidence": marker.word.confidence,
                        "left": marker.word.left,
                        "top": marker.word.top,
                        "width": marker.word.width,
                        "height": marker.word.height,
                    },
                    "page_png_path": png_path.relative_to(build_root).as_posix(),
                    "page_png_sha256": sha256_file(png_path),
                    "review_reasons": reasons,
                    "transcription_status": "unreviewed_secondary_ocr_witness",
                    "translation_alignment_status": "unresolved",
                    "morpheme_alignment_status": "unresolved",
                    "current_orthography_correspondence_status": "unresolved",
                    "acceptance_status": "not_accepted",
                    "training_eligibility": "not_allowed",
                    "synthetic_eligibility": "not_authorized",
                    "controlled_synthetic_sentence_pairs_added": 0,
                }
            )
            review_queue.append(
                {
                    "review_id": f"{witness_id}-review",
                    "witness_id": witness_id,
                    "example_number": expected["example_number"],
                    "occurrence_index": expected["occurrence_index"],
                    "chapter_page_ordinal": page,
                    "priority_band": (
                        "curated_first"
                        if expected["example_number"] in curated_numbers
                        else "full_corpus_followup"
                    ),
                    "review_reasons": reasons,
                    "required_actions": [
                        "inspect_source_page_image",
                        "adjudicate_exact_historical_transcription",
                        "separate_wajarri_gloss_and_free_translation_lines",
                        "record_current_correspondence_as_evidence_bound_hypothesis",
                        "preserve_unresolved_variation_and_ocr_ambiguity",
                    ],
                    "review_status": "pending",
                    "acceptance_status": "not_accepted",
                    "training_eligibility": "not_allowed",
                    "synthetic_eligibility": "not_authorized",
                }
            )

    derived_files.sort(key=lambda row: row["path"])
    example_witnesses.sort(
        key=lambda row: (
            row["example_number"],
            row["occurrence_index"],
            row["chapter_page_ordinal"],
        )
    )
    review_queue.sort(
        key=lambda row: (
            row["priority_band"] != "curated_first",
            row["example_number"],
            row["occurrence_index"],
        )
    )

    output_payloads = {
        "derived-files.jsonl": jsonl_bytes(derived_files),
        "page-witnesses.jsonl": jsonl_bytes(page_witnesses),
        "example-witnesses.jsonl": jsonl_bytes(example_witnesses),
        "review-queue.jsonl": jsonl_bytes(review_queue),
    }
    confidence_means = [
        row["secondary_ocr_confidence"]["mean"]
        for row in example_witnesses
        if row["secondary_ocr_confidence"]["mean"] is not None
    ]
    report = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "status": "secondary_ocr_review_witness",
        "claim_limit": contract["claim_limit"],
        "source": source,
        "runtime": {
            "pdftoppm_version_line": poppler_version,
            "tesseract_version_line": tesseract_version,
            "dpi": rendering["dpi"],
            "page_segmentation_mode": rendering["page_segmentation_mode"],
            "tesseract_language": rendering["tesseract_language"],
        },
        "counts": {
            "example_numbers": len(numbered_examples),
            "example_occurrences": len(example_witnesses),
            "example_pages": len(page_witnesses),
            "observed_numeric_markers": total_observed_markers,
            "aligned_expected_markers": len(example_witnesses),
            "extra_numeric_markers": total_extra_markers,
            "curated_review_rows": sum(
                row["priority_band"] == "curated_first" for row in review_queue
            ),
            "accepted_transcriptions": 0,
            "accepted_translation_alignments": 0,
            "accepted_current_correspondences": 0,
            "productive_grammar_rules": 0,
            "controlled_synthetic_sentence_pairs": 0,
            "training_eligible_rows": 0,
        },
        "quality": {
            "all_expected_markers_aligned": len(example_witnesses)
            == len(expected_rows),
            "mean_example_block_word_confidence": (
                round(fmean(confidence_means), 6) if confidence_means else None
            ),
            "determinism_scope": (
                "Exact output is bound to the source hashes, Poppler and Tesseract "
                "version lines, DPI, page segmentation mode, and language model."
            ),
        },
        "generation_authorized": False,
        "training_authorized": False,
    }
    output_payloads["REPORT.json"] = json_bytes(report)
    for name, payload in output_payloads.items():
        write_bytes(build_root / name, payload)

    manifest = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "secondary_ocr_review_witness",
        "immutable": True,
        "contract": {
            "path": contract_path.relative_to(program_root).as_posix(),
            "sha256": sha256_file(contract_path),
        },
        "source": source,
        "runtime": report["runtime"],
        "components": {
            "derived_files": {
                "path": "derived-files.jsonl",
                "sha256": sha256_file(build_root / "derived-files.jsonl"),
                "rows": len(derived_files),
            },
            "page_witnesses": {
                "path": "page-witnesses.jsonl",
                "sha256": sha256_file(build_root / "page-witnesses.jsonl"),
                "rows": len(page_witnesses),
            },
            "example_witnesses": {
                "path": "example-witnesses.jsonl",
                "sha256": sha256_file(build_root / "example-witnesses.jsonl"),
                "rows": len(example_witnesses),
            },
            "review_queue": {
                "path": "review-queue.jsonl",
                "sha256": sha256_file(build_root / "review-queue.jsonl"),
                "rows": len(review_queue),
            },
            "report": {
                "path": "REPORT.json",
                "sha256": sha256_file(build_root / "REPORT.json"),
            },
        },
        "page_file_count": len(derived_files),
        "accepted_linguistic_rows": 0,
        "controlled_synthetic_sentence_pairs_added": 0,
        "training_eligible_rows": 0,
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    write_bytes(build_root / "MANIFEST.json", json_bytes(manifest))
    return manifest


def compare_trees(left: Path, right: Path) -> None:
    left_files = sorted(
        path.relative_to(left).as_posix() for path in left.rglob("*") if path.is_file()
    )
    right_files = sorted(
        path.relative_to(right).as_posix()
        for path in right.rglob("*")
        if path.is_file()
    )
    if left_files != right_files:
        raise ValueError("existing output file inventory differs")
    for relative in left_files:
        if sha256_file(left / relative) != sha256_file(right / relative):
            raise ValueError(f"refusing to rewrite non-identical output: {relative}")


def write_inventory(
    *, program_root: Path, contract_path: Path, output_dir: Path
) -> dict[str, Any]:
    output_dir = output_dir.resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=output_dir.parent)
    )
    try:
        manifest = build_inventory(
            program_root=program_root,
            contract_path=contract_path,
            build_root=temporary,
        )
        if output_dir.exists():
            compare_trees(temporary, output_dir)
            shutil.rmtree(temporary)
        else:
            temporary.replace(output_dir)
        return manifest
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    contract_path = resolve(program_root, str(args.contract))
    output_dir = resolve(program_root, str(args.output_dir))
    manifest = write_inventory(
        program_root=program_root,
        contract_path=contract_path,
        output_dir=output_dir,
    )
    print(
        json.dumps(
            {
                "inventory_id": manifest["inventory_id"],
                "manifest_path": str(output_dir / "MANIFEST.json"),
                "manifest_sha256": sha256_file(output_dir / "MANIFEST.json"),
                "page_file_count": manifest["page_file_count"],
                "controlled_synthetic_sentence_pairs_added": 0,
                "training_eligible_rows": 0,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

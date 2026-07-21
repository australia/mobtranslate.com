#!/usr/bin/env python3
"""Build the Mi'kmaq/Listuguj v2 dictionary and lexical benchmark census."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unicodedata
from typing import Any, Iterable


SCHEMA_VERSION = 1
DEFAULT_SOURCE_ID = "src-mic-mmo-20260712"
DEFAULT_PROGRAM_ID = "migmaq-listuguj-v2"
QUOTE_FOLD = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u02bc": "'",
        "\u0060": "'",
        "\u00b4": "'",
        "\u201c": '"',
        "\u201d": '"',
    }
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entries", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--lexical-auxiliary", type=Path)
    parser.add_argument("--source-id", default=DEFAULT_SOURCE_ID)
    parser.add_argument("--program-id", default=DEFAULT_PROGRAM_ID)
    parser.add_argument("--generated-at-utc")
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def source_text(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def comparison_text(value: Any) -> str:
    normalized = unicodedata.normalize("NFKC", source_text(value)).translate(QUOTE_FOLD)
    return " ".join(normalized.casefold().split())


def stable_id(prefix: str, *parts: Any) -> str:
    material = "\0".join(source_text(part) for part in parts)
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:{digest}"


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
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"expected object at {path}:{line_number}")
            rows.append(value)
    return rows


def load_legacy_crosswalk(path: Path | None) -> dict[str, dict[str, str]]:
    if path is None:
        return {}
    crosswalk: dict[str, dict[str, str]] = {}
    for row in read_jsonl(path):
        source = row.get("source") or {}
        entry_id = source_text(source.get("entry_id"))
        if not entry_id:
            raise ValueError(f"legacy lexical row lacks source.entry_id: {row.get('id')}")
        value = {
            "split": source_text(row.get("split")),
            "leakage_group": source_text(row.get("leakage_group")),
        }
        previous = crosswalk.setdefault(entry_id, value)
        if previous != value:
            raise ValueError(f"inconsistent legacy split for {entry_id}: {previous} != {value}")
    return crosswalk


def output_paths(root: Path) -> dict[str, Path]:
    return {
        "entries": root / "dictionary/entries.jsonl",
        "sense_candidates": root / "dictionary/sense-candidates.jsonl",
        "forms_raw": root / "dictionary/forms-raw.jsonl",
        "examples": root / "dictionary/examples.jsonl",
        "media_links": root / "dictionary/media-links.jsonl",
        "lexical_census": root / "benchmarks/lexical/lexical-census.eng-mic.jsonl",
        "benchmark_ready": root / "benchmarks/lexical/benchmark-ready.eng-mic.jsonl",
        "review_queue": root / "benchmarks/lexical/review-queue.jsonl",
        "summary": root / "analysis/inventories/dictionary-census-summary.json",
        "checksums": root / "analysis/inventories/SHA256SUMS",
    }


def ensure_outputs_available(paths: Iterable[Path], replace: bool) -> None:
    existing = [path for path in paths if path.exists()]
    if existing and not replace:
        rendered = "\n".join(str(path) for path in existing)
        raise FileExistsError(f"refusing to replace existing outputs without --replace:\n{rendered}")


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    content = "".join(
        json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        for row in rows
    )
    atomic_write(path, content)


def write_json(path: Path, value: Any) -> None:
    atomic_write(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def recording_link(
    entry_id: str,
    entry_external_id: str,
    role: str,
    recording: dict[str, Any],
    example_id: str | None = None,
    example_index: int | None = None,
) -> dict[str, Any]:
    external_recording_id = source_text(recording.get("externalRecordingId"))
    source_audio_url = source_text(recording.get("sourceAudioUrl"))
    recording_identity = external_recording_id or stable_id("mic-recording-fallback", source_audio_url)
    return {
        "schema_version": SCHEMA_VERSION,
        "id": stable_id("mic-media-link", entry_external_id, role, example_index, recording_identity),
        "source_id": DEFAULT_SOURCE_ID,
        "entry_id": entry_id,
        "example_id": example_id,
        "role": role,
        "external_recording_id": external_recording_id or None,
        "speaker_code": source_text(recording.get("speakerCode")) or None,
        "source_audio_url": source_audio_url or None,
        "archive_relative_path": source_text(recording.get("archiveRelativePath")) or None,
        "audio_file_name": source_text(recording.get("audioFileName")) or None,
    }


def parse_alternate_form(raw_form: str) -> dict[str, Any]:
    parts = [source_text(part) for part in raw_form.split(" -- ")]
    if len(parts) < 3 or not parts[0] or not parts[-1].startswith("(") or not parts[-1].endswith(")"):
        return {
            "structure_parse_status": "unparsed",
            "surface_form_candidate": None,
            "english_gloss_candidate": None,
            "grammatical_label": None,
        }
    surface_form = parts[0]
    english_gloss = " -- ".join(parts[1:-1])
    grammatical_label = source_text(parts[-1][1:-1])
    if not english_gloss or not grammatical_label:
        return {
            "structure_parse_status": "unparsed",
            "surface_form_candidate": None,
            "english_gloss_candidate": None,
            "grammatical_label": None,
        }
    return {
        "structure_parse_status": "source_layout_recovered_unadjudicated",
        "surface_form_candidate": surface_form,
        "comparison_surface_form": comparison_text(surface_form),
        "english_gloss_candidate": english_gloss,
        "comparison_english_gloss": comparison_text(english_gloss),
        "grammatical_label": grammatical_label,
        "comparison_grammatical_label": comparison_text(grammatical_label),
    }


def build_records(
    source_entries: list[dict[str, Any]],
    legacy_crosswalk: dict[str, dict[str, str]],
    source_id: str,
) -> dict[str, list[dict[str, Any]]]:
    ordered_entries = sorted(source_entries, key=lambda row: source_text(row.get("externalEntryId")))
    seen_external_ids: set[str] = set()
    entries: list[dict[str, Any]] = []
    senses: list[dict[str, Any]] = []
    forms: list[dict[str, Any]] = []
    examples: list[dict[str, Any]] = []
    media_links: list[dict[str, Any]] = []

    for source_index, row in enumerate(ordered_entries):
        external_id = source_text(row.get("externalEntryId"))
        headword = source_text(row.get("sourceHeadword"))
        if not external_id:
            raise ValueError(f"source entry at sorted index {source_index} has no externalEntryId")
        if external_id in seen_external_ids:
            raise ValueError(f"duplicate externalEntryId: {external_id}")
        if not headword:
            raise ValueError(f"source entry has no sourceHeadword: {external_id}")
        seen_external_ids.add(external_id)

        entry_id = stable_id("mic-entry", external_id)
        pos = source_text(row.get("partOfSpeech"))
        legacy = legacy_crosswalk.get(external_id)

        gloss_sources: dict[str, dict[str, Any]] = {}
        primary_translation = source_text(row.get("translation"))
        if primary_translation:
            key = comparison_text(primary_translation)
            gloss_sources[key] = {
                "display": primary_translation,
                "sources": [{"field": "translation", "index": None, "value": primary_translation}],
            }
        for meaning_index, value in enumerate(row.get("meanings") or []):
            meaning = source_text(value)
            if not meaning:
                continue
            key = comparison_text(meaning)
            gloss = gloss_sources.setdefault(key, {"display": meaning, "sources": []})
            gloss["sources"].append({"field": "meanings", "index": meaning_index, "value": meaning})

        sense_ids: list[str] = []
        for gloss_key, gloss_value in gloss_sources.items():
            sense_id = stable_id("mic-gloss-candidate", external_id, gloss_key)
            sense_ids.append(sense_id)
            source_fields = gloss_value["sources"]
            has_primary = any(item["field"] == "translation" for item in source_fields)
            senses.append(
                {
                    "schema_version": SCHEMA_VERSION,
                    "id": sense_id,
                    "source_id": source_id,
                    "entry_id": entry_id,
                    "external_entry_id": external_id,
                    "headword": headword,
                    "comparison_headword": comparison_text(headword),
                    "orthography": "listuguj-contemporary-v1",
                    "part_of_speech": pos or None,
                    "comparison_part_of_speech": comparison_text(pos),
                    "english_gloss": gloss_value["display"],
                    "comparison_english_gloss": gloss_key,
                    "source_fields": source_fields,
                    "candidate_kind": "primary_translation" if has_primary else "meaning_only",
                    "sense_status": "source_gloss_candidate_not_independently_adjudicated",
                    "single_english_token": len(gloss_key.split()) == 1,
                    "single_migmaq_token": len(comparison_text(headword).split()) == 1,
                    "identity_mapping": gloss_key == comparison_text(headword),
                    "legacy_v1_split": legacy["split"] if legacy else None,
                    "legacy_v1_leakage_group": legacy["leakage_group"] if legacy else None,
                    "source_url": source_text(row.get("sourceUrl")) or None,
                    "raw_html_sha256": source_text(row.get("rawHtmlSha256")) or None,
                }
            )

        form_ids: list[str] = []
        for form_index, value in enumerate(row.get("alternateForms") or []):
            raw_form = source_text(value)
            if not raw_form:
                continue
            form_id = stable_id("mic-form-raw", external_id, form_index, raw_form)
            form_ids.append(form_id)
            parsed_form = parse_alternate_form(raw_form)
            forms.append(
                {
                    "schema_version": SCHEMA_VERSION,
                    "id": form_id,
                    "source_id": source_id,
                    "entry_id": entry_id,
                    "external_entry_id": external_id,
                    "headword": headword,
                    "part_of_speech": pos or None,
                    "source_index": form_index,
                    "raw_source_text": raw_form,
                    **parsed_form,
                    "analysis_status": "source_layout_only_not_morphologically_adjudicated",
                }
            )

        word_link_ids: list[str] = []
        for recording in row.get("wordRecordings") or []:
            link = recording_link(entry_id, external_id, "headword", recording)
            link["source_id"] = source_id
            media_links.append(link)
            word_link_ids.append(link["id"])

        example_ids: list[str] = []
        for example_index, example in enumerate(row.get("examples") or []):
            migmaq_text = source_text(example.get("text"))
            english_text = source_text(example.get("translation"))
            example_id = stable_id("mic-example", external_id, example_index, migmaq_text, english_text)
            example_ids.append(example_id)
            recording_link_ids: list[str] = []
            for recording in example.get("recordings") or []:
                link = recording_link(
                    entry_id,
                    external_id,
                    "example_sentence",
                    recording,
                    example_id=example_id,
                    example_index=example_index,
                )
                link["source_id"] = source_id
                media_links.append(link)
                recording_link_ids.append(link["id"])
            examples.append(
                {
                    "schema_version": SCHEMA_VERSION,
                    "id": example_id,
                    "source_id": source_id,
                    "entry_id": entry_id,
                    "external_entry_id": external_id,
                    "headword": headword,
                    "source_index": example_index,
                    "migmaq_text": migmaq_text,
                    "english_text": english_text,
                    "recording_link_ids": recording_link_ids,
                    "legacy_v1_split": legacy["split"] if legacy else None,
                    "legacy_v1_leakage_group": legacy["leakage_group"] if legacy else None,
                }
            )

        entries.append(
            {
                "schema_version": SCHEMA_VERSION,
                "id": entry_id,
                "source_id": source_id,
                "external_entry_id": external_id,
                "source_url": source_text(row.get("sourceUrl")) or None,
                "headword": headword,
                "source_normalized_headword": source_text(row.get("normalizedHeadword")) or None,
                "comparison_headword": comparison_text(headword),
                "orthography": "listuguj-contemporary-v1",
                "written_variety": "listuguj",
                "primary_translation": primary_translation or None,
                "part_of_speech": pos or None,
                "comparison_part_of_speech": comparison_text(pos),
                "pronunciation_guide": source_text(row.get("pronunciationGuide")) or None,
                "sense_candidate_ids": sense_ids,
                "raw_alternate_form_ids": form_ids,
                "example_ids": example_ids,
                "headword_recording_link_ids": word_link_ids,
                "raw_html_path": source_text(row.get("rawHtmlPath")) or None,
                "raw_html_sha256": source_text(row.get("rawHtmlSha256")) or None,
                "fetched_at": source_text(row.get("fetchedAt")) or None,
                "legacy_v1_split": legacy["split"] if legacy else None,
                "legacy_v1_leakage_group": legacy["leakage_group"] if legacy else None,
            }
        )

    return {
        "entries": entries,
        "sense_candidates": senses,
        "forms_raw": forms,
        "examples": examples,
        "media_links": media_links,
    }


def build_lexical_groups(
    entries: list[dict[str, Any]],
    senses: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    entry_by_id = {entry["id"]: entry for entry in entries}
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for sense in senses:
        grouped[(sense["comparison_english_gloss"], sense["comparison_part_of_speech"])].append(sense)

    census: list[dict[str, Any]] = []
    benchmark: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []
    for (gloss_key, pos_key), candidates in sorted(grouped.items()):
        candidates = sorted(candidates, key=lambda row: (row["comparison_headword"], row["external_entry_id"], row["id"]))
        targets_by_key: dict[str, dict[str, Any]] = {}
        for candidate in candidates:
            target = targets_by_key.setdefault(
                candidate["comparison_headword"],
                {
                    "comparison_headword": candidate["comparison_headword"],
                    "headwords": [],
                    "entry_ids": [],
                    "candidate_ids": [],
                },
            )
            if candidate["headword"] not in target["headwords"]:
                target["headwords"].append(candidate["headword"])
            if candidate["entry_id"] not in target["entry_ids"]:
                target["entry_ids"].append(candidate["entry_id"])
            target["candidate_ids"].append(candidate["id"])
        targets = list(targets_by_key.values())
        display_gloss = candidates[0]["english_gloss"]
        display_pos = next((candidate["part_of_speech"] for candidate in candidates if candidate["part_of_speech"]), None)
        input_text = f"<lexeme> {display_gloss}"
        if display_pos:
            input_text += f" <pos> {display_pos}"
        group_id = stable_id("mic-lexical-group", gloss_key, pos_key)
        status = "benchmark_ready_unique_target" if len(targets) == 1 else "review_multiple_distinct_targets"
        group = {
            "schema_version": SCHEMA_VERSION,
            "id": group_id,
            "language": "migmaq-listuguj",
            "direction": "eng-mic",
            "input_text": input_text,
            "unconditioned_input_text": display_gloss,
            "part_of_speech": display_pos,
            "comparison_english_gloss": gloss_key,
            "comparison_part_of_speech": pos_key,
            "source_gloss_candidate_ids": [candidate["id"] for candidate in candidates],
            "targets": targets,
            "distinct_target_count": len(targets),
            "mechanical_status": status,
            "benchmark_role": "development_census",
            "interpretation": "Source-gloss/POS reconstruction census; not independently adjudicated sense equivalence and not sentence-translation evidence.",
        }
        census.append(group)

        if len(targets) == 1:
            accepted_references = sorted(
                targets[0]["headwords"],
                key=lambda value: (comparison_text(value), value),
            )
            source_entry_ids = sorted(targets[0]["entry_ids"])
            legacy_splits = sorted(
                {
                    entry_by_id[entry_id]["legacy_v1_split"]
                    for entry_id in source_entry_ids
                    if entry_by_id[entry_id]["legacy_v1_split"]
                }
            )
            benchmark.append(
                {
                    "schema_version": SCHEMA_VERSION,
                    "id": stable_id("mic-lexical-benchmark", group_id),
                    "language": "migmaq-listuguj",
                    "direction": "eng-mic",
                    "input_text": input_text,
                    "unconditioned_input_text": display_gloss,
                    "output_text": accepted_references[0],
                    "accepted_references": accepted_references,
                    "part_of_speech": display_pos,
                    "pair_kind": "source_dictionary_lexical_reconstruction",
                    "source_lang": "eng_Latn",
                    "target_lang": "mic_Latn",
                    "task_tagging": {
                        "enabled": True,
                        "task": "lexeme",
                        "template": "<lexeme> {english_gloss} <pos> {part_of_speech}",
                    },
                    "source_gloss_candidate_ids": group["source_gloss_candidate_ids"],
                    "source_entry_ids": source_entry_ids,
                    "legacy_v1_splits": legacy_splits,
                    "benchmark_role": "development_census",
                    "promotion_eligible": False,
                    "interpretation": "Closed-set lexical reconstruction only; this row cannot authorize sentence generation.",
                }
            )
        else:
            review.append(
                {
                    "schema_version": SCHEMA_VERSION,
                    "id": stable_id("mic-review", "ambiguous-target", group_id),
                    "review_kind": "multiple_distinct_targets_for_gloss_and_pos",
                    "lexical_group_id": group_id,
                    "input_text": input_text,
                    "english_gloss": display_gloss,
                    "part_of_speech": display_pos,
                    "targets": targets,
                    "required_decision": "Classify targets as senses, synonyms, orthographic variants, dialect variants, inflections, or non-equivalent mappings before exact scoring.",
                }
            )

    by_headword: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        by_headword[entry["comparison_headword"]].append(entry)
        if not entry["sense_candidate_ids"]:
            review.append(
                {
                    "schema_version": SCHEMA_VERSION,
                    "id": stable_id("mic-review", "missing-gloss", entry["external_entry_id"]),
                    "review_kind": "entry_without_english_gloss",
                    "entry_id": entry["id"],
                    "external_entry_id": entry["external_entry_id"],
                    "headword": entry["headword"],
                    "required_decision": "Recover or document the missing English gloss; do not synthesize one without evidence.",
                }
            )
    for headword_key, collision_entries in sorted(by_headword.items()):
        if len(collision_entries) < 2:
            continue
        review.append(
            {
                "schema_version": SCHEMA_VERSION,
                "id": stable_id("mic-review", "headword-collision", headword_key),
                "review_kind": "normalized_headword_collision",
                "comparison_headword": headword_key,
                "entries": [
                    {
                        "entry_id": entry["id"],
                        "external_entry_id": entry["external_entry_id"],
                        "headword": entry["headword"],
                        "part_of_speech": entry["part_of_speech"],
                        "primary_translation": entry["primary_translation"],
                    }
                    for entry in collision_entries
                ],
                "required_decision": "Determine whether these are duplicate pages, homographs, or separate lexical records.",
            }
        )

    review.sort(key=lambda row: (row["review_kind"], row["id"]))
    return census, benchmark, review


def build_summary(
    records: dict[str, list[dict[str, Any]]],
    census: list[dict[str, Any]],
    benchmark: list[dict[str, Any]],
    review: list[dict[str, Any]],
    input_paths: dict[str, Path | None],
    output_hashes: dict[str, dict[str, Any]],
    generated_at_utc: str,
    program_id: str,
) -> dict[str, Any]:
    entries = records["entries"]
    senses = records["sense_candidates"]
    forms = records["forms_raw"]
    examples = records["examples"]
    media = records["media_links"]
    pos_counts = Counter(entry["part_of_speech"] or "(missing)" for entry in entries)
    legacy_split_counts = Counter(entry["legacy_v1_split"] or "(not crosswalked)" for entry in entries)
    review_counts = Counter(row["review_kind"] for row in review)
    source_field_counts = Counter()
    for sense in senses:
        fields = {field["field"] for field in sense["source_fields"]}
        if fields == {"translation"}:
            source_field_counts["translation_only"] += 1
        elif fields == {"meanings"}:
            source_field_counts["meanings_only"] += 1
        else:
            source_field_counts["translation_and_meanings"] += 1
    external_recording_ids = {row["external_recording_id"] for row in media if row["external_recording_id"]}
    audio_urls = {row["source_audio_url"] for row in media if row["source_audio_url"]}
    archive_paths = {row["archive_relative_path"] for row in media if row["archive_relative_path"]}
    speaker_counts = Counter(row["speaker_code"] or "(missing)" for row in media)
    grammatical_label_counts = Counter(
        row["grammatical_label"] for row in forms if row["grammatical_label"]
    )
    forms_by_pos = Counter(row["part_of_speech"] or "(missing)" for row in forms)
    candidate_ids_in_benchmark = {
        candidate_id for row in benchmark for candidate_id in row["source_gloss_candidate_ids"]
    }
    entries_in_benchmark = {entry_id for row in benchmark for entry_id in row["source_entry_ids"]}

    inputs: dict[str, Any] = {}
    for name, path in input_paths.items():
        if path is not None:
            inputs[name] = {"path": str(path.resolve()), "sha256": sha256(path)}

    return {
        "schema_version": SCHEMA_VERSION,
        "program_id": program_id,
        "generated_at_utc": generated_at_utc,
        "analysis_kind": "complete_source_dictionary_and_lexical_development_census",
        "inputs": inputs,
        "normalization": {
            "source": "NFC plus whitespace collapse",
            "comparison": "NFKC plus casefold, quote folding, and whitespace collapse",
            "not_removed": ["apostrophes", "hyphens", "internal punctuation"],
        },
        "counts": {
            "source_entries": len(entries),
            "unique_comparison_headwords": len({entry["comparison_headword"] for entry in entries}),
            "entries_with_primary_translation": sum(bool(entry["primary_translation"]) for entry in entries),
            "entries_with_gloss_candidates": sum(bool(entry["sense_candidate_ids"]) for entry in entries),
            "entries_with_part_of_speech": sum(bool(entry["part_of_speech"]) for entry in entries),
            "entries_with_pronunciation_guide": sum(bool(entry["pronunciation_guide"]) for entry in entries),
            "source_gloss_candidates": len(senses),
            "gloss_candidate_source_coverage": dict(sorted(source_field_counts.items())),
            "raw_alternate_forms": len(forms),
            "alternate_forms_with_source_layout_recovered": sum(
                row["structure_parse_status"] == "source_layout_recovered_unadjudicated" for row in forms
            ),
            "alternate_forms_unparsed": sum(row["structure_parse_status"] == "unparsed" for row in forms),
            "unique_alternate_surface_form_candidates": len({
                row["comparison_surface_form"] for row in forms if row.get("comparison_surface_form")
            }),
            "unique_raw_grammatical_labels": len(grammatical_label_counts),
            "raw_grammatical_labels": dict(sorted(grammatical_label_counts.items())),
            "alternate_forms_by_part_of_speech": dict(sorted(forms_by_pos.items())),
            "recorded_examples": len(examples),
            "media_references": len(media),
            "unique_external_recording_ids": len(external_recording_ids),
            "unique_audio_urls": len(audio_urls),
            "unique_archive_paths": len(archive_paths),
            "media_references_without_archive_path": sum(not row["archive_relative_path"] for row in media),
            "lexical_prompt_pos_groups": len(census),
            "benchmark_ready_unique_target_groups": len(benchmark),
            "ambiguous_target_groups": sum(row["distinct_target_count"] > 1 for row in census),
            "source_gloss_candidates_in_ready_benchmark": len(candidate_ids_in_benchmark),
            "source_entries_represented_in_ready_benchmark": len(entries_in_benchmark),
            "single_english_token_ready_rows": sum(
                len(comparison_text(row["unconditioned_input_text"]).split()) == 1 for row in benchmark
            ),
            "single_english_and_migmaq_token_ready_rows": sum(
                len(comparison_text(row["unconditioned_input_text"]).split()) == 1
                and all(len(comparison_text(reference).split()) == 1 for reference in row["accepted_references"])
                for row in benchmark
            ),
            "identity_mapping_ready_rows": sum(
                comparison_text(row["unconditioned_input_text"]) in {
                    comparison_text(reference) for reference in row["accepted_references"]
                }
                for row in benchmark
            ),
            "headwords_with_apostrophe": sum("'" in comparison_text(entry["headword"]) for entry in entries),
            "headwords_with_hyphen": sum("-" in comparison_text(entry["headword"]) for entry in entries),
            "review_queue": dict(sorted(review_counts.items())),
            "part_of_speech": dict(sorted(pos_counts.items())),
            "legacy_v1_split_crosswalk": dict(sorted(legacy_split_counts.items())),
            "speaker_code_media_references": dict(sorted(speaker_counts.items())),
        },
        "benchmark_contract": {
            "role": "development_census",
            "unit": "normalized English gloss plus normalized source part of speech",
            "eligible": "exactly one distinct comparison-normalized Mi'kmaq target",
            "review_required": "more than one distinct target for the same gloss/POS, missing gloss, or normalized headword collision",
            "task_prefix": "<lexeme>",
            "claim_limit": "lexical reconstruction only; no sentence-generation authorization",
            "sealed_final_status": "not_created",
        },
        "outputs": output_hashes,
    }


def build_census(
    entries_path: Path,
    output_root: Path,
    lexical_auxiliary_path: Path | None = None,
    source_id: str = DEFAULT_SOURCE_ID,
    program_id: str = DEFAULT_PROGRAM_ID,
    generated_at_utc: str | None = None,
    replace: bool = False,
) -> dict[str, Any]:
    if not entries_path.is_file():
        raise FileNotFoundError(entries_path)
    if lexical_auxiliary_path is not None and not lexical_auxiliary_path.is_file():
        raise FileNotFoundError(lexical_auxiliary_path)
    paths = output_paths(output_root)
    ensure_outputs_available(paths.values(), replace)
    generated_at_utc = generated_at_utc or datetime.now(timezone.utc).isoformat()

    source_entries = read_jsonl(entries_path)
    legacy_crosswalk = load_legacy_crosswalk(lexical_auxiliary_path)
    records = build_records(source_entries, legacy_crosswalk, source_id)
    census, benchmark, review = build_lexical_groups(records["entries"], records["sense_candidates"])

    data_by_name = {
        "entries": records["entries"],
        "sense_candidates": records["sense_candidates"],
        "forms_raw": records["forms_raw"],
        "examples": records["examples"],
        "media_links": records["media_links"],
        "lexical_census": census,
        "benchmark_ready": benchmark,
        "review_queue": review,
    }
    for name, rows in data_by_name.items():
        write_jsonl(paths[name], rows)

    output_hashes = {
        name: {
            "path": str(path.relative_to(output_root)),
            "rows": len(data_by_name[name]),
            "sha256": sha256(path),
        }
        for name, path in paths.items()
        if name in data_by_name
    }
    summary = build_summary(
        records,
        census,
        benchmark,
        review,
        {"entries": entries_path, "lexical_auxiliary": lexical_auxiliary_path, "builder": Path(__file__)},
        output_hashes,
        generated_at_utc,
        program_id,
    )
    write_json(paths["summary"], summary)

    checksum_targets = [paths[name] for name in data_by_name] + [paths["summary"]]
    checksum_lines = [f"{sha256(path)}  {path.relative_to(output_root)}" for path in checksum_targets]
    atomic_write(paths["checksums"], "\n".join(checksum_lines) + "\n")
    return summary


def main() -> None:
    args = parse_args()
    summary = build_census(
        entries_path=args.entries,
        output_root=args.output_root,
        lexical_auxiliary_path=args.lexical_auxiliary,
        source_id=args.source_id,
        program_id=args.program_id,
        generated_at_utc=args.generated_at_utc,
        replace=args.replace,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

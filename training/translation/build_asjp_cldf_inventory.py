#!/usr/bin/env python3
"""Build an evidence-preserving ASJP CLDF lexical inventory and review crosswalk."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import unicodedata
from typing import Any, Iterable


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_within(root: Path, raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        raise ValueError(f"path must be relative to program root: {raw_path}")
    resolved = (root / path).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"path escapes program root: {raw_path}") from exc
    return resolved


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number} must contain an object")
            rows.append(value)
    return rows


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"CSV has no header: {path}")
        rows = []
        for line_number, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f"CSV has overflow fields at {path}:{line_number}")
            if any(value is None for value in row.values()):
                raise ValueError(f"CSV has missing fields at {path}:{line_number}")
            rows.append({key: value for key, value in row.items() if key is not None})
        return rows


def verify_input(root: Path, spec: dict[str, Any], label: str) -> Path:
    relative_path = require_string(spec.get("path"), f"{label}.path")
    expected_hash = require_string(spec.get("sha256"), f"{label}.sha256")
    if not SHA256_RE.fullmatch(expected_hash):
        raise ValueError(f"{label}.sha256 is not a SHA-256 digest")
    path = resolve_within(root, relative_path)
    if not path.is_file():
        raise FileNotFoundError(f"{label}: {path}")
    actual_hash = sha256_file(path)
    if actual_hash != expected_hash:
        raise ValueError(
            f"{label} hash mismatch: expected {expected_hash}, found {actual_hash}"
        )
    return path


def normalize_english(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    cleaned: list[str] = []
    join_after_format = False
    for character in normalized:
        if unicodedata.category(character) == "Cf":
            while cleaned and cleaned[-1].isspace():
                cleaned.pop()
            join_after_format = True
            continue
        if join_after_format and character.isspace():
            continue
        join_after_format = False
        cleaned.append(character)
    normalized = "".join(cleaned)
    return " ".join(re.findall(r"[a-z0-9]+", normalized))


def english_tokens(value: str) -> frozenset[str]:
    normalized = normalize_english(value)
    return frozenset(normalized.split()) if normalized else frozenset()


def surface_key(value: str, *, casefold: bool) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    if casefold:
        normalized = normalized.casefold()
    return "".join(character for character in normalized if character.isalnum())


def levenshtein(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1]
                    + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def normalized_similarity(left: str, right: str, *, casefold: bool) -> float:
    left_key = surface_key(left, casefold=casefold)
    right_key = surface_key(right, casefold=casefold)
    maximum = max(len(left_key), len(right_key))
    if maximum == 0:
        return 1.0
    return round(1.0 - (levenshtein(left_key, right_key) / maximum), 6)


def stable_id(prefix: str, *parts: str) -> str:
    payload = "\x1f".join(parts).encode("utf-8")
    return f"{prefix}-{sha256_bytes(payload)[:20]}"


def require_columns(
    rows: list[dict[str, str]], columns: Iterable[str], label: str
) -> None:
    if not rows:
        raise ValueError(f"{label} has no rows")
    missing = sorted(set(columns) - set(rows[0]))
    if missing:
        raise ValueError(f"{label} is missing columns: {', '.join(missing)}")


def table_urls(cldf_metadata: dict[str, Any]) -> set[str]:
    tables = cldf_metadata.get("tables")
    if not isinstance(tables, list):
        raise ValueError("CLDF metadata has no tables array")
    urls: set[str] = set()
    for table in tables:
        if not isinstance(table, dict):
            raise ValueError("CLDF table metadata must be an object")
        url = table.get("url")
        if isinstance(url, str):
            urls.add(url)
    return urls


def verified_dictionary_rows(
    root: Path, dictionary_spec: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pointer_path = resolve_within(
        root,
        require_string(
            dictionary_spec.get("current_pointer_path"),
            "dictionary.current_pointer_path",
        ),
    )
    pointer = require_object(read_json(pointer_path), "dictionary current pointer")
    expected_pointer_hash = dictionary_spec.get("current_pointer_sha256")
    if expected_pointer_hash is not None:
        expected_pointer_hash = require_string(
            expected_pointer_hash, "dictionary.current_pointer_sha256"
        )
        actual_pointer_hash = sha256_file(pointer_path)
        if actual_pointer_hash != expected_pointer_hash:
            raise ValueError(
                "dictionary current pointer hash mismatch: "
                f"expected {expected_pointer_hash}, found {actual_pointer_hash}"
            )
    manifest_relative_path = require_string(
        pointer.get("manifest_path"), "dictionary pointer manifest_path"
    )
    manifest_path = resolve_within(root, manifest_relative_path)
    expected_manifest_hash = require_string(
        dictionary_spec.get("current_manifest_sha256"),
        "dictionary.current_manifest_sha256",
    )
    actual_manifest_hash = sha256_file(manifest_path)
    if actual_manifest_hash != expected_manifest_hash:
        raise ValueError(
            "dictionary manifest hash mismatch: "
            f"expected {expected_manifest_hash}, found {actual_manifest_hash}"
        )
    manifest = require_object(read_json(manifest_path), "dictionary manifest")
    expected_edition_id = require_string(
        dictionary_spec.get("current_edition_id"), "dictionary.current_edition_id"
    )
    if manifest.get("edition_id") != expected_edition_id:
        raise ValueError("dictionary edition identity does not match contract")
    components = require_object(manifest.get("components"), "dictionary components")

    component_rows: dict[str, list[dict[str, Any]]] = {}
    for component_name in ("entries", "senses", "forms"):
        component = require_object(
            components.get(component_name), f"dictionary component {component_name}"
        )
        component_path = resolve_within(
            root,
            require_string(
                component.get("path"), f"dictionary component {component_name}.path"
            ),
        )
        expected_hash = require_string(
            component.get("sha256"),
            f"dictionary component {component_name}.sha256",
        )
        if sha256_file(component_path) != expected_hash:
            raise ValueError(f"dictionary component hash mismatch: {component_name}")
        rows = read_jsonl(component_path)
        if len(rows) != component.get("rows"):
            raise ValueError(f"dictionary component row mismatch: {component_name}")
        component_rows[component_name] = rows

    entries = {
        require_string(row.get("sourceRecordId"), "entry sourceRecordId"): row
        for row in component_rows["entries"]
    }
    senses = {
        require_string(row.get("sourceRecordId"), "sense sourceRecordId"): row
        for row in component_rows["senses"]
    }
    forms = {
        require_string(row.get("sourceRecordId"), "form sourceRecordId"): row
        for row in component_rows["forms"]
    }
    source_record_ids = set(entries)
    if set(senses) != source_record_ids or set(forms) != source_record_ids:
        raise ValueError("dictionary entry, sense, and form keys do not agree")

    joined: list[dict[str, Any]] = []
    for source_record_id in sorted(source_record_ids):
        entry = entries[source_record_id]
        sense = senses[source_record_id]
        form = forms[source_record_id]
        joined.append(
            {
                "source_record_id": source_record_id,
                "entry_candidate_id": entry.get("entryCandidateId"),
                "sense_candidate_id": sense.get("senseCandidateId"),
                "form_candidate_id": form.get("formCandidateId"),
                "source_id": entry.get("sourceId"),
                "headword_source": entry.get("headwordSource"),
                "raw_part_of_speech": entry.get("rawPartOfSpeech"),
                "part_of_speech_status": entry.get("partOfSpeechStatus"),
                "record_kind": entry.get("recordKind"),
                "surface_source": form.get("surfaceSource"),
                "translation_source": sense.get("translationSource"),
                "definition_source": sense.get("definitionSource"),
                "dictionary_record_status": entry.get("status"),
                "substitutable_translation_status": sense.get(
                    "substitutableTranslationStatus"
                ),
            }
        )
    return (
        {
            "pointer_path": str(pointer_path.relative_to(root)),
            "pointer_sha256": sha256_file(pointer_path),
            "manifest_path": manifest_relative_path,
            "manifest_sha256": actual_manifest_hash,
            "edition_id": expected_edition_id,
            "joined_rows": len(joined),
        },
        joined,
    )


def relation_for_dictionary_row(
    concept_terms: set[str], dictionary_row: dict[str, Any]
) -> dict[str, Any] | None:
    candidates = (
        ("translation_source", dictionary_row.get("translation_source")),
        ("definition_source", dictionary_row.get("definition_source")),
    )
    best: tuple[int, int, str, str, str, str] | None = None
    for field, raw_value in candidates:
        if not isinstance(raw_value, str) or not raw_value.strip():
            continue
        normalized_value = normalize_english(raw_value)
        value_tokens = english_tokens(raw_value)
        primary_clause = re.split(r"[.;]", raw_value, maxsplit=1)[0]
        primary_tokens = normalize_english(primary_clause).split()
        for term in concept_terms:
            term_tokens = english_tokens(term)
            if not term_tokens:
                continue
            token_positions = [
                index
                for index, token in enumerate(normalized_value.split())
                if token in term_tokens
            ]
            first_position = min(token_positions) if token_positions else 1_000_000
            if normalized_value == term:
                priority = 7 if field == "translation_source" else 6
                relation = "exact_normalized_gloss"
                scope = "complete_field"
            elif value_tokens == term_tokens:
                priority = 6 if field == "translation_source" else 5
                relation = "token_set_equal_gloss"
                scope = "complete_field"
            elif field == "translation_source" and term_tokens.issubset(value_tokens):
                priority = 5
                relation = "concept_tokens_in_translation_gloss"
                scope = "translation_field"
            elif term_tokens.issubset(frozenset(primary_tokens[:12])):
                priority = 4
                relation = "concept_tokens_in_definition_head"
                scope = "first_clause_first_12_tokens"
            elif term_tokens.issubset(value_tokens):
                priority = 1
                relation = "concept_tokens_in_definition_context"
                scope = "full_definition_context"
            else:
                continue
            candidate = (
                priority,
                -first_position,
                relation,
                field,
                raw_value,
                scope,
            )
            if best is None or candidate > best:
                best = candidate
    if best is None:
        return None
    return {
        "priority": best[0],
        "first_token_index": -best[1],
        "relation": best[2],
        "field": best[3],
        "value": best[4],
        "scope": best[5],
    }


def crosswalk_sort_key(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        -row["english_relation_priority"],
        -int(row["dictionary_pos_evidence_present"]),
        row["english_match_first_token_index"],
        -row["raw_surface_similarity_case_sensitive"],
        -row["raw_surface_similarity_casefolded"],
        row["dictionary_source_record_id"],
    )


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        for row in rows:
            handle.write(canonical_json(row) + "\n")


def write_json(path: Path, value: Any) -> None:
    path.write_text(canonical_json(value) + "\n", encoding="utf-8")


def output_component(path: Path, row_count: int | None) -> dict[str, Any]:
    return {
        "path": path.name,
        "sha256": sha256_file(path),
        "rows": row_count,
        "bytes": path.stat().st_size,
    }


def compare_or_promote(staging: Path, output: Path) -> str:
    if output.exists():
        expected = sorted(
            path.relative_to(staging) for path in staging.rglob("*") if path.is_file()
        )
        observed = sorted(
            path.relative_to(output) for path in output.rglob("*") if path.is_file()
        )
        if expected != observed:
            raise FileExistsError(f"immutable output differs in file set: {output}")
        for relative_path in expected:
            if (staging / relative_path).read_bytes() != (output / relative_path).read_bytes():
                raise FileExistsError(
                    f"immutable output differs at {relative_path}: {output}"
                )
        return "verified_existing"
    output.parent.mkdir(parents=True, exist_ok=True)
    staging.replace(output)
    return "written"


def build(program_root: Path, contract: dict[str, Any], write: bool) -> dict[str, Any]:
    if contract.get("schema_version") != 1:
        raise ValueError("contract schema_version must be 1")
    inventory_id = require_string(contract.get("inventory_id"), "inventory_id")
    created_at_utc = require_string(contract.get("created_at_utc"), "created_at_utc")
    language = require_object(contract.get("language"), "language")
    source_id = require_string(contract.get("source_id"), "source_id")
    inputs = require_object(contract.get("inputs"), "inputs")

    input_paths: dict[str, Path] = {}
    for label, raw_spec in sorted(inputs.items()):
        input_paths[label] = verify_input(
            program_root, require_object(raw_spec, f"inputs.{label}"), f"inputs.{label}"
        )

    required_inputs = {
        "cldf_metadata",
        "forms_csv",
        "languages_csv",
        "parameters_csv",
        "release_zip",
        "source_json",
        "contributor_json",
        "wordlist_json",
        "zenodo_record_json",
        "license_text",
        "transcription_guide",
    }
    missing_inputs = sorted(required_inputs - set(input_paths))
    if missing_inputs:
        raise ValueError(f"contract is missing inputs: {', '.join(missing_inputs)}")

    cldf_metadata = require_object(
        read_json(input_paths["cldf_metadata"]), "CLDF metadata"
    )
    expected_tables = {"forms.csv", "languages.csv", "parameters.csv"}
    if not expected_tables.issubset(table_urls(cldf_metadata)):
        raise ValueError("CLDF metadata does not declare all required tables")

    language_rows = read_csv_rows(input_paths["languages_csv"])
    parameter_rows = read_csv_rows(input_paths["parameters_csv"])
    form_rows = read_csv_rows(input_paths["forms_csv"])
    require_columns(
        language_rows,
        ("ID", "Name", "Glottocode", "ISO639P3code", "transcribers"),
        "languages.csv",
    )
    require_columns(
        parameter_rows,
        ("ID", "Name", "Concepticon_ID", "Concepticon_Gloss"),
        "parameters.csv",
    )
    require_columns(
        form_rows,
        (
            "ID",
            "Language_ID",
            "Parameter_ID",
            "Value",
            "Form",
            "Segments",
            "Source",
            "gloss_in_source",
        ),
        "forms.csv",
    )

    cldf_language_id = require_string(language.get("cldf_id"), "language.cldf_id")
    selected_languages = [row for row in language_rows if row["ID"] == cldf_language_id]
    if len(selected_languages) != 1:
        raise ValueError(
            f"expected exactly one CLDF language row for {cldf_language_id}"
        )
    language_row = selected_languages[0]
    expected_iso = require_string(language.get("iso_639_3"), "language.iso_639_3")
    expected_glottocode = require_string(
        language.get("glottocode"), "language.glottocode"
    )
    if language_row["ISO639P3code"] != expected_iso:
        raise ValueError("CLDF ISO code does not match contract")
    if language_row["Glottocode"] != expected_glottocode:
        raise ValueError("CLDF Glottocode does not match contract")

    source_json = require_object(read_json(input_paths["source_json"]), "source JSON")
    contributor_json = require_object(
        read_json(input_paths["contributor_json"]), "contributor JSON"
    )
    wordlist_json = require_object(
        read_json(input_paths["wordlist_json"]), "wordlist JSON"
    )
    zenodo_record = require_object(
        read_json(input_paths["zenodo_record_json"]), "Zenodo record JSON"
    )
    expected_source_key = require_string(
        contract.get("asjp_source_key"), "asjp_source_key"
    )
    if str(source_json.get("id")) != expected_source_key:
        raise ValueError("ASJP source JSON identity does not match contract")
    if wordlist_json.get("id") != cldf_language_id:
        raise ValueError("ASJP wordlist JSON language identity does not match contract")
    if wordlist_json.get("code_iso") != expected_iso:
        raise ValueError("ASJP wordlist JSON ISO code does not match contract")
    if wordlist_json.get("code_glottolog") != expected_glottocode:
        raise ValueError("ASJP wordlist JSON Glottocode does not match contract")
    expected_contributor = require_string(
        contract.get("contributor_name"), "contributor_name"
    )
    if contributor_json.get("name") != expected_contributor:
        raise ValueError("ASJP contributor identity does not match contract")

    parameters = {row["ID"]: row for row in parameter_rows}
    selected_forms = [row for row in form_rows if row["Language_ID"] == cldf_language_id]
    if not selected_forms:
        raise ValueError("no CLDF forms found for contracted language")
    if any(row["Source"] != expected_source_key for row in selected_forms):
        raise ValueError("Wajarri CLDF rows contain an unexpected source key")
    missing_parameters = sorted(
        {row["Parameter_ID"] for row in selected_forms} - set(parameters)
    )
    if missing_parameters:
        raise ValueError(
            f"forms reference missing parameters: {', '.join(missing_parameters)}"
        )

    dictionary_checkpoint, dictionary_rows = verified_dictionary_rows(
        program_root, require_object(contract.get("dictionary"), "dictionary")
    )

    selected_forms.sort(
        key=lambda row: (int(row["Parameter_ID"]), row["ID"], row["Form"])
    )
    concepts_by_parameter: dict[str, list[dict[str, str]]] = {}
    for row in selected_forms:
        concepts_by_parameter.setdefault(row["Parameter_ID"], []).append(row)

    concept_output: list[dict[str, Any]] = []
    form_output: list[dict[str, Any]] = []
    crosswalk_output: list[dict[str, Any]] = []
    for parameter_id in sorted(concepts_by_parameter, key=int):
        parameter = parameters[parameter_id]
        source_forms = concepts_by_parameter[parameter_id]
        concept_id = f"asjp-{cldf_language_id.lower()}-concept-{int(parameter_id):03d}"
        concept_terms = {
            normalize_english(parameter["Name"].lstrip("*")),
            normalize_english(parameter["Concepticon_Gloss"]),
            *(normalize_english(row["gloss_in_source"]) for row in source_forms),
        }
        concept_terms.discard("")
        concept_output.append(
            {
                "concept_id": concept_id,
                "parameter_id": parameter_id,
                "asjp_name": parameter["Name"],
                "concepticon_id": parameter["Concepticon_ID"],
                "concepticon_gloss": parameter["Concepticon_Gloss"],
                "glosses_in_source": sorted(
                    {row["gloss_in_source"] for row in source_forms}
                ),
                "asjp_form_ids": [row["ID"] for row in source_forms],
                "asjp_form_count": len(source_forms),
                "representation": "ASJPcode_and_CLDF_segments",
                "practical_orthography_status": "unresolved_not_inferred",
                "linguistic_acceptance": "source_representation_only",
                "dictionary_acceptance": False,
                "synthetic_sentence_pair_eligible": False,
                "training_eligible": False,
            }
        )
        for source_form in source_forms:
            form_id = source_form["ID"]
            form_output.append(
                {
                    "asjp_form_id": form_id,
                    "concept_id": concept_id,
                    "language_id": cldf_language_id,
                    "source_id": source_id,
                    "source_bibliography_key": source_form["Source"],
                    "parameter_id": parameter_id,
                    "concepticon_id": parameter["Concepticon_ID"],
                    "concepticon_gloss": parameter["Concepticon_Gloss"],
                    "gloss_in_source": source_form["gloss_in_source"],
                    "value_source": source_form["Value"],
                    "form_source": source_form["Form"],
                    "segments_source": source_form["Segments"].split(),
                    "graphemes_source": source_form.get("Graphemes", "").split(),
                    "loan_flag_source": source_form.get("Loan") or None,
                    "comment_source": source_form.get("Comment") or None,
                    "representation": "ASJPcode_and_CLDF_segments",
                    "practical_orthography_status": "unresolved_not_inferred",
                    "orthographic_conversion_applied": False,
                    "dictionary_acceptance": False,
                    "benchmark_reference_eligible": False,
                    "synthetic_sentence_pair_eligible": False,
                    "training_eligible": False,
                    "hosted_processing_eligible": False,
                    "release_eligible_for_asjp_representation": True,
                    "release_conditions": "CC_BY_4_0_attribution_and_source_notice",
                }
            )
            candidates: list[dict[str, Any]] = []
            for dictionary_row in dictionary_rows:
                relation = relation_for_dictionary_row(concept_terms, dictionary_row)
                if relation is None:
                    continue
                practical_surface = dictionary_row.get("surface_source")
                if not isinstance(practical_surface, str):
                    practical_surface = ""
                relation_name = relation["relation"]
                evidence_field = relation["field"]
                evidence_value = relation["value"]
                candidates.append(
                    {
                        "crosswalk_candidate_id": stable_id(
                            "asjp-xwalk",
                            form_id,
                            str(dictionary_row["source_record_id"]),
                            relation_name,
                            evidence_field,
                        ),
                        "asjp_form_id": form_id,
                        "concept_id": concept_id,
                        "dictionary_source_record_id": dictionary_row[
                            "source_record_id"
                        ],
                        "dictionary_source_id": dictionary_row.get("source_id"),
                        "entry_candidate_id": dictionary_row.get("entry_candidate_id"),
                        "sense_candidate_id": dictionary_row.get("sense_candidate_id"),
                        "form_candidate_id": dictionary_row.get("form_candidate_id"),
                        "english_relation": relation_name,
                        "english_relation_priority": relation["priority"],
                        "english_evidence_field": evidence_field,
                        "english_evidence_value": evidence_value,
                        "english_evidence_scope": relation["scope"],
                        "english_match_first_token_index": relation[
                            "first_token_index"
                        ],
                        "asjp_surface_source": source_form["Form"],
                        "dictionary_surface_source": practical_surface,
                        "dictionary_raw_part_of_speech": dictionary_row.get(
                            "raw_part_of_speech"
                        ),
                        "dictionary_part_of_speech_status": dictionary_row.get(
                            "part_of_speech_status"
                        ),
                        "dictionary_pos_evidence_present": bool(
                            dictionary_row.get("raw_part_of_speech")
                        ),
                        "raw_surface_similarity_case_sensitive": normalized_similarity(
                            source_form["Form"], practical_surface, casefold=False
                        ),
                        "raw_surface_similarity_casefolded": normalized_similarity(
                            source_form["Form"], practical_surface, casefold=True
                        ),
                        "surface_similarity_policy": "unmapped_character_edit_similarity_for_review_order_only",
                        "orthography_relation": "unresolved_not_inferred",
                        "lexical_identity_status": "review_candidate_not_accepted",
                        "sense_relation_status": "review_candidate_not_accepted",
                        "substitutability_status": "unresolved",
                        "dictionary_acceptance": False,
                        "benchmark_reference_eligible": False,
                        "synthetic_sentence_pair_eligible": False,
                        "training_eligible": False,
                    }
                )
            candidates.sort(key=crosswalk_sort_key)
            for review_rank, candidate in enumerate(candidates, start=1):
                candidate["review_rank_within_asjp_form"] = review_rank
                crosswalk_output.append(candidate)

    concept_count = len(concept_output)
    form_count = len(form_output)
    expected_counts = require_object(contract.get("expected_counts"), "expected_counts")
    if concept_count != expected_counts.get("concepts"):
        raise ValueError(
            f"concept count mismatch: expected {expected_counts.get('concepts')}, found {concept_count}"
        )
    if form_count != expected_counts.get("forms"):
        raise ValueError(
            f"form count mismatch: expected {expected_counts.get('forms')}, found {form_count}"
        )

    verification_rows = []
    for label, raw_spec in sorted(inputs.items()):
        spec = require_object(raw_spec, f"inputs.{label}")
        path = input_paths[label]
        verification_rows.append(
            {
                "input_key": label,
                "path": require_string(spec.get("path"), f"inputs.{label}.path"),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "verification_status": "exact_hash_match",
            }
        )

    report = {
        "schema_version": 1,
        "inventory_id": inventory_id,
        "created_at_utc": created_at_utc,
        "source_id": source_id,
        "language": {
            "cldf_id": cldf_language_id,
            "name": language_row["Name"],
            "iso_639_3": expected_iso,
            "glottocode": expected_glottocode,
            "transcriber": language_row["transcribers"],
        },
        "release": contract.get("release"),
        "source_bibliography": {
            "key": expected_source_key,
            "author": source_json.get("author"),
            "year": source_json.get("year"),
            "title": source_json.get("title"),
        },
        "contributor": contributor_json.get("name"),
        "zenodo_record_id": zenodo_record.get("id"),
        "dictionary_checkpoint": dictionary_checkpoint,
        "counts": {
            "concepts": concept_count,
            "forms": form_count,
            "crosswalk_candidates": len(crosswalk_output),
            "dictionary_rows_compared": len(dictionary_rows),
            "accepted_dictionary_rows": 0,
            "accepted_grammar_rows": 0,
            "benchmark_reference_rows": 0,
            "controlled_synthetic_sentence_pairs_authorized": 0,
            "training_eligible_rows": 0,
        },
        "findings": [
            "ASJP v21 preserves a Wajarri comparative wordlist derived from Douglas 1981.",
            "The CLDF release contains 35 concepts and 47 form rows for Wajarri.",
            "ASJPcode and CLDF segment strings are retained exactly as source representations.",
            "No ASJP-to-practical-Wajarri orthographic conversion is inferred.",
            "English-gloss and unmapped raw-surface similarities create review candidates only.",
            "Field and token-position evidence ranks direct translations and definition heads above incidental definition context.",
            "Structured dictionary part-of-speech evidence breaks otherwise tied review candidates ahead of POS-less cross-references.",
            "No candidate is accepted as a dictionary fact, benchmark reference, controlled sentence-pair input, or training row.",
        ],
        "evidence_policy": {
            "source_representation": "preserve_exactly",
            "practical_orthography": "unresolved_not_inferred",
            "crosswalk": "dynamic_review_candidates_only",
            "crosswalk_ranking_policy": "field_position_and_structured_pos_aware_v3",
            "model_or_synthetic_output_is_evidence": False,
            "dictionary_acceptance": False,
            "grammar_acceptance": False,
            "synthetic_generation_opened": False,
            "training_opened": False,
        },
        "rights": {
            "asjp_release_representation": "CC_BY_4_0",
            "attribution_required": True,
            "underlying_douglas_source_relicensed_by_inference": False,
            "hosted_or_training_use_for_practical_translation_task": False,
            "reason": "The licensed ASJP representation is comparative transcription; its relation to the practical target orthography and accepted task senses is unresolved.",
        },
    }

    output_relative = require_string(contract.get("output_directory"), "output_directory")
    output = resolve_within(program_root, output_relative)
    if not write:
        return {
            "mode": "dry_run",
            "output": output_relative,
            "counts": report["counts"],
            "dictionary_checkpoint": dictionary_checkpoint,
        }

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_parent = Path(
        tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent)
    )
    staging = temporary_parent / "artifact"
    staging.mkdir()
    try:
        concepts_path = staging / "concepts.jsonl"
        forms_path = staging / "forms.jsonl"
        crosswalk_path = staging / "dictionary-crosswalk-candidates.jsonl"
        verification_path = staging / "source-artifact-verification.jsonl"
        report_path = staging / "REPORT.json"
        write_jsonl(concepts_path, concept_output)
        write_jsonl(forms_path, form_output)
        write_jsonl(crosswalk_path, crosswalk_output)
        write_jsonl(verification_path, verification_rows)
        write_json(report_path, report)
        manifest = {
            "schema_version": 1,
            "inventory_id": inventory_id,
            "created_at_utc": created_at_utc,
            "source_id": source_id,
            "output_directory": output_relative,
            "components": {
                "concepts": output_component(concepts_path, concept_count),
                "forms": output_component(forms_path, form_count),
                "dictionary_crosswalk_candidates": output_component(
                    crosswalk_path, len(crosswalk_output)
                ),
                "source_artifact_verification": output_component(
                    verification_path, len(verification_rows)
                ),
                "report": output_component(report_path, None),
            },
            "counts": report["counts"],
            "dictionary_checkpoint": dictionary_checkpoint,
            "claim_limit": "This inventory verifies an open ASJP comparative representation and creates review candidates. It accepts no practical-Wajarri lexical mapping, grammatical rule, benchmark reference, controlled English-Wajarri sentence pair, training row, or translation claim.",
        }
        manifest_path = staging / "MANIFEST.json"
        write_json(manifest_path, manifest)
        outcome = compare_or_promote(staging, output)
    finally:
        if temporary_parent.exists():
            shutil.rmtree(temporary_parent)

    return {
        "mode": outcome,
        "output": output_relative,
        "manifest_sha256": sha256_file(output / "MANIFEST.json"),
        "counts": report["counts"],
        "dictionary_checkpoint": dictionary_checkpoint,
    }


def main() -> None:
    args = parse_args()
    root = args.program_root.resolve()
    contract_path = args.contract
    if not contract_path.is_absolute():
        contract_path = resolve_within(root, str(contract_path))
    contract = require_object(read_json(contract_path), "contract")
    print(canonical_json(build(root, contract, args.write)))


if __name__ == "__main__":
    main()

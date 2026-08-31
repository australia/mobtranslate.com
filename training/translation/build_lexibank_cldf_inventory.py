#!/usr/bin/env python3
"""Build a lossless CLDF lexical inventory and living-dictionary review crosswalk."""

from __future__ import annotations

import argparse
import re
import shutil
import tempfile
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from build_asjp_cldf_inventory import (
    canonical_json,
    normalize_english,
    normalized_similarity,
    output_component,
    read_csv_rows,
    read_json,
    read_jsonl,
    relation_for_dictionary_row,
    require_columns,
    require_object,
    require_string,
    resolve_within,
    sha256_file,
    stable_id,
    surface_key,
    table_urls,
    verify_input,
)

BIBTEX_ENTRY_RE = re.compile(r"@[A-Za-z]+\s*\{\s*([^,\s]+)\s*,")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        for row in rows:
            handle.write(canonical_json(row) + "\n")


def write_json(path: Path, value: Any) -> None:
    path.write_text(canonical_json(value) + "\n", encoding="utf-8")


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


def bibtex_entry_keys(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    return {match.group(1) for match in BIBTEX_ENTRY_RE.finditer(text)}


def unique_index(
    rows: list[dict[str, Any]], key_name: str, label: str
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row_number, row in enumerate(rows, start=1):
        key = require_string(row.get(key_name), f"{label}[{row_number}].{key_name}")
        if key in result:
            raise ValueError(f"duplicate {label} {key_name}: {key}")
        result[key] = row
    return result


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
    expected_pointer_hash = require_string(
        dictionary_spec.get("current_pointer_sha256"),
        "dictionary.current_pointer_sha256",
    )
    actual_pointer_hash = sha256_file(pointer_path)
    if actual_pointer_hash != expected_pointer_hash:
        raise ValueError(
            "dictionary current pointer hash mismatch: "
            f"expected {expected_pointer_hash}, found {actual_pointer_hash}"
        )
    pointer = require_object(read_json(pointer_path), "dictionary current pointer")
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
    component_checkpoint: dict[str, Any] = {}
    for component_name in ("entries", "senses", "forms"):
        component = require_object(
            components.get(component_name), f"dictionary component {component_name}"
        )
        component_path_string = require_string(
            component.get("path"), f"dictionary component {component_name}.path"
        )
        component_path = resolve_within(root, component_path_string)
        expected_hash = require_string(
            component.get("sha256"),
            f"dictionary component {component_name}.sha256",
        )
        actual_hash = sha256_file(component_path)
        if actual_hash != expected_hash:
            raise ValueError(f"dictionary component hash mismatch: {component_name}")
        rows = read_jsonl(component_path)
        expected_rows = component.get("rows")
        if not isinstance(expected_rows, int) or len(rows) != expected_rows:
            raise ValueError(f"dictionary component row mismatch: {component_name}")
        component_rows[component_name] = rows
        component_checkpoint[component_name] = {
            "path": component_path_string,
            "sha256": actual_hash,
            "rows": len(rows),
        }

    entries = unique_index(component_rows["entries"], "entryCandidateId", "entries")
    forms = unique_index(component_rows["forms"], "formCandidateId", "forms")
    senses = unique_index(component_rows["senses"], "senseCandidateId", "senses")

    forms_by_entry: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for form in forms.values():
        entry_id = require_string(form.get("entryCandidateId"), "form.entryCandidateId")
        if entry_id not in entries:
            raise ValueError(f"dictionary form references missing entry: {entry_id}")
        forms_by_entry[entry_id].append(form)

    senses_by_entry: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sense in senses.values():
        entry_id = require_string(
            sense.get("entryCandidateId"), "sense.entryCandidateId"
        )
        if entry_id not in entries:
            raise ValueError(f"dictionary sense references missing entry: {entry_id}")
        senses_by_entry[entry_id].append(sense)

    joined: list[dict[str, Any]] = []
    for entry_id, entry in sorted(entries.items()):
        entry_forms = sorted(
            forms_by_entry.get(entry_id, []),
            key=lambda row: str(row.get("formCandidateId", "")),
        )
        entry_senses = sorted(
            senses_by_entry.get(entry_id, []),
            key=lambda row: str(row.get("senseCandidateId", "")),
        )
        if not entry_forms:
            raise ValueError(f"dictionary entry has no form: {entry_id}")
        if not entry_senses:
            raise ValueError(f"dictionary entry has no sense: {entry_id}")
        for form in entry_forms:
            for sense in entry_senses:
                joined.append(
                    {
                        "entry_candidate_id": entry_id,
                        "entry_source_record_id": entry.get("sourceRecordId"),
                        "entry_source_record_ids": entry.get("sourceRecordIds"),
                        "sense_candidate_id": sense.get("senseCandidateId"),
                        "sense_source_record_id": sense.get("sourceRecordId"),
                        "form_candidate_id": form.get("formCandidateId"),
                        "form_source_record_id": form.get("sourceRecordId"),
                        "dictionary_source_id": entry.get("sourceId"),
                        "headword_source": entry.get("headwordSource"),
                        "surface_source": form.get("surfaceSource"),
                        "translation_source": sense.get("translationSource"),
                        "definition_source": sense.get("definitionSource"),
                        "raw_part_of_speech": entry.get("rawPartOfSpeech"),
                        "part_of_speech_status": entry.get("partOfSpeechStatus"),
                        "entry_status": entry.get("status"),
                        "sense_status": sense.get("status"),
                        "form_status": form.get("status"),
                        "substitutable_translation_status": sense.get(
                            "substitutableTranslationStatus"
                        ),
                        "synthetic_eligibility": sense.get("syntheticEligibility")
                        or entry.get("syntheticEligibility")
                        or form.get("syntheticEligibility"),
                    }
                )

    return (
        {
            "pointer_path": str(pointer_path.relative_to(root)),
            "pointer_sha256": actual_pointer_hash,
            "manifest_path": manifest_relative_path,
            "manifest_sha256": actual_manifest_hash,
            "edition_id": expected_edition_id,
            "components": component_checkpoint,
            "entries": len(entries),
            "senses": len(senses),
            "forms": len(forms),
            "joined_entry_form_sense_rows": len(joined),
        },
        joined,
    )


def control_characters(value: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for index, character in enumerate(value):
        category = unicodedata.category(character)
        if category not in {"Cc", "Cf"}:
            continue
        findings.append(
            {
                "index": index,
                "codepoint": f"U+{ord(character):04X}",
                "unicode_category": category,
                "unicode_name": unicodedata.name(character, "UNNAMED"),
            }
        )
    return findings


def source_risk_analysis(row: dict[str, str]) -> dict[str, Any]:
    value = row["Value"]
    form = row["Form"]
    comment = row.get("Comment", "")
    controls: dict[str, list[dict[str, Any]]] = {}
    for field, raw_value in (("Value", value), ("Form", form), ("Comment", comment)):
        findings = control_characters(raw_value)
        if findings:
            controls[field] = findings
    flags: list[str] = []
    if controls:
        flags.append("unicode_control_or_format_character")
    if form.startswith("-") or form.endswith("-"):
        flags.append("morphological_boundary_marker")
    if any(character.isspace() for character in form.strip()):
        flags.append("multi_token_form")
    if value.rstrip().endswith(("!", "?")) or form.rstrip().endswith(("!", "?")):
        flags.append("utterance_punctuation")
    if any(delimiter in value for delimiter in (",", "/", ";")):
        flags.append("multiple_value_delimiter")
    if value != form:
        flags.append("source_value_differs_from_cldf_form")
    if not row.get("Segments", "").strip():
        flags.append("empty_segments")
    if comment.strip():
        flags.append("source_comment_present")
    return {
        "flags": sorted(set(flags)),
        "control_characters": controls,
    }


def surface_relation(
    source_surface: str,
    dictionary_surface: str,
    *,
    near_similarity_minimum: float,
) -> dict[str, Any] | None:
    if not source_surface or not dictionary_surface:
        return None
    source_nfkc = unicodedata.normalize("NFKC", source_surface)
    dictionary_nfkc = unicodedata.normalize("NFKC", dictionary_surface)
    case_sensitive_similarity = normalized_similarity(
        source_surface, dictionary_surface, casefold=False
    )
    casefolded_similarity = normalized_similarity(
        source_surface, dictionary_surface, casefold=True
    )
    if source_nfkc == dictionary_nfkc:
        relation = "exact_nfkc_surface"
        priority = 5
    elif source_nfkc.casefold() == dictionary_nfkc.casefold():
        relation = "exact_nfkc_casefolded_surface"
        priority = 4
    elif surface_key(source_surface, casefold=True) == surface_key(
        dictionary_surface, casefold=True
    ):
        relation = "same_alphanumeric_surface"
        priority = 3
    elif casefolded_similarity >= near_similarity_minimum:
        relation = "near_edit_surface_for_review"
        priority = 1
    else:
        return None
    return {
        "relation": relation,
        "priority": priority,
        "similarity_case_sensitive": case_sensitive_similarity,
        "similarity_casefolded": casefolded_similarity,
    }


def candidate_class(
    english_relation: dict[str, Any] | None,
    form_relation: dict[str, Any] | None,
) -> tuple[str, int]:
    strong_english = bool(
        english_relation is not None and english_relation["priority"] >= 5
    )
    exact_surface = bool(form_relation is not None and form_relation["priority"] >= 4)
    normalized_surface = bool(
        form_relation is not None and form_relation["priority"] == 3
    )
    if strong_english and exact_surface:
        return "exact_surface_and_strong_gloss_corroboration_candidate", 6
    if strong_english and normalized_surface:
        return "normalized_surface_and_strong_gloss_candidate", 5
    if exact_surface and english_relation is None:
        return "exact_surface_sense_conflict_review", 4
    if strong_english:
        return "strong_gloss_alternate_surface_candidate", 3
    if form_relation is not None and english_relation is not None:
        return "weak_gloss_and_surface_review_candidate", 2
    return "single_channel_review_candidate", 1


def crosswalk_sort_key(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        -row["machine_candidate_priority"],
        -row["english_relation_priority"],
        -row["surface_relation_priority"],
        -row["surface_similarity_casefolded"],
        row["dictionary_entry_candidate_id"],
        row["dictionary_sense_candidate_id"],
        row["dictionary_form_candidate_id"],
    )


def form_review_class(candidates: list[dict[str, Any]]) -> str:
    classes = {row["machine_candidate_class"] for row in candidates}
    for category in (
        "exact_surface_and_strong_gloss_corroboration_candidate",
        "normalized_surface_and_strong_gloss_candidate",
        "exact_surface_sense_conflict_review",
        "strong_gloss_alternate_surface_candidate",
        "weak_gloss_and_surface_review_candidate",
        "single_channel_review_candidate",
    ):
        if category in classes:
            return category
    return "source_only_unlinked_lexical_candidate"


def validate_release_identity(
    contract: dict[str, Any], input_paths: dict[str, Path]
) -> dict[str, Any]:
    release = require_object(contract.get("release"), "release")
    zenodo = require_object(
        read_json(input_paths["zenodo_record_json"]), "Zenodo record JSON"
    )
    github_tag = require_object(
        read_json(input_paths["github_tag_json"]), "GitHub tag JSON"
    )
    expected_record = release.get("zenodo_record_id")
    if zenodo.get("id") != expected_record:
        raise ValueError("Zenodo record identity does not match contract")
    zenodo_metadata = require_object(zenodo.get("metadata"), "Zenodo metadata")
    expected_version = require_string(release.get("version"), "release.version")
    if zenodo_metadata.get("version") != expected_version:
        raise ValueError("Zenodo release version does not match contract")
    license_record = require_object(zenodo_metadata.get("license"), "Zenodo license")
    expected_license_id = require_string(
        release.get("license_id"), "release.license_id"
    )
    if license_record.get("id") != expected_license_id:
        raise ValueError("Zenodo release license does not match contract")
    expected_commit = require_string(
        release.get("github_commit"), "release.github_commit"
    )
    github_object = require_object(github_tag.get("object"), "GitHub tag object")
    if github_object.get("sha") != expected_commit:
        raise ValueError("GitHub tag commit does not match contract")
    if github_tag.get("ref") != f"refs/tags/{expected_version}":
        raise ValueError("GitHub tag ref does not match release version")
    return {
        "version": expected_version,
        "zenodo_record_id": expected_record,
        "license_id": expected_license_id,
        "github_commit": expected_commit,
        "zenodo_title": zenodo_metadata.get("title"),
    }


def build(program_root: Path, contract: dict[str, Any], write: bool) -> dict[str, Any]:
    if contract.get("schema_version") != 1:
        raise ValueError("contract schema_version must be 1")
    inventory_id = require_string(contract.get("inventory_id"), "inventory_id")
    created_at_utc = require_string(contract.get("created_at_utc"), "created_at_utc")
    source_id = require_string(contract.get("source_id"), "source_id")
    language = require_object(contract.get("language"), "language")
    inputs = require_object(contract.get("inputs"), "inputs")

    input_paths: dict[str, Path] = {}
    for label, raw_spec in sorted(inputs.items()):
        input_paths[label] = verify_input(
            program_root,
            require_object(raw_spec, f"inputs.{label}"),
            f"inputs.{label}",
        )
    required_inputs = {
        "cldf_metadata",
        "forms_csv",
        "languages_csv",
        "parameters_csv",
        "sources_bib",
        "release_zip",
        "zenodo_record_json",
        "github_tag_json",
        "license_text",
        "readme",
        "raw_wordlist_tsv",
    }
    missing_inputs = sorted(required_inputs - set(input_paths))
    if missing_inputs:
        raise ValueError(f"contract is missing inputs: {', '.join(missing_inputs)}")

    release_identity = validate_release_identity(contract, input_paths)
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
        ("ID", "Name", "Glottocode", "ISO639P3code"),
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
            "Comment",
            "Source",
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

    parameters = unique_index(parameter_rows, "ID", "parameters")
    selected_forms = [row for row in form_rows if row["Language_ID"] == cldf_language_id]
    if not selected_forms:
        raise ValueError("no CLDF forms found for contracted language")
    missing_parameters = sorted(
        {row["Parameter_ID"] for row in selected_forms} - set(parameters)
    )
    if missing_parameters:
        raise ValueError(
            f"forms reference missing parameters: {', '.join(missing_parameters)}"
        )

    expected_source_keys = {
        require_string(value, "source_bibliography_keys[]")
        for value in contract.get("source_bibliography_keys", [])
    }
    if not expected_source_keys:
        raise ValueError("source_bibliography_keys must not be empty")
    observed_source_keys = {row["Source"] for row in selected_forms}
    if observed_source_keys != expected_source_keys:
        raise ValueError(
            "CLDF source keys do not match contract: "
            f"expected {sorted(expected_source_keys)}, found {sorted(observed_source_keys)}"
        )
    available_bibtex_keys = bibtex_entry_keys(input_paths["sources_bib"])
    if not expected_source_keys.issubset(available_bibtex_keys):
        raise ValueError("CLDF source bibliography is missing a contracted key")

    expected_counts = require_object(contract.get("expected_counts"), "expected_counts")
    expected_form_count = expected_counts.get("forms")
    expected_concept_count = expected_counts.get("concepts")
    expected_unique_forms = expected_counts.get("unique_forms")
    if len(selected_forms) != expected_form_count:
        raise ValueError(
            f"form count mismatch: expected {expected_form_count}, found {len(selected_forms)}"
        )
    observed_parameter_ids = {row["Parameter_ID"] for row in selected_forms}
    if len(observed_parameter_ids) != expected_concept_count:
        raise ValueError(
            "concept count mismatch: "
            f"expected {expected_concept_count}, found {len(observed_parameter_ids)}"
        )
    observed_unique_forms = {row["Form"] for row in selected_forms}
    if len(observed_unique_forms) != expected_unique_forms:
        raise ValueError(
            "unique form count mismatch: "
            f"expected {expected_unique_forms}, found {len(observed_unique_forms)}"
        )

    matching = require_object(contract.get("matching"), "matching")
    near_similarity_minimum = matching.get("near_surface_similarity_minimum")
    if not isinstance(near_similarity_minimum, (int, float)) or not (
        0.0 <= float(near_similarity_minimum) <= 1.0
    ):
        raise ValueError("matching.near_surface_similarity_minimum must be 0..1")
    near_similarity_minimum = float(near_similarity_minimum)

    dictionary_checkpoint, dictionary_rows = verified_dictionary_rows(
        program_root, require_object(contract.get("dictionary"), "dictionary")
    )

    selected_forms.sort(key=lambda row: (row["Parameter_ID"], row["ID"], row["Form"]))
    forms_by_parameter: dict[str, list[dict[str, str]]] = defaultdict(list)
    for source_form in selected_forms:
        forms_by_parameter[source_form["Parameter_ID"]].append(source_form)

    concept_output: list[dict[str, Any]] = []
    form_output: list[dict[str, Any]] = []
    crosswalk_output: list[dict[str, Any]] = []
    review_output: list[dict[str, Any]] = []
    form_class_counts: Counter[str] = Counter()
    risk_flag_counts: Counter[str] = Counter()

    for parameter_id in sorted(forms_by_parameter):
        parameter = parameters[parameter_id]
        source_forms = forms_by_parameter[parameter_id]
        concept_id = stable_id(
            "lexibank-concept", cldf_language_id, parameter_id
        )
        concept_terms = {
            normalize_english(parameter["Name"]),
            normalize_english(parameter["Concepticon_Gloss"]),
        }
        concept_terms.discard("")
        concept_output.append(
            {
                "concept_id": concept_id,
                "parameter_id": parameter_id,
                "name_source": parameter["Name"],
                "concepticon_id": parameter["Concepticon_ID"] or None,
                "concepticon_gloss": parameter["Concepticon_Gloss"] or None,
                "normalized_english_review_terms": sorted(concept_terms),
                "source_form_ids": [row["ID"] for row in source_forms],
                "source_form_count": len(source_forms),
                "dictionary_acceptance": False,
                "grammar_acceptance": False,
                "synthetic_sentence_pair_eligible": False,
                "training_eligible": False,
            }
        )

        for source_form in source_forms:
            source_form_id = source_form["ID"]
            risk_analysis = source_risk_analysis(source_form)
            risk_flag_counts.update(risk_analysis["flags"])
            candidates: list[dict[str, Any]] = []
            for dictionary_row in dictionary_rows:
                english_relation = relation_for_dictionary_row(
                    concept_terms, dictionary_row
                )
                dictionary_surface = dictionary_row.get("surface_source")
                if not isinstance(dictionary_surface, str):
                    dictionary_surface = ""
                form_relation = surface_relation(
                    source_form["Form"],
                    dictionary_surface,
                    near_similarity_minimum=near_similarity_minimum,
                )
                if english_relation is None and form_relation is None:
                    continue
                machine_class, machine_priority = candidate_class(
                    english_relation, form_relation
                )
                candidate = {
                    "crosswalk_candidate_id": stable_id(
                        "lexibank-xwalk",
                        source_form_id,
                        str(dictionary_row["entry_candidate_id"]),
                        str(dictionary_row["sense_candidate_id"]),
                        str(dictionary_row["form_candidate_id"]),
                    ),
                    "source_form_id": source_form_id,
                    "concept_id": concept_id,
                    "parameter_id": parameter_id,
                    "source_form": source_form["Form"],
                    "source_value": source_form["Value"],
                    "machine_candidate_class": machine_class,
                    "machine_candidate_priority": machine_priority,
                    "english_relation": (
                        english_relation["relation"] if english_relation else None
                    ),
                    "english_relation_priority": (
                        english_relation["priority"] if english_relation else 0
                    ),
                    "english_evidence_field": (
                        english_relation["field"] if english_relation else None
                    ),
                    "english_evidence_value": (
                        english_relation["value"] if english_relation else None
                    ),
                    "english_evidence_scope": (
                        english_relation["scope"] if english_relation else None
                    ),
                    "surface_relation": (
                        form_relation["relation"] if form_relation else None
                    ),
                    "surface_relation_priority": (
                        form_relation["priority"] if form_relation else 0
                    ),
                    "surface_similarity_case_sensitive": (
                        form_relation["similarity_case_sensitive"]
                        if form_relation
                        else normalized_similarity(
                            source_form["Form"], dictionary_surface, casefold=False
                        )
                    ),
                    "surface_similarity_casefolded": (
                        form_relation["similarity_casefolded"]
                        if form_relation
                        else normalized_similarity(
                            source_form["Form"], dictionary_surface, casefold=True
                        )
                    ),
                    "dictionary_entry_candidate_id": dictionary_row[
                        "entry_candidate_id"
                    ],
                    "dictionary_entry_source_record_id": dictionary_row[
                        "entry_source_record_id"
                    ],
                    "dictionary_entry_source_record_ids": dictionary_row[
                        "entry_source_record_ids"
                    ],
                    "dictionary_sense_candidate_id": dictionary_row[
                        "sense_candidate_id"
                    ],
                    "dictionary_sense_source_record_id": dictionary_row[
                        "sense_source_record_id"
                    ],
                    "dictionary_form_candidate_id": dictionary_row[
                        "form_candidate_id"
                    ],
                    "dictionary_form_source_record_id": dictionary_row[
                        "form_source_record_id"
                    ],
                    "dictionary_source_id": dictionary_row["dictionary_source_id"],
                    "dictionary_surface_source": dictionary_surface,
                    "dictionary_translation_source": dictionary_row[
                        "translation_source"
                    ],
                    "dictionary_definition_source": dictionary_row[
                        "definition_source"
                    ],
                    "dictionary_raw_part_of_speech": dictionary_row[
                        "raw_part_of_speech"
                    ],
                    "dictionary_part_of_speech_status": dictionary_row[
                        "part_of_speech_status"
                    ],
                    "dictionary_substitutability_status": dictionary_row[
                        "substitutable_translation_status"
                    ],
                    "dictionary_existing_synthetic_eligibility": dictionary_row[
                        "synthetic_eligibility"
                    ],
                    "lexical_identity_status": "machine_review_candidate_not_accepted",
                    "sense_relation_status": "machine_review_candidate_not_accepted",
                    "dictionary_acceptance": False,
                    "benchmark_reference_eligible": False,
                    "synthetic_sentence_pair_eligible": False,
                    "training_eligible": False,
                }
                candidates.append(candidate)

            candidates.sort(key=crosswalk_sort_key)
            for rank, candidate in enumerate(candidates, start=1):
                candidate["review_rank_within_source_form"] = rank
                crosswalk_output.append(candidate)

            review_class = form_review_class(candidates)
            form_class_counts[review_class] += 1
            form_row = {
                "source_form_id": source_form_id,
                "concept_id": concept_id,
                "language_id": cldf_language_id,
                "source_id": source_id,
                "source_bibliography_key": source_form["Source"],
                "parameter_id": parameter_id,
                "parameter_name": parameter["Name"],
                "concepticon_id": parameter["Concepticon_ID"] or None,
                "concepticon_gloss": parameter["Concepticon_Gloss"] or None,
                "local_id_source": source_form.get("Local_ID") or None,
                "value_source": source_form["Value"],
                "form_source": source_form["Form"],
                "segments_source": source_form["Segments"],
                "segments_source_tokens": source_form["Segments"].split(),
                "comment_source": source_form.get("Comment") or None,
                "loan_source": source_form.get("Loan") or None,
                "graphemes_source": source_form.get("Graphemes") or None,
                "profile_source": source_form.get("Profile") or None,
                "risk_flags": risk_analysis["flags"],
                "control_characters": risk_analysis["control_characters"],
                "machine_crosswalk_class": review_class,
                "machine_crosswalk_candidate_count": len(candidates),
                "dictionary_acceptance": False,
                "grammar_acceptance": False,
                "benchmark_reference_eligible": False,
                "synthetic_sentence_pair_eligible": False,
                "training_eligible": False,
                "release_eligible_for_source_representation": True,
                "release_conditions": "CC_BY_4_0_attribution_and_source_notice",
            }
            form_output.append(form_row)
            review_output.append(
                {
                    "review_item_id": stable_id(
                        "lexibank-review", source_form_id, review_class
                    ),
                    "source_form_id": source_form_id,
                    "concept_id": concept_id,
                    "machine_crosswalk_class": review_class,
                    "risk_flags": risk_analysis["flags"],
                    "control_characters": risk_analysis["control_characters"],
                    "candidate_count": len(candidates),
                    "top_crosswalk_candidate_ids": [
                        row["crosswalk_candidate_id"] for row in candidates[:5]
                    ],
                    "required_review_dimensions": [
                        "source_form_shape",
                        "practical_orthography_identity",
                        "lexical_identity",
                        "sense_identity",
                        "part_of_speech",
                        "morphological_status",
                        "source_independence",
                        "synthetic_slot_compatibility",
                    ],
                    "review_status": "unreviewed_not_accepted",
                    "dictionary_acceptance": False,
                    "synthetic_sentence_pair_eligible": False,
                    "training_eligible": False,
                }
            )

    verification_rows: list[dict[str, Any]] = []
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

    counts = {
        "concepts": len(concept_output),
        "forms": len(form_output),
        "unique_forms": len({row["form_source"] for row in form_output}),
        "crosswalk_candidates": len(crosswalk_output),
        "review_queue_rows": len(review_output),
        "dictionary_rows_compared": len(dictionary_rows),
        "forms_with_control_characters": sum(
            bool(row["control_characters"]) for row in form_output
        ),
        "forms_with_risk_flags": sum(bool(row["risk_flags"]) for row in form_output),
        "accepted_dictionary_rows": 0,
        "accepted_grammar_rows": 0,
        "synthetic_coverage_cells_authorized": 0,
        "controlled_english_wajarri_sentence_pairs_authorized": 0,
        "training_eligible_rows": 0,
    }
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
        },
        "release": release_identity,
        "source_bibliography_keys": sorted(expected_source_keys),
        "dictionary_checkpoint": dictionary_checkpoint,
        "counts": counts,
        "machine_crosswalk_class_counts": dict(sorted(form_class_counts.items())),
        "risk_flag_counts": dict(sorted(risk_flag_counts.items())),
        "matching_policy": {
            "near_surface_similarity_minimum": near_similarity_minimum,
            "english_matching": "normalized_field_and_token_position_review_evidence",
            "surface_matching": "nfkc_case_and_alphanumeric_then_edit_similarity",
            "machine_match_is_linguistic_acceptance": False,
        },
        "findings": [
            "The release is an independently versioned CC BY 4.0 CLDF wordlist with Wajarri identified by ISO wbv and Glottocode waja1257.",
            "Every selected source row preserves Value, Form, Segments, Comment, Source, and Unicode control-character evidence.",
            "The dictionary comparison preserves one entry to many senses and never assumes sourceRecordId is a one-to-one join key.",
            "Exact or similar strings and English gloss relations create review candidates only.",
            "Stems, punctuated utterances, alternatives, and source normalization differences are explicit review risks.",
            "No source row or crosswalk candidate is accepted as a dictionary fact, grammatical rule, benchmark reference, controlled bilingual sentence pair, or training row.",
        ],
        "evidence_policy": {
            "source_representation": "preserve_exactly",
            "crosswalk": "dynamic_machine_review_candidates_only",
            "dictionary_acceptance": False,
            "grammar_acceptance": False,
            "synthetic_generation_opened": False,
            "required_synthetic_row_kind": "controlled_english_wajarri_sentence_clause_or_utterance_pair",
            "isolated_dictionary_mapping_counts_as_synthetic_sentence_pair": False,
            "training_opened": False,
        },
        "rights": {
            "release_representation": "CC_BY_4_0",
            "attribution_required": True,
            "underlying_source_relicensed_by_inference": False,
            "training_or_synthetic_task_eligibility": False,
            "reason": "Licensed source representation is preserved, but practical orthography, sense identity, morphology, and sentence-slot compatibility require review.",
        },
    }

    output_relative = require_string(contract.get("output_directory"), "output_directory")
    output = resolve_within(program_root, output_relative)
    if not write:
        return {
            "mode": "dry_run",
            "output": output_relative,
            "counts": counts,
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
        review_path = staging / "review-queue.jsonl"
        verification_path = staging / "source-artifact-verification.jsonl"
        report_path = staging / "REPORT.json"
        write_jsonl(concepts_path, concept_output)
        write_jsonl(forms_path, form_output)
        write_jsonl(crosswalk_path, crosswalk_output)
        write_jsonl(review_path, review_output)
        write_jsonl(verification_path, verification_rows)
        write_json(report_path, report)
        manifest = {
            "schema_version": 1,
            "inventory_id": inventory_id,
            "created_at_utc": created_at_utc,
            "source_id": source_id,
            "output_directory": output_relative,
            "components": {
                "concepts": output_component(concepts_path, len(concept_output)),
                "forms": output_component(forms_path, len(form_output)),
                "dictionary_crosswalk_candidates": output_component(
                    crosswalk_path, len(crosswalk_output)
                ),
                "review_queue": output_component(review_path, len(review_output)),
                "source_artifact_verification": output_component(
                    verification_path, len(verification_rows)
                ),
                "report": output_component(report_path, None),
            },
            "counts": counts,
            "dictionary_checkpoint": dictionary_checkpoint,
            "claim_limit": "This inventory preserves and audits a licensed CLDF lexical representation. It accepts no practical-Wajarri lexical mapping, grammatical rule, benchmark reference, controlled English-Wajarri sentence pair, training row, or translation claim.",
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
        "counts": counts,
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

#!/usr/bin/env python3
"""Explain the evidence gaps in reviewed Douglas example-token candidates.

The output is a deterministic review aid. It distinguishes source self-match,
speaker-attributed evidence, unresolved legacy evidence, surface divergence,
ambiguity, and mechanically visible complexity without accepting linguistic
relations or emitting synthetic Wajarri text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


FAMILY_DEFINITIONS = {
    "accepted_speaker_exact_candidate_needs_adjudication": {
        "trigger": "accepted_speaker_exact_candidate",
        "interpretation": (
            "A ranked source form is speaker-attributed and surface-exact, but "
            "sense, variety, and grammatical compatibility still require review."
        ),
        "future_pair_implication": (
            "Use only after the lexical sense and construction role are accepted; "
            "surface identity alone does not license a sentence pair."
        ),
    },
    "ambiguous_candidate_ranking": {
        "trigger": "top_candidate_rank_ambiguous",
        "interpretation": (
            "The two highest ranked current-dictionary candidates are separated by "
            "no more than the frozen ambiguity threshold."
        ),
        "future_pair_implication": (
            "Resolve sense and form choice before assigning the surface to a "
            "synthetic coverage cell."
        ),
    },
    "capitalization_or_name_status_unknown": {
        "trigger": "capitalized_source_surface_signal",
        "interpretation": (
            "The printed token begins with an uppercase letter. This is only an "
            "orthographic signal and does not prove proper-name status."
        ),
        "future_pair_implication": (
            "Determine name versus sentence-initial capitalization and keep names "
            "outside productive lexical substitution unless explicitly approved."
        ),
    },
    "historical_current_surface_divergence_candidate": {
        "trigger": "top_candidate_non_exact_projection",
        "interpretation": (
            "The best ranked current-dictionary candidate is not an exact normalized "
            "match to any mechanically observed source projection."
        ),
        "future_pair_implication": (
            "Adjudicate the historical-current correspondence and orthography before "
            "rendering current-orthography sentence pairs."
        ),
    },
    "historical_self_match_without_speaker_exact_confirmation": {
        "trigger": "historical_self_match_without_speaker_exact_confirmation",
        "interpretation": (
            "The top current-dictionary result is the same Douglas historical record, "
            "and no ranked accepted speaker-attributed exact candidate confirms it."
        ),
        "future_pair_implication": (
            "Treat this as source recall, not current-language confirmation; obtain or "
            "adjudicate independent current evidence before productive use."
        ),
    },
    "hyphenated_surface_needs_morphological_review": {
        "trigger": "hyphenated_source_surface",
        "interpretation": (
            "The source visibly contains one or more hyphen boundaries. Mechanical "
            "prefix projection is not a morpheme analysis."
        ),
        "future_pair_implication": (
            "Accept the stem, affix inventory, allomorphy, feature value, and attachment "
            "conditions before generating a morphological sentence family."
        ),
    },
    "source_gloss_alignment_missing": {
        "trigger": "positional_source_gloss_missing",
        "interpretation": (
            "No source-authored positional morpheme-gloss candidate is available for "
            "this occurrence."
        ),
        "future_pair_implication": (
            "Do not infer segmentation or grammatical features from the free "
            "translation alone."
        ),
    },
    "weak_surface_search_requires_manual_review": {
        "trigger": "top_candidate_weak_surface",
        "interpretation": (
            "The top ranked candidate falls below the frozen surface-search threshold."
        ),
        "future_pair_implication": (
            "Review source transcription, lexical coverage, name status, morphology, "
            "and orthography manually before any sentence commission."
        ),
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


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
        raise TypeError(f"expected JSON object: {path}")
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
            raise TypeError(f"expected object at {path}:{line_number}")
        rows.append(value)
    return rows


def resolve_within(root: Path, raw_path: str, label: str) -> Path:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        raise ValueError(f"{label} must be relative to program root")
    path = (root / candidate).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes program root: {raw_path}") from error
    return path


def require_hash(root: Path, spec: dict[str, Any], label: str) -> Path:
    raw_path = spec.get("path")
    expected = spec.get("sha256")
    if not isinstance(raw_path, str) or not raw_path:
        raise ValueError(f"{label}.path must be a nonempty string")
    if not isinstance(expected, str) or len(expected) != 64:
        raise ValueError(f"{label}.sha256 must be a SHA-256 digest")
    path = resolve_within(root, raw_path, label)
    if not path.is_file():
        raise FileNotFoundError(path)
    actual = sha256_file(path)
    if actual != expected:
        raise ValueError(f"{label} hash mismatch: expected {expected}, found {actual}")
    return path


def normalize_surface(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())


def capitalization_signal(value: str) -> bool:
    for character in value:
        if character.isalpha():
            return character.isupper()
    return False


def surface_edit_operations(source: str, target: str) -> list[dict[str, str]]:
    source_normalized = normalize_surface(source)
    target_normalized = normalize_surface(target)
    operations: list[dict[str, str]] = []
    matcher = SequenceMatcher(None, source_normalized, target_normalized)
    for operation, left_start, left_end, right_start, right_end in matcher.get_opcodes():
        if operation == "equal":
            continue
        operations.append(
            {
                "operation": operation,
                "source": source_normalized[left_start:left_end],
                "candidate": target_normalized[right_start:right_end],
            }
        )
    return operations


def edit_signature(operations: list[dict[str, str]]) -> str | None:
    if not operations:
        return None
    return ";".join(
        f"{row['operation']}:{row['source']}->{row['candidate']}"
        for row in operations
    )


def source_class(
    form: dict[str, Any], source: dict[str, Any] | None
) -> str:
    source_type = str((source or {}).get("source_type", "")).casefold()
    if form.get("status") == "accepted" and "speaker_attributed" in source_type:
        return "accepted_speaker_attributed_source"
    if (
        form.get("recordKind") == "historical_published_form_candidate"
        or form.get("formType")
        == "historical_published_headword_or_variant_set"
    ):
        return "historical_dictionary_candidate"
    return "unadjudicated_legacy_source"


def enrich_candidate(
    candidate: dict[str, Any],
    forms: dict[str, dict[str, Any]],
    entries: dict[str, dict[str, Any]],
    sources: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    form_id = candidate["form_candidate_id"]
    entry_id = candidate["entry_candidate_id"]
    if form_id not in forms:
        raise ValueError(f"candidate form missing from frozen forms: {form_id}")
    if entry_id not in entries:
        raise ValueError(f"candidate entry missing from frozen entries: {entry_id}")
    form = forms[form_id]
    entry = entries[entry_id]
    source_id = entry.get("sourceId")
    source = sources.get(source_id) if isinstance(source_id, str) else None
    return {
        "rank": candidate["rank"],
        "entry_candidate_id": entry_id,
        "form_candidate_id": form_id,
        "source_record_id": form.get("sourceRecordId"),
        "source_id": source_id,
        "source_type": (source or {}).get("source_type"),
        "source_class": source_class(form, source),
        "form_status": form.get("status"),
        "form_type": form.get("formType"),
        "orthography": form.get("orthography"),
        "current_surface": candidate["current_surface"],
        "surface_score": candidate["surface_score"],
        "combined_review_score": candidate["combined_review_score"],
        "relation_status": "unadjudicated_candidate",
        "automatic_acceptance_allowed": False,
    }


def review_occurrence(
    row: dict[str, Any],
    forms: dict[str, dict[str, Any]],
    entries: dict[str, dict[str, Any]],
    sources: dict[str, dict[str, Any]],
    weak_threshold: float,
    near_threshold: float,
) -> dict[str, Any]:
    ranked = [
        enrich_candidate(candidate, forms, entries, sources)
        for candidate in row["current_dictionary_candidates"]
    ]
    if not ranked or not row["historical_lexicon_candidates"]:
        raise ValueError(f"candidate lists are empty: {row['token_occurrence_id']}")
    top = ranked[0]
    historical_top = row["historical_lexicon_candidates"][0]
    historical_record_id = historical_top["historical_source_record_id"]
    top_score = float(top["surface_score"]["score"])
    top_exact = bool(top["surface_score"]["normalized_exact_projection"])
    top_projection = top["surface_score"]["projection_surface"]
    same_historical_record = top["source_record_id"] == historical_record_id
    accepted_speaker_exact = [
        candidate
        for candidate in ranked
        if candidate["source_class"] == "accepted_speaker_attributed_source"
        and candidate["surface_score"]["normalized_exact_projection"]
    ]
    accepted_speaker_near = [
        candidate
        for candidate in ranked
        if candidate["source_class"] == "accepted_speaker_attributed_source"
        and candidate["surface_score"]["score"] >= near_threshold
        and not candidate["surface_score"]["normalized_exact_projection"]
    ]
    legacy_exact = [
        candidate
        for candidate in ranked
        if candidate["source_class"] == "unadjudicated_legacy_source"
        and candidate["surface_score"]["normalized_exact_projection"]
    ]

    flags: set[str] = set()
    if "-" in row["historical_surface"]:
        flags.add("hyphenated_source_surface")
    if capitalization_signal(row["historical_surface"]):
        flags.add("capitalized_source_surface_signal")
    if row.get("positional_source_gloss") is None:
        flags.add("positional_source_gloss_missing")
    else:
        flags.add("positional_source_gloss_available")
    if row["diagnostics"]["current_top_candidate_ambiguous"]:
        flags.add("top_candidate_rank_ambiguous")
    if same_historical_record:
        flags.add("top_candidate_is_same_historical_record")
    if top["source_class"] == "historical_dictionary_candidate":
        flags.add("top_candidate_from_historical_collection")
    elif top["source_class"] == "accepted_speaker_attributed_source":
        flags.add("top_candidate_from_accepted_speaker_source")
    else:
        flags.add("top_candidate_from_unadjudicated_legacy_source")
    if not top_exact:
        flags.add("top_candidate_non_exact_projection")
    if top_score < weak_threshold:
        flags.add("top_candidate_weak_surface")
    if accepted_speaker_exact:
        flags.add("accepted_speaker_exact_candidate")
    else:
        flags.add("no_accepted_speaker_exact_candidate_in_ranked_set")
    if same_historical_record and not accepted_speaker_exact:
        flags.add("historical_self_match_without_speaker_exact_confirmation")
    if legacy_exact:
        flags.add("unadjudicated_legacy_exact_candidate")

    if top_score < weak_threshold:
        evidence_state = "surface_search_unresolved"
    elif accepted_speaker_exact:
        evidence_state = (
            "speaker_attested_exact_candidate_needs_sense_and_variety_adjudication"
        )
    elif legacy_exact:
        evidence_state = "legacy_exact_candidate_needs_source_and_sense_adjudication"
    elif same_historical_record and top_exact:
        evidence_state = (
            "historical_self_match_needs_independent_current_confirmation"
        )
    elif accepted_speaker_near:
        evidence_state = (
            "speaker_attested_near_candidate_needs_correspondence_adjudication"
        )
    elif not top_exact:
        evidence_state = "historical_current_correspondence_candidate_needs_review"
    else:
        evidence_state = "historical_surface_needs_current_correspondence_evidence"

    if top_score < weak_threshold:
        review_priority = "highest"
    elif (
        not top_exact
        or row["diagnostics"]["current_top_candidate_ambiguous"]
        or capitalization_signal(row["historical_surface"])
    ):
        review_priority = "high"
    elif same_historical_record and not accepted_speaker_exact:
        review_priority = "medium"
    else:
        review_priority = "lower"

    operations = surface_edit_operations(top_projection, top["current_surface"])
    return {
        "schema_version": 1,
        "token_occurrence_id": row["token_occurrence_id"],
        "review_id": row["review_id"],
        "example_number": row["example_number"],
        "token_index": row["token_index"],
        "historical_surface": row["historical_surface"],
        "normalized_historical_surface": normalize_surface(
            row["historical_surface"]
        ),
        "positional_source_gloss": row.get("positional_source_gloss"),
        "source_gloss_alignment_status": row["source_gloss_alignment_status"],
        "source_free_translation": row["source_free_translation"],
        "phenomenon_tags": row["phenomenon_tags"],
        "source": row["source"],
        "historical_top_candidate": {
            "historical_source_record_id": historical_record_id,
            "historical_headword": historical_top["historical_headword"],
            "historical_gloss": historical_top["historical_gloss"],
            "raw_part_of_speech": historical_top["raw_part_of_speech"],
            "surface_score": historical_top["surface_score"],
            "relation_status": "unadjudicated_candidate",
        },
        "ranked_current_candidates": ranked,
        "top_candidate_summary": {
            "current_surface": top["current_surface"],
            "source_class": top["source_class"],
            "source_record_id": top["source_record_id"],
            "same_as_top_historical_record": same_historical_record,
            "normalized_exact_projection": top_exact,
            "projection_surface": top_projection,
            "surface_score": top_score,
            "surface_band": row["diagnostics"]["current_top_surface_band"],
            "rank_ambiguous": row["diagnostics"][
                "current_top_candidate_ambiguous"
            ],
            "surface_edit_operations": operations,
            "surface_edit_signature": edit_signature(operations),
            "surface_edit_interpretation": (
                "mechanical_candidate_difference_not_an_orthographic_or_"
                "morphological_rule"
                if operations
                else "no_mechanical_difference_in_selected_projection"
            ),
        },
        "ranked_evidence_summary": {
            "accepted_speaker_exact_candidate_count": len(
                accepted_speaker_exact
            ),
            "accepted_speaker_near_candidate_count": len(accepted_speaker_near),
            "unadjudicated_legacy_exact_candidate_count": len(legacy_exact),
        },
        "diagnostic_flags": sorted(flags),
        "evidence_state": evidence_state,
        "review_priority": review_priority,
        "historical_current_correspondence_accepted": False,
        "productive_rule_accepted": False,
        "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
        "synthetic_eligibility": "not_authorized",
        "training_eligibility": "not_allowed",
    }


def aggregate_surfaces(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["normalized_historical_surface"]].append(row)
    output: list[dict[str, Any]] = []
    for normalized, members in sorted(grouped.items()):
        output.append(
            {
                "schema_version": 1,
                "surface_id": f"wbv-douglas-surface-{hashlib.sha256(normalized.encode()).hexdigest()[:16]}",
                "normalized_historical_surface": normalized,
                "historical_surface_variants": sorted(
                    {row["historical_surface"] for row in members}
                ),
                "occurrence_count": len(members),
                "token_occurrence_ids": sorted(
                    row["token_occurrence_id"] for row in members
                ),
                "example_numbers": sorted({row["example_number"] for row in members}),
                "positional_source_glosses": sorted(
                    {
                        row["positional_source_gloss"]
                        for row in members
                        if row["positional_source_gloss"] is not None
                    }
                ),
                "phenomenon_tags": sorted(
                    {
                        tag
                        for row in members
                        for tag in row["phenomenon_tags"]
                    }
                ),
                "evidence_states": sorted(
                    {row["evidence_state"] for row in members}
                ),
                "review_priorities": sorted(
                    {row["review_priority"] for row in members}
                ),
                "diagnostic_flags": sorted(
                    {
                        flag
                        for row in members
                        for flag in row["diagnostic_flags"]
                    }
                ),
                "top_candidate_surfaces": sorted(
                    {
                        row["top_candidate_summary"]["current_surface"]
                        for row in members
                    }
                ),
                "top_candidate_source_classes": sorted(
                    {
                        row["top_candidate_summary"]["source_class"]
                        for row in members
                    }
                ),
                "surface_edit_signatures": sorted(
                    {
                        row["top_candidate_summary"]["surface_edit_signature"]
                        for row in members
                        if row["top_candidate_summary"]["surface_edit_signature"]
                        is not None
                    }
                ),
                "historical_current_correspondence_accepted": False,
                "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
                "synthetic_eligibility": "not_authorized",
            }
        )
    return output


def build_evidence_gap_families(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    families: list[dict[str, Any]] = []
    for family_id, definition in sorted(FAMILY_DEFINITIONS.items()):
        trigger = definition["trigger"]
        members = [row for row in rows if trigger in row["diagnostic_flags"]]
        families.append(
            {
                "schema_version": 1,
                "family_id": family_id,
                "trigger": trigger,
                "interpretation": definition["interpretation"],
                "future_pair_implication": definition["future_pair_implication"],
                "occurrence_count": len(members),
                "distinct_surface_count": len(
                    {row["normalized_historical_surface"] for row in members}
                ),
                "example_numbers": sorted(
                    {row["example_number"] for row in members}
                ),
                "sample_occurrence_ids": sorted(
                    row["token_occurrence_id"] for row in members
                )[:12],
                "automatic_acceptance_allowed": False,
                "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
                "training_eligibility": "not_allowed",
            }
        )
    return families


def build_sentence_pair_preconditions(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_tag: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        for tag in row["phenomenon_tags"]:
            by_tag[tag].append(row)
    output: list[dict[str, Any]] = []
    for tag, members in sorted(by_tag.items()):
        flags = {
            flag for row in members for flag in row["diagnostic_flags"]
        }
        required_evidence = [
            "accepted current-Wajarri productive construction with source anchors",
            "accepted source-scoped lexical senses and construction roles",
            "explicit coverage-cell allocation after the frozen model census",
            "independent split assignment and separate training authorization",
        ]
        if "hyphenated_source_surface" in flags:
            required_evidence.append(
                "reviewed segmentation, grammatical features, allomorphy, and attachment conditions"
            )
        if "top_candidate_non_exact_projection" in flags:
            required_evidence.append(
                "adjudicated historical-current form and orthography correspondences"
            )
        if "top_candidate_rank_ambiguous" in flags:
            required_evidence.append(
                "resolved lexical sense, part-of-speech, and form ambiguity"
            )
        if "capitalized_source_surface_signal" in flags:
            required_evidence.append(
                "reviewed proper-name versus sentence-initial capitalization status"
            )
        output.append(
            {
                "schema_version": 1,
                "requirement_id": f"wbv-sentence-precondition-{hashlib.sha256(tag.encode()).hexdigest()[:16]}",
                "phenomenon_tag": tag,
                "source_attested_example_numbers": sorted(
                    {row["example_number"] for row in members}
                ),
                "token_occurrence_count": len(members),
                "distinct_surface_count": len(
                    {row["normalized_historical_surface"] for row in members}
                ),
                "evidence_states": sorted(
                    {row["evidence_state"] for row in members}
                ),
                "required_evidence_before_pair_issuance": required_evidence,
                "future_pair_contract": {
                    "required_unit": (
                        "controlled bilingual English-Wajarri sentence, clause, or "
                        "whole utterance pair"
                    ),
                    "isolated_dictionary_mapping_counts_as_pair": False,
                    "target_only_string_counts_as_pair": False,
                    "historical_source_example_counts_as_new_synthetic_pair": False,
                    "candidate_preview_counts_as_pair": False,
                },
                "current_status": "blocked_pending_linguistic_and_model_census_inputs",
                "coverage_cells_issued": 0,
                "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
                "training_eligible_rows": 0,
            }
        )
    return output


def validate_zero_invariants(
    occurrence_rows: list[dict[str, Any]],
    surface_rows: list[dict[str, Any]],
    family_rows: list[dict[str, Any]],
    precondition_rows: list[dict[str, Any]],
) -> None:
    if any(
        row["controlled_bilingual_english_wajarri_sentence_pairs_added"] != 0
        for row in occurrence_rows + surface_rows + family_rows + precondition_rows
    ):
        raise ValueError("review must not issue controlled sentence pairs")
    if any(
        row.get("training_eligibility") not in {None, "not_allowed"}
        for row in occurrence_rows + family_rows
    ):
        raise ValueError("review must not authorize training")


def build_inventory(
    *, program_root: Path, contract_path: Path, build_root: Path
) -> dict[str, Any]:
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("contract schema_version must be 1")
    inputs = contract["inputs"]
    require_hash(program_root, inputs["candidate_manifest"], "candidate_manifest")
    candidate_path = require_hash(
        program_root, inputs["candidate_rows"], "candidate_rows"
    )
    forms_path = require_hash(program_root, inputs["current_forms"], "current_forms")
    entries_path = require_hash(
        program_root, inputs["current_entries"], "current_entries"
    )
    source_ledger_path = require_hash(
        program_root, inputs["source_ledger"], "source_ledger"
    )
    candidates = load_jsonl(candidate_path)
    forms_list = load_jsonl(forms_path)
    entries_list = load_jsonl(entries_path)
    source_rows = load_jsonl(source_ledger_path)
    expected = contract["expected_counts"]
    for label, actual in (
        ("candidate_rows", len(candidates)),
        ("current_forms", len(forms_list)),
        ("current_entries", len(entries_list)),
        ("source_ledger_rows", len(source_rows)),
    ):
        if actual != expected[label]:
            raise ValueError(f"{label} count changed: {actual}")
    forms = {row["formCandidateId"]: row for row in forms_list}
    entries = {row["entryCandidateId"]: row for row in entries_list}
    sources = {row["source_id"]: row for row in source_rows}
    if len(forms) != len(forms_list) or len(entries) != len(entries_list):
        raise ValueError("duplicate form or entry identifiers")

    thresholds = contract["thresholds"]
    occurrence_rows = [
        review_occurrence(
            row,
            forms,
            entries,
            sources,
            float(thresholds["weak_surface_score_below"]),
            float(thresholds["near_surface_score_at_least"]),
        )
        for row in candidates
    ]
    surface_rows = aggregate_surfaces(occurrence_rows)
    if len(surface_rows) != expected["distinct_normalized_surfaces"]:
        raise ValueError(f"distinct surface count changed: {len(surface_rows)}")
    family_rows = build_evidence_gap_families(occurrence_rows)
    precondition_rows = build_sentence_pair_preconditions(occurrence_rows)
    validate_zero_invariants(
        occurrence_rows, surface_rows, family_rows, precondition_rows
    )

    provenance_counts = Counter(
        row["top_candidate_summary"]["source_class"] for row in occurrence_rows
    )
    state_counts = Counter(row["evidence_state"] for row in occurrence_rows)
    priority_counts = Counter(row["review_priority"] for row in occurrence_rows)
    edit_counts = Counter(
        row["top_candidate_summary"]["surface_edit_signature"]
        for row in occurrence_rows
        if row["top_candidate_summary"]["surface_edit_signature"] is not None
    )
    report = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "status": "qualitative_historical_current_evidence_gap_review",
        "counts": {
            "token_occurrences": len(occurrence_rows),
            "distinct_normalized_surfaces": len(surface_rows),
            "evidence_gap_families": len(family_rows),
            "phenomenon_preconditions": len(precondition_rows),
            "top_candidate_same_historical_record": sum(
                row["top_candidate_summary"]["same_as_top_historical_record"]
                for row in occurrence_rows
            ),
            "top_candidate_non_exact_projection": sum(
                not row["top_candidate_summary"]["normalized_exact_projection"]
                for row in occurrence_rows
            ),
            "top_candidate_rank_ambiguous": sum(
                row["top_candidate_summary"]["rank_ambiguous"]
                for row in occurrence_rows
            ),
            "accepted_speaker_exact_candidate_occurrences": sum(
                row["ranked_evidence_summary"][
                    "accepted_speaker_exact_candidate_count"
                ]
                > 0
                for row in occurrence_rows
            ),
            "unadjudicated_legacy_exact_candidate_occurrences": sum(
                row["ranked_evidence_summary"][
                    "unadjudicated_legacy_exact_candidate_count"
                ]
                > 0
                for row in occurrence_rows
            ),
            "hyphenated_source_occurrences": sum(
                "hyphenated_source_surface" in row["diagnostic_flags"]
                for row in occurrence_rows
            ),
            "capitalized_source_signal_occurrences": sum(
                "capitalized_source_surface_signal" in row["diagnostic_flags"]
                for row in occurrence_rows
            ),
            "positional_source_gloss_available_occurrences": sum(
                row["positional_source_gloss"] is not None
                for row in occurrence_rows
            ),
            "current_correspondences_accepted": 0,
            "productive_grammar_rules_accepted": 0,
            "coverage_cells_issued": 0,
            "controlled_bilingual_english_wajarri_sentence_pairs": 0,
            "isolated_dictionary_rows_counted_as_sentence_pairs": 0,
            "benchmark_rows": 0,
            "training_eligible_rows": 0,
        },
        "top_candidate_provenance_counts": dict(sorted(provenance_counts.items())),
        "evidence_state_counts": dict(sorted(state_counts.items())),
        "review_priority_counts": dict(sorted(priority_counts.items())),
        "recurrent_mechanical_edit_signatures": [
            {"signature": signature, "occurrences": count}
            for signature, count in sorted(
                edit_counts.items(), key=lambda item: (-item[1], item[0])
            )
            if count >= 2
        ],
        "interpretation": {
            "exactness": (
                "An exact dictionary projection may be a Douglas source self-match; "
                "it is not automatically independent current-language evidence."
            ),
            "mechanical_edits": (
                "Edit signatures describe ranked strings only and are not sound "
                "changes, orthographic rules, morphemes, or accepted correspondences."
            ),
            "sentence_pairs": (
                "The next corpus unit remains a controlled bilingual English-Wajarri "
                "sentence, clause, or whole-utterance pair. Isolated mappings, source "
                "examples, and previews count as zero new synthetic pairs."
            ),
            "model_failures": (
                "This source-evidence review does not contain model predictions and "
                "therefore does not claim that any token is a model failure."
            ),
        },
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    payloads = {
        "token-qualitative-diagnostics.jsonl": jsonl_bytes(occurrence_rows),
        "surface-diagnostics.jsonl": jsonl_bytes(surface_rows),
        "evidence-gap-families.jsonl": jsonl_bytes(family_rows),
        "sentence-pair-preconditions.jsonl": jsonl_bytes(precondition_rows),
        "REPORT.json": json_bytes(report),
    }
    for name, payload in payloads.items():
        path = build_root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)

    component_names = {
        "token_qualitative_diagnostics": "token-qualitative-diagnostics.jsonl",
        "surface_diagnostics": "surface-diagnostics.jsonl",
        "evidence_gap_families": "evidence-gap-families.jsonl",
        "sentence_pair_preconditions": "sentence-pair-preconditions.jsonl",
    }
    row_counts = {
        "token_qualitative_diagnostics": len(occurrence_rows),
        "surface_diagnostics": len(surface_rows),
        "evidence_gap_families": len(family_rows),
        "sentence_pair_preconditions": len(precondition_rows),
    }
    components = {
        key: {
            "path": name,
            "sha256": sha256_file(build_root / name),
            "rows": row_counts[key],
        }
        for key, name in component_names.items()
    }
    components["report"] = {
        "path": "REPORT.json",
        "sha256": sha256_file(build_root / "REPORT.json"),
    }
    manifest = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": report["status"],
        "immutable": True,
        "contract": {
            "path": contract_path.relative_to(program_root).as_posix(),
            "sha256": sha256_file(contract_path),
        },
        "inputs": inputs,
        "components": components,
        "current_correspondences_accepted": 0,
        "productive_grammar_rules_accepted": 0,
        "coverage_cells_issued": 0,
        "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
        "isolated_dictionary_rows_counted_as_sentence_pairs": 0,
        "benchmark_rows": 0,
        "training_eligible_rows": 0,
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    (build_root / "MANIFEST.json").write_bytes(json_bytes(manifest))
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
    contract_path = resolve_within(program_root, str(args.contract), "contract")
    output_dir = resolve_within(program_root, str(args.output_dir), "output_dir")
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
                "token_occurrences": manifest["components"][
                    "token_qualitative_diagnostics"
                ]["rows"],
                "distinct_surfaces": manifest["components"][
                    "surface_diagnostics"
                ]["rows"],
                "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
                "training_eligible_rows": 0,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Analyze full-lexicon reconstruction errors without treating them as linguistic judgments."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import statistics
import tempfile
import unicodedata
from typing import Any, Iterable


TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", re.UNICODE)
SURFACE_PART_RE = re.compile(r"[^\W\d_]+", re.UNICODE)
ERROR_ORDER = (
    "exact_selected",
    "exact_alternative_reference",
    "selected_reference_not_accepted",
    "empty",
    "source_copy",
    "accepted_with_extra_material",
    "known_target_for_other_prompt",
    "notation_or_hyphen_mismatch",
    "near_orthographic",
    "other",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--control-label", default="C0")
    parser.add_argument("--tokenizer-dir", type=Path)
    parser.add_argument("--synthetic-file", type=Path)
    parser.add_argument(
        "--row-metadata",
        type=Path,
        help="Optional JSONL metadata joined by lexical_pair_id or id (for example, a provenance crosswalk).",
    )
    parser.add_argument("--near-cer-threshold", type=float, default=0.34)
    parser.add_argument("--sample-per-cohort", type=int, default=12)
    parser.add_argument("--seed", default="v24-full-lexicon-errors-2026-07-15")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--review-sample-output", type=Path, required=True)
    parser.add_argument("--row-analysis-output", type=Path, required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).casefold().split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_labeled_paths(values: list[str]) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for value in values:
        label, separator, raw_path = value.partition("=")
        label = label.strip()
        path = Path(raw_path).expanduser().resolve()
        if not separator or not label or not raw_path.strip():
            raise ValueError(f"invalid candidate {value!r}; expected LABEL=PATH")
        if label in paths:
            raise ValueError(f"duplicate candidate label: {label}")
        if not path.is_file():
            raise FileNotFoundError(path)
        paths[label] = path
    return paths


def load_predictions(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("predictions")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"missing predictions: {path}")
    return rows


def load_row_metadata(path: Path | None) -> dict[str, dict[str, Any]]:
    if path is None:
        return {}
    result: dict[str, dict[str, Any]] = {}
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            row_id = str(row.get("lexical_pair_id") or row.get("id") or "")
            if not row_id:
                raise ValueError(f"metadata row lacks lexical_pair_id or id: {path}:{line_number}")
            if row_id in result:
                raise ValueError(f"duplicate metadata row ID {row_id}: {path}:{line_number}")
            result[row_id] = row
    return result


def attach_row_metadata(
    rows_by_label: dict[str, list[dict[str, Any]]], metadata: dict[str, dict[str, Any]]
) -> dict[str, int]:
    if not metadata:
        return {"metadata_rows": 0, "matched_prediction_rows": 0, "unmatched_prediction_rows": 0}
    first_rows = next(iter(rows_by_label.values()))
    prediction_ids = {str(row.get("id") or "") for row in first_rows}
    missing = sorted(prediction_ids - set(metadata))
    extra = sorted(set(metadata) - prediction_ids)
    if missing or extra:
        raise ValueError(
            f"metadata/prediction IDs differ: missing_metadata={len(missing)}, extra_metadata={len(extra)}"
        )
    for rows in rows_by_label.values():
        for row in rows:
            row["analysis_metadata"] = metadata[str(row.get("id") or "")]
    return {
        "metadata_rows": len(metadata),
        "matched_prediction_rows": len(prediction_ids),
        "unmatched_prediction_rows": 0,
    }


def row_identity(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        str(row.get("id") or ""),
        normalize(row.get("input_text")),
        normalize(row.get("output_text") or row.get("reference")),
        tuple(normalize(value) for value in row.get("accepted_references") or []),
    )


def levenshtein(left: Any, right: Any) -> int:
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
                    previous[right_index - 1] + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1]


def character_error_rate(prediction: str, reference: str) -> float:
    return levenshtein(prediction, reference) / max(1, len(reference))


def grapheme_clusters(value: str) -> tuple[str, ...]:
    try:
        import regex
    except ModuleNotFoundError:
        return tuple(value)
    return tuple(regex.findall(r"\X", value))


def grapheme_error_rate(prediction: str, reference: str) -> float:
    prediction_clusters = grapheme_clusters(prediction)
    reference_clusters = grapheme_clusters(reference)
    return levenshtein(prediction_clusters, reference_clusters) / max(1, len(reference_clusters))


def notation_skeleton(value: str) -> str:
    return "".join(character for character in normalize(value) if character.isalnum())


def contains_complete_sequence(prediction: str, reference: str) -> bool:
    prediction_parts = SURFACE_PART_RE.findall(prediction)
    reference_parts = SURFACE_PART_RE.findall(reference)
    if not reference_parts or len(reference_parts) >= len(prediction_parts):
        return False
    width = len(reference_parts)
    return any(prediction_parts[index : index + width] == reference_parts for index in range(len(prediction_parts) - width + 1))


def lineage_occurrences(row: dict[str, Any]) -> int | None:
    lexicon = row.get("lexicon") or {}
    probe = row.get("v24_probe") or {}
    exposure = lexicon.get("documented_lineage_exposure") or probe.get("documented_lineage_exposure") or {}
    v21_2 = exposure.get("v21.2") or {}
    if "target_surface_occurrences" not in v21_2:
        return None
    return int(v21_2["target_surface_occurrences"] or 0)


def accepted_references(row: dict[str, Any]) -> list[str]:
    references = [normalize(value) for value in row.get("accepted_references") or []]
    if not references:
        reference = normalize(row.get("reference") or row.get("output_text"))
        references = [reference] if reference else []
    if not references:
        raise ValueError(f"row lacks accepted references: {row.get('id')}")
    return list(dict.fromkeys(references))


def closest_reference(prediction: str, references: list[str]) -> tuple[str, float, float]:
    scored = [
        (
            reference,
            grapheme_error_rate(prediction, reference),
            character_error_rate(prediction, reference),
        )
        for reference in references
    ]
    return min(scored, key=lambda item: (item[1], item[2], item[0]))


def classify_row(
    row: dict[str, Any], known_target_rows: dict[str, set[str]], near_cer_threshold: float
) -> dict[str, Any]:
    prediction = normalize(row.get("prediction"))
    references = accepted_references(row)
    selected_reference = normalize(row.get("output_text") or row.get("reference"))
    source = normalize(row.get("unconditioned_input_text") or row.get("input_text"))
    closest, minimum_grapheme_cer, minimum_codepoint_cer = closest_reference(prediction, references)
    selected_reference_is_accepted = selected_reference in references

    if prediction == selected_reference and selected_reference_is_accepted:
        category = "exact_selected"
    elif prediction in references:
        category = "exact_alternative_reference"
    elif prediction == selected_reference:
        category = "selected_reference_not_accepted"
    elif not prediction:
        category = "empty"
    elif prediction == source:
        category = "source_copy"
    elif any(contains_complete_sequence(prediction, reference) for reference in references):
        category = "accepted_with_extra_material"
    elif prediction in known_target_rows and str(row.get("id")) not in known_target_rows[prediction]:
        category = "known_target_for_other_prompt"
    elif any(notation_skeleton(prediction) == notation_skeleton(reference) for reference in references):
        category = "notation_or_hyphen_mismatch"
    elif minimum_grapheme_cer <= near_cer_threshold:
        category = "near_orthographic"
    else:
        category = "other"
    return {
        "category": category,
        "exact": category in {"exact_selected", "exact_alternative_reference"},
        "exact_accepted": category in {"exact_selected", "exact_alternative_reference"},
        "exact_selected": category == "exact_selected",
        "selected_reference_is_accepted": selected_reference_is_accepted,
        "prediction": prediction,
        "selected_reference": selected_reference,
        "closest_reference": closest,
        "minimum_grapheme_error_rate": minimum_grapheme_cer,
        "minimum_codepoint_error_rate": minimum_codepoint_cer,
        "minimum_character_error_rate": minimum_codepoint_cer,
    }


def count_bucket(value: int, boundaries: tuple[int, ...]) -> str:
    lower = 0
    for boundary in boundaries:
        if value <= boundary:
            return f"{lower}-{boundary}"
        lower = boundary + 1
    return f"{lower}+"


def has_reduplication(value: str) -> bool:
    for token in normalize(value).split():
        parts = [part for part in token.split("-") if part]
        if any(left == right for left, right in zip(parts, parts[1:])):
            return True
    return False


def target_shapes(references: list[str]) -> list[str]:
    joined = " ".join(references)
    shapes = ["plain"]
    if " " in joined:
        shapes.append("multiword")
    if "-" in joined:
        shapes.append("hyphenated")
    if "'" in joined:
        shapes.append("apostrophized")
    if ":" in joined:
        shapes.append("notation_colon")
    if any(has_reduplication(reference) for reference in references):
        shapes.append("reduplicated")
    return shapes


def analysis_metadata(row: dict[str, Any]) -> dict[str, Any]:
    value = row.get("analysis_metadata")
    return value if isinstance(value, dict) else {}


def curated_entry_records(row: dict[str, Any]) -> list[dict[str, Any]]:
    records = (row.get("curated_dictionary") or {}).get("entry_records") or []
    if records:
        return [record for record in records if isinstance(record, dict)]
    matches = analysis_metadata(row).get("curated_dictionary_matches") or []
    return [record for record in matches if isinstance(record, dict)]


def parts_of_speech(row: dict[str, Any]) -> list[str]:
    metadata = analysis_metadata(row)
    values = (
        (row.get("lexicon") or {}).get("parts_of_speech")
        or row.get("parts_of_speech")
        or [record.get("type") for record in curated_entry_records(row) if record.get("type")]
        or metadata.get("grammar_extraction_parts_of_speech")
        or ["unknown"]
    )
    return list(dict.fromkeys(normalize(value).removeprefix("lexinfo:") or "unknown" for value in values))


def semantic_domains(row: dict[str, Any]) -> list[str]:
    values = [record.get("semantic_domain") for record in curated_entry_records(row)]
    normalized = [normalize(value) for value in values if normalize(value)]
    return list(dict.fromkeys(normalized)) or ["unknown"]


def dictionary_sources(row: dict[str, Any]) -> list[str]:
    values = [record.get("source") for record in curated_entry_records(row)]
    normalized = [normalize(value) for value in values if normalize(value)]
    return list(dict.fromkeys(normalized)) or ["unknown"]


def provenance_status(row: dict[str, Any]) -> str:
    metadata = analysis_metadata(row)
    if metadata.get("crosswalk_status"):
        return normalize(metadata["crosswalk_status"])
    if row.get("curated_dictionary"):
        return "curated_dictionary_census"
    return "not_joined"


def stratum_values(
    row: dict[str, Any],
    token_counts: dict[str, dict[str, int]],
    synthetic_explicit_target_counts: Counter[str],
    synthetic_surface_counts: Counter[str],
) -> dict[str, list[str]]:
    row_id = str(row.get("id"))
    references = accepted_references(row)
    occurrences = lineage_occurrences(row)
    source_words = len(TOKEN_RE.findall(str(row.get("unconditioned_input_text") or row.get("input_text") or "")))
    target_words = max(len(TOKEN_RE.findall(reference)) for reference in references)
    identity_mapping = bool(
        (row.get("lexicon") or {}).get("identity_mapping")
        or row.get("identity_translation")
        or (row.get("curated_dictionary") or {}).get("identity_translation")
    )
    ambiguity = bool(
        (row.get("curated_dictionary") or {}).get("ambiguous_surface_prompt")
        or len(references) > 1
    )
    result = {
        "documented_v21_2_target_occurrences": [
            "unknown" if occurrences is None else count_bucket(occurrences, (0, 1, 4, 19))
        ],
        "synthetic_explicit_target_occurrences": [
            count_bucket(
                int(synthetic_explicit_target_counts[normalize(row.get("output_text") or row.get("reference"))]),
                (0, 1, 4, 19),
            )
        ],
        "synthetic_target_surface_occurrences": [
            count_bucket(
                int(synthetic_surface_counts[token_key(row.get("output_text") or row.get("reference"))]),
                (0, 1, 4, 19),
            )
        ],
        "source_word_count": [count_bucket(source_words, (1, 2, 5))],
        "target_word_count": ["one" if target_words <= 1 else "multiple"],
        "accepted_reference_count": ["one" if len(references) == 1 else "multiple"],
        "ambiguous_surface_prompt": [str(ambiguity).lower()],
        "identity_mapping": [str(identity_mapping).lower()],
        "part_of_speech": parts_of_speech(row),
        "semantic_domain": semantic_domains(row),
        "dictionary_source": dictionary_sources(row),
        "provenance_status": [provenance_status(row)],
        "target_shape": target_shapes(references),
    }
    if row_id in token_counts:
        result["target_subword_count"] = [count_bucket(token_counts[row_id]["target_subwords"], (1, 2, 4, 8))]
        result["source_subword_count"] = [count_bucket(token_counts[row_id]["source_subwords"], (2, 4, 8, 16))]
    return result


def load_token_counts(tokenizer_dir: Path | None, rows: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    if tokenizer_dir is None:
        return {}
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(str(tokenizer_dir), local_files_only=True)
    result: dict[str, dict[str, int]] = {}
    for row in rows:
        source = normalize(row.get("input_text"))
        target = normalize(row.get("output_text") or row.get("reference"))
        result[str(row.get("id"))] = {
            "source_subwords": len(tokenizer(source, add_special_tokens=False)["input_ids"]),
            "target_subwords": len(tokenizer(target, add_special_tokens=False)["input_ids"]),
        }
    return result


def token_key(value: Any) -> str:
    return " ".join(normalize(token) for token in TOKEN_RE.findall(str(value or "")))


def load_synthetic_counts(path: Path | None, maximum_ngram: int) -> tuple[Counter[str], Counter[str]]:
    explicit_counts: Counter[str] = Counter()
    surface_counts: Counter[str] = Counter()
    if path is None:
        return explicit_counts, surface_counts
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            for target in (row.get("meta") or {}).get("lexical_targets") or []:
                normalized = normalize(target)
                if normalized:
                    explicit_counts[normalized] += 1
            target_tokens = tuple(TOKEN_RE.findall(str(row.get("ku") or row.get("output_text") or "")))
            for size in range(1, min(maximum_ngram, len(target_tokens)) + 1):
                for offset in range(len(target_tokens) - size + 1):
                    surface_counts[token_key(" ".join(target_tokens[offset : offset + size]))] += 1
    return explicit_counts, surface_counts


def summarize_group(items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = list(items)
    exact_count = sum(bool(item["analysis"]["exact"]) for item in rows)
    exact_selected_count = sum(bool(item["analysis"]["exact_selected"]) for item in rows)
    failure_grapheme_cers = [
        float(item["analysis"]["minimum_grapheme_error_rate"])
        for item in rows
        if not item["analysis"]["exact"]
    ]
    failure_codepoint_cers = [
        float(item["analysis"]["minimum_codepoint_error_rate"])
        for item in rows
        if not item["analysis"]["exact"]
    ]
    return {
        "rows": len(rows),
        "exact_count": exact_count,
        "exact_percent": 100 * exact_count / len(rows) if rows else 0.0,
        "exact_selected_count": exact_selected_count,
        "exact_selected_percent": 100 * exact_selected_count / len(rows) if rows else 0.0,
        "selected_reference_not_accepted_count": sum(
            not bool(item["analysis"]["selected_reference_is_accepted"]) for item in rows
        ),
        "error_categories": dict(sorted(Counter(item["analysis"]["category"] for item in rows).items())),
        "median_failure_grapheme_error_rate": (
            statistics.median(failure_grapheme_cers) if failure_grapheme_cers else None
        ),
        "median_failure_codepoint_error_rate": (
            statistics.median(failure_codepoint_cers) if failure_codepoint_cers else None
        ),
        "median_failure_character_error_rate": (
            statistics.median(failure_codepoint_cers) if failure_codepoint_cers else None
        ),
    }


def analyze_model(
    rows: list[dict[str, Any]],
    token_counts: dict[str, dict[str, int]],
    near_cer_threshold: float,
    synthetic_explicit_target_counts: Counter[str] | None = None,
    synthetic_surface_counts: Counter[str] | None = None,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    synthetic_explicit_target_counts = synthetic_explicit_target_counts or Counter()
    synthetic_surface_counts = synthetic_surface_counts or Counter()
    known_target_rows: dict[str, set[str]] = defaultdict(set)
    known_target_records: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        for reference in accepted_references(row):
            row_id = str(row.get("id"))
            known_target_rows[reference].add(row_id)
            known_target_records[reference].append(
                {
                    "id": row_id,
                    "input_text": row.get("input_text"),
                    "unconditioned_input_text": row.get("unconditioned_input_text"),
                    "accepted_references": accepted_references(row),
                }
            )

    analyzed: list[dict[str, Any]] = []
    by_id: dict[str, dict[str, Any]] = {}
    strata: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        analysis = classify_row(row, known_target_rows, near_cer_threshold)
        row_id = str(row.get("id"))
        competitors = [
            record
            for record in known_target_records.get(analysis["prediction"], [])
            if record["id"] != row_id
        ]
        analysis["known_target_competitor_count"] = len(competitors)
        analysis["known_target_competitors"] = competitors
        item = {"row": row, "analysis": analysis}
        analyzed.append(item)
        by_id[row_id] = item
        for stratum, values in stratum_values(
            row,
            token_counts,
            synthetic_explicit_target_counts,
            synthetic_surface_counts,
        ).items():
            for value in values:
                strata[stratum][value].append(item)

    summary = summarize_group(analyzed)
    summary["strata"] = {
        stratum: {value: summarize_group(items) for value, items in sorted(groups.items())}
        for stratum, groups in sorted(strata.items())
    }
    summary["interpretation"] = (
        "Exploratory closed-set surface-error analysis. Categories identify testable failure forms; they do not "
        "establish grammaticality, semantic adequacy, dialect suitability, or speaker acceptance."
    )
    return summary, by_id


def compare_models(
    treatment: dict[str, dict[str, Any]], control: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    ids = sorted(control)
    gained = [row_id for row_id in ids if treatment[row_id]["analysis"]["exact"] and not control[row_id]["analysis"]["exact"]]
    lost = [row_id for row_id in ids if control[row_id]["analysis"]["exact"] and not treatment[row_id]["analysis"]["exact"]]
    transitions = Counter(
        f"{control[row_id]['analysis']['category']} -> {treatment[row_id]['analysis']['category']}" for row_id in ids
    )
    return {
        "gained_exact_ids": gained,
        "lost_exact_ids": lost,
        "gained_exact_count": len(gained),
        "lost_exact_count": len(lost),
        "net_exact_gain": len(gained) - len(lost),
        "error_transitions": dict(sorted(transitions.items())),
    }


def stable_sample(items: list[dict[str, Any]], limit: int, seed: str) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: hashlib.sha256(f"{seed}:{item['row'].get('id')}".encode()).digest(),
    )[:limit]


def review_record(
    label: str,
    item: dict[str, Any],
    cohorts: list[str],
    token_counts: dict[str, dict[str, int]],
    synthetic_explicit_target_counts: Counter[str],
    synthetic_surface_counts: Counter[str],
) -> dict[str, Any]:
    row = item["row"]
    analysis = item["analysis"]
    row_id = str(row.get("id"))
    return {
        "candidate": label,
        "cohorts": sorted(cohorts),
        "id": row_id,
        "input_text": row.get("input_text"),
        "unconditioned_input_text": row.get("unconditioned_input_text"),
        "prediction": row.get("prediction"),
        "accepted_references": row.get("accepted_references"),
        "error_category": analysis["category"],
        "selected_reference_is_accepted": analysis["selected_reference_is_accepted"],
        "closest_reference": analysis["closest_reference"],
        "minimum_grapheme_error_rate": analysis["minimum_grapheme_error_rate"],
        "minimum_codepoint_error_rate": analysis["minimum_codepoint_error_rate"],
        "minimum_character_error_rate": analysis["minimum_character_error_rate"],
        "known_target_competitor_count": analysis["known_target_competitor_count"],
        "known_target_competitors": analysis["known_target_competitors"],
        "parts_of_speech": parts_of_speech(row),
        "documented_v21_2_target_occurrences": lineage_occurrences(row),
        "synthetic_explicit_target_occurrences": int(
            synthetic_explicit_target_counts[normalize(row.get("output_text") or row.get("reference"))]
        ),
        "synthetic_target_surface_occurrences": int(
            synthetic_surface_counts[token_key(row.get("output_text") or row.get("reference"))]
        ),
        "token_counts": token_counts.get(row_id),
        "entry_ids": (row.get("lexicon") or {}).get("entry_ids") or row.get("lexicon_entry_ids"),
        "provenance_status": provenance_status(row),
        "required_next_action": analysis_metadata(row).get("required_next_action"),
        "curated_entry_records": curated_entry_records(row),
    }


def build_review_sample(
    analyses: dict[str, dict[str, dict[str, Any]]],
    comparisons: dict[str, dict[str, Any]],
    control_label: str,
    token_counts: dict[str, dict[str, int]],
    synthetic_explicit_target_counts: Counter[str],
    synthetic_surface_counts: Counter[str],
    per_cohort: int,
    seed: str,
) -> list[dict[str, Any]]:
    selected: dict[tuple[str, str], set[str]] = defaultdict(set)
    for label, by_id in analyses.items():
        cohorts: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in by_id.values():
            category = item["analysis"]["category"]
            if not item["analysis"]["exact"]:
                cohorts[f"error:{category}"].append(item)
            if not item["analysis"]["selected_reference_is_accepted"]:
                cohorts["benchmark:selected_reference_not_accepted"].append(item)
            if not item["analysis"]["exact"] and lineage_occurrences(item["row"]) == 0:
                cohorts["failure:zero_documented_exposure"].append(item)
            if not item["analysis"]["exact"]:
                cohorts[f"failure:provenance:{provenance_status(item['row'])}"].append(item)
            row_tokens = token_counts.get(str(item["row"].get("id")))
            if not item["analysis"]["exact"] and row_tokens and row_tokens["target_subwords"] >= 5:
                cohorts["failure:target_subwords_5_plus"].append(item)
        for cohort, items in cohorts.items():
            for item in stable_sample(items, per_cohort, f"{seed}:{label}:{cohort}"):
                selected[(label, str(item["row"].get("id")))].add(cohort)

    for label, comparison in comparisons.items():
        for cohort, key in (("comparison:gained_exact", "gained_exact_ids"), ("comparison:lost_exact", "lost_exact_ids")):
            items = [analyses[label][row_id] for row_id in comparison[key]]
            for item in stable_sample(items, per_cohort, f"{seed}:{label}:{cohort}:{control_label}"):
                selected[(label, str(item["row"].get("id")))].add(cohort)

    return [
        review_record(
            label,
            analyses[label][row_id],
            sorted(cohorts),
            token_counts,
            synthetic_explicit_target_counts,
            synthetic_surface_counts,
        )
        for (label, row_id), cohorts in sorted(selected.items())
    ]


def build_row_analysis(
    analyses: dict[str, dict[str, dict[str, Any]]],
    control_label: str,
    token_counts: dict[str, dict[str, int]],
    synthetic_explicit_target_counts: Counter[str],
    synthetic_surface_counts: Counter[str],
) -> list[dict[str, Any]]:
    control = analyses[control_label]
    output: list[dict[str, Any]] = []
    for label, by_id in sorted(analyses.items()):
        for row_id, item in sorted(by_id.items()):
            record = review_record(
                label,
                item,
                [],
                token_counts,
                synthetic_explicit_target_counts,
                synthetic_surface_counts,
            )
            record["analysis"] = item["analysis"]
            record["strata"] = stratum_values(
                item["row"],
                token_counts,
                synthetic_explicit_target_counts,
                synthetic_surface_counts,
            )
            control_exact = bool(control[row_id]["analysis"]["exact"])
            candidate_exact = bool(item["analysis"]["exact"])
            record["comparison_to_control"] = {
                "control_label": control_label,
                "control_exact": control_exact,
                "candidate_exact": candidate_exact,
                "transition": (
                    "gain" if candidate_exact and not control_exact else
                    "loss" if control_exact and not candidate_exact else
                    "unchanged_exact" if candidate_exact else
                    "unchanged_failure"
                ),
            }
            output.append(record)
    return output


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, indent=2, ensure_ascii=False, sort_keys=True)
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
    if not 0 <= args.near_cer_threshold <= 1:
        raise SystemExit("near CER threshold must be between zero and one")
    if args.sample_per_cohort < 1:
        raise SystemExit("sample per cohort must be positive")
    paths = parse_labeled_paths(args.candidate)
    rows_by_label = {label: load_predictions(path) for label, path in paths.items()}
    metadata = load_row_metadata(args.row_metadata)
    metadata_join = attach_row_metadata(rows_by_label, metadata)
    if args.control_label not in rows_by_label:
        raise ValueError(f"control label is absent: {args.control_label}")

    identities = None
    for label, rows in rows_by_label.items():
        current = [row_identity(row) for row in rows]
        if len(current) != len(set(current)):
            raise ValueError(f"duplicate row identity in {label}")
        if identities is None:
            identities = current
        elif current != identities:
            raise ValueError(f"prediction rows are not aligned for {label}")

    first_rows = next(iter(rows_by_label.values()))
    token_counts = load_token_counts(args.tokenizer_dir, first_rows)
    maximum_ngram = max(
        (len(TOKEN_RE.findall(reference)) for row in first_rows for reference in accepted_references(row)),
        default=1,
    )
    synthetic_explicit_target_counts, synthetic_surface_counts = load_synthetic_counts(
        args.synthetic_file,
        maximum_ngram,
    )
    summaries: dict[str, Any] = {}
    analyses: dict[str, dict[str, dict[str, Any]]] = {}
    for label, rows in rows_by_label.items():
        summaries[label], analyses[label] = analyze_model(
            rows,
            token_counts,
            args.near_cer_threshold,
            synthetic_explicit_target_counts,
            synthetic_surface_counts,
        )
        summaries[label]["prediction_file"] = str(paths[label])
        summaries[label]["prediction_sha256"] = sha256(paths[label])

    comparisons = {
        label: compare_models(analysis, analyses[args.control_label])
        for label, analysis in analyses.items()
        if label != args.control_label
    }
    review_sample = build_review_sample(
        analyses,
        comparisons,
        args.control_label,
        token_counts,
        synthetic_explicit_target_counts,
        synthetic_surface_counts,
        args.sample_per_cohort,
        args.seed,
    )
    row_analysis = build_row_analysis(
        analyses,
        args.control_label,
        token_counts,
        synthetic_explicit_target_counts,
        synthetic_surface_counts,
    )
    output = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "exploratory_full_closed_set_lexical_reconstruction",
        "rows": len(first_rows),
        "control_label": args.control_label,
        "near_grapheme_error_rate_threshold": args.near_cer_threshold,
        "near_character_error_rate_threshold": args.near_cer_threshold,
        "tokenizer_dir": str(args.tokenizer_dir.resolve()) if args.tokenizer_dir else None,
        "row_metadata": str(args.row_metadata.resolve()) if args.row_metadata else None,
        "row_metadata_sha256": sha256(args.row_metadata) if args.row_metadata else None,
        "row_metadata_join": metadata_join,
        "synthetic_file": str(args.synthetic_file.resolve()) if args.synthetic_file else None,
        "synthetic_file_sha256": sha256(args.synthetic_file) if args.synthetic_file else None,
        "synthetic_unique_explicit_targets": len(synthetic_explicit_target_counts),
        "synthetic_unique_target_surface_ngrams": len(synthetic_surface_counts),
        "models": summaries,
        "comparisons_to_control": comparisons,
        "review_sample_rows": len(review_sample),
        "review_sample_output": str(args.review_sample_output.resolve()),
        "row_analysis_rows": len(row_analysis),
        "row_analysis_output": str(args.row_analysis_output.resolve()),
        "limitations": [
            "All prompts are explicitly supervised in lexical treatment arms; this measures reconstruction, not unseen mapping inference.",
            "Surface error categories are hypotheses for review, not linguistic acceptability labels.",
            "Rows and dictionary senses are clustered, so percentages are descriptive for this frozen set.",
        ],
    }
    write_json_atomic(args.output, output)
    write_jsonl_atomic(args.review_sample_output, review_sample)
    write_jsonl_atomic(args.row_analysis_output, row_analysis)
    print(
        json.dumps(
            {
                "rows": len(first_rows),
                "review_rows": len(review_sample),
                "row_analysis_rows": len(row_analysis),
                "models": summaries,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

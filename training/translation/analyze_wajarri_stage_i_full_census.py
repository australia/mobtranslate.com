#!/usr/bin/env python3
"""Analyze a completed three-arm Wajarri Stage-I full lexical census."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable
import unicodedata

import regex


METHOD_ID = "wajarri-stage-i-full-census-failure-analysis-v1.3.0"
CLAIM_LIMIT = (
    "This deterministic analysis describes closed-set reconstruction behavior on the "
    "declared 3,016-row internal population. Its strata and diagnostic labels are "
    "associations, not causal explanations or linguistic analyses. It does not "
    "establish future-query reliability, productive morphology, sentence competence, "
    "speaker approval, or release readiness."
)

ALIGNMENT_CLAIM_LIMIT = (
    "Edit counts come from one deterministic minimum-cost Unicode-grapheme "
    "alignment from the model prediction to the closest accepted reference. "
    "Equivalent minimum alignments can have different operation counts; these "
    "are surface diagnostics, not morpheme boundaries or causal explanations."
)

SOURCE_JOIN_CLAIM_LIMIT = (
    "Source-record fields are copied from the checksum-bound lexical candidate "
    "census. Source structural labels describe recorded evidence and mechanical "
    "surface properties; they are not inferred parts of speech, morphemes, senses, "
    "or causal explanations of model behavior."
)

ORTHOGRAPHIC_FAMILY_CONTRACT = {
    "family_kind": "orthographic_terminal_string_cluster",
    "minimum_suffix_graphemes": 3,
    "maximum_suffix_graphemes": 10,
    "minimum_stem_graphemes": 2,
    "minimum_unique_reference_surfaces": 8,
    "minimum_preceding_grapheme_types": 3,
    "reference_scope": "normalized_single_whitespace_unit_accepted_references",
    "interpretation": (
        "Clusters are recurring terminal grapheme strings discovered mechanically "
        "from the frozen accepted-reference inventory. They are diagnostic "
        "orthographic strata, not morphemes, inflections, parts of speech, or "
        "evidence for a grammatical rule."
    ),
}

QUALITATIVE_REVIEW_POLICY = {
    "near_surface_gcer_maximum": 0.25,
    "high_reference_subword_minimum": 4,
    "reused_prediction_population_minimum": 10,
    "interpretation": (
        "Priority labels order manual inspection of complete model outcomes. They "
        "are deterministic diagnostics, not linguistic classifications or evidence "
        "that a proposed explanation is causal."
    ),
}

QUOTE_FOLD = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u02bc": "'",
        "`": "'",
        "\u00b4": "'",
        "\u201c": '"',
        "\u201d": '"',
    }
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--run-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--lexical-census-manifest", type=Path, required=True)
    parser.add_argument("--lexical-census-manifest-sha256", required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    return " ".join(text.translate(QUOTE_FOLD).casefold().split())


def graphemes(value: str) -> list[str]:
    return regex.findall(r"\X", value)


def deterministic_edit_alignment(
    prediction: list[str], reference: list[str]
) -> dict[str, int]:
    """Return one deterministic minimum edit path from prediction to reference."""
    rows = len(prediction) + 1
    columns = len(reference) + 1
    costs = [[0] * columns for _ in range(rows)]
    paths: list[list[tuple[int, int, int]]] = [
        [(0, 0, 0)] * columns for _ in range(rows)
    ]
    for index in range(1, rows):
        costs[index][0] = index
        paths[index][0] = (0, index, 0)
    for index in range(1, columns):
        costs[0][index] = index
        paths[0][index] = (index, 0, 0)
    for pred_index in range(1, rows):
        for ref_index in range(1, columns):
            if prediction[pred_index - 1] == reference[ref_index - 1]:
                costs[pred_index][ref_index] = costs[pred_index - 1][ref_index - 1]
                paths[pred_index][ref_index] = paths[pred_index - 1][ref_index - 1]
                continue
            candidates = []
            insertions, deletions, substitutions = paths[pred_index - 1][ref_index - 1]
            candidates.append(
                (
                    costs[pred_index - 1][ref_index - 1] + 1,
                    0,
                    (insertions, deletions, substitutions + 1),
                )
            )
            insertions, deletions, substitutions = paths[pred_index - 1][ref_index]
            candidates.append(
                (
                    costs[pred_index - 1][ref_index] + 1,
                    1,
                    (insertions, deletions + 1, substitutions),
                )
            )
            insertions, deletions, substitutions = paths[pred_index][ref_index - 1]
            candidates.append(
                (
                    costs[pred_index][ref_index - 1] + 1,
                    2,
                    (insertions + 1, deletions, substitutions),
                )
            )
            cost, _, operations = min(candidates)
            costs[pred_index][ref_index] = cost
            paths[pred_index][ref_index] = operations
    insertions, deletions, substitutions = paths[-1][-1]
    return {
        "distance": costs[-1][-1],
        "reference_graphemes_missing_from_prediction": insertions,
        "prediction_graphemes_excess_over_reference": deletions,
        "grapheme_substitutions": substitutions,
    }


def edit_profile(alignment: dict[str, int], *, blank: bool) -> str:
    if alignment["distance"] == 0:
        return "exact"
    if blank:
        return "blank_prediction"
    active = []
    if alignment["reference_graphemes_missing_from_prediction"]:
        active.append("missing")
    if alignment["prediction_graphemes_excess_over_reference"]:
        active.append("excess")
    if alignment["grapheme_substitutions"]:
        active.append("substituted")
    return "_and_".join(active)


def common_edge_graphemes(left: list[str], right: list[str]) -> tuple[int, int]:
    prefix = 0
    for left_value, right_value in zip(left, right):
        if left_value != right_value:
            break
        prefix += 1
    suffix = 0
    for left_value, right_value in zip(reversed(left), reversed(right)):
        if left_value != right_value:
            break
        suffix += 1
    return prefix, suffix


def closest_reference_alignment(
    prediction: str, references: list[str]
) -> dict[str, Any]:
    prediction_graphemes = graphemes(prediction)
    candidates = []
    for reference in references:
        reference_graphemes = graphemes(reference)
        alignment = deterministic_edit_alignment(
            prediction_graphemes, reference_graphemes
        )
        rate = alignment["distance"] / max(1, len(reference_graphemes))
        candidates.append((rate, alignment["distance"], reference, alignment))
    _, _, reference, alignment = min(candidates, key=lambda row: row[:3])
    reference_graphemes = graphemes(reference)
    prefix, suffix = common_edge_graphemes(prediction_graphemes, reference_graphemes)
    return {
        "closest_normalized_reference": reference,
        "prediction_grapheme_count": len(prediction_graphemes),
        "closest_reference_grapheme_count": len(reference_graphemes),
        "common_prefix_graphemes": prefix,
        "common_suffix_graphemes": suffix,
        **alignment,
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


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


def resolve_within(root: Path, value: str | Path, label: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = root / path
    path = path.resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes program root: {value}") from error
    return path


def load_current_source_profiles(
    program_root: Path,
    manifest_path: Path,
    expected_manifest_sha256: str,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    manifest_path = resolve_within(
        program_root, manifest_path, "lexical candidate census manifest"
    )
    observed_manifest_sha256 = sha256_file(manifest_path)
    if observed_manifest_sha256 != expected_manifest_sha256:
        raise ValueError("lexical candidate census manifest hash mismatch")
    manifest = read_json(manifest_path)
    component = (manifest.get("outputs") or {}).get("records")
    if not isinstance(component, dict):
        raise ValueError("lexical candidate census has no records component")
    records_path = resolve_within(
        program_root, component["path"], "lexical candidate census records"
    )
    if sha256_file(records_path) != component["sha256"]:
        raise ValueError("lexical candidate census records hash mismatch")
    records = read_jsonl(records_path)
    if len(records) != int(component["rows"]):
        raise ValueError("lexical candidate census records row-count mismatch")

    current: dict[str, dict[str, Any]] = {}
    for row in records:
        if row.get("sourceLayer") != "current":
            continue
        source_id = str(row.get("sourceRecordId") or "")
        if not source_id or source_id in current:
            raise ValueError(f"invalid current source record: {source_id!r}")
        current[source_id] = row
    if not current:
        raise ValueError("lexical candidate census has no current source records")
    return current, {
        "census_id": manifest.get("census_id"),
        "manifest_path": str(manifest_path),
        "manifest_sha256": observed_manifest_sha256,
        "records_path": str(records_path),
        "records_sha256": component["sha256"],
        "all_records": len(records),
        "current_records": len(current),
    }


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def verify_checksum_inventory(root: Path) -> dict[str, Any]:
    inventory = root / "OUTPUT-SHA256SUMS"
    if not inventory.is_file():
        raise ValueError(f"missing checksum inventory: {inventory}")
    listed: dict[str, str] = {}
    for line_number, line in enumerate(
        inventory.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line:
            continue
        digest, separator, relative = line.partition("  ")
        if not separator or len(digest) != 64 or relative in listed:
            raise ValueError(f"invalid checksum line {inventory}:{line_number}")
        candidate = Path(relative)
        if candidate.is_absolute() or ".." in candidate.parts:
            raise ValueError(f"unsafe checksum path: {relative}")
        path = root / candidate
        if not path.is_file() or sha256_file(path) != digest:
            raise ValueError(f"checksum mismatch: {path}")
        listed[relative] = digest
    observed = {
        str(path.relative_to(root))
        for path in root.rglob("*")
        if path.is_file() and path != inventory
    }
    if set(listed) != observed:
        raise ValueError(
            "checksum membership drift: "
            f"missing={sorted(observed - set(listed))}, "
            f"extra={sorted(set(listed) - observed)}"
        )
    return {
        "inventory_sha256": sha256_file(inventory),
        "files": len(listed),
        "bytes": sum((root / relative).stat().st_size for relative in listed),
    }


def count_bucket(value: int) -> str:
    if value == 0:
        return "0"
    if value == 1:
        return "1"
    if value <= 3:
        return "2_to_3"
    if value <= 6:
        return "4_to_6"
    if value <= 10:
        return "7_to_10"
    return "11_plus"


def length_bucket(value: int) -> str:
    if value <= 5:
        return "1_to_5"
    if value <= 8:
        return "6_to_8"
    if value <= 12:
        return "9_to_12"
    if value <= 16:
        return "13_to_16"
    return "17_plus"


def punctuation_profile(value: dict[str, Any]) -> str:
    active = sorted(key for key, present in value.items() if present)
    return "+".join(active) if active else "none"


def unique_strings(values: Iterable[Any], missing: str = "(missing)") -> list[str]:
    result = sorted(
        {str(value) for value in values if value is not None and str(value)}
    )
    return result or [missing]


def source_profile_summary(
    source_ids: list[str], source_profiles: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    profiles = [source_profiles[source_id] for source_id in source_ids]
    structural = [row.get("structuralFeatures") or {} for row in profiles]
    grouping = [row.get("grouping") or {} for row in profiles]
    coverage = [row.get("evidenceCoverage") or {} for row in profiles]
    return {
        "source_structural_strata": unique_strings(
            row.get("structuralStratum") for row in profiles
        ),
        "source_blocker_codes": unique_strings(
            value for row in profiles for value in row.get("blockerCodes") or []
        ),
        "source_review_kinds": unique_strings(
            value
            for row in profiles
            for value in (row.get("reviewDependencies") or {}).get("reviewKinds") or []
        ),
        "source_pos_statuses": unique_strings(
            (row.get("partOfSpeech") or {}).get("status") for row in profiles
        ),
        "source_pos_labels": unique_strings(
            (row.get("partOfSpeech") or {}).get("comparison") for row in profiles
        ),
        "source_layers": unique_strings(row.get("sourceLayer") for row in profiles),
        "source_training_eligibilities": unique_strings(
            row.get("trainingEligibility") for row in profiles
        ),
        "source_benchmark_dispositions": unique_strings(
            row.get("benchmarkDisposition") for row in profiles
        ),
        "source_target_length_buckets": unique_strings(
            row.get("targetLengthBucket") for row in structural
        ),
        "source_target_token_buckets": unique_strings(
            row.get("targetTokenBucket") for row in structural
        ),
        "source_prompt_token_buckets": unique_strings(
            row.get("promptTokenBucket") for row in structural
        ),
        "source_definition_segment_count_max": max(
            (int(row.get("definitionSegmentCount") or 0) for row in structural),
            default=0,
        ),
        "source_prompt_begins_with_article_any": any(
            bool(row.get("promptBeginsWithArticle")) for row in structural
        ),
        "source_reduplication_surface_candidate_any": any(
            bool(row.get("reduplicationSurfaceCandidate")) for row in structural
        ),
        "source_identity_mapping_candidate_any": any(
            bool(row.get("identityMappingCandidate")) for row in structural
        ),
        "source_headword_record_count_max": max(
            (int(row.get("headwordSourceRecordCount") or 0) for row in grouping),
            default=0,
        ),
        "source_prompt_record_count_max": max(
            (int(row.get("promptSourceRecordCount") or 0) for row in grouping),
            default=0,
        ),
        "source_prompt_distinct_target_count_max": max(
            (int(row.get("promptDistinctTargetCount") or 0) for row in grouping),
            default=0,
        ),
        "source_contemporary_exact_evidence_links_total": sum(
            int(row.get("contemporaryExactEvidenceLinks") or 0) for row in coverage
        ),
        "source_contemporary_review_candidate_links_total": sum(
            int(row.get("contemporaryReviewCandidateLinks") or 0) for row in coverage
        ),
        "source_historical_crosswalk_candidates_total": sum(
            int(row.get("historicalCrosswalkCandidates") or 0) for row in coverage
        ),
        "source_verified_audio_links_total": sum(
            int(row.get("verifiedAudioLinks") or 0) for row in coverage
        ),
        "source_unresolved_image_links_total": sum(
            int(row.get("unresolvedImageLinks") or 0) for row in coverage
        ),
        "source_published_evidence_relation_count_total": sum(
            len(row.get("publishedEvidenceRelations") or []) for row in coverage
        ),
        "source_join_claim_limit": SOURCE_JOIN_CLAIM_LIMIT,
    }


def discover_orthographic_suffix_clusters(
    references_by_row: Iterable[list[str]],
) -> dict[str, Any]:
    surfaces = sorted(
        {
            normalize(reference)
            for references in references_by_row
            for reference in references
            if normalize(reference)
        }
    )
    single_unit_surfaces = [surface for surface in surfaces if " " not in surface]
    candidate_surfaces: defaultdict[str, set[str]] = defaultdict(set)
    preceding_graphemes: defaultdict[str, set[str]] = defaultdict(set)
    minimum_suffix = int(ORTHOGRAPHIC_FAMILY_CONTRACT["minimum_suffix_graphemes"])
    maximum_suffix = int(ORTHOGRAPHIC_FAMILY_CONTRACT["maximum_suffix_graphemes"])
    minimum_stem = int(ORTHOGRAPHIC_FAMILY_CONTRACT["minimum_stem_graphemes"])

    for surface in single_unit_surfaces:
        units = graphemes(surface)
        upper = min(maximum_suffix, len(units) - minimum_stem)
        for suffix_length in range(minimum_suffix, upper + 1):
            suffix_units = units[-suffix_length:]
            stem_units = units[:-suffix_length]
            suffix = "".join(suffix_units)
            if not suffix.isalpha() or len(stem_units) < minimum_stem:
                continue
            candidate_surfaces[suffix].add(surface)
            preceding_graphemes[suffix].add(stem_units[-1])

    minimum_support = int(
        ORTHOGRAPHIC_FAMILY_CONTRACT["minimum_unique_reference_surfaces"]
    )
    minimum_boundaries = int(
        ORTHOGRAPHIC_FAMILY_CONTRACT["minimum_preceding_grapheme_types"]
    )
    qualified = [
        suffix
        for suffix, members in candidate_surfaces.items()
        if len(members) >= minimum_support
        and len(preceding_graphemes[suffix]) >= minimum_boundaries
    ]
    qualified.sort(
        key=lambda suffix: (
            -len(graphemes(suffix)),
            -len(candidate_surfaces[suffix]),
            suffix,
        )
    )

    clusters = []
    clusters_by_surface: defaultdict[str, list[str]] = defaultdict(list)
    labels: dict[str, str] = {}
    for suffix in qualified:
        cluster_id = (
            "orthographic-suffix-"
            + hashlib.sha256(suffix.encode("utf-8")).hexdigest()[:16]
        )
        label = f"suffix:{suffix}"
        members = sorted(candidate_surfaces[suffix])
        labels[cluster_id] = label
        clusters.append(
            {
                "cluster_id": cluster_id,
                "label": label,
                "terminal_string": suffix,
                "terminal_grapheme_count": len(graphemes(suffix)),
                "unique_reference_surface_count": len(members),
                "unique_preceding_grapheme_count": len(preceding_graphemes[suffix]),
                "preceding_graphemes": sorted(preceding_graphemes[suffix]),
                "reference_surface_sample": members[:20],
                "claim_limit": ORTHOGRAPHIC_FAMILY_CONTRACT["interpretation"],
            }
        )
        for member in members:
            clusters_by_surface[member].append(cluster_id)
    return {
        "contract": dict(ORTHOGRAPHIC_FAMILY_CONTRACT),
        "unique_reference_surfaces": len(surfaces),
        "single_unit_reference_surfaces": len(single_unit_surfaces),
        "excluded_multi_unit_reference_surfaces": len(surfaces)
        - len(single_unit_surfaces),
        "cluster_count": len(clusters),
        "clusters": clusters,
        "clusters_by_surface": dict(clusters_by_surface),
        "cluster_labels": labels,
    }


def mean(rows: list[dict[str, Any]], field: str) -> float | None:
    values = [float(row[field]) for row in rows if row.get(field) is not None]
    return statistics.fmean(values) if values else None


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "rows": len(rows),
        "exact_count": sum(bool(row["normalized_exact"]) for row in rows),
        "exact_rate": (
            sum(bool(row["normalized_exact"]) for row in rows) / len(rows)
            if rows
            else None
        ),
        "mean_grapheme_cluster_error_rate": mean(rows, "grapheme_cluster_error_rate"),
        "blank_output_count": sum(bool(row["blank_output"]) for row in rows),
        "source_copy_count": sum(bool(row["source_copy"]) for row in rows),
        "repeated_output_token_4gram_count": sum(
            bool(row["repeated_output_token_4gram"]) for row in rows
        ),
        "unique_normalized_predictions": len(
            {row["normalized_prediction"] for row in rows}
        ),
        "whole_prediction_is_c0_target_count": sum(
            bool(row["whole_prediction_is_c0_target"]) for row in rows
        ),
        "all_prediction_units_are_c0_units_count": sum(
            bool(row["all_prediction_units_are_c0_units"]) for row in rows
        ),
        "accepted_reference_is_c0_target_count": sum(
            bool(row["accepted_reference_is_c0_target"]) for row in rows
        ),
        "mean_source_subword_count": mean(rows, "source_subword_count"),
        "mean_minimum_reference_subword_count": mean(
            rows, "minimum_reference_subword_count"
        ),
        "mean_minimum_grapheme_edit_distance": mean(
            rows, "minimum_grapheme_edit_distance"
        ),
        "mean_reference_graphemes_missing_from_prediction": mean(
            rows, "reference_graphemes_missing_from_prediction"
        ),
        "mean_prediction_graphemes_excess_over_reference": mean(
            rows, "prediction_graphemes_excess_over_reference"
        ),
        "mean_grapheme_substitutions": mean(rows, "grapheme_substitutions"),
        "outside_reference_grapheme_row_count": sum(
            bool(row["outside_reference_graphemes"]) for row in rows
        ),
    }


def grouped_summary(
    rows: list[dict[str, Any]], field: str
) -> dict[str, dict[str, Any]]:
    groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field, "(missing)"))].append(row)
    return {key: summarize(groups[key]) for key in sorted(groups)}


def grouped_summary_multi(
    rows: list[dict[str, Any]], field: str
) -> dict[str, dict[str, Any]]:
    groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        values = row.get(field) or ["(missing)"]
        for value in sorted({str(item) for item in values}):
            groups[value].append(row)
    return {key: summarize(groups[key]) for key in sorted(groups)}


def failure_labels(row: dict[str, Any]) -> list[str]:
    if row["normalized_exact"]:
        return []
    labels = [str(row["surface_class"])]
    labels.append(f"grapheme_edit_{row['grapheme_edit_profile']}")
    if row["blank_output"]:
        labels.append("blank_output")
    if row["source_copy"]:
        labels.append("source_copy")
    if row["repeated_output_token_4gram"]:
        labels.append("repeated_output_token_4gram")
    if row["whole_prediction_is_c0_target"]:
        labels.append("whole_prediction_replays_c0_target")
    if row["all_prediction_units_are_c0_units"]:
        labels.append("all_prediction_units_replay_c0_inventory")
    if row["accepted_reference_is_c0_target"]:
        labels.append("accepted_reference_present_in_c0_target_inventory")
    else:
        labels.append("accepted_reference_absent_from_c0_target_inventory")
    if row["accepted_reference_count"] > 1:
        labels.append("multiple_accepted_references")
    if row["reference_punctuation_profile"] != "none":
        labels.append("punctuated_reference")
    if row["minimum_reference_whitespace_units"] > 1:
        labels.append("multiword_reference")
    if row["outside_reference_graphemes"]:
        labels.append("outside_accepted_reference_grapheme_inventory")
    return sorted(set(labels))


def enrich_prediction(
    arm: str,
    suite: str,
    benchmark: dict[str, Any],
    prediction: dict[str, Any],
    exposure: dict[str, Any],
    c0_targets: set[str],
    c0_units: set[str],
    source_profiles: dict[str, dict[str, Any]],
    orthographic_families: dict[str, Any],
) -> dict[str, Any]:
    references = [normalize(value) for value in benchmark["acceptedReferences"]]
    normalized_prediction = normalize(prediction["prediction"])
    alignment = closest_reference_alignment(normalized_prediction, references)
    prediction_units = normalized_prediction.split()
    surface = benchmark.get("surfaceFeatures") or {}
    reference_graphemes = [
        int(value) for value in surface["acceptedReferenceGraphemeCounts"]
    ]
    reference_tokens = [int(value) for value in surface["acceptedReferenceTokenCounts"]]
    reference_punctuation = {
        key: any(
            bool(row.get(key)) for row in surface.get("referencePunctuation") or []
        )
        for key in (surface.get("promptPunctuation") or {})
    }
    structural_strata = (benchmark.get("analysisJoin") or {}).get(
        "structuralStrata"
    ) or []
    source_record_ids = list(benchmark.get("sourceRecordIds") or [])
    source_metadata = source_profile_summary(source_record_ids, source_profiles)
    reference_cluster_ids = sorted(
        {
            cluster_id
            for reference in references
            for cluster_id in orthographic_families["clusters_by_surface"].get(
                reference, []
            )
        }
    )
    reference_cluster_labels = [
        orthographic_families["cluster_labels"][cluster_id]
        for cluster_id in reference_cluster_ids
    ] or ["(unclustered)"]
    row = {
        "arm": arm,
        "suite": suite,
        "row_id": benchmark["rowId"],
        "evaluation_id": prediction["evaluation_id"],
        "input_text": benchmark["inputText"],
        "source_prompt": benchmark.get("sourcePrompt")
        or (benchmark.get("sourcePromptValues") or [None])[0],
        "source_definition": benchmark.get("sourceDefinition"),
        "source_record_ids": source_record_ids,
        "accepted_references": list(benchmark["acceptedReferences"]),
        "accepted_reference_count": len(references),
        "ambiguity_status": benchmark.get("ambiguityStatus") or "(missing)",
        "prediction": prediction["prediction"],
        "normalized_prediction": normalized_prediction,
        "generated_content_token_ids": prediction["generated_content_token_ids"],
        "normalized_exact": bool(prediction["normalized_exact"]),
        "strict_source_preserved_exact": bool(
            prediction["strict_source_preserved_exact"]
        ),
        "grapheme_cluster_error_rate": float(prediction["grapheme_cluster_error_rate"]),
        "code_point_character_error_rate": float(
            prediction["code_point_character_error_rate"]
        ),
        "surface_class": prediction["surface_class"],
        "blank_output": bool(prediction["blank_output"]),
        "source_copy": bool(prediction["normalized_source_copy"]),
        "repeated_output_token_4gram": bool(prediction["repeated_output_token_4gram"]),
        "outside_reference_graphemes": sorted(
            str(value) for value in prediction.get("outside_reference_graphemes") or []
        ),
        "has_outside_reference_graphemes": bool(
            prediction.get("outside_reference_graphemes")
        ),
        "source_subword_count": int(prediction["source_token_count"]),
        "prediction_subword_count": int(prediction["prediction_token_count"]),
        "minimum_reference_subword_count": int(
            prediction["minimum_reference_token_count"]
        ),
        "prompt_token_count": int(surface.get("promptTokenCount") or 0),
        "prompt_token_bucket": count_bucket(int(surface.get("promptTokenCount") or 0)),
        "minimum_reference_graphemes": min(reference_graphemes),
        "reference_grapheme_bucket": length_bucket(min(reference_graphemes)),
        "minimum_reference_whitespace_units": min(reference_tokens),
        "reference_whitespace_unit_bucket": count_bucket(min(reference_tokens)),
        "minimum_reference_subword_bucket": count_bucket(
            int(prediction["minimum_reference_token_count"])
        ),
        "prompt_punctuation_profile": punctuation_profile(
            surface.get("promptPunctuation") or {}
        ),
        "reference_punctuation_profile": punctuation_profile(reference_punctuation),
        "structural_strata": sorted(str(value) for value in structural_strata),
        "structural_strata_key": "+".join(sorted(structural_strata))
        if structural_strata
        else "none",
        "exposure_class": exposure["primary_exposure_class"],
        "direct_matching_training_row_count": len(
            exposure.get("direct_matching_training_rows") or []
        ),
        "same_prompt_conflict_count": len(
            exposure.get("same_prompt_conflicting_training_rows") or []
        ),
        "complete_target_elsewhere_count": len(
            exposure.get("complete_target_output_elsewhere_by_reference") or {}
        ),
        "upstream_nllb_pretraining_exposure": exposure.get(
            "upstream_nllb_pretraining_exposure"
        ),
        "accepted_reference_is_c0_target": any(
            reference in c0_targets for reference in references
        ),
        "whole_prediction_is_c0_target": normalized_prediction in c0_targets,
        "all_prediction_units_are_c0_units": bool(prediction_units)
        and all(unit in c0_units for unit in prediction_units),
        "any_prediction_unit_is_c0_unit": any(
            unit in c0_units for unit in prediction_units
        ),
        "closest_normalized_reference": alignment["closest_normalized_reference"],
        "minimum_grapheme_edit_distance": alignment["distance"],
        "prediction_grapheme_count": alignment["prediction_grapheme_count"],
        "closest_reference_grapheme_count": alignment[
            "closest_reference_grapheme_count"
        ],
        "reference_graphemes_missing_from_prediction": alignment[
            "reference_graphemes_missing_from_prediction"
        ],
        "prediction_graphemes_excess_over_reference": alignment[
            "prediction_graphemes_excess_over_reference"
        ],
        "grapheme_substitutions": alignment["grapheme_substitutions"],
        "common_prefix_graphemes": alignment["common_prefix_graphemes"],
        "common_suffix_graphemes": alignment["common_suffix_graphemes"],
        "grapheme_edit_profile": edit_profile(
            alignment, blank=bool(prediction["blank_output"])
        ),
        "reference_orthographic_suffix_cluster_ids": reference_cluster_ids,
        "reference_orthographic_suffix_cluster_labels": reference_cluster_labels,
        "alignment_claim_limit": ALIGNMENT_CLAIM_LIMIT,
        "claim_limit": CLAIM_LIMIT,
        **source_metadata,
    }
    for field in (
        "source_definition_segment_count_max",
        "source_headword_record_count_max",
        "source_prompt_record_count_max",
        "source_prompt_distinct_target_count_max",
        "source_contemporary_exact_evidence_links_total",
        "source_contemporary_review_candidate_links_total",
        "source_historical_crosswalk_candidates_total",
        "source_verified_audio_links_total",
        "source_unresolved_image_links_total",
        "source_published_evidence_relation_count_total",
    ):
        row[f"{field}_bucket"] = count_bucket(int(row[field]))
    row["failure_diagnostic_labels"] = failure_labels(row)
    return row


def annotate_collapse(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[(row["arm"], row["normalized_prediction"])].append(row)
    counts_by_arm: defaultdict[str, Counter[int]] = defaultdict(Counter)
    for (arm, _), members in groups.items():
        counts_by_arm[arm][len(members)] += 1
    ranks = {
        arm: {
            count: rank
            for rank, count in enumerate(sorted(counter, reverse=True), start=1)
        }
        for arm, counter in counts_by_arm.items()
    }
    for row in rows:
        members = groups[(row["arm"], row["normalized_prediction"])]
        row["prediction_population_count_within_arm"] = len(members)
        row["prediction_population_frequency_rank_within_arm"] = ranks[row["arm"]][
            len(members)
        ]
    return rows


def build_collapse_report(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[(row["arm"], row["normalized_prediction"])].append(row)
    report = []
    for (arm, prediction), members in groups.items():
        report.append(
            {
                "arm": arm,
                "normalized_prediction": prediction,
                "rows": len(members),
                "exact_rows": sum(row["normalized_exact"] for row in members),
                "unique_source_records": len(
                    {
                        source_id
                        for row in members
                        for source_id in row["source_record_ids"]
                    }
                ),
                "whole_prediction_is_c0_target": members[0][
                    "whole_prediction_is_c0_target"
                ],
                "row_id_sample": sorted(row["row_id"] for row in members)[:20],
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return sorted(
        report, key=lambda row: (row["arm"], -row["rows"], row["normalized_prediction"])
    )


def build_failure_report(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        for label in row["failure_diagnostic_labels"]:
            groups[(row["arm"], label)].append(row)
    report = []
    for (arm, label), members in groups.items():
        report.append(
            {
                "arm": arm,
                "diagnostic_label": label,
                "failure_rows": len(members),
                "mean_grapheme_cluster_error_rate": mean(
                    members, "grapheme_cluster_error_rate"
                ),
                "unique_source_records": len(
                    {
                        source_id
                        for row in members
                        for source_id in row["source_record_ids"]
                    }
                ),
                "row_id_sample": sorted(row["row_id"] for row in members)[:20],
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return sorted(
        report,
        key=lambda row: (row["arm"], -row["failure_rows"], row["diagnostic_label"]),
    )


def source_record_target(source_profile: dict[str, Any]) -> str:
    target = source_profile.get("sourceTargetCandidate") or {}
    value = target.get("source") or target.get("comparison")
    normalized = normalize(value)
    if not normalized:
        raise ValueError(
            "current source profile has no source-specific target: "
            f"{source_profile.get('sourceRecordId')}"
        )
    return normalized


def source_specific_score(row: dict[str, Any], target: str) -> dict[str, Any]:
    alignment = closest_reference_alignment(row["normalized_prediction"], [target])
    return {
        "exact": row["normalized_prediction"] == target,
        "grapheme_cluster_error_rate": alignment["distance"]
        / max(1, alignment["closest_reference_grapheme_count"]),
        "minimum_grapheme_edit_distance": alignment["distance"],
    }


def build_context_contrasts(
    rows: list[dict[str, Any]], source_profiles: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    grouped: defaultdict[tuple[str, str], defaultdict[str, list[dict[str, Any]]]] = (
        defaultdict(lambda: defaultdict(list))
    )
    for row in rows:
        for source_id in row["source_record_ids"]:
            grouped[(row["arm"], source_id)][row["suite"]].append(row)
    contrasts = []
    for (arm, source_id), suites in sorted(grouped.items()):
        if not {"prompt_group", "source_context"} <= set(suites):
            continue
        prompt = suites["prompt_group"]
        context = suites["source_context"]
        target = source_record_target(source_profiles[source_id])
        prompt_scores = [source_specific_score(row, target) for row in prompt]
        context_scores = [source_specific_score(row, target) for row in context]
        prompt_exact = any(score["exact"] for score in prompt_scores)
        context_exact = any(score["exact"] for score in context_scores)
        prompt_gcer = min(
            score["grapheme_cluster_error_rate"] for score in prompt_scores
        )
        context_gcer = min(
            score["grapheme_cluster_error_rate"] for score in context_scores
        )
        prompt_predictions = sorted({row["normalized_prediction"] for row in prompt})
        context_predictions = sorted({row["normalized_prediction"] for row in context})
        if prompt_exact and context_exact:
            effect = "both_exact"
        elif context_exact:
            effect = "context_only_exact"
        elif prompt_exact:
            effect = "prompt_only_exact"
        elif prompt_predictions == context_predictions:
            effect = "same_nonexact_prediction"
        elif context_gcer < prompt_gcer:
            effect = "context_lower_gcer_nonexact"
        elif context_gcer > prompt_gcer:
            effect = "context_higher_gcer_nonexact"
        else:
            effect = "different_prediction_equal_gcer_nonexact"
        contrasts.append(
            {
                "arm": arm,
                "source_record_id": source_id,
                "source_record_target": target,
                "prompt_group_row_ids": sorted(row["row_id"] for row in prompt),
                "source_context_row_ids": sorted(row["row_id"] for row in context),
                "prompt_group_predictions": prompt_predictions,
                "source_context_predictions": context_predictions,
                "prompt_group_source_record_any_exact": prompt_exact,
                "source_context_source_record_any_exact": context_exact,
                "prompt_group_source_record_best_gcer": prompt_gcer,
                "source_context_source_record_best_gcer": context_gcer,
                "context_minus_prompt_source_record_gcer": context_gcer - prompt_gcer,
                "prompt_group_benchmark_group_any_exact": any(
                    row["normalized_exact"] for row in prompt
                ),
                "source_context_benchmark_group_any_exact": any(
                    row["normalized_exact"] for row in context
                ),
                "effect_class": effect,
                "claim_limit": (
                    "This within-record prompt contrast is scored against this source "
                    "record's own recorded target. It measures output sensitivity to "
                    "the supplied source definition; it does not prove sense selection "
                    "or semantic improvement."
                ),
            }
        )
    return contrasts


def build_arm_disagreements(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: defaultdict[tuple[str, str], dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in rows:
        grouped[(row["suite"], row["row_id"])][row["arm"]] = row
    disagreements = []
    for (suite, row_id), arms in sorted(grouped.items()):
        if set(arms) != {"I0", "I1", "I2"}:
            raise ValueError(f"incomplete arm join: {suite}:{row_id}")
        token_sequences = {
            arm: value["generated_content_token_ids"] for arm, value in arms.items()
        }
        if token_sequences["I0"] == token_sequences["I1"] == token_sequences["I2"]:
            continue
        minimum_gcer = min(
            value["grapheme_cluster_error_rate"] for value in arms.values()
        )
        disagreements.append(
            {
                "suite": suite,
                "row_id": row_id,
                "source_record_ids": arms["I0"]["source_record_ids"],
                "input_text": arms["I0"]["input_text"],
                "accepted_references": arms["I0"]["accepted_references"],
                "predictions": {
                    arm: {
                        "prediction": value["prediction"],
                        "normalized_exact": value["normalized_exact"],
                        "grapheme_cluster_error_rate": value[
                            "grapheme_cluster_error_rate"
                        ],
                        "token_ids": value["generated_content_token_ids"],
                    }
                    for arm, value in sorted(arms.items())
                },
                "lowest_gcer_arms": sorted(
                    arm
                    for arm, value in arms.items()
                    if value["grapheme_cluster_error_rate"] == minimum_gcer
                ),
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return disagreements


def pairwise_arm_identity(rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: defaultdict[tuple[str, str], dict[str, list[int]]] = defaultdict(dict)
    for row in rows:
        grouped[(row["suite"], row["row_id"])][row["arm"]] = row[
            "generated_content_token_ids"
        ]
    result = {}
    for left, right in (("I0", "I1"), ("I0", "I2"), ("I1", "I2")):
        identical = sum(values[left] == values[right] for values in grouped.values())
        result[f"{left}_vs_{right}"] = {
            "rows": len(grouped),
            "token_identical_rows": identical,
            "token_identical_rate": identical / len(grouped),
        }
    return result


def build_orthographic_family_report(
    rows: list[dict[str, Any]], orthographic_families: dict[str, Any]
) -> list[dict[str, Any]]:
    report = []
    for cluster in orthographic_families["clusters"]:
        cluster_id = cluster["cluster_id"]
        members = [
            row
            for row in rows
            if cluster_id in row["reference_orthographic_suffix_cluster_ids"]
        ]
        report.append(
            {
                **cluster,
                "unique_benchmark_rows": len({row["row_id"] for row in members}),
                "unique_source_records": len(
                    {
                        source_id
                        for row in members
                        for source_id in row["source_record_ids"]
                    }
                ),
                "arms": {
                    arm: summarize([row for row in members if row["arm"] == arm])
                    for arm in ("I0", "I1", "I2")
                },
            }
        )
    return report


def source_result_summary(
    rows: list[dict[str, Any]], source_target: str
) -> dict[str, Any]:
    source_scores = [source_specific_score(row, source_target) for row in rows]
    return {
        "rows": len(rows),
        "row_ids": sorted({row["row_id"] for row in rows}),
        "source_record_target": source_target,
        "source_record_any_exact": any(score["exact"] for score in source_scores),
        "source_record_all_exact": bool(rows)
        and all(score["exact"] for score in source_scores),
        "source_record_best_grapheme_cluster_error_rate": min(
            (score["grapheme_cluster_error_rate"] for score in source_scores),
            default=None,
        ),
        "benchmark_group_any_exact": any(row["normalized_exact"] for row in rows),
        "benchmark_group_all_exact": bool(rows)
        and all(row["normalized_exact"] for row in rows),
        "benchmark_group_best_grapheme_cluster_error_rate": min(
            (row["grapheme_cluster_error_rate"] for row in rows), default=None
        ),
        "predictions": sorted({row["normalized_prediction"] for row in rows}),
        "accepted_references": sorted(
            {reference for row in rows for reference in row["accepted_references"]}
        ),
        "failure_diagnostic_labels": sorted(
            {label for row in rows for label in row["failure_diagnostic_labels"]}
        ),
        "whole_prediction_is_c0_target_count": sum(
            row["whole_prediction_is_c0_target"] for row in rows
        ),
        "all_prediction_units_are_c0_units_count": sum(
            row["all_prediction_units_are_c0_units"] for row in rows
        ),
    }


def build_source_record_outcomes(
    source_profiles: dict[str, dict[str, Any]],
    rows: list[dict[str, Any]],
    context_contrasts: list[dict[str, Any]],
    arm_disagreements: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows_by_source: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        for source_id in row["source_record_ids"]:
            rows_by_source[source_id].append(row)
    contrast_by_source: defaultdict[str, dict[str, str]] = defaultdict(dict)
    for contrast in context_contrasts:
        contrast_by_source[contrast["source_record_id"]][contrast["arm"]] = contrast[
            "effect_class"
        ]
    disagreement_source_ids = {
        source_id
        for disagreement in arm_disagreements
        for source_id in disagreement["source_record_ids"]
    }

    outcomes = []
    for source_id, source in sorted(source_profiles.items()):
        members = rows_by_source.get(source_id, [])
        if not members:
            raise ValueError(f"source record has no benchmark outcome: {source_id}")
        target = source_record_target(source)
        by_arm_suite = {
            arm: {
                suite: source_result_summary(
                    [
                        row
                        for row in members
                        if row["arm"] == arm and row["suite"] == suite
                    ],
                    target,
                )
                for suite in ("prompt_group", "source_context")
            }
            for arm in ("I0", "I1", "I2")
        }
        source_scores = [source_specific_score(row, target) for row in members]
        any_exact = any(score["exact"] for score in source_scores)
        all_exact = all(score["exact"] for score in source_scores)
        best_gcer = min(score["grapheme_cluster_error_rate"] for score in source_scores)
        benchmark_group_any_exact = any(row["normalized_exact"] for row in members)
        benchmark_group_all_exact = all(row["normalized_exact"] for row in members)
        initialization_sensitive = source_id in disagreement_source_ids
        context_effects = dict(sorted(contrast_by_source[source_id].items()))
        context_sensitive = any(
            effect
            not in {
                "both_exact",
                "same_nonexact_prediction",
            }
            for effect in context_effects.values()
        )
        max_reference_subwords = max(
            row["minimum_reference_subword_count"] for row in members
        )
        max_reused_prediction_rows = max(
            row["prediction_population_count_within_arm"] for row in members
        )

        reasons = []
        if not any_exact:
            reasons.append("no_exact_result_in_any_arm_or_suite")
        elif not all_exact:
            reasons.append("exact_result_not_stable_across_all_arm_suite_memberships")
        if not any_exact and best_gcer <= float(
            QUALITATIVE_REVIEW_POLICY["near_surface_gcer_maximum"]
        ):
            reasons.append("near_surface_failure")
        if initialization_sensitive:
            reasons.append("initialization_sensitive_output")
        if context_sensitive:
            reasons.append("definition_conditioning_sensitive_output")
        if any(row["whole_prediction_is_c0_target"] for row in members):
            reasons.append("complete_c0_target_replay_observed")
        if all(row["all_prediction_units_are_c0_units"] for row in members):
            reasons.append("all_outputs_confined_to_c0_whitespace_unit_inventory")
        if max_reference_subwords >= int(
            QUALITATIVE_REVIEW_POLICY["high_reference_subword_minimum"]
        ):
            reasons.append("high_reference_tokenizer_fertility")
        if max_reused_prediction_rows >= int(
            QUALITATIVE_REVIEW_POLICY["reused_prediction_population_minimum"]
        ):
            reasons.append("high_frequency_reused_prediction")
        if benchmark_group_any_exact and not any_exact:
            reasons.append("benchmark_group_match_without_source_record_match")
        structural = source.get("structuralFeatures") or {}
        grouping = source.get("grouping") or {}
        if structural.get("reduplicationSurfaceCandidate"):
            reasons.append("reduplication_surface_candidate")
        if int(grouping.get("promptDistinctTargetCount") or 0) > 1:
            reasons.append("source_prompt_has_multiple_recorded_targets")
        if int(grouping.get("headwordSourceRecordCount") or 0) > 1:
            reasons.append("headword_has_multiple_source_records")

        if any_exact and not all_exact:
            priority_band = "01_exact_instability"
        elif not any_exact and best_gcer <= float(
            QUALITATIVE_REVIEW_POLICY["near_surface_gcer_maximum"]
        ):
            priority_band = "02_near_surface_failure"
        elif initialization_sensitive or context_sensitive:
            priority_band = "03_conditioning_sensitive_failure"
        elif any(row["whole_prediction_is_c0_target"] for row in members):
            priority_band = "04_c0_replay_failure"
        elif not any_exact:
            priority_band = "05_other_failure"
        else:
            priority_band = "06_stable_exact"

        outcomes.append(
            {
                "source_record_id": source_id,
                "source_record_sha256": source.get("sourceRecordSha256"),
                "census_record_id": source.get("censusRecordId"),
                "source_prompt_candidate": source.get("sourcePromptCandidate"),
                "source_target_candidate": source.get("sourceTargetCandidate"),
                "source_record_target_normalized": target,
                "part_of_speech": source.get("partOfSpeech"),
                "structural_stratum": source.get("structuralStratum"),
                "structural_features": structural,
                "grouping": grouping,
                "blocker_codes": source.get("blockerCodes") or [],
                "review_dependencies": source.get("reviewDependencies") or {},
                "evidence_coverage": source.get("evidenceCoverage") or {},
                "training_eligibility": source.get("trainingEligibility"),
                "benchmark_disposition": source.get("benchmarkDisposition"),
                "results": by_arm_suite,
                "source_record_any_exact": any_exact,
                "source_record_all_arm_suite_memberships_exact": all_exact,
                "source_record_best_grapheme_cluster_error_rate": best_gcer,
                "benchmark_group_any_exact": benchmark_group_any_exact,
                "benchmark_group_all_arm_suite_memberships_exact": (
                    benchmark_group_all_exact
                ),
                "initialization_sensitive": initialization_sensitive,
                "context_effects": context_effects,
                "context_sensitive": context_sensitive,
                "maximum_reference_subword_count": max_reference_subwords,
                "maximum_reused_prediction_population_count": (
                    max_reused_prediction_rows
                ),
                "review_priority_band": priority_band,
                "review_reasons": sorted(set(reasons)),
                "review_policy": QUALITATIVE_REVIEW_POLICY,
                "claim_limit": (
                    "This row inventories all Stage-I reconstruction outcomes for one "
                    "source record. Priority and sensitivity labels organize review; "
                    "they do not identify a linguistic cause or authorize training."
                ),
            }
        )
    outcomes.sort(
        key=lambda row: (
            row["review_priority_band"],
            row["source_record_best_grapheme_cluster_error_rate"],
            row["source_record_id"],
        )
    )
    return outcomes


def build_hypothesis_matrix(
    rows: list[dict[str, Any]],
    source_profiles: dict[str, dict[str, Any]],
    context_summary: dict[str, Any],
    pairwise_identity: dict[str, Any],
    arm_disagreements: list[dict[str, Any]],
    orthographic_report: list[dict[str, Any]],
) -> dict[str, Any]:
    pos_counts = Counter(
        str((profile.get("partOfSpeech") or {}).get("status") or "(missing)")
        for profile in source_profiles.values()
    )
    source_layer_counts = Counter(
        str(profile.get("sourceLayer") or "(missing)")
        for profile in source_profiles.values()
    )
    structural_counts = Counter(
        str(profile.get("structuralStratum") or "(missing)")
        for profile in source_profiles.values()
    )
    return {
        "schema_version": 1,
        "status": "DESCRIPTIVE_HYPOTHESES_NOT_CAUSAL_ADJUDICATIONS",
        "population_scope": (
            "Complete declared 3,016-row internal reconstruction census; rows are "
            "clustered by 1,684 source records and are not a random sample of future "
            "queries."
        ),
        "hypotheses": [
            {
                "hypothesis_id": "H1_documented_C0_target_exposure",
                "question": (
                    "Is reconstruction behavior associated with whether an accepted "
                    "reference occurs as a complete target in C0?"
                ),
                "testable": True,
                "descriptive_contrasts": {
                    arm: grouped_summary(
                        [row for row in rows if row["arm"] == arm],
                        "accepted_reference_is_c0_target",
                    )
                    for arm in ("I0", "I1", "I2")
                },
            },
            {
                "hypothesis_id": "H2_reference_tokenizer_fertility",
                "question": (
                    "Is reconstruction behavior associated with minimum accepted-"
                    "reference subword count?"
                ),
                "testable": True,
                "descriptive_contrasts": {
                    arm: grouped_summary(
                        [row for row in rows if row["arm"] == arm],
                        "minimum_reference_subword_bucket",
                    )
                    for arm in ("I0", "I1", "I2")
                },
            },
            {
                "hypothesis_id": "H3_source_grouping_and_ambiguity",
                "question": (
                    "Is behavior associated with source-record grouping and "
                    "unadjudicated ambiguity strata?"
                ),
                "testable": len(structural_counts) > 1,
                "source_record_counts": dict(sorted(structural_counts.items())),
                "descriptive_contrasts": {
                    arm: grouped_summary_multi(
                        [row for row in rows if row["arm"] == arm],
                        "source_structural_strata",
                    )
                    for arm in ("I0", "I1", "I2")
                },
            },
            {
                "hypothesis_id": "H4_definition_conditioning",
                "question": (
                    "Does adding the recorded source definition change output or "
                    "surface error for the same source record?"
                ),
                "testable": True,
                "descriptive_contrasts": context_summary,
            },
            {
                "hypothesis_id": "H5_initialization_sensitivity",
                "question": (
                    "Do the three language-token initializations produce different "
                    "token sequences under otherwise paired conditions?"
                ),
                "testable": True,
                "rows_with_any_arm_disagreement": len(arm_disagreements),
                "pairwise_token_identity": pairwise_identity,
            },
            {
                "hypothesis_id": "H6_recurring_orthographic_terminal_strings",
                "question": (
                    "Are errors concentrated in mechanically discovered recurring "
                    "terminal grapheme-string clusters?"
                ),
                "testable": bool(orthographic_report),
                "cluster_count": len(orthographic_report),
                "artifact": "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl",
            },
            {
                "hypothesis_id": "H7_source_part_of_speech",
                "question": "Is behavior associated with source-provided part of speech?",
                "testable": len(pos_counts) > 1
                and any(value != "not_provided_by_source" for value in pos_counts),
                "source_record_counts": dict(sorted(pos_counts.items())),
                "limitation": (
                    "No part of speech is inferred. If the source provides no "
                    "adjudicated POS variation, this contrast is explicitly not "
                    "testable."
                ),
            },
        ],
        "source_inventory_limits": {
            "part_of_speech_status_counts": dict(sorted(pos_counts.items())),
            "source_layer_counts": dict(sorted(source_layer_counts.items())),
            "structural_stratum_counts": dict(sorted(structural_counts.items())),
        },
        "interpretation": (
            "The matrix exposes predefined descriptive contrasts. It does not accept "
            "or reject a causal explanation, infer a grammatical category, or turn "
            "model output into language evidence."
        ),
    }


def slices(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "by_suite": grouped_summary(rows, "suite"),
        "by_exposure_class": grouped_summary(rows, "exposure_class"),
        "by_ambiguity_status": grouped_summary(rows, "ambiguity_status"),
        "by_prompt_token_bucket": grouped_summary(rows, "prompt_token_bucket"),
        "by_reference_grapheme_bucket": grouped_summary(
            rows, "reference_grapheme_bucket"
        ),
        "by_reference_whitespace_unit_bucket": grouped_summary(
            rows, "reference_whitespace_unit_bucket"
        ),
        "by_minimum_reference_subword_bucket": grouped_summary(
            rows, "minimum_reference_subword_bucket"
        ),
        "by_prompt_punctuation_profile": grouped_summary(
            rows, "prompt_punctuation_profile"
        ),
        "by_reference_punctuation_profile": grouped_summary(
            rows, "reference_punctuation_profile"
        ),
        "by_structural_strata": grouped_summary(rows, "structural_strata_key"),
        "by_surface_class": grouped_summary(rows, "surface_class"),
        "by_grapheme_edit_profile": grouped_summary(rows, "grapheme_edit_profile"),
        "by_outside_reference_grapheme_status": grouped_summary(
            rows, "has_outside_reference_graphemes"
        ),
        "by_reference_c0_membership": grouped_summary(
            rows, "accepted_reference_is_c0_target"
        ),
        "by_source_structural_stratum": grouped_summary_multi(
            rows, "source_structural_strata"
        ),
        "by_source_blocker_code": grouped_summary_multi(rows, "source_blocker_codes"),
        "by_source_review_kind": grouped_summary_multi(rows, "source_review_kinds"),
        "by_source_pos_status": grouped_summary_multi(rows, "source_pos_statuses"),
        "by_source_pos_label": grouped_summary_multi(rows, "source_pos_labels"),
        "by_source_target_length_bucket": grouped_summary_multi(
            rows, "source_target_length_buckets"
        ),
        "by_source_target_token_bucket": grouped_summary_multi(
            rows, "source_target_token_buckets"
        ),
        "by_source_prompt_token_bucket": grouped_summary_multi(
            rows, "source_prompt_token_buckets"
        ),
        "by_source_prompt_begins_with_article": grouped_summary(
            rows, "source_prompt_begins_with_article_any"
        ),
        "by_source_reduplication_surface_candidate": grouped_summary(
            rows, "source_reduplication_surface_candidate_any"
        ),
        "by_source_identity_mapping_candidate": grouped_summary(
            rows, "source_identity_mapping_candidate_any"
        ),
        "by_source_definition_segment_count": grouped_summary(
            rows, "source_definition_segment_count_max_bucket"
        ),
        "by_source_headword_record_count": grouped_summary(
            rows, "source_headword_record_count_max_bucket"
        ),
        "by_source_prompt_record_count": grouped_summary(
            rows, "source_prompt_record_count_max_bucket"
        ),
        "by_source_distinct_target_count": grouped_summary(
            rows, "source_prompt_distinct_target_count_max_bucket"
        ),
        "by_source_contemporary_exact_evidence_count": grouped_summary(
            rows, "source_contemporary_exact_evidence_links_total_bucket"
        ),
        "by_source_contemporary_review_candidate_count": grouped_summary(
            rows, "source_contemporary_review_candidate_links_total_bucket"
        ),
        "by_source_historical_crosswalk_candidate_count": grouped_summary(
            rows, "source_historical_crosswalk_candidates_total_bucket"
        ),
        "by_reference_orthographic_suffix_cluster": grouped_summary_multi(
            rows, "reference_orthographic_suffix_cluster_labels"
        ),
    }


def verify_component(
    program_root: Path, component: dict[str, Any]
) -> list[dict[str, Any]]:
    path = program_root / component["path"]
    if sha256_file(path) != component["sha256"]:
        raise ValueError(f"component hash mismatch: {path}")
    rows = read_jsonl(path)
    if len(rows) != int(component["rows"]):
        raise ValueError(f"component row-count mismatch: {path}")
    return rows


def main() -> None:
    args = parse_args()
    contract_path = args.contract.expanduser().resolve()
    program_root = args.program_root.expanduser().resolve()
    run_root = args.run_root.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = read_json(contract_path)
    contract_sha256 = sha256_file(contract_path)
    source_profiles, source_census_identity = load_current_source_profiles(
        program_root,
        args.lexical_census_manifest,
        args.lexical_census_manifest_sha256,
    )
    if sha256_file(run_root / "CONTRACT.json") != contract_sha256:
        raise ValueError("run/contract identity mismatch")
    run_complete = read_json(run_root / "RUN-COMPLETE.json")
    result = read_json(run_root / "RESULT.json")
    if run_complete.get("status") != "PASS":
        raise ValueError("census run is not complete")
    if result.get("status") != "PASS_COMPLETE_LOCAL_STAGE_I_CENSUS":
        raise ValueError("census result status is not complete")
    run_identity = verify_checksum_inventory(run_root)

    benchmark_by_id: dict[str, tuple[str, dict[str, Any]]] = {}
    for component in contract["suites"]:
        for row in verify_component(program_root, component):
            row_id = row["rowId"]
            if row_id in benchmark_by_id:
                raise ValueError(f"duplicate benchmark row: {row_id}")
            benchmark_by_id[row_id] = (component["name"], row)
    if len(benchmark_by_id) != contract["evaluation"]["required_rows"]:
        raise ValueError("benchmark population is incomplete")
    benchmark_source_ids = {
        source_id
        for _, benchmark in benchmark_by_id.values()
        for source_id in benchmark.get("sourceRecordIds") or []
    }
    if benchmark_source_ids != set(source_profiles):
        raise ValueError(
            "benchmark/source-census population mismatch: "
            f"benchmark_only={sorted(benchmark_source_ids - set(source_profiles))[:20]}, "
            f"census_only={sorted(set(source_profiles) - benchmark_source_ids)[:20]}"
        )
    orthographic_families = discover_orthographic_suffix_clusters(
        benchmark["acceptedReferences"] for _, benchmark in benchmark_by_id.values()
    )

    exposure_component = contract["exposure_ledger"]
    exposure_path = program_root / exposure_component["path"]
    if sha256_file(exposure_path) != exposure_component["sha256"]:
        raise ValueError("exposure ledger hash mismatch")
    exposures = {
        row["benchmark_row_id"]: row
        for row in read_jsonl(exposure_path)
        if row.get("population") == exposure_component["population"]
    }
    if set(exposures) != set(benchmark_by_id):
        raise ValueError("exposure/benchmark population mismatch")

    matrix_path = program_root / contract["parent_matrix"]["path"]
    if sha256_file(matrix_path) != contract["parent_matrix"]["sha256"]:
        raise ValueError("parent matrix hash mismatch")
    matrix = read_json(matrix_path)
    schedule_component = matrix["arms"]["I0"]
    schedule_path = program_root / schedule_component["schedule_file"]
    if sha256_file(schedule_path) != schedule_component["schedule_sha256"]:
        raise ValueError("C0 schedule hash mismatch")
    schedule_rows = read_jsonl(schedule_path)
    c0_targets = {normalize(row["output_text"]) for row in schedule_rows}
    c0_units = {unit for target in c0_targets for unit in target.split()}

    diagnostics: list[dict[str, Any]] = []
    for arm in ("I0", "I1", "I2"):
        predictions_path = run_root / "arms" / arm / "step-400" / "PREDICTIONS.jsonl"
        predictions = read_jsonl(predictions_path)
        if len(predictions) != len(benchmark_by_id):
            raise ValueError(f"prediction population is incomplete: {arm}")
        seen: set[str] = set()
        for prediction in predictions:
            row_id = prediction["row_id"]
            if row_id in seen or row_id not in benchmark_by_id:
                raise ValueError(f"invalid prediction row: {arm}:{row_id}")
            seen.add(row_id)
            suite, benchmark = benchmark_by_id[row_id]
            diagnostics.append(
                enrich_prediction(
                    arm,
                    suite,
                    benchmark,
                    prediction,
                    exposures[row_id],
                    c0_targets,
                    c0_units,
                    source_profiles,
                    orthographic_families,
                )
            )
        if seen != set(benchmark_by_id):
            raise ValueError(f"missing prediction rows: {arm}")
    diagnostics = annotate_collapse(diagnostics)
    diagnostics.sort(key=lambda row: (row["arm"], row["suite"], row["row_id"]))
    context_contrasts = build_context_contrasts(diagnostics, source_profiles)
    arm_disagreements = build_arm_disagreements(diagnostics)
    collapse = build_collapse_report(diagnostics)
    failures = build_failure_report(diagnostics)
    orthographic_report = build_orthographic_family_report(
        diagnostics, orthographic_families
    )
    qualitative_review_queue = build_source_record_outcomes(
        source_profiles, diagnostics, context_contrasts, arm_disagreements
    )
    source_record_outcomes = sorted(
        qualitative_review_queue, key=lambda row: row["source_record_id"]
    )

    context_summary = {}
    for arm in ("I0", "I1", "I2"):
        arm_rows = [row for row in context_contrasts if row["arm"] == arm]
        context_summary[arm] = {
            "rows": len(arm_rows),
            "effect_class_counts": dict(
                sorted(Counter(row["effect_class"] for row in arm_rows).items())
            ),
            "mean_context_minus_prompt_source_record_gcer": mean(
                arm_rows, "context_minus_prompt_source_record_gcer"
            ),
        }
    pairwise_identity = pairwise_arm_identity(diagnostics)
    hypothesis_matrix = build_hypothesis_matrix(
        diagnostics,
        source_profiles,
        context_summary,
        pairwise_identity,
        arm_disagreements,
        orthographic_report,
    )
    summary = {
        "schema_version": 1,
        "analysis_id": "wbv-v1-stage-i-full-census-failure-analysis-v1.3.0",
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
            "grapheme_engine": {
                "package": "regex",
                "version": regex.__version__,
                "pattern": r"\X",
            },
        },
        "status": "PASS_COMPLETE_STAGE_I_FULL_CENSUS_FAILURE_ANALYSIS",
        "source_run_completed_at": run_complete.get("completed_at"),
        "contract": {
            "path": str(contract_path),
            "sha256": contract_sha256,
        },
        "run_root": str(run_root),
        "run_identity": run_identity,
        "lexical_candidate_census": source_census_identity,
        "rows_per_arm": len(benchmark_by_id),
        "unique_source_records": len(source_profiles),
        "total_row_diagnostics": len(diagnostics),
        "c0_schedule": {
            "path": str(schedule_path),
            "sha256": schedule_component["schedule_sha256"],
            "rows": len(schedule_rows),
            "unique_complete_targets": len(c0_targets),
            "unique_whitespace_units": len(c0_units),
        },
        "arms": {
            arm: {
                "overall": summarize([row for row in diagnostics if row["arm"] == arm]),
                "slices": slices([row for row in diagnostics if row["arm"] == arm]),
            }
            for arm in ("I0", "I1", "I2")
        },
        "pairwise_arm_token_identity": pairwise_identity,
        "rows_with_any_arm_disagreement": len(arm_disagreements),
        "source_context_contrasts": context_summary,
        "source_record_review_priority_counts": dict(
            sorted(
                Counter(
                    row["review_priority_band"] for row in qualitative_review_queue
                ).items()
            )
        ),
        "orthographic_surface_family_contract": orthographic_families["contract"],
        "orthographic_surface_family_count": len(orthographic_report),
        "frozen_stage_i_selection": result["selection"],
        "failure_diagnostic_artifact": "FAILURE-DIAGNOSTICS.jsonl",
        "prediction_collapse_artifact": "PREDICTION-COLLAPSE.jsonl",
        "row_diagnostic_artifact": "ROW-DIAGNOSTICS.jsonl",
        "source_context_contrast_artifact": "SOURCE-CONTEXT-CONTRASTS.jsonl",
        "arm_disagreement_artifact": "ARM-DISAGREEMENTS.jsonl",
        "source_record_outcome_artifact": "SOURCE-RECORD-OUTCOMES.jsonl",
        "qualitative_review_queue_artifact": "QUALITATIVE-REVIEW-QUEUE.jsonl",
        "orthographic_surface_family_artifact": ("ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl"),
        "hypothesis_matrix_artifact": "HYPOTHESIS-MATRIX.json",
        "claim_limit": CLAIM_LIMIT,
        "alignment_claim_limit": ALIGNMENT_CLAIM_LIMIT,
        "source_join_claim_limit": SOURCE_JOIN_CLAIM_LIMIT,
    }

    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "SUMMARY.json", summary)
    write_jsonl_atomic(output_dir / "ROW-DIAGNOSTICS.jsonl", diagnostics)
    write_jsonl_atomic(output_dir / "FAILURE-DIAGNOSTICS.jsonl", failures)
    write_jsonl_atomic(output_dir / "PREDICTION-COLLAPSE.jsonl", collapse)
    write_jsonl_atomic(output_dir / "SOURCE-CONTEXT-CONTRASTS.jsonl", context_contrasts)
    write_jsonl_atomic(output_dir / "ARM-DISAGREEMENTS.jsonl", arm_disagreements)
    write_jsonl_atomic(
        output_dir / "SOURCE-RECORD-OUTCOMES.jsonl", source_record_outcomes
    )
    write_jsonl_atomic(
        output_dir / "QUALITATIVE-REVIEW-QUEUE.jsonl", qualitative_review_queue
    )
    write_jsonl_atomic(
        output_dir / "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl", orthographic_report
    )
    write_json_atomic(output_dir / "HYPOTHESIS-MATRIX.json", hypothesis_matrix)
    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "OUTPUT-SHA256SUMS").write_text(
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

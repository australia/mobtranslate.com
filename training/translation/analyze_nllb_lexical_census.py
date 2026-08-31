#!/usr/bin/env python3
"""Analyze complete NLLB lexical censuses and emit evidence-bound feedback."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import statistics
import tempfile
import unicodedata
from typing import Any, Iterable


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

SURFACE_FAMILY_CONTRACT = {
    "family_kind": "orthographic_terminal_string_cluster",
    "minimum_suffix_characters": 3,
    "maximum_suffix_characters": 10,
    "minimum_stem_characters": 2,
    "minimum_unique_reference_surfaces": 8,
    "minimum_preceding_character_types": 3,
    "reference_scope": "normalized_single_whitespace_token_accepted_references",
    "interpretation": (
        "Clusters are recurring terminal character strings discovered from the frozen "
        "accepted-reference inventory. They are diagnostic orthographic strata, not "
        "morphemes, inflections, grammatical categories, or evidence for a rule."
    ),
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(value: Any) -> str:
    text = (
        unicodedata.normalize("NFKC", str(value or "")).translate(QUOTE_FOLD).casefold()
    )
    return " ".join(text.split())


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"expected an object at {path}:{line_number}")
            rows.append(value)
    return rows


def resolve_program_path(program_root: Path, value: str, label: str) -> Path:
    path = (program_root / value).resolve()
    try:
        path.relative_to(program_root)
    except ValueError as error:
        raise ValueError(f"{label} escapes program root: {value}") from error
    return path


def verify_jsonl_component(
    program_root: Path, component: dict[str, Any], label: str
) -> tuple[Path, list[dict[str, Any]]]:
    path = resolve_program_path(program_root, component["path"], label)
    if sha256(path) != component["sha256"]:
        raise ValueError(f"{label} hash mismatch: {path}")
    rows = read_jsonl(path)
    declared_rows = component.get("rows")
    if declared_rows is not None and len(rows) != int(declared_rows):
        raise ValueError(
            f"{label} row mismatch: declared={declared_rows}, observed={len(rows)}"
        )
    return path, rows


def verify_current_edition(
    program_root: Path, pointer_path: Path, artifact: str
) -> dict[str, Any]:
    pointer_path = pointer_path.resolve()
    pointer = read_json(pointer_path)
    if pointer.get("artifact") != artifact:
        raise ValueError(
            f"expected {artifact} pointer, observed {pointer.get('artifact')}: {pointer_path}"
        )
    manifest_path = resolve_program_path(
        program_root, pointer["manifest_path"], f"{artifact} manifest"
    )
    if sha256(manifest_path) != pointer["manifest_sha256"]:
        raise ValueError(f"{artifact} current-manifest hash mismatch: {manifest_path}")
    manifest = read_json(manifest_path)
    if manifest.get("edition_id") != pointer.get("current_edition_id"):
        raise ValueError(f"{artifact} current-edition ID mismatch")
    lineage: list[dict[str, Any]] = []
    lineage_path = manifest_path
    lineage_manifest = manifest
    visited: set[Path] = set()
    while True:
        if lineage_path in visited:
            raise ValueError(f"{artifact} edition lineage contains a cycle")
        visited.add(lineage_path)
        lineage.append(
            {
                "manifest_path": str(lineage_path),
                "manifest_sha256": sha256(lineage_path),
                "manifest": lineage_manifest,
            }
        )
        parent = lineage_manifest.get("parent_manifest")
        if parent is None:
            break
        if (
            not isinstance(parent, dict)
            or not parent.get("path")
            or not parent.get("sha256")
        ):
            raise ValueError(
                f"{artifact} edition has an invalid parent declaration: {lineage_path}"
            )
        parent_path = resolve_program_path(
            program_root, parent["path"], f"{artifact} parent manifest"
        )
        observed_parent_hash = sha256(parent_path)
        if observed_parent_hash != parent["sha256"]:
            raise ValueError(f"{artifact} parent-manifest hash mismatch: {parent_path}")
        inheritance = lineage_manifest.get("component_inheritance") or {}
        inherited_parent_hash = inheritance.get("parent_manifest_sha256")
        if (
            inherited_parent_hash is not None
            and inherited_parent_hash != parent["sha256"]
        ):
            raise ValueError(
                f"{artifact} component-inheritance parent hash mismatch: {lineage_path}"
            )
        lineage_path = parent_path
        lineage_manifest = read_json(parent_path)
    verified_components: dict[str, dict[str, Any]] = {}
    for key, component in sorted((manifest.get("components") or {}).items()):
        component_path = resolve_program_path(
            program_root, component["path"], f"{artifact} component {key}"
        )
        if sha256(component_path) != component["sha256"]:
            raise ValueError(f"{artifact} component hash mismatch: {component_path}")
        declared_rows = component.get("rows")
        observed_rows = None
        if declared_rows is not None:
            observed_rows = len(read_jsonl(component_path))
            if observed_rows != int(declared_rows):
                raise ValueError(
                    f"{artifact} component row mismatch for {key}: "
                    f"declared={declared_rows}, observed={observed_rows}"
                )
        verified_components[key] = {
            "path": component["path"],
            "sha256": component["sha256"],
            "rows": declared_rows,
        }
    return {
        "pointer_path": str(pointer_path),
        "pointer_sha256": sha256(pointer_path),
        "pointer": pointer,
        "manifest_path": manifest_path,
        "manifest": manifest,
        "lineage": lineage,
        "verified_components": verified_components,
    }


def resolve_edition_checkpoint(
    edition: dict[str, Any], checkpoint_key: str
) -> dict[str, Any]:
    for distance, lineage_entry in enumerate(edition["lineage"]):
        manifest = lineage_entry["manifest"]
        checkpoint = manifest.get(checkpoint_key)
        if checkpoint is None:
            continue
        if not isinstance(checkpoint, dict):
            raise ValueError(
                f"edition checkpoint {checkpoint_key} is not an object in "
                f"{lineage_entry['manifest_path']}"
            )
        return {
            "checkpoint": checkpoint,
            "resolution": (
                "declared_on_current_edition"
                if distance == 0
                else "nearest_hash_verified_ancestor_declaration"
            ),
            "ancestor_distance": distance,
            "declaring_edition_id": manifest.get("edition_id"),
            "declaring_manifest_path": lineage_entry["manifest_path"],
            "declaring_manifest_sha256": lineage_entry["manifest_sha256"],
        }
    raise ValueError(
        f"edition lineage has no declaration for checkpoint {checkpoint_key}"
    )


def verify_lexical_census(
    program_root: Path, manifest_path: Path
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    manifest_path = manifest_path.resolve()
    manifest = read_json(manifest_path)
    records_component = (manifest.get("outputs") or {}).get("records")
    if not isinstance(records_component, dict):
        raise ValueError("lexical census manifest has no records component")
    _, rows = verify_jsonl_component(
        program_root, records_component, "lexical census records"
    )
    by_source: dict[str, dict[str, Any]] = {}
    for row in rows:
        source_id = row.get("sourceRecordId")
        if not isinstance(source_id, str) or not source_id:
            raise ValueError("lexical census row is missing sourceRecordId")
        if source_id in by_source:
            raise ValueError(f"duplicate lexical census source record: {source_id}")
        by_source[source_id] = row
    return manifest, by_source


def verify_comparative_lexical_inventory(
    program_root: Path, manifest_path: Path
) -> tuple[
    dict[str, Any],
    dict[str, dict[str, Any]],
    dict[str, list[dict[str, Any]]],
]:
    manifest_path = manifest_path.resolve()
    try:
        manifest_path.relative_to(program_root)
    except ValueError as error:
        raise ValueError(
            f"comparative lexical manifest escapes program root: {manifest_path}"
        ) from error
    manifest = read_json(manifest_path)
    components = manifest.get("components") or {}
    required = {"concepts", "forms", "dictionary_crosswalk_candidates"}
    if not required <= set(components):
        raise ValueError("comparative lexical inventory is missing required components")

    verified: dict[str, dict[str, Any]] = {}
    component_rows: dict[str, list[dict[str, Any]]] = {}
    for key, component in sorted(components.items()):
        path = (manifest_path.parent / component["path"]).resolve()
        try:
            path.relative_to(program_root)
        except ValueError as error:
            raise ValueError(
                f"comparative lexical component escapes program root: {path}"
            ) from error
        if sha256(path) != component["sha256"]:
            raise ValueError(f"comparative lexical component hash mismatch: {path}")
        observed_bytes = path.stat().st_size
        if component.get("bytes") is not None and observed_bytes != int(
            component["bytes"]
        ):
            raise ValueError(
                f"comparative lexical component byte mismatch for {key}: "
                f"declared={component['bytes']}, observed={observed_bytes}"
            )
        rows: list[dict[str, Any]] = []
        if component.get("rows") is not None:
            rows = read_jsonl(path)
            if len(rows) != int(component["rows"]):
                raise ValueError(
                    f"comparative lexical component row mismatch for {key}: "
                    f"declared={component['rows']}, observed={len(rows)}"
                )
        component_rows[key] = rows
        verified[key] = {
            "path": str(path),
            "sha256": component["sha256"],
            "rows": component.get("rows"),
            "bytes": observed_bytes,
        }

    counts = manifest.get("counts") or {}
    expected_counts = {
        "concepts": len(component_rows["concepts"]),
        "forms": len(component_rows["forms"]),
        "crosswalk_candidates": len(component_rows["dictionary_crosswalk_candidates"]),
    }
    for key, observed in expected_counts.items():
        if int(counts.get(key, -1)) != observed:
            raise ValueError(
                f"comparative lexical count mismatch for {key}: "
                f"declared={counts.get(key)}, observed={observed}"
            )
    for key in (
        "accepted_dictionary_rows",
        "accepted_grammar_rows",
        "benchmark_reference_rows",
        "controlled_synthetic_sentence_pairs_authorized",
        "training_eligible_rows",
    ):
        if int(counts.get(key, -1)) != 0:
            raise ValueError(
                f"comparative lexical inventory opens forbidden use: {key}"
            )

    candidates = component_rows["dictionary_crosswalk_candidates"]
    candidate_ids: set[str] = set()
    by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in candidates:
        candidate_id = row.get("crosswalk_candidate_id")
        source_id = row.get("dictionary_source_record_id")
        if not isinstance(candidate_id, str) or not candidate_id:
            raise ValueError("comparative lexical candidate is missing its ID")
        if candidate_id in candidate_ids:
            raise ValueError(f"duplicate comparative lexical candidate: {candidate_id}")
        candidate_ids.add(candidate_id)
        if not isinstance(source_id, str) or not source_id:
            raise ValueError(
                f"comparative lexical candidate {candidate_id} has no source record"
            )
        forbidden_true = {
            key
            for key in (
                "dictionary_acceptance",
                "benchmark_reference_eligible",
                "synthetic_sentence_pair_eligible",
                "training_eligible",
            )
            if bool(row.get(key))
        }
        if forbidden_true:
            raise ValueError(
                f"comparative lexical candidate {candidate_id} opens forbidden use: "
                f"{sorted(forbidden_true)}"
            )
        if row.get("lexical_identity_status") != "review_candidate_not_accepted":
            raise ValueError(
                f"comparative lexical candidate {candidate_id} has an accepted identity"
            )
        if row.get("sense_relation_status") != "review_candidate_not_accepted":
            raise ValueError(
                f"comparative lexical candidate {candidate_id} has an accepted sense"
            )
        if row.get("substitutability_status") != "unresolved":
            raise ValueError(
                f"comparative lexical candidate {candidate_id} resolves substitutability"
            )
        by_source[source_id].append(row)
    return manifest, verified, dict(by_source)


def current_entry_candidate_ids(row: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in ("exactCurrentEntryCandidateId", "targetEntryCandidateId"):
        scalar = row.get(key)
        if isinstance(scalar, str) and scalar:
            values.append(scalar)
    for key in (
        "exactCurrentEntryCandidateIds",
        "exactCurrentEntryCandidates",
        "targetEntryCandidateIds",
    ):
        for value in row.get(key) or []:
            if isinstance(value, str) and value:
                values.append(value)
            elif isinstance(value, dict):
                candidate = value.get("entryCandidateId")
                if isinstance(candidate, str) and candidate:
                    values.append(candidate)
    return list(dict.fromkeys(values))


def compact_evidence_signal(
    row: dict[str, Any], component_key: str, join_kind: str
) -> dict[str, Any]:
    relation_values = {
        key: row[key]
        for key in sorted(row)
        if (
            key.endswith("Status")
            or key.endswith("Scope")
            or key in {"diagnosticGlossRelation", "relationStatus", "status"}
        )
        and isinstance(row[key], (str, int, float, bool))
    }
    return {
        "component_key": component_key,
        "evidence_link_id": row.get("evidenceLinkId") or row.get("recordId"),
        "evidence_source_id": row.get("evidenceSourceId") or row.get("sourceId"),
        "join_kind": join_kind,
        "language_attribution_status": row.get("languageAttributionStatus"),
        "pairing_scope": row.get("pairingScope") or row.get("semanticRelationScope"),
        "relations": relation_values,
    }


def build_current_dictionary_joins(
    program_root: Path,
    edition: dict[str, Any],
    census_by_source: dict[str, dict[str, Any]],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    entry_to_source = {
        row["entryCandidateId"]: source_id
        for source_id, row in census_by_source.items()
        if isinstance(row.get("entryCandidateId"), str)
    }
    evidence_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    review_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    evidence_record_to_sources: dict[str, set[str]] = defaultdict(set)
    manifest = edition["manifest"]
    for component_key, component in sorted((manifest.get("components") or {}).items()):
        if "evidencelinks" not in component_key.lower():
            continue
        _, rows = verify_jsonl_component(
            program_root, component, f"dictionary evidence component {component_key}"
        )
        for row in rows:
            joined: set[tuple[str, str]] = set()
            for candidate_id in current_entry_candidate_ids(row):
                source_id = entry_to_source.get(candidate_id)
                if source_id:
                    joined.add((source_id, "exact_current_entry_candidate"))
            for group in row.get("relatedPromptGroups") or []:
                if not isinstance(group, dict):
                    continue
                for source_id in group.get("sourceRecordIds") or []:
                    if source_id in census_by_source:
                        joined.add((source_id, "related_prompt_group"))
            for source_id, join_kind in sorted(joined):
                evidence_by_source[source_id].append(
                    compact_evidence_signal(row, component_key, join_kind)
                )
                record_id = row.get("evidenceLinkId") or row.get("recordId")
                if isinstance(record_id, str) and record_id:
                    evidence_record_to_sources[record_id].add(source_id)

    review_component = (manifest.get("components") or {}).get("reviewQueue")
    if isinstance(review_component, dict):
        _, review_rows = verify_jsonl_component(
            program_root, review_component, "dictionary current review queue"
        )
        for row in review_rows:
            joined_review_sources = {
                source_id
                for source_id in row.get("sourceRecordIds") or []
                if source_id in census_by_source
            }
            for record_id in row.get("evidenceRecordIds") or []:
                if isinstance(record_id, str):
                    joined_review_sources.update(
                        evidence_record_to_sources.get(record_id, set())
                    )
            for source_id in sorted(joined_review_sources):
                review_by_source[source_id].append(
                    {
                        "review_item_id": row.get("reviewItemId"),
                        "review_kind": row.get("reviewKind")
                        or row.get("reviewKey")
                        or "(unspecified)",
                        "status": row.get("status") or "(unspecified)",
                    }
                )
    return dict(evidence_by_source), dict(review_by_source)


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def row_id(row: dict[str, Any]) -> str:
    value = row.get("rowId") or row.get("row_id") or row.get("id")
    if not isinstance(value, str) or not value:
        raise ValueError("row is missing an ID")
    return value


def references(row: dict[str, Any]) -> list[str]:
    values = row.get("acceptedReferences") or row.get("accepted_references") or []
    result = list(
        dict.fromkeys(normalize(value) for value in values if normalize(value))
    )
    if not result:
        raise ValueError(f"row {row_id(row)} has no accepted references")
    return result


def character_ngrams(value: str, size: int = 3) -> set[str]:
    compact = " ".join(normalize(value).split())
    padded = f"^{compact}$"
    if len(padded) <= size:
        return {padded}
    return {padded[index : index + size] for index in range(len(padded) - size + 1)}


def target_profile(references_by_row: Iterable[list[str]]) -> set[str]:
    profile: set[str] = set()
    for values in references_by_row:
        for value in values:
            profile.update(character_ngrams(value))
    return profile


def discover_orthographic_suffix_clusters(
    references_by_row: Iterable[list[str]],
) -> dict[str, Any]:
    """Discover recurring terminal strings without assigning linguistic meaning."""
    reference_sets = [list(values) for values in references_by_row]
    all_surfaces = sorted(
        {
            normalize(value)
            for values in reference_sets
            for value in values
            if normalize(value)
        }
    )
    single_token_surfaces = [value for value in all_surfaces if " " not in value]
    candidate_surfaces: dict[str, set[str]] = defaultdict(set)
    preceding_characters: dict[str, set[str]] = defaultdict(set)
    minimum_suffix = int(SURFACE_FAMILY_CONTRACT["minimum_suffix_characters"])
    maximum_suffix = int(SURFACE_FAMILY_CONTRACT["maximum_suffix_characters"])
    minimum_stem = int(SURFACE_FAMILY_CONTRACT["minimum_stem_characters"])

    for surface in single_token_surfaces:
        upper = min(maximum_suffix, len(surface) - minimum_stem)
        for suffix_length in range(minimum_suffix, upper + 1):
            suffix = surface[-suffix_length:]
            stem = surface[:-suffix_length]
            if not suffix.isalpha() or len(stem) < minimum_stem:
                continue
            candidate_surfaces[suffix].add(surface)
            preceding_characters[suffix].add(stem[-1])

    minimum_support = int(SURFACE_FAMILY_CONTRACT["minimum_unique_reference_surfaces"])
    minimum_boundaries = int(
        SURFACE_FAMILY_CONTRACT["minimum_preceding_character_types"]
    )
    qualified = [
        suffix
        for suffix, surfaces in candidate_surfaces.items()
        if len(surfaces) >= minimum_support
        and len(preceding_characters[suffix]) >= minimum_boundaries
    ]
    qualified.sort(
        key=lambda suffix: (
            -len(suffix),
            -len(candidate_surfaces[suffix]),
            suffix,
        )
    )

    clusters: list[dict[str, Any]] = []
    clusters_by_surface: dict[str, list[str]] = defaultdict(list)
    cluster_labels: dict[str, str] = {}
    for suffix in qualified:
        cluster_id = (
            "orthographic-suffix-"
            + hashlib.sha256(suffix.encode("utf-8")).hexdigest()[:16]
        )
        label = f"suffix:{suffix}"
        surfaces = sorted(candidate_surfaces[suffix])
        cluster_labels[cluster_id] = label
        clusters.append(
            {
                "cluster_id": cluster_id,
                "label": label,
                "family_kind": SURFACE_FAMILY_CONTRACT["family_kind"],
                "terminal_string": suffix,
                "terminal_character_count": len(suffix),
                "unique_reference_surface_count": len(surfaces),
                "unique_preceding_character_count": len(preceding_characters[suffix]),
                "preceding_characters": sorted(preceding_characters[suffix]),
                "reference_surface_sample": surfaces[:20],
                "claim_limit": SURFACE_FAMILY_CONTRACT["interpretation"],
            }
        )
        for surface in surfaces:
            clusters_by_surface[surface].append(cluster_id)

    return {
        "contract": dict(SURFACE_FAMILY_CONTRACT),
        "unique_reference_surfaces": len(all_surfaces),
        "single_token_reference_surfaces": len(single_token_surfaces),
        "excluded_multi_token_reference_surfaces": len(all_surfaces)
        - len(single_token_surfaces),
        "cluster_count": len(clusters),
        "clusters": clusters,
        "cluster_ranks": {
            cluster["cluster_id"]: rank for rank, cluster in enumerate(clusters)
        },
        "clusters_by_surface": {
            surface: cluster_ids
            for surface, cluster_ids in sorted(clusters_by_surface.items())
        },
        "cluster_labels": cluster_labels,
    }


def coverage(items: set[str], inventory: set[str]) -> float:
    return len(items & inventory) / max(1, len(items))


def token_jaccard(left: str, right: str) -> float:
    left_tokens = set(normalize(left).split())
    right_tokens = set(normalize(right).split())
    return len(left_tokens & right_tokens) / max(1, len(left_tokens | right_tokens))


def length_ratio_bucket(value: float) -> str:
    if value < 0.6:
        return "under_0.60"
    if value <= 1.5:
        return "0.60_to_1.50"
    if value <= 3.0:
        return "1.51_to_3.00"
    return "over_3.00"


def coverage_bucket(value: float) -> str:
    if value < 0.25:
        return "0.00_to_0.24"
    if value < 0.50:
        return "0.25_to_0.49"
    if value < 0.75:
        return "0.50_to_0.74"
    return "0.75_to_1.00"


def similarity_bucket(value: float | None) -> str:
    if value is None:
        return "none"
    if value < 0.25:
        return "0.00_to_0.24"
    if value < 0.50:
        return "0.25_to_0.49"
    if value < 0.75:
        return "0.50_to_0.74"
    return "0.75_to_1.00"


def integer_bucket(value: int) -> str:
    if value <= 0:
        return "0"
    if value == 1:
        return "1"
    if value <= 3:
        return "2_to_3"
    if value <= 5:
        return "4_to_5"
    if value <= 8:
        return "6_to_8"
    return "9_plus"


def unique_strings(values: Iterable[Any], missing: str = "(missing)") -> list[str]:
    result = sorted({str(value) for value in values if str(value)})
    return result or [missing]


def source_profile_summary(
    source_ids: list[str],
    census_by_source: dict[str, dict[str, Any]],
    evidence_by_source: dict[str, list[dict[str, Any]]],
    review_by_source: dict[str, list[dict[str, Any]]],
    comparative_by_source: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    profiles = [census_by_source[source_id] for source_id in source_ids]
    structural = [row.get("structuralFeatures") or {} for row in profiles]
    grouping = [row.get("grouping") or {} for row in profiles]
    coverage_rows = [row.get("evidenceCoverage") or {} for row in profiles]
    evidence = [
        item
        for source_id in source_ids
        for item in evidence_by_source.get(source_id, [])
    ]
    reviews = [
        item for source_id in source_ids for item in review_by_source.get(source_id, [])
    ]
    comparative = [
        item
        for source_id in source_ids
        for item in comparative_by_source.get(source_id, [])
    ]
    relation_values = [
        str(value)
        for item in evidence
        for value in (item.get("relations") or {}).values()
        if value is not None
    ]
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
        "source_layers": unique_strings(row.get("sourceLayer") for row in profiles),
        "source_training_eligibilities": unique_strings(
            row.get("trainingEligibility") for row in profiles
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
            int(row.get("contemporaryExactEvidenceLinks") or 0) for row in coverage_rows
        ),
        "source_contemporary_review_candidate_links_total": sum(
            int(row.get("contemporaryReviewCandidateLinks") or 0)
            for row in coverage_rows
        ),
        "source_historical_crosswalk_candidates_total": sum(
            int(row.get("historicalCrosswalkCandidates") or 0) for row in coverage_rows
        ),
        "source_verified_audio_links_total": sum(
            int(row.get("verifiedAudioLinks") or 0) for row in coverage_rows
        ),
        "source_unresolved_image_links_total": sum(
            int(row.get("unresolvedImageLinks") or 0) for row in coverage_rows
        ),
        "current_dictionary_evidence_link_count": len(evidence),
        "current_dictionary_evidence_component_keys": unique_strings(
            item.get("component_key") for item in evidence
        ),
        "current_dictionary_evidence_join_kinds": unique_strings(
            item.get("join_kind") for item in evidence
        ),
        "current_dictionary_language_attribution_statuses": unique_strings(
            item.get("language_attribution_status") for item in evidence
        ),
        "current_dictionary_pairing_scopes": unique_strings(
            item.get("pairing_scope") for item in evidence
        ),
        "current_dictionary_relation_values": unique_strings(relation_values),
        "current_dictionary_review_item_count": len(reviews),
        "current_dictionary_review_kinds": unique_strings(
            item.get("review_kind") for item in reviews
        ),
        "comparative_review_candidate_count": len(comparative),
        "comparative_asjp_form_ids": unique_strings(
            item.get("asjp_form_id") for item in comparative
        ),
        "comparative_concept_ids": unique_strings(
            item.get("concept_id") for item in comparative
        ),
        "comparative_english_relations": unique_strings(
            item.get("english_relation") for item in comparative
        ),
        "comparative_orthography_relations": unique_strings(
            item.get("orthography_relation") for item in comparative
        ),
        "comparative_lexical_identity_statuses": unique_strings(
            item.get("lexical_identity_status") for item in comparative
        ),
        "comparative_max_surface_similarity_casefolded": (
            max(
                float(item["raw_surface_similarity_casefolded"]) for item in comparative
            )
            if comparative
            else None
        ),
        "comparative_best_review_rank": (
            min(int(item["review_rank_within_asjp_form"]) for item in comparative)
            if comparative
            else None
        ),
    }


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    exact = sum(bool(row["accepted_exact"]) for row in rows)
    cer = [float(row["grapheme_cer"]) for row in rows]
    return {
        "rows": len(rows),
        "accepted_exact_count": exact,
        "accepted_exact_percent": 100 * exact / max(1, len(rows)),
        "mean_grapheme_cer": statistics.fmean(cer) if cer else None,
        "mean_target_trigram_coverage": (
            statistics.fmean(float(row["target_trigram_coverage"]) for row in rows)
            if rows
            else None
        ),
    }


def slice_report(rows: list[dict[str, Any]]) -> dict[str, Any]:
    dimensions: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for row in rows:
        scalar_values = {
            "suite_key": row["suite_key"],
            "ambiguity_status": row["ambiguity_status"],
            "edit_error_type": row["edit_error_type"],
            "target_subword_count": integer_bucket(row["target_subword_count"]),
            "reference_count": integer_bucket(row["accepted_reference_count"]),
            "prompt_token_count": integer_bucket(row["prompt_token_count"]),
            "output_length_ratio": length_ratio_bucket(row["output_length_ratio"]),
            "target_trigram_coverage": coverage_bucket(row["target_trigram_coverage"]),
            "exact_target_inventory_collision": str(
                row["exact_target_inventory_collision"]
            ).lower(),
            "reference_hyphen": str(row["reference_has_hyphen"]).lower(),
            "reference_apostrophe": str(row["reference_has_apostrophe"]).lower(),
            "documented_project_training_exposure": row[
                "documented_project_training_exposure"
            ],
            "upstream_nllb_pretraining_exposure": row[
                "upstream_nllb_pretraining_exposure"
            ],
            "evaluation_input_contains_reference_surface": str(
                row["evaluation_input_contains_reference_surface"]
            ).lower(),
            "source_prompt_begins_with_article_any": str(
                row["source_prompt_begins_with_article_any"]
            ).lower(),
            "source_reduplication_surface_candidate_any": str(
                row["source_reduplication_surface_candidate_any"]
            ).lower(),
            "source_definition_segment_count_max": integer_bucket(
                row["source_definition_segment_count_max"]
            ),
            "source_headword_record_count_max": integer_bucket(
                row["source_headword_record_count_max"]
            ),
            "source_prompt_record_count_max": integer_bucket(
                row["source_prompt_record_count_max"]
            ),
            "source_prompt_distinct_target_count_max": integer_bucket(
                row["source_prompt_distinct_target_count_max"]
            ),
            "source_contemporary_exact_evidence_links_total": integer_bucket(
                row["source_contemporary_exact_evidence_links_total"]
            ),
            "source_contemporary_review_candidate_links_total": integer_bucket(
                row["source_contemporary_review_candidate_links_total"]
            ),
            "source_historical_crosswalk_candidates_total": integer_bucket(
                row["source_historical_crosswalk_candidates_total"]
            ),
            "source_verified_audio_links_total": integer_bucket(
                row["source_verified_audio_links_total"]
            ),
            "source_unresolved_image_links_total": integer_bucket(
                row["source_unresolved_image_links_total"]
            ),
            "current_dictionary_evidence_link_count": integer_bucket(
                row["current_dictionary_evidence_link_count"]
            ),
            "current_dictionary_review_item_count": integer_bucket(
                row["current_dictionary_review_item_count"]
            ),
            "comparative_review_candidate_count": integer_bucket(
                row["comparative_review_candidate_count"]
            ),
            "comparative_max_surface_similarity_casefolded": similarity_bucket(
                row["comparative_max_surface_similarity_casefolded"]
            ),
            "comparative_best_review_rank": (
                integer_bucket(row["comparative_best_review_rank"])
                if row["comparative_best_review_rank"] is not None
                else "none"
            ),
            "reference_primary_orthographic_suffix_cluster": row[
                "reference_primary_orthographic_suffix_cluster_label"
            ],
        }
        multi_values = {
            "source_structural_stratum": row["source_structural_strata"],
            "source_blocker_code": row["source_blocker_codes"],
            "source_review_kind": row["source_review_kinds"],
            "source_pos_status": row["source_pos_statuses"],
            "source_layer": row["source_layers"],
            "source_training_eligibility": row["source_training_eligibilities"],
            "source_target_length_bucket": row["source_target_length_buckets"],
            "source_target_token_bucket": row["source_target_token_buckets"],
            "source_prompt_token_bucket": row["source_prompt_token_buckets"],
            "current_dictionary_evidence_component": row[
                "current_dictionary_evidence_component_keys"
            ],
            "current_dictionary_evidence_join_kind": row[
                "current_dictionary_evidence_join_kinds"
            ],
            "current_dictionary_language_attribution": row[
                "current_dictionary_language_attribution_statuses"
            ],
            "current_dictionary_pairing_scope": row[
                "current_dictionary_pairing_scopes"
            ],
            "current_dictionary_relation_value": row[
                "current_dictionary_relation_values"
            ],
            "current_dictionary_review_kind": row["current_dictionary_review_kinds"],
            "comparative_asjp_form_id": row["comparative_asjp_form_ids"],
            "comparative_concept_id": row["comparative_concept_ids"],
            "comparative_english_relation": row["comparative_english_relations"],
            "comparative_orthography_relation": row[
                "comparative_orthography_relations"
            ],
            "comparative_lexical_identity_status": row[
                "comparative_lexical_identity_statuses"
            ],
            "reference_orthographic_suffix_cluster": row[
                "reference_orthographic_suffix_cluster_labels"
            ],
        }
        for dimension, value in scalar_values.items():
            dimensions[dimension][str(value)].append(row)
        for dimension, values in multi_values.items():
            for value in sorted(set(str(item) for item in values)):
                dimensions[dimension][value].append(row)
    return {
        dimension: {value: summarize(items) for value, items in sorted(groups.items())}
        for dimension, groups in sorted(dimensions.items())
    }


def enrich_rows(
    benchmark_rows: list[dict[str, Any]],
    prediction_rows: list[dict[str, Any]],
    profile: set[str],
    target_inventory: set[str],
    lineage_rows: dict[str, dict[str, Any]] | None = None,
    census_by_source: dict[str, dict[str, Any]] | None = None,
    evidence_by_source: dict[str, list[dict[str, Any]]] | None = None,
    review_by_source: dict[str, list[dict[str, Any]]] | None = None,
    comparative_by_source: dict[str, list[dict[str, Any]]] | None = None,
    surface_families: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    predictions = {row_id(row): row for row in prediction_rows}
    if len(predictions) != len(prediction_rows):
        raise ValueError("prediction IDs are not unique")
    expected_ids = [row_id(row) for row in benchmark_rows]
    if set(predictions) != set(expected_ids):
        missing = sorted(set(expected_ids) - set(predictions))[:10]
        extra = sorted(set(predictions) - set(expected_ids))[:10]
        raise ValueError(
            f"prediction/benchmark ID mismatch; missing={missing}, extra={extra}"
        )
    enriched: list[dict[str, Any]] = []
    for benchmark in benchmark_rows:
        identifier = row_id(benchmark)
        prediction_row = predictions[identifier]
        accepted = references(benchmark)
        clusters_by_surface = (surface_families or {}).get("clusters_by_surface") or {}
        cluster_labels = (surface_families or {}).get("cluster_labels") or {}
        reference_cluster_membership = [
            {
                "reference": value,
                "cluster_ids": list(clusters_by_surface.get(value) or []),
            }
            for value in accepted
        ]
        cluster_ranks = (surface_families or {}).get("cluster_ranks") or {}
        reference_cluster_ids = sorted(
            {
                cluster_id
                for membership in reference_cluster_membership
                for cluster_id in membership["cluster_ids"]
            },
            key=lambda cluster_id: (
                int(cluster_ranks.get(cluster_id, len(cluster_ranks))),
                cluster_id,
            ),
        )
        reference_cluster_labels = [
            str(cluster_labels[cluster_id]) for cluster_id in reference_cluster_ids
        ]
        primary_cluster_id = reference_cluster_ids[0] if reference_cluster_ids else None
        prediction = normalize(prediction_row.get("prediction"))
        shortest_reference = min(accepted, key=lambda value: len(value))
        source_prompt = normalize(
            benchmark.get("sourcePrompt")
            or " ".join(benchmark.get("sourcePromptValues") or [])
        )
        output_length_ratio = len(prediction) / max(1, len(shortest_reference))
        source_record_ids = (
            benchmark.get("sourceRecordIds")
            or (benchmark.get("analysisJoin") or {}).get("sourceRecordIds")
            or []
        )
        if not source_record_ids:
            raise ValueError(f"benchmark row {identifier} has no source-record join")
        source_record_ids = [str(value) for value in source_record_ids]
        if census_by_source is not None:
            missing_source_ids = sorted(set(source_record_ids) - set(census_by_source))
            if missing_source_ids:
                raise ValueError(
                    f"benchmark row {identifier} has unknown census records: "
                    f"{missing_source_ids}"
                )
        lineage = lineage_rows.get(identifier) if lineage_rows is not None else None
        if lineage_rows is not None and lineage is None:
            raise ValueError(f"lineage audit is missing benchmark row {identifier}")
        source_profile = (
            source_profile_summary(
                source_record_ids,
                census_by_source,
                evidence_by_source or {},
                review_by_source or {},
                comparative_by_source or {},
            )
            if census_by_source is not None
            else {}
        )
        result = {
            "row_id": identifier,
            "suite_key": benchmark["suiteKey"],
            "task": benchmark.get("task"),
            "source_record_ids": source_record_ids,
            "source_prompt": source_prompt,
            "source_definition": benchmark.get("sourceDefinition"),
            "input_text": benchmark.get("inputText"),
            "accepted_references": accepted,
            "accepted_reference_count": len(accepted),
            "ambiguity_status": benchmark.get("ambiguityStatus") or "(missing)",
            "prompt_token_count": int(
                (benchmark.get("surfaceFeatures") or {}).get("promptTokenCount") or 0
            ),
            "prediction": prediction_row.get("prediction"),
            "prediction_normalized": prediction,
            "accepted_exact": bool(prediction_row.get("accepted_exact")),
            "grapheme_cer": float(prediction_row.get("grapheme_cer")),
            "target_subword_count": int(prediction_row.get("target_subword_count")),
            "edit_error_type": prediction_row.get("edit_error_type"),
            "empty": not prediction,
            "source_copy": bool(prediction_row.get("source_copy")),
            "output_character_count": len(prediction),
            "output_token_count": len(prediction.split()),
            "output_length_ratio": output_length_ratio,
            "source_token_jaccard": token_jaccard(prediction, source_prompt),
            "target_trigram_coverage": coverage(character_ngrams(prediction), profile),
            "exact_target_inventory_collision": (
                prediction in target_inventory and prediction not in accepted
            ),
            "accepted_reference_substring": any(
                value and value in prediction and value != prediction
                for value in accepted
            ),
            "reference_has_hyphen": any("-" in value for value in accepted),
            "reference_has_apostrophe": any("'" in value for value in accepted),
            "reference_orthographic_suffix_cluster_ids": reference_cluster_ids,
            "reference_orthographic_suffix_cluster_labels": (
                reference_cluster_labels or ["(unclustered)"]
            ),
            "reference_primary_orthographic_suffix_cluster_id": primary_cluster_id,
            "reference_primary_orthographic_suffix_cluster_label": (
                cluster_labels.get(primary_cluster_id, "(unclustered)")
            ),
            "reference_orthographic_suffix_membership": (reference_cluster_membership),
            "prediction_has_hyphen": "-" in prediction,
            "prediction_has_apostrophe": "'" in prediction,
            "documented_project_training_exposure": (
                lineage["documented_project_training_exposure"]
                if lineage
                else "not_supplied"
            ),
            "upstream_nllb_pretraining_exposure": (
                lineage["upstream_nllb_pretraining_exposure"]
                if lineage
                else "not_supplied"
            ),
            "evaluation_input_contains_reference_surface": bool(
                lineage and lineage["evaluation_input_contains_reference_surface"]
            ),
            "reference_surfaces_present_in_evaluation_input": (
                lineage["reference_surfaces_present_in_evaluation_input"]
                if lineage
                else []
            ),
            "target_reference_used_to_fit_tokenizer": bool(
                lineage and lineage["target_reference_used_to_fit_tokenizer"]
            ),
            "analysis_join": benchmark.get("analysisJoin"),
            **source_profile,
            "claim_limit": (
                "Diagnostic model-output evidence only. This row cannot establish a lexical, "
                "orthographic, morphological, grammatical, or rights change."
            ),
        }
        enriched.append(result)
    return enriched


def compare_by_source_record(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for row in rows:
        for source_id in row["source_record_ids"]:
            grouped[str(source_id)][row["suite_key"]].append(row)
    comparisons: list[dict[str, Any]] = []
    for source_id, suites in sorted(grouped.items()):
        if len(suites) < 2:
            continue
        suite_keys = sorted(suites)
        left = suites[suite_keys[0]]
        right = suites[suite_keys[1]]
        left_predictions = sorted({row["prediction_normalized"] for row in left})
        right_predictions = sorted({row["prediction_normalized"] for row in right})
        left_exact = any(row["accepted_exact"] for row in left)
        right_exact = any(row["accepted_exact"] for row in right)
        if left_exact and not right_exact:
            effect = f"{suite_keys[0]}_only_exact"
        elif right_exact and not left_exact:
            effect = f"{suite_keys[1]}_only_exact"
        elif left_exact and right_exact:
            effect = "both_exact"
        elif left_predictions == right_predictions:
            effect = "same_nonexact_prediction_set"
        else:
            effect = "different_nonexact_prediction_set"
        comparisons.append(
            {
                "source_record_id": source_id,
                "suite_keys": suite_keys,
                "row_ids": {
                    key: [row["row_id"] for row in suites[key]] for key in suite_keys
                },
                "prediction_sets": {
                    suite_keys[0]: left_predictions,
                    suite_keys[1]: right_predictions,
                },
                "any_exact": {suite_keys[0]: left_exact, suite_keys[1]: right_exact},
                "context_effect_class": effect,
                "claim_limit": "A prompt-conditioning contrast is not linguistic evidence.",
            }
        )
    return comparisons


def qualitative_sample(
    rows: list[dict[str, Any]], comparisons: list[dict[str, Any]], limit: int = 240
) -> list[dict[str, Any]]:
    reasons: dict[str, set[str]] = defaultdict(set)

    def select(reason: str, candidates: Iterable[dict[str, Any]], count: int) -> None:
        for row in list(candidates)[:count]:
            reasons[row["row_id"]].add(reason)

    failures = [row for row in rows if not row["accepted_exact"]]
    select(
        "accepted_exact",
        sorted(
            (row for row in rows if row["accepted_exact"]),
            key=lambda row: row["row_id"],
        ),
        40,
    )
    select(
        "nearest_surface_failures",
        sorted(failures, key=lambda row: (row["grapheme_cer"], row["row_id"])),
        40,
    )
    select(
        "largest_surface_failures",
        sorted(failures, key=lambda row: (-row["grapheme_cer"], row["row_id"])),
        30,
    )
    select(
        "target_inventory_collisions",
        sorted(
            (row for row in failures if row["exact_target_inventory_collision"]),
            key=lambda row: row["row_id"],
        ),
        40,
    )
    select(
        "low_target_profile_outputs",
        sorted(
            failures,
            key=lambda row: (row["target_trigram_coverage"], row["row_id"]),
        ),
        30,
    )
    select(
        "high_target_fertility",
        sorted(
            failures,
            key=lambda row: (-row["target_subword_count"], row["row_id"]),
        ),
        30,
    )
    select(
        "ambiguity_preserved",
        sorted(
            (row for row in rows if row["accepted_reference_count"] > 1),
            key=lambda row: row["row_id"],
        ),
        30,
    )
    select(
        "reference_surface_present_in_evaluation_input",
        sorted(
            (row for row in rows if row["evaluation_input_contains_reference_surface"]),
            key=lambda row: row["row_id"],
        ),
        40,
    )

    changed_records = {
        comparison["source_record_id"]
        for comparison in comparisons
        if comparison["context_effect_class"] != "same_nonexact_prediction_set"
    }
    select(
        "conditioning_changed_output",
        sorted(
            (row for row in rows if changed_records & set(row["source_record_ids"])),
            key=lambda row: row["row_id"],
        ),
        40,
    )

    def select_each_dynamic_stratum(field: str, reason_prefix: str) -> None:
        strata = sorted(
            {
                str(value)
                for row in failures
                for value in row.get(field) or []
                if value != "(missing)"
            }
        )
        for stratum in strata:
            select(
                f"{reason_prefix}:{stratum}",
                sorted(
                    (row for row in failures if stratum in (row.get(field) or [])),
                    key=lambda row: (row["grapheme_cer"], row["row_id"]),
                ),
                2,
            )

    select_each_dynamic_stratum(
        "source_structural_strata", "structural_stratum_failure"
    )
    select_each_dynamic_stratum("source_blocker_codes", "source_blocker_failure")
    select_each_dynamic_stratum("source_review_kinds", "source_review_kind_failure")
    select_each_dynamic_stratum(
        "current_dictionary_language_attribution_statuses",
        "language_attribution_failure",
    )
    select(
        "current_dictionary_evidence_linked_failure",
        sorted(
            (
                row
                for row in failures
                if row["current_dictionary_evidence_link_count"] > 0
            ),
            key=lambda row: (row["grapheme_cer"], row["row_id"]),
        ),
        40,
    )
    select(
        "reduplication_surface_candidate_failure",
        sorted(
            (
                row
                for row in failures
                if row["source_reduplication_surface_candidate_any"]
            ),
            key=lambda row: (row["grapheme_cer"], row["row_id"]),
        ),
        30,
    )
    select(
        "comparative_review_candidate_failure",
        sorted(
            (row for row in failures if row["comparative_review_candidate_count"] > 0),
            key=lambda row: (row["grapheme_cer"], row["row_id"]),
        ),
        40,
    )
    select_each_dynamic_stratum(
        "comparative_english_relations", "comparative_english_relation_failure"
    )
    select_each_dynamic_stratum(
        "comparative_concept_ids", "comparative_concept_failure"
    )
    select_each_dynamic_stratum(
        "reference_orthographic_suffix_cluster_labels",
        "orthographic_suffix_cluster_failure",
    )

    selected = [row for row in rows if row["row_id"] in reasons]
    selected.sort(key=lambda row: (-len(reasons[row["row_id"]]), row["row_id"]))
    result: list[dict[str, Any]] = []
    for row in selected[:limit]:
        result.append({**row, "selection_reasons": sorted(reasons[row["row_id"]])})
    return result


def build_surface_family_report(
    rows: list[dict[str, Any]], surface_families: dict[str, Any]
) -> list[dict[str, Any]]:
    report: list[dict[str, Any]] = []
    for cluster in surface_families["clusters"]:
        cluster_id = cluster["cluster_id"]
        members = [
            row
            for row in rows
            if cluster_id in row["reference_orthographic_suffix_cluster_ids"]
        ]
        failures = [row for row in members if not row["accepted_exact"]]
        member_surfaces = sorted(
            {
                membership["reference"]
                for row in members
                for membership in row["reference_orthographic_suffix_membership"]
                if cluster_id in membership["cluster_ids"]
            }
        )
        suites = sorted({row["suite_key"] for row in members})
        report.append(
            {
                **cluster,
                "benchmark_rows": len(members),
                "unique_benchmark_reference_surfaces": len(member_surfaces),
                "unique_source_records": len(
                    {
                        source_id
                        for row in members
                        for source_id in row["source_record_ids"]
                    }
                ),
                "overall": summarize(members),
                "mean_target_subword_count": (
                    statistics.fmean(
                        float(row["target_subword_count"]) for row in members
                    )
                    if members
                    else None
                ),
                "blank_output_count": sum(row["empty"] for row in members),
                "source_copy_count": sum(row["source_copy"] for row in members),
                "target_inventory_collision_count": sum(
                    row["exact_target_inventory_collision"] for row in members
                ),
                "near_surface_failure_count_cer_le_0_25": sum(
                    float(row["grapheme_cer"]) <= 0.25 for row in failures
                ),
                "by_suite": {
                    suite: summarize(
                        [row for row in members if row["suite_key"] == suite]
                    )
                    for suite in suites
                },
                "failure_row_id_sample": [
                    row["row_id"]
                    for row in sorted(
                        failures,
                        key=lambda row: (row["grapheme_cer"], row["row_id"]),
                    )[:12]
                ],
                "observed_reference_surface_sample": member_surfaces[:20],
                "claim_limit": SURFACE_FAMILY_CONTRACT["interpretation"],
            }
        )
    return report


def build_source_record_profiles(
    source_ids: Iterable[str],
    census_by_source: dict[str, dict[str, Any]],
    evidence_by_source: dict[str, list[dict[str, Any]]],
    review_by_source: dict[str, list[dict[str, Any]]],
    comparative_by_source: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for source_id in sorted(set(source_ids)):
        census = census_by_source[source_id]
        result.append(
            {
                "source_record_id": source_id,
                "census_record_id": census.get("censusRecordId"),
                "entry_candidate_id": census.get("entryCandidateId"),
                "source_layer": census.get("sourceLayer"),
                "source_prompt_candidate": census.get("sourcePromptCandidate"),
                "source_target_candidate": census.get("sourceTargetCandidate"),
                "structural_stratum": census.get("structuralStratum"),
                "structural_features": census.get("structuralFeatures"),
                "grouping": census.get("grouping"),
                "part_of_speech": census.get("partOfSpeech"),
                "blocker_codes": census.get("blockerCodes") or [],
                "review_dependencies": census.get("reviewDependencies"),
                "evidence_coverage": census.get("evidenceCoverage"),
                "training_eligibility": census.get("trainingEligibility"),
                "current_dictionary_evidence": evidence_by_source.get(source_id, []),
                "current_dictionary_review_items": review_by_source.get(source_id, []),
                "comparative_review_candidates": [
                    {
                        "crosswalk_candidate_id": row.get("crosswalk_candidate_id"),
                        "asjp_form_id": row.get("asjp_form_id"),
                        "concept_id": row.get("concept_id"),
                        "asjp_surface_source": row.get("asjp_surface_source"),
                        "dictionary_surface_source": row.get(
                            "dictionary_surface_source"
                        ),
                        "english_relation": row.get("english_relation"),
                        "raw_surface_similarity_casefolded": row.get(
                            "raw_surface_similarity_casefolded"
                        ),
                        "review_rank_within_asjp_form": row.get(
                            "review_rank_within_asjp_form"
                        ),
                        "orthography_relation": row.get("orthography_relation"),
                        "lexical_identity_status": row.get("lexical_identity_status"),
                        "benchmark_reference_eligible": False,
                        "synthetic_sentence_pair_eligible": False,
                        "training_eligible": False,
                    }
                    for row in comparative_by_source.get(source_id, [])
                ],
                "claim_limit": (
                    "Source, review, and comparative metadata describe evidence state. "
                    "ASJP candidates and model output cannot establish or modify this "
                    "linguistic record."
                ),
            }
        )
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--run-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--lineage-audit", type=Path, required=True)
    parser.add_argument("--lexical-census-manifest", type=Path, required=True)
    parser.add_argument("--lexical-census-manifest-sha256", required=True)
    parser.add_argument("--comparative-lexical-manifest", type=Path, required=True)
    parser.add_argument("--comparative-lexical-manifest-sha256", required=True)
    parser.add_argument("--dictionary-current", type=Path, required=True)
    parser.add_argument("--dictionary-current-sha256", required=True)
    parser.add_argument("--grammar-current", type=Path, required=True)
    parser.add_argument("--grammar-current-sha256", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    contract = read_json(args.contract)
    program_root = args.program_root.resolve()
    run_root = args.run_root.resolve()
    if not (run_root / "RUN_COMPLETE").is_file():
        raise ValueError(f"run is not complete: {run_root}")

    lineage_path = args.lineage_audit.resolve()
    lineage_values = read_jsonl(lineage_path)
    lineage_rows = {row_id(row): row for row in lineage_values}
    if len(lineage_rows) != len(lineage_values):
        raise ValueError("lineage-audit row IDs are not unique")

    lexical_census_path = resolve_program_path(
        program_root,
        str(args.lexical_census_manifest),
        "lexical census manifest",
    )
    if sha256(lexical_census_path) != args.lexical_census_manifest_sha256:
        raise ValueError(
            f"lexical census manifest hash mismatch: {lexical_census_path}"
        )
    comparative_lexical_path = resolve_program_path(
        program_root,
        str(args.comparative_lexical_manifest),
        "comparative lexical manifest",
    )
    if sha256(comparative_lexical_path) != args.comparative_lexical_manifest_sha256:
        raise ValueError(
            f"comparative lexical manifest hash mismatch: {comparative_lexical_path}"
        )
    dictionary_current_path = resolve_program_path(
        program_root, str(args.dictionary_current), "dictionary current pointer"
    )
    if sha256(dictionary_current_path) != args.dictionary_current_sha256:
        raise ValueError(
            f"dictionary current pointer hash mismatch: {dictionary_current_path}"
        )
    grammar_current_path = resolve_program_path(
        program_root, str(args.grammar_current), "grammar current pointer"
    )
    if sha256(grammar_current_path) != args.grammar_current_sha256:
        raise ValueError(
            f"grammar current pointer hash mismatch: {grammar_current_path}"
        )
    lexical_census, census_by_source = verify_lexical_census(
        program_root, lexical_census_path
    )
    (
        comparative_lexical,
        comparative_components,
        comparative_by_source,
    ) = verify_comparative_lexical_inventory(
        program_root,
        comparative_lexical_path,
    )
    unknown_comparative_sources = sorted(
        set(comparative_by_source) - set(census_by_source)
    )
    if unknown_comparative_sources:
        raise ValueError(
            "comparative lexical candidates reference unknown census records: "
            f"{unknown_comparative_sources[:10]}"
        )
    dictionary_edition = verify_current_edition(
        program_root,
        dictionary_current_path,
        "dictionary",
    )
    grammar_edition = verify_current_edition(
        program_root,
        grammar_current_path,
        "grammar",
    )
    comparative_checkpoint_bindings: dict[str, dict[str, Any]] = {}
    for artifact, edition in (
        ("dictionary", dictionary_edition),
        ("grammar", grammar_edition),
    ):
        checkpoint_binding = resolve_edition_checkpoint(
            edition, "comparative_lexical_checkpoint"
        )
        checkpoint = checkpoint_binding["checkpoint"]
        if checkpoint.get("inventory_id") != comparative_lexical.get("inventory_id"):
            raise ValueError(f"{artifact} comparative inventory ID mismatch")
        if checkpoint.get("manifest_sha256") != sha256(comparative_lexical_path):
            raise ValueError(f"{artifact} comparative manifest hash mismatch")
        comparative_checkpoint_bindings[artifact] = {
            key: value
            for key, value in checkpoint_binding.items()
            if key != "checkpoint"
        }
    evidence_by_source, review_by_source = build_current_dictionary_joins(
        program_root, dictionary_edition, census_by_source
    )

    model_manifest_path = resolve_program_path(
        program_root, contract["model"]["manifest_path"], "control model manifest"
    )
    if sha256(model_manifest_path) != contract["model"]["manifest_sha256"]:
        raise ValueError(f"control model manifest hash mismatch: {model_manifest_path}")
    model_manifest = read_json(model_manifest_path)
    target_rows = [
        row
        for row in (model_manifest.get("extension") or {}).get(
            "ordered_extension_rows", []
        )
        if row.get("token") == contract["task"]["target_token"]
    ]
    if len(target_rows) != 1:
        raise ValueError("control target-token initialization is not uniquely recorded")
    target_initialization = target_rows[0].get("initialization") or {}

    suite_payloads: list[tuple[list[dict[str, Any]], list[dict[str, Any]]]] = []
    all_references: list[list[str]] = []
    benchmark_knowledge_bindings: list[dict[str, Any]] = []
    for suite in contract["suites"]:
        suite_manifest_path = resolve_program_path(
            program_root, suite["manifest_path"], f"suite manifest {suite['suite_key']}"
        )
        if sha256(suite_manifest_path) != suite["manifest_sha256"]:
            raise ValueError(f"suite manifest hash mismatch: {suite_manifest_path}")
        suite_manifest = read_json(suite_manifest_path)
        benchmark_knowledge_bindings.append(
            {
                "suite_key": suite["suite_key"],
                "dictionary_edition": suite_manifest.get("dictionary_edition"),
                "model_output_is_linguistic_evidence": bool(
                    (suite_manifest.get("policy") or {}).get(
                        "model_output_is_linguistic_evidence"
                    )
                ),
            }
        )
        benchmark_path = program_root / suite["path"]
        if sha256(benchmark_path) != suite["sha256"]:
            raise ValueError(f"benchmark hash mismatch: {benchmark_path}")
        benchmark = read_jsonl(benchmark_path)
        if len(benchmark) != suite["rows"]:
            raise ValueError(f"benchmark row mismatch: {benchmark_path}")
        predictions_path = (
            run_root / "suites" / suite["suite_key"] / "predictions.jsonl"
        )
        predictions = read_jsonl(predictions_path)
        if len(predictions) != suite["rows"]:
            raise ValueError(f"prediction row mismatch: {predictions_path}")
        suite_payloads.append((benchmark, predictions))
        all_references.extend(references(row) for row in benchmark)

    profile = target_profile(all_references)
    inventory = {value for values in all_references for value in values}
    surface_families = discover_orthographic_suffix_clusters(all_references)
    enriched: list[dict[str, Any]] = []
    for benchmark, predictions in suite_payloads:
        enriched.extend(
            enrich_rows(
                benchmark,
                predictions,
                profile,
                inventory,
                lineage_rows,
                census_by_source,
                evidence_by_source,
                review_by_source,
                comparative_by_source,
                surface_families,
            )
        )
    enriched_ids = {row["row_id"] for row in enriched}
    if set(lineage_rows) != enriched_ids:
        missing = sorted(enriched_ids - set(lineage_rows))[:10]
        extra = sorted(set(lineage_rows) - enriched_ids)[:10]
        raise ValueError(
            f"lineage/benchmark ID mismatch; missing={missing}, extra={extra}"
        )
    comparisons = compare_by_source_record(enriched)
    sample = qualitative_sample(enriched, comparisons)
    surface_family_rows = build_surface_family_report(enriched, surface_families)
    benchmark_source_ids = {
        source_id for row in enriched for source_id in row["source_record_ids"]
    }
    source_profiles = build_source_record_profiles(
        benchmark_source_ids,
        census_by_source,
        evidence_by_source,
        review_by_source,
        comparative_by_source,
    )

    comparison_counts = Counter(row["context_effect_class"] for row in comparisons)
    summary = {
        "schema_version": 1,
        "analysis_id": f"{contract['experiment_id']}-qualitative-analysis-v9",
        "created_at": utc_now(),
        "contract_path": str(args.contract.resolve()),
        "contract_sha256": sha256(args.contract),
        "run_root": str(run_root),
        "run_complete_sha256": sha256(run_root / "RUN_COMPLETE"),
        "lineage_audit_path": str(lineage_path),
        "lineage_audit_sha256": sha256(lineage_path),
        "lexical_census": {
            "manifest_path": str(lexical_census_path),
            "manifest_sha256": sha256(lexical_census_path),
            "census_id": lexical_census.get("census_id"),
            "records": len(census_by_source),
            "benchmark_source_records": len(benchmark_source_ids),
            "benchmark_source_coverage_complete": not (
                benchmark_source_ids - set(census_by_source)
            ),
        },
        "comparative_lexical_review": {
            "inventory_id": comparative_lexical.get("inventory_id"),
            "manifest_path": str(comparative_lexical_path),
            "manifest_sha256": sha256(comparative_lexical_path),
            "components": comparative_components,
            "concepts": int((comparative_lexical.get("counts") or {})["concepts"]),
            "forms": int((comparative_lexical.get("counts") or {})["forms"]),
            "crosswalk_candidates": int(
                (comparative_lexical.get("counts") or {})["crosswalk_candidates"]
            ),
            "candidate_source_records": len(comparative_by_source),
            "edition_checkpoint_bindings": comparative_checkpoint_bindings,
            "benchmark_source_records": len(
                benchmark_source_ids & set(comparative_by_source)
            ),
            "accepted_dictionary_rows": 0,
            "accepted_grammar_rows": 0,
            "benchmark_reference_rows": 0,
            "controlled_synthetic_sentence_pairs_authorized": 0,
            "training_eligible_rows": 0,
        },
        "benchmark_knowledge_bindings": benchmark_knowledge_bindings,
        "review_knowledge_baseline": {
            "dictionary": {
                "edition_id": dictionary_edition["manifest"]["edition_id"],
                "manifest_path": str(dictionary_edition["manifest_path"]),
                "manifest_sha256": sha256(dictionary_edition["manifest_path"]),
                "current_pointer_path": dictionary_edition["pointer_path"],
                "current_pointer_sha256": dictionary_edition["pointer_sha256"],
                "accepted_change_ids": dictionary_edition["manifest"].get(
                    "accepted_change_ids", []
                ),
            },
            "grammar": {
                "edition_id": grammar_edition["manifest"]["edition_id"],
                "manifest_path": str(grammar_edition["manifest_path"]),
                "manifest_sha256": sha256(grammar_edition["manifest_path"]),
                "current_pointer_path": grammar_edition["pointer_path"],
                "current_pointer_sha256": grammar_edition["pointer_sha256"],
                "accepted_change_ids": grammar_edition["manifest"].get(
                    "accepted_change_ids", []
                ),
            },
        },
        "control_target_token_initialization": {
            "target_token": contract["task"]["target_token"],
            "target_token_id": contract["model"]["target_token_id"],
            **target_initialization,
            "interpretation": (
                "The zero-step output prior is inherited from the recorded source "
                "token. It is not evidence about Wajarri or a candidate translation."
            ),
        },
        "rows": len(enriched),
        "unique_source_records": len(benchmark_source_ids),
        "target_inventory_surfaces": len(inventory),
        "target_profile_trigrams": len(profile),
        "orthographic_surface_family_analysis": {
            "contract": surface_families["contract"],
            "unique_reference_surfaces": surface_families["unique_reference_surfaces"],
            "single_token_reference_surfaces": surface_families[
                "single_token_reference_surfaces"
            ],
            "excluded_multi_token_reference_surfaces": surface_families[
                "excluded_multi_token_reference_surfaces"
            ],
            "cluster_count": surface_families["cluster_count"],
            "report_artifact": "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl",
            "claim_limit": SURFACE_FAMILY_CONTRACT["interpretation"],
        },
        "overall": summarize(enriched),
        "slices": slice_report(enriched),
        "source_record_conditioning_comparisons": {
            "rows": len(comparisons),
            "class_counts": dict(sorted(comparison_counts.items())),
        },
        "qualitative_sample_rows": len(sample),
        "source_record_profile_rows": len(source_profiles),
        "current_dictionary_evidence_linked_benchmark_source_records": len(
            benchmark_source_ids & set(evidence_by_source)
        ),
        "current_dictionary_review_linked_benchmark_source_records": len(
            benchmark_source_ids & set(review_by_source)
        ),
        "comparative_review_linked_benchmark_source_records": len(
            benchmark_source_ids & set(comparative_by_source)
        ),
        "evaluation_input_reference_surface_rows": sum(
            row["evaluation_input_contains_reference_surface"] for row in enriched
        ),
        "interpretation": [
            "Target-character-profile coverage is dynamically estimated from this "
            "dictionary edition; it is not a language identifier or grammaticality score.",
            "Conditioning contrasts describe output sensitivity to source definitions "
            "and do not adjudicate senses or prove semantic improvement.",
            "Tokenizer-fertility slices are associations on a complete internal "
            "population, not causal estimates.",
            "Rows whose accepted reference appears in the evaluation input are "
            "reported separately from project-training exposure.",
            "Documented project optimizer exposure is distinct from unknown upstream "
            "NLLB pretraining exposure.",
            "Model outputs are diagnostic system evidence only and cannot support a "
            "dictionary or grammar change without independent source evidence or "
            "qualified review.",
            "Multi-label slice dimensions can count one benchmark row in more than "
            "one value; they are complete diagnostic strata, not disjoint samples.",
            "The benchmark remains bound to its frozen dictionary edition while the "
            "review baseline records the later living dictionary and grammar editions.",
            "ASJP crosswalk rows are review-only comparative metadata. They are not "
            "practical-orthography mappings, accepted references, grammar rules, "
            "controlled synthetic sentence pairs, or training rows.",
            "Terminal-string clusters are discovered orthographic strata only. Their "
            "failure rates can prioritize review, but cannot establish morphemes or "
            "license synthetic sentence generation without accepted grammar evidence.",
        ],
        "claim_limit": contract["claim_limit"],
    }
    knowledge_feedback = {
        "schema_version": 1,
        "feedback_id": f"{contract['experiment_id']}-knowledge-feedback-v9",
        "created_at": utc_now(),
        "trigger": "complete_zero_step_lexical_census",
        "benchmark_dictionary_editions": sorted(
            {
                (binding.get("dictionary_edition") or {}).get("edition_id")
                for binding in benchmark_knowledge_bindings
                if (binding.get("dictionary_edition") or {}).get("edition_id")
            }
        ),
        "review_dictionary_edition": dictionary_edition["manifest"]["edition_id"],
        "review_dictionary_manifest_sha256": sha256(
            dictionary_edition["manifest_path"]
        ),
        "review_grammar_edition": grammar_edition["manifest"]["edition_id"],
        "review_grammar_manifest_sha256": sha256(grammar_edition["manifest_path"]),
        "dictionary_changed": False,
        "grammar_changed": False,
        "dictionary_change_candidates": [],
        "grammar_change_candidates": [],
        "review_questions": [
            {
                "kind": "qualitative_model_failure_review",
                "artifact": "QUALITATIVE-SAMPLE.jsonl",
                "rows": len(sample),
                "status": "diagnostic_only",
            },
            {
                "kind": "evaluation_input_reference_surface_review",
                "artifact": "FAILURE-JOIN.jsonl",
                "rows": summary["evaluation_input_reference_surface_rows"],
                "status": "report_separately_not_linguistic_evidence",
            },
            {
                "kind": "source_structure_and_evidence_strata_review",
                "artifact": "SOURCE-RECORD-PROFILES.jsonl",
                "rows": len(source_profiles),
                "status": "diagnostic_training_design_input_only",
            },
            {
                "kind": "comparative_lexical_review_strata",
                "artifact": "SOURCE-RECORD-PROFILES.jsonl",
                "rows": summary["comparative_review_linked_benchmark_source_records"],
                "status": "review_only_not_linguistic_acceptance",
                "inventory_id": comparative_lexical.get("inventory_id"),
            },
            {
                "kind": "orthographic_terminal_string_cluster_review",
                "artifact": "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl",
                "rows": len(surface_family_rows),
                "status": "diagnostic_only_not_morphological_analysis",
                "synthetic_sentence_pair_authority": False,
            },
        ],
        "required_living_book_checkpoint": {
            "status": "pending_until_reviewed_child_editions_are_issued",
            "dictionary_parent_edition": dictionary_edition["manifest"]["edition_id"],
            "grammar_parent_edition": grammar_edition["manifest"]["edition_id"],
            "allowed_outcomes": [
                "reviewed_no_change_child_edition",
                "evidence_supported_change_child_edition",
            ],
            "model_output_may_supply_linguistic_change": False,
            "required_bindings": [
                "benchmark_run_identity_and_hash",
                "analysis_identity_and_hash",
                "reviewed_dictionary_child_edition",
                "reviewed_grammar_child_edition",
            ],
        },
        "decision_basis": (
            "This untrained control can reveal evaluator, prompt, grouping, and "
            "model-prior behavior. "
            "Its predictions cannot supply Wajarri lexical or grammatical evidence."
        ),
        "model_output_is_linguistic_evidence": False,
    }

    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    outputs = {
        "SUMMARY.json": summary,
        "KNOWLEDGE-FEEDBACK.json": knowledge_feedback,
    }
    for name, value in outputs.items():
        write_json_atomic(output_dir / name, value)
    write_jsonl_atomic(output_dir / "FAILURE-JOIN.jsonl", enriched)
    write_jsonl_atomic(output_dir / "SOURCE-RECORD-CONTRASTS.jsonl", comparisons)
    write_jsonl_atomic(output_dir / "QUALITATIVE-SAMPLE.jsonl", sample)
    write_jsonl_atomic(
        output_dir / "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl", surface_family_rows
    )
    write_jsonl_atomic(output_dir / "SOURCE-RECORD-PROFILES.jsonl", source_profiles)
    checksummed = sorted(path for path in output_dir.iterdir() if path.is_file())
    checksum_path = output_dir / "OUTPUT-SHA256SUMS"
    checksum_path.write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in checksummed),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

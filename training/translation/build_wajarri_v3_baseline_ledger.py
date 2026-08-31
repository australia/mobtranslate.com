#!/usr/bin/env python3
"""Build the checksum-bound Wajarri v2 baseline and failure ledger for v3."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import statistics
import tempfile
from typing import Any, Iterable
import unicodedata

import regex


METHOD_ID = "wajarri-v3-v2-baseline-failure-ledger-v1.0.0"
CLAIM_LIMIT = (
    "This deterministic ledger describes the published Wajarri v2 checkpoint on "
    "frozen closed-set and development-consumed suites. Exact lexical reconstruction "
    "is memorization, synthetic and historical diagnostics are not independent "
    "natural-language evidence, and all exposure comparisons are associations rather "
    "than causal estimates."
)
EXPOSURE_CLAIM_LIMIT = (
    "Documented exposure includes only the checksum-bound MobTranslate lineage stages "
    "listed in the analysis contract. Upstream NLLB pretraining exposure remains "
    "unknown. Presentation counts are optimizer inputs, not independent linguistic "
    "evidence."
)
ALIGNMENT_CLAIM_LIMIT = (
    "Edit counts use one deterministic minimum-cost Unicode-grapheme alignment to the "
    "closest accepted reference. They describe surface distance, not morphology or a "
    "causal explanation."
)
ORTHOGRAPHIC_FAMILY_CONTRACT = {
    "family_kind": "orthographic_terminal_string_cluster",
    "minimum_suffix_graphemes": 3,
    "maximum_suffix_graphemes": 10,
    "minimum_stem_graphemes": 2,
    "minimum_unique_reference_surfaces": 8,
    "minimum_preceding_grapheme_types": 3,
    "interpretation": (
        "Clusters are mechanically recurring terminal grapheme strings in the frozen "
        "reference inventory. They are diagnostic surface strata, not asserted "
        "morphemes, parts of speech, or grammar rules."
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
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    return " ".join(text.translate(QUOTE_FOLD).casefold().split())


def graphemes(value: str) -> list[str]:
    return regex.findall(r"\X", value)


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


def verify_component(
    program_root: Path, component: dict[str, Any], label: str
) -> tuple[Path, list[dict[str, Any]]]:
    path = resolve_within(program_root, component["path"], label)
    observed_hash = sha256_file(path)
    if observed_hash != component["sha256"]:
        raise ValueError(
            f"{label} hash mismatch: expected={component['sha256']} "
            f"observed={observed_hash} path={path}"
        )
    rows = read_jsonl(path)
    if "rows" in component and len(rows) != int(component["rows"]):
        raise ValueError(
            f"{label} row mismatch: expected={component['rows']} "
            f"observed={len(rows)}"
        )
    return path, rows


def verify_json_component(
    program_root: Path, component: dict[str, Any], label: str
) -> tuple[Path, dict[str, Any]]:
    path = resolve_within(program_root, component["path"], label)
    observed_hash = sha256_file(path)
    if observed_hash != component["sha256"]:
        raise ValueError(
            f"{label} hash mismatch: expected={component['sha256']} "
            f"observed={observed_hash} path={path}"
        )
    return path, read_json(path)


def write_json_atomic(path: Path, value: Any) -> None:
    payload = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(payload)
        handle.flush()
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    payload = "".join(
        json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows
    ).encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(payload)
        handle.flush()
    temporary.replace(path)


def deterministic_edit_alignment(
    prediction: list[str], reference: list[str]
) -> dict[str, int]:
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
            insertions, deletions, substitutions = paths[pred_index - 1][
                ref_index - 1
            ]
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
    prefix = 0
    for left, right in zip(prediction_graphemes, reference_graphemes):
        if left != right:
            break
        prefix += 1
    suffix = 0
    for left, right in zip(reversed(prediction_graphemes), reversed(reference_graphemes)):
        if left != right:
            break
        suffix += 1
    return {
        "closest_normalized_reference": reference,
        "prediction_grapheme_count": len(prediction_graphemes),
        "closest_reference_grapheme_count": len(reference_graphemes),
        "common_prefix_graphemes": prefix,
        "common_suffix_graphemes": suffix,
        **alignment,
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
    single_unit = [surface for surface in surfaces if " " not in surface]
    members: defaultdict[str, set[str]] = defaultdict(set)
    boundaries: defaultdict[str, set[str]] = defaultdict(set)
    minimum_suffix = int(ORTHOGRAPHIC_FAMILY_CONTRACT["minimum_suffix_graphemes"])
    maximum_suffix = int(ORTHOGRAPHIC_FAMILY_CONTRACT["maximum_suffix_graphemes"])
    minimum_stem = int(ORTHOGRAPHIC_FAMILY_CONTRACT["minimum_stem_graphemes"])
    for surface in single_unit:
        units = graphemes(surface)
        upper = min(maximum_suffix, len(units) - minimum_stem)
        for size in range(minimum_suffix, upper + 1):
            stem = units[:-size]
            suffix = "".join(units[-size:])
            if suffix.isalpha() and len(stem) >= minimum_stem:
                members[suffix].add(surface)
                boundaries[suffix].add(stem[-1])
    qualified = [
        suffix
        for suffix in members
        if len(members[suffix])
        >= int(ORTHOGRAPHIC_FAMILY_CONTRACT["minimum_unique_reference_surfaces"])
        and len(boundaries[suffix])
        >= int(ORTHOGRAPHIC_FAMILY_CONTRACT["minimum_preceding_grapheme_types"])
    ]
    qualified.sort(key=lambda value: (-len(graphemes(value)), -len(members[value]), value))
    clusters = []
    by_surface: defaultdict[str, list[str]] = defaultdict(list)
    labels: dict[str, str] = {}
    for suffix in qualified:
        cluster_id = "orthographic-suffix-" + hashlib.sha256(
            suffix.encode("utf-8")
        ).hexdigest()[:16]
        labels[cluster_id] = f"suffix:{suffix}"
        cluster_members = sorted(members[suffix])
        clusters.append(
            {
                "cluster_id": cluster_id,
                "label": labels[cluster_id],
                "terminal_string": suffix,
                "terminal_grapheme_count": len(graphemes(suffix)),
                "unique_reference_surface_count": len(cluster_members),
                "unique_preceding_grapheme_count": len(boundaries[suffix]),
                "preceding_graphemes": sorted(boundaries[suffix]),
                "reference_surface_sample": cluster_members[:20],
                "claim_limit": ORTHOGRAPHIC_FAMILY_CONTRACT["interpretation"],
            }
        )
        for surface in cluster_members:
            by_surface[surface].append(cluster_id)
    return {
        "clusters": clusters,
        "clusters_by_surface": dict(by_surface),
        "cluster_labels": labels,
        "unique_reference_surfaces": len(surfaces),
        "contract": dict(ORTHOGRAPHIC_FAMILY_CONTRACT),
    }


def row_source_ids(row: dict[str, Any]) -> set[str]:
    values: set[str] = set()
    for field in ("source_record_ids", "dictionary_record_ids"):
        for value in row.get(field) or []:
            values.add(str(value))
    if row.get("source_record_id"):
        values.add(str(row["source_record_id"]))
    return values


@dataclass
class ExposureStage:
    stage_id: str
    presentations: int
    unique_pairs: int
    exact_pairs: Counter[tuple[str, str]]
    by_input: dict[str, Counter[str]]
    targets: Counter[str]
    source_ids: Counter[str]
    input_component: dict[str, Any]
    exposure_component: dict[str, Any]


def build_stage(
    program_root: Path, stage: dict[str, Any]
) -> ExposureStage:
    stage_id = str(stage["stage_id"])
    _, rows = verify_component(program_root, stage["rows"], f"{stage_id} rows")
    mode = stage["mode"]
    weighted_rows: list[tuple[dict[str, Any], int]]
    exposure_component = stage["exposure_ledger"]
    _, exposure_rows = verify_component(
        program_root, exposure_component, f"{stage_id} exposure ledger"
    )
    exposure_by_id = {
        str(row["id"]): int(row["presentations"]) for row in exposure_rows
    }
    if len(exposure_by_id) != len(exposure_rows):
        raise ValueError(f"duplicate exposure-ledger ID in {stage_id}")
    if mode == "weighted_unique_rows":
        id_field = str(stage.get("row_id_field") or "id")
        row_ids = {str(row[id_field]) for row in rows}
        if row_ids != set(exposure_by_id):
            raise ValueError(f"row/exposure identity mismatch in {stage_id}")
        weighted_rows = [(row, exposure_by_id[str(row[id_field])]) for row in rows]
    elif mode == "explicit_schedule_prefix":
        limit = int(stage["presentation_limit"])
        if not 0 < limit <= len(rows):
            raise ValueError(f"invalid presentation limit in {stage_id}: {limit}")
        selected = rows[:limit]
        observed = Counter(
            str(row.get("accounting_parent_id") or row["id"]) for row in selected
        )
        if observed != Counter(exposure_by_id):
            raise ValueError(f"schedule/exposure count mismatch in {stage_id}")
        weighted_rows = [(row, 1) for row in selected]
    else:
        raise ValueError(f"unsupported exposure mode in {stage_id}: {mode}")

    exact_pairs: Counter[tuple[str, str]] = Counter()
    by_input: defaultdict[str, Counter[str]] = defaultdict(Counter)
    targets: Counter[str] = Counter()
    source_ids: Counter[str] = Counter()
    for row, weight in weighted_rows:
        source = normalize(row.get("input_text"))
        target = normalize(row.get("output_text"))
        exact_pairs[(source, target)] += weight
        by_input[source][target] += weight
        targets[target] += weight
        for source_id in row_source_ids(row):
            source_ids[source_id] += weight
    presentations = sum(exact_pairs.values())
    expected = int(stage["selected_presentations"])
    if presentations != expected:
        raise ValueError(
            f"selected-presentation mismatch in {stage_id}: "
            f"expected={expected} observed={presentations}"
        )
    return ExposureStage(
        stage_id=stage_id,
        presentations=presentations,
        unique_pairs=len(exact_pairs),
        exact_pairs=exact_pairs,
        by_input=dict(by_input),
        targets=targets,
        source_ids=source_ids,
        input_component=stage["rows"],
        exposure_component=exposure_component,
    )


def exposure_for_row(
    stage: ExposureStage,
    input_text: str,
    references: list[str],
    source_ids: list[str],
    prediction: str,
) -> dict[str, Any]:
    source = normalize(input_text)
    normalized_references = sorted({normalize(value) for value in references})
    accepted = set(normalized_references)
    same_input = stage.by_input.get(source, Counter())
    exact_by_reference = {
        reference: stage.exact_pairs[(source, reference)]
        for reference in normalized_references
    }
    exact_presentations = sum(exact_by_reference.values())
    conflicting = sum(
        count for target, count in same_input.items() if target not in accepted
    )
    target_elsewhere = sum(
        max(0, stage.targets[reference] - exact_by_reference[reference])
        for reference in normalized_references
    )
    if exact_presentations:
        exposure_class = "direct_accepted_pair_exposed"
    elif conflicting:
        exposure_class = "same_prompt_conflicting_target_only"
    elif target_elsewhere:
        exposure_class = "accepted_target_exposed_elsewhere_only"
    else:
        exposure_class = "no_exact_documented_stage_exposure"
    return {
        "stage_id": stage.stage_id,
        "exposure_class": exposure_class,
        "accepted_pair_presentations": exact_presentations,
        "accepted_pair_presentations_by_reference": exact_by_reference,
        "same_input_presentations": sum(same_input.values()),
        "same_input_conflicting_presentations": conflicting,
        "same_input_targets": dict(sorted(same_input.items())),
        "accepted_target_elsewhere_presentations": target_elsewhere,
        "prediction_target_presentations": stage.targets[normalize(prediction)],
        "source_record_presentations": {
            source_id: stage.source_ids[source_id] for source_id in sorted(source_ids)
        },
        "upstream_nllb_pretraining_exposure": "unknown",
        "claim_limit": EXPOSURE_CLAIM_LIMIT,
    }


def cumulative_exposure(stage_rows: list[dict[str, Any]]) -> dict[str, Any]:
    accepted = sum(row["accepted_pair_presentations"] for row in stage_rows)
    conflicting = sum(row["same_input_conflicting_presentations"] for row in stage_rows)
    elsewhere = sum(
        row["accepted_target_elsewhere_presentations"] for row in stage_rows
    )
    if accepted:
        exposure_class = "direct_accepted_pair_exposed"
    elif conflicting:
        exposure_class = "same_prompt_conflicting_target_only"
    elif elsewhere:
        exposure_class = "accepted_target_exposed_elsewhere_only"
    else:
        exposure_class = "no_exact_documented_project_exposure"
    return {
        "exposure_class": exposure_class,
        "accepted_pair_presentations": accepted,
        "same_input_conflicting_presentations": conflicting,
        "accepted_target_elsewhere_presentations": elsewhere,
        "prediction_target_presentations": sum(
            row["prediction_target_presentations"] for row in stage_rows
        ),
        "upstream_nllb_pretraining_exposure": "unknown",
        "claim_limit": EXPOSURE_CLAIM_LIMIT,
    }


def source_profile_summary(profiles: list[dict[str, Any]]) -> dict[str, Any]:
    if not profiles:
        return {
            "source_profile_join_status": "not_applicable_or_unjoined",
            "source_structural_strata": [],
            "source_blocker_codes": [],
            "source_pos_statuses": [],
            "source_target_token_buckets": [],
            "source_reduplication_surface_candidate_any": False,
            "source_prompt_distinct_target_count_max": None,
        }
    structural = [row.get("structuralFeatures") or {} for row in profiles]
    grouping = [row.get("grouping") or {} for row in profiles]
    return {
        "source_profile_join_status": "joined",
        "source_structural_strata": sorted(
            {str(row.get("structuralStratum")) for row in profiles}
        ),
        "source_blocker_codes": sorted(
            {str(value) for row in profiles for value in row.get("blockerCodes") or []}
        ),
        "source_pos_statuses": sorted(
            {
                str((row.get("partOfSpeech") or {}).get("status") or "missing")
                for row in profiles
            }
        ),
        "source_target_token_buckets": sorted(
            {str(row.get("targetTokenBucket") or "missing") for row in structural}
        ),
        "source_reduplication_surface_candidate_any": any(
            bool(row.get("reduplicationSurfaceCandidate")) for row in structural
        ),
        "source_prompt_distinct_target_count_max": max(
            (int(row.get("promptDistinctTargetCount") or 0) for row in grouping),
            default=0,
        ),
    }


def common_suffix_whitespace_units(left: str, right: str) -> int:
    count = 0
    for one, two in zip(reversed(normalize(left).split()), reversed(normalize(right).split())):
        if one != two:
            break
        count += 1
    return count


def load_source_profiles(
    program_root: Path, component: dict[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    _, records = verify_component(program_root, component, "lexical source census")
    current = [row for row in records if row.get("sourceLayer") == "current"]
    index: dict[str, dict[str, Any]] = {}
    identifier_fields = (
        "sourceRecordId",
        "censusRecordId",
        "entryCandidateId",
        "senseCandidateId",
        "formCandidateId",
    )
    for row in current:
        for field in identifier_fields:
            value = row.get(field)
            if value:
                existing = index.get(str(value))
                if existing is not None and existing is not row:
                    raise ValueError(f"duplicate source-profile identifier: {value}")
                index[str(value)] = row
    return current, index


def validate_prediction_suite(
    program_root: Path, suite: dict[str, Any]
) -> list[dict[str, Any]]:
    suite_id = str(suite["suite"])
    _, predictions = verify_component(
        program_root, suite["predictions"], f"{suite_id} predictions"
    )
    _, evaluation = verify_component(
        program_root, suite["evaluation"], f"{suite_id} evaluation"
    )
    prediction_by_id = {str(row["id"]): row for row in predictions}
    evaluation_by_id = {str(row["id"]): row for row in evaluation}
    if len(prediction_by_id) != len(predictions):
        raise ValueError(f"duplicate prediction ID in {suite_id}")
    if len(evaluation_by_id) != len(evaluation):
        raise ValueError(f"duplicate evaluation ID in {suite_id}")
    if set(prediction_by_id) != set(evaluation_by_id):
        raise ValueError(f"prediction/evaluation identity mismatch in {suite_id}")
    identity_fields = ("input_text", "pair_kind", "source_record_ids", "task")
    reconciliation_by_input: dict[str, dict[str, Any]] = {}
    reconciliation_component = suite.get("accepted_reference_reconciliation")
    if reconciliation_component:
        _, reconciliation = verify_json_component(
            program_root,
            reconciliation_component,
            f"{suite_id} accepted-reference reconciliation",
        )
        reconciliation_by_input = {
            str(row["input_text"]): row
            for row in reconciliation.get("cross_source_conflicts") or []
        }
        if len(reconciliation_by_input) != len(
            reconciliation.get("cross_source_conflicts") or []
        ):
            raise ValueError(f"duplicate reconciliation input in {suite_id}")
    rows = []
    observed_reconciliations: set[str] = set()
    for row_id in sorted(prediction_by_id):
        prediction = dict(prediction_by_id[row_id])
        expected = evaluation_by_id[row_id]
        for field in identity_fields:
            if prediction.get(field) != expected.get(field):
                raise ValueError(f"{suite_id}:{row_id} differs on {field}")
        if prediction.get("accepted_references") != expected.get(
            "accepted_references"
        ):
            input_text = str(expected["input_text"])
            reconciliation = reconciliation_by_input.get(input_text)
            if reconciliation is None:
                raise ValueError(
                    f"{suite_id}:{row_id} has an undeclared accepted-reference change"
                )
            expected_original = sorted(
                str(value) for value in reconciliation["new_census_references"]
            )
            expected_scored = sorted(
                expected_original + [str(reconciliation["v1_retention_reference"])]
            )
            if sorted(expected["accepted_references"]) != expected_original:
                raise ValueError(f"{suite_id}:{row_id} reconciliation source drift")
            if sorted(prediction["accepted_references"]) != expected_scored:
                raise ValueError(f"{suite_id}:{row_id} reconciliation union drift")
            if prediction.get("ambiguity_class") != "cross_source_conflict":
                raise ValueError(
                    f"{suite_id}:{row_id} reconciliation ambiguity-class drift"
                )
            observed_reconciliations.add(input_text)
        prediction["evaluation_accepted_references"] = list(
            expected["accepted_references"]
        )
        rows.append(prediction)
    if observed_reconciliations != set(reconciliation_by_input):
        raise ValueError(f"unused or missing accepted-reference reconciliation in {suite_id}")
    if len(rows) != int(suite["expected_rows"]):
        raise ValueError(f"unexpected final row count in {suite_id}")
    return rows


def enrich_prediction(
    prediction: dict[str, Any],
    suite: dict[str, Any],
    source_index: dict[str, dict[str, Any]],
    target_index: dict[str, list[dict[str, Any]]],
    stages: list[ExposureStage],
    families: dict[str, Any],
) -> dict[str, Any]:
    references = [normalize(value) for value in prediction["accepted_references"]]
    normalized_prediction = normalize(prediction["prediction"])
    alignment = closest_reference_alignment(normalized_prediction, references)
    source_ids = [str(value) for value in prediction.get("source_record_ids") or []]
    profiles = []
    seen_profiles: set[str] = set()
    for source_id in source_ids:
        profile = source_index.get(source_id)
        if profile is None:
            continue
        primary_id = str(profile["sourceRecordId"])
        if primary_id not in seen_profiles:
            profiles.append(profile)
            seen_profiles.add(primary_id)
    stage_exposure = [
        exposure_for_row(
            stage,
            prediction["input_text"],
            prediction["accepted_references"],
            source_ids,
            prediction["prediction"],
        )
        for stage in stages
    ]
    cumulative = cumulative_exposure(stage_exposure)
    competitor_profiles = target_index.get(normalized_prediction, [])
    competitor_records = [
        {
            "source_record_id": row["sourceRecordId"],
            "source_prompt": (row.get("sourcePromptCandidate") or {}).get("source"),
            "source_definition": (row.get("sourcePromptCandidate") or {}).get(
                "definitionSource"
            ),
            "target": (row.get("sourceTargetCandidate") or {}).get("source"),
        }
        for row in competitor_profiles
    ]
    cluster_ids = sorted(
        {
            cluster_id
            for reference in references
            for cluster_id in families["clusters_by_surface"].get(reference, [])
        }
    )
    row = {
        "schema_version": 1,
        "model_id": suite["model_id"],
        "model_revision": suite["model_revision"],
        "suite": suite["suite"],
        "suite_role": suite["role"],
        "row_id": prediction["id"],
        "input_text": prediction["input_text"],
        "task": prediction["task"],
        "pair_kind": prediction["pair_kind"],
        "source_record_ids": source_ids,
        "evaluation_accepted_references": list(
            prediction.get("evaluation_accepted_references")
            or prediction["accepted_references"]
        ),
        "accepted_references": list(prediction["accepted_references"]),
        "accepted_reference_count": len(references),
        "ambiguity_class": prediction.get("ambiguity_class") or "unspecified",
        "construction_family": prediction.get("construction_family"),
        "template_id": prediction.get("template_id"),
        "prediction": prediction["prediction"],
        "normalized_prediction": normalized_prediction,
        "exact": bool(prediction["exact"]),
        "chrf2": float(prediction["chrf2"]),
        "grapheme_cluster_error_rate": float(prediction["grapheme_cer"]),
        "surface_class": prediction["surface_class"],
        "blank": bool(prediction["blank"]),
        "source_copy": bool(prediction["source_copy"]),
        "repeated_token_4gram": bool(prediction["repeated_token_4gram"]),
        "reference_token_length_bucket": prediction[
            "reference_token_length_bucket"
        ],
        "reference_grapheme_length_bucket": prediction[
            "reference_grapheme_length_bucket"
        ],
        "generated_token_count": int(prediction["generated_token_count"]),
        "closest_reference_alignment": alignment,
        "known_dictionary_target_prediction": bool(competitor_profiles),
        "known_target_substitution": bool(competitor_profiles)
        and normalized_prediction not in references,
        "prediction_target_source_records": competitor_records,
        "lineage_exposure": stage_exposure,
        "cumulative_documented_exposure": cumulative,
        "selected_checkpoint_stage_exposure": stage_exposure[-1],
        "reference_orthographic_suffix_cluster_ids": cluster_ids,
        "reference_orthographic_suffix_cluster_labels": [
            families["cluster_labels"][cluster_id] for cluster_id in cluster_ids
        ],
        "common_suffix_whitespace_units": max(
            common_suffix_whitespace_units(normalized_prediction, reference)
            for reference in references
        ),
        "semantic_cluster_status": "pending_embedding_clustering_and_review",
        "alignment_claim_limit": ALIGNMENT_CLAIM_LIMIT,
        "exposure_claim_limit": EXPOSURE_CLAIM_LIMIT,
        "claim_limit": CLAIM_LIMIT,
        **source_profile_summary(profiles),
    }
    return row


def mean(rows: list[dict[str, Any]], field: str) -> float | None:
    values = [float(row[field]) for row in rows if row.get(field) is not None]
    return statistics.fmean(values) if values else None


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    exact = sum(bool(row["exact"]) for row in rows)
    return {
        "rows": len(rows),
        "exact": exact,
        "exact_rate": exact / len(rows) if rows else None,
        "mean_chrf2": mean(rows, "chrf2"),
        "mean_grapheme_cluster_error_rate": mean(
            rows, "grapheme_cluster_error_rate"
        ),
        "failures": len(rows) - exact,
        "blank": sum(bool(row["blank"]) for row in rows),
        "source_copy": sum(bool(row["source_copy"]) for row in rows),
        "repeated_token_4gram": sum(
            bool(row["repeated_token_4gram"]) for row in rows
        ),
        "known_target_substitution_failures": sum(
            bool(row["known_target_substitution"]) and not row["exact"] for row in rows
        ),
        "unique_predictions": len({row["normalized_prediction"] for row in rows}),
    }


def grouped_summary(
    rows: list[dict[str, Any]], field: str
) -> dict[str, dict[str, Any]]:
    groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field, "(missing)"))].append(row)
    return {key: summarize(groups[key]) for key in sorted(groups)}


def annotate_prediction_collapse(rows: list[dict[str, Any]]) -> None:
    all_groups: Counter[str] = Counter(
        row["normalized_prediction"] for row in rows if row["suite_role"] == "lexical"
    )
    suite_groups: Counter[tuple[str, str]] = Counter(
        (row["suite"], row["normalized_prediction"]) for row in rows
    )
    for row in rows:
        row["prediction_population_count_all_lexical"] = all_groups[
            row["normalized_prediction"]
        ]
        row["prediction_population_count_within_suite"] = suite_groups[
            (row["suite"], row["normalized_prediction"])
        ]


def build_source_record_outcomes(
    current_profiles: list[dict[str, Any]], rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    direct_by_source: dict[str, dict[str, Any]] = {}
    context_by_source: dict[str, dict[str, Any]] = {}
    for row in rows:
        if row["suite"] == "lexical_direct_closed":
            destination = direct_by_source
        elif row["suite"] == "lexical_context_closed":
            destination = context_by_source
        else:
            continue
        for source_id in row["source_record_ids"]:
            if source_id in destination:
                raise ValueError(
                    f"duplicate {row['suite']} membership for source record {source_id}"
                )
            destination[source_id] = row
    expected_ids = {str(row["sourceRecordId"]) for row in current_profiles}
    if set(direct_by_source) != expected_ids:
        raise ValueError("direct suite does not cover every current source record")
    if set(context_by_source) != expected_ids:
        raise ValueError("context suite does not cover every current source record")
    outcomes = []
    for profile in sorted(current_profiles, key=lambda row: row["sourceRecordId"]):
        source_id = str(profile["sourceRecordId"])
        target = normalize((profile.get("sourceTargetCandidate") or {})["source"])
        direct = direct_by_source[source_id]
        context = context_by_source[source_id]
        direct_source_exact = direct["normalized_prediction"] == target
        context_source_exact = context["normalized_prediction"] == target
        if direct_source_exact and context_source_exact:
            outcome_class = "both_exact"
        elif direct_source_exact:
            outcome_class = "direct_only_exact"
        elif context_source_exact:
            outcome_class = "context_only_exact"
        else:
            outcome_class = "neither_exact"
        outcomes.append(
            {
                "schema_version": 1,
                "source_record_id": source_id,
                "census_record_id": profile["censusRecordId"],
                "source_prompt": (profile.get("sourcePromptCandidate") or {}).get(
                    "source"
                ),
                "source_definition": (
                    profile.get("sourcePromptCandidate") or {}
                ).get("definitionSource"),
                "source_target": (profile.get("sourceTargetCandidate") or {}).get(
                    "source"
                ),
                "structural_stratum": profile.get("structuralStratum"),
                "blocker_codes": list(profile.get("blockerCodes") or []),
                "part_of_speech": profile.get("partOfSpeech"),
                "structural_features": profile.get("structuralFeatures"),
                "evidence_coverage": profile.get("evidenceCoverage"),
                "outcome_class": outcome_class,
                "direct": {
                    "row_id": direct["row_id"],
                    "group_exact": direct["exact"],
                    "source_target_exact": direct_source_exact,
                    "prediction": direct["prediction"],
                    "surface_class": direct["surface_class"],
                    "ambiguity_class": direct["ambiguity_class"],
                    "known_target_substitution": direct["known_target_substitution"],
                    "cumulative_documented_exposure": direct[
                        "cumulative_documented_exposure"
                    ],
                },
                "context": {
                    "row_id": context["row_id"],
                    "source_target_exact": context_source_exact,
                    "prediction": context["prediction"],
                    "surface_class": context["surface_class"],
                    "known_target_substitution": context[
                        "known_target_substitution"
                    ],
                    "selected_checkpoint_stage_exposure": context[
                        "selected_checkpoint_stage_exposure"
                    ],
                    "cumulative_documented_exposure": context[
                        "cumulative_documented_exposure"
                    ],
                },
                "semantic_cluster_status": "pending_embedding_clustering_and_review",
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return outcomes


def build_confusions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: defaultdict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["exact"] or not row["known_target_substitution"]:
            continue
        reference = row["closest_reference_alignment"]["closest_normalized_reference"]
        groups[(row["suite"], reference, row["normalized_prediction"])].append(row)
    result = []
    for (suite, reference, prediction), members in groups.items():
        result.append(
            {
                "suite": suite,
                "reference": reference,
                "prediction": prediction,
                "rows": len(members),
                "source_record_ids": sorted(
                    {
                        source_id
                        for row in members
                        for source_id in row["source_record_ids"]
                    }
                ),
                "row_id_sample": sorted(row["row_id"] for row in members)[:20],
                "prediction_target_source_records": members[0][
                    "prediction_target_source_records"
                ],
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return sorted(
        result,
        key=lambda row: (-row["rows"], row["suite"], row["reference"], row["prediction"]),
    )


def build_collapse(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[(row["suite"], row["normalized_prediction"])].append(row)
    result = []
    for (suite, prediction), members in groups.items():
        result.append(
            {
                "suite": suite,
                "prediction": prediction,
                "rows": len(members),
                "exact_rows": sum(bool(row["exact"]) for row in members),
                "failure_rows": sum(not row["exact"] for row in members),
                "known_dictionary_target": bool(
                    members[0]["prediction_target_source_records"]
                ),
                "row_id_sample": sorted(row["row_id"] for row in members)[:20],
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return sorted(result, key=lambda row: (row["suite"], -row["rows"], row["prediction"]))


def stage_exposure_slice(
    rows: list[dict[str, Any]], stage_index: int
) -> dict[str, dict[str, Any]]:
    exposed = [
        row
        for row in rows
        if row["lineage_exposure"][stage_index]["accepted_pair_presentations"] > 0
    ]
    unexposed = [
        row
        for row in rows
        if row["lineage_exposure"][stage_index]["accepted_pair_presentations"] == 0
    ]
    return {"exposed": summarize(exposed), "unexposed": summarize(unexposed)}


def build_orthographic_report(
    rows: list[dict[str, Any]], families: dict[str, Any]
) -> list[dict[str, Any]]:
    result = []
    for cluster in families["clusters"]:
        members = [
            row
            for row in rows
            if cluster["cluster_id"]
            in row["reference_orthographic_suffix_cluster_ids"]
        ]
        result.append(
            {
                **cluster,
                "all_lexical": summarize(members),
                "direct": summarize(
                    [row for row in members if row["suite"] == "lexical_direct_closed"]
                ),
                "context": summarize(
                    [
                        row
                        for row in members
                        if row["suite"] == "lexical_context_closed"
                    ]
                ),
            }
        )
    return result


def build_hypotheses(
    rows: list[dict[str, Any]], source_outcomes: list[dict[str, Any]], stages: list[ExposureStage]
) -> dict[str, Any]:
    direct = [row for row in rows if row["suite"] == "lexical_direct_closed"]
    one_target = [row for row in direct if row["ambiguity_class"] == "one_target"]
    multiple = [
        row for row in direct if row["ambiguity_class"] == "multiple_accepted_targets"
    ]
    context = [row for row in rows if row["suite"] == "lexical_context_closed"]
    lexical_failures = [
        row for row in rows if row["suite_role"] == "lexical" and not row["exact"]
    ]
    synthetic_failures = [
        row
        for row in rows
        if row["suite"] == "synthetic_holdout" and not row["exact"]
    ]
    context_selected = stage_exposure_slice(context, len(stages) - 1)
    one_target_cumulative_exposed = [
        row
        for row in one_target
        if row["cumulative_documented_exposure"]["accepted_pair_presentations"] > 0
    ]
    outcome_classes = Counter(row["outcome_class"] for row in source_outcomes)
    direct_source_exact = (
        outcome_classes["both_exact"] + outcome_classes["direct_only_exact"]
    )
    context_source_exact = (
        outcome_classes["both_exact"] + outcome_classes["context_only_exact"]
    )
    return {
        "schema_version": 1,
        "status": "post_hoc_hypotheses_for_preregistered_follow_up_not_causal_findings",
        "hypotheses": [
            {
                "id": "H1_prompt_ambiguity_is_a_separate_task",
                "evidence": {
                    "one_target": summarize(one_target),
                    "multiple_accepted_targets": summarize(multiple),
                },
                "interpretation": (
                    "Unconditioned multi-target prompts should not be pooled with "
                    "one-target reconstruction; the next benchmark must score sense "
                    "selection separately."
                ),
            },
            {
                "id": "H2_one_context_replay_is_not_an_explanation",
                "evidence": context_selected,
                "interpretation": (
                    "The selected checkpoint consumed only a subset of context rows. "
                    "The exposed/unexposed contrast is descriptive and supports a "
                    "dose-controlled context experiment, not a causal claim."
                ),
            },
            {
                "id": "H3_more_isolated_replay_alone_is_unlikely_to_solve_selection",
                "evidence": {
                    "cumulatively_exposed_one_target_rows": summarize(
                        one_target_cumulative_exposed
                    ),
                    "cumulatively_exposed_one_target_failures": sum(
                        not row["exact"] for row in one_target_cumulative_exposed
                    ),
                },
                "interpretation": (
                    "Every one-target direct prompt was explicitly exposed in the "
                    "selected lineage, yet failures remain. The follow-up should test "
                    "competition-aware and sentence-conditioned supervision instead of "
                    "only increasing isolated-pair epochs."
                ),
            },
            {
                "id": "H4_wrong_known_target_selection_is_the_primary_lexical_failure",
                "evidence": {
                    "lexical_failures": len(lexical_failures),
                    "known_target_substitutions": sum(
                        row["known_target_substitution"] for row in lexical_failures
                    ),
                    "surface_classes": dict(
                        sorted(Counter(row["surface_class"] for row in lexical_failures).items())
                    ),
                },
                "interpretation": (
                    "Most lexical failures select another recorded Wajarri surface. "
                    "Confusion groups and sense-qualified contexts should drive the next "
                    "data commission."
                ),
            },
            {
                "id": "H5_sentence_holdout_is_lexically_not_structurally_discriminating",
                "evidence": {
                    "synthetic_failures": len(synthetic_failures),
                    "failures_preserving_at_least_one_final_whitespace_unit": sum(
                        row["common_suffix_whitespace_units"] > 0
                        for row in synthetic_failures
                    ),
                    "construction_families": dict(
                        sorted(
                            Counter(
                                row["construction_family"] for row in synthetic_failures
                            ).items()
                        )
                    ),
                },
                "interpretation": (
                    "The closed synthetic holdout primarily diagnoses lexical slot "
                    "selection inside six known constructions. New held-out construction "
                    "families and morphology contrasts are required."
                ),
            },
            {
                "id": "H6_raw_definition_context_is_currently_harmful",
                "evidence": {
                    "source_records": len(source_outcomes),
                    "direct_source_exact": direct_source_exact,
                    "context_source_exact": context_source_exact,
                    "direct_only_exact": outcome_classes["direct_only_exact"],
                    "context_only_exact": outcome_classes["context_only_exact"],
                    "paired_exact_rate_difference": (
                        (context_source_exact - direct_source_exact)
                        / len(source_outcomes)
                    ),
                },
                "interpretation": (
                    "On paired source records, the raw definition-context prompt loses "
                    "many more exact source targets than it gains. The follow-up should "
                    "replace prose definitions with governed POS/sense labels and "
                    "sentence-conditioned lexical use; this descriptive comparison does "
                    "not identify which prompt component caused the loss."
                ),
            },
        ],
        "source_record_outcome_classes": dict(sorted(outcome_classes.items())),
        "claim_limit": CLAIM_LIMIT,
    }


def main() -> None:
    args = parse_args()
    contract_path = args.contract.expanduser().resolve()
    program_root = args.program_root.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = read_json(contract_path)
    if contract.get("method_id") != METHOD_ID:
        raise ValueError("analysis contract method ID mismatch")
    contract_sha256 = sha256_file(contract_path)

    current_profiles, source_index = load_source_profiles(
        program_root, contract["lexical_source_census"]
    )
    target_index: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for profile in current_profiles:
        target = normalize((profile.get("sourceTargetCandidate") or {}).get("source"))
        target_index[target].append(profile)

    stages = [build_stage(program_root, stage) for stage in contract["lineage_stages"]]
    raw_predictions: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for suite in contract["suites"]:
        for prediction in validate_prediction_suite(program_root, suite):
            raw_predictions.append((prediction, suite))
    expected_total = sum(int(suite["expected_rows"]) for suite in contract["suites"])
    if len(raw_predictions) != expected_total:
        raise ValueError("total prediction population mismatch")
    if len({row["id"] for row, _ in raw_predictions}) != len(raw_predictions):
        raise ValueError("prediction IDs are not globally unique")

    families = discover_orthographic_suffix_clusters(
        prediction["accepted_references"]
        for prediction, suite in raw_predictions
        if suite["role"] == "lexical"
    )
    rows = [
        enrich_prediction(
            prediction, suite, source_index, target_index, stages, families
        )
        for prediction, suite in raw_predictions
    ]
    annotate_prediction_collapse(rows)
    rows.sort(key=lambda row: (row["suite"], row["row_id"]))
    failures = [row for row in rows if not row["exact"]]
    lexical_failures = [row for row in failures if row["suite_role"] == "lexical"]
    source_outcomes = build_source_record_outcomes(current_profiles, rows)
    source_failures = [
        row for row in source_outcomes if row["outcome_class"] != "both_exact"
    ]
    confusions = build_confusions(rows)
    collapse = build_collapse(rows)
    orthographic_report = build_orthographic_report(
        [row for row in rows if row["suite_role"] == "lexical"], families
    )
    hypotheses = build_hypotheses(rows, source_outcomes, stages)

    direct = [row for row in rows if row["suite"] == "lexical_direct_closed"]
    one_target = [row for row in direct if row["ambiguity_class"] == "one_target"]
    context = [row for row in rows if row["suite"] == "lexical_context_closed"]
    current_count = len(current_profiles)
    source_layers = Counter(
        row.get("sourceLayer")
        for row in read_jsonl(
            resolve_within(
                program_root,
                contract["lexical_source_census"]["path"],
                "lexical source census",
            )
        )
    )
    summary = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
            "grapheme_engine": {
                "package": "regex",
                "version": regex.__version__,
                "pattern": r"\X",
            },
        },
        "status": "PASS_COMPLETE_WAJARRI_V2_BASELINE_FAILURE_LEDGER",
        "created_at_utc": contract["created_at_utc"],
        "contract": {"path": str(contract_path), "sha256": contract_sha256},
        "model": contract["model"],
        "population_reconciliation": {
            "current_dictionary_source_records": current_count,
            "historical_dictionary_source_records": source_layers["historical"],
            "all_dictionary_source_records": sum(source_layers.values()),
            "direct_prompt_groups": len(direct),
            "selected_model_source_context_rows": len(context),
            "selected_model_lexical_outcomes": len(direct) + len(context),
            "older_grouped_benchmark_rows": contract[
                "older_grouped_benchmark_rows"
            ],
            "older_grouped_benchmark_interpretation": (
                "The older 3,016 count is 1,408 prompt groups plus 1,608 grouped "
                "definition contexts. It is not a count of dictionary source records."
            ),
        },
        "total_evaluation_rows": len(rows),
        "total_failures": len(failures),
        "lexical_failures": len(lexical_failures),
        "source_record_outcomes": len(source_outcomes),
        "source_record_failures": len(source_failures),
        "suites": {
            suite: summarize([row for row in rows if row["suite"] == suite])
            for suite in sorted({row["suite"] for row in rows})
        },
        "direct_one_target": summarize(one_target),
        "direct_by_ambiguity_class": grouped_summary(direct, "ambiguity_class"),
        "lexical_failure_surface_classes": dict(
            sorted(Counter(row["surface_class"] for row in lexical_failures).items())
        ),
        "lineage_stages": [
            {
                "stage_id": stage.stage_id,
                "presentations": stage.presentations,
                "unique_pairs": stage.unique_pairs,
                "rows": stage.input_component,
                "exposure_ledger": stage.exposure_component,
                "direct_one_target": stage_exposure_slice(one_target, index),
                "definition_context": stage_exposure_slice(context, index),
            }
            for index, stage in enumerate(stages)
        ],
        "artifacts": {
            "all_rows": "ALL-ROWS.jsonl",
            "failures": "FAILURES.jsonl",
            "lexical_failures": "LEXICAL-FAILURES.jsonl",
            "source_record_outcomes": "SOURCE-RECORD-OUTCOMES.jsonl",
            "source_record_failures": "SOURCE-RECORD-FAILURES.jsonl",
            "known_target_confusions": "KNOWN-TARGET-CONFUSIONS.jsonl",
            "prediction_collapse": "PREDICTION-COLLAPSE.jsonl",
            "orthographic_surface_families": "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl",
            "hypotheses": "HYPOTHESES.json",
        },
        "claim_limit": CLAIM_LIMIT,
        "exposure_claim_limit": EXPOSURE_CLAIM_LIMIT,
    }

    output_dir.mkdir(parents=True)
    write_json_atomic(output_dir / "SUMMARY.json", summary)
    write_json_atomic(output_dir / "HYPOTHESES.json", hypotheses)
    write_jsonl_atomic(output_dir / "ALL-ROWS.jsonl", rows)
    write_jsonl_atomic(output_dir / "FAILURES.jsonl", failures)
    write_jsonl_atomic(output_dir / "LEXICAL-FAILURES.jsonl", lexical_failures)
    write_jsonl_atomic(output_dir / "SOURCE-RECORD-OUTCOMES.jsonl", source_outcomes)
    write_jsonl_atomic(output_dir / "SOURCE-RECORD-FAILURES.jsonl", source_failures)
    write_jsonl_atomic(output_dir / "KNOWN-TARGET-CONFUSIONS.jsonl", confusions)
    write_jsonl_atomic(output_dir / "PREDICTION-COLLAPSE.jsonl", collapse)
    write_jsonl_atomic(
        output_dir / "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl", orthographic_report
    )
    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    manifest = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": contract["created_at_utc"],
        "method_id": METHOD_ID,
        "contract": {"path": str(contract_path), "sha256": contract_sha256},
        "implementation_sha256": sha256_file(Path(__file__).resolve()),
        "outputs": {
            path.name: {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
            for path in files
        },
        "claim_limit": CLAIM_LIMIT,
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    (output_dir / "OUTPUT-SHA256SUMS").write_text(
        "".join(f"{sha256_file(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

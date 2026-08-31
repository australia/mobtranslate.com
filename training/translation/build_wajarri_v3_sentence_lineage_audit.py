#!/usr/bin/env python3
"""Build the checksum-bound Wajarri v2 sentence lineage and composition audit."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-v2-sentence-lineage-audit-v1.1"
SYNTHETIC_KINDS = {
    "controlled_research_synthetic_sentence",
    "synthetic_candidate",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number}: expected a JSON object")
            rows.append(value)
    return rows


def resolve_input(
    program_root: Path, component: dict[str, Any]
) -> tuple[Path, list[dict[str, Any]]]:
    path = (program_root / component["path"]).resolve()
    if program_root.resolve() not in path.parents:
        raise ValueError(f"input escapes program root: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    actual_hash = sha256_file(path)
    if actual_hash != component["sha256"]:
        raise ValueError(
            f"SHA-256 mismatch for {path}: expected {component['sha256']}, got {actual_hash}"
        )
    rows = load_jsonl(path)
    if len(rows) != int(component["rows"]):
        raise ValueError(
            f"row-count mismatch for {path}: expected {component['rows']}, got {len(rows)}"
        )
    return path, rows


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def write_text_atomic(path: Path, text: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def write_json_atomic(path: Path, value: Any) -> None:
    write_text_atomic(
        path,
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    )


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    write_text_atomic(path, "".join(canonical_json(row) + "\n" for row in rows))


def normalize_surface(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split()).strip(
        " .?!,;:"
    )


def first_unit(value: str) -> str:
    normalized = normalize_surface(value)
    return normalized.split(" ", 1)[0] if normalized else ""


def final_units(value: str) -> str:
    normalized = normalize_surface(value)
    parts = normalized.split(" ", 1)
    return parts[1] if len(parts) == 2 else ""


def compatibility_corpus_id(review: dict[str, Any]) -> str:
    prefix = "wbv-v2-compatibility:"
    review_id = str(review["review_id"])
    if not review_id.startswith(prefix):
        raise ValueError(f"unexpected compatibility review ID: {review_id}")
    return "wbv-v2-synthetic:" + review_id.removeprefix(prefix)


def pair_key(row: dict[str, Any]) -> tuple[str, str]:
    return (
        normalize_surface(str(row["input_text"])),
        normalize_surface(str(row["output_text"])),
    )


def build_corpus_provenance(
    corpus: list[dict[str, Any]],
    sentence_reviews: list[dict[str, Any]],
    compatibility_reviews: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    sentence_by_id = {row["id"]: row for row in sentence_reviews}
    included_compatibility = {
        compatibility_corpus_id(row): row
        for row in compatibility_reviews
        if row.get("decision") == "include_research_synthetic"
    }
    rows = []
    for row in corpus:
        inline_binding_id = (row.get("grammar_audit") or {}).get("binding_set_id")
        if inline_binding_id:
            provenance_class = "inline_explicit_binding_provenance"
            external_sentence_review = sentence_by_id.get(row["id"])
            external_compatibility_review = included_compatibility.get(row["id"])
        else:
            provenance_class = "external_review_ledger_provenance"
            external_sentence_review = sentence_by_id.get(row["id"])
            external_compatibility_review = included_compatibility.get(row["id"])
            if external_sentence_review is None or external_compatibility_review is None:
                raise ValueError(
                    f"externally governed corpus row lacks both review joins: {row['id']}"
                )
        rows.append(
            {
                "schema_version": 1,
                "row_id": row["id"],
                "input_text": row["input_text"],
                "output_text": row["output_text"],
                "split": row["split"],
                "construction_family": row["construction_family"],
                "template_id": row["template_id"],
                "provenance_class": provenance_class,
                "inline_binding_id": inline_binding_id,
                "sentence_review_id": (
                    external_sentence_review.get("id")
                    if external_sentence_review is not None
                    else None
                ),
                "sentence_review_training_eligible": (
                    external_sentence_review.get("training_eligible_for_research")
                    if external_sentence_review is not None
                    else None
                ),
                "compatibility_review_id": (
                    external_compatibility_review.get("review_id")
                    if external_compatibility_review is not None
                    else None
                ),
                "compatibility_decision": (
                    external_compatibility_review.get("decision")
                    if external_compatibility_review is not None
                    else None
                ),
                "claim_limit": (
                    "Inline and external provenance classes describe record shape. "
                    "Neither class is speaker-attested reference gold."
                ),
            }
        )
    return sorted(rows, key=lambda row: row["row_id"])


def build_selected_sentence_presentations(
    schedule: list[dict[str, Any]],
    presentation_limit: int,
    private_synthetic_lineage: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    provenance_by_id = {row["row_id"]: row for row in private_synthetic_lineage}
    rows = []
    for presentation_index, row in enumerate(schedule[:presentation_limit], start=1):
        if row["schedule_role"] != "sentence_context_retention":
            continue
        pair_kind = row["pair_kind"]
        parent_id = row["accounting_parent_id"]
        if pair_kind in SYNTHETIC_KINDS:
            provenance = provenance_by_id.get(parent_id)
            if provenance is None:
                raise ValueError(
                    f"selected synthetic parent is absent from private training data: {parent_id}"
                )
            evidence_class = "synthetic"
            provenance_class = provenance["provenance_class"]
            parent_visibility = provenance["parent_visibility"]
            public_pair_duplicate_ids = provenance["public_pair_duplicate_ids"]
            public_holdout_pair_collision = provenance[
                "public_holdout_pair_collision"
            ]
        elif pair_kind == "published_historical_sentence_witness":
            evidence_class = "historical_source_witness"
            provenance_class = "historical_source_record"
            parent_visibility = "private_training_parent"
            public_pair_duplicate_ids = []
            public_holdout_pair_collision = False
        else:
            raise ValueError(f"unexpected sentence-retention pair kind: {pair_kind}")
        rows.append(
            {
                "schema_version": 1,
                "presentation_index": presentation_index,
                "presentation_id": row["id"],
                "parent_id": parent_id,
                "pair_kind": pair_kind,
                "evidence_class": evidence_class,
                "provenance_class": provenance_class,
                "parent_visibility": parent_visibility,
                "public_pair_duplicate_ids": public_pair_duplicate_ids,
                "public_holdout_pair_collision": public_holdout_pair_collision,
                "input_text": row["input_text"],
                "output_text": row["output_text"],
                "construction_family": row.get("construction_family"),
                "template_id": row.get("template_id"),
                "claim_limit": (
                    "A selected optimizer presentation is exposure, not an independent "
                    "linguistic observation or proof of learning."
                ),
            }
        )
    return rows


def build_private_synthetic_lineage(
    private_train: list[dict[str, Any]],
    corpus_provenance: list[dict[str, Any]],
    sentence_reviews: list[dict[str, Any]],
    compatibility_reviews: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    public_by_id = {row["row_id"]: row for row in corpus_provenance}
    public_by_pair: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in corpus_provenance:
        public_by_pair[pair_key(row)].append(row)

    sentence_by_id = {row["id"]: row for row in sentence_reviews}
    included_compatibility = {
        compatibility_corpus_id(row): row
        for row in compatibility_reviews
        if row.get("decision") == "include_research_synthetic"
    }

    result = []
    for row in private_train:
        if row.get("pair_kind") not in SYNTHETIC_KINDS:
            continue
        public_parent = public_by_id.get(row["id"])
        public_pair_duplicates = [
            candidate
            for candidate in public_by_pair.get(pair_key(row), [])
            if candidate["row_id"] != row["id"]
        ]
        if public_parent is not None:
            parent_visibility = "public_parent_id"
        elif public_pair_duplicates:
            parent_visibility = "private_parent_id_with_public_pair_duplicate"
        else:
            parent_visibility = "private_only_parent"

        inline_binding_id = (row.get("grammar_audit") or {}).get("binding_set_id")
        sentence_review = sentence_by_id.get(row["id"])
        compatibility_review = included_compatibility.get(row["id"])
        if inline_binding_id:
            provenance_class = "inline_explicit_binding_provenance"
        else:
            provenance_class = "external_review_ledger_provenance"
            if sentence_review is None or compatibility_review is None:
                raise ValueError(
                    f"private synthetic row lacks both external review joins: {row['id']}"
                )

        public_holdout_duplicates = [
            candidate
            for candidate in public_pair_duplicates
            if candidate["split"] == "holdout"
        ]
        result.append(
            {
                "schema_version": 1,
                "row_id": row["id"],
                "pair_kind": row["pair_kind"],
                "split": row["split"],
                "construction_family": row.get("construction_family"),
                "template_id": row.get("template_id"),
                "provenance_class": provenance_class,
                "inline_binding_id": inline_binding_id,
                "sentence_review_id": (
                    sentence_review.get("id") if sentence_review is not None else None
                ),
                "compatibility_review_id": (
                    compatibility_review.get("review_id")
                    if compatibility_review is not None
                    else None
                ),
                "parent_visibility": parent_visibility,
                "public_parent_id": (
                    public_parent["row_id"] if public_parent is not None else None
                ),
                "public_pair_duplicate_ids": sorted(
                    candidate["row_id"] for candidate in public_pair_duplicates
                ),
                "public_pair_duplicate_splits": sorted(
                    {candidate["split"] for candidate in public_pair_duplicates}
                ),
                "public_holdout_pair_collision": bool(public_holdout_duplicates),
                "rights_tier": row.get("rights_tier"),
                "claim_limit": (
                    "Parent visibility records release identity and pair-level split "
                    "collisions. It does not change the linguistic status of a synthetic row."
                ),
            }
        )
    return sorted(result, key=lambda item: item["row_id"])


def build_pair_split_collisions(
    private_synthetic_lineage: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {
            "schema_version": 1,
            "private_train_parent_id": row["row_id"],
            "public_holdout_pair_ids": row["public_pair_duplicate_ids"],
            "construction_family": row["construction_family"],
            "template_id": row["template_id"],
            "claim_limit": (
                "The same normalized source-target pair occurs in private train and "
                "public holdout under different record identifiers."
            ),
        }
        for row in private_synthetic_lineage
        if row["public_holdout_pair_collision"]
    ]


def local_source_ids(row: dict[str, Any]) -> list[str]:
    suffix = "-sense-candidate"
    return [
        value.removesuffix(suffix)
        for value in row.get("source_record_ids", [])
        if str(value).startswith("wbv-src-local-")
    ]


def build_holdout_composition_rows(
    predictions: list[dict[str, Any]],
    source_outcomes: list[dict[str, Any]],
    corpus: list[dict[str, Any]],
    corpus_provenance: list[dict[str, Any]],
    sentence_reviews: list[dict[str, Any]],
    compatibility_reviews: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    outcomes_by_id = {row["source_record_id"]: row for row in source_outcomes}
    provenance_by_id = {row["row_id"]: row for row in corpus_provenance}
    provenance_by_pair: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(
        list
    )
    for provenance in corpus_provenance:
        provenance_by_pair[pair_key(provenance)].append(provenance)
    externally_reviewed_ids = {row["id"] for row in sentence_reviews} & {
        compatibility_corpus_id(row)
        for row in compatibility_reviews
        if row.get("decision") == "include_research_synthetic"
    }
    training_subject_rows: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in corpus:
        if row["split"] == "train":
            training_subject_rows[first_unit(row["output_text"])].append(row)

    result = []
    for row in predictions:
        reference = row["accepted_references"][0]
        corpus_row = provenance_by_id.get(row["id"])
        corpus_identity_resolution = "exact_row_id"
        if corpus_row is None:
            pair_matches = provenance_by_pair.get(
                (
                    normalize_surface(str(row["input_text"])),
                    normalize_surface(str(reference)),
                ),
                [],
            )
            if len(pair_matches) != 1:
                raise ValueError(
                    f"holdout row {row['id']} has {len(pair_matches)} public pair matches"
                )
            corpus_row = pair_matches[0]
            corpus_identity_resolution = "normalized_pair_duplicate"
        if row["id"] in externally_reviewed_ids:
            evaluation_provenance_class = "external_review_ledger_provenance"
        elif corpus_identity_resolution == "exact_row_id":
            evaluation_provenance_class = corpus_row["provenance_class"]
        else:
            raise ValueError(
                f"holdout row {row['id']} lacks evaluation-record provenance"
            )
        expected_subject = first_unit(reference)
        predicted_subject = first_unit(row["prediction"])
        expected_predicate = final_units(reference)
        predicted_predicate = final_units(row["prediction"])

        candidates = [
            outcomes_by_id[source_id]
            for source_id in local_source_ids(row)
            if source_id in outcomes_by_id
        ]
        comparable = next(
            (
                candidate
                for candidate in candidates
                if normalize_surface(candidate["source_target"]) == expected_subject
            ),
            None,
        )
        subject_training = training_subject_rows[expected_subject]
        same_family_training = [
            candidate
            for candidate in subject_training
            if candidate["construction_family"] == row["construction_family"]
        ]
        direct_prediction = comparable["direct"]["prediction"] if comparable else None
        direct_exact = (
            bool(comparable["direct"]["source_target_exact"]) if comparable else None
        )
        context_exact = (
            bool(comparable["context"]["source_target_exact"]) if comparable else None
        )
        result.append(
            {
                "schema_version": 1,
                "row_id": row["id"],
                "public_corpus_row_id": corpus_row["row_id"],
                "corpus_identity_resolution": corpus_identity_resolution,
                "input_text": row["input_text"],
                "reference": reference,
                "sentence_prediction": row["prediction"],
                "sentence_exact": bool(row["exact"]),
                "construction_family": row["construction_family"],
                "template_id": row["template_id"],
                "expected_subject": expected_subject,
                "predicted_subject": predicted_subject,
                "expected_final_predicate_units": expected_predicate,
                "predicted_final_predicate_units": predicted_predicate,
                "final_predicate_units_preserved": expected_predicate == predicted_predicate,
                "local_lexical_comparison_status": (
                    "comparable_exact_target" if comparable else "no_exact_local_target_join"
                ),
                "local_source_record_id": (
                    comparable["source_record_id"] if comparable else None
                ),
                "lexical_direct_prediction": direct_prediction,
                "lexical_direct_source_target_exact": direct_exact,
                "lexical_context_source_target_exact": context_exact,
                "sentence_subject_matches_direct_lexical_prediction": (
                    predicted_subject == normalize_surface(direct_prediction)
                    if direct_prediction is not None
                    else None
                ),
                "corpus_train_rows_with_expected_subject": len(subject_training),
                "corpus_train_families_with_expected_subject": sorted(
                    {candidate["construction_family"] for candidate in subject_training}
                ),
                "same_family_corpus_train_rows_with_expected_subject": len(
                    same_family_training
                ),
                "evaluation_provenance_class": evaluation_provenance_class,
                "public_corpus_provenance_class": corpus_row["provenance_class"],
                "claim_limit": (
                    "This paired diagnostic separates isolated lexical reconstruction "
                    "from sentence-slot realization on a development-consumed synthetic set. "
                    "It is descriptive and non-causal."
                ),
            }
        )
    return sorted(result, key=lambda row: row["row_id"])


def assert_expected(actual: dict[str, int], expected: dict[str, Any]) -> None:
    mismatches = []
    for key, expected_value in expected.items():
        if key not in actual:
            mismatches.append(f"{key}: metric is not implemented")
            continue
        if actual[key] != int(expected_value):
            mismatches.append(
                f"{key}: expected {expected_value}, got {actual[key]}"
            )
    if mismatches:
        raise ValueError("metric mismatches:\n- " + "\n- ".join(mismatches))


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    contract_path = args.contract.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")

    contract = load_json(contract_path)
    if contract["schema_version"] != 1:
        raise ValueError("unsupported contract schema")
    resolved: dict[str, list[dict[str, Any]]] = {}
    manifest_inputs = {}
    for name, component in contract["inputs"].items():
        _, rows = resolve_input(program_root, component)
        resolved[name] = rows
        manifest_inputs[name] = dict(component)

    corpus_provenance = build_corpus_provenance(
        resolved["controlled_synthetic_corpus"],
        resolved["sentence_reviews"],
        resolved["compatibility_reviews"],
    )
    private_synthetic_lineage = build_private_synthetic_lineage(
        resolved["private_train_full"],
        corpus_provenance,
        resolved["sentence_reviews"],
        resolved["compatibility_reviews"],
    )
    pair_split_collisions = build_pair_split_collisions(private_synthetic_lineage)
    selected_presentations = build_selected_sentence_presentations(
        resolved["selected_checkpoint_schedule"],
        int(contract["selected_checkpoint_presentations"]),
        private_synthetic_lineage,
    )
    holdout_rows = build_holdout_composition_rows(
        resolved["synthetic_holdout_predictions"],
        resolved["source_record_outcomes"],
        resolved["controlled_synthetic_corpus"],
        corpus_provenance,
        resolved["sentence_reviews"],
        resolved["compatibility_reviews"],
    )

    external_rows = [
        row
        for row in corpus_provenance
        if row["provenance_class"] == "external_review_ledger_provenance"
    ]
    sentence_synthetic = [
        row for row in selected_presentations if row["evidence_class"] == "synthetic"
    ]
    sentence_historical = [
        row
        for row in selected_presentations
        if row["evidence_class"] == "historical_source_witness"
    ]
    comparable = [
        row
        for row in holdout_rows
        if row["local_lexical_comparison_status"] == "comparable_exact_target"
    ]
    failed_comparable = [
        row for row in comparable if not row["sentence_exact"]
    ]
    private_synthetic_pair_keys = {
        pair_key(row)
        for row in resolved["private_train_full"]
        if row.get("pair_kind") in SYNTHETIC_KINDS
    }
    reported_holdout_pair_collisions = [
        row
        for row in resolved["synthetic_holdout_predictions"]
        if (
            normalize_surface(str(row["input_text"])),
            normalize_surface(str(row["accepted_references"][0])),
        )
        in private_synthetic_pair_keys
    ]
    direct_failure_source_record_counts = Counter(
        row["local_source_record_id"]
        for row in comparable
        if row["lexical_direct_source_target_exact"] is False
    )
    public_holdout_collision_ids = {
        row_id
        for row in pair_split_collisions
        for row_id in row["public_holdout_pair_ids"]
    }
    actual = {
        "inline_provenance_rows": len(corpus_provenance) - len(external_rows),
        "external_review_provenance_rows": len(external_rows),
        "external_rows_with_sentence_review": sum(
            row["sentence_review_id"] is not None for row in external_rows
        ),
        "external_rows_with_compatibility_inclusion": sum(
            row["compatibility_decision"] == "include_research_synthetic"
            for row in external_rows
        ),
        "selected_sentence_retention_presentations": len(selected_presentations),
        "selected_synthetic_presentations": len(sentence_synthetic),
        "selected_historical_presentations": len(sentence_historical),
        "private_synthetic_train_rows": len(private_synthetic_lineage),
        "private_synthetic_public_parent_ids": sum(
            row["parent_visibility"] == "public_parent_id"
            for row in private_synthetic_lineage
        ),
        "private_synthetic_private_parent_public_pair_duplicate": sum(
            row["parent_visibility"]
            == "private_parent_id_with_public_pair_duplicate"
            for row in private_synthetic_lineage
        ),
        "private_synthetic_private_only_parent": sum(
            row["parent_visibility"] == "private_only_parent"
            for row in private_synthetic_lineage
        ),
        "private_train_public_holdout_pair_collisions": len(pair_split_collisions),
        "public_holdout_rows_with_private_train_pair_collision": len(
            public_holdout_collision_ids
        ),
        "selected_synthetic_public_parent_ids": sum(
            row["parent_visibility"] == "public_parent_id"
            for row in sentence_synthetic
        ),
        "selected_synthetic_private_parent_public_pair_duplicate": sum(
            row["parent_visibility"]
            == "private_parent_id_with_public_pair_duplicate"
            for row in sentence_synthetic
        ),
        "selected_public_holdout_pair_collisions": sum(
            row["public_holdout_pair_collision"] for row in sentence_synthetic
        ),
        "reported_holdout_rows_with_private_train_pair_collision": len(
            reported_holdout_pair_collisions
        ),
        "holdout_rows": len(holdout_rows),
        "holdout_rows_resolved_by_pair_duplicate": sum(
            row["corpus_identity_resolution"] == "normalized_pair_duplicate"
            for row in holdout_rows
        ),
        "holdout_evaluation_external_review_provenance_rows": sum(
            row["evaluation_provenance_class"]
            == "external_review_ledger_provenance"
            for row in holdout_rows
        ),
        "holdout_public_corpus_inline_identity_rows": sum(
            row["public_corpus_provenance_class"]
            == "inline_explicit_binding_provenance"
            for row in holdout_rows
        ),
        "holdout_exact": sum(row["sentence_exact"] for row in holdout_rows),
        "holdout_local_lexical_comparable": len(comparable),
        "holdout_local_direct_lexical_exact": sum(
            row["lexical_direct_source_target_exact"] is True for row in comparable
        ),
        "holdout_local_direct_lexical_fail": sum(
            row["lexical_direct_source_target_exact"] is False for row in comparable
        ),
        "holdout_sentence_exact_local_comparable": sum(
            row["sentence_exact"] for row in comparable
        ),
        "holdout_sentence_exact_with_local_direct_exact": sum(
            row["sentence_exact"]
            and row["lexical_direct_source_target_exact"] is True
            for row in comparable
        ),
        "holdout_sentence_fail_with_local_direct_exact": sum(
            not row["sentence_exact"]
            and row["lexical_direct_source_target_exact"] is True
            for row in comparable
        ),
        "holdout_sentence_fail_with_both_lexical_tasks_exact": sum(
            not row["sentence_exact"]
            and row["lexical_direct_source_target_exact"] is True
            and row["lexical_context_source_target_exact"] is True
            for row in comparable
        ),
        "holdout_sentence_exact_with_local_direct_fail": sum(
            row["sentence_exact"]
            and row["lexical_direct_source_target_exact"] is False
            for row in comparable
        ),
        "holdout_sentence_fail_with_local_direct_fail": sum(
            not row["sentence_exact"]
            and row["lexical_direct_source_target_exact"] is False
            for row in comparable
        ),
        "holdout_local_direct_failure_source_record_clusters": len(
            direct_failure_source_record_counts
        ),
        "holdout_largest_direct_failure_cluster_rows": max(
            direct_failure_source_record_counts.values(), default=0
        ),
        "failed_sentence_subject_matches_direct_lexical_prediction": sum(
            row["sentence_subject_matches_direct_lexical_prediction"] is True
            for row in failed_comparable
        ),
        "failed_rows_preserving_final_predicate_unit": sum(
            not row["sentence_exact"] and row["final_predicate_units_preserved"]
            for row in holdout_rows
        ),
    }
    assert_expected(actual, contract["expected"])

    provenance_counts = Counter(row["provenance_class"] for row in corpus_provenance)
    selected_counts = Counter(row["evidence_class"] for row in selected_presentations)
    selected_provenance_counts = Counter(
        row["provenance_class"] for row in selected_presentations
    )
    selected_visibility_counts = Counter(
        row["parent_visibility"] for row in selected_presentations
    )
    subject_exposure_counts = Counter(
        row["corpus_train_rows_with_expected_subject"] for row in holdout_rows
    )
    same_family_count = sum(
        row["same_family_corpus_train_rows_with_expected_subject"] > 0
        for row in holdout_rows
    )

    report = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": contract["created_at_utc"],
        "supersedes_analysis_id": contract.get("supersedes_analysis_id"),
        "supersession_reason": contract.get("supersession_reason"),
        "status": "PASS_SENTENCE_LINEAGE_AND_COMPOSITION_AUDIT",
        "counts": actual,
        "corpus_provenance": dict(sorted(provenance_counts.items())),
        "selected_checkpoint_sentence_retention": {
            "by_evidence_class": dict(sorted(selected_counts.items())),
            "by_provenance_class": dict(sorted(selected_provenance_counts.items())),
            "by_parent_visibility": dict(sorted(selected_visibility_counts.items())),
            "correction": (
                "The selected checkpoint consumed 125 sentence-retention presentations: "
                "111 synthetic and 14 historical, not 125 controlled-synthetic rows."
            ),
        },
        "pair_level_split_integrity": {
            "private_train_public_holdout_collisions": len(pair_split_collisions),
            "selected_checkpoint_collisions": sum(
                row["public_holdout_pair_collision"] for row in sentence_synthetic
            ),
            "reported_36_row_holdout_collisions": len(
                reported_holdout_pair_collisions
            ),
            "reported_holdout_ids_resolved_to_public_pair_duplicate": sum(
                row["corpus_identity_resolution"] == "normalized_pair_duplicate"
                for row in holdout_rows
            ),
            "interpretation": (
                "Two private training parents duplicate public holdout source-target "
                "pairs under different IDs, and one was selected in the checkpoint's "
                "first 640 presentations. Neither collision is in the reported 36-row "
                "evaluation subset, so this defect does not account for its 13 exact "
                "matches. One evaluated holdout ID was separately replaced by a public "
                "record with the same normalized pair. Future splits must group normalized "
                "pair identities before deduplication."
            ),
        },
        "holdout_composition": {
            "all_rows_use_external_review_ledger_provenance": all(
                row["evaluation_provenance_class"]
                == "external_review_ledger_provenance"
                for row in holdout_rows
            ),
            "rows_with_same_family_subject_training_pair": same_family_count,
            "corpus_train_subject_exposure_distribution": {
                str(key): value for key, value in sorted(subject_exposure_counts.items())
            },
            "paired_outcomes_on_35_exact_local_target_joins": {
                "direct_exact_sentence_exact": actual[
                    "holdout_sentence_exact_with_local_direct_exact"
                ],
                "direct_exact_sentence_fail": actual[
                    "holdout_sentence_fail_with_local_direct_exact"
                ],
                "direct_fail_sentence_exact": actual[
                    "holdout_sentence_exact_with_local_direct_fail"
                ],
                "direct_fail_sentence_fail": actual[
                    "holdout_sentence_fail_with_local_direct_fail"
                ],
            },
            "direct_failure_cluster_sizes": dict(
                sorted(direct_failure_source_record_counts.items())
            ),
            "interpretation": (
                "Thirty-five holdout rows have an exact local source-target join. Direct "
                "lexical reconstruction is exact on 30 and sentence translation on 13. "
                "Of the 30 direct-task successes, 18 still fail in the sentence, exposing "
                "sentence-conditioned lexical realization or composition failure. The "
                "five direct-task failures collapse to three source-record clusters and "
                "require sense, synonym, and orthographic adjudication rather than an "
                "independent-row interpretation."
            ),
        },
        "decisions": [
            "Correct the public checkpoint exposure narrative to 111 synthetic plus 14 historical sentence presentations.",
            "Retire the contaminated public holdout identities and split normalized source-target groups before record-level deduplication.",
            "Carry review and binding provenance inline in every v3 sentence row.",
            "Treat the existing 36-row holdout as a development-consumed composition diagnostic, not an independent grammar test.",
            "Review lexical failures by source-record cluster and accepted-reference class before changing training data.",
            "Prioritize sentence-conditioned lexical competition and glossary uptake over additional isolated lexical replay.",
            "Hold out complete construction-by-lexeme combinations and report isolated-versus-sentence paired outcomes.",
        ],
        "training_authorized": False,
        "runpod_authorized": False,
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    outputs = {
        "CORPUS-PROVENANCE.jsonl": corpus_provenance,
        "PRIVATE-SYNTHETIC-TRAIN-LINEAGE.jsonl": private_synthetic_lineage,
        "PAIR-SPLIT-COLLISIONS.jsonl": pair_split_collisions,
        "SELECTED-SENTENCE-PRESENTATIONS.jsonl": selected_presentations,
        "HOLDOUT-COMPOSITION.jsonl": holdout_rows,
    }
    for name, rows in outputs.items():
        write_jsonl_atomic(output_dir / name, rows)
    write_json_atomic(output_dir / "REPORT.json", report)
    manifest = {
        "schema_version": 1,
        "analysis_id": contract["analysis_id"],
        "created_at_utc": contract["created_at_utc"],
        "supersedes_analysis_id": contract.get("supersedes_analysis_id"),
        "status": report["status"],
        "method": {
            "method_id": METHOD_ID,
            "implementation_sha256": sha256_file(Path(__file__).resolve()),
        },
        "contract": {
            "path": str(contract_path),
            "sha256": sha256_file(contract_path),
        },
        "inputs": manifest_inputs,
        "outputs": {name: {"rows": len(rows)} for name, rows in outputs.items()}
        | {"REPORT.json": {"rows": 1}},
        "training_authorized": False,
        "runpod_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    checksummed = sorted(path for path in output_dir.iterdir() if path.is_file())
    checksums = "".join(f"{sha256_file(path)}  {path.name}\n" for path in checksummed)
    write_text_atomic(output_dir / "OUTPUT-SHA256SUMS", checksums)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the broader source-bound Wajarri terminology-representation commission."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

try:
    from training.translation.build_wajarri_v3_contrast_commission import (
        canonical_json,
        load_json,
        load_jsonl,
        normalize_surface,
        sha256_file,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from training.translation.build_wajarri_v3_contrast_commission import (
        canonical_json,
        load_json,
        load_jsonl,
        normalize_surface,
        sha256_file,
    )


METHOD_ID = "wajarri-v3-terminology-representation-commission-v1"
REPRESENTATIONS = ("suffix", "inline_annotation", "placeholder_glossary")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def write_text_atomic(path: Path, value: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(value, encoding="utf-8")
    os.replace(temporary, path)


def write_json_atomic(path: Path, value: Any) -> None:
    write_text_atomic(
        path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    write_text_atomic(path, "".join(canonical_json(row) + "\n" for row in rows))


def resolve_rows(program_root: Path, binding: dict[str, Any]) -> list[dict[str, Any]]:
    path = (program_root / binding["path"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"input escapes program root: {path}") from error
    if not path.is_file():
        raise ValueError(f"missing input: {path}")
    if sha256_file(path) != binding["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(f"row-count mismatch for {path}")
    return rows


def one_by_id(rows: list[dict[str, Any]], key: str, value: str) -> dict[str, Any]:
    matches = [row for row in rows if row.get(key) == value]
    if len(matches) != 1:
        raise ValueError(f"expected one {key}={value}, found {len(matches)}")
    return matches[0]


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:{digest}"


def concepticon_matches(
    rows: list[dict[str, Any]], source_record_id: str, target_surface: str
) -> list[dict[str, Any]]:
    entry_id = f"{source_record_id}-entry-candidate"
    matches = []
    for row in rows:
        if row.get("concepticon_ontological_category") != "Person/Thing":
            continue
        if normalize_surface(str(row.get("source_form", ""))) != normalize_surface(
            target_surface
        ):
            continue
        candidates = row.get("exact_corroboration_candidates", [])
        if any(item.get("dictionary_entry_candidate_id") == entry_id for item in candidates):
            matches.append(row)
    return matches


def audio_evidence(
    source_record_id: str,
    target_surface: str,
    audio_rows: list[dict[str, Any]],
    program_root: Path,
    audio_root: str,
) -> dict[str, Any]:
    row = one_by_id(audio_rows, "sourceRecordId", source_record_id)
    if normalize_surface(str(row["headword"])) != normalize_surface(target_surface):
        raise ValueError(f"audio headword mismatch: {source_record_id}")
    path = (program_root / audio_root / row["archiveRelativePath"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"audio path escapes program root: {path}") from error
    if not path.is_file():
        raise ValueError(f"missing audio: {path}")
    return {
        "asset_id": row["assetId"],
        "path": str(Path(audio_root) / row["archiveRelativePath"]),
        "sha256": sha256_file(path),
    }


def baseline_facts(
    source_record_id: str,
    target_surface: str,
    baseline_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    matches = [
        row for row in baseline_rows if source_record_id in row.get("source_record_ids", [])
    ]
    strict = [
        row
        for row in matches
        if row.get("source_record_ids") == [source_record_id]
        and row.get("ambiguity_class") == "one_target"
        and row.get("exact") is True
        and normalize_surface(str(row.get("prediction", "")))
        == normalize_surface(target_surface)
    ]
    return {
        "matching_rows": len(matches),
        "strict_one_target_exact": len(strict) == 1,
        "strict_row": strict[0] if len(strict) == 1 else None,
        "ambiguity_classes": sorted(
            {str(row.get("ambiguity_class")) for row in matches}
        ),
        "predictions": sorted({str(row.get("prediction", "")) for row in matches}),
    }


def review_candidate(
    spec: dict[str, Any],
    loaded: dict[str, list[dict[str, Any]]],
    program_root: Path,
    audio_root: str,
    carried_source_ids: set[str],
) -> dict[str, Any]:
    source_id = spec["source_record_id"]
    disposition = one_by_id(
        loaded["reference_dispositions"], "sourceRecordId", source_id
    )
    target = str(disposition["sourceTarget"])
    outcome = one_by_id(loaded["source_record_outcomes"], "source_record_id", source_id)
    baseline = baseline_facts(
        source_id, target, loaded["baseline_lexical_predictions"]
    )
    concepts = concepticon_matches(loaded["concepticon_review"], source_id, target)
    audio = audio_evidence(
        source_id,
        target,
        loaded["audio_crosswalk"],
        program_root,
        audio_root,
    )
    direct_exact = bool(outcome["direct"]["source_target_exact"])
    decision = spec["decision"]

    if decision == "include_new":
        if source_id in carried_source_ids:
            raise ValueError(f"new candidate already carried forward: {source_id}")
        if not baseline["strict_one_target_exact"] or not direct_exact:
            raise ValueError(f"included candidate is not one-target exact: {source_id}")
        if len(concepts) != 1:
            raise ValueError(f"included candidate lacks unique Concepticon link: {source_id}")
    elif decision == "exclude_existing_training":
        if source_id not in carried_source_ids:
            raise ValueError(f"existing candidate is not in carried training: {source_id}")
    elif decision == "exclude_ambiguous_prompt":
        if baseline["strict_one_target_exact"] or baseline["ambiguity_classes"] == [
            "one_target"
        ]:
            raise ValueError(f"ambiguity exclusion is unsupported: {source_id}")
    elif decision == "exclude_baseline_failure":
        if baseline["strict_one_target_exact"]:
            raise ValueError(f"baseline-failure exclusion is exact: {source_id}")
    elif decision == "exclude_semantic_matrix_incompatibility":
        if not spec.get("semantic_rationale"):
            raise ValueError(f"semantic exclusion lacks rationale: {source_id}")
    else:
        raise ValueError(f"unsupported candidate decision: {decision}")

    expected_audio_hash = spec.get("audio_sha256")
    if expected_audio_hash and audio["sha256"] != expected_audio_hash:
        raise ValueError(f"audio SHA-256 mismatch: {source_id}")
    return {
        "schema_version": 1,
        "candidate_id": spec["candidate_id"],
        "source_record_id": source_id,
        "source_record_sha256": disposition["sourceRecordSha256"],
        "source_prompt": disposition["sourcePrompt"],
        "source_definition": disposition["sourceDefinition"],
        "target_surface": target,
        "decision": decision,
        "reason_code": spec["reason_code"],
        "semantic_rationale": spec.get("semantic_rationale"),
        "direct_source_target_exact": direct_exact,
        "baseline": {
            key: value for key, value in baseline.items() if key != "strict_row"
        },
        "baseline_evaluation_id": (
            baseline["strict_row"]["id"] if baseline["strict_row"] else None
        ),
        "concepticon_review_ids": sorted(row["review_item_id"] for row in concepts),
        "audio": audio,
        "claim_limit": (
            "A candidate-pool disposition for this bounded internal composition "
            "screen. Inclusion does not make the source mapping speaker-adjudicated, "
            "the synthetic clause attested, or the output natural-language gold."
        ),
    }


def build_new_subject(
    spec: dict[str, Any], candidate: dict[str, Any], disposition: dict[str, Any]
) -> dict[str, Any]:
    if candidate["decision"] != "include_new":
        raise ValueError(f"new subject is not included: {spec['source_record_id']}")
    if normalize_surface(spec["target_surface"]) != normalize_surface(
        disposition["sourceTarget"]
    ):
        raise ValueError(f"new subject target mismatch: {spec['source_record_id']}")
    if candidate["audio"]["sha256"] != spec["audio_sha256"]:
        raise ValueError(f"new subject audio mismatch: {spec['source_record_id']}")
    return {
        "schema_version": 1,
        "subject_id": spec["subject_id"],
        "family_id": f"wbv-subject-family:{spec['subject_id']}",
        "split": "training",
        "english_surface": spec["english_surface"],
        "glossary_english_surface": spec["glossary_english_surface"],
        "target_surface": disposition["sourceTarget"],
        "semantic_class": spec["semantic_class"],
        "semantic_compatibility_review": spec["semantic_compatibility_review"],
        "source_prompt": disposition["sourcePrompt"],
        "source_definition": disposition["sourceDefinition"],
        "source_record_id": spec["source_record_id"],
        "source_record_sha256": disposition["sourceRecordSha256"],
        "baseline_evaluation_id": candidate["baseline_evaluation_id"],
        "baseline_prediction": candidate["target_surface"],
        "baseline_exact": True,
        "audio": candidate["audio"],
        "commission_role": "new_source_governed_training_subject",
        "review_status": "accepted_for_bounded_internal_representation_screen",
        "attested_sentence": False,
        "naturalness_verified": False,
    }


def build_target_pair(
    subject: dict[str, Any], predicate: dict[str, Any], contract: dict[str, Any]
) -> dict[str, Any]:
    source_text = f"{subject['english_surface']} {predicate['english_clause']}."
    output_text = f"{subject['target_surface']} {predicate['target_surface']}."
    input_text = f"<translate> {source_text}"
    return {
        "schema_version": 1,
        "id": stable_id("wbv-v3-broad-pair", input_text, output_text),
        "family_id": subject["family_id"],
        "subject_id": subject["subject_id"],
        "predicate_id": predicate["predicate_id"],
        "contrast_family": predicate["contrast_family"],
        "input_text": input_text,
        "source_text": source_text,
        "output_text": output_text,
        "task": "translate",
        "task_prefix": "<translate>",
        "direction": "eng-wbv",
        "split": subject["split"],
        "pair_kind": "controlled_synthetic_source_bound_broad_contrast",
        "subject_source_record_ids": [subject["source_record_id"]],
        "predicate_source_record_ids": [predicate["source_record_id"]],
        "grammar_synthesis_id": contract["grammar_synthesis_id"],
        "predicate_evidence_grade": predicate["evidence_grade"],
        "commission_role": subject.get("commission_role", "carried_forward"),
        "inferred_morphology": False,
        "whole_source_forms_only": True,
        "approved_for_training": subject["split"] == "training",
        "attested_reference": False,
        "naturalness_verified": False,
        "synthetic_output_is_linguistic_evidence": False,
        "claim_limit": contract["row_claim_limit"],
    }


def build_representation(
    pair: dict[str, Any],
    subject: dict[str, Any],
    predicate: dict[str, Any],
    representation: str,
) -> dict[str, Any]:
    source_subject = subject["glossary_english_surface"]
    target_subject = subject["target_surface"]
    source_predicate = predicate["glossary_english_surface"]
    target_predicate = predicate["target_surface"]
    if representation == "suffix":
        input_text = (
            f"{pair['input_text']} <glossary> {source_subject} = {target_subject}; "
            f"{source_predicate} = {target_predicate}"
        )
    elif representation == "inline_annotation":
        input_text = (
            f"<translate> {subject['english_surface']} [{target_subject}] "
            f"{predicate['english_clause']} [{target_predicate}]."
        )
    elif representation == "placeholder_glossary":
        input_text = (
            f"<translate> The <T0> is <T1>. <glossary> "
            f"<T0> = {target_subject}; <T1> = {target_predicate}"
        )
    else:
        raise ValueError(f"unsupported representation: {representation}")
    return {
        **pair,
        "id": f"{pair['id']}:{representation}-v1",
        "parent_row_id": pair["id"],
        "unconditioned_input_text": pair["input_text"],
        "input_text": input_text,
        "task": "terminology_conditioned_translation",
        "pair_kind": f"controlled_synthetic_{representation}_representation",
        "representation": representation,
        "terminology_pairs": [
            {
                "slot": "subject",
                "english_surface": source_subject,
                "wajarri_surface": target_subject,
            },
            {
                "slot": "predicate",
                "english_surface": source_predicate,
                "wajarri_surface": target_predicate,
            },
        ],
        "creates_new_target_sentence": False,
    }


def validate_partitions(
    training: list[dict[str, Any]], development: list[dict[str, Any]]
) -> None:
    training_families = {row["family_id"] for row in training}
    development_families = {row["family_id"] for row in development}
    overlap = training_families & development_families
    if overlap:
        raise ValueError(f"training/development family leakage: {sorted(overlap)}")
    pair_keys = set()
    for row in training + development:
        key = (normalize_surface(row["input_text"]), normalize_surface(row["output_text"]))
        if key in pair_keys:
            raise ValueError(f"duplicate pair: {row['id']}")
        pair_keys.add(key)


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1 or contract.get("method_id") != METHOD_ID:
        raise ValueError("unsupported terminology-representation contract")
    loaded = {
        name: resolve_rows(program_root, binding)
        for name, binding in contract["inputs"].items()
    }

    synthesis = one_by_id(
        loaded["grammar_syntheses"], "synthesisId", contract["grammar_synthesis_id"]
    )
    if synthesis.get("syntheticEligibility") != "allowed" or synthesis.get(
        "trainingEligibility"
    ) != "allowed":
        raise ValueError("grammar synthesis is not approved")

    carried_subjects = [
        {**row, "commission_role": "carried_forward_governed_training_subject"}
        for row in loaded["prior_subject_reviews"]
        if row["split"] == "training"
    ]
    carried_source_ids = {row["source_record_id"] for row in carried_subjects}
    candidate_reviews = [
        review_candidate(
            spec, loaded, program_root, contract["audio_root"], carried_source_ids
        )
        for spec in contract["candidate_pool"]
    ]
    candidate_by_source = {row["source_record_id"]: row for row in candidate_reviews}
    if len(candidate_by_source) != len(candidate_reviews):
        raise ValueError("duplicate source record in candidate pool")

    new_subjects = []
    for spec in contract["new_subjects"]:
        source_id = spec["source_record_id"]
        disposition = one_by_id(
            loaded["reference_dispositions"], "sourceRecordId", source_id
        )
        new_subjects.append(
            build_new_subject(spec, candidate_by_source[source_id], disposition)
        )
    subjects = carried_subjects + new_subjects
    if len({row["subject_id"] for row in subjects}) != len(subjects):
        raise ValueError("duplicate subject ID")

    predicate_ids = set(contract["core_predicate_ids"])
    predicates = [
        row for row in loaded["prior_predicate_reviews"] if row["predicate_id"] in predicate_ids
    ]
    if {row["predicate_id"] for row in predicates} != predicate_ids:
        raise ValueError("missing core predicate review")

    training_pairs = [
        build_target_pair(subject, predicate, contract)
        for subject in subjects
        for predicate in predicates
    ]
    development_pairs = [
        row
        for row in loaded["prior_development_pairs"]
        if row["predicate_id"] in predicate_ids
    ]
    validate_partitions(training_pairs, development_pairs)

    all_subjects = {
        row["subject_id"]: row
        for row in loaded["prior_subject_reviews"] + new_subjects
    }
    predicate_by_id = {row["predicate_id"]: row for row in predicates}
    representations: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for representation in REPRESENTATIONS:
        representations[representation] = {
            "training": [
                build_representation(
                    row,
                    all_subjects[row["subject_id"]],
                    predicate_by_id[row["predicate_id"]],
                    representation,
                )
                for row in training_pairs
            ],
            "development": [
                build_representation(
                    row,
                    all_subjects[row["subject_id"]],
                    predicate_by_id[row["predicate_id"]],
                    representation,
                )
                for row in development_pairs
            ],
        }
    for representation in REPRESENTATIONS:
        for split, parents in (
            ("training", training_pairs),
            ("development", development_pairs),
        ):
            variants = representations[representation][split]
            if [row["output_text"] for row in variants] != [
                row["output_text"] for row in parents
            ]:
                raise ValueError(f"target sequence changed: {representation}/{split}")

    counts = {
        "candidate_pool": len(candidate_reviews),
        "candidate_decisions": dict(
            sorted(Counter(row["decision"] for row in candidate_reviews).items())
        ),
        "carried_training_subjects": len(carried_subjects),
        "new_training_subjects": len(new_subjects),
        "training_subjects": len(subjects),
        "core_predicates": len(predicates),
        "training_target_pairs": len(training_pairs),
        "new_training_target_pairs": len(new_subjects) * len(predicates),
        "carried_training_target_pairs": len(carried_subjects) * len(predicates),
        "development_target_pairs": len(development_pairs),
        "training_prompt_variants_per_representation": len(training_pairs),
        "development_prompt_variants_per_representation": len(development_pairs),
        "representation_families": len(REPRESENTATIONS),
        "sealed_test_rows_read": 0,
    }
    for key, expected in contract["expected"].items():
        observed = counts.get(key)
        if observed != expected:
            raise ValueError(f"count mismatch for {key}: expected {expected}, got {observed}")

    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_BROADER_SOURCE_BOUND_REPRESENTATION_COMMISSION",
        "counts": counts,
        "core_predicate_ids": sorted(predicate_ids),
        "representation_families": list(REPRESENTATIONS),
        "zero_shot_probe_binding": contract["zero_shot_probe_binding"],
        "sealed_test_binding": contract["sealed_test_binding"],
        "sealed_test_policy": (
            "The sealed-test file is checksum-bound as opaque metadata only. This "
            "compiler does not resolve, open, parse, copy, or score it."
        ),
        "target_accounting": (
            "The commission contains 76 unique training Wajarri target pairs. The "
            "three input representations are mirrors of those targets and are not "
            "counted as additional synthetic Wajarri sentences."
        ),
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    outputs: dict[str, Any] = {
        "CANDIDATE-REVIEWS.jsonl": sorted(
            candidate_reviews, key=lambda row: row["candidate_id"]
        ),
        "SUBJECT-REVIEWS.jsonl": sorted(subjects, key=lambda row: row["subject_id"]),
        "PREDICATE-REVIEWS.jsonl": sorted(
            predicates, key=lambda row: row["predicate_id"]
        ),
        "TRAINING-TARGET-PAIRS.jsonl": sorted(training_pairs, key=lambda row: row["id"]),
        "DEVELOPMENT-TARGET-PAIRS.jsonl": sorted(
            development_pairs, key=lambda row: row["id"]
        ),
    }
    for representation in REPRESENTATIONS:
        slug = representation.upper().replace("_", "-")
        outputs[f"TRAINING-{slug}.jsonl"] = sorted(
            representations[representation]["training"], key=lambda row: row["id"]
        )
        outputs[f"DEVELOPMENT-{slug}.jsonl"] = sorted(
            representations[representation]["development"], key=lambda row: row["id"]
        )
    for name, rows in outputs.items():
        write_jsonl_atomic(output_dir / name, rows)
    write_json_atomic(output_dir / "REPORT.json", report)

    data_names = sorted([*outputs, "REPORT.json"])
    manifest = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "method_sha256": sha256_file(Path(__file__).resolve()),
        "contract": {
            "path": str(contract_path),
            "sha256": sha256_file(contract_path),
        },
        "inputs": contract["inputs"],
        "opaque_sealed_test_binding": contract["sealed_test_binding"],
        "outputs": {
            name: {
                "bytes": (output_dir / name).stat().st_size,
                "sha256": sha256_file(output_dir / name),
            }
            for name in data_names
        },
        "status": report["status"],
        "claim_limit": contract["claim_limit"],
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)
    checksum_names = sorted(data_names + ["MANIFEST.json"])
    write_text_atomic(
        output_dir / "SHA256SUMS",
        "".join(
            f"{sha256_file(output_dir / name)}  {name}\n" for name in checksum_names
        ),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

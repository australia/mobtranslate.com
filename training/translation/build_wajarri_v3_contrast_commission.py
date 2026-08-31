#!/usr/bin/env python3
"""Build the source-bound Wajarri v3 contrast commission."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-contrast-commission-v1"
SPLIT_FILES = {
    "training": "TRAINING-PAIRS.jsonl",
    "development": "DEVELOPMENT-PAIRS.jsonl",
    "sealed_test": "SEALED-TEST-PAIRS.jsonl",
}
GLOSSARY_SPLIT_FILES = {
    "training": "GLOSSARY-TRAINING.jsonl",
    "development": "GLOSSARY-DEVELOPMENT.jsonl",
    "sealed_test": "GLOSSARY-SEALED-TEST.jsonl",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def normalize_surface(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(normalized.split()).strip(" .?!,;:")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_number}: expected a JSON object")
        rows.append(value)
    return rows


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
    observed_hash = sha256_file(path)
    if observed_hash != binding["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}")
    rows = load_jsonl(path)
    if len(rows) != int(binding["rows"]):
        raise ValueError(f"row-count mismatch for {path}")
    return rows


def collect_identifiers(value: Any) -> set[str]:
    identifiers: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = key.casefold()
            if isinstance(child, str) and (
                lowered.endswith("id") or lowered in {"template_id", "synthesisid"}
            ):
                identifiers.add(child)
            elif isinstance(child, list) and lowered.endswith("ids"):
                identifiers.update(item for item in child if isinstance(item, str))
            identifiers.update(collect_identifiers(child))
    elif isinstance(value, list):
        for child in value:
            identifiers.update(collect_identifiers(child))
    return identifiers


def one_by_id(rows: list[dict[str, Any]], key: str, value: str) -> dict[str, Any]:
    matches = [row for row in rows if row.get(key) == value]
    if len(matches) != 1:
        raise ValueError(f"expected one {key}={value}, found {len(matches)}")
    return matches[0]


def validate_audio(
    spec: dict[str, Any],
    audio_rows: list[dict[str, Any]],
    program_root: Path,
    audio_root: str,
) -> dict[str, Any]:
    row = one_by_id(audio_rows, "sourceRecordId", spec["source_record_id"])
    if normalize_surface(row["headword"]) != normalize_surface(spec["target_surface"]):
        raise ValueError(f"audio headword mismatch: {spec['source_record_id']}")
    path = (program_root / audio_root / row["archiveRelativePath"]).resolve()
    try:
        path.relative_to(program_root.resolve())
    except ValueError as error:
        raise ValueError(f"audio path escapes program root: {path}") from error
    if not path.is_file():
        raise ValueError(f"missing bound audio: {path}")
    observed_hash = sha256_file(path)
    if observed_hash != spec["audio_sha256"]:
        raise ValueError(f"audio SHA-256 mismatch: {spec['source_record_id']}")
    return {
        "asset_id": row["assetId"],
        "path": str(Path(audio_root) / row["archiveRelativePath"]),
        "sha256": observed_hash,
    }


def validate_subject(
    spec: dict[str, Any],
    dispositions: list[dict[str, Any]],
    baselines: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
    audio_rows: list[dict[str, Any]],
    program_root: Path,
    audio_root: str,
) -> dict[str, Any]:
    source_id = spec["source_record_id"]
    disposition = one_by_id(dispositions, "sourceRecordId", source_id)
    if normalize_surface(disposition["sourcePrompt"]) != normalize_surface(
        spec["source_prompt"]
    ):
        raise ValueError(f"subject source prompt mismatch: {source_id}")
    if normalize_surface(disposition["sourceTarget"]) != normalize_surface(
        spec["target_surface"]
    ):
        raise ValueError(f"subject target mismatch: {source_id}")
    if not disposition["benchmarkEligibility"]["unconditionedPromptReconstruction"]:
        raise ValueError(f"subject is not reconstruction eligible: {source_id}")

    baseline_matches = [
        row
        for row in baselines
        if row.get("source_record_ids") == [source_id]
        and row.get("ambiguity_class") == "one_target"
    ]
    if len(baseline_matches) != 1:
        raise ValueError(f"subject lacks one-target baseline: {source_id}")
    baseline = baseline_matches[0]
    if not baseline.get("exact") or normalize_surface(
        baseline.get("prediction", "")
    ) != normalize_surface(spec["target_surface"]):
        raise ValueError(f"subject baseline is not exact: {source_id}")

    outcome = one_by_id(outcomes, "source_record_id", source_id)
    if outcome["direct"]["ambiguity_class"] != "one_target" or not outcome["direct"][
        "source_target_exact"
    ]:
        raise ValueError(f"subject source outcome is not one-target exact: {source_id}")
    if int(outcome["evidence_coverage"]["verifiedAudioLinks"]) < 1:
        raise ValueError(f"subject has no verified audio link: {source_id}")
    audio = validate_audio(spec, audio_rows, program_root, audio_root)
    return {
        "schema_version": 1,
        "subject_id": spec["subject_id"],
        "family_id": f"wbv-subject-family:{spec['subject_id']}",
        "split": spec["split"],
        "english_surface": spec["english_surface"],
        "glossary_english_surface": spec["glossary_english_surface"],
        "target_surface": disposition["sourceTarget"],
        "semantic_class": spec["semantic_class"],
        "semantic_compatibility_review": spec["semantic_compatibility_review"],
        "source_prompt": disposition["sourcePrompt"],
        "source_definition": disposition["sourceDefinition"],
        "source_record_id": source_id,
        "source_record_sha256": disposition["sourceRecordSha256"],
        "baseline_evaluation_id": baseline["id"],
        "baseline_prediction": baseline["prediction"],
        "baseline_exact": True,
        "audio": audio,
        "review_status": "accepted_for_bounded_internal_contrast_commission",
        "attested_sentence": False,
        "naturalness_verified": False,
    }


def validate_predicate(
    spec: dict[str, Any],
    dispositions: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
    audio_rows: list[dict[str, Any]],
    evidence_ids: set[str],
    program_root: Path,
    audio_root: str,
) -> dict[str, Any]:
    source_id = spec["source_record_id"]
    disposition = one_by_id(dispositions, "sourceRecordId", source_id)
    if disposition["sourceRecordSha256"] != spec["source_record_sha256"]:
        raise ValueError(f"predicate source-record hash mismatch: {spec['predicate_id']}")
    if normalize_surface(disposition["sourceTarget"]) != normalize_surface(
        spec["target_surface"]
    ) or normalize_surface(disposition["sourceDefinition"]) != normalize_surface(
        spec["source_definition"]
    ):
        raise ValueError(f"predicate disposition mismatch: {spec['predicate_id']}")
    outcome = one_by_id(outcomes, "source_record_id", source_id)
    if normalize_surface(outcome["source_target"]) != normalize_surface(
        spec["target_surface"]
    ):
        raise ValueError(f"predicate target mismatch: {spec['predicate_id']}")
    if normalize_surface(outcome["source_definition"]) != normalize_surface(
        spec["source_definition"]
    ):
        raise ValueError(f"predicate definition mismatch: {spec['predicate_id']}")
    if int(outcome["evidence_coverage"]["verifiedAudioLinks"]) < 1:
        raise ValueError(f"predicate has no verified audio link: {spec['predicate_id']}")
    missing = set(spec["required_evidence_ids"]) - evidence_ids
    if missing:
        raise ValueError(
            f"unresolved predicate evidence for {spec['predicate_id']}: {sorted(missing)}"
        )
    audio = validate_audio(spec, audio_rows, program_root, audio_root)
    return {
        "schema_version": 1,
        "predicate_id": spec["predicate_id"],
        "contrast_family": spec["contrast_family"],
        "english_clause": spec["english_clause"],
        "glossary_english_surface": spec["glossary_english_surface"],
        "target_surface": outcome["source_target"],
        "source_definition": outcome["source_definition"],
        "source_record_id": source_id,
        "source_record_sha256": spec["source_record_sha256"],
        "v2_direct_prompt_ambiguity_class": outcome["direct"]["ambiguity_class"],
        "v2_direct_prediction": outcome["direct"]["prediction"],
        "v2_direct_source_target_exact": outcome["direct"]["source_target_exact"],
        "evidence_grade": spec["evidence_grade"],
        "required_evidence_ids": spec["required_evidence_ids"],
        "limitations": spec["limitations"],
        "audio": audio,
        "inferred_morphology": False,
        "whole_source_form_only": True,
        "review_status": "accepted_for_bounded_internal_contrast_commission",
        "attested_sentence": False,
        "naturalness_verified": False,
    }


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:{digest}"


def build_pair(
    subject: dict[str, Any], predicate: dict[str, Any], contract: dict[str, Any]
) -> dict[str, Any]:
    source_text = f"{subject['english_surface']} {predicate['english_clause']}."
    output_text = f"{subject['target_surface']} {predicate['target_surface']}."
    input_text = f"<translate> {source_text}"
    pair_id = stable_id("wbv-v3-contrast-pair", input_text, output_text)
    split = subject["split"]
    training = split == "training"
    return {
        "schema_version": 1,
        "id": pair_id,
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
        "split": split,
        "pair_kind": "controlled_synthetic_source_bound_contrast",
        "subject_source_record_ids": [subject["source_record_id"]],
        "predicate_source_record_ids": [predicate["source_record_id"]],
        "grammar_synthesis_id": contract["grammar_synthesis_id"],
        "template_precedent_ids": contract["template_precedent_ids"],
        "predicate_evidence_grade": predicate["evidence_grade"],
        "inferred_morphology": False,
        "whole_source_forms_only": True,
        "approved_for_training": training,
        "training_eligibility": (
            "allowed_internal_fixed_compute_screen" if training else "not_allowed"
        ),
        "benchmark_eligibility": (
            "not_reference_gold"
            if training
            else (
                "development_only_not_sealed"
                if split == "development"
                else "confirmatory_test_not_for_recipe_selection"
            )
        ),
        "attested_reference": False,
        "naturalness_verified": False,
        "synthetic_output_is_linguistic_evidence": False,
        "claim_limit": contract["row_claim_limit"],
    }


def build_glossary_pair(
    pair: dict[str, Any], subject: dict[str, Any], predicate: dict[str, Any]
) -> dict[str, Any]:
    glossary = (
        f"{subject['glossary_english_surface']} = {subject['target_surface']}; "
        f"{predicate['glossary_english_surface']} = {predicate['target_surface']}"
    )
    return {
        **pair,
        "id": f"{pair['id']}:glossary-v1",
        "parent_row_id": pair["id"],
        "unconditioned_input_text": pair["input_text"],
        "input_text": f"{pair['input_text']} <glossary> {glossary}",
        "task": "glossary_translation",
        "pair_kind": "controlled_synthetic_source_bound_glossary_contrast",
        "glossary_condition": "complete_source_bound_subject_and_predicate",
        "glossary_pairs": [
            {
                "slot": "subject",
                "english_surface": subject["glossary_english_surface"],
                "wajarri_surface": subject["target_surface"],
            },
            {
                "slot": "predicate",
                "english_surface": predicate["glossary_english_surface"],
                "wajarri_surface": predicate["target_surface"],
            },
        ],
        "creates_new_target_sentence": False,
    }


def validate_partitions(rows: list[dict[str, Any]]) -> None:
    families_by_split: dict[str, set[str]] = {split: set() for split in SPLIT_FILES}
    pair_keys: set[tuple[str, str]] = set()
    for row in rows:
        families_by_split[row["split"]].add(row["family_id"])
        key = (normalize_surface(row["input_text"]), normalize_surface(row["output_text"]))
        if key in pair_keys:
            raise ValueError(f"duplicate normalized pair: {row['id']}")
        pair_keys.add(key)
    splits = sorted(families_by_split)
    for index, left in enumerate(splits):
        for right in splits[index + 1 :]:
            overlap = families_by_split[left] & families_by_split[right]
            if overlap:
                raise ValueError(f"family leakage between {left} and {right}: {overlap}")


def prior_inputs(loaded: dict[str, list[dict[str, Any]]]) -> set[str]:
    result = set()
    for name, rows in loaded.items():
        if not name.startswith("prior_"):
            continue
        result.update(
            normalize_surface(str(row["input_text"]))
            for row in rows
            if row.get("input_text")
        )
    return result


def main() -> None:
    args = parse_args()
    contract_path = args.contract.resolve()
    program_root = args.program_root.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1 or contract.get("method_id") != METHOD_ID:
        raise ValueError("unsupported contrast commission contract")

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
        raise ValueError("grammar synthesis is not approved for bounded generation")
    templates = {
        row["template_id"]: row for row in loaded["synthetic_templates"]
    }
    for template_id in contract["template_precedent_ids"]:
        template = templates.get(template_id)
        if template is None or template.get("acceptance_status") != (
            "accepted_for_controlled_sentence_generation"
        ):
            raise ValueError(f"missing accepted template precedent: {template_id}")

    evidence_ids = collect_identifiers(loaded)
    audio_root = contract["audio_root"]
    subjects = [
        validate_subject(
            spec,
            loaded["reference_dispositions"],
            loaded["baseline_lexical_predictions"],
            loaded["source_record_outcomes"],
            loaded["audio_crosswalk"],
            program_root,
            audio_root,
        )
        for spec in contract["subjects"]
    ]
    predicates = [
        validate_predicate(
            spec,
            loaded["reference_dispositions"],
            loaded["source_record_outcomes"],
            loaded["audio_crosswalk"],
            evidence_ids,
            program_root,
            audio_root,
        )
        for spec in contract["predicates"]
    ]
    if len({row["subject_id"] for row in subjects}) != len(subjects):
        raise ValueError("duplicate subject ID")
    if len({row["predicate_id"] for row in predicates}) != len(predicates):
        raise ValueError("duplicate predicate ID")

    old_source_ids = {
        source_id
        for name, rows in loaded.items()
        if name.startswith("prior_")
        for row in rows
        for source_id in row.get("subject_source_record_ids", [])
    }
    reused = sorted(row["source_record_id"] for row in subjects if row["source_record_id"] in old_source_ids)
    if reused:
        raise ValueError(f"subject source records are not fresh: {reused}")

    pairs = [
        build_pair(subject, predicate, contract)
        for subject in subjects
        for predicate in predicates
    ]
    validate_partitions(pairs)
    old_inputs = prior_inputs(loaded)
    overlap = sorted(row["input_text"] for row in pairs if normalize_surface(row["input_text"]) in old_inputs)
    if overlap:
        raise ValueError(f"new pair overlaps earlier matrix: {overlap}")
    subject_by_id = {row["subject_id"]: row for row in subjects}
    predicate_by_id = {row["predicate_id"]: row for row in predicates}
    glossary_pairs = [
        build_glossary_pair(
            pair, subject_by_id[pair["subject_id"]], predicate_by_id[pair["predicate_id"]]
        )
        for pair in pairs
    ]

    split_rows = {
        split: sorted(
            (row for row in pairs if row["split"] == split), key=lambda row: row["id"]
        )
        for split in SPLIT_FILES
    }
    glossary_split_rows = {
        split: sorted(
            (row for row in glossary_pairs if row["split"] == split),
            key=lambda row: row["id"],
        )
        for split in SPLIT_FILES
    }
    counts = {
        "subjects": len(subjects),
        "predicates": len(predicates),
        "unique_target_pairs": len(pairs),
        "training_pairs": len(split_rows["training"]),
        "development_pairs": len(split_rows["development"]),
        "sealed_test_pairs": len(split_rows["sealed_test"]),
        "glossary_training_variants": len(glossary_split_rows["training"]),
        "glossary_development_variants": len(glossary_split_rows["development"]),
        "glossary_sealed_test_variants": len(glossary_split_rows["sealed_test"]),
        "prior_input_overlap": len(overlap),
        "prior_subject_source_record_overlap": len(reused),
    }
    for key, expected in contract["expected"].items():
        if counts.get(key) != int(expected):
            raise ValueError(
                f"count mismatch for {key}: expected {expected}, got {counts.get(key)}"
            )

    split_family_counts = Counter(row["split"] for row in subjects)
    contrast_counts = Counter(row["contrast_family"] for row in pairs)
    report = {
        "schema_version": 1,
        "method_id": METHOD_ID,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_SOURCE_BOUND_FAMILY_SPLIT_CONTRAST_COMMISSION",
        "counts": counts,
        "subject_families_by_split": dict(sorted(split_family_counts.items())),
        "pairs_by_contrast_family": dict(sorted(contrast_counts.items())),
        "all_subjects_one_target_exact_at_v2": all(row["baseline_exact"] for row in subjects),
        "all_rows_whole_source_forms_only": True,
        "inferred_morphology_rows": 0,
        "natural_attested_sentence_rows": 0,
        "training_contract": (
            "Only TRAINING-PAIRS and GLOSSARY-TRAINING may enter screening. "
            "Development may select a recipe. SEALED-TEST files may be opened only "
            "after the recipe and checkpoint rule are frozen."
        ),
        "claim_limit": contract["claim_limit"],
    }

    output_dir.mkdir(parents=True)
    write_jsonl_atomic(output_dir / "SUBJECT-REVIEWS.jsonl", sorted(subjects, key=lambda row: row["subject_id"]))
    write_jsonl_atomic(output_dir / "PREDICATE-REVIEWS.jsonl", sorted(predicates, key=lambda row: row["predicate_id"]))
    for split, filename in SPLIT_FILES.items():
        write_jsonl_atomic(output_dir / filename, split_rows[split])
    for split, filename in GLOSSARY_SPLIT_FILES.items():
        write_jsonl_atomic(output_dir / filename, glossary_split_rows[split])
    write_json_atomic(output_dir / "REPORT.json", report)

    data_names = sorted(
        ["SUBJECT-REVIEWS.jsonl", "PREDICATE-REVIEWS.jsonl", "REPORT.json"]
        + list(SPLIT_FILES.values())
        + list(GLOSSARY_SPLIT_FILES.values())
    )
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
        "".join(f"{sha256_file(output_dir / name)}  {name}\n" for name in checksum_names),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

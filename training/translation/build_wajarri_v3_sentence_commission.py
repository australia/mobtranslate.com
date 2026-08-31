#!/usr/bin/env python3
"""Build the checksum-bound Wajarri v3 sentence-data commission."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


METHOD_ID = "wajarri-v3-sentence-commission-v0.1.0"
CLAIM_LIMIT = (
    "This commission converts measured model failures and source evidence into a "
    "review queue. It generates no Wajarri sentence, accepts no productive rule or "
    "orthographic correspondence, and authorizes no training or release."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def stable_id(prefix: str, value: Any) -> str:
    digest = hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:{digest}"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


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


def resolve_component(
    program_root: Path, component: dict[str, Any]
) -> tuple[Path, list[dict[str, Any]] | dict[str, Any]]:
    path = (program_root / component["path"]).resolve()
    if program_root.resolve() not in path.parents:
        raise ValueError(f"component escapes program root: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    actual_hash = sha256_file(path)
    if actual_hash != component["sha256"]:
        raise ValueError(
            f"SHA-256 mismatch for {path}: expected {component['sha256']}, got {actual_hash}"
        )
    value = load_jsonl(path) if path.suffix == ".jsonl" else load_json(path)
    if "rows" in component and len(value) != int(component["rows"]):
        raise ValueError(
            f"row-count mismatch for {path}: expected {component['rows']}, got {len(value)}"
        )
    return path, value


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


def validate_budget(contract: dict[str, Any]) -> None:
    budget = contract["pair_budget"]
    families = contract["construction_families"]
    if len(families) != int(budget["families"]):
        raise ValueError("construction-family count does not match pair budget")
    family_ids = [row["family_id"] for row in families]
    if len(family_ids) != len(set(family_ids)):
        raise ValueError("construction-family IDs are not unique")
    per_family = int(budget["pairs_per_family"])
    if len(families) * per_family != int(budget["new_unique_sentence_pairs"]):
        raise ValueError("family quotas do not sum to unique-pair budget")
    split_total = sum(int(value) for value in budget["split_totals"].values())
    if split_total != int(budget["new_unique_sentence_pairs"]):
        raise ValueError("split totals do not sum to unique-pair budget")
    maximum_share = float(contract["cross_cutting_requirements"]["maximum_macro_family_share"])
    if per_family / int(budget["new_unique_sentence_pairs"]) > maximum_share:
        raise ValueError("per-family quota exceeds maximum family share")


def split_quota(index: int, budget: dict[str, Any]) -> dict[str, int]:
    if index < int(budget["families"]) // 2:
        development = int(budget["per_family_development_first_half"])
        sealed_test = int(budget["per_family_test_first_half"])
    else:
        development = int(budget["per_family_development_second_half"])
        sealed_test = int(budget["per_family_test_second_half"])
    result = {
        "train": int(budget["per_family_train"]),
        "development": development,
        "sealed_test": sealed_test,
    }
    if sum(result.values()) != int(budget["pairs_per_family"]):
        raise ValueError(f"family {index + 1} split quota does not sum")
    return result


def source_assertion_key(row: dict[str, Any]) -> str | None:
    return row.get("assertionKey") or row.get("assertion_id") or row.get("id")


def scsa_example_is_explicit_pair(row: dict[str, Any]) -> bool:
    return bool(row.get("englishText")) and str(row.get("translationAlignment", "")).startswith(
        "explicit_source"
    )


def build_construction_commission(
    contract: dict[str, Any],
    preconditions: list[dict[str, Any]],
    douglas_examples: list[dict[str, Any]],
    assertions: list[dict[str, Any]],
    scsa_claims: list[dict[str, Any]],
    scsa_examples: list[dict[str, Any]],
    existing_templates: list[dict[str, Any]],
    existing_pairs: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], set[str]]:
    precondition_by_tag = {row["phenomenon_tag"]: row for row in preconditions}
    douglas_by_number = {int(row["example_number"]): row for row in douglas_examples}
    assertion_by_key = {
        key: row for row in assertions if (key := source_assertion_key(row)) is not None
    }
    scsa_claim_by_key = {row["claimKey"]: row for row in scsa_claims}
    template_by_id = {row["template_id"]: row for row in existing_templates}
    existing_pair_counts = Counter(row.get("construction_family") for row in existing_pairs)
    covered_tags: set[str] = set()
    rows = []

    for index, family in enumerate(contract["construction_families"]):
        tags = list(family["douglas_phenomenon_tags"])
        covered_tags.update(tags)
        missing_tags = sorted(set(tags) - set(precondition_by_tag))
        if missing_tags:
            raise ValueError(f"unknown Douglas phenomenon tags in {family['family_id']}: {missing_tags}")
        claim_keys = list(family["scsa_claim_keys"])
        missing_claims = sorted(set(claim_keys) - set(scsa_claim_by_key))
        if missing_claims:
            raise ValueError(f"unknown SCSA claim keys in {family['family_id']}: {missing_claims}")
        assertion_keys = list(family["source_assertion_keys"])
        missing_assertions = sorted(set(assertion_keys) - set(assertion_by_key))
        if missing_assertions:
            raise ValueError(
                f"unknown source assertion keys in {family['family_id']}: {missing_assertions}"
            )
        template_ids = list(family["existing_template_ids"])
        missing_templates = sorted(set(template_ids) - set(template_by_id))
        if missing_templates:
            raise ValueError(
                f"unknown existing template IDs in {family['family_id']}: {missing_templates}"
            )

        precondition_rows = [precondition_by_tag[tag] for tag in tags]
        historical_numbers = sorted(
            {
                int(number)
                for row in precondition_rows
                for number in row["source_attested_example_numbers"]
            }
        )
        missing_examples = sorted(set(historical_numbers) - set(douglas_by_number))
        if missing_examples:
            raise ValueError(
                f"Douglas examples not found for {family['family_id']}: {missing_examples}"
            )
        relevant_scsa_examples = [
            row
            for row in scsa_examples
            if set(row.get("claimKeys") or []) & set(claim_keys)
        ]
        explicit_scsa_pairs = [
            row for row in relevant_scsa_examples if scsa_example_is_explicit_pair(row)
        ]
        templates = [template_by_id[template_id] for template_id in template_ids]
        accepted_templates = [
            row
            for row in templates
            if row.get("acceptance_status") == "accepted_for_controlled_sentence_generation"
            and row.get("synthetic_eligibility") == "eligible"
        ]
        existing_families = [row["construction_family"] for row in templates]
        existing_pair_count = sum(existing_pair_counts[name] for name in existing_families)

        blockers = []
        if len(accepted_templates) != len(templates):
            blockers.append("referenced_existing_template_not_currently_accepted")
        if not explicit_scsa_pairs:
            blockers.append("no_current_curriculum_explicit_pair_for_family")
        if not historical_numbers:
            blockers.append("no_curated_historical_example_for_family")
        if not assertion_keys:
            blockers.append("no_descriptive_source_assertion_for_family")
        if not templates:
            blockers.extend(
                [
                    "productive_construction_not_accepted",
                    "current_morphology_and_surface_realizations_not_accepted",
                ]
            )
        else:
            blockers.append("new_lexical_bindings_require_separate_review")

        if templates:
            readiness = "bounded_existing_templates_only"
        elif explicit_scsa_pairs and historical_numbers and assertion_keys:
            readiness = "cross_source_evidence_assembled_review_required"
        elif explicit_scsa_pairs:
            readiness = "current_pair_evidence_assembled_description_gap"
        elif historical_numbers:
            readiness = "historical_evidence_only_current_surface_gap"
        else:
            readiness = "source_evidence_gap"

        rows.append(
            {
                "schema_version": 1,
                "commission_id": contract["commission_id"],
                "family_id": family["family_id"],
                "label": family["label"],
                "priority_rank": index + 1,
                "new_pair_quota": int(contract["pair_budget"]["pairs_per_family"]),
                "split_quota": split_quota(index, contract["pair_budget"]),
                "minimum_microtemplates": int(
                    contract["cross_cutting_requirements"]["minimum_microtemplates_per_family"]
                ),
                "critical_features": list(family["critical_features"]),
                "evidence": {
                    "douglas_phenomenon_tags": tags,
                    "douglas_precondition_ids": [
                        row["requirement_id"] for row in precondition_rows
                    ],
                    "douglas_example_numbers": historical_numbers,
                    "douglas_visual_decision_ids": [
                        douglas_by_number[number]["decision_id"]
                        for number in historical_numbers
                    ],
                    "source_assertion_ids": [
                        assertion_by_key[key].get("assertionId")
                        or assertion_by_key[key].get("id")
                        for key in assertion_keys
                    ],
                    "scsa_claim_keys": claim_keys,
                    "scsa_explicit_pair_example_ids": [
                        row["exampleId"] for row in explicit_scsa_pairs
                    ],
                    "scsa_related_example_ids": [
                        row["exampleId"] for row in relevant_scsa_examples
                    ],
                    "existing_template_ids": template_ids,
                    "existing_controlled_pair_rows": existing_pair_count,
                },
                "evidence_counts": {
                    "historical_visual_examples": len(historical_numbers),
                    "descriptive_source_assertions": len(assertion_keys),
                    "scsa_related_examples": len(relevant_scsa_examples),
                    "scsa_explicit_pairs": len(explicit_scsa_pairs),
                    "accepted_existing_templates": len(accepted_templates),
                },
                "readiness": readiness,
                "blockers": sorted(set(blockers)),
                "generation_authorized": False,
                "training_authorized": False,
                "required_before_generation": list(
                    contract["family_defaults"]["required_before_generation"]
                ),
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return rows, covered_tags


def build_source_pair_queue(
    douglas_examples: list[dict[str, Any]],
    scsa_examples: list[dict[str, Any]],
    construction_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    families_by_douglas_number: defaultdict[int, list[str]] = defaultdict(list)
    families_by_scsa_id: defaultdict[str, list[str]] = defaultdict(list)
    for family in construction_rows:
        for number in family["evidence"]["douglas_example_numbers"]:
            families_by_douglas_number[int(number)].append(family["family_id"])
        for example_id in family["evidence"]["scsa_related_example_ids"]:
            families_by_scsa_id[example_id].append(family["family_id"])

    queue = []
    for row in douglas_examples:
        number = int(row["example_number"])
        queue.append(
            {
                "schema_version": 1,
                "queue_id": stable_id(
                    "wbv-v3-source-pair-review",
                    ["douglas", row["decision_id"], row["historical_wajarri_text"]],
                ),
                "source_class": "historical_descriptive_grammar_example",
                "source_record_id": row["decision_id"],
                "example_number": number,
                "english": row["source_free_translation"],
                "wajarri": row["historical_wajarri_text"],
                "morpheme_gloss": row.get("source_morpheme_gloss"),
                "translation_alignment": row["source_layout_pairing_decision"],
                "transcription_status": row["transcription_decision"],
                "semantic_validation_status": row["semantic_validation_status"],
                "orthography_status": row["current_orthography_correspondence_status"],
                "candidate_family_ids": sorted(families_by_douglas_number[number]),
                "review_actions": [
                    "validate the source translation and morpheme alignment",
                    "retain historical orthography or accept an independently supported current correspondence",
                    "assign grammatical slots and variety scope",
                    "decide source-witness, benchmark, retention, and synthesis roles separately",
                ],
                "training_eligible": False,
                "synthetic_generation_authorized": False,
                "claim_limit": CLAIM_LIMIT,
            }
        )

    for row in scsa_examples:
        if not scsa_example_is_explicit_pair(row):
            continue
        queue.append(
            {
                "schema_version": 1,
                "queue_id": stable_id(
                    "wbv-v3-source-pair-review",
                    ["scsa", row["exampleId"], row["targetText"]],
                ),
                "source_class": "current_curriculum_explicit_pair",
                "source_record_id": row["exampleId"],
                "example_number": None,
                "english": row["englishText"],
                "wajarri": row["targetText"],
                "morpheme_gloss": None,
                "translation_alignment": row["translationAlignment"],
                "transcription_status": row["transcriptionStatus"],
                "semantic_validation_status": row["acceptanceStatus"],
                "orthography_status": "current_curriculum_source_surface",
                "candidate_family_ids": sorted(families_by_scsa_id[row["exampleId"]]),
                "source_unit": row["unit"],
                "source_limitations": list(row.get("limitations") or []),
                "review_actions": [
                    "verify whether the published English maps to one sentence or a source-preserved set",
                    "review segmentation, morphology, lexical senses, and variety",
                    "admit the exact pair as pedagogical evidence separately from productive-rule induction",
                ],
                "training_eligible": False,
                "synthetic_generation_authorized": False,
                "claim_limit": CLAIM_LIMIT,
            }
        )
    return sorted(queue, key=lambda row: (row["source_class"], row["source_record_id"]))


def lexical_priority(row: dict[str, Any]) -> tuple[int, list[str]]:
    score = 0
    reasons = []
    outcome = row["outcome_class"]
    if outcome == "direct_only_exact":
        score += 8
        reasons.append("raw_definition_context_regressed_a_direct_source_exact_result")
    elif outcome == "neither_exact":
        score += 6
        reasons.append("both_direct_and_definition_context_failed")
    elif outcome == "context_only_exact":
        score += 4
        reasons.append("definition_context_recovered_a_direct_failure")
    if row["direct"]["ambiguity_class"] == "multiple_accepted_targets":
        score += 4
        reasons.append("unconditioned_prompt_has_multiple_accepted_targets")
    if row["direct"]["known_target_substitution"] or row["context"]["known_target_substitution"]:
        score += 3
        reasons.append("model_selected_another_recorded_wajarri_target")
    if row["part_of_speech"]["status"] != "not_provided_by_source":
        score += 1
        reasons.append("source_part_of_speech_available_for_review")
    evidence_links = sum(
        int(value)
        for value in row["evidence_coverage"].values()
        if isinstance(value, int)
    )
    if evidence_links:
        score += 1
        reasons.append("linked_evidence_available")
    return score, reasons


def build_lexical_queue(
    source_outcomes: list[dict[str, Any]], target_count: int
) -> list[dict[str, Any]]:
    queue = []
    for row in source_outcomes:
        if row["outcome_class"] == "both_exact":
            continue
        score, reasons = lexical_priority(row)
        interventions = []
        if row["outcome_class"] == "direct_only_exact":
            interventions.extend(
                [
                    "do not replay the current raw definition prompt",
                    "build governed POS and sense labels",
                    "place the source target in semantically licensed sentence contexts",
                ]
            )
        if row["direct"]["ambiguity_class"] == "multiple_accepted_targets":
            interventions.extend(
                [
                    "separate true synonyms, orthographic variants, varieties, and distinct senses",
                    "construct contrastive sense-qualified prompts and sentence contexts",
                ]
            )
        if row["outcome_class"] in {"neither_exact", "context_only_exact"}:
            interventions.append("audit competing target exposure before assigning sentence rows")
        if row["direct"]["known_target_substitution"] or row["context"]["known_target_substitution"]:
            interventions.append("include the observed competing target in contrastive review")

        queue.append(
            {
                "schema_version": 1,
                "queue_id": stable_id(
                    "wbv-v3-lexical-competition",
                    [row["source_record_id"], row["source_prompt"], row["source_target"]],
                ),
                "source_record_id": row["source_record_id"],
                "source_prompt": row["source_prompt"],
                "source_definition": row["source_definition"],
                "source_target": row["source_target"],
                "part_of_speech": row["part_of_speech"],
                "structural_stratum": row["structural_stratum"],
                "direct_ambiguity_class": row["direct"]["ambiguity_class"],
                "outcome_class": row["outcome_class"],
                "direct_prediction": row["direct"]["prediction"],
                "direct_source_target_exact": row["direct"]["source_target_exact"],
                "context_prediction": row["context"]["prediction"],
                "context_source_target_exact": row["context"]["source_target_exact"],
                "known_target_substitution": bool(
                    row["direct"]["known_target_substitution"]
                    or row["context"]["known_target_substitution"]
                ),
                "priority_score": score,
                "priority_reasons": sorted(set(reasons)),
                "required_interventions": sorted(set(interventions)),
                "minimum_sentence_contexts_if_linguistically_eligible": 3,
                "semantic_assignment_status": "pending_embedding_cluster_and_linguistic_review",
                "selected_for_500_row_pilot_overlay": False,
                "pilot_overlay_rank": None,
                "training_eligible": False,
                "claim_limit": CLAIM_LIMIT,
            }
        )

    queue.sort(key=lambda row: (-row["priority_score"], row["queue_id"]))
    if len(queue) < target_count:
        raise ValueError(
            f"only {len(queue)} lexical failure items available for {target_count}-row overlay"
        )
    for rank, row in enumerate(queue[:target_count], start=1):
        row["selected_for_500_row_pilot_overlay"] = True
        row["pilot_overlay_rank"] = rank
    return queue


def build_deferred_phenomena(
    preconditions: list[dict[str, Any]], covered_tags: set[str]
) -> list[dict[str, Any]]:
    return [
        {
            "schema_version": 1,
            "phenomenon_tag": row["phenomenon_tag"],
            "requirement_id": row["requirement_id"],
            "source_attested_example_numbers": row["source_attested_example_numbers"],
            "reason": "not_allocated_to_the_3000_pair_pilot",
            "status": "tracked_outside_pilot_not_silently_discarded",
            "claim_limit": CLAIM_LIMIT,
        }
        for row in preconditions
        if row["phenomenon_tag"] not in covered_tags
    ]


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
    validate_budget(contract)

    resolved = {}
    manifest_inputs = {}
    for name, component in contract["inputs"].items():
        path, value = resolve_component(program_root, component)
        resolved[name] = value
        manifest_inputs[name] = {
            "path": component["path"],
            "sha256": component["sha256"],
            **({"rows": component["rows"]} if "rows" in component else {}),
        }

    summary = resolved["baseline_summary"]
    hypotheses = resolved["baseline_hypotheses"]
    if summary["analysis_id"] != "wbv-v3-v2-baseline-failure-ledger-v1.1":
        raise ValueError("unexpected baseline analysis ID")
    hypothesis_ids = {row["id"] for row in hypotheses["hypotheses"]}
    required_hypotheses = {
        "H1_prompt_ambiguity_is_a_separate_task",
        "H4_wrong_known_target_selection_is_the_primary_lexical_failure",
        "H5_sentence_holdout_is_lexically_not_structurally_discriminating",
        "H6_raw_definition_context_is_currently_harmful",
    }
    if not required_hypotheses <= hypothesis_ids:
        raise ValueError("baseline hypotheses required by commission are missing")

    construction_rows, covered_tags = build_construction_commission(
        contract,
        resolved["douglas_sentence_preconditions"],
        resolved["douglas_visual_examples"],
        resolved["source_assertions"],
        resolved["scsa_claims"],
        resolved["scsa_examples"],
        resolved["existing_templates"],
        resolved["existing_synthetic_pairs"],
    )
    source_pair_queue = build_source_pair_queue(
        resolved["douglas_visual_examples"],
        resolved["scsa_examples"],
        construction_rows,
    )
    lexical_queue = build_lexical_queue(
        resolved["source_record_outcomes"],
        int(contract["cross_cutting_requirements"]["lexical_competition_rows_minimum"]),
    )
    deferred = build_deferred_phenomena(
        resolved["douglas_sentence_preconditions"], covered_tags
    )

    readiness_counts = Counter(row["readiness"] for row in construction_rows)
    lexical_outcomes = Counter(row["outcome_class"] for row in lexical_queue)
    report = {
        "schema_version": 1,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": "PASS_PRE_GENERATION_COMMISSION_BUILT_TRAINING_BLOCKED",
        "baseline_model": summary["model"],
        "measured_reasons_for_commission": {
            "one_target_direct_exact": summary["direct_one_target"],
            "multi_target_direct_exact": summary["direct_by_ambiguity_class"][
                "multiple_accepted_targets"
            ],
            "definition_context_exact": summary["suites"]["lexical_context_closed"],
            "source_record_paired_task_outcomes": hypotheses[
                "source_record_outcome_classes"
            ],
            "synthetic_holdout": summary["suites"]["synthetic_holdout"],
            "historical_holdout": summary["suites"]["historical_holdout"],
        },
        "pair_budget": contract["pair_budget"],
        "cross_cutting_requirements": contract["cross_cutting_requirements"],
        "counts": {
            "construction_families": len(construction_rows),
            "future_unique_sentence_pairs": sum(
                row["new_pair_quota"] for row in construction_rows
            ),
            "bounded_existing_template_families": sum(
                row["readiness"] == "bounded_existing_templates_only"
                for row in construction_rows
            ),
            "families_requiring_new_productive_rule_review": sum(
                row["readiness"] != "bounded_existing_templates_only"
                for row in construction_rows
            ),
            "douglas_phenomena_in_source_queue": len(
                resolved["douglas_sentence_preconditions"]
            ),
            "douglas_phenomena_covered_by_pilot": len(covered_tags),
            "douglas_phenomena_deferred": len(deferred),
            "source_pair_review_rows": len(source_pair_queue),
            "historical_source_pair_review_rows": sum(
                row["source_class"] == "historical_descriptive_grammar_example"
                for row in source_pair_queue
            ),
            "current_curriculum_pair_review_rows": sum(
                row["source_class"] == "current_curriculum_explicit_pair"
                for row in source_pair_queue
            ),
            "lexical_failure_review_rows": len(lexical_queue),
            "lexical_items_selected_for_500_row_overlay": sum(
                row["selected_for_500_row_pilot_overlay"] for row in lexical_queue
            ),
            "known_target_confusion_groups": len(resolved["known_target_confusions"]),
        },
        "construction_readiness": dict(sorted(readiness_counts.items())),
        "lexical_queue_outcomes": dict(sorted(lexical_outcomes.items())),
        "decisions": [
            "Do not continue the raw free-form definition-context objective.",
            "Do not spend RunPod time before family evidence, morphology, splits and 3,000 candidate rows pass their gates.",
            "Keep isolated dictionary reconstruction outside the 3,000-sentence budget.",
            "Use 500 sentence rows as a lexical-competition overlay after POS, sense and role review.",
            "Use 300 glossary-conditioned presentations as additional task rows derived from approved training sentences.",
            "Keep historical source witnesses, current pedagogical pairs and generated candidates in distinct evidence classes.",
        ],
        "next_gates": [
            "Review the 60 explicit source-pair witnesses and split source-preserved sentence sets without guessing.",
            "Resolve POS, sense, variety and construction roles for the first 500 lexical queue items.",
            "Accept or reject productive morphology and current surface realizations family by family.",
            "Render a 300-pair dry-run census and reject any family with leakage, implausible bindings or unlicensed morphology.",
            "Expand the passing dry run to the frozen 3,000-pair split and rerun all audits before RunPod authorization.",
        ],
        "training_authorized": False,
        "runpod_authorized": False,
        "claim_limit": CLAIM_LIMIT,
    }

    output_dir.mkdir(parents=True)
    outputs = {
        "CONSTRUCTION-COMMISSION.jsonl": construction_rows,
        "SOURCE-PAIR-REVIEW-QUEUE.jsonl": source_pair_queue,
        "LEXICAL-COMPETITION-QUEUE.jsonl": lexical_queue,
        "DEFERRED-PHENOMENA.jsonl": deferred,
    }
    for name, rows in outputs.items():
        write_jsonl_atomic(output_dir / name, rows)
    write_json_atomic(output_dir / "REPORT.json", report)

    manifest = {
        "schema_version": 1,
        "commission_id": contract["commission_id"],
        "created_at_utc": contract["created_at_utc"],
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
        "outputs": {
            name: {"rows": len(rows)} for name, rows in outputs.items()
        }
        | {"REPORT.json": {"rows": 1}},
        "training_authorized": False,
        "runpod_authorized": False,
        "claim_limit": CLAIM_LIMIT,
    }
    write_json_atomic(output_dir / "MANIFEST.json", manifest)

    checksummed = sorted(path for path in output_dir.iterdir() if path.is_file())
    checksums = "".join(f"{sha256_file(path)}  {path.name}\n" for path in checksummed)
    write_text_atomic(output_dir / "OUTPUT-SHA256SUMS", checksums)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

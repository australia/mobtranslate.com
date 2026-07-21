#!/usr/bin/env python3
"""Join lexical failures and context evidence into a pre-training review queue."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unicodedata
from typing import Any, Iterable


TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-'][^\W\d_]+)*|\d+", re.UNICODE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--curated-census", type=Path, required=True)
    parser.add_argument("--context-inventory", type=Path, required=True)
    parser.add_argument("--curated-row-analysis", type=Path, required=True)
    parser.add_argument("--overlap-rows", type=Path, required=True)
    parser.add_argument("--expected-candidate", action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary-output", type=Path, required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).casefold().split())


def surface_key(value: Any) -> str:
    return " ".join(TOKEN_RE.findall(normalize(value)))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"invalid JSON at {path}:{line_number}: {error}"
                ) from error
            if not isinstance(row, dict):
                raise ValueError(f"expected object at {path}:{line_number}")
            yield row


def write_json_atomic(path: Path, value: Any, *, jsonl: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        if jsonl:
            for row in value:
                handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        else:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
    temporary.chmod(0o664)
    temporary.replace(path)


def evidence_totals(contexts: list[dict[str, Any]]) -> dict[str, int]:
    fields = (
        "synthetic_explicit_rows",
        "synthetic_surface_rows",
        "usage_rows",
        "usage_verified_rows",
        "usage_unverified_rows",
        "xigt_source_backed_rows",
        "xigt_source_backed_clause_rows",
    )
    return {
        field: sum(
            int((context.get("context_evidence") or {}).get(field) or 0)
            for context in contexts
        )
        for field in fields
    }


def workflow_actions(
    *,
    ambiguous: bool,
    accepted_reference_count: int,
    overlap_relation: str | None,
    totals: dict[str, int],
    all_forms_zero_context: bool,
) -> list[str]:
    actions = ["adjudicate_dictionary_sense_pos_variety_and_citation_form"]
    if ambiguous or accepted_reference_count > 1:
        actions.append("resolve_prompt_ambiguity_and_accepted_reference_scope")
    if overlap_relation and overlap_relation != "shared_accepted_form":
        actions.append("resolve_cross_resource_form_relation")
    if totals["xigt_source_backed_rows"]:
        actions.append("validate_existing_source_backed_xigt_context")
    if totals["usage_unverified_rows"]:
        actions.append("audit_existing_unverified_usage_context")
    if totals["synthetic_explicit_rows"] or totals["synthetic_surface_rows"]:
        actions.append("review_existing_synthetic_context_against_source_grammar")
    if all_forms_zero_context:
        actions.append("consider_new_fluent_speaker_sentence_after_adjudication")
    return actions


def main() -> None:
    args = parse_args()
    expected_candidates = set(args.expected_candidate)

    contexts: dict[str, dict[str, Any]] = {}
    for row in read_jsonl(args.context_inventory):
        key = surface_key(row.get("normalized_headword") or row.get("headword"))
        if not key or key in contexts:
            raise ValueError(f"duplicate or empty context headword: {key!r}")
        contexts[key] = row

    overlaps: dict[str, dict[str, Any]] = {}
    for row in read_jsonl(args.overlap_rows):
        key = normalize(row.get("prompt"))
        if not key or key in overlaps:
            raise ValueError(f"duplicate or empty overlap prompt: {key!r}")
        overlaps[key] = row

    diagnostics: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    observed_candidates = set()
    for row in read_jsonl(args.curated_row_analysis):
        row_id = str(row.get("id") or "")
        candidate = str(row.get("candidate") or "")
        if not row_id or not candidate:
            raise ValueError("row analysis contains an empty id or candidate")
        if candidate in diagnostics[row_id]:
            raise ValueError(f"duplicate diagnostic for {row_id}/{candidate}")
        analysis = row.get("analysis") or {}
        diagnostics[row_id][candidate] = {
            "prediction": row.get("prediction"),
            "accepted_exact": bool(analysis.get("exact_accepted")),
            "error_category": row.get("error_category"),
            "minimum_grapheme_error_rate": row.get("minimum_grapheme_error_rate"),
            "target_subwords": (row.get("token_counts") or {}).get("target_subwords"),
            "documented_v21_2_target_occurrences": row.get(
                "documented_v21_2_target_occurrences"
            ),
        }
        observed_candidates.add(candidate)

    if expected_candidates and observed_candidates != expected_candidates:
        raise ValueError(
            f"candidate set mismatch: expected {sorted(expected_candidates)}, observed {sorted(observed_candidates)}"
        )
    candidate_labels = sorted(expected_candidates or observed_candidates)
    if not candidate_labels:
        raise ValueError("row analysis yielded no candidates")

    output_rows = []
    prompt_counts = Counter()
    exact_by_candidate = Counter()
    error_by_candidate: dict[str, Counter[str]] = defaultdict(Counter)
    context_result_by_candidate: dict[str, dict[str, Counter[str]]] = defaultdict(
        lambda: defaultdict(Counter)
    )
    seen_census_ids = set()

    for census in read_jsonl(args.curated_census):
        row_id = str(census.get("id") or "")
        if not row_id or row_id in seen_census_ids:
            raise ValueError(f"duplicate or empty census id: {row_id!r}")
        seen_census_ids.add(row_id)
        if set(diagnostics.get(row_id, {})) != set(candidate_labels):
            raise ValueError(f"incomplete diagnostics for {row_id}")

        curated = census.get("curated_dictionary") or {}
        accepted_references = list(census.get("accepted_references") or [])
        accepted_keys = sorted(
            {surface_key(value) for value in accepted_references if surface_key(value)}
        )
        if not accepted_keys:
            raise ValueError(
                f"census row has no normalized accepted reference: {row_id}"
            )
        context_records = [contexts[key] for key in accepted_keys if key in contexts]
        missing_context_records = sorted(set(accepted_keys).difference(contexts))
        if missing_context_records:
            raise ValueError(
                f"context inventory is incomplete for {row_id}: {missing_context_records}"
            )
        totals = evidence_totals(context_records)
        any_context = any(
            bool(
                (context.get("coverage_flags") or {}).get("has_any_identified_context")
            )
            for context in context_records
        )
        all_forms_zero_context = bool(context_records) and not any_context
        prompt = str(census.get("unconditioned_input_text") or "")
        overlap = overlaps.get(normalize(prompt))
        overlap_relation = str(overlap.get("relation")) if overlap else None
        entries = list(curated.get("entry_records") or [])
        parts_of_speech = sorted(
            {
                normalize(entry.get("type"))
                for entry in entries
                if normalize(entry.get("type"))
            }
        )
        semantic_domains = sorted(
            {
                normalize(entry.get("semantic_domain"))
                for entry in entries
                if normalize(entry.get("semantic_domain"))
            }
        )
        row_diagnostics = diagnostics[row_id]
        exact_labels = sorted(
            label
            for label, record in row_diagnostics.items()
            if record["accepted_exact"]
        )

        flags = {
            "ambiguous_surface_prompt": bool(curated.get("ambiguous_surface_prompt")),
            "identity_translation": bool(curated.get("identity_translation")),
            "multiple_accepted_references": len(accepted_references) > 1,
            "all_accepted_forms_zero_identified_context": all_forms_zero_context,
            "any_source_backed_xigt_context": totals["xigt_source_backed_rows"] > 0,
            "any_unverified_usage_context": totals["usage_unverified_rows"] > 0,
            "any_synthetic_context": bool(
                totals["synthetic_explicit_rows"] or totals["synthetic_surface_rows"]
            ),
            "cross_resource_review_required": bool(
                overlap_relation and overlap_relation != "shared_accepted_form"
            ),
            "all_evaluated_models_failed_exact_reconstruction": not exact_labels,
        }
        for flag, enabled in flags.items():
            prompt_counts[flag] += int(enabled)
        if all_forms_zero_context and not exact_labels:
            prompt_counts["zero_context_and_all_models_failed"] += 1
        for label, record in row_diagnostics.items():
            exact_by_candidate[label] += int(record["accepted_exact"])
            error_by_candidate[label][str(record["error_category"] or "unknown")] += 1
            context_bucket = (
                "zero_identified_context"
                if all_forms_zero_context
                else "some_identified_context"
            )
            context_result_by_candidate[label][context_bucket]["rows"] += 1
            context_result_by_candidate[label][context_bucket]["accepted_exact"] += int(
                record["accepted_exact"]
            )

        output_rows.append(
            {
                "schema_version": 1,
                "id": row_id,
                "prompt": prompt,
                "accepted_references": accepted_references,
                "accepted_reference_keys": accepted_keys,
                "entry_records": entries,
                "parts_of_speech": parts_of_speech,
                "semantic_domains": semantic_domains,
                "context_evidence_totals": totals,
                "context_records_found": len(context_records),
                "missing_context_record_keys": missing_context_records,
                "cross_resource_overlap": (
                    {
                        "relation": overlap_relation,
                        "grammar_accepted_references": (
                            overlap.get("grammar_extraction") or {}
                        ).get("accepted_references"),
                        "matching_pairs": overlap.get("matching_pairs"),
                    }
                    if overlap
                    else None
                ),
                "model_diagnostics": row_diagnostics,
                "exact_reconstruction_labels": exact_labels,
                "review_flags": flags,
                "workflow_actions": workflow_actions(
                    ambiguous=flags["ambiguous_surface_prompt"],
                    accepted_reference_count=len(accepted_references),
                    overlap_relation=overlap_relation,
                    totals=totals,
                    all_forms_zero_context=all_forms_zero_context,
                ),
                "automatic_sentence_generation_authorized": False,
                "new_sentence_requirement": "undetermined_pending_human_review",
                "interpretation": (
                    "A lexical/context review record, not authorization to generate a Kuku Yalanji sentence and "
                    "not evidence that lexical reconstruction predicts sentence translation."
                ),
            }
        )

    orphan_diagnostics = sorted(set(diagnostics).difference(seen_census_ids))
    if orphan_diagnostics:
        raise ValueError(
            f"row analysis has {len(orphan_diagnostics)} ids absent from the curated census"
        )

    zero_context_headwords = {
        key
        for key, row in contexts.items()
        if not (row.get("coverage_flags") or {}).get("has_any_identified_context")
    }
    zero_context_name_domain = {
        key
        for key in zero_context_headwords
        if any(
            normalize(value).endswith("-name")
            for value in contexts[key].get("semantic_domains") or []
        )
    }
    summary = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "sentence_evidence_pretraining_review_queue",
        "curated_prompt_rows": len(output_rows),
        "curated_headwords": len(contexts),
        "candidate_labels": candidate_labels,
        "prompt_flag_counts": dict(sorted(prompt_counts.items())),
        "accepted_exact_by_candidate": {
            label: exact_by_candidate[label] for label in candidate_labels
        },
        "error_categories_by_candidate": {
            label: dict(sorted(error_by_candidate[label].items()))
            for label in candidate_labels
        },
        "reconstruction_by_context_evidence": {
            label: {
                bucket: dict(sorted(counts.items()))
                for bucket, counts in sorted(context_result_by_candidate[label].items())
            }
            for label in candidate_labels
        },
        "headword_context_counts": {
            "zero_identified_context": len(zero_context_headwords),
            "zero_context_name_domains": len(zero_context_name_domain),
            "zero_context_other_domains_pre_review": len(
                zero_context_headwords - zero_context_name_domain
            ),
        },
        "inputs": {
            "curated_census": {
                "path": str(args.curated_census.resolve()),
                "sha256": sha256(args.curated_census),
            },
            "context_inventory": {
                "path": str(args.context_inventory.resolve()),
                "sha256": sha256(args.context_inventory),
            },
            "curated_row_analysis": {
                "path": str(args.curated_row_analysis.resolve()),
                "sha256": sha256(args.curated_row_analysis),
            },
            "overlap_rows": {
                "path": str(args.overlap_rows.resolve()),
                "sha256": sha256(args.overlap_rows),
            },
        },
        "interpretation": [
            "This is a complete curated-resource census, not a random sample of future user queries.",
            "Zero identified context is a pre-review condition, not proof that a new sentence is required.",
            "Existing synthetic, usage, and XIGT rows remain evidence candidates until their separate reviews pass.",
            "No row automatically authorizes target-language generation, training, or a sentence-translation claim.",
        ],
        "output": {"path": str(args.output.resolve())},
    }
    write_json_atomic(args.output, output_rows, jsonl=True)
    summary["output"]["sha256"] = sha256(args.output)
    write_json_atomic(args.summary_output, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

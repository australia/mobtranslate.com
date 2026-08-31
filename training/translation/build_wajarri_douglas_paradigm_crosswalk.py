#!/usr/bin/env python3
"""Rank current-dictionary candidates for reviewed Douglas verb forms.

The output is a recall-oriented review queue. It uses dynamic surface and gloss
similarity, keeps source provenance visible, and never promotes a ranking to a
historical/current correspondence or a synthetic sentence-pair authorization.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)
RECORDED = "source_recorded"
HYPOTHESIZED = "source_hypothesized_unrecorded"


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


def ngrams(value: str, size: int = 3) -> set[str]:
    padded = f"^{value}$"
    if len(padded) <= size:
        return {padded}
    return {padded[index : index + size] for index in range(len(padded) - size + 1)}


def jaccard(left: set[str], right: set[str]) -> float:
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def surface_score(source_surface: str, candidate_surface: str) -> dict[str, Any]:
    source = normalize_surface(source_surface)
    candidate = normalize_surface(candidate_surface)
    if not source or not candidate:
        return {
            "score": 0.0,
            "sequence_ratio": 0.0,
            "trigram_jaccard": 0.0,
            "containment": 0.0,
            "normalized_exact": False,
            "literal_exact": False,
        }
    sequence = SequenceMatcher(None, source, candidate).ratio()
    trigram = jaccard(ngrams(source), ngrams(candidate))
    shorter = min(len(source), len(candidate))
    longer = max(len(source), len(candidate))
    containment = 0.0
    if shorter >= 3 and (source.startswith(candidate) or candidate.startswith(source)):
        containment = shorter / longer
    normalized_exact = source == candidate
    literal_exact = (
        unicodedata.normalize("NFKC", source_surface).casefold()
        == unicodedata.normalize("NFKC", candidate_surface).casefold()
    )
    score = max(
        0.55 * sequence + 0.45 * trigram,
        0.82 * containment + 0.18 * sequence,
        1.0 if normalized_exact else 0.0,
    )
    return {
        "score": round(score, 6),
        "sequence_ratio": round(sequence, 6),
        "trigram_jaccard": round(trigram, 6),
        "containment": round(containment, 6),
        "normalized_exact": normalized_exact,
        "literal_exact": literal_exact,
    }


def lexical_tokens(value: str | None) -> set[str]:
    if not value:
        return set()
    return {
        normalize_surface(match.group(0))
        for match in WORD_RE.finditer(value)
        if normalize_surface(match.group(0))
    }


def text_similarity(clue: str | None, evidence: str) -> float:
    return jaccard(lexical_tokens(clue), lexical_tokens(evidence))


def aggregate_senses(senses: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"translations": set(), "definitions": set(), "sense_ids": []}
    )
    for row in senses:
        entry_id = row["entryCandidateId"]
        grouped[entry_id]["sense_ids"].append(row["senseCandidateId"])
        for field, target in (
            ("translationSource", "translations"),
            ("definitionSource", "definitions"),
        ):
            value = row.get(field)
            if isinstance(value, str) and value.strip():
                grouped[entry_id][target].add(value)
    return {
        entry_id: {
            "sense_ids": sorted(values["sense_ids"]),
            "translations": sorted(values["translations"]),
            "definitions": sorted(values["definitions"]),
        }
        for entry_id, values in grouped.items()
    }


def classify_source(
    form: dict[str, Any],
    entry: dict[str, Any],
    source: dict[str, Any] | None,
) -> str:
    source_type = str((source or {}).get("source_type", "")).casefold()
    if form.get("status") == "accepted" and "speaker_attributed" in source_type:
        return "accepted_speaker_attributed_source"
    if (
        form.get("formType") == "historical_published_headword_or_variant_set"
        or entry.get("sourceId") == "src-wbv-douglas-1981-anu-20260722"
    ):
        return "same_douglas_historical_collection"
    return "unadjudicated_legacy_source"


def rank_candidates(
    historical_form: dict[str, Any],
    *,
    current_forms: list[dict[str, Any]],
    entries: dict[str, dict[str, Any]],
    senses: dict[str, dict[str, Any]],
    sources: dict[str, dict[str, Any]],
    limit: int,
    surface_weight: float,
    gloss_weight: float,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for form in current_forms:
        entry_id = form["entryCandidateId"]
        entry = entries[entry_id]
        sense = senses.get(
            entry_id, {"translations": [], "definitions": [], "sense_ids": []}
        )
        evidence = " ".join(sense["translations"] + sense["definitions"])
        surface = surface_score(historical_form["surface"], form["surfaceSource"])
        gloss = text_similarity(historical_form["lexical_gloss"], evidence)
        combined = surface_weight * surface["score"] + gloss_weight * gloss
        source_id = entry.get("sourceId")
        source = sources.get(source_id) if isinstance(source_id, str) else None
        candidates.append(
            {
                "entry_candidate_id": entry_id,
                "form_candidate_id": form["formCandidateId"],
                "source_record_id": form.get("sourceRecordId"),
                "source_id": source_id,
                "source_type": (source or {}).get("source_type"),
                "source_class": classify_source(form, entry, source),
                "form_status": form.get("status"),
                "form_type": form.get("formType"),
                "orthography": form.get("orthography"),
                "variety": form.get("variety"),
                "current_surface": form["surfaceSource"],
                "current_translations": sense["translations"],
                "current_definitions": sense["definitions"],
                "current_sense_candidate_ids": sense["sense_ids"],
                "surface_score": surface,
                "lexical_gloss_jaccard": round(gloss, 6),
                "combined_review_score": round(combined, 6),
                "relation_status": "unadjudicated_candidate",
                "automatic_acceptance_allowed": False,
            }
        )
    candidates.sort(
        key=lambda row: (
            -row["combined_review_score"],
            -row["surface_score"]["score"],
            row["entry_candidate_id"],
        )
    )
    selected = candidates[:limit]
    for rank, candidate in enumerate(selected, start=1):
        candidate["rank"] = rank
    return selected


def evidence_state(candidates: list[dict[str, Any]], near_threshold: float) -> str:
    exact = [row for row in candidates if row["surface_score"]["normalized_exact"]]
    exact_with_gloss_overlap = [
        row for row in exact if row["lexical_gloss_jaccard"] > 0
    ]
    if any(
        row["source_class"] == "accepted_speaker_attributed_source"
        for row in exact_with_gloss_overlap
    ):
        return "speaker_attributed_exact_candidate_with_literal_gloss_overlap_needs_variety_and_feature_review"
    if any(
        row["source_class"] == "unadjudicated_legacy_source"
        for row in exact_with_gloss_overlap
    ):
        return "legacy_exact_candidate_with_literal_gloss_overlap_needs_source_and_feature_review"
    if any(
        row["source_class"] == "same_douglas_historical_collection"
        for row in exact_with_gloss_overlap
    ):
        return "historical_self_match_with_literal_gloss_overlap_needs_independent_current_confirmation"
    if exact:
        return "surface_exact_without_literal_gloss_overlap_needs_homophony_and_sense_review"
    if any(
        row["source_class"] == "accepted_speaker_attributed_source"
        and row["surface_score"]["score"] >= near_threshold
        for row in candidates
    ):
        return "speaker_attributed_near_candidate_needs_correspondence_review"
    if candidates[0]["surface_score"]["score"] >= near_threshold:
        return "surface_near_candidate_needs_correspondence_review"
    return "no_strong_current_surface_candidate"


def build_crosswalk_rows(
    recorded_forms: list[dict[str, Any]],
    *,
    current_forms: list[dict[str, Any]],
    entries: dict[str, dict[str, Any]],
    senses: dict[str, dict[str, Any]],
    sources: dict[str, dict[str, Any]],
    ranking: dict[str, Any],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for historical in recorded_forms:
        candidates = rank_candidates(
            historical,
            current_forms=current_forms,
            entries=entries,
            senses=senses,
            sources=sources,
            limit=ranking["candidate_limit"],
            surface_weight=ranking["surface_weight"],
            gloss_weight=ranking["gloss_weight"],
        )
        if not candidates:
            raise ValueError("current candidate ranking unexpectedly empty")
        gap = (
            candidates[0]["combined_review_score"]
            - candidates[1]["combined_review_score"]
            if len(candidates) > 1
            else candidates[0]["combined_review_score"]
        )
        exact_classes = sorted(
            {
                candidate["source_class"]
                for candidate in candidates
                if candidate["surface_score"]["normalized_exact"]
            }
        )
        exact_with_gloss_overlap = [
            candidate
            for candidate in candidates
            if candidate["surface_score"]["normalized_exact"]
            and candidate["lexical_gloss_jaccard"] > 0
        ]
        output.append(
            {
                "schema_version": 1,
                "historical_form_id": historical["form_id"],
                "historical_cell_id": historical["cell_id"],
                "row_key": historical["row_key"],
                "lexical_gloss": historical["lexical_gloss"],
                "category": historical["category"],
                "historical_surface": historical["surface"],
                "historical_evidence_status": historical["evidence_status"],
                "ranked_current_candidates": candidates,
                "diagnostics": {
                    "top_surface_score": candidates[0]["surface_score"]["score"],
                    "top_normalized_exact": candidates[0]["surface_score"][
                        "normalized_exact"
                    ],
                    "top_source_class": candidates[0]["source_class"],
                    "combined_score_gap": round(gap, 6),
                    "rank_ambiguous": gap
                    <= ranking["ambiguity_gap_threshold"],
                    "exact_candidate_source_classes": exact_classes,
                    "exact_candidate_with_literal_gloss_overlap_count": len(
                        exact_with_gloss_overlap
                    ),
                    "top_literal_gloss_overlap": candidates[0][
                        "lexical_gloss_jaccard"
                    ],
                },
                "evidence_state": evidence_state(
                    candidates, ranking["near_surface_score_at_least"]
                ),
                "current_correspondence_status": "unadjudicated_candidates_only",
                "productive_rule_status": "not_authorized",
                "automatic_acceptance_allowed": False,
                "synthetic_eligibility": "not_authorized",
                "training_eligibility": "not_allowed",
                "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
            }
        )
    return output


def excluded_row(form: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        **form,
        "crosswalk_exclusion_reason": reason,
        "current_correspondence_status": "not_assessed",
        "productive_rule_status": "not_authorized",
        "synthetic_eligibility": "not_authorized",
        "training_eligibility": "not_allowed",
        "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
    }


def build_gap_summaries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["row_key"]].append(row)
    output: list[dict[str, Any]] = []
    for row_key, members in sorted(grouped.items()):
        state_counts = Counter(row["evidence_state"] for row in members)
        output.append(
            {
                "schema_version": 1,
                "gap_summary_id": f"wbv-douglas-paradigm-gap-{row_key}",
                "historical_row_key": row_key,
                "lexical_gloss": members[0]["lexical_gloss"],
                "recorded_historical_forms_reviewed": len(members),
                "top_normalized_exact_candidates": sum(
                    row["diagnostics"]["top_normalized_exact"] for row in members
                ),
                "exact_candidates_with_literal_gloss_overlap": sum(
                    row["diagnostics"][
                        "exact_candidate_with_literal_gloss_overlap_count"
                    ]
                    > 0
                    for row in members
                ),
                "rank_ambiguous_forms": sum(
                    row["diagnostics"]["rank_ambiguous"] for row in members
                ),
                "evidence_state_counts": dict(sorted(state_counts.items())),
                "categories": sorted({row["category"] for row in members}),
                "current_correspondences_accepted": 0,
                "productive_rules_accepted": 0,
                "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
                "training_eligibility": "not_allowed",
            }
        )
    return output


def validate_zero_invariants(groups: list[list[dict[str, Any]]]) -> None:
    for group in groups:
        for row in group:
            if row["controlled_bilingual_english_wajarri_sentence_pairs_added"] != 0:
                raise ValueError("crosswalk review must not issue sentence pairs")
            if row.get("training_eligibility") not in {None, "not_allowed"}:
                raise ValueError("crosswalk review must not authorize training")


def write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)


def build_inventory(
    *, program_root: Path, contract_path: Path, build_root: Path
) -> dict[str, Any]:
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("contract schema_version must be 1")
    inputs = contract["inputs"]
    required = {
        key: require_hash(program_root, spec, key) for key, spec in inputs.items()
    }
    paradigm_manifest = load_json(required["paradigm_review_manifest"])
    historical_forms = load_jsonl(required["paradigm_forms"])
    current_forms = load_jsonl(required["current_forms"])
    current_entries = load_jsonl(required["current_entries"])
    current_senses = load_jsonl(required["current_senses"])
    source_rows = load_jsonl(required["source_ledger"])
    expected = contract["expected_counts"]
    for key, actual in (
        ("paradigm_forms", len(historical_forms)),
        ("current_forms", len(current_forms)),
        ("current_entries", len(current_entries)),
        ("current_senses", len(current_senses)),
        ("source_ledger_rows", len(source_rows)),
    ):
        if actual != expected[key]:
            raise ValueError(f"{key} changed: expected {expected[key]}, found {actual}")
    if paradigm_manifest.get("inventory_id") != contract["source_inventory_id"]:
        raise ValueError("paradigm review identity changed")

    entry_map = {row["entryCandidateId"]: row for row in current_entries}
    if len(entry_map) != len(current_entries):
        raise ValueError("current entry IDs must be unique")
    if any(form["entryCandidateId"] not in entry_map for form in current_forms):
        raise ValueError("current form references unknown entry")
    source_map = {row["source_id"]: row for row in source_rows}
    if len(source_map) != len(source_rows):
        raise ValueError("source ledger IDs must be unique")
    sense_map = aggregate_senses(current_senses)

    recorded_irregular = [
        row
        for row in historical_forms
        if row["table_key"] == "table-3.4-irregular-verb-inflections"
        and row["evidence_status"] == RECORDED
    ]
    hypothesized_irregular = [
        row
        for row in historical_forms
        if row["table_key"] == "table-3.4-irregular-verb-inflections"
        and row["evidence_status"] == HYPOTHESIZED
    ]
    regular_suffixes = [
        row
        for row in historical_forms
        if row["table_key"] == "table-3.3-regular-verb-inflections"
    ]
    partition = {
        "recorded_irregular_forms_ranked": len(recorded_irregular),
        "source_hypothesized_irregular_forms_excluded": len(hypothesized_irregular),
        "regular_suffix_forms_excluded_from_lexical_crosswalk": len(regular_suffixes),
    }
    for key, actual in partition.items():
        if actual != expected[key]:
            raise ValueError(f"{key} changed: expected {expected[key]}, found {actual}")
    if sum(partition.values()) != len(historical_forms):
        raise ValueError("historical form partition is incomplete or overlapping")

    ranked = build_crosswalk_rows(
        recorded_irregular,
        current_forms=current_forms,
        entries=entry_map,
        senses=sense_map,
        sources=source_map,
        ranking=contract["ranking"],
    )
    hypothesized = [
        excluded_row(
            row,
            "source_parenthesized_unrecorded_hypothesis_not_eligible_for_current_confirmation_or_training",
        )
        for row in hypothesized_irregular
    ]
    suffixes = [
        excluded_row(
            row,
            "bound_affix_surface_is_not_a_complete_lexical_form_and_is_not_scored_against_dictionary_headwords",
        )
        for row in regular_suffixes
    ]
    gaps = build_gap_summaries(ranked)
    validate_zero_invariants([ranked, hypothesized, suffixes, gaps])

    state_counts = Counter(row["evidence_state"] for row in ranked)
    top_source_counts = Counter(
        row["diagnostics"]["top_source_class"] for row in ranked
    )
    report = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "status": "historical_verb_form_current_dictionary_candidate_crosswalk",
        "counts": {
            **partition,
            "historical_forms_accounted_for": len(historical_forms),
            "lexeme_gap_summaries": len(gaps),
            "top_normalized_exact_candidates": sum(
                row["diagnostics"]["top_normalized_exact"] for row in ranked
            ),
            "exact_candidates_with_literal_gloss_overlap": sum(
                row["diagnostics"][
                    "exact_candidate_with_literal_gloss_overlap_count"
                ]
                > 0
                for row in ranked
            ),
            "top_surface_exact_without_literal_gloss_overlap": sum(
                row["diagnostics"]["top_normalized_exact"]
                and row["diagnostics"][
                    "exact_candidate_with_literal_gloss_overlap_count"
                ]
                == 0
                for row in ranked
            ),
            "rank_ambiguous_forms": sum(
                row["diagnostics"]["rank_ambiguous"] for row in ranked
            ),
            "current_correspondences_accepted": 0,
            "productive_grammar_rules_accepted": 0,
            "coverage_cells_issued": 0,
            "controlled_bilingual_english_wajarri_sentence_pairs": 0,
            "benchmark_rows": 0,
            "training_eligible_rows": 0,
        },
        "evidence_state_counts": dict(sorted(state_counts.items())),
        "top_candidate_source_class_counts": dict(sorted(top_source_counts.items())),
        "ranking": contract["ranking"],
        "interpretation": (
            "A high or exact rank is a review lead only. Exact spelling without "
            "literal source-gloss overlap is a homophony and sense-review problem, "
            "not lexical confirmation; a Douglas self-match is not independent "
            "current evidence."
        ),
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    payloads = {
        "recorded-irregular-form-candidates.jsonl": jsonl_bytes(ranked),
        "excluded-source-hypothesized-forms.jsonl": jsonl_bytes(hypothesized),
        "regular-suffix-lexical-crosswalk-boundary.jsonl": jsonl_bytes(suffixes),
        "lexeme-evidence-gap-summaries.jsonl": jsonl_bytes(gaps),
        "REPORT.json": json_bytes(report),
    }
    for name, payload in payloads.items():
        write_bytes(build_root / name, payload)

    components: dict[str, dict[str, Any]] = {}
    for name in sorted(payloads):
        item: dict[str, Any] = {
            "path": name,
            "sha256": sha256_file(build_root / name),
        }
        if name.endswith(".jsonl"):
            item["rows"] = len(load_jsonl(build_root / name))
        components[name.replace("-", "_").replace(".", "_")] = item
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
        "counts": report["counts"],
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
    write_bytes(build_root / "MANIFEST.json", json_bytes(manifest))
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
                **manifest["counts"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

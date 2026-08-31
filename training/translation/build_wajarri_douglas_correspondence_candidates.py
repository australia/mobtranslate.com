#!/usr/bin/env python3
"""Rank current-dictionary candidates for reviewed Douglas example tokens.

This is a recall-oriented review aid. It uses dynamic surface similarity and
source-authored gloss context, preserves ambiguity, and never converts a rank
into a historical/current correspondence or a training authorization.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
import unicodedata
from collections import defaultdict
from collections.abc import Iterable
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)


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


def strip_edge_punctuation(value: str) -> str:
    start = 0
    end = len(value)
    while start < end and not value[start].isalnum():
        start += 1
    while end > start and not value[end - 1].isalnum():
        end -= 1
    return value[start:end]


def surface_projections(value: str) -> list[dict[str, str]]:
    token = strip_edge_punctuation(value)
    candidates: list[tuple[str, str]] = [("full_surface", token)]
    if "-" in token:
        pieces = token.split("-")
        for end in range(1, len(pieces)):
            candidates.append((f"hyphen_prefix_{end}", "-".join(pieces[:end])))
        candidates.append(("hyphenless_surface", "".join(pieces)))
    seen: set[str] = set()
    projections: list[dict[str, str]] = []
    for kind, surface in candidates:
        normalized = normalize_surface(surface)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        projections.append(
            {"projection_kind": kind, "surface": surface, "normalized": normalized}
        )
    return projections


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


def best_surface_score(
    projections: list[dict[str, str]], candidate_surface: str
) -> dict[str, Any]:
    candidate = normalize_surface(candidate_surface)
    candidate_literal = unicodedata.normalize(
        "NFKC", strip_edge_punctuation(candidate_surface)
    ).casefold()
    best: dict[str, Any] = {
        "score": 0.0,
        "sequence_ratio": 0.0,
        "trigram_jaccard": 0.0,
        "containment": 0.0,
        "normalized_exact_projection": False,
        "literal_exact_projection": False,
        "projection_kind": None,
        "projection_surface": None,
    }
    if not candidate:
        return best
    for projection in projections:
        source = projection["normalized"]
        sequence = SequenceMatcher(None, source, candidate).ratio()
        trigram = jaccard(ngrams(source), ngrams(candidate))
        shorter = min(len(source), len(candidate))
        longer = max(len(source), len(candidate))
        containment = 0.0
        if shorter >= 3 and (source.startswith(candidate) or candidate.startswith(source)):
            containment = shorter / longer
        normalized_exact = source == candidate
        projection_literal = unicodedata.normalize(
            "NFKC", strip_edge_punctuation(projection["surface"])
        ).casefold()
        literal_exact = projection_literal == candidate_literal
        score = max(
            0.55 * sequence + 0.45 * trigram,
            0.82 * containment + 0.18 * sequence,
            1.0 if normalized_exact else 0.0,
        )
        comparison = (
            score,
            literal_exact,
            normalized_exact,
            sequence,
            trigram,
            containment,
        )
        incumbent = (
            best["score"],
            best["literal_exact_projection"],
            best["normalized_exact_projection"],
            best["sequence_ratio"],
            best["trigram_jaccard"],
            best["containment"],
        )
        if comparison > incumbent:
            best = {
                "score": round(score, 6),
                "sequence_ratio": round(sequence, 6),
                "trigram_jaccard": round(trigram, 6),
                "containment": round(containment, 6),
                "normalized_exact_projection": normalized_exact,
                "literal_exact_projection": literal_exact,
                "projection_kind": projection["projection_kind"],
                "projection_surface": projection["surface"],
            }
    return best


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


def token_rows(reviewed_examples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for example in reviewed_examples:
        historical = example["historical_source_record"]
        source_tokens = historical["historical_wajarri_text"].split()
        gloss = historical.get("source_morpheme_gloss")
        gloss_tokens = gloss.split() if gloss else []
        positional = bool(gloss_tokens) and len(gloss_tokens) == len(source_tokens)
        for index, raw_token in enumerate(source_tokens, start=1):
            token = strip_edge_punctuation(raw_token)
            rows.append(
                {
                    "token_occurrence_id": f"{example['review_id']}:token:{index:02d}",
                    "review_id": example["review_id"],
                    "example_number": example["example_number"],
                    "token_index": index,
                    "historical_surface": token,
                    "surface_projections": surface_projections(token),
                    "positional_source_gloss": (
                        gloss_tokens[index - 1] if positional else None
                    ),
                    "source_gloss_alignment_status": (
                        "positionally_aligned_candidate_not_validated"
                        if positional
                        else "not_positionally_aligned"
                    ),
                    "source_free_translation": historical[
                        "source_free_translation"
                    ],
                    "phenomenon_tags": example["curation_context"][
                        "phenomenon_tags"
                    ],
                    "source": example["source"],
                }
            )
    return rows


def aggregate_current_senses(
    senses: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"translations": set(), "definitions": set(), "sense_ids": []}
    )
    for row in senses:
        entry_id = row["entryCandidateId"]
        grouped[entry_id]["sense_ids"].append(row["senseCandidateId"])
        for key, target in (
            ("translationSource", "translations"),
            ("definitionSource", "definitions"),
        ):
            value = row.get(key)
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


def rank_current_candidates(
    token: dict[str, Any],
    forms: list[dict[str, Any]],
    sense_map: dict[str, dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    clue = token["positional_source_gloss"]
    free_translation = token["source_free_translation"]
    for form in forms:
        entry_id = form["entryCandidateId"]
        senses = sense_map.get(
            entry_id, {"sense_ids": [], "translations": [], "definitions": []}
        )
        evidence = " ".join(senses["translations"] + senses["definitions"])
        surface = best_surface_score(
            token["surface_projections"], form["surfaceSource"]
        )
        gloss_score = text_similarity(clue, evidence)
        context_score = text_similarity(free_translation, evidence)
        combined = (
            0.8 * surface["score"] + 0.15 * gloss_score + 0.05 * context_score
            if clue
            else 0.95 * surface["score"] + 0.05 * context_score
        )
        candidates.append(
            {
                "entry_candidate_id": entry_id,
                "form_candidate_id": form["formCandidateId"],
                "current_surface": form["surfaceSource"],
                "current_translations": senses["translations"],
                "current_definitions": senses["definitions"],
                "current_sense_candidate_ids": senses["sense_ids"],
                "surface_score": surface,
                "positional_gloss_jaccard": round(gloss_score, 6),
                "free_translation_jaccard": round(context_score, 6),
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
    for rank, candidate in enumerate(candidates[:limit], start=1):
        candidate["rank"] = rank
    return candidates[:limit]


def crosswalk_map(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["historicalSourceRecordId"]].append(row)
    for values in grouped.values():
        values.sort(key=lambda row: (row["rank"], row["crosswalkCandidateId"]))
    return grouped


def rank_historical_candidates(
    token: dict[str, Any],
    historical_entries: list[dict[str, Any]],
    existing_crosswalk: dict[str, list[dict[str, Any]]],
    limit: int,
    crosswalk_limit: int,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    clue = token["positional_source_gloss"]
    free_translation = token["source_free_translation"]
    for entry in historical_entries:
        surface = best_surface_score(
            token["surface_projections"], entry["headwordComparison"]
        )
        gloss_score = text_similarity(clue, entry["glossSource"])
        context_score = text_similarity(free_translation, entry["glossSource"])
        combined = (
            0.8 * surface["score"] + 0.15 * gloss_score + 0.05 * context_score
            if clue
            else 0.95 * surface["score"] + 0.05 * context_score
        )
        candidates.append(
            {
                "historical_source_record_id": entry["sourceRecordId"],
                "historical_headword": entry["headwordSource"],
                "historical_gloss": entry["glossSource"],
                "raw_part_of_speech": entry["rawPartOfSpeech"],
                "source_record_sha256": entry["sourceRecordSha256"],
                "surface_score": surface,
                "positional_gloss_jaccard": round(gloss_score, 6),
                "free_translation_jaccard": round(context_score, 6),
                "combined_review_score": round(combined, 6),
                "existing_current_crosswalk_candidates": existing_crosswalk.get(
                    entry["sourceRecordId"], []
                )[:crosswalk_limit],
                "relation_status": "unadjudicated_candidate",
                "automatic_acceptance_allowed": False,
            }
        )
    candidates.sort(
        key=lambda row: (
            -row["combined_review_score"],
            -row["surface_score"]["score"],
            row["historical_source_record_id"],
        )
    )
    for rank, candidate in enumerate(candidates[:limit], start=1):
        candidate["rank"] = rank
    return candidates[:limit]


def score_band(score: float, normalized_exact: bool) -> str:
    if normalized_exact:
        return "normalized_exact_projection"
    if score >= 0.85:
        return "very_high_surface_candidate"
    if score >= 0.7:
        return "high_surface_candidate"
    if score >= 0.5:
        return "moderate_surface_candidate"
    return "weak_surface_candidate"


def build_inventory(
    *, program_root: Path, contract_path: Path, build_root: Path
) -> dict[str, Any]:
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("contract schema_version must be 1")
    inputs = contract["inputs"]
    require_hash(program_root, inputs["review_manifest"], "review_manifest")
    reviewed_path = require_hash(
        program_root, inputs["reviewed_examples"], "reviewed_examples"
    )
    forms_path = require_hash(program_root, inputs["current_forms"], "current_forms")
    senses_path = require_hash(
        program_root, inputs["current_senses"], "current_senses"
    )
    historical_path = require_hash(
        program_root, inputs["historical_lexicon"], "historical_lexicon"
    )
    crosswalk_path = require_hash(
        program_root, inputs["existing_crosswalk_candidates"], "existing_crosswalk"
    )

    reviewed_examples = load_jsonl(reviewed_path)
    forms = load_jsonl(forms_path)
    senses = load_jsonl(senses_path)
    historical_entries = load_jsonl(historical_path)
    existing_crosswalk_rows = load_jsonl(crosswalk_path)
    expected = contract["expected_counts"]
    for label, actual in (
        ("reviewed_examples", len(reviewed_examples)),
        ("current_forms", len(forms)),
        ("current_senses", len(senses)),
        ("historical_lexicon_entries", len(historical_entries)),
        ("existing_crosswalk_candidates", len(existing_crosswalk_rows)),
    ):
        if actual != expected[label]:
            raise ValueError(f"{label} count changed: {actual}")

    token_occurrences = token_rows(reviewed_examples)
    if len(token_occurrences) != expected["token_occurrences"]:
        raise ValueError(
            f"token occurrence count changed: {len(token_occurrences)}"
        )
    sense_map = aggregate_current_senses(senses)
    existing_crosswalk = crosswalk_map(existing_crosswalk_rows)
    ranking = contract["ranking"]
    candidate_rows: list[dict[str, Any]] = []
    for token in token_occurrences:
        current = rank_current_candidates(
            token,
            forms,
            sense_map,
            ranking["current_candidate_limit"],
        )
        historical = rank_historical_candidates(
            token,
            historical_entries,
            existing_crosswalk,
            ranking["historical_candidate_limit"],
            ranking["crosswalk_candidate_limit"],
        )
        current_top = current[0]
        historical_top = historical[0]
        current_gap = (
            current[0]["combined_review_score"]
            - current[1]["combined_review_score"]
            if len(current) > 1
            else current[0]["combined_review_score"]
        )
        candidate_rows.append(
            {
                **token,
                "current_dictionary_candidates": current,
                "historical_lexicon_candidates": historical,
                "diagnostics": {
                    "current_top_surface_band": score_band(
                        current_top["surface_score"]["score"],
                        current_top["surface_score"][
                            "normalized_exact_projection"
                        ],
                    ),
                    "historical_top_surface_band": score_band(
                        historical_top["surface_score"]["score"],
                        historical_top["surface_score"][
                            "normalized_exact_projection"
                        ],
                    ),
                    "current_top_combined_gap": round(current_gap, 6),
                    "current_top_candidate_ambiguous": current_gap
                    <= ranking["ambiguity_gap_threshold"],
                },
                "correspondence_status": "unadjudicated_candidates_only",
                "automatic_acceptance_allowed": False,
                "productive_rule_status": "not_authorized",
                "controlled_synthetic_sentence_pairs_added": 0,
                "training_eligibility": "not_allowed",
                "synthetic_eligibility": "not_authorized",
            }
        )

    distinct_surfaces = {
        normalize_surface(row["historical_surface"]) for row in candidate_rows
    }
    current_bands: dict[str, int] = defaultdict(int)
    historical_bands: dict[str, int] = defaultdict(int)
    for row in candidate_rows:
        current_bands[row["diagnostics"]["current_top_surface_band"]] += 1
        historical_bands[row["diagnostics"]["historical_top_surface_band"]] += 1
    report = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "status": "historical_current_correspondence_candidate_inventory",
        "counts": {
            "reviewed_examples": len(reviewed_examples),
            "token_occurrences": len(candidate_rows),
            "distinct_normalized_surfaces": len(distinct_surfaces),
            "tokens_with_hyphen_morphology": sum(
                "-" in row["historical_surface"] for row in candidate_rows
            ),
            "tokens_with_positional_source_gloss_candidate": sum(
                row["positional_source_gloss"] is not None for row in candidate_rows
            ),
            "current_normalized_exact_projection_occurrences": current_bands[
                "normalized_exact_projection"
            ],
            "current_literal_exact_projection_occurrences": sum(
                row["current_dictionary_candidates"][0]["surface_score"][
                    "literal_exact_projection"
                ]
                for row in candidate_rows
            ),
            "historical_normalized_exact_projection_occurrences": historical_bands[
                "normalized_exact_projection"
            ],
            "historical_literal_exact_projection_occurrences": sum(
                row["historical_lexicon_candidates"][0]["surface_score"][
                    "literal_exact_projection"
                ]
                for row in candidate_rows
            ),
            "current_top_candidate_ambiguous_occurrences": sum(
                row["diagnostics"]["current_top_candidate_ambiguous"]
                for row in candidate_rows
            ),
            "current_correspondences_accepted": 0,
            "productive_grammar_rules_accepted": 0,
            "controlled_synthetic_sentence_pairs": 0,
            "benchmark_rows": 0,
            "training_eligible_rows": 0,
        },
        "current_top_surface_bands": dict(sorted(current_bands.items())),
        "historical_top_surface_bands": dict(sorted(historical_bands.items())),
        "ranking": ranking,
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    payloads = {
        "token-correspondence-candidates.jsonl": jsonl_bytes(candidate_rows),
        "REPORT.json": json_bytes(report),
    }
    for name, payload in payloads.items():
        path = build_root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)

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
        "components": {
            "token_correspondence_candidates": {
                "path": "token-correspondence-candidates.jsonl",
                "sha256": sha256_file(
                    build_root / "token-correspondence-candidates.jsonl"
                ),
                "rows": len(candidate_rows),
            },
            "report": {
                "path": "REPORT.json",
                "sha256": sha256_file(build_root / "REPORT.json"),
            },
        },
        "current_correspondences_accepted": 0,
        "productive_grammar_rules_accepted": 0,
        "controlled_synthetic_sentence_pairs_added": 0,
        "benchmark_rows": 0,
        "training_eligible_rows": 0,
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    (build_root / "MANIFEST.json").write_bytes(json_bytes(manifest))
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
                "token_occurrences": manifest["components"][
                    "token_correspondence_candidates"
                ]["rows"],
                "current_correspondences_accepted": 0,
                "controlled_synthetic_sentence_pairs_added": 0,
                "training_eligible_rows": 0,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

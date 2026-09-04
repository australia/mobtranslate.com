#!/usr/bin/env python3
"""Freeze a review-gated Kuku Yalanji synthetic fine-tuning candidate.

This command does not train a model. It turns the immutable 20,047-row
synthetic corpus into a conservative, reproducible data view by requiring all
five primary automated review lenses to be currently ``pass`` and by rejecting
any adverse latest auxiliary review. It preserves the already-frozen v21.2
split and leakage quarantine so a future data ablation remains comparable.

Synthetic/project review is not fluent-speaker or community verification. The
result is Tier-D research data and is never promotion-eligible by itself.
Retained public translation requests are bound as demand/error evidence only;
their input/output text is never imported into this training candidate.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import shutil
import sqlite3
import unicodedata
from collections.abc import Iterable
from pathlib import Path
from typing import Any

PROGRAM = Path(
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30"
)
DEFAULT_DATABASE = PROGRAM / "synthetic/claude-synthetic-v1-2026-07-02/synthetic.db"
DEFAULT_EXPORT = PROGRAM / "synthetic/claude-synthetic-v1-2026-07-02/export"
DEFAULT_BASELINE = PROGRAM / "prepared/v21.2-claude-balanced-replay"
DEFAULT_COMPLETION_AUDIT = PROGRAM / "completion_audits/audit-goal-20000-result.json"
DEFAULT_LIVE_REVIEW = Path(
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "live-translation-review-program-2026-08-31/runs/"
    "20260904T1600Z-kuku-full-review/MANIFEST.json"
)
DEFAULT_DICTIONARY = Path(
    "/mnt/donto-data/workspace/mobtranslate.com/dictionaries/kuku_yalanji/dictionary.yaml"
)
DEFAULT_GRAMMAR = Path(
    "/mnt/donto-data/workspace/mobtranslate.com/"
    "experiments/pdftomd/extract/output/examples.xigt.json"
)
DEFAULT_OUTPUT = PROGRAM / "prepared/v26.0-reviewed-synthetic-ablation-20260904"
DEFAULT_DATASET_ID = "v26.0-reviewed-synthetic-ablation-20260904"

PRIMARY_REVIEW_LENSES = ("morphology", "lexicon", "syntax", "fidelity", "register")
TRAINING_RIGHTS = frozenset(
    {
        "open",
        "project_approved_synthetic",
        "project_approved_synthetic_pending_elder_verification",
    }
)
BASELINE_FILES = {
    "train": "train.eng-gvn.jsonl",
    "validation": "validation.eng-gvn.jsonl",
    "test": "test.eng-gvn.jsonl",
}
CANONICAL_FILES = {
    "train": "train.jsonl",
    "validation": "dev.jsonl",
    "test": "synthtest.jsonl",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument("--canonical-export", type=Path, default=DEFAULT_EXPORT)
    parser.add_argument("--baseline-dataset", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--completion-audit", type=Path, default=DEFAULT_COMPLETION_AUDIT)
    parser.add_argument("--live-review-manifest", type=Path, default=DEFAULT_LIVE_REVIEW)
    parser.add_argument("--dictionary", type=Path, default=DEFAULT_DICTIONARY)
    parser.add_argument("--grammar-examples", type=Path, default=DEFAULT_GRAMMAR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--dataset-id", default=DEFAULT_DATASET_ID)
    parser.add_argument("--supersedes")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"expected object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise TypeError(f"expected object: {path}:{line_number}")
            value["_source_line"] = line_number
            rows.append(value)
    return rows


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(
                json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                + "\n"
            )


def text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = normalized.translate(
        str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"'})
    )
    return " ".join(normalized.split())


def target_surface_key(value: str) -> str:
    return "".join(character for character in text_key(value) if character.isalpha())


def pair_key(english: str, kuku: str) -> tuple[str, str]:
    return text_key(english), text_key(kuku)


def baseline_english(row: dict[str, Any]) -> str:
    return str(
        row.get("unconditioned_input_text")
        or (row.get("translation") or {}).get("eng_Latn")
        or row.get("input_text")
        or ""
    ).removeprefix("<translate> ")


def load_corpus_database(
    path: Path,
) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[int, dict[str, dict[str, Any]]]]:
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        sentence_rows = connection.execute(
            """
            SELECT s.id, s.batch_id, b.label AS batch_label, s.seq, s.english, s.kuku,
                   s.analysis, s.frame, s.tier, s.words_used, s.evidence, s.status,
                   s.confidence, s.rights_status, s.author, s.created_at, s.updated_at
              FROM sentences AS s
              JOIN batches AS b ON b.id = s.batch_id
             ORDER BY s.id
            """
        ).fetchall()
        review_rows = connection.execute(
            """
            SELECT id, sentence_id, round, lens, verdict, issues, suggested_fix,
                   reviewer, created_at
              FROM reviews
             ORDER BY sentence_id, lens, round, id
            """
        ).fetchall()
    finally:
        connection.close()

    sentences: dict[tuple[str, str], dict[str, Any]] = {}
    for raw in sentence_rows:
        row = dict(raw)
        key = pair_key(str(row["english"]), str(row["kuku"]))
        if key in sentences:
            raise ValueError(f"duplicate normalized corpus pair: sentence {row['id']}")
        sentences[key] = row

    latest: dict[int, dict[str, dict[str, Any]]] = collections.defaultdict(dict)
    for raw in review_rows:
        row = dict(raw)
        sentence_id = int(row["sentence_id"])
        lens = str(row["lens"])
        prior = latest[sentence_id].get(lens)
        rank = (int(row["round"]), int(row["id"]))
        prior_rank = (
            (int(prior["round"]), int(prior["id"])) if prior is not None else (-1, -1)
        )
        if rank > prior_rank:
            latest[sentence_id][lens] = row
    return sentences, latest


def review_exclusion_reasons(
    sentence: dict[str, Any], latest: dict[str, dict[str, Any]]
) -> list[str]:
    reasons: list[str] = []
    if sentence["status"] not in {"accepted", "revised"}:
        reasons.append(f"sentence_status:{sentence['status']}")
    if sentence["rights_status"] not in TRAINING_RIGHTS:
        reasons.append(f"rights_status:{sentence['rights_status']}")
    for lens in PRIMARY_REVIEW_LENSES:
        review = latest.get(lens)
        if review is None:
            reasons.append(f"primary_review_missing:{lens}")
        elif review["verdict"] != "pass":
            reasons.append(f"primary_review_{review['verdict']}:{lens}")
    for lens, review in sorted(latest.items()):
        if lens not in PRIMARY_REVIEW_LENSES and review["verdict"] != "pass":
            reasons.append(f"auxiliary_review_{review['verdict']}:{lens}")
    return reasons


def latest_review_summary(latest: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "review_id": int(review["id"]),
            "round": int(review["round"]),
            "lens": lens,
            "verdict": review["verdict"],
            "reviewer": review["reviewer"],
            "created_at": review["created_at"],
        }
        for lens, review in sorted(latest.items())
    ]


def training_row(
    sentence: dict[str, Any],
    canonical: dict[str, Any],
    split: str,
    latest: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    english = " ".join(str(sentence["english"]).split())
    kuku = " ".join(str(sentence["kuku"]).split())
    try:
        words_used = json.loads(sentence["words_used"]) if sentence["words_used"] else []
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid words_used JSON for sentence {sentence['id']}") from error
    return {
        "id": f"synthetic-db:{sentence['id']}",
        "split": split,
        "direction": "eng-gvn",
        "input_text": f"<translate> {english}",
        "output_text": kuku,
        "unconditioned_input_text": english,
        "source_lang": "eng_Latn",
        "target_lang": "gvn_Latn",
        "translation": {"eng_Latn": english, "gvn_Latn": kuku},
        "pair_kind": "synthetic_academic_parallel",
        "evidence_tier": "tier_d_generated_unverified",
        "rights_status": sentence["rights_status"],
        "approved_for_research_training": True,
        "qualified_language_reviewed": False,
        "promotion_eligible": False,
        "task_tagging": {
            "enabled": True,
            "task": "translate",
            "template": "<translate> {input_text}",
        },
        "synthetic_corpus": {
            "database_sentence_id": int(sentence["id"]),
            "batch_id": int(sentence["batch_id"]),
            "batch_label": sentence["batch_label"],
            "batch_sequence": int(sentence["seq"]),
            "canonical_export_line": int(canonical["_source_line"]),
            "canonical_export_split": canonical["_canonical_split"],
            "analysis": sentence["analysis"],
            "frame": sentence["frame"],
            "tier": sentence["tier"],
            "words_used": words_used,
            "evidence": sentence["evidence"],
            "sentence_status": sentence["status"],
            "confidence": sentence["confidence"],
            "author": sentence["author"],
            "latest_automated_reviews": latest_review_summary(latest),
            "review_policy": "five_primary_pass_and_no_adverse_latest_auxiliary_review",
        },
    }


def intersections(
    first: list[dict[str, Any]], second: list[dict[str, Any]]
) -> dict[str, int]:
    first_sources = {text_key(row["unconditioned_input_text"]) for row in first}
    second_sources = {text_key(row["unconditioned_input_text"]) for row in second}
    first_targets = {target_surface_key(row["output_text"]) for row in first}
    second_targets = {target_surface_key(row["output_text"]) for row in second}
    first_pairs = {
        (text_key(row["unconditioned_input_text"]), target_surface_key(row["output_text"]))
        for row in first
    }
    second_pairs = {
        (text_key(row["unconditioned_input_text"]), target_surface_key(row["output_text"]))
        for row in second
    }
    return {
        "source": len(first_sources & second_sources),
        "target_surface": len(first_targets & second_targets),
        "pair": len(first_pairs & second_pairs),
    }


def file_record(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(root)),
        "bytes": path.stat().st_size,
        "rows": sum(1 for line in path.open(encoding="utf-8") if line.strip())
        if path.suffix == ".jsonl"
        else None,
        "sha256": sha256(path),
    }


def input_record(path: Path) -> dict[str, Any]:
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}


def main() -> int:
    args = parse_args()
    output = args.output_dir.resolve()
    temporary = output.with_name(f".{output.name}.building")
    if output.exists():
        raise SystemExit(f"refusing existing output directory: {output}")
    if temporary.exists():
        raise SystemExit(f"refusing stale temporary directory: {temporary}")

    completion_audit = read_json(args.completion_audit)
    if (
        completion_audit.get("status") != "PASS"
        or completion_audit.get("mode") != "final"
        or completion_audit.get("checks_failed") != 0
    ):
        raise SystemExit("20,000-row completion audit is not a final PASS")
    live_review = read_json(args.live_review_manifest)
    if live_review.get("status") != "complete":
        raise SystemExit("live request review manifest is not complete")
    live_results = live_review.get("results") or []
    if not live_results or any(result.get("status") != "complete" for result in live_results):
        raise SystemExit("live request review contains an incomplete result")

    sentences, latest_reviews = load_corpus_database(args.database)
    if len(sentences) != 20_047:
        raise SystemExit(f"unexpected corpus row count: {len(sentences)}")

    canonical_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    canonical_counts: dict[str, int] = {}
    for split, filename in CANONICAL_FILES.items():
        rows = read_jsonl(args.canonical_export / filename)
        canonical_counts[split] = len(rows)
        for row in rows:
            key = pair_key(str(row.get("en", "")), str(row.get("ku", "")))
            if key in canonical_by_pair:
                raise SystemExit(f"duplicate pair in canonical export: {filename}")
            row["_canonical_split"] = split
            canonical_by_pair[key] = row
    if set(canonical_by_pair) != set(sentences):
        raise SystemExit("canonical export and SQLite corpus pair sets differ")

    eligibility: dict[tuple[str, str], list[str]] = {}
    for key, sentence in sentences.items():
        eligibility[key] = review_exclusion_reasons(
            sentence, latest_reviews.get(int(sentence["id"]), {})
        )
    strict_clean = {key for key, reasons in eligibility.items() if not reasons}

    baseline_membership: dict[tuple[str, str], str] = {}
    baseline_counts: dict[str, int] = {}
    for split, filename in BASELINE_FILES.items():
        rows = read_jsonl(args.baseline_dataset / filename)
        if split == "train":
            rows = [row for row in rows if row.get("pair_kind") == "synthetic_academic_parallel"]
        baseline_counts[split] = len(rows)
        for row in rows:
            key = pair_key(baseline_english(row), str(row.get("output_text", "")))
            if key not in sentences:
                raise SystemExit(f"baseline {split} row is absent from synthetic SQLite corpus")
            prior = baseline_membership.get(key)
            if prior is not None and prior != split:
                raise SystemExit(f"baseline pair crosses splits: {prior} and {split}")
            baseline_membership[key] = split

    prepared: dict[str, list[dict[str, Any]]] = {
        "train": [],
        "validation": [],
        "test": [],
    }
    for key, split in baseline_membership.items():
        if key not in strict_clean:
            continue
        sentence = sentences[key]
        prepared[split].append(
            training_row(
                sentence,
                canonical_by_pair[key],
                split,
                latest_reviews[int(sentence["id"])],
            )
        )
    for rows in prepared.values():
        rows.sort(key=lambda row: int(row["synthetic_corpus"]["database_sentence_id"]))

    leakage = {
        "train_validation": intersections(prepared["train"], prepared["validation"]),
        "train_test": intersections(prepared["train"], prepared["test"]),
        "validation_test": intersections(prepared["validation"], prepared["test"]),
    }
    if any(value for comparison in leakage.values() for value in comparison.values()):
        raise SystemExit(f"post-filter split leakage: {leakage}")

    strict_rows = [
        training_row(
            sentences[key],
            canonical_by_pair[key],
            canonical_by_pair[key]["_canonical_split"],
            latest_reviews[int(sentences[key]["id"])],
        )
        for key in strict_clean
    ]
    strict_rows.sort(key=lambda row: int(row["synthetic_corpus"]["database_sentence_id"]))
    review_excluded = [
        {
            "database_sentence_id": int(sentence["id"]),
            "batch_id": int(sentence["batch_id"]),
            "batch_label": sentence["batch_label"],
            "batch_sequence": int(sentence["seq"]),
            "canonical_export_split": canonical_by_pair[key]["_canonical_split"],
            "sentence_status": sentence["status"],
            "rights_status": sentence["rights_status"],
            "reasons": eligibility[key],
            "latest_automated_reviews": latest_review_summary(
                latest_reviews.get(int(sentence["id"]), {})
            ),
        }
        for key, sentence in sentences.items()
        if key not in strict_clean
    ]
    review_excluded.sort(key=lambda row: row["database_sentence_id"])
    prior_quarantine = [
        {
            "database_sentence_id": int(sentences[key]["id"]),
            "batch_id": int(sentences[key]["batch_id"]),
            "batch_label": sentences[key]["batch_label"],
            "batch_sequence": int(sentences[key]["seq"]),
            "canonical_export_split": canonical_by_pair[key]["_canonical_split"],
            "reason": "not_in_v21_2_effective_synthetic_splits",
        }
        for key in strict_clean - set(baseline_membership)
    ]
    prior_quarantine.sort(key=lambda row: row["database_sentence_id"])

    prepared_keys = {key for key in strict_clean if key in baseline_membership}
    if len(prepared_keys) + len(prior_quarantine) != len(strict_clean):
        raise SystemExit("strict-clean reconciliation failed")
    if len(strict_clean) + len(review_excluded) != len(sentences):
        raise SystemExit("corpus review reconciliation failed")

    exclusion_reasons = collections.Counter(
        reason for reasons in eligibility.values() for reason in reasons
    )
    rights_counts = collections.Counter(
        str(sentences[key]["rights_status"]) for key in strict_clean
    )
    status_counts = collections.Counter(str(sentences[key]["status"]) for key in strict_clean)
    live_translation_subjects = sum(
        int(result.get("reviewedSubjects", 0)) for result in live_results
    )

    temporary.mkdir(parents=True)
    try:
        output_paths = {
            "strict_clean": temporary / "strict-clean-corpus.jsonl",
            "train": temporary / "train.eng-gvn.jsonl",
            "validation": temporary / "validation.synthetic.eng-gvn.jsonl",
            "test": temporary / "test.synthetic.eng-gvn.jsonl",
            "review_excluded": temporary / "excluded.latest-review-nonpass.jsonl",
            "prior_quarantine": temporary / "excluded.prior-leakage-quarantine.jsonl",
        }
        write_jsonl(output_paths["strict_clean"], strict_rows)
        write_jsonl(output_paths["train"], prepared["train"])
        write_jsonl(output_paths["validation"], prepared["validation"])
        write_jsonl(output_paths["test"], prepared["test"])
        write_jsonl(output_paths["review_excluded"], review_excluded)
        write_jsonl(output_paths["prior_quarantine"], prior_quarantine)

        experiment = {
            "schema_version": 1,
            "dataset_id": args.dataset_id,
            "status": "draft_data_ready_training_not_started",
            "research_question": (
                "Under an otherwise matched schedule, does replacing the prior synthetic "
                "component with the strict latest-review-pass view improve independent natural "
                "Kuku Yalanji endpoints without reducing the governed lexical census?"
            ),
            "arms": {
                "B0": "untouched frozen v24.3 research adapter; evaluation only",
                "C0": "matched reconstruction of the frozen v24.3 data and optimizer schedule",
                "T1": (
                    "same start, tokenizer, optimizer, decoder, lexical replay, batch order, "
                    "token budget, and checkpoints as C0; only the reviewed synthetic component changes"
                ),
            },
            "hard_requirements_before_launch": [
                "freeze exact starting model and tokenizer file hashes",
                "materialize token-matched C0 and T1 schedules",
                "freeze max optimizer steps, learning-rate integral, checkpoints, and seed",
                "run local static validation and a tiny GPU overfit/save/reload/merge parity gate",
                "set a paid-compute ceiling and automatic shutdown if paid compute is used",
            ],
            "evaluation_contract": {
                "synthetic_development_is_diagnostic_only": True,
                "synthetic_test_is_diagnostic_only": True,
                "required_independent_natural_endpoints": [
                    "locked Bible direct heldout",
                    "locked DB usage heldout",
                    "locked Elder sentence-pair diagnostic",
                    "independent Patz and SLQ natural clusters where their source/use contracts permit",
                ],
                "required_hard_failures": [
                    "blank output",
                    "source copy",
                    "participant reversal",
                    "negation reversal",
                    "fabricated critical content",
                    "severe omission",
                ],
            },
            "release_boundary": {
                "evidence_tier": "Tier D generated and not fluent-reviewed",
                "qualified_language_reviewed": False,
                "public_sentence_translation_authorized": False,
                "model_outputs_may_become_training_truth": False,
            },
        }
        experiment_path = temporary / "EXPERIMENT-DRAFT.json"
        write_json(experiment_path, experiment)

        source_paths = [
            Path(__file__).resolve(),
            args.database,
            args.completion_audit,
            args.live_review_manifest,
            args.dictionary,
            args.grammar_examples,
            args.canonical_export / "MANIFEST.json",
            *(args.canonical_export / filename for filename in CANONICAL_FILES.values()),
            args.baseline_dataset / "v21_2_claude_balanced_replay_manifest.json",
            *(args.baseline_dataset / filename for filename in BASELINE_FILES.values()),
        ]
        manifest = {
            "schema_version": 1,
            "dataset_id": args.dataset_id,
            "created_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "status": "prepared_not_trained",
            "supersedes": [args.supersedes] if args.supersedes else [],
            "purpose": (
                "Strict review-gated Tier-D synthetic data view for a future controlled "
                "Kuku Yalanji fine-tuning ablation."
            ),
            "eligibility_policy": {
                "required_primary_latest_verdicts": {
                    lens: "pass" for lens in PRIMARY_REVIEW_LENSES
                },
                "adverse_latest_auxiliary_review_allowed": False,
                "eligible_sentence_statuses": ["accepted", "revised"],
                "eligible_rights_statuses": sorted(TRAINING_RIGHTS),
                "evidence_tier": "Tier D generated and not fluent-reviewed",
            },
            "reconciliation": {
                "sqlite_sentences": len(sentences),
                "canonical_export_rows": len(canonical_by_pair),
                "canonical_split_counts": canonical_counts,
                "strict_latest_review_pass_rows": len(strict_clean),
                "latest_review_excluded_rows": len(review_excluded),
                "v21_2_effective_synthetic_counts_before_review_filter": baseline_counts,
                "prepared_split_counts": {
                    split: len(rows) for split, rows in prepared.items()
                },
                "strict_clean_prior_leakage_quarantine_rows": len(prior_quarantine),
                "strict_clean_status_counts": dict(sorted(status_counts.items())),
                "strict_clean_rights_counts": dict(sorted(rights_counts.items())),
                "review_exclusion_reason_occurrences": dict(sorted(exclusion_reasons.items())),
            },
            "leakage": leakage,
            "live_request_boundary": {
                "reviewed_translation_subjects_in_bound_cycle": live_translation_subjects,
                "rows_imported_into_training": 0,
                "reason": (
                    "Live requests and model outputs are anonymous demand/error evidence, not "
                    "linguistic or training truth."
                ),
            },
            "source_files": [input_record(path) for path in source_paths],
            "outputs": [
                file_record(path, temporary)
                for path in [*output_paths.values(), experiment_path]
            ],
            "readiness": {
                "data_view_frozen": True,
                "training_started": False,
                "qualified_language_review_count": 0,
                "promotion_eligible": False,
                "next_gate": "freeze token-matched C0/T1 schedules and paid-compute controls",
            },
        }
        manifest_path = temporary / "MANIFEST.json"
        write_json(manifest_path, manifest)
        checksum_paths = sorted(
            path for path in temporary.iterdir() if path.name != "SHA256SUMS"
        )
        (temporary / "SHA256SUMS").write_text(
            "".join(f"{sha256(path)}  {path.name}\n" for path in checksum_paths),
            encoding="utf-8",
        )
        temporary.rename(output)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    print(
        json.dumps(
            {
                "status": "prepared_not_trained",
                "output": str(output),
                "sqlite_sentences": len(sentences),
                "strict_latest_review_pass_rows": len(strict_clean),
                "latest_review_excluded_rows": len(review_excluded),
                "prepared_split_counts": {
                    split: len(rows) for split, rows in prepared.items()
                },
                "strict_clean_prior_leakage_quarantine_rows": len(prior_quarantine),
                "leakage": leakage,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

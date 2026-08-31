#!/usr/bin/env python3
"""Build the immutable Kuku Possum candidate lexical retrieval model."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from kuku_possum_lexical_model import (
    CHAR_NGRAM_MAX,
    CHAR_NGRAM_MIN,
    DEFAULT_THRESHOLD,
    FEATURE_DIMENSION,
    MAX_QUERY_CHARS,
    MODEL_SCHEMA_VERSION,
    fit_idf,
    load_model,
    lookup,
    normalize_text,
    save_model,
    vectorize,
)


MODEL_ID = "mobtranslate-kuku-possum-candidate-lexical-v1"
MODEL_VERSION = "v0.1.0"
PROGRAM_ROOT = Path("/mnt/donto-data/donto-resources/research/language-programs/kuku-possum-v1")
DICTIONARY_EDITION = "kuku-possum-dictionary-roth-bulletin7-primary-corroboration-v0.7.0"
DICTIONARY_SHA256 = "30b776bed3f5ac18342848b196d1ab6ffae7d468e35382a282dff5b27350d081"
GRAMMAR_EDITION = "kuku-possum-grammar-comparative-identity-boundary-v0.6.0"
GRAMMAR_SHA256 = "fb6281e240e685694a0df0f98393b640251bbf6a62802eb4bf0b2c62da19e6e4"
AUTHORIZATION_ID = "kuku-possum-operator-publication-authorization-v1"
CREATED_AT = "2026-08-20T00:00:00Z"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8")


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def safe_record(sense: dict, entry: dict) -> dict:
    source_anchors = sense.get("source_anchors") or entry.get("source_anchors") or []
    source_ids = sorted({anchor.get("source_id") for anchor in source_anchors if anchor.get("source_id")})
    return {
        "record_id": sense["sense_id"],
        "entry_id": sense["entry_id"],
        "query_source": sense["definition_source"],
        "query_normalized": normalize_text(sense.get("definition_search") or sense["definition_source"]),
        "target_form_source": entry.get("lemma_source") or sense.get("expression_source"),
        "target_form_search": entry.get("lemma_search") or normalize_text(sense.get("expression_source", "")),
        "variety": sense["variety"],
        "language_label_source": sense.get("language_label_source") or entry.get("language_label_source"),
        "orthography": sense["orthography"],
        "review_status": sense.get("review_status", "candidate"),
        "source_ids": source_ids,
        "source_anchors": source_anchors,
        "source_rights": sense.get("rights") or entry.get("rights") or {},
        "governance_authorization_id": AUTHORIZATION_ID,
        "training_role": "candidate_lexical_index",
        "public_capability": "experimental_candidate_retrieval_only",
    }


def build(output_root: Path) -> None:
    if output_root.exists():
        raise FileExistsError(f"immutable output already exists: {output_root}")
    edition_root = PROGRAM_ROOT / "dictionary" / "editions" / DICTIONARY_EDITION
    if sha256(edition_root / "EDITION.json") != DICTIONARY_SHA256:
        raise RuntimeError("dictionary manifest hash mismatch")
    grammar_manifest = PROGRAM_ROOT / "grammar" / "editions" / GRAMMAR_EDITION / "EDITION.json"
    if sha256(grammar_manifest) != GRAMMAR_SHA256:
        raise RuntimeError("grammar manifest hash mismatch")
    authorization = PROGRAM_ROOT / "governance" / "OPERATOR-PUBLICATION-AUTHORIZATION-v1.json"
    if not authorization.exists():
        raise RuntimeError("operator publication authorization is missing")

    entries = {row["entry_id"]: row for row in read_jsonl(edition_root / "entries.jsonl")}
    senses = read_jsonl(edition_root / "senses.jsonl")
    rows = [safe_record(sense, entries[sense["entry_id"]]) for sense in senses]
    rows = [row for row in rows if row["query_normalized"] and row["target_form_source"]]
    rows.sort(key=lambda row: (row["variety"], row["query_normalized"], row["target_form_source"], row["record_id"]))

    corpus_root = PROGRAM_ROOT / "corpora" / "lexical" / "kuku-possum-candidate-lexical-training-v0.1.0"
    if corpus_root.exists():
        raise FileExistsError(f"immutable corpus already exists: {corpus_root}")
    write_jsonl(corpus_root / "candidate-records.jsonl", rows)
    corpus_manifest = {
        "schema_version": 1,
        "corpus_id": "kuku-possum-candidate-lexical-training-v0.1.0",
        "created_at_utc": CREATED_AT,
        "dictionary_edition": DICTIONARY_EDITION,
        "dictionary_manifest_sha256": DICTIONARY_SHA256,
        "grammar_edition": GRAMMAR_EDITION,
        "grammar_manifest_sha256": GRAMMAR_SHA256,
        "authorization_id": AUTHORIZATION_ID,
        "evidence_class": "unreviewed_dictionary_candidates",
        "split": "training_overlapping_closed_census",
        "rows": len(rows),
        "variety_rows": dict(sorted(Counter(row["variety"] for row in rows).items())),
        "accepted_rows": 0,
        "qualified_reviewed_rows": 0,
        "synthetic_rows": 0,
        "natural_sentence_rows": 0,
        "training_exposure_rows": len(rows),
        "public_sentence_translation_rows": 0,
        "limitations": [
            "Every linguistic row remains an unreviewed candidate.",
            "The corpus contains no Gugu Yawa lexical row and no natural parallel sentence.",
            "Training exposure under the operator authorization does not convert a candidate into an accepted linguistic fact.",
        ],
    }
    corpus_manifest["components"] = {
        "candidate-records.jsonl": {
            "rows": len(rows),
            "sha256": sha256(corpus_root / "candidate-records.jsonl"),
        }
    }
    write_json(corpus_root / "CORPUS-MANIFEST.json", corpus_manifest)

    idf = fit_idf(row["query_normalized"] for row in rows)
    model_records = [row | {"vector": vectorize(row["query_normalized"], idf)} for row in rows]
    limitations = [
        "Research-only candidate lexical retrieval; this is not sentence translation.",
        "All returned forms are unreviewed candidates and require qualified fluent-language review.",
        "Alungul has five candidate senses; Olgol has 1,888; Gugu Yawa has none and the model must abstain.",
        "Scores measure feature similarity to archived English glosses, not translation confidence or linguistic correctness.",
        "Historical and contemporary variety labels are not merged or normalized.",
    ]
    model_payload = {
        "schema_version": MODEL_SCHEMA_VERSION,
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "model_family": "feature_hashed_tfidf_candidate_retriever",
        "created_at_utc": CREATED_AT,
        "dictionary_edition": DICTIONARY_EDITION,
        "dictionary_manifest_sha256": DICTIONARY_SHA256,
        "grammar_edition": GRAMMAR_EDITION,
        "grammar_manifest_sha256": GRAMMAR_SHA256,
        "corpus_id": corpus_manifest["corpus_id"],
        "corpus_manifest_sha256": sha256(corpus_root / "CORPUS-MANIFEST.json"),
        "authorization_id": AUTHORIZATION_ID,
        "feature_contract": {
            "dimension": FEATURE_DIMENSION,
            "hash": "sha256-first-8-bytes-mod-dimension",
            "word_features": "unicode-normalized word unigrams",
            "character_ngram_min": CHAR_NGRAM_MIN,
            "character_ngram_max": CHAR_NGRAM_MAX,
            "weighting": "sublinear_tf_idf_l2",
        },
        "threshold": DEFAULT_THRESHOLD,
        "idf": {str(bucket): value for bucket, value in sorted(idf.items())},
        "records": model_records,
        "limitations": limitations,
    }
    output_root.mkdir(parents=True)
    save_model(output_root / "model.json.gz", model_payload)
    shutil.copy2(Path(__file__).with_name("kuku_possum_lexical_model.py"), output_root / "inference.py")
    shutil.copy2(corpus_root / "candidate-records.jsonl", output_root / "candidate-records.jsonl")

    loaded = load_model(output_root / "model.json.gz")
    queries: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in rows:
        queries[(row["variety"], row["query_normalized"])].add(row["record_id"])
    predictions = []
    top1_pass = 0
    top8_pass = 0
    for (variety, query), expected in sorted(queries.items()):
        evaluated_query = query[:MAX_QUERY_CHARS]
        response = lookup(loaded, evaluated_query, variety=variety, top_k=8)
        predicted = [match["record_id"] for match in response["matches"]]
        top1 = bool(predicted and predicted[0] in expected)
        top8 = bool(set(predicted) & expected)
        top1_pass += int(top1)
        top8_pass += int(top8)
        predictions.append({
            "query": evaluated_query,
            "source_query_length": len(query),
            "query_truncated_to_runtime_limit": len(query) > MAX_QUERY_CHARS,
            "variety": variety,
            "accepted_record_ids": sorted(expected),
            "predicted_record_ids": predicted,
            "top1_pass": top1,
            "top8_pass": top8,
        })
    negative_controls = ["", "---", "1234567890", "zxqv jjj qqq", "🌏🌏🌏"]
    negative_results = [lookup(loaded, query, top_k=8) for query in negative_controls]
    negative_abstentions = sum(not result["success"] for result in negative_results)
    gugu_abstention = lookup(loaded, "person", variety="gugu-yawa-y74", top_k=8)

    evaluation = {
        "schema_version": 1,
        "evaluation_id": "kuku-possum-candidate-lexical-closed-census-v0.1.0",
        "created_at_utc": CREATED_AT,
        "evaluation_class": "training_overlapping_closed_set_lexical_retrieval",
        "query_clusters": len(queries),
        "candidate_records": len(rows),
        "top1_pass": top1_pass,
        "top1_rate": top1_pass / len(queries),
        "top8_pass": top8_pass,
        "top8_rate": top8_pass / len(queries),
        "negative_controls": len(negative_controls),
        "negative_control_abstentions": negative_abstentions,
        "gugu_yawa_zero_row_abstention_pass": not gugu_abstention["success"],
        "model_sentence_generation_gate": "fail_no_natural_parallel_evaluation",
        "model_lexical_reconstruction_gate": "pass_research_only_training_overlapping_closed_census",
        "public_route_admission": "candidate_lexical_retrieval_research_only",
        "limitations": limitations,
    }
    write_jsonl(output_root / "evaluation-predictions.jsonl", predictions)
    write_json(output_root / "EVALUATION.json", evaluation)

    card = f"""---
language:
- en
license: other
library_name: custom
pipeline_tag: feature-extraction
tags:
- lexical-retrieval
- indigenous-languages
- kuku-possum
- alungul
- olgol
- research-only
---

# Kuku Possum candidate lexical retriever v0.1.0

This is a small CPU model for **closed-set candidate lexical retrieval**, not a
free-form translator. It ranks source-backed candidate forms from the current
Kuku Possum multi-variety evidence edition and abstains when no score clears the
frozen threshold.

## Scope

- Alungul Y199: 5 unreviewed candidate senses.
- Olgol Y73: 1,888 unreviewed candidate senses.
- Gugu Yawa Y74: 0 lexical rows; the model explicitly abstains.
- Sentence translation, ASR and TTS: unsupported.

Every result retains variety, orthography, source IDs, source anchors, review
status and rights metadata. The model never merges the three varieties.

## Evaluation

The published evaluation is deliberately described as a training-overlapping
closed census. It contains {len(queries):,} unique `(variety, English candidate
gloss)` query clusters and {len(rows):,} candidate sense records. Top-1 retrieval
was {top1_pass}/{len(queries)} and top-8 was {top8_pass}/{len(queries)}. This
measures reconstruction of the indexed candidate evidence, not unseen-word
generalisation, sentence competence, fluency or community acceptance.

## Use

```python
from inference import load_model, lookup

model = load_model("model.json.gz")
print(lookup(model, "person", variety="olgol-y73"))
```

## Governance and limitations

Publication relies on the recorded operator authorization
`{AUTHORIZATION_ID}`. The operator represented that the required permissions
were held and directed publication; no external permission document was supplied
or independently verified. Source documents themselves are not included.

All linguistic rows remain candidates. Outputs must be labelled experimental
and checked by an appropriate qualified speaker or language reviewer before use.
The model is not authoritative and must not be represented as faithful sentence
translation.

Dictionary edition: `{DICTIONARY_EDITION}`  
Dictionary manifest SHA-256: `{DICTIONARY_SHA256}`  
Grammar edition: `{GRAMMAR_EDITION}`  
Grammar manifest SHA-256: `{GRAMMAR_SHA256}`
"""
    (output_root / "README.md").write_text(card, encoding="utf-8")
    (output_root / "requirements.txt").write_text("# standard-library inference; no runtime packages required\n", encoding="utf-8")

    manifest_files = [
        "README.md",
        "requirements.txt",
        "model.json.gz",
        "inference.py",
        "candidate-records.jsonl",
        "EVALUATION.json",
        "evaluation-predictions.jsonl",
    ]
    manifest = {
        "schema_version": 1,
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "created_at_utc": CREATED_AT,
        "status": "promoted_research",
        "artifact_class": "candidate_lexical_retrieval_model",
        "dictionary_edition": DICTIONARY_EDITION,
        "dictionary_manifest_sha256": DICTIONARY_SHA256,
        "grammar_edition": GRAMMAR_EDITION,
        "grammar_manifest_sha256": GRAMMAR_SHA256,
        "corpus_id": corpus_manifest["corpus_id"],
        "corpus_manifest_sha256": sha256(corpus_root / "CORPUS-MANIFEST.json"),
        "authorization_id": AUTHORIZATION_ID,
        "route_gates": {
            "candidate_lexical_retrieval": "pass_research_only",
            "accepted_dictionary_lookup": "fail_no_qualified_reviewed_rows",
            "sentence_generation": "fail_no_natural_parallel_evaluation",
            "asr": "fail_no_admitted_aligned_speech",
            "tts": "fail_no_authorized_coherent_voice_corpus",
        },
        "files": {
            name: {"sha256": sha256(output_root / name), "size_bytes": (output_root / name).stat().st_size}
            for name in manifest_files
        },
        "limitations": limitations,
    }
    write_json(output_root / "MODEL-MANIFEST.json", manifest)
    checksum_names = sorted(manifest_files + ["MODEL-MANIFEST.json"])
    (output_root / "SHA256SUMS").write_text(
        "".join(f"{sha256(output_root / name)}  {name}\n" for name in checksum_names),
        encoding="utf-8",
    )

    run_root = PROGRAM_ROOT / "experiments" / "runs" / "kuku-possum-candidate-lexical-v0.1.0"
    run_root.mkdir(parents=True, exist_ok=True)
    write_json(run_root / "RUN-RESULT.json", {
        "run_id": "kuku-possum-candidate-lexical-v0.1.0",
        "started_at_utc": CREATED_AT,
        "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "compute": "local_cpu_standard_library",
        "paid_compute_used": False,
        "model_manifest": str((output_root / "MODEL-MANIFEST.json").relative_to(PROGRAM_ROOT)),
        "model_manifest_sha256": sha256(output_root / "MODEL-MANIFEST.json"),
        "evaluation_sha256": sha256(output_root / "EVALUATION.json"),
        "verdict": "promote_research_candidate_lexical_retrieval_only",
    })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=PROGRAM_ROOT / "models" / "promoted" / "kuku-possum-candidate-lexical-retriever-v0.1.0",
    )
    args = parser.parse_args()
    build(args.output_root)


if __name__ == "__main__":
    main()

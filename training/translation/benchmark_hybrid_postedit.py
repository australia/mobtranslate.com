#!/usr/bin/env python3
"""Prepare and score a reference-blind low-resource MT post-edit benchmark.

The preparation phase may inspect references only to enforce leakage exclusions.
It writes model-visible inputs and private scoring material to separate trees.
The scoring phase refuses partial, duplicate, or unexpected output IDs.
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import math
import random
import re
import statistics
import unicodedata
from collections import Counter
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
from sacrebleu.metrics import BLEU, CHRF


WORD_RE = re.compile(r"[^\W_]+(?:['’-][^\W_]+)*", re.UNICODE)
HEADING_RE = re.compile(r"^##\s+", re.MULTILINE)


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def source_text(row: dict[str, Any]) -> str:
    value = clean(row.get("unconditioned_input_text") or row.get("input_text"))
    return re.sub(r"^<[^>]+>\s*", "", value)


def reference_text(row: dict[str, Any]) -> str:
    return clean(row.get("reference") or row.get("output_text"))


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(WORD_RE.findall(value))


def tokens(value: str) -> list[str]:
    return WORD_RE.findall(unicodedata.normalize("NFKC", value).casefold())


def char_ngrams(value: str, n: int = 3) -> set[str]:
    text = f"  {normalized(value)}  "
    return {text[index : index + n] for index in range(max(0, len(text) - n + 1))}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: expected an object")
            rows.append(row)
    return rows


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def string_values(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from string_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from string_values(child)


@dataclass(frozen=True)
class SearchDocument:
    key: str
    search_text: str
    payload: dict[str, Any]


class BM25Index:
    """Small deterministic BM25 index with a character-overlap tie breaker."""

    def __init__(self, documents: Sequence[SearchDocument], k1: float = 1.5, b: float = 0.75):
        if not documents:
            raise ValueError("BM25 index needs at least one document")
        self.documents = list(documents)
        self.k1 = k1
        self.b = b
        self.document_tokens = [tokens(document.search_text) for document in self.documents]
        self.frequencies = [Counter(document) for document in self.document_tokens]
        self.lengths = [len(document) for document in self.document_tokens]
        self.average_length = sum(self.lengths) / len(self.lengths)
        document_frequency: Counter[str] = Counter()
        for document in self.document_tokens:
            document_frequency.update(set(document))
        total = len(self.documents)
        self.idf = {
            term: math.log(1.0 + (total - frequency + 0.5) / (frequency + 0.5))
            for term, frequency in document_frequency.items()
        }
        self.document_ngrams = [char_ngrams(document.search_text) for document in self.documents]

    def search(self, query: str, limit: int) -> list[dict[str, Any]]:
        query_terms = tokens(query)
        query_ngrams = char_ngrams(query)
        scored: list[tuple[float, float, str, int]] = []
        for index, frequencies in enumerate(self.frequencies):
            score = 0.0
            length = self.lengths[index]
            for term in query_terms:
                frequency = frequencies.get(term, 0)
                if frequency == 0:
                    continue
                denominator = frequency + self.k1 * (
                    1.0 - self.b + self.b * length / max(self.average_length, 1.0)
                )
                score += self.idf.get(term, 0.0) * frequency * (self.k1 + 1.0) / denominator
            candidate_ngrams = self.document_ngrams[index]
            union = len(query_ngrams | candidate_ngrams)
            trigram = len(query_ngrams & candidate_ngrams) / union if union else 0.0
            if score > 0.0 or trigram > 0.0:
                scored.append((score, trigram, self.documents[index].key, index))
        scored.sort(key=lambda item: (-item[0], -item[1], item[2]))
        output: list[dict[str, Any]] = []
        for score, trigram, _, index in scored[:limit]:
            output.append(
                {
                    **self.documents[index].payload,
                    "retrieval": {"bm25": round(score, 6), "char_trigram_jaccard": round(trigram, 6)},
                }
            )
        return output


def load_prediction_rows(path: Path) -> list[dict[str, Any]]:
    payload = read_json(path)
    rows = payload.get("predictions") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError(f"{path}: missing predictions array")
    return rows


def prediction_index(path: Path) -> dict[str, dict[str, Any]]:
    rows = load_prediction_rows(path)
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        row_id = clean(row.get("id"))
        if not row_id or row_id in result:
            raise ValueError(f"{path}: empty or duplicate prediction id {row_id!r}")
        result[row_id] = row
    return result


def load_training_documents(path: Path, blocked_sources: set[str], blocked_targets: set[str]) -> list[SearchDocument]:
    documents: list[SearchDocument] = []
    for row in read_jsonl(path):
        source = source_text(row)
        target = reference_text(row)
        if not source or not target:
            continue
        if normalized(source) in blocked_sources or normalized(target) in blocked_targets:
            continue
        documents.append(
            SearchDocument(
                key=clean(row.get("id")) or hashlib.sha256(f"{source}\0{target}".encode()).hexdigest(),
                search_text=source,
                payload={"source": source, "target": target, "provenance_id": clean(row.get("id"))},
            )
        )
    return documents


def load_dictionary_documents(path: Path) -> list[SearchDocument]:
    documents: list[SearchDocument] = []
    for row in read_jsonl(path):
        word = clean(row.get("word"))
        english_values = [
            clean(row.get("gloss")),
            *[clean(value) for value in (row.get("definitions") or [])],
            *[clean(value) for value in (row.get("translations") or [])],
        ]
        english_values = [value for value in english_values if value]
        if not word or not english_values:
            continue
        documents.append(
            SearchDocument(
                key=clean(row.get("entry_id")) or word,
                search_text="; ".join(english_values),
                payload={
                    "headword": word,
                    "word_class": clean(row.get("type")),
                    "glosses": english_values[:8],
                    "provenance_id": clean(row.get("entry_id")),
                },
            )
        )
    return documents


def load_grammar_documents(path: Path) -> list[SearchDocument]:
    text = path.read_text(encoding="utf-8")
    starts = [match.start() for match in HEADING_RE.finditer(text)]
    documents: list[SearchDocument] = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(text)
        section = text[start:end].strip()
        lines = section.splitlines()
        if not lines:
            continue
        title = lines[0].lstrip("# ").strip()
        body = clean(" ".join(lines[1:]))
        documents.append(
            SearchDocument(
                key=f"grammar-{position:04d}",
                search_text=f"{title} {body}",
                payload={"section": title, "excerpt": body[:1800], "provenance_id": f"section-{position}"},
            )
        )
    return documents


def translation_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "translation": {"type": "string"},
            "decision": {
                "type": "string",
                "enum": ["draft_1", "draft_2", "postedit", "abstain"],
            },
            "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "audit_note": {"type": "string", "maxLength": 500},
        },
        "required": ["translation", "decision", "confidence", "audit_note"],
    }


def output_schema(row_ids: Sequence[str]) -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "translations": {
                "type": "object",
                "additionalProperties": False,
                "properties": {row_id: translation_schema() for row_id in row_ids},
                "required": list(row_ids),
            }
        },
        "required": ["translations"],
    }


PROMPT = """You are a conservative Kuku Yalanji machine-translation post-editor operating on a frozen research benchmark.

The benchmark rows contain an English source, two anonymized custom-model drafts, and dynamically retrieved TRAINING-SIDE examples, dictionary entries, and grammar excerpts. No reference translation is present. The retrieved material may be only partially relevant and may contain conflicts or synthetic errors.

For every row:
1. Preserve all source propositions, participants, polarity, tense/aspect, argument structure, and discourse relations.
2. Apply the supplied Kuku Yalanji evidence conservatively. Never invent a form merely because it looks plausible.
3. Prefer an unchanged draft when the evidence does not justify an edit. Use `postedit` only for evidence-supported changes.
4. Retrieved examples are analogies, not text to copy. Proper names may remain proper names.
5. Follow elder-Patz orthography represented by the evidence. Do not add English explanations or markdown to the translation.
6. Use `abstain` with an empty translation only when neither draft nor evidence supports a defensible output.
7. Return exactly one object for every supplied ID and no extra IDs, keyed exactly as required by the output schema. Confidence is epistemic confidence, not stylistic preference.
8. Do not call tools, search files, browse, or seek outside knowledge. Reason only from this prompt and the supplied benchmark JSON.

This is an automatic research comparison, not speaker certification.
"""


def prepare(args: argparse.Namespace) -> None:
    output_dir: Path = args.output_dir
    blind_dir = output_dir / "blind"
    private_dir = output_dir / "private"
    if output_dir.exists() and any(output_dir.iterdir()) and not args.force:
        raise SystemExit(f"refusing to overwrite non-empty benchmark directory: {output_dir}")
    blind_dir.mkdir(parents=True, exist_ok=True)
    private_dir.mkdir(parents=True, exist_ok=True)

    test_rows = read_jsonl(args.test)
    ids = [clean(row.get("id")) for row in test_rows]
    if not ids or any(not row_id for row_id in ids) or len(ids) != len(set(ids)):
        raise ValueError("test set has empty or duplicate IDs")
    candidate_a = prediction_index(args.candidate_a)
    candidate_b = prediction_index(args.candidate_b)
    if set(ids) != set(candidate_a) or set(ids) != set(candidate_b):
        raise ValueError("candidate prediction IDs do not exactly equal test IDs")

    references: list[dict[str, Any]] = []
    blocked_sources: set[str] = set()
    blocked_targets: set[str] = set()
    for row in test_rows:
        source = source_text(row)
        reference = reference_text(row)
        if not source or not reference:
            raise ValueError(f"test row {row.get('id')} lacks source or reference")
        blocked_sources.add(normalized(source))
        blocked_targets.add(normalized(reference))
        references.append({"id": clean(row.get("id")), "source": source, "reference": reference})

    training_documents = load_training_documents(args.training, blocked_sources, blocked_targets)
    dictionary_documents = load_dictionary_documents(args.dictionary)
    grammar_documents = load_grammar_documents(args.grammar)
    if not training_documents or not dictionary_documents or not grammar_documents:
        raise ValueError("one or more retrieval corpora are empty")
    training_index = BM25Index(training_documents)
    dictionary_index = BM25Index(dictionary_documents)
    grammar_index = BM25Index(grammar_documents)

    blind_rows: list[dict[str, Any]] = []
    candidate_map: list[dict[str, Any]] = []
    for row in test_rows:
        row_id = clean(row.get("id"))
        source = source_text(row)
        prediction_a = clean(candidate_a[row_id].get("prediction"))
        prediction_b = clean(candidate_b[row_id].get("prediction"))
        if not prediction_a or not prediction_b:
            raise ValueError(f"candidate produced an empty output for {row_id}")
        swap = int(hashlib.sha256(f"{args.seed}:{row_id}".encode()).hexdigest(), 16) % 2 == 1
        drafts = [prediction_b, prediction_a] if swap else [prediction_a, prediction_b]
        labels = [args.candidate_b_label, args.candidate_a_label] if swap else [args.candidate_a_label, args.candidate_b_label]
        blind_rows.append(
            {
                "id": row_id,
                "source": source,
                "draft_1": drafts[0],
                "draft_2": drafts[1],
                "retrieved_examples": training_index.search(source, args.examples),
                "dictionary_entries": dictionary_index.search(source, args.dictionary_entries),
                "grammar_sections": grammar_index.search(source, args.grammar_sections),
            }
        )
        candidate_map.append(
            {
                "id": row_id,
                "draft_1_label": labels[0],
                "draft_2_label": labels[1],
                args.candidate_a_label: prediction_a,
                args.candidate_b_label: prediction_b,
            }
        )

    retrieval_reference_hits: list[dict[str, str]] = []
    for row in blind_rows:
        retrieval_payload = {
            "retrieved_examples": row["retrieved_examples"],
            "dictionary_entries": row["dictionary_entries"],
            "grammar_sections": row["grammar_sections"],
        }
        visible_surfaces = [normalized(value) for value in string_values(retrieval_payload)]
        for target in blocked_targets:
            if target and any(target in surface for surface in visible_surfaces):
                retrieval_reference_hits.append({"row_id": row["id"], "target": target})
    if retrieval_reference_hits:
        raise ValueError(
            "retrieval payload exposes held-out reference surfaces: "
            + json.dumps(retrieval_reference_hits[:5], ensure_ascii=False)
        )

    write_jsonl(private_dir / "references.jsonl", references)
    write_jsonl(private_dir / "candidate-map.jsonl", candidate_map)
    (blind_dir / "PROMPT.md").write_text(PROMPT, encoding="utf-8")
    batches: list[dict[str, Any]] = []
    for offset in range(0, len(blind_rows), args.batch_size):
        rows = blind_rows[offset : offset + args.batch_size]
        batch_number = offset // args.batch_size + 1
        batch_path = blind_dir / f"batch-{batch_number:02d}.json"
        schema_path = blind_dir / f"batch-{batch_number:02d}.schema.json"
        claude_schema_path = blind_dir / f"batch-{batch_number:02d}.claude.schema.json"
        write_json(batch_path, {"benchmark": args.benchmark_id, "rows": rows})
        schema = output_schema([row["id"] for row in rows])
        write_json(schema_path, schema)
        write_json(claude_schema_path, {key: value for key, value in schema.items() if key != "$schema"})
        batches.append(
            {
                "batch": batch_number,
                "rows": len(rows),
                "ids": [row["id"] for row in rows],
                "input": batch_path.name,
                "input_sha256": sha256(batch_path),
                "schema": schema_path.name,
                "schema_sha256": sha256(schema_path),
                "claude_schema": claude_schema_path.name,
                "claude_schema_sha256": sha256(claude_schema_path),
            }
        )

    source_files = [args.test, args.candidate_a, args.candidate_b, args.training, args.dictionary, args.grammar]
    manifest = {
        "benchmark_id": args.benchmark_id,
        "created_at": args.created_at,
        "language": "Kuku Yalanji",
        "direction": "eng-gvn",
        "protocol": "reference-blind anonymized dual-candidate post-edit",
        "rows": len(blind_rows),
        "seed": args.seed,
        "retrieval": {
            "algorithm": "BM25 plus character-trigram tie-break",
            "training_examples_per_row": args.examples,
            "dictionary_entries_per_row": args.dictionary_entries,
            "grammar_sections_per_row": args.grammar_sections,
            "training_documents_after_leakage_exclusion": len(training_documents),
            "dictionary_documents": len(dictionary_documents),
            "grammar_documents": len(grammar_documents),
            "blocked_test_source_surfaces": len(blocked_sources),
            "blocked_test_target_surfaces": len(blocked_targets),
            "full_reference_surface_hits_in_retrieval": len(retrieval_reference_hits),
        },
        "candidate_labels_private": [args.candidate_a_label, args.candidate_b_label],
        "batches": batches,
        "prompt": {"path": "blind/PROMPT.md", "sha256": sha256(blind_dir / "PROMPT.md")},
        "sources": [{"path": str(path), "sha256": sha256(path)} for path in source_files],
        "private": {
            "references_sha256": sha256(private_dir / "references.jsonl"),
            "candidate_map_sha256": sha256(private_dir / "candidate-map.jsonl"),
        },
    }
    write_json(output_dir / "manifest.json", manifest)
    print(json.dumps({"status": "PASS", **manifest}, ensure_ascii=False))


def repeated_ngram(text: str, n: int = 3) -> bool:
    sequence = tokens(text)
    if len(sequence) < n:
        return False
    ngrams = [tuple(sequence[index : index + n]) for index in range(len(sequence) - n + 1)]
    return len(ngrams) != len(set(ngrams))


def sentence_chrf(hypothesis: str, reference: str, metric: CHRF) -> float:
    return float(metric.sentence_score(hypothesis, [reference]).score)


def summarize(name: str, rows: list[dict[str, str]]) -> dict[str, Any]:
    bleu = BLEU(effective_order=True)
    chrf = CHRF(word_order=2)
    hypotheses = [row["prediction"] for row in rows]
    references = [row["reference"] for row in rows]
    sentence_scores = [sentence_chrf(hypothesis, reference, chrf) for hypothesis, reference in zip(hypotheses, references)]
    length_ratios = [len(hypothesis) / max(len(reference), 1) for hypothesis, reference in zip(hypotheses, references)]
    return {
        "name": name,
        "rows": len(rows),
        "bleu": float(bleu.corpus_score(hypotheses, [references]).score),
        "chrf_plus_plus": float(chrf.corpus_score(hypotheses, [references]).score),
        "mean_sentence_chrf_plus_plus": statistics.fmean(sentence_scores),
        "exact": sum(clean(hypothesis) == clean(reference) for hypothesis, reference in zip(hypotheses, references)),
        "empty": sum(not clean(hypothesis) for hypothesis in hypotheses),
        "source_copy": sum(normalized(hypothesis) == normalized(row["source"]) for hypothesis, row in zip(hypotheses, rows)),
        "repeated_trigram_rows": sum(repeated_ngram(hypothesis) for hypothesis in hypotheses),
        "mean_character_length_ratio": statistics.fmean(length_ratios),
        "median_character_length_ratio": statistics.median(length_ratios),
        "sentence_chrf_plus_plus": sentence_scores,
    }


def paired_bootstrap(
    left: list[float], right: list[float], replicates: int, seed: int
) -> dict[str, float]:
    if len(left) != len(right) or not left:
        raise ValueError("paired bootstrap requires equal non-empty score arrays")
    differences = np.asarray(right, dtype=np.float64) - np.asarray(left, dtype=np.float64)
    rng = np.random.default_rng(seed)
    means = np.empty(replicates, dtype=np.float64)
    for start in range(0, replicates, 1000):
        size = min(1000, replicates - start)
        samples = rng.integers(0, len(differences), size=(size, len(differences)))
        means[start : start + size] = differences[samples].mean(axis=1)
    low, high = np.percentile(means, [2.5, 97.5])
    return {
        "delta_mean_sentence_chrf": float(differences.mean()),
        "ci95_low": float(low),
        "ci95_high": float(high),
        "replicates": replicates,
    }


def parse_structured_output(path: Path) -> list[dict[str, Any]]:
    payload = read_json(path)
    if isinstance(payload, dict) and "structured_output" in payload:
        payload = payload["structured_output"]
    if isinstance(payload, dict) and isinstance(payload.get("result"), str):
        try:
            payload = json.loads(payload["result"])
        except json.JSONDecodeError:
            pass
    translations = payload.get("translations") if isinstance(payload, dict) else None
    if isinstance(translations, dict):
        return [{"id": row_id, **row} for row_id, row in translations.items()]
    if isinstance(translations, list):
        return translations
    raise ValueError(f"{path}: no structured translations object or array")


def score(args: argparse.Namespace) -> None:
    manifest = read_json(args.benchmark_dir / "manifest.json")
    reference_rows = read_jsonl(args.benchmark_dir / "private" / "references.jsonl")
    map_rows = read_jsonl(args.benchmark_dir / "private" / "candidate-map.jsonl")
    expected_ids = [row["id"] for row in reference_rows]
    references = {row["id"]: row for row in reference_rows}
    candidate_map = {row["id"]: row for row in map_rows}

    systems: dict[str, dict[str, str]] = {
        label: {row["id"]: clean(row[label]) for row in map_rows}
        for label in manifest["candidate_labels_private"]
    }
    decisions: dict[str, list[dict[str, Any]]] = {}
    system_artifacts: dict[str, list[dict[str, str]]] = {}
    for specification in args.system:
        if "=" not in specification:
            raise ValueError("--system must be NAME=PATH")
        name, raw_path = specification.split("=", 1)
        paths = (
            [Path(path) for path in sorted(glob.glob(raw_path))]
            if any(character in raw_path for character in "*?[" )
            else [Path(raw_path)]
        )
        if not paths:
            raise ValueError(f"no output files matched {raw_path}")
        system_artifacts[name] = [
            {"path": str(path.resolve()), "sha256": sha256(path)} for path in paths
        ]
        rows: list[dict[str, Any]] = []
        for path in paths:
            rows.extend(parse_structured_output(path))
        ids = [clean(row.get("id")) for row in rows]
        if len(ids) != len(set(ids)):
            raise ValueError(f"{name}: duplicate output IDs")
        if set(ids) != set(expected_ids) or len(ids) != len(expected_ids):
            missing = sorted(set(expected_ids) - set(ids))[:5]
            extra = sorted(set(ids) - set(expected_ids))[:5]
            raise ValueError(f"{name}: output ID mismatch; missing={missing}, extra={extra}")
        systems[name] = {clean(row["id"]): clean(row.get("translation")) for row in rows}
        decisions[name] = rows

    summaries: dict[str, dict[str, Any]] = {}
    scored_rows: dict[str, list[dict[str, str]]] = {}
    for name, predictions in systems.items():
        rows = [
            {
                "id": row_id,
                "source": references[row_id]["source"],
                "reference": references[row_id]["reference"],
                "prediction": predictions[row_id],
            }
            for row_id in expected_ids
        ]
        scored_rows[name] = rows
        summaries[name] = summarize(name, rows)

    candidate_labels = manifest["candidate_labels_private"]
    chrf = CHRF(word_order=2)
    oracle_rows: list[dict[str, str]] = []
    for row_id in expected_ids:
        reference = references[row_id]["reference"]
        options = [(systems[label][row_id], label) for label in candidate_labels]
        prediction, _ = max(options, key=lambda item: sentence_chrf(item[0], reference, chrf))
        oracle_rows.append(
            {
                "id": row_id,
                "source": references[row_id]["source"],
                "reference": reference,
                "prediction": prediction,
            }
        )
    summaries["reference_leaking_two_candidate_oracle"] = summarize(
        "reference_leaking_two_candidate_oracle", oracle_rows
    )

    comparisons: dict[str, Any] = {}
    baseline = candidate_labels[1]
    for name, summary in summaries.items():
        if name in {baseline, "reference_leaking_two_candidate_oracle"}:
            continue
        comparisons[f"{name}_minus_{baseline}"] = paired_bootstrap(
            summaries[baseline]["sentence_chrf_plus_plus"],
            summary["sentence_chrf_plus_plus"],
            args.bootstrap_replicates,
            args.seed,
        )

    pairwise_comparisons: dict[str, Any] = {}
    comparable_names = [name for name in summaries if name != "reference_leaking_two_candidate_oracle"]
    for left_name, right_name in combinations(comparable_names, 2):
        left_scores = summaries[left_name]["sentence_chrf_plus_plus"]
        right_scores = summaries[right_name]["sentence_chrf_plus_plus"]
        comparison = paired_bootstrap(
            left_scores,
            right_scores,
            args.bootstrap_replicates,
            args.seed,
        )
        comparison.update(
            {
                "right_wins": sum(right > left for left, right in zip(left_scores, right_scores)),
                "ties": sum(right == left for left, right in zip(left_scores, right_scores)),
                "left_wins": sum(right < left for left, right in zip(left_scores, right_scores)),
            }
        )
        pairwise_comparisons[f"{right_name}_minus_{left_name}"] = comparison

    decision_summary: dict[str, Any] = {}
    for name, rows in decisions.items():
        counts = Counter(clean(row.get("decision")) for row in rows)
        selected_labels: Counter[str] = Counter()
        novel = 0
        decision_translation_mismatch_ids: list[str] = []
        abstention_contract_violation_ids: list[str] = []
        confidences: list[float] = []
        contract_predictions = {row["id"]: row["prediction"] for row in scored_rows[name]}
        for row in rows:
            row_id = clean(row["id"])
            decision = clean(row.get("decision"))
            if decision in {"draft_1", "draft_2"}:
                selected_labels[candidate_map[row_id][f"{decision}_label"]] += 1
            translation = clean(row.get("translation"))
            if decision in {"draft_1", "draft_2"}:
                selected_label = candidate_map[row_id][f"{decision}_label"]
                if translation != clean(candidate_map[row_id][selected_label]):
                    decision_translation_mismatch_ids.append(row_id)
                    contract_predictions[row_id] = clean(candidate_map[row_id][selected_label])
            if (decision == "abstain") != (not translation):
                abstention_contract_violation_ids.append(row_id)
            confidence = row.get("confidence")
            if isinstance(confidence, (int, float)):
                confidences.append(float(confidence))
            if translation not in {
                clean(candidate_map[row_id][candidate_labels[0]]),
                clean(candidate_map[row_id][candidate_labels[1]]),
            }:
                novel += 1
        contract_rows = [
            {**row, "prediction": contract_predictions[row["id"]]} for row in scored_rows[name]
        ]
        contract_summary = summarize(f"{name}-contract-enforced", contract_rows)
        decision_summary[name] = {
            "decision_counts": dict(sorted(counts.items())),
            "selected_candidate_labels": dict(sorted(selected_labels.items())),
            "novel_output_rows": novel,
            "decision_translation_mismatches": len(decision_translation_mismatch_ids),
            "decision_translation_mismatch_ids": decision_translation_mismatch_ids,
            "abstention_contract_violations": len(abstention_contract_violation_ids),
            "abstention_contract_violation_ids": abstention_contract_violation_ids,
            "mean_reported_confidence": statistics.fmean(confidences) if confidences else None,
            "median_reported_confidence": statistics.median(confidences) if confidences else None,
            "contract_enforced_metrics": {
                key: value
                for key, value in contract_summary.items()
                if key != "sentence_chrf_plus_plus"
            },
        }

    public_summaries = {
        name: {key: value for key, value in summary.items() if key != "sentence_chrf_plus_plus"}
        for name, summary in summaries.items()
    }
    result = {
        "benchmark_id": manifest["benchmark_id"],
        "protocol": manifest["protocol"],
        "rows": len(expected_ids),
        "systems": public_summaries,
        "paired_comparisons": comparisons,
        "all_pairwise_comparisons": pairwise_comparisons,
        "posteditor_decisions": decision_summary,
        "system_artifacts": system_artifacts,
        "limitations": [
            "Automatic reference overlap is not speaker judgment.",
            "The 43-row elder set is small and contains one duplicated English surface.",
            "The two custom candidates are single-seed systems.",
            "The oracle uses references and is only an unattainable selection ceiling.",
            "LLM post-edit systems may have undisclosed pretraining exposure and are not deterministic across reruns.",
        ],
    }
    write_json(args.output, result)
    print(json.dumps(result, ensure_ascii=False))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    subparsers = root.add_subparsers(dest="command", required=True)

    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--benchmark-id", required=True)
    prepare_parser.add_argument("--created-at", required=True)
    prepare_parser.add_argument("--test", type=Path, required=True)
    prepare_parser.add_argument("--candidate-a", type=Path, required=True)
    prepare_parser.add_argument("--candidate-b", type=Path, required=True)
    prepare_parser.add_argument("--candidate-a-label", default="v21.1-codex")
    prepare_parser.add_argument("--candidate-b-label", default="v21.2-claude")
    prepare_parser.add_argument("--training", type=Path, required=True)
    prepare_parser.add_argument("--dictionary", type=Path, required=True)
    prepare_parser.add_argument("--grammar", type=Path, required=True)
    prepare_parser.add_argument("--output-dir", type=Path, required=True)
    prepare_parser.add_argument("--examples", type=int, default=4)
    prepare_parser.add_argument("--dictionary-entries", type=int, default=10)
    prepare_parser.add_argument("--grammar-sections", type=int, default=4)
    prepare_parser.add_argument("--batch-size", type=int, default=8)
    prepare_parser.add_argument("--seed", type=int, default=42)
    prepare_parser.add_argument("--force", action="store_true")
    prepare_parser.set_defaults(func=prepare)

    score_parser = subparsers.add_parser("score")
    score_parser.add_argument("--benchmark-dir", type=Path, required=True)
    score_parser.add_argument("--system", action="append", default=[])
    score_parser.add_argument("--output", type=Path, required=True)
    score_parser.add_argument("--bootstrap-replicates", type=int, default=50000)
    score_parser.add_argument("--seed", type=int, default=42)
    score_parser.set_defaults(func=score)
    return root


def main() -> None:
    args = parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

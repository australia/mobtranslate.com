#!/usr/bin/env python3
"""Compare the frozen Mi'kmaq v3.3 candidate on the one-shot sealed test."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import random
import statistics
import tempfile
from typing import Any, Iterable, Sequence
import unicodedata

from sacrebleu.metrics import BLEU, CHRF


ARMS = ("base", "retention", "candidate")
QUOTE_FOLD = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u02bc": "'",
        "`": "'",
        "\u00b4": "'",
        "\u201c": '"',
        "\u201d": '"',
    }
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    for arm in ARMS:
        parser.add_argument(f"--{arm}-sentence", type=Path, required=True)
        parser.add_argument(f"--{arm}-lexeme", type=Path)
    parser.add_argument("--materialization-manifest", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--expected-contract-sha256", required=True)
    parser.add_argument("--expected-sealed-sha256", required=True)
    parser.add_argument("--expected-total-rows", type=int, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=5000)
    parser.add_argument("--bootstrap-seed", type=int, default=20260723)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def normalize_space(value: Any) -> str:
    return " ".join(str(value or "").split())


def normalize_comparison(value: Any) -> str:
    return " ".join(
        unicodedata.normalize("NFKC", str(value or ""))
        .translate(QUOTE_FOLD)
        .casefold()
        .split()
    )


def has_repeated_ngram(value: Any, size: int = 3) -> bool:
    tokens = normalize_comparison(value).split()
    if len(tokens) < size * 2:
        return False
    ngrams = [
        tuple(tokens[index : index + size]) for index in range(len(tokens) - size + 1)
    ]
    return len(ngrams) != len(set(ngrams))


def levenshtein(left: Sequence[str], right: Sequence[str]) -> int:
    previous = list(range(len(right) + 1))
    for left_index, left_item in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_item in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_item != right_item),
                )
            )
        previous = current
    return previous[-1]


def load_predictions(path: Path, *, task: str) -> dict[str, Any]:
    payload = read_json(path)
    rows = payload.get("predictions")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"missing predictions: {path}")
    metrics = payload.get("metrics") or {}
    if int(metrics.get("rows", -1)) != len(rows):
        raise ValueError(f"prediction/metric row mismatch: {path}")
    ids = [str(row.get("id") or "") for row in rows]
    if any(not row_id for row_id in ids) or len(set(ids)) != len(ids):
        raise ValueError(f"blank or duplicate prediction IDs: {path}")
    for row in rows:
        if row.get("split") != "test" or row.get("task") != task:
            raise ValueError(f"wrong split/task in prediction payload: {path}")
    return payload


def aligned_rows(payloads: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    indexed: dict[str, dict[str, dict[str, Any]]] = {}
    for arm, payload in payloads.items():
        indexed[arm] = {str(row["id"]): row for row in payload["predictions"]}
    ordered_ids = [str(row["id"]) for row in payloads["base"]["predictions"]]
    if any(set(indexed[arm]) != set(ordered_ids) for arm in ARMS):
        raise ValueError("prediction row IDs differ across arms")

    aligned: list[dict[str, Any]] = []
    for row_id in ordered_ids:
        base = indexed["base"][row_id]
        source = normalize_space(base.get("input_text"))
        reference = normalize_space(base.get("reference") or base.get("output_text"))
        if not source or not reference:
            raise ValueError(f"blank aligned source/reference: {row_id}")
        for arm in ARMS[1:]:
            other = indexed[arm][row_id]
            other_reference = normalize_space(
                other.get("reference") or other.get("output_text")
            )
            if normalize_space(other.get("input_text")) != source:
                raise ValueError(f"source changed across arms: {row_id}")
            if other_reference != reference:
                raise ValueError(f"reference changed across arms: {row_id}")
        aligned.append(
            {
                "id": row_id,
                "input_text": source,
                "reference": reference,
                "task": base.get("task"),
                "lesson_id": base.get("lesson_id"),
                "split_component_id": base.get("split_component_id"),
                "predictions": {
                    arm: normalize_space(indexed[arm][row_id].get("prediction"))
                    for arm in ARMS
                },
            }
        )
    return aligned


def sentence_metrics(rows: Sequence[dict[str, Any]], arm: str) -> dict[str, Any]:
    predictions = [str(row["predictions"][arm]) for row in rows]
    references = [str(row["reference"]) for row in rows]
    sources = [str(row["input_text"]) for row in rows]
    bleu = BLEU(effective_order=True)
    chrf = CHRF(word_order=2)
    bleu_score = bleu.corpus_score(predictions, [references])
    chrf_score = chrf.corpus_score(predictions, [references])
    ratios = [
        len(normalize_comparison(prediction))
        / max(1, len(normalize_comparison(reference)))
        for prediction, reference in zip(predictions, references, strict=True)
    ]
    frequencies = Counter(normalize_comparison(value) for value in predictions)
    return {
        "rows": len(rows),
        "bleu": bleu_score.score,
        "bleu_signature": str(bleu.get_signature()),
        "chrf": chrf_score.score,
        "chrf_signature": str(chrf.get_signature()),
        "exact_rows": sum(
            normalize_comparison(prediction) == normalize_comparison(reference)
            for prediction, reference in zip(predictions, references, strict=True)
        ),
        "empty_outputs": sum(not normalize_space(value) for value in predictions),
        "source_copy_rows": sum(
            normalize_comparison(prediction) == normalize_comparison(source)
            for prediction, source in zip(predictions, sources, strict=True)
        ),
        "repeated_trigram_rows": sum(
            has_repeated_ngram(value) for value in predictions
        ),
        "severe_undertranslation_rows": sum(ratio < 0.60 for ratio in ratios),
        "severe_overtranslation_rows": sum(ratio > 1.50 for ratio in ratios),
        "mean_prediction_reference_character_ratio": statistics.mean(ratios),
        "median_prediction_reference_character_ratio": statistics.median(ratios),
        "unique_normalized_outputs": len(frequencies),
        "maximum_normalized_output_frequency": max(frequencies.values()),
    }


def lexical_metrics(rows: Sequence[dict[str, Any]], arm: str) -> dict[str, Any]:
    exact = 0
    errors: list[float] = []
    blanks = 0
    copies = 0
    for row in rows:
        prediction = normalize_comparison(row["predictions"][arm])
        reference = normalize_comparison(row["reference"])
        source = normalize_comparison(row["input_text"])
        exact += prediction == reference
        blanks += not prediction
        copies += prediction == source
        errors.append(
            levenshtein(list(prediction), list(reference)) / max(1, len(reference))
        )
    return {
        "rows": len(rows),
        "single_reference_exact_rows": exact,
        "single_reference_exact_percent": 100 * exact / len(rows),
        "mean_codepoint_cer": statistics.mean(errors),
        "median_codepoint_cer": statistics.median(errors),
        "empty_outputs": blanks,
        "source_copy_rows": copies,
        "claim_limit": (
            "Diagnostic only: one lesson-source reference per row; dictionary lookup and "
            "the 14,438-row lexical census remain separate."
        ),
    }


def percentile(values: Sequence[float], fraction: float) -> float:
    if not values:
        raise ValueError("cannot take percentile of an empty sequence")
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def paired_chrf_bootstrap(
    rows: Sequence[dict[str, Any]],
    *,
    control: str,
    treatment: str,
    samples: int,
    seed: int,
) -> dict[str, Any]:
    if not rows or samples < 1:
        raise ValueError("bootstrap requires rows and positive samples")
    metric = CHRF(word_order=2)
    references = [str(row["reference"]) for row in rows]
    controls = [str(row["predictions"][control]) for row in rows]
    treatments = [str(row["predictions"][treatment]) for row in rows]

    # SacreBLEU's public API is corpus_score(hypotheses, references). Keep the
    # resampling calculation explicit so row pairing cannot be broken.
    def score_delta(indices: Sequence[int]) -> float:
        sampled_refs = [references[index] for index in indices]
        return (
            metric.corpus_score(
                [treatments[index] for index in indices], [sampled_refs]
            ).score
            - metric.corpus_score(
                [controls[index] for index in indices], [sampled_refs]
            ).score
        )

    observed = score_delta(range(len(rows)))
    rng = random.Random(seed)
    replicates = [
        score_delta([rng.randrange(len(rows)) for _ in rows]) for _ in range(samples)
    ]
    return {
        "unit": "paired sealed sentence row",
        "control": control,
        "treatment": treatment,
        "samples": samples,
        "seed": seed,
        "observed_chrf_delta": observed,
        "percentile_90_interval": {
            "low": percentile(replicates, 0.05),
            "high": percentile(replicates, 0.95),
        },
        "probability_delta_above_zero": sum(value > 0 for value in replicates)
        / samples,
        "interpretation": (
            "Paired bootstrap over the fixed sealed rows; a conservative decision rule, "
            "not a population reliability interval."
        ),
    }


def rate(metrics: dict[str, Any], field: str) -> float:
    return float(metrics[field]) / int(metrics["rows"])


def sealed_decision(
    sentence: dict[str, dict[str, Any]],
    bootstrap: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    conditions: dict[str, dict[str, Any]] = {}
    for arm in ARMS:
        conditions[f"{arm}_zero_sentence_blanks"] = {
            "observed": sentence[arm]["empty_outputs"],
            "required": 0,
            "pass": sentence[arm]["empty_outputs"] == 0,
        }
    conditions["candidate_zero_source_copies"] = {
        "observed": sentence["candidate"]["source_copy_rows"],
        "required": 0,
        "pass": sentence["candidate"]["source_copy_rows"] == 0,
    }
    for control in ("retention", "base"):
        delta = sentence["candidate"]["chrf"] - sentence[control]["chrf"]
        conditions[f"candidate_chrf_at_least_one_above_{control}"] = {
            "observed": delta,
            "required": 1.0,
            "pass": delta >= 1.0,
        }
        low = bootstrap[f"candidate_vs_{control}"]["percentile_90_interval"]["low"]
        conditions[f"candidate_vs_{control}_bootstrap_direction"] = {
            "observed": low,
            "required": 0.0,
            "pass": low > 0.0,
        }

    for field in (
        "severe_undertranslation_rows",
        "severe_overtranslation_rows",
        "repeated_trigram_rows",
    ):
        delta = rate(sentence["candidate"], field) - rate(sentence["retention"], field)
        conditions[f"candidate_{field}_noninferiority"] = {
            "observed": delta,
            "required": 0.05,
            "pass": delta <= 0.05,
        }

    passed = all(condition["pass"] for condition in conditions.values())
    return {
        "conditions": conditions,
        "passed": passed,
        "selected_model": "dialog40-seed17" if passed else None,
        "qualitative_review_authorized": passed,
        "hugging_face_publication_authorized": False,
        "homepage_or_api_deployment_authorized": False,
        "next_state": (
            "Perform row-level qualitative review and package a research release candidate; "
            "do not deploy yet."
            if passed
            else "Reject v3.3 as a release candidate; preserve the negative result and diagnose sealed failures."
        ),
    }


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("x", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def write_json(path: Path, payload: Any) -> None:
    with path.open("x", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def main() -> None:
    args = parse_args()
    contract = args.contract.expanduser().resolve()
    if sha256(contract) != args.expected_contract_sha256:
        raise ValueError("sealed-test contract hash mismatch")
    materialization = read_json(args.materialization_manifest.expanduser().resolve())
    if materialization["input"]["sha256"] != args.expected_sealed_sha256:
        raise ValueError("materialization input hash differs from sealed contract")
    if int(materialization["input"]["rows"]) != args.expected_total_rows:
        raise ValueError("materialization total row count differs from sealed contract")

    sentence_payloads = {
        arm: load_predictions(
            getattr(args, f"{arm}_sentence").expanduser().resolve(), task="translate"
        )
        for arm in ARMS
    }
    sentence_rows = aligned_rows(sentence_payloads)
    expected_lexeme_rows = int(materialization["counts"]["task"].get("lexeme", 0))
    lexeme_paths = {arm: getattr(args, f"{arm}_lexeme") for arm in ARMS}
    if expected_lexeme_rows:
        if any(path is None for path in lexeme_paths.values()):
            raise ValueError(
                "lexeme predictions are required for a nonempty lexeme stratum"
            )
        lexeme_payloads = {
            arm: load_predictions(path.expanduser().resolve(), task="lexeme")
            for arm, path in lexeme_paths.items()
            if path is not None
        }
        lexeme_rows = aligned_rows(lexeme_payloads)
        lexeme: dict[str, Any] = {
            arm: lexical_metrics(lexeme_rows, arm) for arm in ARMS
        }
    else:
        if any(path is not None for path in lexeme_paths.values()):
            raise ValueError("lexeme predictions supplied for an empty lexeme stratum")
        lexeme_rows = []
        lexeme = {
            "status": "not_applicable",
            "rows": 0,
            "reason": "The checksum-bound sealed component split contains no lexeme rows.",
        }
    if len(sentence_rows) + len(lexeme_rows) != args.expected_total_rows:
        raise ValueError("task-separated row total differs from sealed contract")

    sentence = {arm: sentence_metrics(sentence_rows, arm) for arm in ARMS}
    bootstraps = {
        "candidate_vs_retention": paired_chrf_bootstrap(
            sentence_rows,
            control="retention",
            treatment="candidate",
            samples=args.bootstrap_samples,
            seed=args.bootstrap_seed,
        ),
        "candidate_vs_base": paired_chrf_bootstrap(
            sentence_rows,
            control="base",
            treatment="candidate",
            samples=args.bootstrap_samples,
            seed=args.bootstrap_seed + 1,
        ),
    }
    decision = sealed_decision(sentence, bootstraps)
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=f".{output_dir.name}.", dir=output_dir.parent
    ) as temporary_name:
        staging = Path(temporary_name)
        sentence_path = staging / "paired-sealed-sentences.jsonl"
        lexeme_path = staging / "paired-sealed-lexemes.jsonl"
        comparison_path = staging / "comparison.json"
        write_jsonl(sentence_path, sentence_rows)
        write_jsonl(lexeme_path, lexeme_rows)
        comparison = {
            "schema_version": 1,
            "analysis_kind": "migmaq-v3.3-one-shot-sealed-test",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "contract": {"path": str(contract), "sha256": sha256(contract)},
            "sealed_input": {
                "sha256": args.expected_sealed_sha256,
                "rows": args.expected_total_rows,
                "sentence_rows": len(sentence_rows),
                "lexeme_rows": len(lexeme_rows),
                "materialization_manifest": str(args.materialization_manifest),
                "materialization_manifest_sha256": sha256(
                    args.materialization_manifest.expanduser().resolve()
                ),
            },
            "evaluation_artifacts": {
                arm: {
                    "sentence": {
                        "path": str(getattr(args, f"{arm}_sentence")),
                        "sha256": sha256(
                            getattr(args, f"{arm}_sentence").expanduser().resolve()
                        ),
                    },
                    "lexeme": (
                        {
                            "path": str(lexeme_paths[arm]),
                            "sha256": sha256(lexeme_paths[arm].expanduser().resolve()),
                        }
                        if lexeme_paths[arm] is not None
                        else None
                    ),
                }
                for arm in ARMS
            },
            "sentence_metrics": sentence,
            "lexeme_diagnostics": lexeme,
            "paired_bootstrap": bootstraps,
            "decision": decision,
            "claim_limit": (
                "Independent Listuguj lesson-source test from one pedagogical repository. "
                "It is not a population-reliability estimate, speaker-diverse human review, "
                "or authorization for public free-form translation."
            ),
        }
        write_json(comparison_path, comparison)
        checksum_path = staging / "SHA256SUMS"
        with checksum_path.open("x", encoding="utf-8") as handle:
            for path in sorted((sentence_path, lexeme_path, comparison_path)):
                handle.write(f"{sha256(path)}  {path.name}\n")
        staging.rename(output_dir)

    print(json.dumps({"decision": decision, "sentence_metrics": sentence}, indent=2))


if __name__ == "__main__":
    main()

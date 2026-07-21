#!/usr/bin/env python3
"""Audit a frozen decoder transfer on the exact published v21.2 model.

This script compares sealed greedy and guarded-decoder prediction archives. It
does not run inference. The model hash, protocol hash, ordered inputs,
references, and decoding controls are verified before paired statistics are
computed.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any

from compare_v21_models import (
    DECODE_KEYS,
    EVALUATIONS,
    identity,
    load_prediction_document,
    paired_metrics,
    representative_examples,
    sha256,
)


GREEDY_DECODER = {
    "num_beams": 1,
    "no_repeat_ngram_size": 0,
    "repetition_penalty": 1.0,
    "length_penalty": 1.0,
}
GUARDED_DECODER = {
    "num_beams": 1,
    "no_repeat_ngram_size": 4,
    "repetition_penalty": 1.1,
    "length_penalty": 1.0,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--greedy-dir", type=Path, required=True)
    parser.add_argument("--guarded-dir", type=Path, required=True)
    parser.add_argument("--model-file", type=Path, required=True)
    parser.add_argument("--expected-model-sha256", required=True)
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--expected-protocol-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bootstrap-replicates", type=int, default=50_000)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def decoder(document: dict[str, Any]) -> dict[str, Any]:
    metrics = document.get("metrics")
    if not isinstance(metrics, dict):
        raise ValueError("prediction document has no metrics object")
    return {key: metrics.get(key) for key in DECODE_KEYS}


def main() -> int:
    args = parse_args()
    if args.bootstrap_replicates <= 0:
        raise SystemExit("bootstrap replicate count must be positive")

    model_file = args.model_file.resolve()
    protocol = args.protocol.resolve()
    observed_model_sha256 = sha256(model_file)
    observed_protocol_sha256 = sha256(protocol)
    if observed_model_sha256 != args.expected_model_sha256:
        raise SystemExit(
            f"model hash mismatch: {observed_model_sha256} != {args.expected_model_sha256}"
        )
    if observed_protocol_sha256 != args.expected_protocol_sha256:
        raise SystemExit(
            "protocol hash mismatch: "
            f"{observed_protocol_sha256} != {args.expected_protocol_sha256}"
        )

    greedy_dir = args.greedy_dir.resolve()
    guarded_dir = args.guarded_dir.resolve()
    evaluations: dict[str, Any] = {}
    for index, evaluation in enumerate(EVALUATIONS):
        greedy_path = greedy_dir / f"eval_{evaluation}_predictions_greedy.json"
        guarded_path = guarded_dir / f"eval_{evaluation}_predictions_locked.json"
        greedy_document = load_prediction_document(greedy_path)
        guarded_document = load_prediction_document(guarded_path)
        greedy_rows = greedy_document["predictions"]
        guarded_rows = guarded_document["predictions"]
        if [identity(row) for row in greedy_rows] != [identity(row) for row in guarded_rows]:
            raise SystemExit(f"ordered input/reference mismatch: {evaluation}")

        greedy_controls = decoder(greedy_document)
        guarded_controls = decoder(guarded_document)
        if greedy_controls != GREEDY_DECODER:
            raise SystemExit(
                f"unexpected greedy controls: {evaluation}: {greedy_controls}"
            )
        if guarded_controls != GUARDED_DECODER:
            raise SystemExit(
                f"unexpected guarded controls: {evaluation}: {guarded_controls}"
            )

        metrics, paired_rows = paired_metrics(
            greedy_rows,
            guarded_rows,
            args.bootstrap_replicates,
            args.seed + index,
        )
        evaluations[evaluation] = {
            "greedy_path": str(greedy_path),
            "guarded_path": str(guarded_path),
            "greedy_sha256": sha256(greedy_path),
            "guarded_sha256": sha256(guarded_path),
            "ordered_inputs_and_references_match": True,
            "greedy_decoder": greedy_controls,
            "guarded_decoder": guarded_controls,
            "metrics": metrics,
            "representative_examples": representative_examples(paired_rows),
        }

    output = {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "estimand": "guarded decoding minus greedy decoding on the same exact v21.2 model",
        "artifact_checks": {
            "model_file": str(model_file),
            "model_sha256": observed_model_sha256,
            "model_sha256_matches_expected": True,
            "protocol": str(protocol),
            "protocol_sha256": observed_protocol_sha256,
            "protocol_sha256_matches_expected": True,
            "all_ordered_inputs_and_references_match": True,
            "all_decoding_signatures_match_frozen_conditions": True,
        },
        "evaluations": evaluations,
        "method": {
            "metric": "sacrebleu 2.x chrF++ (word_order=2), corpus BLEU, and whitespace-normalized exact match",
            "paired_primary_estimand": "mean per-sentence chrF++ difference (guarded minus greedy)",
            "paired_bootstrap": "Nonparametric paired row bootstrap with percentile 95% confidence interval.",
            "sign_test": "Exact two-sided Binomial(n, 0.5) test after removing sentence-chrF ties.",
            "mcnemar": "Exact two-sided binomial test over discordant exact-match outcomes.",
            "multiple_comparisons": "Evaluation-level intervals and p-values are descriptive and unadjusted.",
            "causal_scope": "The only intended intervention is decoding; model weights and ordered evaluation rows are identical.",
            "inference": "No inference was rerun; sealed prediction archives are the evaluated observations.",
        },
        "interpretation": (
            "This audit measures a decoding-policy change on v21.2. It cannot be cited "
            "as evidence for a new or retrained model, nor as speaker certification."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(output["artifact_checks"], indent=2))
    for evaluation, record in evaluations.items():
        delta = record["metrics"]["delta_b_minus_a"]
        interval = record["metrics"]["paired_sentence_chrf"]["ci95"]
        print(
            f"{evaluation}: corpus chrF delta={delta['corpus_chrf']:+.3f}; "
            f"mean sentence chrF delta={delta['mean_sentence_chrf']:+.3f}; "
            f"paired 95% CI=[{interval[0]:+.3f}, {interval[1]:+.3f}]"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Score and select a v24 lexical treatment from development-suite predictions."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import random
import re
import statistics
import tempfile
import unicodedata
from typing import Any


TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", re.UNICODE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--baseline-label", default="B0")
    parser.add_argument("--control-label", default="C0")
    parser.add_argument("--lexical-endpoint", default="lexicon_closed_set")
    parser.add_argument("--retention-endpoint", action="append", required=True)
    parser.add_argument("--minimum-exact-gain-over-control", type=int, default=10)
    parser.add_argument("--chrf-noninferiority-margin", type=float, default=1.0)
    parser.add_argument("--bootstrap-samples", type=int, default=10_000)
    parser.add_argument("--seed", default="v24-screen-2026-07-15")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).casefold().split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def labeled_paths(values: list[str]) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for value in values:
        label, separator, raw_path = value.partition("=")
        label = label.strip()
        path = Path(raw_path).expanduser().resolve()
        if not separator or not label or not raw_path.strip():
            raise ValueError(f"invalid candidate {value!r}; expected LABEL=PATH")
        if label in paths:
            raise ValueError(f"duplicate candidate label: {label}")
        if not path.is_file():
            raise FileNotFoundError(path)
        paths[label] = path
    return paths


def load_predictions(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("predictions")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"missing predictions: {path}")
    return rows


def row_identity(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        str(row.get("id") or ""),
        str(row.get("v24_endpoint") or ""),
        normalize(row.get("input_text")),
        normalize(row.get("output_text") or row.get("reference")),
        tuple(normalize(value) for value in row.get("accepted_references") or []),
    )


def wilson(successes: int, total: int, z: float = 1.959963984540054) -> dict[str, float]:
    if total <= 0:
        return {"low": 0.0, "high": 0.0}
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    distance = (
        z
        * math.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total))
        / denominator
    )
    return {"low": center - distance, "high": center + distance}


def repeated_segment_count(text: str) -> int:
    segments = [normalize(token) for token in TOKEN_RE.findall(text)]
    return max(Counter(segments).values(), default=0)


def lexical_metrics(rows: list[dict[str, Any]]) -> tuple[dict[str, Any], list[float]]:
    exact_vector: list[float] = []
    contains_vector: list[float] = []
    seen_vector: list[bool] = []
    for row in rows:
        prediction = normalize(row.get("prediction"))
        references = [normalize(value) for value in row.get("accepted_references") or []]
        if not references:
            raise ValueError(f"lexical row has no accepted references: {row.get('id')}")
        prediction_tokens = {normalize(token) for token in TOKEN_RE.findall(prediction)}
        exact_vector.append(float(prediction in references))
        contains_vector.append(float(bool(prediction_tokens.intersection(references))))
        seen_vector.append(bool(row.get("target_seen_as_training_token")))
    exact_count = int(sum(exact_vector))

    def stratum(selector: list[bool]) -> dict[str, Any]:
        values = [value for value, selected in zip(exact_vector, selector, strict=True) if selected]
        return {
            "rows": len(values),
            "exact_count": int(sum(values)),
            "exact_percent": 100 * statistics.fmean(values) if values else 0.0,
        }

    return (
        {
            "rows": len(rows),
            "normalized_exact_count": exact_count,
            "normalized_exact_percent": 100 * statistics.fmean(exact_vector),
            "wilson_95": wilson(exact_count, len(rows)),
            "token_contains_accepted_percent": 100 * statistics.fmean(contains_vector),
            "empty_outputs": sum(not normalize(row.get("prediction")) for row in rows),
            "source_copy_outputs": sum(
                normalize(row.get("prediction"))
                == normalize(row.get("unconditioned_input_text") or row.get("input_text"))
                for row in rows
            ),
            "strata": {
                "target_seen_in_documented_v21_2": stratum(seen_vector),
                "target_not_seen_in_documented_v21_2": stratum([not value for value in seen_vector]),
            },
            "interpretation": (
                "Closed-set governed reconstruction. Wilson bounds are a conservative frozen-benchmark "
                "description, not a future-query population reliability interval."
            ),
        },
        exact_vector,
    )


def sentence_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    import sacrebleu

    predictions = [normalize(row.get("prediction")) for row in rows]
    references = [normalize(row.get("reference") or row.get("output_text")) for row in rows]
    sentence_chrf = [
        sacrebleu.sentence_chrf(prediction, [reference], word_order=2).score
        for prediction, reference in zip(predictions, references, strict=True)
    ]
    token_ratios = [
        len(prediction.split()) / max(1, len(reference.split()))
        for prediction, reference in zip(predictions, references, strict=True)
    ]
    return {
        "rows": len(rows),
        "corpus_chrf": sacrebleu.corpus_chrf(predictions, [references], word_order=2).score,
        "mean_sentence_chrf": statistics.fmean(sentence_chrf),
        "exact_count": sum(prediction == reference for prediction, reference in zip(predictions, references)),
        "empty_outputs": sum(not prediction for prediction in predictions),
        "source_copy_outputs": sum(
            prediction == normalize(row.get("unconditioned_input_text") or row.get("input_text"))
            for prediction, row in zip(predictions, rows, strict=True)
        ),
        "repeated_segment_rows_at_least_10": sum(
            repeated_segment_count(prediction) >= 10 for prediction in predictions
        ),
        "underlength_rows_below_0_5": sum(ratio < 0.5 for ratio in token_ratios),
        "mean_token_length_ratio": statistics.fmean(token_ratios),
    }


def analyze_model(rows: list[dict[str, Any]], lexical_endpoint: str) -> tuple[dict[str, Any], list[float]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        endpoint = str(row.get("v24_endpoint") or "")
        if not endpoint:
            raise ValueError(f"prediction lacks v24_endpoint: {row.get('id')}")
        grouped[endpoint].append(row)
    if lexical_endpoint not in grouped:
        raise ValueError(f"lexical endpoint is absent: {lexical_endpoint}")
    lexical, exact_vector = lexical_metrics(grouped.pop(lexical_endpoint))
    return {
        "lexical": lexical,
        "sentence_endpoints": {
            endpoint: sentence_metrics(endpoint_rows)
            for endpoint, endpoint_rows in sorted(grouped.items())
        },
    }, exact_vector


def bootstrap_exact_difference(
    left: list[float], right: list[float], samples: int, seed: str
) -> dict[str, float]:
    if len(left) != len(right):
        raise ValueError("paired vectors differ in length")
    rng = random.Random(hashlib.sha256(seed.encode()).digest())
    differences = [left_value - right_value for left_value, right_value in zip(left, right, strict=True)]
    estimates = []
    for _ in range(samples):
        estimates.append(100 * statistics.fmean(rng.choice(differences) for _ in differences))
    estimates.sort()
    return {
        "percentage_points": 100 * statistics.fmean(differences),
        "descriptive_row_bootstrap_95_low": estimates[math.floor(0.025 * (samples - 1))],
        "descriptive_row_bootstrap_95_high": estimates[math.ceil(0.975 * (samples - 1))],
    }


def dose(label: str) -> int:
    match = re.fullmatch(r"L(\d+)", label)
    return int(match.group(1)) if match else 1_000_000


def select(
    models: dict[str, dict[str, Any]],
    exact_vectors: dict[str, list[float]],
    *,
    baseline_label: str,
    control_label: str,
    retention_endpoints: list[str],
    minimum_gain: int,
    margin: float,
    bootstrap_samples: int,
    seed: str,
) -> dict[str, Any]:
    if baseline_label not in models or control_label not in models:
        raise ValueError("baseline or retention-only control is absent")
    baseline = models[baseline_label]
    control = models[control_label]
    required_endpoints = set(retention_endpoints)
    for label, model in models.items():
        missing = required_endpoints - set(model["sentence_endpoints"])
        if missing:
            raise ValueError(f"{label} lacks retention endpoints: {sorted(missing)}")

    control_exact = int(control["lexical"]["normalized_exact_count"])
    assessments: dict[str, Any] = {}
    for label, model in models.items():
        if label in {baseline_label, control_label}:
            continue
        checks: dict[str, bool] = {
            "lexical_exact_gain_over_control": (
                int(model["lexical"]["normalized_exact_count"]) - control_exact >= minimum_gain
            ),
            "all_outputs_nonempty": model["lexical"]["empty_outputs"] == 0,
        }
        retention_deltas: dict[str, float] = {}
        for endpoint in retention_endpoints:
            metric = model["sentence_endpoints"][endpoint]
            stronger_control = max(
                baseline["sentence_endpoints"][endpoint]["corpus_chrf"],
                control["sentence_endpoints"][endpoint]["corpus_chrf"],
            )
            retention_deltas[endpoint] = metric["corpus_chrf"] - stronger_control
            checks[f"{endpoint}_chrf_noninferior"] = retention_deltas[endpoint] >= -margin
            checks[f"{endpoint}_empty_zero"] = metric["empty_outputs"] == 0
            control_loops = max(
                baseline["sentence_endpoints"][endpoint]["repeated_segment_rows_at_least_10"],
                control["sentence_endpoints"][endpoint]["repeated_segment_rows_at_least_10"],
            )
            checks[f"{endpoint}_loops_not_increased"] = (
                metric["repeated_segment_rows_at_least_10"] <= control_loops
            )
        assessments[label] = {
            "eligible": all(checks.values()),
            "checks": checks,
            "lexical_exact_gain_over_control": (
                int(model["lexical"]["normalized_exact_count"]) - control_exact
            ),
            "lexical_exact_paired_difference": bootstrap_exact_difference(
                exact_vectors[label],
                exact_vectors[control_label],
                bootstrap_samples,
                f"{seed}:{label}:{control_label}",
            ),
            "retention_chrf_delta_from_stronger_control": retention_deltas,
            "minimum_retention_chrf_delta": min(retention_deltas.values()),
            "mean_retention_chrf_delta": statistics.fmean(retention_deltas.values()),
            "dose": dose(label),
        }

    eligible = [label for label, assessment in assessments.items() if assessment["eligible"]]
    selected_label = max(
        eligible,
        key=lambda label: (
            models[label]["lexical"]["normalized_exact_count"],
            assessments[label]["minimum_retention_chrf_delta"],
            assessments[label]["mean_retention_chrf_delta"],
            -assessments[label]["dose"],
        ),
        default=None,
    )
    return {
        "status": "ADVANCE" if selected_label else "NO_ADVANCE",
        "selected_label": selected_label,
        "assessments": assessments,
        "selection_order": [
            "all hard checks pass",
            "highest closed-set lexical exact count",
            "best worst-case retention chrF++ delta",
            "best mean retention chrF++ delta",
            "lowest lexical dose",
        ],
    }


def write_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, indent=2, ensure_ascii=False, sort_keys=True)
        handle.write("\n")
    try:
        temporary.replace(path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def main() -> None:
    args = parse_args()
    if args.minimum_exact_gain_over_control < 1:
        raise SystemExit("minimum exact gain must be positive")
    if args.chrf_noninferiority_margin < 0:
        raise SystemExit("chrF++ margin cannot be negative")
    paths = labeled_paths(args.candidate)
    rows_by_label = {label: load_predictions(path) for label, path in paths.items()}
    expected = None
    for label, rows in rows_by_label.items():
        identities = [row_identity(row) for row in rows]
        if len(identities) != len(set(identities)):
            raise ValueError(f"duplicate row identity in {label}")
        if expected is None:
            expected = identities
        elif identities != expected:
            raise ValueError(f"prediction rows are not aligned for {label}")
    models: dict[str, Any] = {}
    exact_vectors: dict[str, list[float]] = {}
    for label, rows in rows_by_label.items():
        models[label], exact_vectors[label] = analyze_model(rows, args.lexical_endpoint)
        models[label]["prediction_file"] = str(paths[label])
        models[label]["prediction_sha256"] = sha256(paths[label])
    decision = select(
        models,
        exact_vectors,
        baseline_label=args.baseline_label,
        control_label=args.control_label,
        retention_endpoints=args.retention_endpoint,
        minimum_gain=args.minimum_exact_gain_over_control,
        margin=args.chrf_noninferiority_margin,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
    )
    output = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stage": "one-seed-development-only-screen",
        "baseline_label": args.baseline_label,
        "control_label": args.control_label,
        "lexical_endpoint": args.lexical_endpoint,
        "retention_endpoints": args.retention_endpoint,
        "thresholds": {
            "minimum_exact_gain_over_control": args.minimum_exact_gain_over_control,
            "chrf_noninferiority_margin": args.chrf_noninferiority_margin,
            "blank_outputs": 0,
            "repeated_segment_rows": "must not exceed stronger of B0 and C0",
        },
        "bootstrap": {
            "samples": args.bootstrap_samples,
            "seed": args.seed,
            "unit": "row",
            "interpretation": "descriptive paired benchmark interval; rows are not a sampled query population",
        },
        "models": models,
        "decision": decision,
        "promotion_effect": "none; ADVANCE only authorizes the next research stage",
    }
    write_atomic(args.output, output)
    print(json.dumps(decision, indent=2))


if __name__ == "__main__":
    main()

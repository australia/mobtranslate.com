#!/usr/bin/env python3
"""Verify and compare the Mi'kmaq v3.2 natural-lessons screen artifacts."""

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


ARMS = ("base", "retention", "lessons20", "lessons40")
CANDIDATES = ("lessons20", "lessons40")
SENTENCE_ENDPOINTS = (
    "existing-validation",
    "existing-opened-regression",
    "lesson-validation-sentences",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    for arm in ARMS:
        parser.add_argument(f"--{arm}-run", type=Path, required=True)
    parser.add_argument("--dataset-manifest", type=Path, required=True)
    parser.add_argument("--expected-dataset-manifest-sha256", required=True)
    parser.add_argument("--expected-contract-sha256", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--bootstrap-samples", type=int, default=2000)
    parser.add_argument("--bootstrap-seed", type=int, default=20260721)
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
        raise ValueError(f"expected JSON object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"non-object at {path}:{line_number}")
            rows.append(value)
    return rows


def verify_checksum_manifest(run_dir: Path) -> dict[str, Any]:
    manifest = run_dir / "RUN-SHA256SUMS"
    if not manifest.is_file():
        raise FileNotFoundError(manifest)
    files = 0
    for line_number, line in enumerate(manifest.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            expected, relative = line.split("  ", 1)
        except ValueError as error:
            raise ValueError(f"invalid checksum line {manifest}:{line_number}") from error
        relative = relative.removeprefix("./")
        path = run_dir / relative
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"checksum failure: {path}")
        files += 1
    return {"path": str(manifest), "sha256": sha256(manifest), "verified_files": files}


def normalize(value: Any) -> str:
    return " ".join(str(value or "").casefold().split())


def sentence_diagnostics(payload: dict[str, Any]) -> dict[str, Any]:
    metrics = dict(payload["metrics"])
    rows = payload["predictions"]
    if len(rows) != metrics["rows"]:
        raise ValueError("sentence prediction count differs from metric count")
    predictions = [normalize(row.get("prediction")) for row in rows]
    references = [normalize(row.get("reference") or row.get("output_text")) for row in rows]
    sources = [normalize(row.get("input_text")) for row in rows]
    ratios = [len(prediction) / max(1, len(reference)) for prediction, reference in zip(predictions, references, strict=True)]
    frequencies = Counter(predictions)
    metrics.update(
        {
            "unique_normalized_outputs": len(frequencies),
            "maximum_normalized_output_frequency": max(frequencies.values(), default=0),
            "severe_undertranslation_rows": sum(ratio < 0.60 for ratio in ratios),
            "severe_overtranslation_rows": sum(ratio > 1.50 for ratio in ratios),
            "mean_prediction_reference_character_ratio": statistics.mean(ratios) if ratios else None,
            "median_prediction_reference_character_ratio": statistics.median(ratios) if ratios else None,
            "normalized_exact_rows": sum(
                prediction == reference for prediction, reference in zip(predictions, references, strict=True)
            ),
            "normalized_source_copy_rows": sum(
                prediction == source for prediction, source in zip(predictions, sources, strict=True)
            ),
        }
    )
    return metrics


def aligned_sentence_rows(payloads: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    indexed: dict[str, dict[str, dict[str, Any]]] = {}
    for arm, payload in payloads.items():
        by_id = {str(row["id"]): row for row in payload["predictions"]}
        if len(by_id) != len(payload["predictions"]):
            raise ValueError(f"duplicate sentence IDs for {arm}")
        indexed[arm] = by_id
    ids = list(indexed["base"])
    if any(set(indexed[arm]) != set(ids) for arm in ARMS):
        raise ValueError("sentence evaluation row IDs differ across arms")
    result = []
    for row_id in ids:
        base = indexed["base"][row_id]
        result.append(
            {
                "id": row_id,
                "input_text": base["input_text"],
                "reference": base.get("reference") or base["output_text"],
                "predictions": {arm: indexed[arm][row_id]["prediction"] for arm in ARMS},
            }
        )
    return result


def percentile(values: Sequence[float], fraction: float) -> float:
    if not values:
        raise ValueError("cannot take a percentile of an empty sequence")
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def paired_chrf_bootstrap(
    rows: Sequence[dict[str, Any]],
    candidate: str,
    *,
    samples: int,
    seed: int,
) -> dict[str, Any]:
    if samples < 1 or not rows:
        raise ValueError("bootstrap requires rows and a positive sample count")
    from sacrebleu.metrics import CHRF

    metric = CHRF(word_order=2)
    references = [str(row["reference"]) for row in rows]
    retention = [str(row["predictions"]["retention"]) for row in rows]
    treatment = [str(row["predictions"][candidate]) for row in rows]
    observed = metric.corpus_score(treatment, [references]).score - metric.corpus_score(
        retention, [references]
    ).score
    rng = random.Random(seed)
    deltas: list[float] = []
    for _ in range(samples):
        indices = [rng.randrange(len(rows)) for _ in rows]
        sampled_references = [references[index] for index in indices]
        sampled_retention = [retention[index] for index in indices]
        sampled_treatment = [treatment[index] for index in indices]
        deltas.append(
            metric.corpus_score(sampled_treatment, [sampled_references]).score
            - metric.corpus_score(sampled_retention, [sampled_references]).score
        )
    return {
        "observed_chrf_delta": observed,
        "percentile_90_interval": {"low": percentile(deltas, 0.05), "high": percentile(deltas, 0.95)},
        "bootstrap_probability_delta_above_zero": sum(value > 0 for value in deltas) / samples,
        "samples": samples,
        "seed": seed,
        "interpretation": "Paired row bootstrap over this development set; descriptive, not a population claim.",
    }


def learning_rate_trajectory(model_manifest: dict[str, Any]) -> list[tuple[int, float]]:
    return [
        (int(row["step"]), float(row["learning_rate"]))
        for row in model_manifest["trainer_state"]["log_history"]
        if "step" in row and "learning_rate" in row
    ]


def candidate_decision(
    metrics: dict[str, dict[str, dict[str, Any]]],
    bootstraps: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    decisions: dict[str, Any] = {}
    for arm in CANDIDATES:
        conditions: dict[str, dict[str, Any]] = {}
        for endpoint in SENTENCE_ENDPOINTS:
            observed = metrics[arm][endpoint]
            conditions[f"{endpoint}_zero_blanks"] = {
                "observed": observed["empty_outputs"],
                "required": 0,
                "pass": observed["empty_outputs"] == 0,
            }
        for endpoint in ("existing-validation", "existing-opened-regression"):
            observed = metrics[arm][endpoint]
            control = metrics["retention"][endpoint]
            chrf_delta = observed["chrf"] - control["chrf"]
            under_rate = observed["severe_undertranslation_rows"] / observed["rows"]
            control_under_rate = control["severe_undertranslation_rows"] / control["rows"]
            conditions[f"{endpoint}_chrf_noninferiority"] = {
                "observed": chrf_delta,
                "required": -0.25,
                "pass": chrf_delta >= -0.25,
            }
            conditions[f"{endpoint}_undertranslation_noninferiority"] = {
                "observed": under_rate - control_under_rate,
                "required": 0.05,
                "pass": under_rate - control_under_rate <= 0.05,
            }
        lesson = metrics[arm]["lesson-validation-sentences"]
        lesson_floor = max(
            metrics["base"]["lesson-validation-sentences"]["chrf"],
            metrics["retention"]["lesson-validation-sentences"]["chrf"],
        ) + 1.0
        conditions["lesson_validation_chrf_improvement"] = {
            "observed": lesson["chrf"],
            "required": lesson_floor,
            "pass": lesson["chrf"] >= lesson_floor,
        }
        bootstrap_low = bootstraps[arm]["percentile_90_interval"]["low"]
        conditions["lesson_validation_bootstrap_direction"] = {
            "observed": bootstrap_low,
            "required": 0.0,
            "pass": bootstrap_low > 0.0,
        }
        decisions[arm] = {"conditions": conditions, "passed": all(item["pass"] for item in conditions.values())}

    eligible = [arm for arm in CANDIDATES if decisions[arm]["passed"]]
    selected = max(
        eligible,
        key=lambda arm: (
            metrics[arm]["lesson-validation-sentences"]["chrf"],
            (
                metrics[arm]["existing-validation"]["chrf"]
                + metrics[arm]["existing-opened-regression"]["chrf"]
            )
            / 2,
            -float(arm.removeprefix("lessons")),
        ),
        default=None,
    )
    return {
        "candidates": decisions,
        "selected_recipe": selected,
        "continue_to_multiseed_confirmation": selected is not None,
        "publication_or_deployment_authorized": False,
        "selection_rule": (
            "Among arms passing every gate, maximize lesson-validation chrF++, then mean existing-domain "
            "chrF++, then choose the lower lesson dose."
        ),
    }


def lexical_summary(run_dir: Path, label: str) -> dict[str, Any]:
    report = read_json(run_dir / "evaluations" / label / "metric-report.json")
    return {
        "rows": report["rows"],
        "accepted_exact_count": report["accepted_exact_count"],
        "accepted_exact_percent": report["accepted_exact_percent"],
        "empty_outputs": report["empty_outputs"],
        "source_copy_outputs": report["source_copy_outputs"],
        "mean_grapheme_cer": report["grapheme_cer"]["mean"],
        "unique_normalized_outputs": report["unique_normalized_outputs"],
        "maximum_normalized_output_frequency": report["maximum_normalized_output_frequency"],
    }


def lexical_transitions(run_dirs: dict[str, Path]) -> dict[str, Any]:
    indexed: dict[str, dict[str, dict[str, Any]]] = {}
    for arm, run_dir in run_dirs.items():
        rows = read_jsonl(run_dir / "evaluations" / "lexical-all-plain" / "predictions.jsonl")
        indexed[arm] = {str(row["id"]): row for row in rows}
    ids = set(indexed["retention"])
    if any(set(indexed[arm]) != ids for arm in ARMS):
        raise ValueError("lexical row IDs differ across arms")
    result: dict[str, Any] = {}
    for arm in CANDIDATES:
        transitions = Counter()
        improved = tied = worsened = 0
        for row_id in ids:
            control = indexed["retention"][row_id]
            candidate = indexed[arm][row_id]
            control_exact = bool(control["accepted_exact"])
            candidate_exact = bool(candidate["accepted_exact"])
            transitions[
                ("exact" if control_exact else "failure")
                + "_to_"
                + ("exact" if candidate_exact else "failure")
            ] += 1
            control_cer = float(control["grapheme_cer"])
            candidate_cer = float(candidate["grapheme_cer"])
            if candidate_cer < control_cer:
                improved += 1
            elif candidate_cer > control_cer:
                worsened += 1
            else:
                tied += 1
        result[arm] = {
            "exact_transitions": dict(sorted(transitions.items())),
            "cer_improved_rows": improved,
            "cer_tied_rows": tied,
            "cer_worsened_rows": worsened,
        }
    return result


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    run_dirs = {
        arm: getattr(args, f"{arm}_run").expanduser().resolve() for arm in ARMS
    }
    dataset_manifest_path = args.dataset_manifest.expanduser().resolve()
    if sha256(dataset_manifest_path) != args.expected_dataset_manifest_sha256:
        raise ValueError("dataset manifest hash mismatch")
    dataset = read_json(dataset_manifest_path)

    checksum_audits: dict[str, Any] = {}
    run_manifests: dict[str, dict[str, Any]] = {}
    model_manifests: dict[str, dict[str, Any]] = {}
    for arm, run_dir in run_dirs.items():
        checksum_audits[arm] = verify_checksum_manifest(run_dir)
        if sha256(run_dir / "input-experiment-contract.json") != args.expected_contract_sha256:
            raise ValueError(f"experiment contract differs for {arm}")
        run_manifest = read_json(run_dir / "run-manifest.json")
        if run_manifest["arm"] != arm:
            raise ValueError(f"run arm mismatch for {arm}")
        if run_manifest["dataset_manifest_sha256"] != args.expected_dataset_manifest_sha256:
            raise ValueError(f"dataset identity mismatch for {arm}")
        run_manifests[arm] = run_manifest
        if arm != "base":
            model_manifest = read_json(run_dir / "model" / "model_manifest.json")
            expected = dataset["token_accounting"]["schedule_audit"]["arms"][arm]
            exposure = model_manifest["trainer_state"]["actual_training_exposure"]
            for key in ("examples", "source_tokens", "target_tokens", "non_padding_tokens"):
                if exposure[key] != expected[key]:
                    raise ValueError(f"{arm} {key} exposure mismatch")
            if model_manifest["training_args"]["modules_to_save"]:
                raise ValueError(f"{arm} is not LoRA-only")
            model_manifests[arm] = model_manifest
    trajectories = {arm: learning_rate_trajectory(model_manifests[arm]) for arm in model_manifests}
    if len({json.dumps(value) for value in trajectories.values()}) != 1:
        raise ValueError("learning-rate trajectories differ across trained arms")
    if len({run_manifests[arm]["decoder"].__repr__() for arm in ARMS}) != 1:
        raise ValueError("decoder policy differs across arms")

    sentence_payloads: dict[str, dict[str, dict[str, Any]]] = {arm: {} for arm in ARMS}
    sentence_metrics: dict[str, dict[str, dict[str, Any]]] = {arm: {} for arm in ARMS}
    paired_ledgers: dict[str, list[dict[str, Any]]] = {}
    for endpoint in SENTENCE_ENDPOINTS:
        endpoint_payloads = {
            arm: read_json(run_dirs[arm] / "evaluations" / f"{endpoint}.json") for arm in ARMS
        }
        for arm, payload in endpoint_payloads.items():
            sentence_payloads[arm][endpoint] = payload
            sentence_metrics[arm][endpoint] = sentence_diagnostics(payload)
        paired_ledgers[endpoint] = aligned_sentence_rows(endpoint_payloads)

    bootstraps = {
        arm: paired_chrf_bootstrap(
            paired_ledgers["lesson-validation-sentences"],
            arm,
            samples=args.bootstrap_samples,
            seed=args.bootstrap_seed + index,
        )
        for index, arm in enumerate(CANDIDATES)
    }
    decision = candidate_decision(sentence_metrics, bootstraps)
    lexical = {
        "full_plain_census": {
            arm: lexical_summary(run_dirs[arm], "lexical-all-plain") for arm in ARMS
        },
        "lesson_validation_plain_lexemes": {
            arm: lexical_summary(run_dirs[arm], "lesson-validation-lexemes-plain") for arm in ARMS
        },
        "paired_vs_retention": lexical_transitions(run_dirs),
        "claim_limit": (
            "Plain-word reconstruction is an exhaustive diagnostic. It is not a sentence gate and "
            "known dictionary queries remain deterministic lookup."
        ),
    }
    report = {
        "schema_version": 1,
        "analysis_kind": "migmaq_v3_2_natural_lessons_screen",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_manifest": {
            "path": str(dataset_manifest_path),
            "sha256": args.expected_dataset_manifest_sha256,
        },
        "checksum_audits": checksum_audits,
        "run_manifests": run_manifests,
        "training_audit": {
            "learning_rate_trajectories_identical": True,
            "trajectory": next(iter(trajectories.values())),
            "token_accounting": dataset["token_accounting"]["schedule_audit"],
            "adapter_topology": "LoRA rank 32 over attention/feed-forward projections; no full modules saved",
        },
        "sentence_metrics": sentence_metrics,
        "lesson_validation_paired_bootstrap": bootstraps,
        "lexical_diagnostics": lexical,
        "decision": decision,
        "claim_limit": (
            "Single-seed development screen. A selected arm advances only to multi-seed confirmation; "
            "the sealed lesson test remains unopened."
        ),
    }
    output = args.output_dir.expanduser().resolve()
    if output.exists():
        raise FileExistsError(output)
    output.mkdir(parents=True)
    write_json_atomic(output / "comparison.json", report)
    for endpoint, rows in paired_ledgers.items():
        write_jsonl_atomic(output / f"paired-{endpoint}.jsonl", rows)
    files = sorted(path for path in output.iterdir() if path.is_file())
    (output / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files), encoding="utf-8"
    )
    print(json.dumps({"decision": decision, "sentence_metrics": sentence_metrics, "lexical": lexical}, indent=2))


if __name__ == "__main__":
    main()

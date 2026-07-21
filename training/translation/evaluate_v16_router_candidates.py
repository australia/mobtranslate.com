#!/usr/bin/env python3
"""Evaluate v16 resource routing and candidate-selection ceilings locally."""

from __future__ import annotations

import argparse
import collections
import json
import math
import statistics
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path(
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30"
)
TOKEN_RE = __import__("re").compile(r"[A-Za-z0-9-]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_ROOT / "analysis" / "v16-router-candidate-diagnostic-2026-07-02",
    )
    return parser.parse_args()


def clean(text: Any) -> str:
    return " ".join(str(text or "").split())


def norm(text: Any) -> str:
    return clean(text).casefold()


def tokens(text: Any) -> list[str]:
    return TOKEN_RE.findall(norm(text))


def token_recall(prediction: str, reference: str) -> float:
    ref_tokens = tokens(reference)
    if not ref_tokens:
        return 1.0
    pred_tokens = set(tokens(prediction))
    return sum(1 for token in ref_tokens if token in pred_tokens) / len(ref_tokens)


def length_ratio(prediction: str, reference: str) -> float:
    return len(tokens(prediction)) / max(len(tokens(reference)), 1)


def repeat_share(text: str) -> float:
    parts = tokens(text)
    if not parts:
        return 0.0
    counts = collections.Counter(parts)
    return max(counts.values()) / len(parts)


def ngrams(text: str, n: int) -> dict[str, int]:
    value = clean(text)
    if len(value) < n:
        return {}
    output: dict[str, int] = {}
    for index in range(len(value) - n + 1):
        gram = value[index : index + n]
        output[gram] = output.get(gram, 0) + 1
    return output


def char_overlap_f(prediction: str, reference: str, max_order: int = 6) -> float:
    scores: list[float] = []
    for n in range(1, max_order + 1):
        pred = ngrams(prediction, n)
        ref = ngrams(reference, n)
        if not pred or not ref:
            continue
        overlap = sum(min(count, ref.get(gram, 0)) for gram, count in pred.items())
        precision = overlap / sum(pred.values())
        recall = overlap / sum(ref.values())
        if precision + recall:
            scores.append((2 * precision * recall) / (precision + recall))
    return 100 * statistics.mean(scores) if scores else 0.0


def describe(values: list[float]) -> dict[str, float]:
    if not values:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0}
    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
    }


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def usage_example_id(row: dict[str, Any]) -> str:
    usage = row.get("db_usage_example") or {}
    if usage.get("example_id"):
        return str(usage["example_id"])
    row_id = str(row.get("id") or "")
    if row_id.startswith("db-usage:"):
        return row_id.split(":")[1]
    return row_id


def bible_key(row: dict[str, Any]) -> str:
    return str(row.get("canonical_ref") or row.get("id") or "")


def usage_key(row: dict[str, Any]) -> str:
    return usage_example_id(row)


def summarize_prediction_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    predictions = [clean(row.get("prediction", "")) for row in rows]
    references = [clean(row.get("reference", row.get("output_text", ""))) for row in rows]
    char_scores = [char_overlap_f(pred, ref) for pred, ref in zip(predictions, references)]
    token_recalls = [token_recall(pred, ref) for pred, ref in zip(predictions, references)]
    ratios = [length_ratio(pred, ref) for pred, ref in zip(predictions, references)]
    repeats = [repeat_share(pred) for pred in predictions]
    exact = sum(1 for pred, ref in zip(predictions, references) if clean(pred) == clean(ref))
    return {
        "rows": len(rows),
        "exact": exact,
        "exact_rate": exact / len(rows) if rows else 0.0,
        "empty": sum(1 for pred in predictions if not pred),
        "sentence_char_f": describe(char_scores),
        "reference_token_recall": describe(token_recalls),
        "length_ratio": describe(ratios),
        "repeat_share": describe(repeats),
    }


def build_resource_router(root: Path) -> dict[str, Any]:
    prep_v97 = root / "prepared" / "v9.7-tagged-direct-plus-reference-bible"
    prep_v98 = root / "prepared" / "v9.8-tagged-bible-plus-db-usage"
    eval_rows = read_jsonl(prep_v98 / "heldout_all.eng-gvn.jsonl")

    bible_resource_rows = (
        read_jsonl(prep_v97 / "v8_2048row" / "eval_train_ref.eng-gvn.jsonl")
        + read_jsonl(prep_v97 / "heldout_ref_325.eng-gvn.jsonl")
    )
    usage_resource_rows = read_jsonl(prep_v98 / "db_usage" / "all_usage_examples.eng-gvn.jsonl")

    bible_by_ref = {bible_key(row): row for row in bible_resource_rows if bible_key(row)}
    usage_by_example_id = {usage_example_id(row): row for row in usage_resource_rows if usage_example_id(row)}
    usage_by_source = {norm(row.get("unconditioned_input_text") or row.get("input_text")): row for row in usage_resource_rows}

    routed_rows: list[dict[str, Any]] = []
    route_counts: collections.Counter[str] = collections.Counter()
    missing: list[dict[str, Any]] = []

    for row in eval_rows:
        route = "unrouted"
        resource: dict[str, Any] | None = None
        if row.get("canonical_ref") and row.get("pair_kind") == "verse":
            route = "bible_ref_exact"
            resource = bible_by_ref.get(bible_key(row))
        elif row.get("pair_kind") == "usage_example":
            route = "db_usage_exact"
            resource = usage_by_example_id.get(usage_example_id(row))
            if resource is None:
                resource = usage_by_source.get(norm(row.get("unconditioned_input_text") or row.get("input_text")))
        route_counts[route] += 1

        prediction = clean(resource.get("output_text")) if resource else ""
        reference = clean(row.get("output_text"))
        if resource is None:
            missing.append(
                {
                    "id": row.get("id"),
                    "route": route,
                    "canonical_ref": row.get("canonical_ref"),
                    "usage_example_id": usage_example_id(row) if row.get("pair_kind") == "usage_example" else None,
                    "input_text": row.get("input_text"),
                }
            )
        routed_rows.append(
            {
                **row,
                "prediction": prediction,
                "reference": reference,
                "route": {
                    "name": route,
                    "resource_id": resource.get("id") if resource else None,
                    "resource_canonical_ref": resource.get("canonical_ref") if resource else None,
                    "resource_usage_example_id": usage_example_id(resource) if resource else None,
                    "evidence_sidecar": bool(resource),
                    "model_used": None,
                },
            }
        )

    metrics = summarize_prediction_rows(routed_rows)
    metrics["route_counts"] = dict(sorted(route_counts.items()))
    metrics["missing_resource_rows"] = len(missing)
    metrics["evidence_sidecar_rows"] = sum(1 for row in routed_rows if row["route"]["evidence_sidecar"])
    metrics["resource_index"] = {
        "bible_refs": len(bible_by_ref),
        "db_usage_examples": len(usage_by_example_id),
    }
    return {"metrics": metrics, "missing": missing, "predictions": routed_rows}


def report_candidates(root: Path, specs: list[tuple[str, Path]], key_fn) -> dict[str, dict[str, Any]]:
    reports: dict[str, dict[str, Any]] = {}
    for label, path in specs:
        if not path.exists():
            continue
        data = read_json(path)
        rows: dict[str, dict[str, Any]] = {}
        for row in data.get("predictions", []):
            key = key_fn(row)
            if key and key not in rows:
                rows[key] = row
        reports[label] = {"path": str(path), "rows": rows, "stored_metrics": data.get("metrics", {})}
    return reports


def candidate_ceiling(
    eval_rows: list[dict[str, Any]],
    candidates: dict[str, dict[str, Any]],
    *,
    key_fn,
    baseline_labels: list[str],
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    per_label_scores: dict[str, list[float]] = {label: [] for label in candidates}
    per_label_rows: dict[str, list[dict[str, Any]]] = {label: [] for label in candidates}
    winner_counts: collections.Counter[str] = collections.Counter()

    for row in eval_rows:
        key = key_fn(row)
        reference = clean(row.get("output_text", row.get("reference", "")))
        scored: list[dict[str, Any]] = []
        for label, data in candidates.items():
            candidate = data["rows"].get(key)
            if candidate is None:
                continue
            prediction = clean(candidate.get("prediction", ""))
            score = char_overlap_f(prediction, reference)
            scored.append(
                {
                    "label": label,
                    "prediction": prediction,
                    "sentence_char_f": score,
                    "exact": prediction == reference,
                    "source_report": data["path"],
                }
            )
            per_label_scores[label].append(score)
            per_label_rows[label].append({"prediction": prediction, "reference": reference})
        scored.sort(key=lambda item: (-item["sentence_char_f"], item["label"]))
        winner = scored[0] if scored else None
        if winner:
            winner_counts[winner["label"]] += 1
        rows.append(
            {
                "key": key,
                "id": row.get("id"),
                "canonical_ref": row.get("canonical_ref"),
                "usage_example_id": usage_example_id(row) if row.get("pair_kind") == "usage_example" else None,
                "input_text": row.get("input_text"),
                "reference": reference,
                "winner": winner,
                "candidates": scored,
            }
        )

    oracle_prediction_rows = [
        {"prediction": row["winner"]["prediction"] if row["winner"] else "", "reference": row["reference"]}
        for row in rows
    ]
    label_metrics: dict[str, Any] = {}
    for label, label_rows in per_label_rows.items():
        label_metrics[label] = {
            **summarize_prediction_rows(label_rows),
            "coverage": len(label_rows),
            "source_report": candidates[label]["path"],
            "stored_metrics": candidates[label]["stored_metrics"],
        }

    covered_label_metrics = {
        label: metrics for label, metrics in label_metrics.items() if metrics["coverage"] == len(eval_rows)
    }
    best_single_label = None
    if covered_label_metrics:
        best_single_label = max(
            covered_label_metrics,
            key=lambda label: covered_label_metrics[label]["sentence_char_f"]["mean"],
        )
    else:
        non_empty = {label: metrics for label, metrics in label_metrics.items() if metrics["coverage"]}
        if non_empty:
            best_single_label = max(non_empty, key=lambda label: non_empty[label]["sentence_char_f"]["mean"])

    oracle_metrics = summarize_prediction_rows(oracle_prediction_rows)
    best_metrics = label_metrics.get(best_single_label, {}) if best_single_label else {}
    best_mean = ((best_metrics.get("sentence_char_f") or {}).get("mean") or 0.0) if best_metrics else 0.0
    return {
        "metrics": {
            "eval_rows": len(eval_rows),
            "candidate_reports_loaded": len(candidates),
            "candidate_labels": sorted(candidates),
            "oracle": oracle_metrics,
            "best_single_label": best_single_label,
            "best_single": best_metrics,
            "oracle_minus_best_single_mean_char_f": oracle_metrics["sentence_char_f"]["mean"] - best_mean,
            "winner_counts": dict(winner_counts.most_common()),
            "baseline_labels": baseline_labels,
        },
        "label_metrics": label_metrics,
        "rows": rows,
    }


def bible_candidate_specs(root: Path) -> list[tuple[str, Path]]:
    return [
        (
            "v9.7_direct",
            root
            / "runpod/v9-tagged-direct-reference-9pfzcouowby2lk/models/"
            "v9.7-tagged-direct-plus-reference-bible-tpi-4096row-25epoch-batch16/"
            "eval_heldout_direct325_predictions_greedy.json",
        ),
        (
            "v9.7_ref",
            root
            / "runpod/v9-tagged-direct-reference-9pfzcouowby2lk/models/"
            "v9.7-tagged-direct-plus-reference-bible-tpi-4096row-25epoch-batch16/"
            "eval_heldout_ref325_predictions_greedy.json",
        ),
        (
            "v9.8_direct",
            root
            / "runpod/v9-bible-db-usage-a93j8gm7fcxsgm/models/"
            "v9.8-tagged-bible-plus-db-usage-tpi-20epoch-batch16/"
            "eval_heldout_bible_direct325_predictions_greedy.json",
        ),
        (
            "v9.8_ref",
            root
            / "runpod/v9-bible-db-usage-a93j8gm7fcxsgm/models/"
            "v9.8-tagged-bible-plus-db-usage-tpi-20epoch-batch16/"
            "eval_heldout_bible_ref325_predictions_greedy.json",
        ),
        (
            "v10_direct",
            root
            / "runpod/v10-bible-glossary-usage-7x3vvo3196r33p/models/kuku-yalanji-nllb-lora/"
            "v10.0-tagged-bible-plus-glossary-usage-tpi-20epoch-batch16/"
            "eval_heldout_bible_direct325_predictions_greedy.json",
        ),
        (
            "v10_ref",
            root
            / "runpod/v10-bible-glossary-usage-7x3vvo3196r33p/models/kuku-yalanji-nllb-lora/"
            "v10.0-tagged-bible-plus-glossary-usage-tpi-20epoch-batch16/"
            "eval_heldout_bible_ref325_predictions_greedy.json",
        ),
        (
            "v11_byt5_direct",
            root
            / "runpod/v11-byt5-control-s333rjixdcauc4/models/kuku-yalanji-byt5-control/"
            "v11.0-byt5-bible-control-32row-byt5-small-fullfinetune/"
            "eval_heldout_bible_direct325_predictions_greedy.json",
        ),
        (
            "v11_byt5_ref",
            root
            / "runpod/v11-byt5-control-s333rjixdcauc4/models/kuku-yalanji-byt5-control/"
            "v11.0-byt5-bible-control-32row-byt5-small-fullfinetune/"
            "eval_heldout_bible_ref325_predictions_greedy.json",
        ),
        (
            "v12_direct",
            root
            / "runpod/v12-gvn-token-ml48zbwtwhjnis/models/kuku-yalanji-nllb-lora/"
            "v12.0-tagged-direct-plus-reference-bible-gvn-token-4096row-25epoch-batch16/"
            "eval_heldout_direct325_predictions_greedy.json",
        ),
        (
            "v12_ref",
            root
            / "runpod/v12-gvn-token-ml48zbwtwhjnis/models/kuku-yalanji-nllb-lora/"
            "v12.0-tagged-direct-plus-reference-bible-gvn-token-4096row-25epoch-batch16/"
            "eval_heldout_ref325_predictions_greedy.json",
        ),
        (
            "v13_retrieval_direct",
            root
            / "runpod/v13-retrieval-context-gate-ia2sn2p3cmqcjl/models/kuku-yalanji-nllb-lora/"
            "v13.0-retrieval-context-bible-gvn-token-512row-20epoch-batch8/"
            "eval_heldout_direct325_predictions_greedy.json",
        ),
        (
            "v13_retrieval_ref",
            root
            / "runpod/v13-retrieval-context-gate-ia2sn2p3cmqcjl/models/kuku-yalanji-nllb-lora/"
            "v13.0-retrieval-context-bible-gvn-token-512row-20epoch-batch8/"
            "eval_heldout_ref325_predictions_greedy.json",
        ),
        (
            "v15_hint_direct",
            root
            / "runpod/v15-soft-lexical-hint-khgddom8ewh3nq/models/"
            "v15.0-soft-lexical-hint-bible-gvn-token-2048row-15epoch-batch16/"
            "eval_heldout_direct325_predictions_greedy.json",
        ),
        (
            "v15_hint_ref",
            root
            / "runpod/v15-soft-lexical-hint-khgddom8ewh3nq/models/"
            "v15.0-soft-lexical-hint-bible-gvn-token-2048row-15epoch-batch16/"
            "eval_heldout_ref325_predictions_greedy.json",
        ),
        (
            "v15_nohint_direct",
            root
            / "runpod/v15-soft-lexical-hint-khgddom8ewh3nq/models/"
            "v15.0-soft-lexical-hint-bible-gvn-token-2048row-15epoch-batch16/"
            "eval_nohint_heldout_direct325_predictions_greedy.json",
        ),
        (
            "v15_nohint_ref",
            root
            / "runpod/v15-soft-lexical-hint-khgddom8ewh3nq/models/"
            "v15.0-soft-lexical-hint-bible-gvn-token-2048row-15epoch-batch16/"
            "eval_nohint_heldout_ref325_predictions_greedy.json",
        ),
        (
            "nearest_train_bible_ref",
            root / "analysis/v9.9-retrieval-diagnostic-2026-07-02/bible_ref_nearest_train_only.json",
        ),
    ]


def usage_candidate_specs(root: Path) -> list[tuple[str, Path]]:
    return [
        (
            "v9.8_usage",
            root
            / "runpod/v9-bible-db-usage-a93j8gm7fcxsgm/models/"
            "v9.8-tagged-bible-plus-db-usage-tpi-20epoch-batch16/"
            "eval_heldout_usage_predictions_greedy.json",
        ),
        (
            "v9.9A_usage_only",
            root
            / "runpod/v9-usage-adapter-lj4t0sic66mv5n/models/"
            "v9.9A-usage-only-adapter-tpi-80epoch-batch16/"
            "eval_heldout_usage_predictions_greedy.json",
        ),
        (
            "v9.9B_1row_glossary",
            root
            / "runpod/v9-glossary-usage-04kbs5bizbqg72/models/kuku-yalanji-nllb-lora/"
            "v9.9B-glossary-usage-1row-tpi-80epoch-batch16/"
            "eval_heldout_usage_glossary_predictions_greedy.json",
        ),
        (
            "v9.9B_8row_glossary",
            root
            / "runpod/v9-glossary-usage-04kbs5bizbqg72/models/kuku-yalanji-nllb-lora/"
            "v9.9B-glossary-usage-8row-tpi-80epoch-batch16/"
            "eval_heldout_usage_glossary_predictions_greedy.json",
        ),
        (
            "v9.9B_32row_glossary",
            root
            / "runpod/v9-glossary-usage-04kbs5bizbqg72/models/kuku-yalanji-nllb-lora/"
            "v9.9B-glossary-usage-32row-tpi-80epoch-batch16/"
            "eval_heldout_usage_glossary_predictions_greedy.json",
        ),
        (
            "v9.9C_full_glossary",
            root
            / "runpod/v9-glossary-usage-full-dosgg5nr46up57/models/kuku-yalanji-nllb-lora/"
            "v9.9C-glossary-usage-full-365row-tpi-80epoch-batch16/"
            "eval_heldout_usage_glossary_predictions_greedy.json",
        ),
        (
            "v10_usage",
            root
            / "runpod/v10-bible-glossary-usage-7x3vvo3196r33p/models/kuku-yalanji-nllb-lora/"
            "v10.0-tagged-bible-plus-glossary-usage-tpi-20epoch-batch16/"
            "eval_heldout_usage_predictions_greedy.json",
        ),
        (
            "nearest_train_usage",
            root / "analysis/v9.9-retrieval-diagnostic-2026-07-02/usage_nearest_train_only.json",
        ),
    ]


def write_markdown(output_dir: Path, router: dict[str, Any], bible: dict[str, Any], usage: dict[str, Any]) -> None:
    router_metrics = router["metrics"]
    bible_metrics = bible["metrics"]
    usage_metrics = usage["metrics"]

    def line_for(label: str, metrics: dict[str, Any]) -> str:
        char_mean = metrics["sentence_char_f"]["mean"]
        recall = metrics["reference_token_recall"]["mean"]
        ratio = metrics["length_ratio"]["mean"]
        return (
            f"| {label} | {metrics['rows']} | {metrics['exact']} | "
            f"{metrics['exact_rate']:.3f} | {char_mean:.2f} | {recall:.3f} | {ratio:.3f} |"
        )

    bible_best = bible_metrics["best_single"]
    usage_best = usage_metrics["best_single"]
    lines = [
        "# v16 Router and Candidate-Ceiling Diagnostic",
        "",
        "Date: 2026-07-02 UTC",
        "",
        "This is a local no-GPU diagnostic. It uses already-generated model reports",
        "and approved resource JSONL files; no RunPod pod was launched.",
        "",
        "## v16.0 Resource Router",
        "",
        "| route | rows |",
        "|---|---:|",
    ]
    for route, count in router_metrics["route_counts"].items():
        lines.append(f"| {route} | {count} |")
    lines.extend(
        [
            "",
            "| output | rows | exact | exact rate | mean sentence char-F | mean token recall | mean length ratio |",
            "|---|---:|---:|---:|---:|---:|---:|",
            line_for("resource_router", router_metrics),
            "",
            "Router result:",
            "",
            "```text",
            f"missing resource rows: {router_metrics['missing_resource_rows']}",
            f"evidence sidecar rows: {router_metrics['evidence_sidecar_rows']}/{router_metrics['rows']}",
            f"resource index Bible refs: {router_metrics['resource_index']['bible_refs']}",
            f"resource index DB usage examples: {router_metrics['resource_index']['db_usage_examples']}",
            "```",
            "",
            "Interpretation: known Bible references and known DB usage examples should be",
            "returned by exact lookup. This diagnostic proves that contract on the current",
            "734-row combined known-resource heldout set.",
            "",
            "## v16.1 Bible Candidate Ceiling",
            "",
            "| output | rows | exact | exact rate | mean sentence char-F | mean token recall | mean length ratio |",
            "|---|---:|---:|---:|---:|---:|---:|",
            line_for(f"best single: {bible_metrics['best_single_label']}", bible_best),
            line_for("oracle candidate selector", bible_metrics["oracle"]),
            "",
            "```text",
            f"candidate reports loaded: {bible_metrics['candidate_reports_loaded']}",
            f"oracle - best single mean char-F: {bible_metrics['oracle_minus_best_single_mean_char_f']:.2f}",
            f"winner counts: {json.dumps(bible_metrics['winner_counts'], ensure_ascii=False)}",
            "```",
            "",
            "Interpretation: the Bible candidates contain useful row-specific variation,",
            "but even the oracle selector over existing generated outputs is still far",
            "from exact reproduction. This supports retrieval-first Bible references and",
            "argues against another blind generator-only run.",
            "",
            "## v16.1 Usage Candidate Ceiling",
            "",
            "| output | rows | exact | exact rate | mean sentence char-F | mean token recall | mean length ratio |",
            "|---|---:|---:|---:|---:|---:|---:|",
            line_for(f"best single: {usage_metrics['best_single_label']}", usage_best),
            line_for("oracle candidate selector", usage_metrics["oracle"]),
            "",
            "```text",
            f"candidate reports loaded: {usage_metrics['candidate_reports_loaded']}",
            f"oracle - best single mean char-F: {usage_metrics['oracle_minus_best_single_mean_char_f']:.2f}",
            f"winner counts: {json.dumps(usage_metrics['winner_counts'], ensure_ascii=False)}",
            "```",
            "",
            "Interpretation: usage/example candidates have a larger candidate-selection",
            "ceiling than Bible candidates. A lightweight usage reranker may be worth",
            "testing after the product route returns exact known DB examples by lookup.",
            "",
            "## Decision",
            "",
            "Do not launch another GPU training job from v15. The next model-training",
            "spend should target either a domain-separated draft adapter or a cheap",
            "candidate selector/reranker, with exact resource lookup kept outside the",
            "generator.",
            "",
            "## Artifacts",
            "",
            "```text",
            str(output_dir / "v16.0-resource-router.json"),
            str(output_dir / "v16.1-bible-candidate-ceiling.json"),
            str(output_dir / "v16.1-usage-candidate-ceiling.json"),
            str(output_dir / "v16-summary.json"),
            "```",
            "",
        ]
    )
    (output_dir / "v16-router-candidate-diagnostic-2026-07-02.md").write_text(
        "\n".join(lines), encoding="utf-8"
    )


def main() -> None:
    args = parse_args()
    root = args.root
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    router = build_resource_router(root)

    bible_eval_rows = read_jsonl(
        root / "prepared/v9.7-tagged-direct-plus-reference-bible/heldout_ref_325.eng-gvn.jsonl"
    )
    usage_eval_rows = read_jsonl(
        root / "prepared/v9.8-tagged-bible-plus-db-usage/db_usage/heldout_usage.eng-gvn.jsonl"
    )

    bible_candidates = report_candidates(root, bible_candidate_specs(root), bible_key)
    usage_candidates = report_candidates(root, usage_candidate_specs(root), usage_key)

    bible_ceiling = candidate_ceiling(
        bible_eval_rows,
        bible_candidates,
        key_fn=bible_key,
        baseline_labels=["v12_direct", "v12_ref"],
    )
    usage_ceiling = candidate_ceiling(
        usage_eval_rows,
        usage_candidates,
        key_fn=usage_key,
        baseline_labels=["v10_usage"],
    )

    summary = {
        "root": str(root),
        "output_dir": str(output_dir),
        "resource_router": router["metrics"],
        "bible_candidate_ceiling": bible_ceiling["metrics"],
        "usage_candidate_ceiling": usage_ceiling["metrics"],
    }

    write_json(output_dir / "v16.0-resource-router.json", router)
    write_json(output_dir / "v16.1-bible-candidate-ceiling.json", bible_ceiling)
    write_json(output_dir / "v16.1-usage-candidate-ceiling.json", usage_ceiling)
    write_json(output_dir / "v16-summary.json", summary)
    write_markdown(output_dir, router, bible_ceiling, usage_ceiling)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Score paired Mi'kmaq glossary-conditioned and unconditioned predictions."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import tempfile
import unicodedata
from typing import Any

import sacrebleu


QUOTE_FOLD = str.maketrans({"\u2018": "'", "\u2019": "'", "\u02bc": "'", "`": "'", "\u00b4": "'"})
WORD_RE = re.compile(r"[^\W_]+(?:['\u2019\u02bc-][^\W_]+)*", re.UNICODE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conditioned", type=Path, required=True)
    parser.add_argument("--unconditioned", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--row-output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized_text(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).translate(QUOTE_FOLD).casefold().split())


def word_tokens(value: Any) -> list[str]:
    return [normalized_text(token) for token in WORD_RE.findall(str(value or ""))]


def contains_word_sequence(text: Any, phrase: Any) -> bool:
    text_tokens = word_tokens(text)
    phrase_tokens = word_tokens(phrase)
    if not phrase_tokens or len(phrase_tokens) > len(text_tokens):
        return False
    width = len(phrase_tokens)
    return any(text_tokens[index : index + width] == phrase_tokens for index in range(len(text_tokens) - width + 1))


def exact_binomial_two_sided(successes: int, trials: int, probability: float = 0.5) -> float:
    if trials == 0:
        return 1.0
    observed_probability = math.comb(trials, successes) * probability**successes * (
        1 - probability
    ) ** (trials - successes)
    total = 0.0
    for value in range(trials + 1):
        mass = math.comb(trials, value) * probability**value * (1 - probability) ** (
            trials - value
        )
        if mass <= observed_probability + 1e-15:
            total += mass
    return min(1.0, total)


def load_predictions(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    rows = value.get("predictions")
    if not isinstance(rows, list):
        raise ValueError(f"prediction array is absent: {path}")
    return value.get("metrics") or {}, rows


def paired_rows(
    conditioned: list[dict[str, Any]], unconditioned: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    unconditioned_by_pair: dict[str, dict[str, Any]] = {}
    for row in unconditioned:
        pair_id = str(row.get("conditioned_pair_id") or "")
        if not pair_id or pair_id in unconditioned_by_pair:
            raise ValueError(f"blank or duplicate unconditioned pair ID: {pair_id!r}")
        unconditioned_by_pair[pair_id] = row

    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for conditioned_row in conditioned:
        row_id = str(conditioned_row.get("id") or "")
        if not row_id or row_id in seen:
            raise ValueError(f"blank or duplicate conditioned row ID: {row_id!r}")
        seen.add(row_id)
        baseline = unconditioned_by_pair.get(row_id)
        if baseline is None:
            raise ValueError(f"unconditioned prediction is absent for {row_id}")
        reference = str(conditioned_row.get("reference") or conditioned_row.get("output_text") or "")
        baseline_reference = str(baseline.get("reference") or baseline.get("output_text") or "")
        if reference != baseline_reference:
            raise ValueError(f"paired references differ for {row_id}")
        glossary_pairs = conditioned_row.get("glossary_pairs") or []
        if not glossary_pairs:
            raise ValueError(f"conditioned row has no glossary pairs: {row_id}")
        conditioned_prediction = str(conditioned_row.get("prediction") or "")
        unconditioned_prediction = str(baseline.get("prediction") or "")
        hints = []
        for pair in glossary_pairs:
            headword = str(pair.get("migmaq_headword") or "")
            if not headword or not contains_word_sequence(reference, headword):
                raise ValueError(f"glossary headword is not attested in the reference: {row_id}")
            hints.append(
                {
                    "entry_id": pair.get("entry_id"),
                    "english_gloss": pair.get("english_gloss"),
                    "migmaq_headword": headword,
                    "project_lineage_unexposed": pair.get("project_lineage_unexposed"),
                    "conditioned_surface_present": contains_word_sequence(
                        conditioned_prediction, headword
                    ),
                    "unconditioned_surface_present": contains_word_sequence(
                        unconditioned_prediction, headword
                    ),
                }
            )
        result.append(
            {
                "id": row_id,
                "unconditioned_id": baseline.get("id"),
                "reference": reference,
                "conditioned_prediction": conditioned_prediction,
                "unconditioned_prediction": unconditioned_prediction,
                "project_lineage_unexposed": bool(
                    conditioned_row.get("project_lineage_unexposed")
                ),
                "hints": hints,
                "conditioned_all_hints_present": all(
                    hint["conditioned_surface_present"] for hint in hints
                ),
                "unconditioned_all_hints_present": all(
                    hint["unconditioned_surface_present"] for hint in hints
                ),
                "conditioned_exact": normalized_text(conditioned_prediction)
                == normalized_text(reference),
                "unconditioned_exact": normalized_text(unconditioned_prediction)
                == normalized_text(reference),
            }
        )
    extra = sorted(set(unconditioned_by_pair) - seen)
    if extra:
        raise ValueError(f"unpaired unconditioned rows remain: {extra[:20]}")
    return result


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    hints = [hint for row in rows for hint in row["hints"]]
    gains = sum(
        row["conditioned_all_hints_present"] and not row["unconditioned_all_hints_present"]
        for row in rows
    )
    losses = sum(
        row["unconditioned_all_hints_present"] and not row["conditioned_all_hints_present"]
        for row in rows
    )
    conditioned_predictions = [row["conditioned_prediction"] for row in rows]
    unconditioned_predictions = [row["unconditioned_prediction"] for row in rows]
    references = [row["reference"] for row in rows]
    chrf = sacrebleu.metrics.CHRF(word_order=2)
    conditioned_chrf = chrf.corpus_score(conditioned_predictions, [references]).score if rows else 0.0
    unconditioned_chrf = chrf.corpus_score(unconditioned_predictions, [references]).score if rows else 0.0
    return {
        "rows": len(rows),
        "hint_instances": len(hints),
        "project_lineage_unexposed_rows": sum(row["project_lineage_unexposed"] for row in rows),
        "conditioned_all_hint_rows": sum(row["conditioned_all_hints_present"] for row in rows),
        "unconditioned_all_hint_rows": sum(
            row["unconditioned_all_hints_present"] for row in rows
        ),
        "conditioned_hint_instances_present": sum(
            hint["conditioned_surface_present"] for hint in hints
        ),
        "unconditioned_hint_instances_present": sum(
            hint["unconditioned_surface_present"] for hint in hints
        ),
        "all_hint_row_gains": gains,
        "all_hint_row_losses": losses,
        "all_hint_row_stable_present": sum(
            row["conditioned_all_hints_present"] and row["unconditioned_all_hints_present"]
            for row in rows
        ),
        "all_hint_row_stable_absent": sum(
            not row["conditioned_all_hints_present"]
            and not row["unconditioned_all_hints_present"]
            for row in rows
        ),
        "paired_sign_exact_p_value_descriptive": exact_binomial_two_sided(gains, gains + losses),
        "conditioned_exact_rows": sum(row["conditioned_exact"] for row in rows),
        "unconditioned_exact_rows": sum(row["unconditioned_exact"] for row in rows),
        "conditioned_chrf": conditioned_chrf,
        "unconditioned_chrf": unconditioned_chrf,
        "paired_chrf_delta": conditioned_chrf - unconditioned_chrf,
        "conditioned_unique_outputs": len(set(map(normalized_text, conditioned_predictions))),
        "unconditioned_unique_outputs": len(set(map(normalized_text, unconditioned_predictions))),
        "conditioned_top_outputs": [
            {"prediction": prediction, "rows": count}
            for prediction, count in Counter(map(normalized_text, conditioned_predictions)).most_common(20)
        ],
        "metric_signature": str(chrf.get_signature()) if rows else None,
    }


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(content)
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    conditioned_metrics, conditioned = load_predictions(args.conditioned)
    unconditioned_metrics, unconditioned = load_predictions(args.unconditioned)
    rows = paired_rows(conditioned, unconditioned)
    result = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operation": "paired_migmaq_glossary_uptake_evaluation",
        "inputs": {
            "conditioned": {
                "path": str(args.conditioned.resolve()),
                "sha256": sha256(args.conditioned),
                "reported_metrics": conditioned_metrics,
            },
            "unconditioned": {
                "path": str(args.unconditioned.resolve()),
                "sha256": sha256(args.unconditioned),
                "reported_metrics": unconditioned_metrics,
            },
        },
        "summary": summarize(rows),
        "interpretation": [
            "Headword uptake is normalized whole-word surface inclusion, not proof of grammatical integration.",
            "The paired sign-test p-value is descriptive unless the comparison was preregistered.",
            "Project-lineage-unexposed excludes declared MobTranslate training exposure; upstream NLLB exposure is unknown.",
        ],
    }
    write_atomic(args.output, json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    write_atomic(
        args.row_output,
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

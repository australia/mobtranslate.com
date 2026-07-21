#!/usr/bin/env python3
"""Evaluate a merged NLLB model with optional per-row lexical constraints."""

from __future__ import annotations

import argparse
import collections
import json
import re
import statistics
from pathlib import Path
from typing import Any

import sacrebleu
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


TOKEN_RE = re.compile(r"[A-Za-z0-9-]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--data-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-new-tokens", type=int, default=192)
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=0)
    parser.add_argument("--repetition-penalty", type=float, default=1.0)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    parser.add_argument("--max-rows", type=int)
    parser.add_argument(
        "--constraint-source",
        choices=["none", "oracle-rare-reference", "row-field"],
        default="oracle-rare-reference",
    )
    parser.add_argument("--constraint-field", default="lexical_constraints")
    parser.add_argument("--max-constraint-words", type=int, default=3)
    parser.add_argument("--min-constraint-chars", type=int, default=4)
    parser.add_argument("--max-constraint-token-ids", type=int, default=8)
    parser.add_argument("--baseline-predictions")
    parser.add_argument("--only-missing-from-baseline", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


def normalize_token(token: str) -> str:
    return "-".join(TOKEN_RE.findall(token)).casefold()


def words(text: str) -> list[str]:
    return TOKEN_RE.findall(normalize_text(text))


def add_lang_code(tokenizer: Any, model: Any, lang_code: str) -> int:
    token_id = tokenizer.convert_tokens_to_ids(lang_code)
    if token_id == tokenizer.unk_token_id:
        tokenizer.add_special_tokens({"additional_special_tokens": [lang_code]})
        model.resize_token_embeddings(len(tokenizer))
        token_id = tokenizer.convert_tokens_to_ids(lang_code)
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[lang_code] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = lang_code
    return token_id


def read_rows(file: str, direction: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(file, "r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("direction") == direction:
                rows.append(row)
    return rows


def load_baseline_predictions(file: str | None) -> dict[str, str]:
    if not file:
        return {}
    data = json.loads(Path(file).read_text(encoding="utf-8"))
    return {
        str(row.get("id")): normalize_text(row.get("prediction"))
        for row in data.get("predictions", [])
        if row.get("id")
    }


def target_frequency(rows: list[dict[str, Any]]) -> collections.Counter[str]:
    counts: collections.Counter[str] = collections.Counter()
    for row in rows:
        seen = {normalize_token(token) for token in words(str(row.get("output_text", "")))}
        counts.update(token for token in seen if token)
    return counts


def row_field_constraints(row: dict[str, Any], field: str) -> list[str]:
    value: Any = row
    for part in field.split("."):
        if isinstance(value, dict):
            value = value.get(part)
        else:
            value = None
            break
    if isinstance(value, str):
        return [normalize_text(value)]
    if isinstance(value, list):
        return [normalize_text(item) for item in value if normalize_text(item)]
    return []


def rare_reference_constraints(
    row: dict[str, Any],
    frequencies: collections.Counter[str],
    *,
    max_words: int,
    min_chars: int,
    baseline_prediction: str,
    only_missing_from_baseline: bool,
) -> list[str]:
    baseline_tokens = {normalize_token(token) for token in words(baseline_prediction)}
    candidates: dict[str, tuple[int, int, str]] = {}
    for position, token in enumerate(words(str(row.get("output_text", "")))):
        normalized = normalize_token(token)
        if not normalized or len(normalized) < min_chars:
            continue
        if only_missing_from_baseline and normalized in baseline_tokens:
            continue
        if normalized not in candidates:
            candidates[normalized] = (frequencies.get(normalized, 0), position, token)
    ranked = sorted(candidates.values(), key=lambda item: (item[0], item[1], item[2].casefold()))
    return [item[2] for item in ranked[:max_words]]


def token_ids_for_constraint(tokenizer: Any, text: str, *, max_token_ids: int) -> list[int]:
    ids = tokenizer(text, add_special_tokens=False).input_ids
    special = set(tokenizer.all_special_ids)
    ids = [int(token_id) for token_id in ids if int(token_id) not in special]
    if not ids or len(ids) > max_token_ids:
        return []
    return ids


def contains_constraint(prediction: str, constraint: str) -> bool:
    prediction_tokens = {normalize_token(token) for token in words(prediction)}
    constraint_tokens = [normalize_token(token) for token in words(constraint)]
    return all(token in prediction_tokens for token in constraint_tokens if token)


def repeat_share(tokens: list[str]) -> float:
    if not tokens:
        return 0.0
    return max(collections.Counter(tokens).values()) / len(tokens)


def describe(values: list[float]) -> dict[str, float]:
    if not values:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0}
    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
    }


def main() -> None:
    args = parse_args()
    tokenizer = AutoTokenizer.from_pretrained(args.model_dir, src_lang=args.source_lang, tgt_lang=args.target_lang)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model_dir)
    target_id = add_lang_code(tokenizer, model, args.target_lang)
    add_lang_code(tokenizer, model, args.source_lang)
    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang
    model.config.forced_bos_token_id = target_id
    model.generation_config.forced_bos_token_id = target_id
    model.generation_config.no_repeat_ngram_size = args.no_repeat_ngram_size
    model.generation_config.repetition_penalty = args.repetition_penalty
    model.generation_config.length_penalty = args.length_penalty

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    rows = read_rows(args.data_file, args.direction)
    if args.max_rows is not None:
        rows = rows[: args.max_rows]
    frequencies = target_frequency(rows)
    baseline_predictions = load_baseline_predictions(args.baseline_predictions)

    predictions: list[dict[str, Any]] = []
    refs: list[str] = []
    preds: list[str] = []
    selected_constraints = 0
    hit_constraints = 0
    rows_with_constraints = 0
    length_ratios: list[float] = []
    repeat_shares: list[float] = []

    for row in rows:
        if args.constraint_source == "none":
            constraints: list[str] = []
        elif args.constraint_source == "row-field":
            constraints = row_field_constraints(row, args.constraint_field)
        else:
            constraints = rare_reference_constraints(
                row,
                frequencies,
                max_words=args.max_constraint_words,
                min_chars=args.min_constraint_chars,
                baseline_prediction=baseline_predictions.get(str(row.get("id")), ""),
                only_missing_from_baseline=args.only_missing_from_baseline,
            )

        force_words_ids = [
            ids
            for ids in (
                token_ids_for_constraint(tokenizer, constraint, max_token_ids=args.max_constraint_token_ids)
                for constraint in constraints
            )
            if ids
        ]
        generation_kwargs: dict[str, Any] = {}
        if force_words_ids:
            generation_kwargs["force_words_ids"] = force_words_ids

        inputs = tokenizer(
            normalize_text(row["input_text"]),
            max_length=args.max_source_length,
            truncation=True,
            padding=True,
            return_tensors="pt",
        ).to(device)
        with torch.no_grad():
            generated = model.generate(
                **inputs,
                forced_bos_token_id=target_id,
                max_new_tokens=args.max_new_tokens,
                num_beams=max(2, args.num_beams) if force_words_ids else args.num_beams,
                no_repeat_ngram_size=args.no_repeat_ngram_size,
                repetition_penalty=args.repetition_penalty,
                length_penalty=args.length_penalty,
                **generation_kwargs,
            )
        pred = normalize_text(tokenizer.batch_decode(generated, skip_special_tokens=True)[0])
        ref = normalize_text(row["output_text"])

        hits = [contains_constraint(pred, constraint) for constraint in constraints]
        selected_constraints += len(constraints)
        hit_constraints += sum(1 for hit in hits if hit)
        if constraints:
            rows_with_constraints += 1
        refs.append(ref)
        preds.append(pred)
        length_ratios.append(len(words(pred)) / (len(words(ref)) or 1))
        repeat_shares.append(repeat_share(words(pred)))
        predictions.append(
            {
                **row,
                "prediction": pred,
                "reference": ref,
                "lexical_constraints": {
                    "source": args.constraint_source,
                    "selected": constraints,
                    "force_words_ids": force_words_ids,
                    "hits": hits,
                    "hit_count": sum(1 for hit in hits if hit),
                },
            }
        )

    exact = sum(1 for pred, ref in zip(preds, refs) if normalize_text(pred) == normalize_text(ref))
    empty = sum(1 for pred in preds if not pred)
    metrics = {
        "bleu": sacrebleu.corpus_bleu(preds, [refs]).score if preds else 0.0,
        "chrf": sacrebleu.corpus_chrf(preds, [refs], word_order=2).score if preds else 0.0,
        "rows": len(preds),
        "exact": exact,
        "empty": empty,
        "num_beams": args.num_beams,
        "no_repeat_ngram_size": args.no_repeat_ngram_size,
        "repetition_penalty": args.repetition_penalty,
        "length_penalty": args.length_penalty,
        "constraint_source": args.constraint_source,
        "max_constraint_words": args.max_constraint_words,
        "only_missing_from_baseline": args.only_missing_from_baseline,
        "constraints": {
            "rows_with_constraints": rows_with_constraints,
            "selected": selected_constraints,
            "hits": hit_constraints,
            "hit_rate": hit_constraints / selected_constraints if selected_constraints else None,
        },
        "length_ratio": describe(length_ratios),
        "max_token_repeat_share": describe(repeat_shares),
    }

    output = {"metrics": metrics, "predictions": predictions}
    Path(args.output_file).write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()

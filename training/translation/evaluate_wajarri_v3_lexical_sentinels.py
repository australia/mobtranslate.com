#!/usr/bin/env python3
"""Evaluate checkpoint-level Wajarri lexical sentinels on a GPU worker."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
import unicodedata
from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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
    parser.add_argument("--base-dir", type=Path, required=True)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--pair-matches", type=Path, required=True)
    parser.add_argument("--expected-rows", type=int, required=True)
    parser.add_argument("--expected-mandatory", type=int, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="wbv_Latn")
    parser.add_argument("--max-source-length", type=int, default=256)
    parser.add_argument("--max-new-tokens", type=int, default=64)
    parser.add_argument("--seed", type=int, default=17)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def preserve(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    return " ".join(text.translate(QUOTE_FOLD).casefold().split()).strip(" .?!,;:")


def load_sentinels(
    path: Path, expected_rows: int, expected_mandatory: int
) -> list[dict[str, Any]]:
    if expected_rows <= 0 or expected_mandatory < 0:
        raise ValueError("expected sentinel counts are invalid")
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        pair = json.loads(line)
        if not isinstance(pair, dict) or not isinstance(pair.get("anchor"), dict):
            raise TypeError(f"{path}:{line_number}: missing anchor object")
        anchor = pair["anchor"]
        missing = sorted(
            {"id", "input_text", "output_text", "reference_token_length_bucket"}
            - anchor.keys()
        )
        if missing:
            raise ValueError(f"{path}:{line_number}: anchor lacks fields: {missing}")
        if anchor.get("baseline_exact") is not True:
            raise ValueError(f"{path}:{line_number}: anchor was not exact at baseline")
        rows.append(
            {
                "schema_version": 1,
                "pair_id": pair.get("pair_id"),
                "anchor_id": anchor["id"],
                "input_text": anchor["input_text"],
                "output_text": anchor["output_text"],
                "source_record_ids": anchor.get("source_record_ids", []),
                "reference_token_length_bucket": anchor[
                    "reference_token_length_bucket"
                ],
                "mandatory_regression_anchor": bool(
                    pair.get("mandatory_regression_anchor")
                ),
            }
        )
    if len(rows) != expected_rows:
        raise ValueError(f"expected {expected_rows} sentinels, got {len(rows)}")
    if len({row["anchor_id"] for row in rows}) != len(rows):
        raise ValueError("duplicate lexical sentinel anchor")
    mandatory = sum(row["mandatory_regression_anchor"] for row in rows)
    if mandatory != expected_mandatory:
        raise ValueError(
            f"expected {expected_mandatory} mandatory sentinels, got {mandatory}"
        )
    return sorted(rows, key=lambda row: row["anchor_id"])


def batched(values: Sequence[Any], size: int) -> Iterable[Sequence[Any]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]


def repeated_ngram(token_ids: list[int], special_ids: set[int], size: int = 4) -> bool:
    values = [value for value in token_ids if value not in special_ids]
    seen: set[tuple[int, ...]] = set()
    for index in range(len(values) - size + 1):
        ngram = tuple(values[index : index + size])
        if ngram in seen:
            return True
        seen.add(ngram)
    return False


def score_row(
    row: dict[str, Any],
    prediction: str,
    token_ids: list[int],
    special_ids: set[int],
) -> dict[str, Any]:
    normalized_prediction = normalize(prediction)
    reference = normalize(row["output_text"])
    source = normalize(str(row["input_text"]).removeprefix("<lexeme>"))
    return {
        **row,
        "prediction": preserve(prediction),
        "exact": normalized_prediction == reference,
        "blank": not normalized_prediction,
        "source_copy": normalized_prediction == source,
        "repeated_token_4gram": repeated_ngram(token_ids, special_ids),
    }


def population_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"rows": 0, "exact": 0, "exact_rate": None}
    exact = sum(row["exact"] for row in rows)
    return {"rows": len(rows), "exact": exact, "exact_rate": exact / len(rows)}


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    mandatory = [row for row in rows if row["mandatory_regression_anchor"]]
    nonmandatory = [row for row in rows if not row["mandatory_regression_anchor"]]
    buckets = sorted({row["reference_token_length_bucket"] for row in rows})
    return {
        **population_summary(rows),
        "mandatory": population_summary(mandatory),
        "nonmandatory": population_summary(nonmandatory),
        "by_reference_token_length": {
            bucket: population_summary(
                [row for row in rows if row["reference_token_length_bucket"] == bucket]
            )
            for bucket in buckets
        },
        "faults": {
            field: sum(bool(row[field]) for row in rows)
            for field in ("blank", "source_copy", "repeated_token_4gram")
        },
        "failure_outputs": dict(
            sorted(
                Counter(
                    normalize(row["prediction"]) for row in rows if not row["exact"]
                ).items(),
                key=lambda item: (-item[1], item[0]),
            )
        ),
    }


def main() -> None:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    args = parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is required for the Wajarri lexical-sentinel census")
    if args.batch_size <= 0:
        raise SystemExit("--batch-size must be positive")
    rows = load_sentinels(
        args.pair_matches, args.expected_rows, args.expected_mandatory
    )
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    started = time.monotonic()

    tokenizer = AutoTokenizer.from_pretrained(
        args.base_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        use_fast=False,
        local_files_only=True,
    )
    target_id = int(tokenizer.convert_tokens_to_ids(args.target_lang))
    if target_id == tokenizer.unk_token_id:
        raise RuntimeError(f"target language token is unknown: {args.target_lang}")
    base = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_dir,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
        local_files_only=True,
    )
    model = PeftModel.from_pretrained(base, args.adapter_dir, local_files_only=True)
    model = model.to("cuda").eval()
    special_ids = {int(value) for value in tokenizer.all_special_ids}
    special_ids.add(int(tokenizer.pad_token_id))

    predictions: list[dict[str, Any]] = []
    for batch in batched(rows, args.batch_size):
        encoded = tokenizer(
            [row["input_text"] for row in batch],
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=args.max_source_length,
        )
        encoded = {key: value.to("cuda") for key, value in encoded.items()}
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                forced_bos_token_id=target_id,
                max_new_tokens=args.max_new_tokens,
                num_beams=1,
                do_sample=False,
                no_repeat_ngram_size=0,
                repetition_penalty=1.0,
                length_penalty=1.0,
                use_cache=True,
            )
        decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
        predictions.extend(
            score_row(row, prediction, token_ids, special_ids)
            for row, prediction, token_ids in zip(
                batch, decoded, generated.tolist(), strict=True
            )
        )

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=False)
    with (output_dir / "PREDICTIONS.jsonl").open("w", encoding="utf-8") as handle:
        for row in predictions:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    summary = {
        "schema_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "label": args.label,
        "adapter_weight_sha256": sha256_file(
            args.adapter_dir / "adapter_model.safetensors"
        ),
        "pair_matches_sha256": sha256_file(args.pair_matches),
        "decoder": {
            "num_beams": 1,
            "do_sample": False,
            "no_repeat_ngram_size": 0,
            "repetition_penalty": 1.0,
            "length_penalty": 1.0,
            "max_new_tokens": args.max_new_tokens,
        },
        "metrics": summarize(predictions),
        "duration_seconds": time.monotonic() - started,
        "claim_limit": (
            "A checkpoint-level catastrophic-interference sentinel over mappings "
            "already exact at baseline; not a population estimate of translation quality."
        ),
    }
    (output_dir / "SUMMARY.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

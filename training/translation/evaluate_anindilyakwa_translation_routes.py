#!/usr/bin/env python3
"""Run route-separated, provenance-bound diagnostics for an Anindilyakwa model.

The frozen benchmark suite is evidence, not permission to claim fluent translation.
This evaluator therefore reports lexical, fixed-utterance, and natural-sentence
routes separately and always labels its result as diagnostic-only.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from typing import Any, Iterable

import sacrebleu
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


ROUTES = {
    "lexical": {
        "file": "lexical.jsonl",
        "task": "closed_set_lexical_reconstruction",
        "max_new_tokens": 128,
    },
    "fixed_utterance": {
        "file": "fixed-utterances.jsonl",
        "task": "dictionary_attested_multi_token_fixed_utterance",
        "max_new_tokens": 128,
    },
    "natural_sentence": {
        "file": "natural-sentences.jsonl",
        "task": "independent_natural_sentence_translation",
        "max_new_tokens": 576,
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--model-manifest", type=Path, required=True)
    parser.add_argument("--expected-model-manifest-sha256", required=True)
    parser.add_argument("--benchmark-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="aoi_Latn")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument("--partitions", default="development,test")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    state = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            state.update(chunk)
    return state.hexdigest()


def sha256_directory(path: Path) -> dict[str, str]:
    return {
        file.relative_to(path).as_posix(): sha256_file(file)
        for file in sorted(path.rglob("*"))
        if file.is_file()
    }


def canonical_json_sha256(value: Any) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def normalize_model_text(text: str) -> str:
    """Reproduce the immutable model-facing corpus normalization contract."""
    value = unicodedata.normalize("NFKC", str(text))
    value = value.translate(
        str.maketrans(
            {
                "\u2018": "'",
                "\u2019": "'",
                "\u201c": '"',
                "\u201d": '"',
                "\u2014": "-",
            }
        )
    )
    return " ".join(value.split())


def normalized_comparison(text: str) -> str:
    return normalize_model_text(text).casefold()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise TypeError(f"JSONL row is not an object: {path}:{line_number}")
            rows.append(value)
    return rows


def verify_benchmark(benchmark_dir: Path) -> dict[str, str]:
    checksum_path = benchmark_dir / "SHA256SUMS"
    expected: dict[str, str] = {}
    for line in checksum_path.read_text(encoding="utf-8").splitlines():
        digest, relative = re.split(r"\s+", line.strip(), maxsplit=1)
        relative = relative.lstrip("*")
        observed = sha256_file(benchmark_dir / relative)
        if observed != digest:
            raise RuntimeError(
                f"benchmark checksum mismatch for {relative}: {observed} != {digest}"
            )
        expected[relative] = digest
    return expected


def prompt_for(route: str, row: dict[str, Any]) -> str:
    if route == "natural_sentence":
        return str(row["input_english"])
    glosses = row.get("prompt_english_glosses")
    if not isinstance(glosses, list) or not glosses:
        raise ValueError(f"{row.get('benchmark_id')} has no English gloss prompt")
    return "; ".join(str(gloss) for gloss in glosses)


def expected_for(route: str, row: dict[str, Any]) -> str:
    del route
    return str(row["expected_anindilyakwa"])


def repeated_ngram_fraction(token_ids: list[int], width: int = 3) -> float:
    if len(token_ids) < width:
        return 0.0
    grams = [tuple(token_ids[index : index + width]) for index in range(len(token_ids) - width + 1)]
    return (len(grams) - len(set(grams))) / len(grams)


def batches(rows: list[Any], size: int) -> Iterable[list[Any]]:
    for index in range(0, len(rows), size):
        yield rows[index : index + size]


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    hypotheses = [row["prediction"] for row in rows]
    references = [row["expected_anindilyakwa"] for row in rows]
    return {
        "rows": len(rows),
        "empty_outputs": sum(row["audits"]["empty"] for row in rows),
        "exact_matches": sum(row["scores"]["exact_match"] for row in rows),
        "source_copy_flags": sum(row["audits"]["source_copy"] for row in rows),
        "missing_eos_flags": sum(row["audits"]["missing_eos"] for row in rows),
        "high_repetition_flags": sum(
            row["audits"]["repeated_trigram_fraction"] >= 0.20 for row in rows
        ),
        "corpus_bleu": sacrebleu.corpus_bleu(hypotheses, [references]).score,
        "corpus_chrf2": sacrebleu.corpus_chrf(
            hypotheses, [references], word_order=2
        ).score,
        "mean_source_copy_similarity": (
            sum(row["audits"]["source_copy_similarity"] for row in rows) / len(rows)
            if rows
            else 0.0
        ),
        "mean_repeated_trigram_fraction": (
            sum(row["audits"]["repeated_trigram_fraction"] for row in rows)
            / len(rows)
            if rows
            else 0.0
        ),
    }


def main() -> None:
    args = parse_args()
    if args.batch_size <= 0 or args.num_beams <= 0:
        raise ValueError("batch size and beam count must be positive")
    if args.output_dir.exists():
        raise FileExistsError(f"refusing existing evaluation output: {args.output_dir}")
    partitions = tuple(
        value.strip() for value in args.partitions.split(",") if value.strip()
    )
    if not partitions or any(value not in {"development", "test"} for value in partitions):
        raise ValueError(f"unsupported partitions: {partitions}")

    benchmark_hashes = verify_benchmark(args.benchmark_dir)
    benchmark_summary = json.loads(
        (args.benchmark_dir / "summary.json").read_text(encoding="utf-8")
    )
    model_manifest_hash = sha256_file(args.model_manifest)
    if model_manifest_hash != args.expected_model_manifest_sha256:
        raise RuntimeError(
            "training manifest checksum mismatch: "
            f"{model_manifest_hash} != {args.expected_model_manifest_sha256}"
        )
    model_manifest = json.loads(args.model_manifest.read_text(encoding="utf-8"))
    if model_manifest.get("target_lang") != args.target_lang:
        raise RuntimeError("model manifest target language does not match evaluation")
    if model_manifest.get("source_lang") != args.source_lang:
        raise RuntimeError("model manifest source language does not match evaluation")
    if int(model_manifest.get("trainer_state", {}).get("global_step", -1)) <= 0:
        raise RuntimeError("model manifest has no completed optimizer trajectory")

    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    tokenizer = AutoTokenizer.from_pretrained(
        args.model_dir,
        use_fast=False,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
    )
    dtype = (
        torch.bfloat16
        if torch.cuda.is_available() and torch.cuda.is_bf16_supported()
        else None
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model_dir, torch_dtype=dtype)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()
    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang
    target_lang_id = tokenizer.convert_tokens_to_ids(args.target_lang)
    if target_lang_id == tokenizer.unk_token_id:
        raise RuntimeError(f"target control is unknown: {args.target_lang}")
    if int(model_manifest["target_lang_token_id"]) != int(target_lang_id):
        raise RuntimeError("target control id differs from the training manifest")

    evaluated: list[dict[str, Any]] = []
    route_input_hashes: dict[str, str] = {}
    with torch.inference_mode():
        for route, spec in ROUTES.items():
            benchmark_path = args.benchmark_dir / spec["file"]
            route_input_hashes[route] = sha256_file(benchmark_path)
            selected = [
                row
                for row in read_jsonl(benchmark_path)
                if row.get("partition") in partitions
            ]
            if any(row.get("task") != spec["task"] for row in selected):
                raise RuntimeError(f"task identity mismatch in route {route}")
            route_batches = list(batches(selected, args.batch_size))
            print(
                json.dumps(
                    {
                        "event": "route_started",
                        "route": route,
                        "rows": len(selected),
                        "batches": len(route_batches),
                    },
                    sort_keys=True,
                ),
                flush=True,
            )
            for batch_index, batch_rows in enumerate(route_batches, 1):
                prompts = [normalize_model_text(prompt_for(route, row)) for row in batch_rows]
                encoded = tokenizer(
                    prompts,
                    padding=True,
                    truncation=True,
                    max_length=128,
                    return_tensors="pt",
                ).to(device)
                generated = model.generate(
                    **encoded,
                    forced_bos_token_id=target_lang_id,
                    do_sample=False,
                    num_beams=args.num_beams,
                    max_new_tokens=int(spec["max_new_tokens"]),
                )
                predictions = tokenizer.batch_decode(
                    generated, skip_special_tokens=True
                )
                for source_row, prompt, prediction, token_row in zip(
                    batch_rows, prompts, predictions, generated.tolist(), strict=True
                ):
                    prediction = normalize_model_text(prediction)
                    expected = normalize_model_text(expected_for(route, source_row))
                    eos_present = tokenizer.eos_token_id in token_row
                    copy_similarity = SequenceMatcher(
                        None, normalized_comparison(prompt), normalized_comparison(prediction)
                    ).ratio()
                    evaluated.append(
                        {
                            "schema_version": 1,
                            "route": route,
                            "partition": source_row["partition"],
                            "benchmark_id": source_row["benchmark_id"],
                            "leakage_group": source_row["leakage_group"],
                            "input_english": prompt,
                            "expected_anindilyakwa": expected,
                            "prediction": prediction,
                            "scores": {
                                "exact_match": normalized_comparison(prediction)
                                == normalized_comparison(expected),
                                "sentence_chrf2": sacrebleu.sentence_chrf(
                                    prediction, [expected], word_order=2
                                ).score,
                            },
                            "audits": {
                                "empty": not bool(prediction.strip()),
                                "source_copy_similarity": copy_similarity,
                                "source_copy": copy_similarity >= 0.90,
                                "eos_present": eos_present,
                                "missing_eos": not eos_present,
                                "generated_token_count": len(token_row),
                                "repeated_trigram_fraction": repeated_ngram_fraction(
                                    token_row
                                ),
                            },
                            "benchmark_review_state": source_row.get("review_state"),
                            "permanently_excluded_from_training": source_row.get(
                                "permanently_excluded_from_training"
                            ),
                        }
                    )
                print(
                    json.dumps(
                        {
                            "event": "route_progress",
                            "route": route,
                            "completed_batches": batch_index,
                            "total_batches": len(route_batches),
                            "completed_rows": min(
                                batch_index * args.batch_size, len(selected)
                            ),
                            "total_rows": len(selected),
                        },
                        sort_keys=True,
                    ),
                    flush=True,
                )

    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in evaluated:
        grouped[(row["route"], row["partition"])].append(row)
    summaries = {
        f"{route}:{partition}": summarize(rows)
        for (route, partition), rows in sorted(grouped.items())
    }
    args.output_dir.mkdir(parents=True)
    predictions_path = args.output_dir / "predictions.jsonl"
    predictions_path.write_text(
        "".join(
            json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
            for row in evaluated
        ),
        encoding="utf-8",
    )
    model_directory_hashes = sha256_directory(args.model_dir)
    report = {
        "schema_version": 1,
        "evaluation_id": "anindilyakwa-route-separated-diagnostic-v0.1.0",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "DIAGNOSTIC_ONLY_NOT_RELEASE_QUALIFYING",
        "evaluator": {
            "path": str(Path(__file__).resolve()),
            "sha256": sha256_file(Path(__file__).resolve()),
        },
        "decision": {
            "automatic_metrics_authorize_public_model": False,
            "automatic_metrics_authorize_free_form_translation": False,
            "qualified_fluent_language_review_present": False,
            "independently_blind_or_escrowed_test_present": False,
        },
        "limitations": [
            "The test rows are frozen and excluded from training but are not blind or independently escrowed.",
            "The benchmark candidates have not received qualified fluent-language adjudication.",
            "Automatic BLEU, chrF, copying, EOS, and repetition checks cannot authorize public free-form translation.",
            "Lexical reconstruction, fixed utterances, and natural sentence generation are reported as separate routes.",
        ],
        "model": {
            "directory": str(args.model_dir.resolve()),
            "directory_files_sha256": model_directory_hashes,
            "directory_manifest_sha256": canonical_json_sha256(
                model_directory_hashes
            ),
            "training_manifest": str(args.model_manifest.resolve()),
            "training_manifest_sha256": model_manifest_hash,
            "run_id": model_manifest.get("run_id"),
            "global_step": model_manifest.get("trainer_state", {}).get("global_step"),
            "target_lang_token_id": target_lang_id,
        },
        "benchmark": {
            "suite_id": benchmark_summary.get("suite_id"),
            "directory": str(args.benchmark_dir.resolve()),
            "files_sha256": benchmark_hashes,
            "route_inputs_sha256": route_input_hashes,
            "partitions": list(partitions),
            "test_status": benchmark_summary.get("leakage_policy", {}).get(
                "sealed_status"
            ),
        },
        "generation": {
            "source_lang": args.source_lang,
            "target_lang": args.target_lang,
            "batch_size": args.batch_size,
            "num_beams": args.num_beams,
            "seed": args.seed,
            "route_max_new_tokens": {
                route: spec["max_new_tokens"] for route, spec in ROUTES.items()
            },
            "model_facing_normalization": {
                "unicode": "NFKC",
                "punctuation": "U+2018/U+2019 to apostrophe; U+201C/U+201D to quote; U+2014 to hyphen-minus",
                "whitespace": "collapse and trim",
            },
        },
        "summaries": summaries,
        "predictions": {
            "path": "predictions.jsonl",
            "rows": len(evaluated),
            "sha256": sha256_file(predictions_path),
        },
        "environment": {
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
            "cuda_available": torch.cuda.is_available(),
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        },
    }
    report_path = args.output_dir / "report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (args.output_dir / "SHA256SUMS").write_text(
        f"{sha256_file(predictions_path)}  predictions.jsonl\n"
        f"{sha256_file(report_path)}  report.json\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

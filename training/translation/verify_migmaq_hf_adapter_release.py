#!/usr/bin/env python3
"""Verify identity and loadability of a staged Mi'kmaq Hugging Face release."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
from typing import Any


TOKENIZER_FILES = (
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-dir", type=Path, required=True)
    parser.add_argument("--reference-report", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="mic_Latn")
    parser.add_argument("--expected-target-token-id", type=int, default=256204)
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--torch-threads", type=int)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def tokenizer_bundle_sha256(root: Path) -> str:
    digest = hashlib.sha256()
    for name in TOKENIZER_FILES:
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(path)
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(sha256(path)))
    return digest.hexdigest()


def normalize(text: Any) -> str:
    return " ".join(str(text).split())


def trim_trailing_pad(token_ids: list[int], pad_token_id: int) -> list[int]:
    end = len(token_ids)
    while end and token_ids[end - 1] == pad_token_id:
        end -= 1
    return token_ids[:end]


def language_id(tokenizer: Any, language: str) -> int:
    token_id = int(tokenizer.convert_tokens_to_ids(language))
    if token_id == tokenizer.unk_token_id:
        raise RuntimeError(f"Language token is absent: {language}")
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[language] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = language
    return token_id


def verify_static_release(
    release_dir: Path, reference: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest_path = release_dir / "release-manifest.json"
    base_dir = release_dir / "base-repo"
    model_dir = release_dir / "model-repo"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    adapter_config = json.loads(
        (model_dir / "adapter_config.json").read_text(encoding="utf-8")
    )
    observed = {
        "base_model_sha256": sha256(base_dir / "model.safetensors"),
        "adapter_model_sha256": sha256(model_dir / "adapter_model.safetensors"),
        "base_tokenizer_json_sha256": sha256(base_dir / "tokenizer.json"),
        "adapter_tokenizer_json_sha256": sha256(model_dir / "tokenizer.json"),
        "base_tokenizer_bundle_sha256": tokenizer_bundle_sha256(base_dir),
        "adapter_tokenizer_bundle_sha256": tokenizer_bundle_sha256(model_dir),
        "adapter_base_model_name_or_path": adapter_config.get(
            "base_model_name_or_path"
        ),
        "adapter_base_revision": adapter_config.get("revision"),
        "merged_model_absent": not (model_dir / "model.safetensors").exists(),
    }
    expected = {
        "base_model_sha256": manifest["base_model_sha256"],
        "adapter_model_sha256": manifest["adapter_model_sha256"],
        "base_tokenizer_json_sha256": reference["inputs"][
            "base_tokenizer_json_sha256"
        ],
        "adapter_tokenizer_json_sha256": reference["inputs"][
            "adapter_tokenizer_json_sha256"
        ],
        "base_tokenizer_bundle_sha256": manifest["tokenizer_bundle_sha256"],
        "adapter_tokenizer_bundle_sha256": manifest["tokenizer_bundle_sha256"],
        "adapter_base_model_name_or_path": manifest["repositories"]["base_repo"],
        "adapter_base_revision": manifest["repository_tags"]["base_repo"],
        "merged_model_absent": True,
    }
    checks = {
        key: {"expected": expected[key], "observed": observed[key], "passed": observed[key] == expected[key]}
        for key in expected
    }
    return manifest, checks


def compare_predictions(
    reference_rows: list[dict[str, Any]],
    observed_ids: list[list[int]],
    observed_texts: list[str],
    expected_texts: list[str],
) -> list[dict[str, Any]]:
    counts = {
        len(reference_rows),
        len(observed_ids),
        len(observed_texts),
        len(expected_texts),
    }
    if len(counts) != 1:
        raise ValueError("Reference and observed prediction counts differ")
    return [
        {
            "id": row["id"],
            "input_text": row["input_text"],
            "expected_token_ids": row["adapter_token_ids"],
            "observed_token_ids": token_ids,
            "expected_text": normalize(expected_text),
            "observed_text": normalize(text),
            "token_ids_equal": token_ids == row["adapter_token_ids"],
            "text_equal": normalize(text) == normalize(expected_text),
        }
        for row, token_ids, text, expected_text in zip(
            reference_rows,
            observed_ids,
            observed_texts,
            expected_texts,
            strict=True,
        )
    ]


def main() -> None:
    args = parse_args()
    release_dir = args.release_dir.expanduser().resolve()
    reference_path = args.reference_report.expanduser().resolve()
    output_path = args.output_json.expanduser().resolve()
    reference = json.loads(reference_path.read_text(encoding="utf-8"))
    manifest, static_checks = verify_static_release(release_dir, reference)

    generation = reference["generation"]
    required_generation = {
        "num_beams": 4,
        "no_repeat_ngram_size": 3,
        "repetition_penalty": 1.1,
        "length_penalty": 1.0,
        "max_new_tokens": 192,
    }
    generation_check = generation == required_generation
    reference_rows = reference["predictions"]
    if not reference_rows:
        raise RuntimeError("Reference report has no prediction probes")

    import torch
    from peft import PeftModel
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, set_seed

    if args.torch_threads is not None:
        if args.torch_threads < 1:
            raise SystemExit("--torch-threads must be positive")
        torch.set_num_threads(args.torch_threads)
    set_seed(0)

    base_dir = release_dir / "base-repo"
    model_dir = release_dir / "model-repo"
    tokenizer = AutoTokenizer.from_pretrained(
        model_dir,
        src_lang=args.source_lang,
        tgt_lang=args.target_lang,
        local_files_only=True,
    )
    target_id = language_id(tokenizer, args.target_lang)
    source_id = language_id(tokenizer, args.source_lang)
    if target_id != args.expected_target_token_id:
        raise RuntimeError(
            f"Target token ID changed: {target_id} != {args.expected_target_token_id}"
        )
    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang

    model = AutoModelForSeq2SeqLM.from_pretrained(
        base_dir,
        torch_dtype=torch.bfloat16,
        local_files_only=True,
    )
    model.resize_token_embeddings(len(tokenizer))
    model = PeftModel.from_pretrained(model, model_dir, local_files_only=True)
    model.config.forced_bos_token_id = target_id
    model.generation_config.forced_bos_token_id = target_id
    model.generation_config.no_repeat_ngram_size = generation[
        "no_repeat_ngram_size"
    ]
    model.generation_config.repetition_penalty = generation["repetition_penalty"]
    model.generation_config.length_penalty = generation["length_penalty"]
    model.eval()

    observed_ids: list[list[int]] = []
    observed_texts: list[str] = []
    for offset in range(0, len(reference_rows), args.batch_size):
        batch = reference_rows[offset : offset + args.batch_size]
        encoded = tokenizer(
            [normalize(row["input_text"]) for row in batch],
            padding=True,
            truncation=True,
            max_length=args.max_source_length,
            return_tensors="pt",
        )
        with torch.no_grad():
            generated = model.generate(
                **encoded,
                forced_bos_token_id=target_id,
                max_new_tokens=generation["max_new_tokens"],
                num_beams=generation["num_beams"],
                do_sample=False,
                no_repeat_ngram_size=generation["no_repeat_ngram_size"],
                repetition_penalty=generation["repetition_penalty"],
                length_penalty=generation["length_penalty"],
            )
        batch_ids = [
            trim_trailing_pad(
                [int(token_id) for token_id in sequence], tokenizer.pad_token_id
            )
            for sequence in generated.cpu().tolist()
        ]
        observed_ids.extend(batch_ids)
        observed_texts.extend(
            tokenizer.batch_decode(generated, skip_special_tokens=True)
        )

    expected_texts = tokenizer.batch_decode(
        [row["adapter_token_ids"] for row in reference_rows],
        skip_special_tokens=True,
    )
    predictions = compare_predictions(
        reference_rows, observed_ids, observed_texts, expected_texts
    )
    static_passed = all(check["passed"] for check in static_checks.values())
    smoke_rows = [
        {
            "id": row["id"],
            "nonblank": bool(normalize(text)),
            "not_source_copy": normalize(text) != normalize(row["input_text"]),
            "target_prefix": len(token_ids) >= 2 and token_ids[1] == target_id,
            "eos_terminated": bool(token_ids) and token_ids[-1] == tokenizer.eos_token_id,
        }
        for row, token_ids, text in zip(
            reference_rows, observed_ids, observed_texts, strict=True
        )
    ]
    smoke_passed = all(
        all(value for key, value in row.items() if key != "id")
        for row in smoke_rows
    )
    diagnostic_exact = sum(row["token_ids_equal"] for row in predictions)
    report = {
        "schema_version": 1,
        "kind": "staged_hugging_face_base_plus_adapter_identity_and_load_smoke",
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "release_id": manifest["release_id"],
        "reference_report": {
            "path": str(reference_path),
            "sha256": sha256(reference_path),
            "purpose": (
                "fixed smoke inputs and non-authoritative runtime-drift diagnostic; "
                "the report's merged output was rejected"
            ),
        },
        "runtime": {
            "device": "cpu",
            "dtype": str(next(model.parameters()).dtype),
            "torch_threads": torch.get_num_threads(),
            "torch": torch.__version__,
            "transformers": importlib.metadata.version("transformers"),
            "peft": importlib.metadata.version("peft"),
            "batch_size": args.batch_size,
        },
        "languages": {
            "source": args.source_lang,
            "source_token_id": source_id,
            "target": args.target_lang,
            "target_token_id": target_id,
        },
        "generation": {**generation, "do_sample": False},
        "checks": {
            "static": static_checks,
            "generation_contract": {
                "expected": required_generation,
                "observed": generation,
                "passed": generation_check,
            },
            "load_smoke": {
                "passed_rows": sum(
                    all(value for key, value in row.items() if key != "id")
                    for row in smoke_rows
                ),
                "total_rows": len(predictions),
                "passed": smoke_passed,
                "rows": smoke_rows,
            },
            "non_authoritative_reference_drift": {
                "exact_token_rows": diagnostic_exact,
                "total_rows": len(predictions),
                "authoritative_gate": False,
                "reason": (
                    "NLLB beam outputs can change with batching, embedding-topology "
                    "normalization, hardware, and kernels even when artifact hashes match."
                ),
            },
        },
        "predictions": predictions,
        "passed": static_passed and generation_check and smoke_passed,
        "claim_limit": (
            "Hashes bind the exact evaluated base, adapter, and tokenizer. The six "
            "CPU-BF16 probes verify loadability and output invariants, not exact "
            "cross-runtime generation or translation quality, and do not authorize deployment."
        ),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"passed": report["passed"], "rows": len(predictions)}, indent=2))
    if not report["passed"]:
        raise SystemExit("Staged Hugging Face adapter failed release verification")


if __name__ == "__main__":
    main()

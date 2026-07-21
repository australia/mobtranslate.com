#!/usr/bin/env python3
"""Prove tokenizer behavior is unchanged, then restore frozen bundle bytes."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any, Iterable, Sequence


TOKENIZER_BUNDLE_NAMES = (
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-dir", type=Path, required=True)
    parser.add_argument("--adapter-dir", type=Path, required=True)
    parser.add_argument("--data-file", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="mic_Latn")
    parser.add_argument("--max-length", type=int, default=192)
    parser.add_argument("--expected-base-bundle-sha256", required=True)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bundle_identity(root: Path) -> dict[str, Any]:
    files = {}
    digest = hashlib.sha256()
    for name in TOKENIZER_BUNDLE_NAMES:
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(path)
        value = sha256(path)
        files[name] = value
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(value))
    return {
        "algorithm": "sha256(relative_name_nul_file_sha256_bytes)",
        "sha256": digest.hexdigest(),
        "files": files,
    }


def read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"non-object at {path}:{line_number}")
            yield value


def text_inventory(paths: Sequence[Path]) -> tuple[list[str], list[str], int]:
    sources: set[str] = set()
    targets: set[str] = set()
    rows = 0
    for path in paths:
        for row in read_jsonl(path):
            rows += 1
            source = str(row.get("input_text") or "")
            if source:
                sources.add(source)
            target = str(row.get("output_text") or "")
            if target:
                targets.add(target)
            for reference in row.get("accepted_references") or []:
                reference = str(reference)
                if reference:
                    targets.add(reference)
    return sorted(sources), sorted(targets), rows


def json_sha256(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def batched(values: Sequence[str], size: int = 256) -> Iterable[Sequence[str]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]


def encoded_ids(
    tokenizer: Any,
    texts: Sequence[str],
    *,
    target: bool,
    max_length: int,
) -> list[list[int]]:
    result: list[list[int]] = []
    for batch in batched(texts):
        kwargs = {
            "add_special_tokens": True,
            "padding": False,
            "truncation": True,
            "max_length": max_length,
        }
        encoded = (
            tokenizer(text_target=list(batch), **kwargs)
            if target
            else tokenizer(list(batch), **kwargs)
        )
        result.extend([[int(token) for token in row] for row in encoded["input_ids"]])
    return result


def semantic_identity(
    base: Any,
    adapter: Any,
    *,
    sources: Sequence[str],
    targets: Sequence[str],
    source_lang: str,
    target_lang: str,
    max_length: int,
) -> dict[str, Any]:
    base_vocab = base.get_vocab()
    adapter_vocab = adapter.get_vocab()
    checks = {
        "tokenizer_class_equal": type(base).__name__ == type(adapter).__name__,
        "fast_mode_equal": bool(base.is_fast) == bool(adapter.is_fast),
        "vocabulary_equal": base_vocab == adapter_vocab,
        "length_equal": len(base) == len(adapter),
        "special_tokens_equal": [str(value) for value in base.all_special_tokens]
        == [str(value) for value in adapter.all_special_tokens],
        "special_token_ids_equal": list(base.all_special_ids)
        == list(adapter.all_special_ids),
        "source_language_id_equal": base.convert_tokens_to_ids(source_lang)
        == adapter.convert_tokens_to_ids(source_lang),
        "target_language_id_equal": base.convert_tokens_to_ids(target_lang)
        == adapter.convert_tokens_to_ids(target_lang),
    }
    if not all(checks.values()):
        raise ValueError(f"tokenizer structural identity failed: {checks}")

    base_sources = encoded_ids(base, sources, target=False, max_length=max_length)
    adapter_sources = encoded_ids(adapter, sources, target=False, max_length=max_length)
    base_targets = encoded_ids(base, targets, target=True, max_length=max_length)
    adapter_targets = encoded_ids(adapter, targets, target=True, max_length=max_length)
    checks["all_source_encodings_equal"] = base_sources == adapter_sources
    checks["all_target_encodings_equal"] = base_targets == adapter_targets
    if not all(checks.values()):
        raise ValueError(f"tokenizer behavioral identity failed: {checks}")

    return {
        "status": "PASS",
        "checks": checks,
        "vocabulary_size": len(base_vocab),
        "vocabulary_sha256": json_sha256(base_vocab),
        "source_strings": len(sources),
        "target_strings": len(targets),
        "source_encoding_ledger_sha256": json_sha256(base_sources),
        "target_encoding_ledger_sha256": json_sha256(base_targets),
        "source_language_token_id": int(base.convert_tokens_to_ids(source_lang)),
        "target_language_token_id": int(base.convert_tokens_to_ids(target_lang)),
    }


def main() -> None:
    args = parse_args()
    base_dir = args.base_dir.expanduser().resolve()
    adapter_dir = args.adapter_dir.expanduser().resolve()
    data_files = [path.expanduser().resolve() for path in args.data_file]
    output = args.output.expanduser().resolve()
    if output.exists():
        raise FileExistsError(output)
    if args.max_length < 1:
        raise ValueError("--max-length must be positive")

    before_base = bundle_identity(base_dir)
    before_adapter = bundle_identity(adapter_dir)
    if before_base["sha256"] != args.expected_base_bundle_sha256:
        raise ValueError("frozen base tokenizer bundle hash mismatch")

    from transformers import AutoTokenizer

    load_args = {
        "src_lang": args.source_lang,
        "tgt_lang": args.target_lang,
        "use_fast": True,
        "local_files_only": True,
    }
    base_tokenizer = AutoTokenizer.from_pretrained(base_dir, **load_args)
    adapter_tokenizer = AutoTokenizer.from_pretrained(adapter_dir, **load_args)
    sources, targets, rows = text_inventory(data_files)
    semantic = semantic_identity(
        base_tokenizer,
        adapter_tokenizer,
        sources=sources,
        targets=targets,
        source_lang=args.source_lang,
        target_lang=args.target_lang,
        max_length=args.max_length,
    )

    for name in TOKENIZER_BUNDLE_NAMES:
        shutil.copy2(base_dir / name, adapter_dir / name)
    after_adapter = bundle_identity(adapter_dir)
    if after_adapter != before_base:
        raise RuntimeError("canonicalized adapter tokenizer bundle is not byte-identical to base")

    record = {
        "schema_version": 1,
        "created_at": utc_now(),
        "status": "PASS",
        "reason": (
            "Transformers reserialized behavior-equivalent special-token and runtime truncation "
            "metadata while saving a LoRA-only adapter. Full vocabulary and every source/target "
            "encoding in the frozen screen inputs were proved identical before restoring the "
            "exact frozen base tokenizer bytes."
        ),
        "operation_scope": "tokenizer serialization only; no model tensor was read or changed",
        "data_files": [
            {"path": str(path), "sha256": sha256(path)} for path in data_files
        ],
        "data_rows_examined": rows,
        "base_bundle_before": before_base,
        "adapter_bundle_before": before_adapter,
        "semantic_identity_before_canonicalization": semantic,
        "adapter_bundle_after": after_adapter,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build a collision-free NLLB tokenizer extension from declared training text."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import tempfile
import unicodedata
from typing import Any, Iterable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-tokenizer", type=Path, required=True)
    parser.add_argument("--train-file", type=Path, action="append", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--text-field", default="output_text")
    parser.add_argument("--task-field", default="pair_kind")
    parser.add_argument("--include-task", action="append", default=[])
    parser.add_argument("--exclude-task", action="append", default=[])
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--control-token", action="append", default=[])
    parser.add_argument("--vocab-size", type=int, required=True)
    parser.add_argument("--model-type", choices=("unigram", "bpe"), default="unigram")
    parser.add_argument("--max-sentencepiece-length", type=int, default=128)
    return parser.parse_args()


def normalize_text(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def load_training_texts(
    paths: list[Path],
    text_field: str,
    direction: str,
    task_field: str = "pair_kind",
    include_tasks: set[str] | None = None,
    exclude_tasks: set[str] | None = None,
) -> tuple[list[str], dict[str, Any]]:
    include_tasks = include_tasks or set()
    exclude_tasks = exclude_tasks or set()
    texts: list[str] = []
    files: list[dict[str, Any]] = []
    for path in paths:
        path = path.expanduser().resolve()
        if not path.is_file():
            raise FileNotFoundError(path)
        accepted = 0
        skipped_direction = 0
        skipped_task = 0
        task_counts: Counter[str] = Counter()
        with path.open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
                if row.get("direction") not in (None, direction):
                    skipped_direction += 1
                    continue
                task = str(row.get(task_field) or "")
                task_counts[task] += 1
                if (include_tasks and task not in include_tasks) or task in exclude_tasks:
                    skipped_task += 1
                    continue
                text = normalize_text(row.get(text_field))
                if not text:
                    raise ValueError(f"blank {text_field!r} at {path}:{line_number}")
                texts.append(text)
                accepted += 1
        files.append(
            {
                "path": str(path),
                "sha256": sha256(path),
                "accepted_rows": accepted,
                "skipped_direction_rows": skipped_direction,
                "skipped_task_rows": skipped_task,
                "task_counts_before_filter": dict(sorted(task_counts.items())),
            }
        )
    if not texts:
        raise ValueError("no training text remained after filtering")
    return texts, {"files": files, "rows": len(texts), "unique_texts": len(set(texts))}


def percentile(values: list[int], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def fertility_summary(tokenizer: Any, texts: list[str]) -> dict[str, Any]:
    counts = [len(tokenizer(text, add_special_tokens=False)["input_ids"]) for text in texts]
    words = [max(1, len(text.split())) for text in texts]
    fertility = [count / word_count for count, word_count in zip(counts, words)]
    return {
        "rows": len(texts),
        "tokens": sum(counts),
        "words": sum(words),
        "tokens_per_word": sum(counts) / sum(words),
        "tokens_per_row_mean": sum(counts) / len(counts),
        "tokens_per_row_median": percentile(counts, 0.5),
        "tokens_per_row_p90": percentile(counts, 0.9),
        "tokens_per_row_p99": percentile(counts, 0.99),
        "row_fertility_mean": sum(fertility) / len(fertility),
        "row_fertility_median": percentile([round(value * 1_000_000) for value in fertility], 0.5) / 1_000_000,
    }


def preserve_special_tokens(tokenizer: Any, tokens: list[str]) -> None:
    mask = tokenizer.mask_token
    merged: list[str] = []
    for token in list(tokenizer.additional_special_tokens or []) + tokens:
        if token and token != mask and token not in merged:
            merged.append(token)
    if mask:
        merged.append(mask)
    tokenizer.add_special_tokens(
        {"additional_special_tokens": merged},
        replace_additional_special_tokens=True,
    )


def piece_surface(piece: str) -> str:
    return piece[1:] if piece.startswith("▁") else piece


def build_tokenizer(
    base_path: Path,
    texts: list[str],
    output_dir: Path,
    source_lang: str,
    target_lang: str,
    control_tokens: list[str],
    vocab_size: int,
    model_type: str,
    max_sentencepiece_length: int,
) -> dict[str, Any]:
    import sentencepiece as spm
    from sentencepiece import sentencepiece_model_pb2 as sp_model_pb2
    from transformers import AutoTokenizer, NllbTokenizer

    base_tokenizer = AutoTokenizer.from_pretrained(
        str(base_path),
        use_fast=False,
        src_lang=source_lang,
        tgt_lang=target_lang,
        local_files_only=True,
    )
    if type(base_tokenizer).__name__ != "NllbTokenizer":
        raise TypeError(f"expected slow NllbTokenizer, got {type(base_tokenizer).__name__}")

    corpus_path = output_dir / "training-targets.txt"
    corpus_path.write_text("".join(f"{text}\n" for text in texts), encoding="utf-8")
    auxiliary_prefix = output_dir / "auxiliary-sentencepiece"
    spm.SentencePieceTrainer.train(
        input=str(corpus_path),
        model_prefix=str(auxiliary_prefix),
        model_type=model_type,
        vocab_size=vocab_size,
        character_coverage=1.0,
        num_threads=1,
        input_sentence_size=0,
        shuffle_input_sentence=False,
        add_dummy_prefix=False,
        max_sentencepiece_length=max_sentencepiece_length,
        pad_id=0,
        eos_id=1,
        unk_id=2,
        bos_id=-1,
        hard_vocab_limit=False,
    )

    auxiliary = sp_model_pb2.ModelProto()
    auxiliary.ParseFromString((output_dir / "auxiliary-sentencepiece.model").read_bytes())
    merged = sp_model_pb2.ModelProto()
    merged.ParseFromString(base_tokenizer.sp_model.serialized_model_proto())
    existing = {piece.piece for piece in merged.pieces}
    blocked = set(base_tokenizer.get_vocab())
    score_floor = min(piece.score for piece in merged.pieces)
    added_pieces: list[str] = []
    skipped_existing = 0
    skipped_non_normal = 0
    for piece in auxiliary.pieces:
        if getattr(piece, "type", 1) != 1:
            skipped_non_normal += 1
            continue
        if piece.piece in existing or piece.piece in blocked:
            skipped_existing += 1
            continue
        new_piece = merged.pieces.add()
        new_piece.piece = piece.piece
        new_piece.score = piece.score + score_floor
        existing.add(piece.piece)
        added_pieces.append(piece.piece)

    merged_spm_path = output_dir / "merged-sentencepiece.model"
    merged_spm_path.write_bytes(merged.SerializeToString())

    # Construct from the merged SPM rather than reloading the old tokenizer config.
    # This relocates every built-in NLLB language code after the enlarged SPM range.
    tokenizer = NllbTokenizer(
        vocab_file=str(merged_spm_path),
        src_lang=source_lang,
        tgt_lang=target_lang,
        legacy_behaviour=False,
    )
    custom_tokens = list(dict.fromkeys([target_lang, *control_tokens]))
    preserve_special_tokens(tokenizer, custom_tokens)
    tokenizer.src_lang = source_lang
    tokenizer.tgt_lang = target_lang

    tokenizer_dir = output_dir / "tokenizer"
    tokenizer.save_pretrained(tokenizer_dir)
    reloaded = NllbTokenizer.from_pretrained(
        tokenizer_dir,
        use_fast=False,
        src_lang=source_lang,
        tgt_lang=target_lang,
        local_files_only=True,
    )

    old_vocab = base_tokenizer.get_vocab()
    new_vocab = reloaded.get_vocab()
    duplicate_ids = len(new_vocab) - len(set(new_vocab.values()))
    normal_id_limit = int(reloaded.sp_model_size + reloaded.fairseq_offset)
    added_range_collisions = [
        {"id": int(token_id), "token": str(token)}
        for token_id, token in reloaded.added_tokens_decoder.items()
        if int(token_id) >= 4 and int(token_id) < normal_id_limit
    ]
    required_specials = list(dict.fromkeys([source_lang, target_lang, *control_tokens]))
    special_checks = {}
    for token in required_specials:
        token_id = int(reloaded.convert_tokens_to_ids(token))
        special_checks[token] = {
            "id": token_id,
            "is_unknown": token_id == reloaded.unk_token_id,
            "round_trip": reloaded.convert_ids_to_tokens(token_id) == token,
            "single_encoded_id": reloaded(token, add_special_tokens=False)["input_ids"] == [token_id],
        }

    old_decodes: list[str] = []
    new_decodes: list[str] = []
    for text in texts:
        old_ids = base_tokenizer(text, add_special_tokens=False)["input_ids"]
        new_ids = reloaded(text, add_special_tokens=False)["input_ids"]
        old_decodes.append(normalize_text(base_tokenizer.decode(old_ids, skip_special_tokens=False)))
        new_decodes.append(normalize_text(reloaded.decode(new_ids, skip_special_tokens=False)))
    old_original_failures = sum(left != right for left, right in zip(old_decodes, texts))
    new_original_failures = sum(left != right for left, right in zip(new_decodes, texts))
    old_new_decode_differences = sum(left != right for left, right in zip(old_decodes, new_decodes))
    decode_difference_samples = [
        {"input": text, "base_decode": old_decode, "extended_decode": new_decode}
        for text, old_decode, new_decode in zip(texts, old_decodes, new_decodes)
        if old_decode != new_decode
    ][:25]

    common_tokens = sorted(set(old_vocab) & set(new_vocab), key=lambda token: (old_vocab[token], token))
    remap_rows = [
        {
            "token": token,
            "old_id": int(old_vocab[token]),
            "new_id": int(new_vocab[token]),
            "moved": int(old_vocab[token]) != int(new_vocab[token]),
        }
        for token in common_tokens
    ]
    write_jsonl(output_dir / "token-id-remap.jsonl", remap_rows)

    new_piece_rows = []
    for piece in added_pieces:
        token_id = int(new_vocab[piece])
        surface = piece_surface(piece)
        decomposition = base_tokenizer(surface, add_special_tokens=False)["input_ids"]
        if not decomposition:
            decomposition = [base_tokenizer.unk_token_id]
        new_piece_rows.append(
            {
                "token": piece,
                "token_id": token_id,
                "surface_for_initialization": surface,
                "old_decomposition_ids": [int(value) for value in decomposition],
            }
        )
    write_jsonl(output_dir / "new-piece-map.jsonl", new_piece_rows)

    trainable_tokens = list(dict.fromkeys([*added_pieces, target_lang, *control_tokens]))
    trainable_rows = [
        {"token": token, "token_id": int(new_vocab[token])}
        for token in trainable_tokens
    ]
    write_json(output_dir / "trainable-token-ids.json", trainable_rows)

    checks = {
        "tokenizer_reload_vocab_identical": tokenizer.get_vocab() == new_vocab,
        "tokenizer_reload_length_identical": len(tokenizer) == len(reloaded),
        "unique_vocabulary_ids": duplicate_ids == 0,
        "no_added_token_spm_range_collisions": not added_range_collisions,
        "required_special_tokens_valid": all(
            not item["is_unknown"] and item["round_trip"] and item["single_encoded_id"]
            for item in special_checks.values()
        ),
        "training_source_round_trip_exact": new_original_failures == 0,
    }
    failed = [name for name, passed in checks.items() if not passed]
    result = {
        "status": "PASS" if not failed else "FAIL",
        "checks": checks,
        "failed_checks": failed,
        "base_tokenizer_class": type(base_tokenizer).__name__,
        "new_tokenizer_class": type(reloaded).__name__,
        "base_tokenizer_length": len(base_tokenizer),
        "new_tokenizer_length": len(reloaded),
        "base_spm_pieces": int(base_tokenizer.sp_model_size),
        "new_spm_pieces": int(reloaded.sp_model_size),
        "requested_auxiliary_vocab_size": vocab_size,
        "auxiliary_piece_count": len(auxiliary.pieces),
        "added_normal_piece_count": len(added_pieces),
        "skipped_existing_piece_count": skipped_existing,
        "skipped_non_normal_piece_count": skipped_non_normal,
        "common_token_count": len(common_tokens),
        "moved_common_token_count": sum(row["moved"] for row in remap_rows),
        "duplicate_vocabulary_id_count": duplicate_ids,
        "added_token_spm_range_collisions": added_range_collisions,
        "special_tokens": special_checks,
        "trainable_token_count": len(trainable_rows),
        "round_trip": {
            "rows": len(texts),
            "base_vs_original_failures": old_original_failures,
            "extended_vs_original_failures": new_original_failures,
            "extended_vs_base_differences": old_new_decode_differences,
            "difference_samples": decode_difference_samples,
        },
        "fertility": {
            "base": fertility_summary(base_tokenizer, texts),
            "extended": fertility_summary(reloaded, texts),
        },
    }
    return result


def main() -> None:
    args = parse_args()
    if args.vocab_size < 128:
        raise SystemExit("--vocab-size must be at least 128")
    if args.max_sentencepiece_length < 1:
        raise SystemExit("--max-sentencepiece-length must be positive")
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)

    include_tasks = set(args.include_task)
    exclude_tasks = set(args.exclude_task)
    overlap = include_tasks & exclude_tasks
    if overlap:
        raise SystemExit(f"tasks cannot be both included and excluded: {sorted(overlap)}")
    texts, corpus_manifest = load_training_texts(
        args.train_file,
        args.text_field,
        args.direction,
        args.task_field,
        include_tasks,
        exclude_tasks,
    )
    with tempfile.TemporaryDirectory(prefix=f".{output_dir.name}.", dir=output_dir.parent) as temporary:
        temporary_dir = Path(temporary)
        result = build_tokenizer(
            args.base_tokenizer.expanduser().resolve(),
            texts,
            temporary_dir,
            args.source_lang,
            args.target_lang,
            args.control_token,
            args.vocab_size,
            args.model_type,
            args.max_sentencepiece_length,
        )
        files = {
            path.relative_to(temporary_dir).as_posix(): sha256(path)
            for path in sorted(temporary_dir.rglob("*"))
            if path.is_file()
        }
        manifest = {
            "schema_version": 1,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "operation": "collision_free_nllb_sentencepiece_extension",
            "base_tokenizer": str(args.base_tokenizer.expanduser().resolve()),
            "source_lang": args.source_lang,
            "target_lang": args.target_lang,
            "control_tokens": list(dict.fromkeys(args.control_token)),
            "direction": args.direction,
            "text_field": args.text_field,
            "task_field": args.task_field,
            "include_tasks": sorted(include_tasks),
            "exclude_tasks": sorted(exclude_tasks),
            "sentencepiece": {
                "model_type": args.model_type,
                "requested_vocab_size": args.vocab_size,
                "character_coverage": 1.0,
                "num_threads": 1,
                "shuffle_input_sentence": False,
                "add_dummy_prefix": False,
                "max_sentencepiece_length": args.max_sentencepiece_length,
            },
            "corpus": corpus_manifest,
            "result": result,
            "environment": {
                "sentencepiece": package_version("sentencepiece"),
                "transformers": package_version("transformers"),
                "protobuf": package_version("protobuf"),
            },
            "artifact_sha256": files,
        }
        write_json(temporary_dir / "tokenizer-extension-manifest.json", manifest)
        Path(temporary).rename(output_dir)
    print(json.dumps({"output_dir": str(output_dir), **result}, ensure_ascii=False, indent=2))
    if result["failed_checks"]:
        raise SystemExit(f"tokenizer extension failed invariants: {', '.join(result['failed_checks'])}")


if __name__ == "__main__":
    main()

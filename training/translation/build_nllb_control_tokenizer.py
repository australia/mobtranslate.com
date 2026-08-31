#!/usr/bin/env python3
"""Freeze a language-specific NLLB control-token tokenizer without training."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from typing import Any


TOKENIZER_BUNDLE_NAMES = (
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-model", type=Path, required=True)
    parser.add_argument("--base-model-id", required=True)
    parser.add_argument("--base-revision", required=True)
    parser.add_argument("--expected-base-model-sha256", required=True)
    parser.add_argument("--expected-base-tokenizer-sha256", required=True)
    parser.add_argument("--expected-base-sentencepiece-sha256", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--contract-id", required=True)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", required=True)
    parser.add_argument(
        "--target-init-strategy",
        choices=("copy_existing", "decomposition_mean"),
        default="copy_existing",
        help=(
            "Initialize the target-language input/output rows by copying one existing "
            "language token or by averaging the target token's own base decomposition."
        ),
    )
    parser.add_argument(
        "--target-init-token",
        default="",
        help="Required only when --target-init-strategy=copy_existing.",
    )
    parser.add_argument("--task-token", action="append", default=[])
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bundle_identity(
    root: Path,
    names: tuple[str, ...],
    known_hashes: dict[str, str] | None = None,
) -> dict[str, Any]:
    files = [root / name for name in names if (root / name).is_file()]
    if not files:
        raise FileNotFoundError(f"no bundle files found under {root}")
    digest = hashlib.sha256()
    hashes: dict[str, str] = {}
    for path in files:
        file_hash = (known_hashes or {}).get(path.name) or sha256_file(path)
        hashes[path.name] = file_hash
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(file_hash))
    return {
        "algorithm": "sha256(relative_name_nul_file_sha256_bytes)",
        "sha256": digest.hexdigest(),
        "files": hashes,
    }


def unique_nonempty(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        value = str(value).strip()
        if value and value not in result:
            result.append(value)
    return result


def exact_token_id(tokenizer: Any, token: str) -> int:
    token_id = int(tokenizer.convert_tokens_to_ids(token))
    if token_id == int(tokenizer.unk_token_id):
        raise ValueError(f"token is absent: {token!r}")
    if tokenizer.convert_ids_to_tokens(token_id) != token:
        raise ValueError(f"token does not round-trip: {token!r} -> {token_id}")
    if [int(item) for item in tokenizer.encode(token, add_special_tokens=False)] != [token_id]:
        raise ValueError(f"token is not represented by one exact ID: {token!r}")
    return token_id


def language_maps(tokenizer: Any, token: str, token_id: int) -> None:
    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = token


def preserve_and_append_special_tokens(tokenizer: Any, additions: list[str]) -> None:
    mask = tokenizer.mask_token
    merged: list[str] = []
    for token in list(tokenizer.additional_special_tokens or []) + additions:
        if token and token != mask and token not in merged:
            merged.append(token)
    if mask:
        merged.append(mask)
    tokenizer.add_special_tokens(
        {"additional_special_tokens": merged},
        replace_additional_special_tokens=True,
    )


def build_extension_plan(
    tokenizer: Any,
    *,
    source_lang: str,
    target_lang: str,
    target_init_token: str | None,
    target_init_strategy: str = "copy_existing",
    task_tokens: list[str],
) -> tuple[dict[str, Any], dict[str, int]]:
    raw_task_tokens = [str(token).strip() for token in task_tokens]
    normalized_target = str(target_lang).strip()
    task_tokens = unique_nonempty(raw_task_tokens)
    additions = unique_nonempty([normalized_target, *raw_task_tokens])
    if (
        not normalized_target
        or raw_task_tokens != task_tokens
        or additions != [normalized_target, *task_tokens]
    ):
        raise ValueError("target and task control tokens must be nonempty and unique")
    target_lang = normalized_target

    base_vocab = {str(token): int(token_id) for token, token_id in tokenizer.get_vocab().items()}
    base_length = len(tokenizer)
    if len(base_vocab) != base_length:
        raise ValueError(
            f"base tokenizer vocabulary is not one-to-one: vocab={len(base_vocab)}, len={base_length}"
        )
    source_id = exact_token_id(tokenizer, source_lang)
    normalized_init_token = str(target_init_token or "").strip()
    if target_init_strategy == "copy_existing":
        if not normalized_init_token:
            raise ValueError(
                "target_init_token is required when target_init_strategy='copy_existing'"
            )
        target_init_id = exact_token_id(tokenizer, normalized_init_token)
    elif target_init_strategy == "decomposition_mean":
        if normalized_init_token:
            raise ValueError(
                "target_init_token must be empty when "
                "target_init_strategy='decomposition_mean'"
            )
        target_init_id = None
    else:
        raise ValueError(f"unsupported target initialization strategy: {target_init_strategy!r}")

    decompositions: dict[str, dict[str, Any]] = {}
    for token in additions:
        existing_id = int(tokenizer.convert_tokens_to_ids(token))
        if existing_id != int(tokenizer.unk_token_id):
            raise ValueError(f"extension token already exists in the base tokenizer: {token!r}")
        token_ids = [int(item) for item in tokenizer.encode(token, add_special_tokens=False)]
        if not token_ids or int(tokenizer.unk_token_id) in token_ids:
            raise ValueError(f"invalid base decomposition for {token!r}: {token_ids}")
        decompositions[token] = {
            "base_decomposition_ids": token_ids,
            "base_decomposition_tokens": tokenizer.convert_ids_to_tokens(token_ids),
        }

    preserve_and_append_special_tokens(tokenizer, additions)
    candidate_vocab = {
        str(token): int(token_id) for token, token_id in tokenizer.get_vocab().items()
    }
    moved = [
        {"token": token, "old_id": old_id, "new_id": candidate_vocab.get(token)}
        for token, old_id in sorted(base_vocab.items(), key=lambda item: item[1])
        if candidate_vocab.get(token) != old_id
    ]
    if moved:
        raise RuntimeError(f"control-token extension relocated base token IDs: {moved[:10]}")
    if len(tokenizer) != base_length + len(additions):
        raise RuntimeError(
            "control-token extension size is not exact: "
            f"base={base_length}, additions={len(additions)}, result={len(tokenizer)}"
        )

    rows: list[dict[str, Any]] = []
    for offset, token in enumerate(additions):
        token_id = exact_token_id(tokenizer, token)
        expected_id = base_length + offset
        if token_id != expected_id:
            raise RuntimeError(f"appended token ID changed: {token!r}={token_id}, expected={expected_id}")
        if token_id not in tokenizer.all_special_ids:
            raise RuntimeError(f"appended token is not special: {token!r}")
        if token == target_lang and target_init_strategy == "copy_existing":
            initialization = {
                "strategy": "copy_existing_input_and_output_rows",
                "source_token": normalized_init_token,
                "source_token_id": target_init_id,
            }
        else:
            initialization = {
                "strategy": "base_decomposition_mean_input_and_output_rows",
                **decompositions[token],
            }
        rows.append(
            {
                "token": token,
                "token_id": token_id,
                "role": "target_language" if token == target_lang else "task_control",
                "initialization": initialization,
            }
        )

    target_id = int(candidate_vocab[target_lang])
    language_maps(tokenizer, source_lang, source_id)
    language_maps(tokenizer, target_lang, target_id)
    tokenizer.src_lang = source_lang
    tokenizer.tgt_lang = target_lang
    return (
        {
            "base_named_vocabulary_size": base_length,
            "extended_named_vocabulary_size": len(tokenizer),
            "base_tokens_preserved_at_identical_ids": len(base_vocab),
            "base_tokens_relocated": 0,
            "source_language": {"token": source_lang, "token_id": source_id},
            "target_language": {"token": target_lang, "token_id": target_id},
            "ordered_extension_rows": rows,
        },
        base_vocab,
    )


def verify_reload(tokenizer: Any, base_vocab: dict[str, int], plan: dict[str, Any]) -> dict[str, Any]:
    candidate_vocab = {
        str(token): int(token_id) for token, token_id in tokenizer.get_vocab().items()
    }
    moved = [token for token, token_id in base_vocab.items() if candidate_vocab.get(token) != token_id]
    if moved:
        raise RuntimeError(f"reloaded tokenizer relocated base tokens: {moved[:10]}")
    for row in plan["ordered_extension_rows"]:
        if exact_token_id(tokenizer, row["token"]) != int(row["token_id"]):
            raise RuntimeError(f"reloaded extension row changed: {row}")
    return {
        "status": "PASS",
        "vocabulary_size": len(tokenizer),
        "base_token_ids_preserved": len(base_vocab),
        "extension_tokens_verified": len(plan["ordered_extension_rows"]),
    }


def main() -> None:
    args = parse_args()
    base_model = args.base_model.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing to overwrite tokenizer contract: {output_dir}")
    required = {
        "pytorch_model.bin": args.expected_base_model_sha256,
        "tokenizer.json": args.expected_base_tokenizer_sha256,
        "sentencepiece.bpe.model": args.expected_base_sentencepiece_sha256,
    }
    observed = {name: sha256_file(base_model / name) for name in required}
    if observed != required:
        raise ValueError(f"base artifact hash mismatch: observed={observed}, expected={required}")
    config = json.loads((base_model / "config.json").read_text(encoding="utf-8"))

    # Tokenizer construction must not import Torch or page in model runtime code.
    os.environ.setdefault("USE_TORCH", "0")
    from transformers import AutoTokenizer

    base_tokenizer = AutoTokenizer.from_pretrained(
        base_model,
        use_fast=False,
        src_lang=args.source_lang,
        local_files_only=True,
    )
    plan, base_vocab = build_extension_plan(
        base_tokenizer,
        source_lang=args.source_lang,
        target_lang=args.target_lang,
        target_init_token=args.target_init_token,
        target_init_strategy=args.target_init_strategy,
        task_tokens=args.task_token,
    )
    model_vocab = int(config["vocab_size"])
    plan["upstream_model_vocabulary_size"] = model_vocab
    plan["rows_requiring_model_growth"] = max(
        0, int(plan["extended_named_vocabulary_size"]) - model_vocab
    )
    for row in plan["ordered_extension_rows"]:
        row["upstream_row_status"] = (
            "preallocated_unnamed_row" if int(row["token_id"]) < model_vocab else "new_model_row"
        )

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=output_dir.parent))
    try:
        tokenizer_dir = temporary / "tokenizer"
        base_tokenizer.save_pretrained(tokenizer_dir)

        slow = AutoTokenizer.from_pretrained(
            tokenizer_dir,
            use_fast=False,
            src_lang=args.source_lang,
            tgt_lang=args.target_lang,
            local_files_only=True,
        )
        slow_reload = verify_reload(slow, base_vocab, plan)
        fast = AutoTokenizer.from_pretrained(
            tokenizer_dir,
            use_fast=True,
            src_lang=args.source_lang,
            tgt_lang=args.target_lang,
            local_files_only=True,
        )
        fast_reload = verify_reload(fast, base_vocab, plan)
        fast.save_pretrained(tokenizer_dir)
        slow_final = AutoTokenizer.from_pretrained(
            tokenizer_dir,
            use_fast=False,
            src_lang=args.source_lang,
            tgt_lang=args.target_lang,
            local_files_only=True,
        )
        fast_final = AutoTokenizer.from_pretrained(
            tokenizer_dir,
            use_fast=True,
            src_lang=args.source_lang,
            tgt_lang=args.target_lang,
            local_files_only=True,
        )
        final_reload = {
            "slow": verify_reload(slow_final, base_vocab, plan),
            "fast": verify_reload(fast_final, base_vocab, plan),
        }
        tokenizer_bundle = bundle_identity(tokenizer_dir, TOKENIZER_BUNDLE_NAMES)
        base_bundle = bundle_identity(
            base_model,
            (
                "config.json",
                "generation_config.json",
                "pytorch_model.bin",
                *TOKENIZER_BUNDLE_NAMES,
            ),
            known_hashes=observed,
        )
        manifest = {
            "schema_version": 1,
            "contract_id": args.contract_id,
            "created_at": utc_now(),
            "status": "PASS",
            "artifact_kind": "nllb_control_tokenizer_without_training",
            "base": {
                "model_id": args.base_model_id,
                "revision": args.base_revision,
                "local_path": str(base_model),
                "bundle": base_bundle,
                "declared_hashes": required,
            },
            "extension": plan,
            "reload_audit": {
                "before_fast_serialization": {"slow": slow_reload, "fast": fast_reload},
                "final": final_reload,
            },
            "tokenizer_bundle": tokenizer_bundle,
            "model_initialization_contract": {
                "preserve_upstream_named_rows": True,
                "initialize_every_extension_input_row": True,
                "initialize_every_extension_output_row": True,
                "resize_with_mean_resizing": False,
                "decoder_start_token": "</s>",
                "forced_target_bos": args.target_lang,
            },
            "claim_limit": (
                "This artifact freezes token identities and deterministic row initialization only. "
                "It contains no language training and establishes no lexical or translation ability."
            ),
            "builder": {
                "path": str(Path(__file__).resolve()),
                "sha256": sha256_file(Path(__file__).resolve()),
            },
        }
        (temporary / "MANIFEST.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary.rename(output_dir)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

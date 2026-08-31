"""Dependency-free NLLB source and target sequence invariants."""

from __future__ import annotations

from typing import Any


def audit_nllb_language_sequences(
    tokenizer: Any,
    *,
    source_lang: str,
    target_lang: str,
    probe: str = "nllb language sequence audit",
) -> dict[str, Any]:
    """Fail unless source and target sequences use NLLB language-prefix layout."""
    tokenizer.src_lang = source_lang
    tokenizer.tgt_lang = target_lang
    source_lang_id = int(tokenizer.convert_tokens_to_ids(source_lang))
    target_lang_id = int(tokenizer.convert_tokens_to_ids(target_lang))
    eos_token_id = int(tokenizer.eos_token_id)
    unknown_token_id = int(tokenizer.unk_token_id)
    for language, token_id in (
        (source_lang, source_lang_id),
        (target_lang, target_lang_id),
    ):
        encoded = [
            int(item)
            for item in tokenizer.encode(language, add_special_tokens=False)
        ]
        if (
            token_id == unknown_token_id
            or tokenizer.convert_ids_to_tokens(token_id) != language
            or encoded != [token_id]
            or token_id not in tokenizer.all_special_ids
        ):
            raise RuntimeError(
                "NLLB language token is not one exact registered special token: "
                f"language={language!r}, id={token_id}, encoded={encoded}"
            )

    source_probe_ids = [
        int(item)
        for item in tokenizer(probe, add_special_tokens=True)["input_ids"]
    ]
    target_probe_ids = [
        int(item)
        for item in tokenizer(
            text_target=probe,
            add_special_tokens=True,
        )["input_ids"]
    ]
    expected_edges = {
        "source_prefix": source_lang_id,
        "source_suffix": eos_token_id,
        "target_prefix": target_lang_id,
        "target_suffix": eos_token_id,
    }
    observed_edges = {
        "source_prefix": source_probe_ids[0] if source_probe_ids else None,
        "source_suffix": source_probe_ids[-1] if source_probe_ids else None,
        "target_prefix": target_probe_ids[0] if target_probe_ids else None,
        "target_suffix": target_probe_ids[-1] if target_probe_ids else None,
    }
    if observed_edges != expected_edges:
        raise RuntimeError(
            "Tokenizer does not use the required NLLB language-prefix/EOS-suffix layout: "
            f"expected={expected_edges}, observed={observed_edges}, "
            f"source_ids={source_probe_ids}, target_ids={target_probe_ids}"
        )
    if target_lang_id in source_probe_ids or source_lang_id in target_probe_ids:
        raise RuntimeError(
            "NLLB source/target language tokens leaked into the opposite probe sequence: "
            f"source_ids={source_probe_ids}, target_ids={target_probe_ids}"
        )
    return {
        "status": "PASS",
        "probe": probe,
        "source_lang": source_lang,
        "source_lang_id": source_lang_id,
        "source_probe_ids": source_probe_ids,
        "target_lang": target_lang,
        "target_lang_id": target_lang_id,
        "target_probe_ids": target_probe_ids,
        "eos_token_id": eos_token_id,
        "layout": "language_prefix_text_eos_suffix",
    }

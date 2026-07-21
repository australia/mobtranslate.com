from __future__ import annotations

import json
from pathlib import Path

from canonicalize_identical_tokenizer_bundle import (
    TOKENIZER_BUNDLE_NAMES,
    bundle_identity,
    json_sha256,
    text_inventory,
)


def test_bundle_identity_binds_names_and_bytes(tmp_path: Path) -> None:
    for index, name in enumerate(TOKENIZER_BUNDLE_NAMES):
        (tmp_path / name).write_bytes(f"payload-{index}".encode())
    first = bundle_identity(tmp_path)
    second = bundle_identity(tmp_path)
    assert first == second
    assert set(first["files"]) == set(TOKENIZER_BUNDLE_NAMES)
    assert len(first["sha256"]) == 64


def test_text_inventory_deduplicates_sources_and_collects_references(tmp_path: Path) -> None:
    data = tmp_path / "rows.jsonl"
    rows = [
        {"input_text": "woman", "output_text": "e'pit", "accepted_references": ["e'pit"]},
        {"input_text": "woman", "output_text": "epit", "accepted_references": ["epit", "e'pit"]},
    ]
    data.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    sources, targets, count = text_inventory([data])
    assert sources == ["woman"]
    assert targets == ["e'pit", "epit"]
    assert count == 2


def test_json_sha256_is_mapping_order_independent() -> None:
    assert json_sha256({"a": 1, "b": 2}) == json_sha256({"b": 2, "a": 1})

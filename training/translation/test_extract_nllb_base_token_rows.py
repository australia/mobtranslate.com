from __future__ import annotations

import pytest

from training.translation.extract_nllb_base_token_rows import validate_token_bindings


def test_token_bindings_are_exact_and_ordered() -> None:
    assert validate_token_bindings(
        {"<translate>": 10, "<glossary>": 11},
        [
            {"token": "<translate>", "token_id": 10},
            {"token": "<glossary>", "token_id": 11},
        ],
    ) == [10, 11]


def test_token_bindings_reject_tokenizer_or_uniqueness_drift() -> None:
    with pytest.raises(ValueError, match="token ID mismatch"):
        validate_token_bindings(
            {"<glossary>": 12}, [{"token": "<glossary>", "token_id": 11}]
        )
    with pytest.raises(ValueError, match="duplicates"):
        validate_token_bindings(
            {"a": 10, "b": 10},
            [{"token": "a", "token_id": 10}, {"token": "b", "token_id": 10}],
        )

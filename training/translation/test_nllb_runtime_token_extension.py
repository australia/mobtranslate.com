from training.translation.nllb_runtime_token_extension import (
    pair_tokens_with_expected_ids,
)


def test_pairs_runtime_tokens_with_frozen_ids() -> None:
    assert pair_tokens_with_expected_ids(["<copy>"], [256208]) == [
        ("<copy>", 256208)
    ]


def test_rejects_missing_or_duplicate_runtime_token_ids() -> None:
    for tokens, ids in ((["<copy>"], []), (["<copy>", "<copy>"], [1, 2])):
        try:
            pair_tokens_with_expected_ids(tokens, ids)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid runtime token binding was accepted")

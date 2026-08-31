from __future__ import annotations

import numpy as np
import pytest

from training.translation.build_nllb_trainable_token_union_adapter import (
    expand_trainable_token_values,
)


def test_expansion_preserves_rows_and_appends_bound_replacement_values() -> None:
    source = np.arange(12, dtype=np.float32).reshape(3, 4)
    replacement = np.full((1, 4), 7.5, dtype=np.float32)
    expanded = expand_trainable_token_values(
        source, [10, 11, 12], [10, 11, 12, 13], replacement
    )

    assert expanded.shape == (4, 4)
    assert np.array_equal(expanded[:3], source)
    assert np.array_equal(expanded[3:], replacement)


@pytest.mark.parametrize(
    ("existing", "desired", "message"),
    [
        ([10, 11, 12], [10, 11, 13, 12], "ordered prefix"),
        ([10, 11, 12], [10, 11, 12], "strict superset"),
        ([10, 10, 12], [10, 10, 12, 13], "existing.*duplicates"),
        ([10, 11, 12], [10, 11, 12, 12], "desired.*duplicates"),
    ],
)
def test_expansion_rejects_ambiguous_index_contracts(
    existing: list[int], desired: list[int], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        expand_trainable_token_values(
            np.zeros((3, 4), dtype=np.float32),
            existing,
            desired,
            np.zeros((1, 4), dtype=np.float32),
        )


def test_expansion_rejects_wrong_replacement_shape_or_dtype() -> None:
    source = np.zeros((3, 4), dtype=np.float32)
    with pytest.raises(ValueError, match="wrong shape"):
        expand_trainable_token_values(
            source,
            [10, 11, 12],
            [10, 11, 12, 13],
            np.zeros((2, 4), dtype=np.float32),
        )
    with pytest.raises(ValueError, match="wrong dtype"):
        expand_trainable_token_values(
            source,
            [10, 11, 12],
            [10, 11, 12, 13],
            np.zeros((1, 4), dtype=np.float64),
        )

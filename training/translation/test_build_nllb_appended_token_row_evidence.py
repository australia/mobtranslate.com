import numpy as np

from training.translation.build_nllb_appended_token_row_evidence import (
    decomposition_mean,
)


def test_decomposition_mean_matches_float32_trainer_initialization() -> None:
    rows = np.array([[1.0, 2.0], [3.0, 6.0]], dtype=np.float16)
    result = decomposition_mean(rows)
    assert result.dtype == np.float32
    assert result.shape == (1, 2)
    assert np.array_equal(result, np.array([[2.0, 4.0]], dtype=np.float32))


def test_decomposition_mean_rejects_empty_or_nonmatrix_input() -> None:
    for value in (
        np.empty((0, 2), dtype=np.float32),
        np.array([1.0, 2.0], dtype=np.float32),
    ):
        try:
            decomposition_mean(value)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid source rows were accepted")

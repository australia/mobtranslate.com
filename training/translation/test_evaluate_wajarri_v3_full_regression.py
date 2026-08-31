from training.translation.evaluate_wajarri_v3_full_regression import (
    decode_preserving_task_tokens,
    summarize_rows,
)


class FakeTokenizer:
    pieces = {10: "jamarnimanha", 11: "."}

    def decode(self, values, **_kwargs):
        text = " ".join(self.pieces[value] for value in values)
        return text.replace(" .", ".")


def test_decode_keeps_generated_task_token_visible() -> None:
    prediction = decode_preserving_task_tokens(
        FakeTokenizer(),
        [2, 256208, 10, 11, 2],
        {256208: "<copy>"},
        {2, 256208},
    )
    assert prediction == "<copy> jamarnimanha."


def test_summary_counts_unresolved_task_token_as_fault() -> None:
    summary = summarize_rows(
        [
            {
                "exact": False,
                "chrf2": 50.0,
                "grapheme_cer": 0.5,
                "surface_class": "different_surface_form",
                "blank": False,
                "source_copy": False,
                "repeated_token_4gram": False,
                "unresolved_task_token": True,
            }
        ]
    )
    assert summary["faults"]["unresolved_task_token"] == 1

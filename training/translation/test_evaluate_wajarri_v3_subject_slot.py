from __future__ import annotations

from training.translation.evaluate_wajarri_v3_subject_slot import (
    SLOT_TOKEN,
    decoder_prefix_token_ids,
    decode_preserving_slot,
    filter_rows_by_endpoint,
    generation_kwargs,
    render_slot,
    resolve_device,
    summarize,
)


class FakeTokenizer:
    pieces = {10: "jamarnimanha", 11: ".", 12: "wrong"}

    def decode(self, values, **_kwargs):
        text = " ".join(self.pieces[value] for value in values)
        return text.replace(" .", ".")


def test_decode_preserves_only_the_slot_special_token() -> None:
    decoded = decode_preserving_slot(
        FakeTokenizer(),
        [2, 256204, 256208, 10, 11, 2],
        slot_token_id=256208,
        skipped_special_ids={2, 256204},
    )
    assert decoded == "<copy> jamarnimanha."


def test_render_slot_requires_exactly_one_marker() -> None:
    assert render_slot("<copy> jamarnimanha.", "marruwa") == (
        "marruwa jamarnimanha.",
        1,
    )
    assert render_slot("jamarnimanha.", "marruwa") == (None, 0)
    assert render_slot(f"{SLOT_TOKEN} {SLOT_TOKEN}.", "marruwa") == (None, 2)


def test_forced_slot_decoder_position_follows_target_language_token() -> None:
    ordinary = generation_kwargs(
        target_id=256204,
        slot_token_id=256208,
        force_slot_after_target_lang=False,
    )
    forced = generation_kwargs(
        target_id=256204,
        slot_token_id=256208,
        force_slot_after_target_lang=True,
    )
    assert "forced_decoder_ids" not in ordinary
    assert forced["forced_bos_token_id"] == 256204
    assert "forced_decoder_ids" not in forced
    assert decoder_prefix_token_ids(
        decoder_start_id=2,
        target_id=256204,
        slot_token_id=256208,
        force_slot_after_target_lang=True,
    ) == [2, 256204, 256208]
    assert (
        decoder_prefix_token_ids(
            decoder_start_id=2,
            target_id=256204,
            slot_token_id=256208,
            force_slot_after_target_lang=False,
        )
        is None
    )


def test_device_resolution_is_explicit_and_fails_closed() -> None:
    assert resolve_device("auto", True) == "cuda"
    assert resolve_device("auto", False) == "cpu"
    assert resolve_device("cpu", True) == "cpu"

    import pytest

    with pytest.raises(RuntimeError, match="CUDA was requested"):
        resolve_device("cuda", False)


def test_endpoint_filter_is_explicit_and_rejects_unknown_endpoints() -> None:
    rows = [
        {"evaluation_endpoint": "composition_plain", "id": "ordinary"},
        {"evaluation_endpoint": "slot_composition_masked", "id": "slot"},
    ]
    assert filter_rows_by_endpoint(rows, ["slot_composition_masked"]) == [rows[1]]

    import pytest

    with pytest.raises(ValueError, match="unsupported included endpoints"):
        filter_rows_by_endpoint(rows, ["not_an_endpoint"])
    with pytest.raises(ValueError, match="must be distinct"):
        filter_rows_by_endpoint(
            rows, ["slot_composition_masked", "slot_composition_masked"]
        )


def scored(endpoint: str, raw: bool, rendered: bool | None) -> dict:
    slot = endpoint.startswith("slot_")
    return {
        "evaluation_endpoint": endpoint,
        "is_slot_endpoint": slot,
        "prediction": "<copy> jamarnimanha." if slot else "marruwa jamarnimanha.",
        "raw_exact": raw,
        "rendered_exact": rendered,
        "slot_count": 1 if slot else 0,
        "slot_position_valid": True if slot else None,
        "expected_predicate_present": True,
        "chrf2": 100.0,
        "failure_codes": [],
        "blank": False,
        "source_copy": False,
        "repeated_token_4gram": False,
        "unresolved_bracket": False,
        "unresolved_slot": False,
        "contrast_family": "motion",
        "predicate_id": "running",
        "subject_id": "bilby",
    }


def test_summary_never_conflates_raw_rendered_and_ordinary_exact() -> None:
    summary = summarize(
        [
            scored("composition_plain", True, None),
            scored("slot_composition_masked", True, True),
            scored("slot_held_masked", False, False),
        ]
    )
    assert summary["ordinary_exact"] == 1
    assert summary["slot_raw_exact"] == 1
    assert summary["slot_rendered_exact"] == 1
    assert summary["by_endpoint"]["slot_held_masked"]["slot_rendered_exact"] == 0

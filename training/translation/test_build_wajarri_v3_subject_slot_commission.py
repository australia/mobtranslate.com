from __future__ import annotations

import pytest

from training.translation.build_wajarri_v3_subject_slot_commission import (
    SLOT_TOKEN,
    build_slot_row,
    mask_source_subject,
    pair_plain_and_inline,
)


def source_rows() -> tuple[dict, dict]:
    plain = {
        "id": "pair:1",
        "input_text": "<translate> The bilby is running.",
        "source_text": "The bilby is running.",
        "output_text": "marruwa jamarnimanha.",
        "subject_id": "bilby",
        "predicate_id": "running",
        "subject_source_record_ids": ["subject:1"],
        "predicate_source_record_ids": ["predicate:1"],
    }
    inline = {
        **plain,
        "id": "pair:1:inline",
        "parent_row_id": "pair:1",
        "terminology_pairs": [
            {
                "slot": "subject",
                "english_surface": "bilby",
                "wajarri_surface": "marruwa",
            },
            {
                "slot": "predicate",
                "english_surface": "running",
                "wajarri_surface": "jamarnimanha",
            },
        ],
    }
    return plain, inline


def test_mask_source_subject_requires_the_bound_frame() -> None:
    assert mask_source_subject("The bilby is running.", "bilby") == (
        f"The {SLOT_TOKEN} is running."
    )
    with pytest.raises(ValueError):
        mask_source_subject("A bilby is running.", "bilby")


def test_build_slot_row_separates_raw_and_rendered_targets() -> None:
    plain, inline = source_rows()
    masked = build_slot_row(plain, inline, "masked_source")
    declared = build_slot_row(plain, inline, "declared_source")
    assert masked["input_text"] == "<translate> The <copy> is running."
    assert declared["input_text"] == (
        "<translate> The bilby is running. <glossary> bilby = <copy>"
    )
    assert masked["output_text"] == "<copy> jamarnimanha."
    assert masked["rendered_output_text"] == "marruwa jamarnimanha."
    assert masked["slot_binding"]["wajarri_surface"] == "marruwa"


def test_pair_plain_and_inline_fails_on_partition_drift() -> None:
    plain, inline = source_rows()
    assert pair_plain_and_inline([plain], [inline]) == [(plain, inline)]
    with pytest.raises(ValueError):
        pair_plain_and_inline([plain], [{**inline, "parent_row_id": "other"}])

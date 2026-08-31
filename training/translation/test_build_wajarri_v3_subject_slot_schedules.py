from __future__ import annotations

import pytest

from training.translation.build_wajarri_v3_subject_slot_schedules import (
    paired_non_slot_signature,
    unique_population,
)


def schedule_row(index: int, source_id: str, population: str) -> dict:
    return {
        "id": f"presentation:{index}",
        "arm": "T7",
        "source_row_id": source_id,
        "source_schedule_id": f"source:{index}",
        "input_text": "<translate> The dog is sitting.",
        "output_text": "duthu nyinamanha.",
        "task": "translate",
        "pair_kind": "retention",
        "direction": "eng-wbv",
        "schedule_population": population,
        "population_cycle": index,
        "population_presentation": index,
        "presentation_index": index,
        "optimizer_update": 1,
        "accounting_parent_id": f"{source_id}::{population}",
        "target_pair_parent_id": source_id,
        "token_accounting": {
            "source_tokens_with_specials": 8,
            "target_tokens_with_specials": 6,
            "non_padding_tokens_with_specials": 14,
        },
    }


def test_unique_population_recovers_one_immutable_source_row() -> None:
    rows = [
        schedule_row(1, "row:1", "retention"),
        schedule_row(2, "row:1", "retention"),
    ]
    result = unique_population(rows, "retention")
    assert len(result) == 1
    assert result[0]["id"] == "row:1"
    assert "optimizer_update" not in result[0]


def test_unique_population_rejects_model_visible_drift() -> None:
    first = schedule_row(1, "row:1", "retention")
    second = {**schedule_row(2, "row:1", "retention"), "output_text": "changed"}
    with pytest.raises(ValueError):
        unique_population([first, second], "retention")


def test_non_slot_pairing_is_position_sensitive() -> None:
    first = schedule_row(1, "row:1", "retention")
    second = {**first, "arm": "D8", "id": "other"}
    assert paired_non_slot_signature([first]) == paired_non_slot_signature([second])
    second["presentation_index"] = 2
    assert paired_non_slot_signature([first]) != paired_non_slot_signature([second])

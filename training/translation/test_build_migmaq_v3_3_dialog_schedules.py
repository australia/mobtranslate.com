from pathlib import Path

import build_migmaq_v3_2_natural_lesson_schedules as v32
from build_migmaq_v3_3_dialog_schedules import (
    V3_2_BUILDER_SHA256,
    rename_schedule_arms,
    select_container,
)


def test_v3_2_builder_dependency_is_frozen() -> None:
    assert v32.sha256(Path(v32.__file__).resolve()) == V3_2_BUILDER_SHA256


def test_select_container_preserves_only_requested_rows() -> None:
    rows = [
        {"id": "dialog-1", "container_kind": "dialog"},
        {"id": "vocab-1", "container_kind": "vocab"},
        {"id": "dialog-2", "container_kind": "dialog"},
    ]
    assert [row["id"] for row in select_container(rows, "dialog")] == [
        "dialog-1",
        "dialog-2",
    ]


def test_rename_schedule_arms_preserves_pairing_and_marks_dialog_scope() -> None:
    schedules = {
        arm: [
            {
                "id": "position-0",
                "schedule_arm": arm,
                "natural_lesson_intervention": arm != "retention",
            }
        ]
        for arm in ("retention", "lessons20", "lessons40")
    }
    audit = {
        "arms": {arm: {"examples": 1} for arm in schedules},
        "pairing": {
            "positions": 1,
            "retention_to_lessons20_changed_positions": 1,
            "retention_to_lessons40_changed_positions": 1,
            "lessons20_is_nested_within_lessons40": True,
            "token_deltas": {
                "lessons20": {"target_tokens": {"absolute": 0}},
                "lessons40": {"target_tokens": {"absolute": 0}},
            },
        },
    }

    renamed, renamed_audit = rename_schedule_arms(schedules, audit)

    assert set(renamed) == {"retention", "dialog20", "dialog40"}
    assert renamed["retention"][0]["natural_dialog_intervention"] is False
    assert renamed["dialog20"][0]["natural_dialog_intervention"] is True
    assert all(
        row["intervention_scope"] == "listuguj_dialog_only"
        for rows in renamed.values()
        for row in rows
    )
    assert set(renamed_audit["arms"]) == {"retention", "dialog20", "dialog40"}
    assert renamed_audit["pairing"]["dialog20_is_nested_within_dialog40"] is True
    assert set(renamed_audit["pairing"]["token_deltas"]) == {"dialog20", "dialog40"}

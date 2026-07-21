from __future__ import annotations

import json
from pathlib import Path

import pytest

from training.translation.compare_v24_lexeme_runs import summarize


def analyzed(row_id: str, candidate: str, exact: bool, category: str, prediction: str) -> dict[str, object]:
    return {
        "id": row_id,
        "candidate": candidate,
        "input_text": f"<lexeme> {row_id}",
        "unconditioned_input_text": row_id,
        "accepted_references": [f"target-{row_id}"],
        "prediction": prediction,
        "parts_of_speech": ["noun"],
        "strata": {
            "semantic_domain": ["people"],
            "source_word_count": ["one"],
            "target_subword_count": ["two"],
        },
        "analysis": {"exact_accepted": exact, "category": category},
    }


def write_rows(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def test_compares_every_aligned_row_and_stratifies_failures(tmp_path: Path) -> None:
    left = tmp_path / "left.jsonl"
    right = tmp_path / "right.jsonl"
    write_rows(
        left,
        [
            analyzed("a", "old", False, "other_error", "wrong-a"),
            analyzed("b", "old", True, "accepted_exact", "target-b"),
            analyzed("c", "old", False, "source_copy", "c"),
            analyzed("d", "old", True, "accepted_exact", "target-d"),
        ],
    )
    write_rows(
        right,
        [
            analyzed("a", "new", True, "accepted_exact", "target-a"),
            analyzed("b", "new", False, "near_orthographic", "targat-b"),
            analyzed("c", "new", False, "known_target_for_other_prompt", "target-x"),
            analyzed("d", "new", True, "accepted_exact", "target-d"),
        ],
    )

    summary, matrix = summarize(left, "old", right, "new", expected_rows=4)

    assert summary["left_accepted_exact"] == 2
    assert summary["right_accepted_exact"] == 2
    assert summary["transitions"] == {
        "gain": 1,
        "loss": 1,
        "stable_exact": 1,
        "stable_failure": 1,
    }
    assert summary["gains_from_left_error_category"] == {"other_error": 1}
    assert summary["losses_to_right_error_category"] == {"near_orthographic": 1}
    assert summary["right_failure_breakdown"]["part_of_speech"] == {"noun": 2}
    assert {row["id"]: row["transition"] for row in matrix} == {
        "a": "gain",
        "b": "loss",
        "c": "stable_failure",
        "d": "stable_exact",
    }


def test_rejects_mismatched_row_sets(tmp_path: Path) -> None:
    left = tmp_path / "left.jsonl"
    right = tmp_path / "right.jsonl"
    write_rows(left, [analyzed("a", "old", False, "other_error", "wrong")])
    write_rows(right, [analyzed("b", "new", False, "other_error", "wrong")])

    with pytest.raises(ValueError, match="row ID mismatch"):
        summarize(left, "old", right, "new", expected_rows=1)


def test_rejects_duplicate_candidate_rows(tmp_path: Path) -> None:
    left = tmp_path / "left.jsonl"
    right = tmp_path / "right.jsonl"
    duplicate = analyzed("a", "old", False, "other_error", "wrong")
    write_rows(left, [duplicate, duplicate])
    write_rows(right, [analyzed("a", "new", True, "accepted_exact", "target-a")])

    with pytest.raises(ValueError, match="duplicate"):
        summarize(left, "old", right, "new", expected_rows=1)

from __future__ import annotations

import json
from pathlib import Path

import pytest

from training.translation.summarize_v24_lexeme_trajectories import summarize


def write_rows(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def analyzed(candidate: str, row_id: str, exact: bool) -> dict[str, object]:
    return {
        "candidate": candidate,
        "id": row_id,
        "input_text": f"<lexeme> {row_id}",
        "unconditioned_input_text": row_id,
        "accepted_references": [f"target-{row_id}"],
        "prediction": f"prediction-{candidate}-{row_id}",
        "parts_of_speech": ["noun"],
        "strata": {"semantic_domain": ["test"]},
        "analysis": {
            "exact_accepted": exact,
            "category": "exact_selected" if exact else "other",
        },
    }


def test_summarizes_learning_regression_and_oscillation(tmp_path: Path) -> None:
    path = tmp_path / "rows.jsonl"
    patterns = {
        "never": [False, False, False, False],
        "stable": [False, True, True, True],
        "late": [False, False, True, True],
        "regress": [True, True, True, False],
        "oscillate": [False, True, False, True],
        "always": [True, True, True, True],
    }
    labels = ["B0", "S1", "S2", "S3"]
    rows = [
        analyzed(label, row_id, statuses[index])
        for row_id, statuses in patterns.items()
        for index, label in enumerate(labels)
    ]
    write_rows(path, rows)

    summary, matrix = summarize(path, labels, "B0")

    assert summary["rows"] == 6
    assert summary["trajectory_classes"] == {
        "exact_at_every_checkpoint": 2,
        "learned_and_retained": 1,
        "never_exact": 1,
        "oscillating": 1,
        "regressed": 1,
    }
    assert summary["adjacent_transitions"]["S2->S3"] == {
        "gain": 1,
        "loss": 1,
        "stable_exact": 3,
        "stable_failure": 1,
    }
    by_id = {row["id"]: row for row in matrix}
    assert by_id["late"]["first_exact_checkpoint"] == "S2"
    assert by_id["regress"]["losses_after_exact"] == ["S3"]


def test_refuses_misaligned_candidate_rows(tmp_path: Path) -> None:
    path = tmp_path / "rows.jsonl"
    write_rows(
        path,
        [
            analyzed("B0", "one", False),
            analyzed("B0", "two", False),
            analyzed("S1", "one", True),
        ],
    )

    with pytest.raises(ValueError, match="row ID mismatch"):
        summarize(path, ["B0", "S1"], "B0")

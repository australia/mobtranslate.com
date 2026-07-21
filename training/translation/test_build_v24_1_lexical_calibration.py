from __future__ import annotations

import json
from pathlib import Path

import pytest

from build_v24_1_lexical_calibration import (
    calibration_rows,
    monitor_rows,
    overlap_summary,
    validate_rows,
)


def row(row_id: str, prompt: str, target: str, accepted: list[str] | None = None) -> dict:
    return {
        "id": row_id,
        "direction": "eng-gvn",
        "input_text": f"<lexeme> {prompt}",
        "unconditioned_input_text": prompt,
        "output_text": target,
        "accepted_references": accepted or [target],
        "pair_kind": "source",
    }


def test_builds_explicit_overlapping_calibration_monitor() -> None:
    rows = [row("a", "woman", "jalbu"), row("b", "man", "dingkar")]
    validate_rows(rows, "H297")
    calibrated = calibration_rows(rows, "H297")
    monitor = monitor_rows(calibrated, "H297", 1, "seed")

    assert calibrated[0]["pair_kind"] == "dictionary_closed_set_calibration"
    assert calibrated[0]["calibration"]["training_overlap"] == "complete_by_design"
    assert calibrated[0]["calibration"]["monitor_overlap"] == "not_in_monitor_subset"
    assert monitor[0]["calibration"]["monitor_overlap"] == "row_is_also_in_training_by_design"
    assert monitor[0]["id"] in {"a", "b"}


def test_invalid_source_selection_is_preserved_but_not_trained() -> None:
    source = row("father", "father", "Nganjan", ["nganjan-anka", "ganjan"])
    validate_rows([source], "H297")
    calibrated = calibration_rows([source], "H297")[0]

    assert calibrated["source_output_text"] == "Nganjan"
    assert calibrated["output_text"] == "nganjan-anka"
    assert calibrated["calibration"]["selected_target_changed_from_source"] is True


def test_overlap_requires_shared_prompt_and_shared_form() -> None:
    historical = [row("h1", "woman", "jalbu"), row("h2", "man", "dingkar")]
    curated = [row("c1", "woman", "jalbu"), row("c2", "man", "bama"), row("c3", "fish", "kuyu")]

    assert overlap_summary(historical, curated) == {
        "historical_prompts": 2,
        "curated_prompts": 3,
        "prompt_overlap": 2,
        "overlap_with_shared_accepted_form": 1,
        "overlap_without_shared_accepted_form": 1,
        "historical_prompts_absent_from_curated": 0,
    }


def test_duplicate_prompt_fails_closed() -> None:
    with pytest.raises(ValueError, match="duplicate normalized prompt"):
        validate_rows([row("a", "Woman", "jalbu"), row("b", "woman", "jalbu")], "H297")


def test_fixture_is_json_serializable(tmp_path: Path) -> None:
    path = tmp_path / "row.json"
    path.write_text(json.dumps(row("a", "woman", "jalbu")), encoding="utf-8")
    assert json.loads(path.read_text(encoding="utf-8"))["output_text"] == "jalbu"

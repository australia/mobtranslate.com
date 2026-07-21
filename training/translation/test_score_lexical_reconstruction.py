from __future__ import annotations

import pytest

from score_lexical_reconstruction import row_result, summarize, wilson


def row(prompt: str, selected: str, prediction: str, accepted: list[str] | None = None) -> dict:
    return {
        "id": prompt,
        "input_text": f"<lexeme> {prompt}",
        "unconditioned_input_text": prompt,
        "output_text": selected,
        "reference": selected,
        "accepted_references": accepted or [selected],
        "prediction": prediction,
        "parts_of_speech": ["lexinfo:Noun"],
    }


def test_wilson_matches_frozen_gate_arithmetic() -> None:
    assert wilson(48, 297)["low"] == pytest.approx(0.1241, abs=0.0001)
    assert wilson(252, 297)["low"] == pytest.approx(0.8033, abs=0.0001)


def test_alternative_reference_is_accepted_exact() -> None:
    result = row_result(row("fish", "kuyu", "minya", ["kuyu", "minya"]))
    assert result["accepted_exact"] is True
    assert result["selected_exact"] is False


def test_summary_applies_confidence_adjusted_gate() -> None:
    rows = [row(f"p{index}", f"t{index}", f"t{index}") for index in range(260)]
    rows.extend(row(f"f{index}", f"x{index}", "wrong") for index in range(37))
    summary = summarize(rows, 0.80)
    assert summary["accepted_exact_count"] == 260
    assert summary["passes_confidence_adjusted_gate"] is True

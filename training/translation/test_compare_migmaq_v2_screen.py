from __future__ import annotations

import json
from pathlib import Path

import pytest

from training.translation.compare_migmaq_v2_screen import build_report, canonical_id


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def prediction(
    row_id: str,
    prediction_text: str,
    exact: bool,
    cer: float,
    reference: str,
) -> dict[str, object]:
    return {
        "id": row_id,
        "accepted_references": [reference],
        "accepted_exact": exact,
        "grapheme_cer": cer,
        "prediction": prediction_text,
        "prediction_normalized": prediction_text.casefold(),
        "unconditioned_input_text": f"input {row_id}",
        "part_of_speech": "noun",
        "target_subword_count": 2,
        "edit_error_type": "exact" if exact else "different_surface_form",
        "empty": False,
        "source_copy": False,
    }


def sentence_metrics(chrf: float) -> dict[str, object]:
    return {
        "bleu": chrf / 10,
        "chrf": chrf,
        "rows": 3,
        "num_beams": 4,
        "no_repeat_ngram_size": 3,
        "repetition_penalty": 1.1,
        "length_penalty": 1.0,
    }


def make_run(root: Path, predictions: list[dict[str, object]], validation: float, opened: float) -> None:
    write_jsonl(root / "evaluations/lexical-full/predictions.jsonl", predictions)
    write_json(root / "evaluations/sentence-validation.json", {"metrics": sentence_metrics(validation)})
    write_json(
        root / "evaluations/sentence-opened-regression.json", {"metrics": sentence_metrics(opened)}
    )
    write_json(
        root / "model/model_manifest.json",
        {
            "training_args": {
                "max_steps": 10,
                "batch_size": 2,
                "gradient_accumulation_steps": 1,
                "learning_rate": 0.001,
                "warmup_ratio": 0.1,
            },
            "trainer_state": {
                "actual_training_exposure": {
                    "examples": 20,
                    "by_task": {},
                    "unique_rows_seen": 3,
                }
            },
        },
    )


def test_builds_paired_cohort_and_sentence_report(tmp_path: Path) -> None:
    ids = ["row-a", "row-b", "row-c"]
    v1 = tmp_path / "v1.jsonl"
    write_jsonl(
        v1,
        [
            prediction("row-a", "wrong", False, 1.0, "target-a"),
            prediction("row-b", "target-b", True, 0.0, "target-b"),
            prediction("row-c", "wrong", False, 0.8, "target-c"),
        ],
    )
    control = tmp_path / "control"
    treatment = tmp_path / "treatment"
    make_run(
        control,
        [prediction(f"{row_id}:task-lexeme", "wrong", False, 1.0, f"target-{row_id[-1]}") for row_id in ids],
        21.0,
        22.0,
    )
    make_run(
        treatment,
        [
            prediction("row-a:task-lexeme", "target-a", True, 0.0, "target-a"),
            prediction("row-b:task-lexeme", "wrong", False, 1.2, "target-b"),
            prediction("row-c:task-lexeme", "closer", False, 0.4, "target-c"),
        ],
        20.5,
        21.5,
    )
    baseline_sentence = tmp_path / "baseline-sentence"
    write_json(
        baseline_sentence / "manifest.json",
        {
            "metrics": {
                "validation": sentence_metrics(20.0),
                "opened_regression": sentence_metrics(21.0),
            }
        },
    )
    direct_pool = tmp_path / "direct.jsonl"
    heldout_pool = tmp_path / "heldout.jsonl"
    write_jsonl(direct_pool, [{"id": "row-a:task-lexeme"}, {"id": "row-b:task-lexeme"}])
    write_jsonl(heldout_pool, [{"id": "row-c:task-lexeme"}])

    report, matrix = build_report(
        v1,
        baseline_sentence,
        control,
        treatment,
        direct_pool,
        heldout_pool,
        expected_rows=3,
    )

    assert report["cohort_rows"] == {"direct_pair_training_pool": 2, "heldout_lineage": 1}
    assert report["lexical"]["lexical_treatment"]["overall"]["accepted_exact_count"] == 1
    paired = report["paired"]["retention_control_to_lexical_treatment"]
    assert paired["exact_transitions"] == {"gain": 1, "stable_failure": 2}
    assert paired["cer_improved_rows"] == 2
    assert paired["cer_worsened_rows"] == 1
    assert report["sentence"]["delta_from_v1"]["retention_control"]["validation"]["chrf"] == 1.0
    assert report["sentence"]["lexical_treatment_minus_retention_control"]["validation"]["chrf"] == -0.5
    assert len(matrix) == 3


def test_rejects_pool_overlap(tmp_path: Path) -> None:
    v1 = tmp_path / "v1.jsonl"
    row = prediction("row-a", "wrong", False, 1.0, "target-a")
    write_jsonl(v1, [row])
    control = tmp_path / "control"
    treatment = tmp_path / "treatment"
    tagged = [prediction("row-a:task-lexeme", "wrong", False, 1.0, "target-a")]
    make_run(control, tagged, 20.0, 20.0)
    make_run(treatment, tagged, 20.0, 20.0)
    baseline_sentence = tmp_path / "baseline"
    write_json(
        baseline_sentence / "manifest.json",
        {
            "metrics": {
                "validation": sentence_metrics(20.0),
                "opened_regression": sentence_metrics(20.0),
            }
        },
    )
    direct = tmp_path / "direct.jsonl"
    heldout = tmp_path / "heldout.jsonl"
    write_jsonl(direct, [{"id": "row-a"}])
    write_jsonl(heldout, [{"id": "row-a"}])

    with pytest.raises(ValueError, match="overlap"):
        build_report(v1, baseline_sentence, control, treatment, direct, heldout, 1)


def test_canonical_id_removes_only_task_suffix() -> None:
    assert canonical_id("row-a:task-lexeme") == "row-a"
    assert canonical_id("row-a") == "row-a"
    assert canonical_id("task-lexeme:row-a") == "task-lexeme:row-a"

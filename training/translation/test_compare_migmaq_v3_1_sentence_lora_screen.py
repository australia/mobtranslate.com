import json
from pathlib import Path

import pytest

from compare_migmaq_v3_1_sentence_lora_screen import (
    audit_paired_schedules,
    paired_lexical_summary,
    paired_sentence_analysis,
    per_arm_gate,
    selection_decision,
    verify_checksum_manifest,
)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def test_audit_paired_schedules_accepts_only_source_hint_intervention(
    tmp_path: Path,
) -> None:
    control = tmp_path / "control.jsonl"
    glossary = tmp_path / "glossary.jsonl"
    common = {
        "id": "sentence-common",
        "schedule_source_id": "sentence-common",
        "task": "translate",
        "pair_kind": "attested_dictionary_example_translation",
        "input_text": "<translate> hello",
        "output_text": "wela'lin",
    }
    lexical = {
        "id": "lexical",
        "schedule_source_id": "lexical:task-lexeme",
        "task": "lexeme",
        "pair_kind": "source_dictionary_lexical_reconstruction",
        "input_text": "<lexeme> thanks",
        "output_text": "wela'lin",
    }
    left = {
        "id": "paired",
        "schedule_source_id": "paired",
        "task": "translate",
        "pair_kind": "attested_dictionary_example_translation",
        "glossary_condition": "withheld_for_paired_control",
        "input_text": "<translate> thanks",
        "output_text": "wela'lin",
    }
    right = {key: value for key, value in left.items() if key != "glossary_condition"}
    right.update(
        {
            "task": "glossary_translation",
            "pair_kind": "attested_glossary_conditioned_translation",
            "input_text": "<translate> thanks <glossary> thanks = wela'lin",
        }
    )
    write_jsonl(control, [common, lexical, left])
    write_jsonl(glossary, [common, lexical, right])
    audit, direct = audit_paired_schedules(
        control, glossary, expected_rows=3, expected_changed_inputs=1
    )
    assert audit["input_only_intervention_rows"] == 1
    assert audit["identical_rows"] == 2
    assert direct == {"lexical"}


def test_audit_paired_schedules_rejects_target_drift(tmp_path: Path) -> None:
    control = tmp_path / "control.jsonl"
    glossary = tmp_path / "glossary.jsonl"
    row = {
        "id": "x",
        "schedule_source_id": "x",
        "task": "translate",
        "pair_kind": "attested_dictionary_example_translation",
        "input_text": "<translate> x",
        "output_text": "x",
    }
    write_jsonl(control, [row])
    write_jsonl(glossary, [{**row, "output_text": "y"}])
    with pytest.raises(ValueError, match="target differs"):
        audit_paired_schedules(
            control, glossary, expected_rows=1, expected_changed_inputs=0
        )


def test_verify_checksum_manifest_detects_tampering(tmp_path: Path) -> None:
    data = tmp_path / "value.txt"
    data.write_text("value\n", encoding="utf-8")
    import hashlib

    digest = hashlib.sha256(data.read_bytes()).hexdigest()
    (tmp_path / "RUN-SHA256SUMS").write_text(
        f"{digest}  ./value.txt\n", encoding="utf-8"
    )
    assert verify_checksum_manifest(tmp_path)["files_verified"] == 1
    data.write_text("changed\n", encoding="utf-8")
    with pytest.raises(ValueError, match="checksum verification failed"):
        verify_checksum_manifest(tmp_path)


def gate_contract() -> dict:
    return {
        "per_arm_hard_gates": {
            "lexical_blank_outputs_maximum": 0,
            "sentence_blank_outputs_maximum": 0,
            "sentence_validation_chrf_minimum": 20.0,
            "sentence_opened_regression_chrf_minimum": 21.0,
            "lexical_mean_grapheme_cer_maximum": 1.0,
            "lexical_unique_outputs_minimum": 100,
            "lexical_maximum_output_frequency_maximum": 20,
            "lexical_source_copies_maximum": 5,
        }
    }


def passing_lexical() -> dict:
    return {
        "blank_outputs": 0,
        "mean_grapheme_cer": 0.8,
        "unique_normalized_outputs": 120,
        "maximum_normalized_output_frequency": 10,
        "source_copies": 2,
    }


def test_per_arm_gate_is_hard_conjunction() -> None:
    validation = {"empty_outputs": 0, "chrf": 20.5}
    opened = {"empty_outputs": 0, "chrf": 21.5}
    assert per_arm_gate(passing_lexical(), validation, opened, gate_contract())[
        "passed"
    ]
    failed = {**passing_lexical(), "unique_normalized_outputs": 99}
    assert not per_arm_gate(failed, validation, opened, gate_contract())["passed"]


def selection_contract() -> dict:
    return {
        "treatment_continuation_gates": {
            "glossary_minus_control_sentence_validation_chrf_minimum": -0.25,
            "glossary_minus_control_sentence_opened_regression_chrf_minimum": -0.25,
            "glossary_minus_control_project_unexposed_paired_chrf_delta_minimum": 0.5,
            "glossary_minus_control_project_unexposed_conditioned_chrf_minimum": 0.5,
            "glossary_project_unexposed_net_uptake_must_be_at_least_control": True,
        },
        "control_continuation_gates_if_treatment_fails": {
            "control_sentence_validation_chrf_minimum": 21.0,
            "control_sentence_opened_regression_chrf_minimum": 22.0,
        },
    }


def test_selection_prefers_passing_glossary_then_control_fallback() -> None:
    passing = {"passed": True}
    control_sentence = {"chrf": 21.5}
    control_opened = {"chrf": 22.5}
    glossary_sentence = {"chrf": 21.4}
    glossary_opened = {"chrf": 22.4}
    control_uptake = {
        "paired_chrf_delta": 1.0,
        "conditioned_chrf": 20.0,
        "all_hint_row_gains": 10,
        "all_hint_row_losses": 2,
    }
    glossary_uptake = {
        "paired_chrf_delta": 1.7,
        "conditioned_chrf": 20.7,
        "all_hint_row_gains": 11,
        "all_hint_row_losses": 2,
    }
    selected = selection_decision(
        passing,
        passing,
        control_sentence,
        glossary_sentence,
        control_opened,
        glossary_opened,
        control_uptake,
        glossary_uptake,
        selection_contract(),
    )
    assert selected["selected_recipe"] == "glossary"

    glossary_uptake["paired_chrf_delta"] = 1.1
    fallback = selection_decision(
        passing,
        passing,
        control_sentence,
        glossary_sentence,
        control_opened,
        glossary_opened,
        control_uptake,
        glossary_uptake,
        selection_contract(),
    )
    assert fallback["selected_recipe"] == "control"


def test_paired_lexical_summary_counts_direction() -> None:
    rows = [
        {"exact_transition": "gain", "grapheme_cer_delta_glossary_minus_control": -0.2},
        {"exact_transition": "loss", "grapheme_cer_delta_glossary_minus_control": 0.3},
        {"exact_transition": "gain", "grapheme_cer_delta_glossary_minus_control": 0.0},
    ]
    summary = paired_lexical_summary(rows)
    assert summary["net_exact_gain"] == 1
    assert summary["cer_improved_rows"] == 1
    assert summary["cer_worsened_rows"] == 1
    assert summary["cer_tied_rows"] == 1


def test_paired_sentence_analysis_derives_missing_evaluator_metrics(
    tmp_path: Path,
) -> None:
    control = tmp_path / "control.json"
    glossary = tmp_path / "glossary.json"
    metrics = {
        "rows": 1,
        "bleu": 1.0,
        "chrf": 10.0,
        "num_beams": 4,
        "no_repeat_ngram_size": 3,
        "repetition_penalty": 1.1,
        "length_penalty": 1.0,
        "dtype": "bfloat16",
        "artifact_kind": "compact_peft_adapter",
    }
    row = {
        "id": "sentence-1",
        "input_text": "<translate> hello",
        "unconditioned_input_text": "hello",
        "reference": "abcd",
        "prediction": "",
    }
    control.write_text(
        json.dumps({"metrics": metrics, "predictions": [row]}), encoding="utf-8"
    )
    glossary.write_text(
        json.dumps(
            {
                "metrics": {**metrics, "chrf": 12.0},
                "predictions": [{**row, "prediction": "abcd"}],
            }
        ),
        encoding="utf-8",
    )
    report, rows = paired_sentence_analysis(control, glossary)
    assert report["control_metrics"]["empty_outputs"] == 1
    assert report["glossary_metrics"]["empty_outputs"] == 0
    assert report["corpus_metric_delta_glossary_minus_control"]["chrf"] == 2.0
    assert rows[0]["sentence_chrf_delta_glossary_minus_control"] > 0

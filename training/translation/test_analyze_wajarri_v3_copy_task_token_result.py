from training.translation.analyze_wajarri_v3_copy_task_token_result import (
    copy_transitions,
    retention_inventory,
    training_inventory,
)


def copy_row(row_id: str, endpoint: str, reference: str, prediction: str) -> dict:
    return {
        "row_id": row_id,
        "evaluation_endpoint": endpoint,
        "input_text": f"<copy> supplied [{reference}]",
        "reference": reference,
        "prediction": prediction,
        "exact": reference == prediction,
    }


def test_copy_transitions_count_repairs_regressions_and_changed_predictions() -> None:
    control = [
        copy_row("a", "neutral_single_copy_screen", "barrga", "barga"),
        copy_row("b", "neutral_single_copy_screen", "mirdi", "mirdi"),
        copy_row("c", "neutral_dual_copy_screen", "mirdi guda", "mirdi guda"),
        copy_row("d", "neutral_dual_copy_screen", "mirdi guda", "mirdi gutha"),
    ]
    treatment = [
        copy_row("a", "neutral_single_copy_screen", "barrga", "barrga"),
        copy_row("b", "neutral_single_copy_screen", "mirdi", "mirti"),
        copy_row("c", "neutral_dual_copy_screen", "mirdi guda", "mirdi guda"),
        copy_row("d", "neutral_dual_copy_screen", "mirdi guda", "mirdi guta"),
    ]

    summary, changed = copy_transitions(control, treatment)

    assert summary["by_endpoint"]["neutral_single_copy_screen"] == {
        "rows": 2,
        "transitions": {"exact_to_fail": 1, "fail_to_exact": 1},
        "predictions_changed": 2,
        "net_exact_change": 0,
    }
    assert summary["by_endpoint"]["neutral_dual_copy_screen"] == {
        "rows": 2,
        "transitions": {"exact_to_exact": 1, "fail_to_fail": 1},
        "predictions_changed": 1,
        "net_exact_change": 0,
    }
    assert len(changed) == 3


def test_training_and_retention_inventories_keep_tasks_separate() -> None:
    schedule = [
        {
            "schedule_population": "sentence_plain",
            "optimizer_update": 1,
            "accounting_parent_id": "sentence-a::plain",
            "source_row_id": "sentence-a",
            "input_text": "<translate> The dog is sitting.",
            "output_text": "duthu nyinamanha.",
            "token_accounting": {
                "source_tokens_with_specials": 7,
                "target_tokens_with_specials": 5,
                "non_padding_tokens_with_specials": 12,
            },
        },
        {
            "schedule_population": "neutral_dual_copy",
            "optimizer_update": 1,
            "accounting_parent_id": "copy-a::dual",
            "source_row_id": "copy-a",
            "input_text": "<copy> first [mirdi]; second [guda].",
            "output_text": "mirdi guda.",
            "token_accounting": {
                "source_tokens_with_specials": 9,
                "target_tokens_with_specials": 5,
                "non_padding_tokens_with_specials": 14,
            },
        },
    ]
    assert training_inventory(schedule) == {
        "presentations": 2,
        "optimizer_updates": 1,
        "unique_accounting_parents": 2,
        "unique_source_rows": 2,
        "unique_input_output_pairs": 2,
        "presentations_by_population": {
            "neutral_dual_copy": 1,
            "sentence_plain": 1,
        },
        "tokens": {
            "source_tokens_with_specials": 16,
            "target_tokens_with_specials": 10,
            "non_padding_tokens_with_specials": 26,
        },
    }
    retention = retention_inventory(
        [
            {"input_text": "<translate> hello"},
            {"input_text": "<lexeme> dog"},
        ]
    )
    assert retention["rows_by_model_visible_task"] == {
        "lexeme": 1,
        "translate": 1,
    }

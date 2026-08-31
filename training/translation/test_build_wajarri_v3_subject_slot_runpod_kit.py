from training.translation.build_wajarri_v3_subject_slot_runpod_kit import (
    schedule_census,
)


def test_schedule_census_accounts_every_subject_slot_presentation() -> None:
    rows = [
        {
            "task": "translate",
            "schedule_population": "retention",
            "token_accounting": {
                "source_tokens_with_specials": 3,
                "target_tokens_with_specials": 2,
                "non_padding_tokens_with_specials": 5,
            },
        },
        {
            "task": "subject_slot_conditioned_translation",
            "schedule_population": "subject_slot",
            "token_accounting": {
                "source_tokens_with_specials": 4,
                "target_tokens_with_specials": 3,
                "non_padding_tokens_with_specials": 7,
            },
        },
    ]
    assert schedule_census(rows) == {
        "rows": 2,
        "task_presentations": {
            "subject_slot_conditioned_translation": 1,
            "translate": 1,
        },
        "population_presentations": {"retention": 1, "subject_slot": 1},
        "source_non_padding_tokens": 7,
        "target_non_padding_tokens": 5,
        "non_padding_tokens": 12,
    }

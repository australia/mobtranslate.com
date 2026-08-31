from training.translation.build_wajarri_v3_copy_task_token_runpod_kit import (
    schedule_census,
)


def test_schedule_census_accounts_every_presentation_and_token() -> None:
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
            "task": "copy",
            "schedule_population": "copy",
            "token_accounting": {
                "source_tokens_with_specials": 4,
                "target_tokens_with_specials": 2,
                "non_padding_tokens_with_specials": 6,
            },
        },
    ]
    assert schedule_census(rows) == {
        "rows": 2,
        "task_presentations": {"copy": 1, "translate": 1},
        "population_presentations": {"copy": 1, "retention": 1},
        "source_non_padding_tokens": 7,
        "target_non_padding_tokens": 4,
        "non_padding_tokens": 11,
    }

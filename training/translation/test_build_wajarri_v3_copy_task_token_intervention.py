from training.translation.build_wajarri_v3_copy_task_token_intervention import (
    replace_prefix,
    transform_schedule,
)


def row(index: int, *, copy: bool) -> dict:
    return {
        "id": f"source:{index}",
        "arm": "D6",
        "input_text": (
            "<translate> first supplied form [bali]; second supplied form [banha]."
            if copy
            else "<translate> The dog is sitting."
        ),
        "output_text": "bali banha." if copy else "dog sitting.",
        "task": (
            "neutral_terminology_copy_auxiliary" if copy else "translate"
        ),
        "presentation_index": index,
        "optimizer_update": 1,
        "token_accounting": {"source_tokens_with_specials": 5},
    }


def test_transform_schedule_changes_only_copy_prefix_and_transport_metadata() -> None:
    source = [row(1, copy=True), row(2, copy=False)]
    result, audit = transform_schedule(source)
    assert result[0]["input_text"].startswith("<copy> ")
    assert result[1]["input_text"] == source[1]["input_text"]
    assert [item["output_text"] for item in result] == [
        item["output_text"] for item in source
    ]
    assert audit["copy_rows_changed"] == 1
    assert audit["presentation_order_preserved"]


def test_replace_prefix_fails_closed_on_noncanonical_input() -> None:
    try:
        replace_prefix("translate this")
    except ValueError:
        pass
    else:
        raise AssertionError("noncanonical source prefix was accepted")

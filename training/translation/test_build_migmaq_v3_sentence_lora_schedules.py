from build_migmaq_v3_sentence_lora_schedules import (
    allocate_stratified_quotas,
    build_paired_schedules,
    lexical_structure,
    quotas,
    select_lexical_pool,
)


def lexical(row_id: str, source: str, target: str, pos: str) -> dict:
    return {
        "id": row_id,
        "direction": "eng-mic",
        "source_lang": "eng_Latn",
        "target_lang": "mic_Latn",
        "input_text": f"<lexeme> {source} <pos> {pos}",
        "unconditioned_input_text": source,
        "output_text": target,
        "pair_kind": "source_dictionary_lexical_reconstruction",
        "task": "lexeme",
        "task_prefix": "<lexeme>",
        "part_of_speech": pos,
    }


def sentence(row_id: str, *, glossary: bool = False) -> dict:
    return {
        "id": row_id,
        "direction": "eng-mic",
        "source_lang": "eng_Latn",
        "target_lang": "mic_Latn",
        "input_text": "<translate> source" + (" <glossary> source = target" if glossary else ""),
        "unconditioned_input_text": "source",
        "output_text": "target",
        "pair_kind": (
            "attested_glossary_conditioned_translation"
            if glossary
            else "attested_dictionary_example_translation"
        ),
        "task": "glossary_translation" if glossary else "translate",
        "task_prefix": "<translate>",
        "glossary_pairs": [{"english_gloss": "source", "migmaq_headword": "target"}]
        if glossary
        else [],
    }


def test_lexical_structure_is_surface_based() -> None:
    assert lexical_structure(lexical("a", "red fox", "muin", "noun"))["structurally_eligible"]
    assert not lexical_structure(lexical("a", "a very red fox", "muin", "noun"))[
        "structurally_eligible"
    ]
    assert not lexical_structure(lexical("a", "fox", "red fox", "noun"))[
        "structurally_eligible"
    ]


def test_stratified_quota_is_exact_and_preserves_strata() -> None:
    result = allocate_stratified_quotas({"a": 8, "b": 2, "c": 1}, 7, seed=42)
    assert sum(result.values()) == 7
    assert all(result[label] >= 1 for label in result)
    assert all(result[label] <= size for label, size in {"a": 8, "b": 2, "c": 1}.items())


def test_selection_is_deterministic_and_pos_stratified() -> None:
    rows = [
        lexical(f"a-{index}", "red fox", f"target{index}", "noun") for index in range(8)
    ] + [
        lexical(f"b-{index}", "run", f"verb{index}", "verb") for index in range(4)
    ]
    first, ledger, audit = select_lexical_pool(rows, 8, seed=42)
    second, _, _ = select_lexical_pool(rows, 8, seed=42)
    assert [row["id"] for row in first] == [row["id"] for row in second]
    assert len(first) == 8
    assert len(ledger) == 12
    assert set(audit["selected_part_of_speech_counts"]) == {"noun", "verb"}


def test_schedule_is_row_paired_and_uses_exact_task_quotas() -> None:
    sentence_rows = [sentence("s1"), sentence("s2")]
    glossary_rows = [sentence("g1", glossary=True), sentence("g2", glossary=True)]
    lexical_rows = [lexical(f"l{index}", "word", f"target{index}", "noun") for index in range(10)]
    control, treatment, audit = build_paired_schedules(
        sentence_rows=sentence_rows,
        glossary_rows=glossary_rows,
        lexical_rows=lexical_rows,
        total=20,
        seed=42,
        horizon_label="test",
    )
    assert len(control) == len(treatment) == 20
    assert audit["control"]["task_quotas"] == {
        "translate": 19,
        "glossary_translation": 0,
        "lexeme": 1,
    }
    assert audit["glossary"]["task_quotas"] == {
        "translate": 14,
        "glossary_translation": 5,
        "lexeme": 1,
    }
    assert [row["id"] for row in control] == [row["id"] for row in treatment]
    assert [row["output_text"] for row in control] == [row["output_text"] for row in treatment]
    assert sum(
        left["input_text"] != right["input_text"]
        for left, right in zip(control, treatment, strict=True)
    ) == 5
    assert {
        row["schedule_source_id"] for row in control if row["task"] == "lexeme"
    } == {
        row["schedule_source_id"] for row in treatment if row["task"] == "lexeme"
    }
    assert audit["pairing"]["identical_targets"]
    assert audit["pairing"]["input_only_changed_positions"] == 5
    assert quotas(20, glossary=False) == {
        "translate": 19,
        "glossary_translation": 0,
        "lexeme": 1,
    }

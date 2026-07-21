from __future__ import annotations

from build_migmaq_v2_multitask import (
    annotate_glossary_lineage_exposure,
    contains_word_sequence,
    glossary_task_row,
    has_heldout_lineage,
    lexical_task_row,
    migmaq_model_text,
    model_text,
    morphology_task_row,
    phrase_occurrence_counts,
    scheduled_replay,
    sentence_task_row,
    stable_order,
    word_tokens,
)


def test_model_text_folds_quotes_without_casefolding() -> None:
    assert model_text("  Lnu\u2019k  ") == "Lnu'k"
    assert migmaq_model_text("  ta'n_goqwei  ") == "ta'n goqwei"


def test_sentence_and_lexical_tasks_are_visibly_distinct() -> None:
    sentence = sentence_task_row(
        {"id": "s", "direction": "eng-mic", "input_text": "I eat.", "output_text": "Mijisi."},
        "train",
    )
    lexical = lexical_task_row(
        {
            "id": "l",
            "unconditioned_input_text": "eat",
            "part_of_speech": "verb animate intransitive",
            "accepted_references": ["mijisi"],
        },
        "direct_reconstruction",
    )
    assert sentence["input_text"] == "<translate> I eat."
    assert lexical["input_text"] == "<lexeme> eat <pos> verb animate intransitive"
    assert sentence["task"] != lexical["task"]


def test_lexical_task_preserves_source_layout_but_trains_running_text() -> None:
    result = lexical_task_row(
        {
            "id": "l",
            "unconditioned_input_text": "what it is",
            "part_of_speech": "pronoun",
            "accepted_references": ["ta'n_goqwei"],
        },
        "direct_reconstruction",
    )
    assert result["output_text"] == "ta'n goqwei"
    assert result["accepted_references"] == ["ta'n goqwei"]
    assert result["source_accepted_references"] == ["ta'n_goqwei"]


def test_lineage_clean_excludes_validation_and_test() -> None:
    assert has_heldout_lineage({"legacy_v1_splits": ["train"]}) is False
    assert has_heldout_lineage({"legacy_v1_splits": []}) is False
    assert has_heldout_lineage({"legacy_v1_splits": ["train", "test"]}) is True


def test_glossary_row_requires_attested_headword_surface() -> None:
    entries = {
        "entries/m/mijisi.html": {
            "id": "entry-1",
            "headword": "mijisi",
            "primary_translation": "he or she eats",
        }
    }
    sentence = {
        "id": "s",
        "input_text": "He eats now.",
        "output_text": "Mijisi goqwei.",
        "source_records": [{"entry_id": "entries/m/mijisi.html"}],
    }
    result = glossary_task_row(sentence, entries, "train")
    assert result is not None
    assert "<glossary> he or she eats = mijisi" in result["input_text"]
    sentence["output_text"] = "Pema'sit."
    assert glossary_task_row(sentence, entries, "train") is None


def test_glossary_row_matches_source_layout_multiword_headword() -> None:
    entries = {
        "entries/t/ta'n_goqwei.html": {
            "id": "entry-2",
            "headword": "ta'n_goqwei",
            "primary_translation": "what it is",
        }
    }
    sentence = {
        "id": "s2",
        "input_text": "You know what it is.",
        "output_text": "Geju'n ta'n goqwei.",
        "source_records": [{"entry_id": "entries/t/ta'n_goqwei.html"}],
    }
    result = glossary_task_row(sentence, entries, "train")
    assert result is not None
    assert "<glossary> what it is = ta'n goqwei" in result["input_text"]
    assert result["glossary_pairs"][0]["source_layout_headword"] == "ta'n_goqwei"


def test_word_sequence_matching_respects_boundaries() -> None:
    assert contains_word_sequence("Geju'n ta'n goqwei.", "ta'n_goqwei")
    assert not contains_word_sequence("Geju'n ta'nugwei.", "ta'n_goqwei")


def test_morphology_rows_preserve_source_analysis_boundary() -> None:
    row = {
        "id": "form-1",
        "entry_id": "entry-1",
        "external_entry_id": "entries/m/mijisi.html",
        "structure_parse_status": "source_layout_recovered_unadjudicated",
        "analysis_status": "source_layout_only_not_morphologically_adjudicated",
        "headword": "mijisi",
        "english_gloss_candidate": "we eat",
        "part_of_speech": "verb animate intransitive",
        "grammatical_label": "first person plural exclusive animate",
        "surface_form_candidate": "mijisieg",
    }
    entry = {"legacy_v1_split": "train"}
    result = morphology_task_row(row, entry, "direct_form_reconstruction")
    assert result is not None
    assert result["input_text"].startswith("<inflect> mijisi")
    assert result["output_text"] == "mijisieg"
    assert result["promotion_eligible"] is False


def test_stable_order_is_reproducible_and_seeded() -> None:
    rows = [{"id": value} for value in ("a", "b", "c", "d")]
    first = [row["id"] for row in stable_order(rows, 7, "x")]
    second = [row["id"] for row in stable_order(rows, 7, "x")]
    other = [row["id"] for row in stable_order(rows, 8, "x")]
    assert first == second
    assert first != other


def test_scheduled_replay_fills_exact_quota_with_unique_ids() -> None:
    rows = [{"id": "a", "task": "translate"}, {"id": "b", "task": "translate"}]
    scheduled = scheduled_replay(rows, 5, seed=7, label="sentence")
    assert len(scheduled) == 5
    assert len({row["id"] for row in scheduled}) == 5
    assert {row["schedule_source_id"] for row in scheduled} == {"a", "b"}


def test_phrase_counts_and_glossary_exposure_are_whole_word_and_lineage_aware() -> None:
    counts = phrase_occurrence_counts(
        ["Mijisi goqwei.", "Geju'n ta'n goqwei."],
        ["mijisi", "ta'n_goqwei", "jisi"],
    )
    assert counts[tuple(word_tokens("mijisi"))] == 1
    assert counts[tuple(word_tokens("ta'n_goqwei"))] == 1
    assert counts[tuple(word_tokens("jisi"))] == 0

    rows = [
        {
            "id": "g",
            "glossary_pairs": [
                {"entry_id": "entry-new", "migmaq_headword": "welta'si"},
            ],
        }
    ]
    annotated = annotate_glossary_lineage_exposure(
        rows,
        training_target_texts=["Mijisi goqwei."],
        direct_lexical_entry_ids={"entry-old"},
        glossary_training_entry_ids=set(),
    )
    assert annotated[0]["project_lineage_unexposed"] is True
    assert annotated[0]["glossary_pairs"][0]["project_lineage_unexposed"] is True

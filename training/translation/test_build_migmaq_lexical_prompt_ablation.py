from __future__ import annotations

try:
    from .build_migmaq_lexical_prompt_ablation import (
        direct_ids,
        same_pos_derangement,
        variant_row,
    )
except ImportError:
    from build_migmaq_lexical_prompt_ablation import (
        direct_ids,
        same_pos_derangement,
        variant_row,
    )


def lexical_row(row_id: str, gloss: str, target: str, pos: str = "noun") -> dict:
    return {
        "id": row_id,
        "input_text": f"<lexeme> {gloss} <pos> {pos}",
        "unconditioned_input_text": gloss,
        "output_text": target,
        "accepted_references": [target],
        "part_of_speech": pos,
    }


def test_direct_ids_requires_unique_lexical_sources() -> None:
    rows = [
        {"task": "translate", "id": "sentence"},
        {"task": "lexeme", "schedule_source_id": "lexeme-a"},
        {"task": "lexeme", "schedule_source_id": "lexeme-b"},
    ]
    assert direct_ids(rows) == ["lexeme-a", "lexeme-b"]


def test_derangement_stays_within_pos_and_never_keeps_anchor() -> None:
    rows = [
        lexical_row("a", "woman", "e'pit"),
        lexical_row("b", "man", "ji'nm"),
        lexical_row("c", "dog", "l'mu'j"),
    ]
    mapping = same_pos_derangement(rows, seed=7)
    assert set(mapping) == {"a", "b", "c"}
    assert all(anchor != donor for anchor, donor in mapping.items())


def test_shuffled_variant_uses_donor_semantics_but_anchor_pos() -> None:
    anchor = lexical_row("a", "woman", "e'pit", "noun animate")
    donor = lexical_row("b", "dog", "l'mu'j", "noun animate")
    row = variant_row(anchor, "same_pos_shuffled", donor)
    assert row["input_text"] == "<lexeme> dog <pos> noun animate"
    assert row["accepted_references"] == ["l'mu'j"]
    assert row["anchor_id"] == "a"
    assert row["semantic_source_id"] == "b"


def test_pos_only_is_explicitly_non_translation_diagnostic() -> None:
    row = variant_row(lexical_row("a", "woman", "e'pit"), "pos_only")
    assert row["input_text"] == "<lexeme> <pos> noun"
    assert row["score_as_translation"] is False

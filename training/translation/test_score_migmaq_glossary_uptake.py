from __future__ import annotations


from score_migmaq_glossary_uptake import (
    contains_word_sequence,
    exact_binomial_two_sided,
    paired_rows,
    summarize,
)


def test_word_sequence_matching_is_casefolded_and_boundary_aware() -> None:
    assert contains_word_sequence("Nsitun Gepiet.", "gepiet")
    assert contains_word_sequence("Geju'n ta'n goqwei.", "ta'n_goqwei")
    assert not contains_word_sequence("Geju'n ta'nugwei.", "ta'n")


def test_paired_uptake_counts_gains_and_losses() -> None:
    conditioned = [
        {
            "id": "a",
            "output_text": "Nsitun gepiet.",
            "reference": "Nsitun gepiet.",
            "prediction": "Nsitun gepiet.",
            "project_lineage_unexposed": True,
            "glossary_pairs": [
                {"entry_id": "e1", "migmaq_headword": "gepiet", "english_gloss": "hoarse"}
            ],
        },
        {
            "id": "b",
            "output_text": "Mijisi.",
            "reference": "Mijisi.",
            "prediction": "Pema'sit.",
            "project_lineage_unexposed": False,
            "glossary_pairs": [
                {"entry_id": "e2", "migmaq_headword": "mijisi", "english_gloss": "eats"}
            ],
        },
    ]
    unconditioned = [
        {
            "id": "a-u",
            "conditioned_pair_id": "a",
            "reference": "Nsitun gepiet.",
            "prediction": "Pugwelg'g.",
        },
        {
            "id": "b-u",
            "conditioned_pair_id": "b",
            "reference": "Mijisi.",
            "prediction": "Mijisi.",
        },
    ]
    rows = paired_rows(conditioned, unconditioned)
    summary = summarize(rows)
    assert summary["all_hint_row_gains"] == 1
    assert summary["all_hint_row_losses"] == 1
    assert summary["conditioned_hint_instances_present"] == 1
    assert summary["unconditioned_hint_instances_present"] == 1
    assert summary["project_lineage_unexposed_rows"] == 1
    assert summary["conditioned_exact_rows"] == 1
    assert summary["unconditioned_exact_rows"] == 1


def test_exact_binomial_is_symmetric() -> None:
    assert exact_binomial_two_sided(0, 0) == 1.0
    assert exact_binomial_two_sided(1, 4) == exact_binomial_two_sided(3, 4)

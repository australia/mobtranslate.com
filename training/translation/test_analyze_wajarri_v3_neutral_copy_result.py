from training.translation.analyze_wajarri_v3_neutral_copy_result import (
    levenshtein_edit_counts,
    mutation_class,
)


def test_edit_counts_are_deterministic_for_copy_mutations() -> None:
    assert levenshtein_edit_counts("barrga.", "barrgga.") == {
        "distance": 1,
        "insertions": 1,
        "deletions": 0,
        "substitutions": 0,
        "matches": 6,
    }
    assert mutation_class("barrga.", "barrgga.") == "one_character_mutation"


def test_mutation_class_separates_spacing_and_major_rewrite() -> None:
    assert mutation_class("mungaly-mungaly wajigarda", "mungaly-mungalywajigarda") == (
        "token_boundary_only"
    )
    assert mutation_class("malga marluguru", "marlugurru") == (
        "major_rewrite_or_omission"
    )

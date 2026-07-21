from __future__ import annotations

try:
    from .build_migmaq_lessons_parallel import (
        annotate_eligibility,
        assign_cluster_splits,
        build_existing_index,
        display_text,
        extract_source,
        split_explicit_parallel,
        strip_editorial_brackets,
    )
except ImportError:
    from build_migmaq_lessons_parallel import (
        annotate_eligibility,
        assign_cluster_splits,
        build_existing_index,
        display_text,
        extract_source,
        split_explicit_parallel,
        strip_editorial_brackets,
    )


def test_explicit_nonbreaking_space_pairs_are_aligned() -> None:
    pairs, error = split_explicit_parallel(
        "woman\u00a0\u00a0\u00a0women", "e'pit\u00a0\u00a0\u00a0e'pijig"
    )
    assert error is None
    assert pairs == [("woman", "e'pit"), ("women", "e'pijig")]


def test_unbalanced_parallel_sequence_is_not_guessed() -> None:
    pairs, error = split_explicit_parallel("woman\u00a0\u00a0women", "e'pit")
    assert error == "unaligned_explicit_parallel_sequence"
    assert len(pairs) == 1


def test_xml_parser_preserves_nested_text_and_source_line(tmp_path) -> None:
    xml = tmp_path / "master.xml"
    xml.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<lessonset><section><title>Section</title><unit><title>Unit</title><lesson>
<title>Lesson</title><dialog><line><migmaq>Me'<m>tal</m>ein?</migmaq>
<english>How are you?</english><soundfile>clip</soundfile></line></dialog>
</lesson></unit></section></lessonset>""",
        encoding="utf-8",
    )
    lines, pairs = extract_source(xml, "a" * 40)
    assert len(lines) == 1
    assert len(pairs) == 1
    assert pairs[0]["migmaq"] == "Me'talein?"
    assert pairs[0]["task"] == "translate"
    assert lines[0]["derived_pair_ids"] == [pairs[0]["id"]]


def test_existing_heldout_source_overlap_is_excluded() -> None:
    index = build_existing_index(
        {
            "train": [],
            "validation": [
                {
                    "unconditioned_input_text": "How are you?",
                    "output_text": "Me'talein?",
                }
            ],
            "test": [],
        }
    )
    row = {
        "id": "new",
        "english": "How are you!",
        "migmaq": "Teliaq?",
        "quality_flags": [],
        "exclusion_reasons": [],
    }
    annotate_eligibility([row], index)
    assert row["approved_for_training"] is False
    assert "existing_heldout_source_overlap" in row["exclusion_reasons"]


def test_whole_lessons_connected_by_either_side_share_a_split() -> None:
    rows = [
        {
            "id": "a",
            "lesson_id": "lesson-a",
            "english": "woman",
            "migmaq": "e'pit",
            "approved_for_training": True,
        },
        {
            "id": "b",
            "lesson_id": "lesson-b",
            "english": "the woman",
            "migmaq": "e'pit",
            "approved_for_training": True,
        },
        {
            "id": "c",
            "lesson_id": "lesson-c",
            "english": "dog",
            "migmaq": "l'mu'j",
            "approved_for_training": True,
        },
    ]
    # Add independent lessons until all deterministic split buckets are populated.
    for index in range(200):
        rows.append(
            {
                "id": f"f-{index}",
                "lesson_id": f"filler-{index}",
                "english": f"source {index}",
                "migmaq": f"target {index}",
                "approved_for_training": True,
            }
        )
    audit = assign_cluster_splits(rows, seed=20260721)
    assert rows[0]["split"] == rows[1]["split"]
    assert rows[0]["split_component_id"] == rows[1]["split_component_id"]
    assert all(value == 0 for value in audit["cross_split_overlap"].values())


def test_display_normalization_folds_quotes_and_unicode_whitespace() -> None:
    assert display_text("  Mi’kmaq\u00a0 language  ") == "Mi'kmaq language"


def test_balanced_editorial_brackets_are_removed_without_double_punctuation() -> None:
    cleaned, annotations, removed = strip_editorial_brackets(
        "Button your shirt.[same as above]."
    )
    assert cleaned == "Button your shirt."
    assert annotations == ["same as above"]
    assert removed is True


def test_unbalanced_editorial_brackets_are_preserved() -> None:
    source = "Today is the first [day."
    assert strip_editorial_brackets(source) == (source, [], False)

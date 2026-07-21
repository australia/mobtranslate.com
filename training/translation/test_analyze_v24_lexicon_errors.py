#!/usr/bin/env python3

from __future__ import annotations

from collections import Counter
import unittest

from training.translation.analyze_v24_lexicon_errors import (
    analyze_model,
    character_error_rate,
    classify_row,
    compare_models,
    grapheme_error_rate,
    lineage_occurrences,
    load_synthetic_counts,
    parts_of_speech,
    provenance_status,
)
from pathlib import Path
import tempfile


def row(row_id: str, source: str, references: list[str], prediction: str, occurrences: int = 0) -> dict:
    return {
        "id": row_id,
        "input_text": f"<lexeme> {source}",
        "unconditioned_input_text": source,
        "output_text": references[0],
        "accepted_references": references,
        "prediction": prediction,
        "lexicon": {
            "documented_lineage_exposure": {"v21.2": {"target_surface_occurrences": occurrences}},
            "parts_of_speech": ["Noun"],
        },
    }


class V24LexiconErrorAnalysisTest(unittest.TestCase):
    def test_character_error_rate(self) -> None:
        self.assertEqual(character_error_rate("kuli", "kuli"), 0.0)
        self.assertEqual(character_error_rate("kuli", "kulil"), 0.2)
        self.assertEqual(grapheme_error_rate("kuli", "kulil"), 0.2)

    def test_curated_metadata_is_not_misreported_as_zero_exposure(self) -> None:
        item = row("curated", "water", ["bana"], "bana")
        item.pop("lexicon")
        item["curated_dictionary"] = {
            "ambiguous_surface_prompt": False,
            "entry_records": [
                {"type": "noun", "semantic_domain": "water", "source": "dictionary"}
            ],
        }
        self.assertIsNone(lineage_occurrences(item))
        self.assertEqual(parts_of_speech(item), ["noun"])
        self.assertEqual(provenance_status(item), "curated_dictionary_census")
        summary, _ = analyze_model([item], {}, 0.34)
        self.assertEqual(
            summary["strata"]["documented_v21_2_target_occurrences"]["unknown"]["rows"],
            1,
        )
        self.assertEqual(summary["strata"]["part_of_speech"]["noun"]["exact_count"], 1)

    def test_joined_provenance_metadata_is_exposed(self) -> None:
        item = row("raw", "water", ["bana"], "wrong")
        item["analysis_metadata"] = {
            "crosswalk_status": "grammar_extraction_only_unadjudicated",
            "grammar_extraction_parts_of_speech": ["Noun"],
        }
        self.assertEqual(provenance_status(item), "grammar_extraction_only_unadjudicated")

    def test_error_taxonomy_is_ordered_and_surface_explicit(self) -> None:
        rows = [
            row("exact", "anger", ["kuli"], "kuli"),
            row("alternative", "anger", ["kuli", "wawu"], "wawu"),
            row("empty", "rain", ["bana"], ""),
            row("copy", "woman", ["jalbu"], "woman"),
            row("extra", "man", ["bama"], "bama indeed"),
            row("other-headword", "child", ["kangkal"], "jalbu"),
            row("hyphen", "angrily", ["kuli-ji-ku"], "kulijiku"),
            row("near", "water", ["bana"], "banaa"),
            row("other", "sun", ["kalka"], "wawu buyun"),
        ]
        known = {}
        for item in rows:
            for reference in item["accepted_references"]:
                known.setdefault(reference, set()).add(item["id"])
        categories = [classify_row(item, known, 0.34)["category"] for item in rows]
        self.assertEqual(
            categories,
            [
                "exact_selected",
                "exact_alternative_reference",
                "empty",
                "source_copy",
                "accepted_with_extra_material",
                "known_target_for_other_prompt",
                "notation_or_hyphen_mismatch",
                "near_orthographic",
                "other",
            ],
        )

        _, analyzed = analyze_model(rows, {}, 0.34)
        cross_prompt = analyzed["other-headword"]["analysis"]
        self.assertEqual(cross_prompt["known_target_competitor_count"], 1)
        self.assertEqual(
            cross_prompt["known_target_competitors"],
            [
                {
                    "id": "copy",
                    "input_text": "<lexeme> woman",
                    "unconditioned_input_text": "woman",
                    "accepted_references": ["jalbu"],
                }
            ],
        )

    def test_selected_reference_excluded_from_accepted_set_is_not_exact(self) -> None:
        item = row("conflict", "father", ["nganjan-anka", "ganjan"], "nganjan")
        item["output_text"] = "nganjan"
        known = {reference: {item["id"]} for reference in item["accepted_references"]}

        analysis = classify_row(item, known, 0.34)
        summary, _ = analyze_model([item], {}, 0.34)

        self.assertEqual(analysis["category"], "selected_reference_not_accepted")
        self.assertFalse(analysis["exact"])
        self.assertFalse(analysis["selected_reference_is_accepted"])
        self.assertEqual(summary["exact_count"], 0)
        self.assertEqual(summary["selected_reference_not_accepted_count"], 1)

    def test_extra_material_recognizes_hyphen_delimited_parts(self) -> None:
        known = {"milka": {"ear"}, "kuyu": {"fish"}}

        self.assertEqual(
            classify_row(row("ear", "ear", ["milka"], "milka-ji"), known, 0.34)["category"],
            "accepted_with_extra_material",
        )
        self.assertEqual(
            classify_row(row("fish", "fish", ["kuyu"], "kuyu-kuyu"), known, 0.34)["category"],
            "accepted_with_extra_material",
        )
        self.assertEqual(
            classify_row(
                row("sleep", "sleep", ["warngku-wuna-y"], "warngku-wuna-y-baja"),
                {"warngku-wuna-y": {"sleep"}},
                0.34,
            )["category"],
            "accepted_with_extra_material",
        )

    def test_synthetic_counts_separate_explicit_targets_from_surface_occurrences(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.jsonl"
            path.write_text(
                '{"ku":"Bana yala.","meta":{"lexical_targets":["bana"]}}\n'
                '{"ku":"Bana bana.","meta":{"lexical_targets":["yala"]}}\n',
                encoding="utf-8",
            )
            explicit, surface = load_synthetic_counts(path, maximum_ngram=2)
        self.assertEqual(explicit["bana"], 1)
        self.assertEqual(explicit["yala"], 1)
        self.assertEqual(surface["bana"], 3)
        self.assertEqual(surface["bana yala"], 1)

    def test_model_comparison_tracks_gains_losses_and_strata(self) -> None:
        control_rows = [
            row("a", "anger", ["kuli"], "kuli", occurrences=20),
            row("b", "rain", ["bana"], "wawu", occurrences=0),
            row("c", "woman", ["jalbu"], "jalbu", occurrences=1),
        ]
        treatment_rows = [
            row("a", "anger", ["kuli"], "wawu", occurrences=20),
            row("b", "rain", ["bana"], "bana", occurrences=0),
            row("c", "woman", ["jalbu"], "jalbu", occurrences=1),
        ]
        control_summary, control = analyze_model(control_rows, {}, 0.34)
        treatment_summary, treatment = analyze_model(
            treatment_rows,
            {},
            0.34,
            Counter({"bana": 5}),
        )
        comparison = compare_models(treatment, control)
        self.assertEqual(control_summary["exact_count"], 2)
        self.assertEqual(treatment_summary["exact_count"], 2)
        self.assertEqual(comparison["gained_exact_ids"], ["b"])
        self.assertEqual(comparison["lost_exact_ids"], ["a"])
        self.assertEqual(comparison["net_exact_gain"], 0)
        self.assertEqual(
            treatment_summary["strata"]["documented_v21_2_target_occurrences"]["0-0"]["exact_count"],
            1,
        )
        self.assertEqual(
            treatment_summary["strata"]["synthetic_explicit_target_occurrences"]["5-19"]["rows"],
            1,
        )


if __name__ == "__main__":
    unittest.main()

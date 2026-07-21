from __future__ import annotations

try:
    from .analyze_migmaq_lexical_prompt_ablation import analyze_model
except ImportError:
    from analyze_migmaq_lexical_prompt_ablation import analyze_model


def benchmark_rows() -> dict[str, dict]:
    result = {}
    variants = {
        "original": ("woman", ["e'pit"], True),
        "no_pos": ("woman", ["e'pit"], True),
        "plain": ("woman", ["e'pit"], True),
        "pos_only": ("woman", ["e'pit"], False),
        "same_pos_shuffled": ("dog", ["l'mu'j"], True),
    }
    for variant, (gloss, references, score) in variants.items():
        row_id = f"a:{variant}"
        result[row_id] = {
            "id": row_id,
            "ablation_variant": variant,
            "anchor_id": "a",
            "anchor_gloss": "woman",
            "semantic_source_id": "b" if variant == "same_pos_shuffled" else "a",
            "semantic_gloss": gloss,
            "part_of_speech": "noun animate",
            "input_text": gloss,
            "accepted_references": references,
            "output_text": references[0],
            "score_as_translation": score,
        }
    return result


def prediction(row_id: str, value: str, reference: str) -> dict:
    return {
        "id": row_id,
        "prediction": value,
        "prediction_normalized": value,
        "accepted_exact": value == reference,
        "grapheme_cer": 0.0 if value == reference else 1.0,
    }


def test_analysis_detects_visible_shuffled_gloss_response() -> None:
    benchmark = benchmark_rows()
    predictions = {
        "a:original": prediction("a:original", "e'pit", "e'pit"),
        "a:no_pos": prediction("a:no_pos", "e'pit", "e'pit"),
        "a:plain": prediction("a:plain", "e'pit", "e'pit"),
        "a:pos_only": prediction("a:pos_only", "e'pit", "e'pit"),
        "a:same_pos_shuffled": prediction("a:same_pos_shuffled", "l'mu'j", "l'mu'j"),
    }
    report, rows = analyze_model(benchmark, predictions, expected_anchors=1)
    assert report["same_pos_shuffle"]["output_change_rate"] == 1.0
    assert report["same_pos_shuffle"]["closer_to_visible_target_rate"] == 1.0
    assert report["variants"]["same_pos_shuffled"]["accepted_exact_count"] == 1
    assert rows[0]["shuffle_alignment"]["relation"] == (
        "closer_to_visible_shuffled_gloss_target"
    )


def test_analysis_marks_pos_only_as_non_scorable() -> None:
    benchmark = benchmark_rows()
    predictions = {
        row_id: prediction(row_id, "e'pit", row["accepted_references"][0])
        for row_id, row in benchmark.items()
    }
    report, _ = analyze_model(benchmark, predictions, expected_anchors=1)
    assert "accepted_exact_count" not in report["variants"]["pos_only"]

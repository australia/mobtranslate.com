from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from evaluate_migmaq_lexical_baseline import (
    classify_edit,
    edit_distance,
    metric_report,
    normalize,
    normalized_references,
    restore_serialized_nllb_input_aliases,
    tokenizer_bundle_identity,
)


def test_normalization_folds_equivalent_quotes_but_keeps_punctuation() -> None:
    assert normalize("  Lnu\u2019k  ") == "lnu'k"
    assert normalize("GO! ") == "go!"


def test_edit_distance_handles_codepoint_sequences() -> None:
    assert edit_distance(list("kitten"), list("sitting")) == 3
    assert edit_distance([], list("abc")) == 3


def test_references_are_deduplicated_after_comparison_normalization() -> None:
    row = {"id": "a", "accepted_references": ["Lnu\u2019k", "lnu'k"]}
    assert normalized_references(row) == ["lnu'k"]


@pytest.mark.parametrize(
    ("prediction", "references", "source", "expected"),
    [
        ("", ["mijisi"], "eat", "empty"),
        ("eat", ["mijisi"], "eat", "source_copy"),
        ("mijisi", ["mijisi"], "eat", "exact"),
        ("miji", ["mijisi"], "eat", "under_generation_surface"),
        ("mijisi aqq", ["mijisi"], "eat", "over_generation_surface"),
    ],
)
def test_edit_taxonomy_is_deterministic(
    prediction: str, references: list[str], source: str, expected: str,
) -> None:
    assert classify_edit(prediction, references, source) == expected


def test_metric_report_uses_accepted_reference_exact_and_wilson_gate() -> None:
    rows = [
        {
            "accepted_exact": True,
            "selected_exact": True,
            "empty": False,
            "source_copy": False,
            "prediction_normalized": f"p{index}",
            "codepoint_cer": 0.0,
            "grapheme_cer": 0.0,
        }
        for index in range(90)
    ]
    rows.extend(
        {
            "accepted_exact": False,
            "selected_exact": False,
            "empty": False,
            "source_copy": False,
            "prediction_normalized": f"wrong{index}",
            "codepoint_cer": 1.0,
            "grapheme_cer": 1.0,
        }
        for index in range(10)
    )
    report = metric_report(rows, 0.80)
    assert report["accepted_exact_count"] == 90
    assert report["accepted_exact_percent"] == pytest.approx(90.0)
    assert report["wilson_95"]["low"] > 0.80
    assert report["passes_confidence_adjusted_development_gate"] is True


def test_tokenizer_bundle_identity_supports_slow_sentencepiece(tmp_path: Path) -> None:
    (tmp_path / "tokenizer_config.json").write_text("{}\n", encoding="utf-8")
    (tmp_path / "sentencepiece.bpe.model").write_bytes(b"spm")
    (tmp_path / "added_tokens.json").write_text('{"<lexeme>": 9}\n', encoding="utf-8")

    first = tokenizer_bundle_identity(tmp_path)
    second = tokenizer_bundle_identity(tmp_path)

    assert first == second
    assert set(first["files"]) == {
        "added_tokens.json",
        "sentencepiece.bpe.model",
        "tokenizer_config.json",
    }
    assert len(first["sha256"]) == 64


def test_tokenizer_bundle_identity_fails_without_tokenizer_payload(tmp_path: Path) -> None:
    (tmp_path / "tokenizer_config.json").write_text("{}\n", encoding="utf-8")
    with pytest.raises(FileNotFoundError, match="no tokenizer.json"):
        tokenizer_bundle_identity(tmp_path)


def _fake_serialized_nllb(torch, *, divergent: bool = False):
    shared = torch.nn.Embedding(5, 3)
    encoder = torch.nn.Embedding(5, 3)
    decoder = torch.nn.Embedding(5, 3)
    output = torch.nn.Embedding(5, 3)
    with torch.no_grad():
        encoder.weight.copy_(shared.weight)
        decoder.weight.copy_(shared.weight)
        if divergent:
            decoder.weight[0, 0].add_(1)

    class FakeModel:
        def __init__(self):
            self.model = SimpleNamespace(
                shared=shared,
                encoder=SimpleNamespace(embed_tokens=encoder),
                decoder=SimpleNamespace(embed_tokens=decoder),
            )
            self.config = SimpleNamespace(tie_word_embeddings=False)

        def get_input_embeddings(self):
            return self.model.shared

        def get_output_embeddings(self):
            return output

        def set_input_embeddings(self, value):
            self.model.shared = value
            self.model.encoder.embed_tokens = value
            self.model.decoder.embed_tokens = value

    return FakeModel()


def test_reload_restores_only_exactly_equal_nllb_input_aliases() -> None:
    torch = pytest.importorskip("torch")
    model = _fake_serialized_nllb(torch)

    report = restore_serialized_nllb_input_aliases(model)

    assert report["action"] == "restored_equal_serialized_aliases"
    assert all(report["serialized_values_exactly_equal"].values())
    assert report["before"]["shared_encoder_decoder_tied"] is False
    assert report["after"]["shared_encoder_decoder_tied"] is True


def test_reload_rejects_divergent_nllb_input_embeddings() -> None:
    torch = pytest.importorskip("torch")
    model = _fake_serialized_nllb(torch, divergent=True)

    with pytest.raises(ValueError, match="divergent values"):
        restore_serialized_nllb_input_aliases(model)

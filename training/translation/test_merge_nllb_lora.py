from types import SimpleNamespace

import pytest
import torch

from merge_nllb_lora import canonicalize_merged_embeddings


class DummyModel:
    def __init__(self, *, divergent: bool = False) -> None:
        shared = torch.nn.Embedding(4, 3)
        encoder = torch.nn.Embedding(4, 3)
        decoder = torch.nn.Embedding(4, 3)
        encoder.weight.data.copy_(shared.weight.data)
        decoder.weight.data.copy_(shared.weight.data)
        if divergent:
            decoder.weight.data[0, 0] += 1
        self.model = SimpleNamespace(
            shared=shared,
            encoder=SimpleNamespace(embed_tokens=encoder),
            decoder=SimpleNamespace(embed_tokens=decoder),
        )
        self.config = SimpleNamespace(tie_word_embeddings=False)
        self.output = torch.nn.Linear(3, 4, bias=False)

    def get_output_embeddings(self) -> torch.nn.Module:
        return self.output


def test_canonicalize_accepts_equal_separately_loaded_embeddings() -> None:
    model = DummyModel()
    report = canonicalize_merged_embeddings(model)

    assert report["encoder_decoder_tied_before"] is False
    assert report["encoder_decoder_values_equal_before"] is True
    assert model.model.shared is model.model.decoder.embed_tokens
    assert model.model.encoder.embed_tokens is model.model.decoder.embed_tokens


def test_canonicalize_rejects_divergent_embedding_values() -> None:
    with pytest.raises(RuntimeError, match="values diverged"):
        canonicalize_merged_embeddings(DummyModel(divergent=True))

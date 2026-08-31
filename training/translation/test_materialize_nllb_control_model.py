from __future__ import annotations

import unittest


class FakeTokenizer:
    def __init__(self, vocabulary: dict[str, int], decompositions: dict[str, list[int]]) -> None:
        self.vocabulary = vocabulary
        self.decompositions = decompositions

    def __len__(self) -> int:
        return len(self.vocabulary)

    def convert_tokens_to_ids(self, token: str) -> int:
        return self.vocabulary[token]

    def encode(self, token: str, add_special_tokens: bool = False) -> list[int]:
        del add_special_tokens
        if token in self.decompositions:
            return list(self.decompositions[token])
        return [self.vocabulary[token]]


class MaterializeNllbControlModelTest(unittest.TestCase):
    def test_initialization_preserves_named_rows_and_initializes_every_control_surface(self) -> None:
        import torch
        from transformers import M2M100Config, M2M100ForConditionalGeneration

        from training.translation.materialize_nllb_control_model import initialize_control_rows

        config = M2M100Config(
            vocab_size=8,
            d_model=8,
            encoder_layers=1,
            decoder_layers=1,
            encoder_ffn_dim=16,
            decoder_ffn_dim=16,
            encoder_attention_heads=2,
            decoder_attention_heads=2,
            max_position_embeddings=32,
            pad_token_id=0,
            eos_token_id=1,
            decoder_start_token_id=1,
            tie_word_embeddings=False,
        )
        model = M2M100ForConditionalGeneration(config)
        with torch.no_grad():
            model.model.shared.weight.copy_(torch.arange(64).reshape(8, 8))
            model.lm_head.weight.copy_(torch.arange(64, 128).reshape(8, 8))
        named_input_before = model.model.shared.weight[:6].detach().clone()
        named_output_before = model.lm_head.weight[:6].detach().clone()
        base = FakeTokenizer(
            {"<pad>": 0, "</s>": 1, "a": 2, "b": 3, "eng_Latn": 4, "tpi_Latn": 5},
            {
                "<lexeme>": [2, 3],
                "<translate>": [3, 2],
                "<glossary>": [2, 2, 3],
            },
        )
        control = FakeTokenizer(
            {
                "<pad>": 0,
                "</s>": 1,
                "a": 2,
                "b": 3,
                "eng_Latn": 4,
                "tpi_Latn": 5,
                "wbv_Latn": 6,
                "<lexeme>": 7,
                "<translate>": 8,
                "<glossary>": 9,
            },
            {},
        )
        extension = {
            "base_named_vocabulary_size": 6,
            "extended_named_vocabulary_size": 10,
            "ordered_extension_rows": [
                {
                    "token": "wbv_Latn",
                    "token_id": 6,
                    "initialization": {
                        "strategy": "copy_existing_input_and_output_rows",
                        "source_token": "tpi_Latn",
                        "source_token_id": 5,
                    },
                },
                *[
                    {
                        "token": token,
                        "token_id": token_id,
                        "initialization": {
                            "strategy": "base_decomposition_mean_input_and_output_rows",
                            "base_decomposition_ids": base.decompositions[token],
                        },
                    }
                    for token, token_id in (
                        ("<lexeme>", 7),
                        ("<translate>", 8),
                        ("<glossary>", 9),
                    )
                ],
            ],
        }

        report = initialize_control_rows(model, base, control, extension)

        self.assertEqual(report["status"], "PASS")
        self.assertTrue(torch.equal(model.model.shared.weight[:6], named_input_before))
        self.assertTrue(torch.equal(model.lm_head.weight[:6], named_output_before))
        self.assertTrue(torch.equal(model.model.shared.weight[6], named_input_before[5]))
        self.assertTrue(torch.equal(model.lm_head.weight[6], named_output_before[5]))
        self.assertTrue(
            torch.equal(model.model.shared.weight[7], named_input_before[[2, 3]].float().mean(0))
        )
        self.assertTrue(
            torch.equal(model.lm_head.weight[7], named_output_before[[2, 3]].float().mean(0))
        )
        self.assertEqual(
            model.model.shared.weight.data_ptr(),
            model.model.encoder.embed_tokens.weight.data_ptr(),
        )
        self.assertEqual(
            model.model.shared.weight.data_ptr(),
            model.model.decoder.embed_tokens.weight.data_ptr(),
        )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest


class FakeTokenizer:
    def __init__(
        self,
        vocabulary: dict[str, int],
        decompositions: dict[str, list[int]],
        special_tokens: set[str] | None = None,
    ) -> None:
        self._vocabulary = vocabulary
        self._decompositions = decompositions
        self.unk_token_id = vocabulary["<unk>"]
        self.all_special_ids = [vocabulary[token] for token in special_tokens or set()]

    def __len__(self) -> int:
        return len(self._vocabulary)

    def get_vocab(self) -> dict[str, int]:
        return dict(self._vocabulary)

    def encode(self, text: str, add_special_tokens: bool = False) -> list[int]:
        del add_special_tokens
        return list(self._decompositions[text])

    def convert_ids_to_tokens(self, token_ids: list[int]) -> list[str]:
        inverse = {token_id: token for token, token_id in self._vocabulary.items()}
        return [inverse[token_id] for token_id in token_ids]


class NllbTokenizerRemapTest(unittest.TestCase):
    def setUp(self) -> None:
        self.base = FakeTokenizer(
            {"<pad>": 0, "<unk>": 1, "a": 2, "b": 3, "mic_Latn": 4},
            {"ab": [2, 3], "<lexeme>": [2, 3]},
            {"<pad>", "<unk>", "mic_Latn"},
        )
        self.candidate = FakeTokenizer(
            {
                "<pad>": 0,
                "<unk>": 1,
                "a": 2,
                "b": 3,
                "ab": 4,
                "mic_Latn": 5,
                "<lexeme>": 6,
            },
            {"<lexeme>": [6]},
            {"<pad>", "<unk>", "mic_Latn", "<lexeme>"},
        )
        self.remap = [
            {"token": token, "old_id": old_id, "new_id": self.candidate.get_vocab()[token]}
            for token, old_id in self.base.get_vocab().items()
        ]
        self.new_pieces = [
            {
                "token": "ab",
                "token_id": 4,
                "surface_for_initialization": "ab",
                "old_decomposition_ids": [2, 3],
            }
        ]

    def test_plan_covers_relocated_and_initialized_rows(self) -> None:
        from training.translation.nllb_tokenizer_remap import build_embedding_remap_plan

        plan = build_embedding_remap_plan(
            self.base,
            self.candidate,
            self.remap,
            self.new_pieces,
            ["<lexeme>"],
        )

        self.assertEqual(plan["common_row_count"], 5)
        self.assertEqual(plan["moved_common_row_count"], 1)
        self.assertEqual(plan["initialized_row_count"], 2)
        self.assertEqual(plan["control_row_count"], 1)
        by_token = {row["token"]: row for row in plan["initialized_rows"]}
        self.assertEqual(by_token["ab"]["base_decomposition_ids"], [2, 3])
        self.assertEqual(by_token["<lexeme>"]["base_decomposition_ids"], [2, 3])

    def test_matrix_remap_copies_identity_and_means_new_rows(self) -> None:
        import torch

        from training.translation.nllb_tokenizer_remap import (
            build_embedding_remap_plan,
            remap_embedding_matrix,
        )

        plan = build_embedding_remap_plan(
            self.base,
            self.candidate,
            self.remap,
            self.new_pieces,
            ["<lexeme>"],
        )
        old = torch.arange(15, dtype=torch.float32).reshape(5, 3)
        new = remap_embedding_matrix(old, plan)

        self.assertTrue(torch.equal(new[5], old[4]))
        self.assertTrue(torch.equal(new[4], (old[2] + old[3]) / 2))
        self.assertTrue(torch.equal(new[6], (old[2] + old[3]) / 2))

    def test_incomplete_or_incorrect_artifacts_fail_closed(self) -> None:
        from training.translation.nllb_tokenizer_remap import build_embedding_remap_plan

        with self.assertRaisesRegex(RuntimeError, "exact common vocabulary"):
            build_embedding_remap_plan(
                self.base,
                self.candidate,
                self.remap[:-1],
                self.new_pieces,
                ["<lexeme>"],
            )
        corrupted = [dict(row) for row in self.new_pieces]
        corrupted[0]["old_decomposition_ids"] = [2]
        with self.assertRaisesRegex(RuntimeError, "does not reproduce"):
            build_embedding_remap_plan(
                self.base,
                self.candidate,
                self.remap,
                corrupted,
                ["<lexeme>"],
            )

    def test_tiny_m2m_model_preserves_topology_and_untied_output(self) -> None:
        import torch
        from transformers import M2M100Config, M2M100ForConditionalGeneration

        from training.translation.nllb_tokenizer_remap import (
            apply_embedding_remap,
            build_embedding_remap_plan,
        )

        config = M2M100Config(
            vocab_size=len(self.base),
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
            model.model.shared.weight.copy_(
                torch.arange(40, dtype=torch.float32).reshape(5, 8)
            )
            model.lm_head.weight.copy_(
                torch.arange(40, 80, dtype=torch.float32).reshape(5, 8)
            )
        input_before = model.model.shared.weight.detach().clone()
        output_before = model.lm_head.weight.detach().clone()
        plan = build_embedding_remap_plan(
            self.base,
            self.candidate,
            self.remap,
            self.new_pieces,
            ["<lexeme>"],
        )

        audit = apply_embedding_remap(model, plan)

        self.assertEqual(audit["status"], "PASS")
        self.assertEqual(tuple(model.model.shared.weight.shape), (7, 8))
        self.assertEqual(
            model.model.shared.weight.data_ptr(),
            model.model.encoder.embed_tokens.weight.data_ptr(),
        )
        self.assertEqual(
            model.model.shared.weight.data_ptr(),
            model.model.decoder.embed_tokens.weight.data_ptr(),
        )
        self.assertNotEqual(model.model.shared.weight.data_ptr(), model.lm_head.weight.data_ptr())
        self.assertTrue(torch.equal(model.model.shared.weight[5], input_before[4]))
        self.assertTrue(torch.equal(model.lm_head.weight[5], output_before[4]))
        self.assertTrue(
            torch.equal(model.model.shared.weight[4], input_before[[2, 3]].mean(dim=0))
        )
        self.assertTrue(torch.equal(model.lm_head.weight[4], output_before[[2, 3]].mean(dim=0)))


if __name__ == "__main__":
    unittest.main()

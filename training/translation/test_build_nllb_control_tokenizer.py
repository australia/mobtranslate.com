from __future__ import annotations

import unittest


class FakeTokenizer:
    def __init__(self) -> None:
        self.vocab = {
            "<pad>": 0,
            "<unk>": 1,
            "a": 2,
            "b": 3,
            "eng_Latn": 4,
            "tpi_Latn": 5,
            "<mask>": 6,
        }
        self.unk_token_id = 1
        self.mask_token = "<mask>"
        self.additional_special_tokens = ["eng_Latn", "tpi_Latn"]
        self.all_special_ids = [0, 1, 4, 5, 6]
        self.lang_code_to_id = {"eng_Latn": 4, "tpi_Latn": 5}
        self.id_to_lang_code = {4: "eng_Latn", 5: "tpi_Latn"}

    def __len__(self) -> int:
        return len(self.vocab)

    def get_vocab(self) -> dict[str, int]:
        return dict(self.vocab)

    def convert_tokens_to_ids(self, token: str) -> int:
        return self.vocab.get(token, self.unk_token_id)

    def convert_ids_to_tokens(self, value: int | list[int]):
        inverse = {token_id: token for token, token_id in self.vocab.items()}
        if isinstance(value, list):
            return [inverse[item] for item in value]
        return inverse[value]

    def encode(self, token: str, add_special_tokens: bool = False) -> list[int]:
        del add_special_tokens
        if token in self.vocab:
            return [self.vocab[token]]
        return {
            "wbv_Latn": [2, 3],
            "<lexeme>": [3, 2],
            "<translate>": [2, 2],
            "<glossary>": [3, 3],
        }.get(token, [self.unk_token_id])

    def add_special_tokens(self, values, replace_additional_special_tokens=True) -> int:
        assert replace_additional_special_tokens
        ordered = list(values["additional_special_tokens"])
        added = 0
        for token in ordered:
            if token not in self.vocab:
                self.vocab[token] = len(self.vocab)
                added += 1
            token_id = self.vocab[token]
            if token_id not in self.all_special_ids:
                self.all_special_ids.append(token_id)
        self.additional_special_tokens = ordered
        return added


class NllbControlTokenizerTest(unittest.TestCase):
    def test_extension_is_ordered_identity_preserving_and_fully_initialized(self) -> None:
        from training.translation.build_nllb_control_tokenizer import build_extension_plan

        tokenizer = FakeTokenizer()
        before = tokenizer.get_vocab()
        plan, base_vocab = build_extension_plan(
            tokenizer,
            source_lang="eng_Latn",
            target_lang="wbv_Latn",
            target_init_token="tpi_Latn",
            task_tokens=["<lexeme>", "<translate>", "<glossary>"],
        )

        self.assertEqual(base_vocab, before)
        self.assertEqual(
            [row["token"] for row in plan["ordered_extension_rows"]],
            ["wbv_Latn", "<lexeme>", "<translate>", "<glossary>"],
        )
        self.assertEqual(
            [row["token_id"] for row in plan["ordered_extension_rows"]],
            [7, 8, 9, 10],
        )
        self.assertEqual(
            plan["ordered_extension_rows"][0]["initialization"],
            {
                "strategy": "copy_existing_input_and_output_rows",
                "source_token": "tpi_Latn",
                "source_token_id": 5,
            },
        )
        self.assertTrue(
            all(
                row["initialization"]["strategy"]
                == "base_decomposition_mean_input_and_output_rows"
                for row in plan["ordered_extension_rows"][1:]
            )
        )
        self.assertEqual(plan["base_tokens_relocated"], 0)
        for token, token_id in before.items():
            self.assertEqual(tokenizer.get_vocab()[token], token_id)

    def test_duplicate_controls_fail_closed(self) -> None:
        from training.translation.build_nllb_control_tokenizer import build_extension_plan

        with self.assertRaisesRegex(ValueError, "nonempty and unique"):
            build_extension_plan(
                FakeTokenizer(),
                source_lang="eng_Latn",
                target_lang="wbv_Latn",
                target_init_token="tpi_Latn",
                task_tokens=["<lexeme>", "<lexeme>"],
            )

    def test_target_decomposition_mean_uses_its_own_base_pieces(self) -> None:
        from training.translation.build_nllb_control_tokenizer import build_extension_plan

        plan, _base_vocab = build_extension_plan(
            FakeTokenizer(),
            source_lang="eng_Latn",
            target_lang="wbv_Latn",
            target_init_token=None,
            target_init_strategy="decomposition_mean",
            task_tokens=["<lexeme>", "<translate>"],
        )

        self.assertEqual(
            plan["ordered_extension_rows"][0]["initialization"],
            {
                "strategy": "base_decomposition_mean_input_and_output_rows",
                "base_decomposition_ids": [2, 3],
                "base_decomposition_tokens": ["a", "b"],
            },
        )

    def test_target_initialization_configuration_fails_closed(self) -> None:
        from training.translation.build_nllb_control_tokenizer import build_extension_plan

        with self.assertRaisesRegex(ValueError, "target_init_token is required"):
            build_extension_plan(
                FakeTokenizer(),
                source_lang="eng_Latn",
                target_lang="wbv_Latn",
                target_init_token=None,
                target_init_strategy="copy_existing",
                task_tokens=["<lexeme>"],
            )

        with self.assertRaisesRegex(ValueError, "target_init_token must be empty"):
            build_extension_plan(
                FakeTokenizer(),
                source_lang="eng_Latn",
                target_lang="wbv_Latn",
                target_init_token="tpi_Latn",
                target_init_strategy="decomposition_mean",
                task_tokens=["<lexeme>"],
            )


if __name__ == "__main__":
    unittest.main()

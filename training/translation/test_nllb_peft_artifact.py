from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class FakeTokenAdapter:
    def __init__(self, indices: list[int], tied: bool) -> None:
        self.token_indices = {"default": indices}
        self.tied_adapter = object() if tied else None


class TrainableTokensWrapper:
    def __init__(self, indices: list[int], tied: bool = False) -> None:
        self.token_adapter = FakeTokenAdapter(indices, tied)


class FakeModel:
    def __init__(self, modules: list[tuple[str, object]]) -> None:
        self._modules = modules

    def named_modules(self, remove_duplicate: bool = False):
        del remove_duplicate
        return iter(self._modules)


class FakeTokenizer:
    def __init__(
        self,
        vocabulary: dict[str, int],
        special_tokens: list[str],
        encodings: dict[str, list[int]],
    ) -> None:
        self.vocabulary = vocabulary
        self.all_special_ids = [vocabulary[token] for token in special_tokens]
        self.encodings = encodings

    def get_vocab(self) -> dict[str, int]:
        return dict(self.vocabulary)

    def convert_tokens_to_ids(self, token: str) -> int:
        return self.vocabulary[token]

    def encode(self, token: str, add_special_tokens: bool = False) -> list[int]:
        del add_special_tokens
        return list(self.encodings[token])


class NllbPeftArtifactTest(unittest.TestCase):
    def test_partial_tokenizer_extension_reload_contract_fails_before_model_load(self) -> None:
        from training.translation.nllb_peft_artifact import (
            load_control_contract_nllb_adapter,
        )

        with self.assertRaisesRegex(RuntimeError, "requires manifest path/hash"):
            load_control_contract_nllb_adapter(
                "/missing/base",
                "/missing/control",
                "/missing/adapter",
                expected_control_contract_sha256="0" * 64,
                source_lang="eng_Latn",
                target_lang="wbv_Latn",
                torch_dtype=None,
                token_id_remap_path="/missing/remap",
            )

    def test_extension_artifact_verifier_binds_adapter_tokenizer_files(self) -> None:
        from training.translation.nllb_peft_artifact import _verify_extension_artifacts

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            adapter = root / "adapter"
            adapter.mkdir()
            remap = root / "token-id-remap.jsonl"
            pieces = root / "new-piece-map.jsonl"
            source_tokenizer = root / "tokenizer"
            source_tokenizer.mkdir()
            tokenizer_config = adapter / "tokenizer_config.json"
            source_tokenizer_config = source_tokenizer / "tokenizer_config.json"
            added_tokens = adapter / "added_tokens.json"
            source_added_tokens = source_tokenizer / "added_tokens.json"
            remap.write_text('{"token":"a"}\n', encoding="utf-8")
            pieces.write_text('{"token":"b"}\n', encoding="utf-8")
            tokenizer_config.write_text('{"model_max_length":64}\n', encoding="utf-8")
            source_tokenizer_config.write_text(
                '{"model_max_length":64}\n', encoding="utf-8"
            )
            added_tokens.write_text('{"<lexeme>":7}\n', encoding="utf-8")
            source_added_tokens.write_text('{"<lexeme>":7}\n', encoding="utf-8")
            manifest = {
                "result": {"status": "PASS"},
                "control_tokens": ["<lexeme>"],
                "artifact_sha256": {
                    "token-id-remap.jsonl": sha256(remap),
                    "new-piece-map.jsonl": sha256(pieces),
                    "tokenizer/tokenizer_config.json": sha256(source_tokenizer_config),
                    "tokenizer/added_tokens.json": sha256(source_added_tokens),
                },
            }
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            observed = _verify_extension_artifacts(
                adapter,
                manifest_path,
                sha256(manifest_path),
                remap,
                pieces,
            )
            self.assertEqual(observed["control_tokens"], ["<lexeme>"])

            tokenizer_config.write_text('{"model_max_length":65}\n', encoding="utf-8")
            _verify_extension_artifacts(
                adapter,
                manifest_path,
                sha256(manifest_path),
                remap,
                pieces,
            )
            added_tokens.write_text('{"<lexeme>":8}\n', encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "lexical artifact drift"):
                _verify_extension_artifacts(
                    adapter,
                    manifest_path,
                    sha256(manifest_path),
                    remap,
                    pieces,
                )

    def test_trainable_token_wrapper_audit_reports_exact_index_topology(self) -> None:
        from training.translation.nllb_peft_artifact import trainable_token_wrapper_audit

        model = FakeModel(
            [
                ("", object()),
                ("model.shared", TrainableTokensWrapper([4, 7, 9])),
                ("model.encoder.embed_tokens", TrainableTokensWrapper([4, 7, 9], True)),
                ("model.decoder.embed_tokens", TrainableTokensWrapper([4, 7, 9], True)),
                ("lm_head", TrainableTokensWrapper([4, 7, 9], True)),
            ]
        )

        audit = trainable_token_wrapper_audit(model)

        self.assertEqual(audit["wrapper_count"], 4)
        self.assertTrue(audit["all_wrappers_share_one_index_set"])
        self.assertEqual(audit["unique_token_index_sets"], [[4, 7, 9]])
        self.assertEqual(
            sum(row["tied_to_another_token_adapter"] for row in audit["wrappers"]),
            3,
        )

    def test_tokenizer_behavior_identity_allows_metadata_rewrite_not_id_drift(self) -> None:
        from training.translation.nllb_peft_artifact import tokenizer_behavior_identity

        reference = FakeTokenizer(
            {"<unk>": 0, "a": 1, "wbv_Latn": 2, "<lexeme>": 3},
            ["<unk>", "wbv_Latn", "<lexeme>"],
            {"wbv_Latn": [2], "<lexeme>": [3]},
        )
        serialized = FakeTokenizer(
            {"<unk>": 0, "a": 1, "wbv_Latn": 2, "<lexeme>": 3},
            ["<lexeme>", "wbv_Latn", "<unk>"],
            {"wbv_Latn": [2], "<lexeme>": [3]},
        )

        audit = tokenizer_behavior_identity(
            reference,
            serialized,
            ["wbv_Latn", "<lexeme>"],
        )
        self.assertEqual(audit["status"], "PASS")

        serialized.encodings["<lexeme>"] = [1, 3]
        with self.assertRaisesRegex(RuntimeError, "special-token behavior"):
            tokenizer_behavior_identity(
                reference,
                serialized,
                ["wbv_Latn", "<lexeme>"],
            )


if __name__ == "__main__":
    unittest.main()

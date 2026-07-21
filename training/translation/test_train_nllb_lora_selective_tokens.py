from __future__ import annotations

import os
from collections import Counter, defaultdict
import json
from pathlib import Path
import tempfile
import unittest


class ExposureLedgerUnitTest(unittest.TestCase):
    def test_writes_sorted_row_level_counts_and_manifest(self) -> None:
        from training.translation.train_nllb_lora import write_exposure_ledger

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "exposure.jsonl"
            manifest = write_exposure_ledger(path, Counter({"row-b": 2, "row-a": 3}))
            rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

        self.assertEqual(
            rows,
            [
                {"id": "row-a", "presentations": 3},
                {"id": "row-b", "presentations": 2},
            ],
        )
        self.assertEqual(manifest["rows"], 2)
        self.assertEqual(manifest["presentations"], 5)
        self.assertRegex(str(manifest["sha256"]), r"^[0-9a-f]{64}$")

    def test_split_loader_projects_different_provenance_schemas(self) -> None:
        from training.translation.train_nllb_lora import load_json_dataset

        common = {
            "direction": "eng-mic",
            "id": "row-1",
            "input_text": "<translate> water",
            "output_text": "samqwan",
            "pair_kind": "sentence",
            "task": "translate",
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            train = root / "train.jsonl"
            validation = root / "validation.jsonl"
            train.write_text(
                json.dumps({**common, "schedule_cycle": 0}) + "\n",
                encoding="utf-8",
            )
            validation.write_text(
                json.dumps({**common, "source_records": [{"entry_id": "e1"}]}) + "\n",
                encoding="utf-8",
            )
            dataset = load_json_dataset(str(train), str(validation), None)

        expected_columns = [
            "direction",
            "id",
            "input_text",
            "output_text",
            "pair_kind",
            "task",
        ]
        self.assertEqual(dataset["train"].column_names, expected_columns)
        self.assertEqual(dataset["validation"].column_names, expected_columns)
        self.assertEqual(dataset["train"][0]["output_text"], "samqwan")

    def test_m2m100_label_smoothing_keeps_labels_for_decoder_shift(self) -> None:
        import torch
        from transformers import M2M100Config, M2M100ForConditionalGeneration
        from transformers.trainer_pt_utils import LabelSmoother

        from training.translation.train_nllb_lora import ExposureAccountingTrainer

        config = M2M100Config(
            vocab_size=16,
            d_model=8,
            encoder_layers=1,
            decoder_layers=1,
            encoder_ffn_dim=16,
            decoder_ffn_dim=16,
            encoder_attention_heads=1,
            decoder_attention_heads=1,
            pad_token_id=1,
            eos_token_id=2,
            decoder_start_token_id=2,
        )
        model = M2M100ForConditionalGeneration(config)
        self.assertFalse(hasattr(model, "prepare_decoder_input_ids_from_labels"))
        trainer = object.__new__(ExposureAccountingTrainer)
        trainer.exposure_pad_token_id = 1
        trainer.exposure_totals = Counter()
        trainer.exposure_by_task = defaultdict(Counter)
        trainer.exposure_row_presentations = Counter()
        trainer.label_smoother = LabelSmoother(epsilon=0.1)
        inputs = {
            "input_ids": torch.tensor([[4, 5, 1]]),
            "attention_mask": torch.tensor([[1, 1, 0]]),
            "labels": torch.tensor([[6, 7, 2]]),
            "_task_labels": ["translate"],
            "_row_ids": ["row-1"],
        }

        loss, outputs = trainer.compute_loss(model, inputs, return_outputs=True)

        self.assertTrue(torch.isfinite(loss))
        self.assertEqual(tuple(outputs.logits.shape), (1, 3, 16))
        self.assertEqual(trainer.exposure_totals["examples"], 1)
        self.assertEqual(trainer.exposure_row_presentations["row-1"], 1)


@unittest.skipUnless(
    os.environ.get("NLLB_TEST_TOKENIZER"),
    "set NLLB_TEST_TOKENIZER to an audited NLLB tokenizer directory",
)
class SelectiveTokenTrainingIntegrationTest(unittest.TestCase):
    def test_tied_rows_train_save_merge_and_reload(self) -> None:
        import torch
        from peft import LoraConfig, PeftModel, TaskType, get_peft_model
        from transformers import AutoTokenizer, M2M100Config, M2M100ForConditionalGeneration

        from training.translation.train_nllb_lora import (
            add_special_tokens_with_decomposition_mean,
            audit_control_strings,
            canonicalize_merged_embeddings,
            embedding_row_delta_audit,
            resolve_trainable_tokens,
            snapshot_embedding_rows,
        )

        torch.manual_seed(7)
        target_lang = os.environ.get("NLLB_TEST_TARGET_LANG", "gvn_Latn")
        tokenizer = AutoTokenizer.from_pretrained(
            os.environ["NLLB_TEST_TOKENIZER"],
            use_fast=os.environ.get("NLLB_TEST_USE_FAST", "true").casefold() not in {"0", "false", "no"},
            src_lang="eng_Latn",
            tgt_lang=target_lang,
        )
        config = M2M100Config(
            vocab_size=len(tokenizer),
            d_model=16,
            encoder_layers=1,
            decoder_layers=1,
            encoder_ffn_dim=32,
            decoder_ffn_dim=32,
            encoder_attention_heads=2,
            decoder_attention_heads=2,
            max_position_embeddings=64,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
            decoder_start_token_id=tokenizer.eos_token_id,
            tie_word_embeddings=True,
        )
        model = M2M100ForConditionalGeneration(config)
        original_decoder_embeddings = model.model.decoder.embed_tokens
        model.model.encoder.embed_tokens = torch.nn.Embedding.from_pretrained(
            original_decoder_embeddings.weight.detach().clone(),
            freeze=False,
        )
        canonicalization = canonicalize_merged_embeddings(model)
        self.assertFalse(canonicalization["encoder_decoder_tied_before"])
        self.assertTrue(canonicalization["encoder_decoder_values_equal_before"])
        self.assertEqual(
            model.model.encoder.embed_tokens.weight.data_ptr(),
            model.model.decoder.embed_tokens.weight.data_ptr(),
        )

        divergent = M2M100ForConditionalGeneration(config)
        divergent.model.encoder.embed_tokens = torch.nn.Embedding.from_pretrained(
            divergent.model.decoder.embed_tokens.weight.detach().clone(),
            freeze=False,
        )
        with torch.no_grad():
            divergent.model.encoder.embed_tokens.weight[0, 0].add_(1)
        with self.assertRaisesRegex(RuntimeError, "embedding values diverged"):
            canonicalize_merged_embeddings(divergent)

        ordinary_controls = audit_control_strings(tokenizer, ["<lexeme>", "<translate>"])
        self.assertEqual(
            [record["control"] for record in ordinary_controls],
            ["<lexeme>", "<translate>"],
        )
        self.assertTrue(all(record["token_ids"] for record in ordinary_controls))
        self.assertTrue(all(not record["registered_as_special"] for record in ordinary_controls))

        controls = add_special_tokens_with_decomposition_mean(
            tokenizer,
            model,
            ["<lexeme>", "<translate>"],
        )
        self.assertEqual({row["token"] for row in controls}, {"<lexeme>", "<translate>"})
        self.assertTrue(all(row["single_encoded_id"] for row in controls))

        selected_ids, selected = resolve_trainable_tokens(
            tokenizer,
            [target_lang, "<lexeme>", "<translate>"],
        )
        _, audit_rows = resolve_trainable_tokens(
            tokenizer,
            [target_lang, "<lexeme>", "<translate>", "eng_Latn", tokenizer.pad_token],
        )
        before = snapshot_embedding_rows(model, audit_rows)
        pristine_state = {key: value.detach().clone() for key, value in model.state_dict().items()}

        peft_model = get_peft_model(
            model,
            LoraConfig(
                task_type=TaskType.SEQ_2_SEQ_LM,
                r=2,
                lora_alpha=4,
                lora_dropout=0.0,
                target_modules=["q_proj", "v_proj"],
                trainable_token_indices=selected_ids,
            ),
        )
        wrapper_names = [
            name
            for name, module in peft_model.named_modules(remove_duplicate=False)
            if module.__class__.__name__ == "TrainableTokensWrapper"
        ]
        for suffix in (
            "model.shared",
            "model.encoder.embed_tokens",
            "model.decoder.embed_tokens",
            "lm_head",
        ):
            self.assertTrue(any(name.endswith(suffix) for name in wrapper_names), suffix)

        batch = tokenizer(
            ["<lexeme> woman", "<translate> I see water."],
            text_target=["jalbu", "Ngayu bana nyajil."],
            padding=True,
            return_tensors="pt",
        )
        peft_model.train()
        optimizer = torch.optim.SGD(
            [parameter for parameter in peft_model.parameters() if parameter.requires_grad],
            lr=0.05,
        )
        loss = peft_model(**batch).loss
        self.assertTrue(torch.isfinite(loss))
        loss.backward()
        optimizer.step()
        peft_model.eval()

        after = snapshot_embedding_rows(peft_model, audit_rows)
        audit = embedding_row_delta_audit(
            before,
            after,
            {row["token"] for row in selected},
        )
        by_token = {row["token"]: row for row in audit}
        for token in (target_lang, "<lexeme>", "<translate>"):
            self.assertTrue(by_token[token]["input_changed"], token)
            self.assertTrue(by_token[token]["output_changed"], token)
        for token in ("eng_Latn", tokenizer.pad_token):
            self.assertFalse(by_token[token]["input_changed"], token)
            self.assertFalse(by_token[token]["output_changed"], token)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            adapter_dir = root / "adapter"
            peft_model.save_pretrained(adapter_dir)
            tokenizer.save_pretrained(adapter_dir)

            restored_base = M2M100ForConditionalGeneration(config)
            restored_base.load_state_dict(pristine_state)
            restored = PeftModel.from_pretrained(restored_base, adapter_dir)
            restored.eval()
            restored_rows = snapshot_embedding_rows(restored, audit_rows)
            for token in after:
                for kind in after[token]:
                    self.assertTrue(torch.equal(after[token][kind], restored_rows[token][kind]), (token, kind))

            merged = restored.merge_and_unload()
            self.assertEqual(
                merged.get_input_embeddings().weight.data_ptr(),
                merged.get_output_embeddings().weight.data_ptr(),
            )
            merged_dir = root / "merged"
            merged.save_pretrained(merged_dir, safe_serialization=True)
            tokenizer.save_pretrained(merged_dir)
            reloaded = M2M100ForConditionalGeneration.from_pretrained(merged_dir)
            reloaded_rows = snapshot_embedding_rows(reloaded, audit_rows)
            for token in after:
                for kind in after[token]:
                    self.assertTrue(torch.equal(after[token][kind], reloaded_rows[token][kind]), (token, kind))

    def test_untied_output_source_rows_train_save_merge_and_reload(self) -> None:
        import torch
        from peft import LoraConfig, PeftModel, TaskType, get_peft_model
        from transformers import AutoTokenizer, M2M100Config, M2M100ForConditionalGeneration

        from training.translation.train_nllb_lora import (
            add_special_tokens_with_decomposition_mean,
            canonicalize_merged_embeddings,
            embedding_row_delta_audit,
            resolve_source_embedding_module_name,
            resolve_trainable_tokens,
            SelectiveTokenGradientAudit,
            snapshot_nllb_embedding_surface_rows,
            standalone_serialization_state_dict,
        )
        from training.translation.nllb_peft_artifact import canonicalize_nllb_input_embeddings

        torch.manual_seed(11)
        target_lang = os.environ.get("NLLB_TEST_TARGET_LANG", "gvn_Latn")
        tokenizer = AutoTokenizer.from_pretrained(
            os.environ["NLLB_TEST_TOKENIZER"],
            src_lang="eng_Latn",
            tgt_lang=target_lang,
        )
        config = M2M100Config(
            vocab_size=len(tokenizer),
            d_model=16,
            encoder_layers=1,
            decoder_layers=1,
            encoder_ffn_dim=32,
            decoder_ffn_dim=32,
            encoder_attention_heads=2,
            decoder_attention_heads=2,
            max_position_embeddings=64,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
            decoder_start_token_id=tokenizer.eos_token_id,
            tie_word_embeddings=False,
        )
        model = M2M100ForConditionalGeneration(config)
        self.assertEqual(
            model.model.shared.weight.data_ptr(),
            model.model.encoder.embed_tokens.weight.data_ptr(),
        )
        self.assertEqual(
            model.model.shared.weight.data_ptr(),
            model.model.decoder.embed_tokens.weight.data_ptr(),
        )
        self.assertNotEqual(
            model.model.shared.weight.data_ptr(),
            model.lm_head.weight.data_ptr(),
        )
        model.model.encoder.embed_tokens = torch.nn.Embedding.from_pretrained(
            model.model.shared.weight.detach().clone(),
            freeze=False,
        )
        model.model.decoder.embed_tokens = torch.nn.Embedding.from_pretrained(
            model.model.shared.weight.detach().clone(),
            freeze=False,
        )
        topology = canonicalize_nllb_input_embeddings(model)
        self.assertFalse(topology["before"]["encoder_shared_tied"])
        self.assertFalse(topology["before"]["decoder_shared_tied"])
        self.assertTrue(topology["after"]["encoder_shared_tied"])
        self.assertTrue(topology["after"]["decoder_shared_tied"])

        controls = ["<translate>", "<lexeme>", "<pos>"]
        add_special_tokens_with_decomposition_mean(tokenizer, model, controls)
        selected_ids, selected = resolve_trainable_tokens(tokenizer, controls)
        _, audit_rows = resolve_trainable_tokens(
            tokenizer,
            [*controls, "eng_Latn", target_lang, tokenizer.pad_token],
        )
        source_module_name = resolve_source_embedding_module_name(model)
        self.assertEqual(source_module_name, "model.encoder.embed_tokens")
        before = snapshot_nllb_embedding_surface_rows(model, audit_rows)
        pristine_state = {key: value.detach().clone() for key, value in model.state_dict().items()}

        peft_model = get_peft_model(
            model,
            LoraConfig(
                task_type=TaskType.SEQ_2_SEQ_LM,
                r=2,
                lora_alpha=4,
                lora_dropout=0.0,
                target_modules=["q_proj", "v_proj"],
                modules_to_save=["lm_head"],
                trainable_token_indices={source_module_name: selected_ids},
                ensure_weight_tying=False,
            ),
        )
        wrapper_names = [
            name
            for name, module in peft_model.named_modules(remove_duplicate=False)
            if module.__class__.__name__ == "TrainableTokensWrapper"
        ]
        self.assertTrue(any(name.endswith(source_module_name) for name in wrapper_names))
        self.assertFalse(any(name.endswith("model.shared") for name in wrapper_names))
        self.assertFalse(any(name.endswith("model.decoder.embed_tokens") for name in wrapper_names))
        gradient_audit = SelectiveTokenGradientAudit(peft_model, selected)

        batch = tokenizer(
            ["<translate> I see water.", "<lexeme> woman <pos> noun"],
            text_target=["Gesalul.", "epit"],
            padding=True,
            return_tensors="pt",
        )
        peft_model.train()
        optimizer = torch.optim.SGD(
            [parameter for parameter in peft_model.parameters() if parameter.requires_grad],
            lr=0.05,
        )
        loss = peft_model(**batch).loss
        self.assertTrue(torch.isfinite(loss))
        loss.backward()
        optimizer.step()
        peft_model.eval()
        gradient_audit.close()
        gradient_summary = gradient_audit.summary()
        self.assertTrue(gradient_summary["all_selected_rows_received_nonzero_gradient"])

        after = snapshot_nllb_embedding_surface_rows(peft_model, audit_rows)
        audit = embedding_row_delta_audit(
            before,
            after,
            {row["token"] for row in selected},
        )
        by_token = {row["token"]: row for row in audit}
        for token in controls:
            self.assertTrue(by_token[token]["encoder_input_changed"], token)
            self.assertFalse(by_token[token]["shared_input_changed"], token)
            self.assertFalse(by_token[token]["decoder_input_changed"], token)
        for token in ("eng_Latn", target_lang, tokenizer.pad_token):
            for surface in ("encoder_input", "shared_input", "decoder_input"):
                self.assertFalse(by_token[token][f"{surface}_changed"], (token, surface))

        with torch.no_grad():
            before_merge_tokens = peft_model.generate(
                **tokenizer("<lexeme> woman <pos> noun", return_tensors="pt"),
                max_new_tokens=8,
            )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            adapter_dir = root / "adapter"
            peft_model.save_pretrained(adapter_dir)
            tokenizer.save_pretrained(adapter_dir)

            restored_base = M2M100ForConditionalGeneration(config)
            restored_base.load_state_dict(pristine_state)
            restored = PeftModel.from_pretrained(restored_base, adapter_dir)
            restored.eval()
            restored_rows = snapshot_nllb_embedding_surface_rows(restored, audit_rows)
            for token in after:
                for surface in after[token]:
                    self.assertTrue(
                        torch.equal(after[token][surface], restored_rows[token][surface]),
                        (token, surface),
                    )

            merged = restored.merge_and_unload()
            canonicalize_merged_embeddings(merged)
            merged_rows = snapshot_nllb_embedding_surface_rows(merged, audit_rows)
            for token in after:
                for surface in ("encoder_input", "shared_input", "decoder_input"):
                    self.assertTrue(
                        torch.equal(after[token]["encoder_input"], merged_rows[token][surface]),
                        (token, surface),
                    )
            with torch.no_grad():
                merged_tokens = merged.generate(
                    **tokenizer("<lexeme> woman <pos> noun", return_tensors="pt"),
                    max_new_tokens=8,
                )
            self.assertTrue(torch.equal(before_merge_tokens, merged_tokens))

            merged_dir = root / "merged"
            serialization_state, materialized_keys = standalone_serialization_state_dict(merged)
            self.assertEqual(
                materialized_keys,
                [
                    "model.shared.weight",
                    "model.encoder.embed_tokens.weight",
                    "model.decoder.embed_tokens.weight",
                ],
            )
            merged.save_pretrained(
                merged_dir,
                state_dict=serialization_state,
                safe_serialization=True,
            )
            tokenizer.save_pretrained(merged_dir)
            reloaded = M2M100ForConditionalGeneration.from_pretrained(merged_dir)
            reloaded_rows = snapshot_nllb_embedding_surface_rows(reloaded, audit_rows)
            for token in merged_rows:
                for surface in merged_rows[token]:
                    self.assertTrue(
                        torch.equal(merged_rows[token][surface], reloaded_rows[token][surface]),
                        (token, surface),
                    )
            with torch.no_grad():
                reloaded_tokens = reloaded.generate(
                    **tokenizer("<lexeme> woman <pos> noun", return_tensors="pt"),
                    max_new_tokens=8,
                )
            self.assertTrue(torch.equal(merged_tokens, reloaded_tokens))


if __name__ == "__main__":
    unittest.main()

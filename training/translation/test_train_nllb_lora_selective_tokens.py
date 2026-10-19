from __future__ import annotations

import os
from collections import Counter, defaultdict
import copy
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest


class DatasetIntegrityUnitTest(unittest.TestCase):
    @staticmethod
    def row(row_id: str, source: str, target: str) -> dict[str, str]:
        return {
            "direction": "eng-wbv",
            "id": row_id,
            "input_text": source,
            "output_text": target,
            "pair_kind": "dictionary_lexeme",
            "task": "lexeme",
        }

    def test_accepts_disjoint_nonempty_splits(self) -> None:
        from training.translation.train_nllb_lora import audit_dataset_integrity

        audit = audit_dataset_integrity(
            {
                "train": [self.row("train-1", "<lexeme> woman", "jalbu")],
                "validation": [self.row("dev-1", "<lexeme> water", "bana")],
            },
            allow_duplicate_train_pairs=False,
            allow_cross_split_source_overlap=False,
        )

        self.assertEqual(audit["status"], "PASS")
        self.assertEqual(audit["globally_unique_row_ids"], 2)
        self.assertEqual(audit["cross_split_source_groups"], 0)

    def test_rejects_duplicate_ids_and_exact_pair_leakage(self) -> None:
        from training.translation.train_nllb_lora import audit_dataset_integrity

        with self.assertRaisesRegex(ValueError, "not globally unique"):
            audit_dataset_integrity(
                {
                    "train": [self.row("row-1", "<lexeme> woman", "jalbu")],
                    "validation": [self.row("row-1", "<lexeme> water", "bana")],
                },
                allow_duplicate_train_pairs=False,
                allow_cross_split_source_overlap=False,
            )
        with self.assertRaisesRegex(ValueError, "source-target pairs"):
            audit_dataset_integrity(
                {
                    "train": [self.row("train-1", "<lexeme> woman", "jalbu")],
                    "validation": [self.row("dev-1", "<lexeme> woman", "jalbu")],
                },
                allow_duplicate_train_pairs=False,
                allow_cross_split_source_overlap=True,
            )

    def test_cross_split_source_overlap_requires_explicit_authorization(self) -> None:
        from training.translation.train_nllb_lora import audit_dataset_integrity

        dataset = {
            "train": [self.row("train-1", "<lexeme> bank", "target-sense-a")],
            "validation": [self.row("dev-1", "<lexeme> bank", "target-sense-b")],
        }
        with self.assertRaisesRegex(ValueError, "cross dataset splits"):
            audit_dataset_integrity(
                dataset,
                allow_duplicate_train_pairs=False,
                allow_cross_split_source_overlap=False,
            )
        audit = audit_dataset_integrity(
            dataset,
            allow_duplicate_train_pairs=False,
            allow_cross_split_source_overlap=True,
        )
        self.assertEqual(audit["cross_split_source_groups"], 1)

    def test_declared_family_holdout_is_mandatory_when_configured(self) -> None:
        from training.translation.train_nllb_lora import audit_dataset_integrity

        train = self.row("train-1", "<lexeme> woman", "jalbu")
        validation = self.row("dev-1", "<lexeme> water", "bana")
        train["lexeme_family_id"] = "family-1"
        validation["lexeme_family_id"] = "family-1"
        with self.assertRaisesRegex(ValueError, "split families"):
            audit_dataset_integrity(
                {"train": [train], "validation": [validation]},
                allow_duplicate_train_pairs=False,
                allow_cross_split_source_overlap=False,
                split_group_field="lexeme_family_id",
            )

    def test_output_directory_and_tied_module_contracts_fail_closed(self) -> None:
        from training.translation.train_nllb_lora import (
            conflicting_tied_token_modules,
            selective_embedding_surface_contract,
            validate_output_directory,
        )

        self.assertEqual(
            conflicting_tied_token_modules(
                ["q_proj", "model.encoder.embed_tokens", "lm_head"]
            ),
            ["model.encoder.embed_tokens", "lm_head"],
        )
        source_contract = selective_embedding_surface_contract(
            ["lm_head"],
            "source",
            True,
        )
        self.assertEqual(source_contract["full_row_surfaces"], ["output_head"])
        self.assertNotIn(
            "output_head",
            source_contract["selective_isolation_surfaces"],
        )
        with self.assertRaisesRegex(RuntimeError, "full embedding/lm_head"):
            selective_embedding_surface_contract(["lm_head"], "tied", True)
        with self.assertRaisesRegex(RuntimeError, "shared/embed_tokens"):
            selective_embedding_surface_contract(
                ["model.encoder.embed_tokens"],
                "source",
                True,
            )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output = root / "run"
            output.mkdir()
            (output / "existing.json").write_text("{}\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Refusing nonempty output"):
                validate_output_directory(output, "")
            checkpoint = output / "checkpoint-10"
            checkpoint.mkdir()
            validate_output_directory(output, str(checkpoint))

    def test_selectively_trainable_rows_must_be_registered_special_tokens(self) -> None:
        from training.translation.train_nllb_lora import resolve_trainable_tokens

        class FakeTokenizer:
            unk_token_id = 0
            all_special_ids = [2]
            ids = {"<control>": 2, "ordinary": 3}
            tokens = {2: "<control>", 3: "ordinary"}

            def convert_tokens_to_ids(self, token: str) -> int:
                return self.ids.get(token, self.unk_token_id)

            def convert_ids_to_tokens(self, token_id: int) -> str:
                return self.tokens.get(token_id, "<unk>")

            def encode(self, token: str, *, add_special_tokens: bool) -> list[int]:
                return [self.convert_tokens_to_ids(token)]

        ids, records = resolve_trainable_tokens(FakeTokenizer(), ["<control>"])
        self.assertEqual(ids, [2])
        self.assertTrue(records[0]["is_special"])
        with self.assertRaisesRegex(RuntimeError, "registered special token"):
            resolve_trainable_tokens(FakeTokenizer(), ["ordinary"])

    def test_required_update_rows_can_be_a_strict_subset_of_inherited_rows(self) -> None:
        from training.translation.train_nllb_lora import (
            resolve_required_trainable_token_updates,
        )

        records = [
            {"token": "wbv_Latn"},
            {"token": "<translate>"},
            {"token": "<glossary>"},
        ]
        self.assertEqual(
            resolve_required_trainable_token_updates(records, None),
            ["wbv_Latn", "<translate>", "<glossary>"],
        )
        self.assertEqual(
            resolve_required_trainable_token_updates(
                records, ["wbv_Latn", "<translate>"]
            ),
            ["wbv_Latn", "<translate>"],
        )
        with self.assertRaisesRegex(ValueError, "not selected"):
            resolve_required_trainable_token_updates(records, ["<lexeme>"])
        with self.assertRaisesRegex(ValueError, "duplicates"):
            resolve_required_trainable_token_updates(
                records, ["<translate>", "<translate>"]
            )

    def test_hashed_spec_can_select_only_verified_extension_rows(self) -> None:
        from training.translation.train_nllb_lora import resolve_trainable_token_spec

        class FakeTokenizer:
            unk_token_id = 0
            all_special_ids = [2]
            tokens = {2: "<control>", 3: "ordinary", 4: "unused"}

            def __len__(self) -> int:
                return 5

            def convert_ids_to_tokens(self, token_id: int) -> str:
                return self.tokens.get(token_id, "<unk>")

            def encode(self, token: str, *, add_special_tokens: bool) -> list[int]:
                del add_special_tokens
                if token == "<control>":
                    return [2]
                if token == "ordinary":
                    return [1, 3]
                return [4]

        value = {
            "schema_version": 1,
            "rows": [
                {
                    "token": "ordinary",
                    "token_id": 3,
                    "selected_for_gradient_training": True,
                },
                {
                    "token": "unused",
                    "token_id": 4,
                    "selected_for_gradient_training": False,
                },
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "activation.json"
            path.write_text(json.dumps(value) + "\n", encoding="utf-8")
            expected = hashlib.sha256(path.read_bytes()).hexdigest()
            ids, records, identity = resolve_trainable_token_spec(
                FakeTokenizer(),
                str(path),
                expected,
                {3: "ordinary", 4: "unused"},
            )
            self.assertEqual(ids, [3])
            self.assertFalse(records[0]["is_special"])
            self.assertFalse(records[0]["single_encoded_id"])
            self.assertTrue(records[0]["declared_extension_piece"])
            self.assertEqual(identity["sha256"], expected)
            self.assertEqual(identity["declared_rows"], 2)
            self.assertEqual(len(identity["declared_token_rows"]), 2)
            self.assertFalse(
                identity["declared_token_rows"][1]["selected_for_gradient_training"]
            )

            with self.assertRaisesRegex(ValueError, "verified tokenizer extension"):
                resolve_trainable_token_spec(
                    FakeTokenizer(),
                    str(path),
                    expected,
                    {},
                )
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                resolve_trainable_token_spec(
                    FakeTokenizer(),
                    str(path),
                    "0" * 64,
                    {3: "ordinary"},
                )

    def test_train_only_trajectory_requires_fixed_steps_and_no_checkpoint_selection(
        self,
    ) -> None:
        from training.translation.train_nllb_lora import evaluation_strategy

        self.assertEqual(
            evaluation_strategy(
                validation_file=None,
                max_steps=120,
                load_best_model_at_end=False,
            ),
            "no",
        )
        self.assertEqual(
            evaluation_strategy(
                validation_file="monitor.jsonl",
                max_steps=-1,
                load_best_model_at_end=True,
            ),
            "steps",
        )
        with self.assertRaisesRegex(ValueError, "positive --max-steps"):
            evaluation_strategy(
                validation_file=None,
                max_steps=-1,
                load_best_model_at_end=False,
            )
        with self.assertRaisesRegex(ValueError, "no-load-best-model"):
            evaluation_strategy(
                validation_file=None,
                max_steps=120,
                load_best_model_at_end=True,
            )


class NllbLanguageSequenceUnitTest(unittest.TestCase):
    class FakeTokenizer:
        unk_token_id = 0
        eos_token_id = 2
        all_special_ids = [2, 100, 101]
        src_lang = "eng_Latn"
        tgt_lang = "wbv_Latn"
        ids = {"eng_Latn": 100, "wbv_Latn": 101}
        tokens = {100: "eng_Latn", 101: "wbv_Latn"}

        def convert_tokens_to_ids(self, token: str) -> int:
            return self.ids.get(token, self.unk_token_id)

        def convert_ids_to_tokens(self, token_id: int) -> str:
            return self.tokens.get(token_id, "<unk>")

        def encode(self, token: str, *, add_special_tokens: bool) -> list[int]:
            return [self.convert_tokens_to_ids(token)]

        def __call__(
            self,
            text: str | None = None,
            *,
            text_target: str | None = None,
            add_special_tokens: bool,
        ) -> dict[str, list[int]]:
            del text, add_special_tokens
            language_id = self.ids[
                self.tgt_lang if text_target is not None else self.src_lang
            ]
            return {"input_ids": [language_id, 50, self.eos_token_id]}

    def test_accepts_language_prefix_and_eos_suffix(self) -> None:
        from training.translation.nllb_language_sequences import (
            audit_nllb_language_sequences,
        )

        audit = audit_nllb_language_sequences(
            self.FakeTokenizer(),
            source_lang="eng_Latn",
            target_lang="wbv_Latn",
        )
        self.assertEqual(audit["layout"], "language_prefix_text_eos_suffix")
        self.assertEqual(audit["source_probe_ids"], [100, 50, 2])
        self.assertEqual(audit["target_probe_ids"], [101, 50, 2])

    def test_rejects_language_suffix_layout(self) -> None:
        from training.translation.nllb_language_sequences import (
            audit_nllb_language_sequences,
        )

        class SuffixTokenizer(self.FakeTokenizer):
            def __call__(
                self,
                text: str | None = None,
                *,
                text_target: str | None = None,
                add_special_tokens: bool,
            ) -> dict[str, list[int]]:
                del text, add_special_tokens
                language_id = self.ids[
                    self.tgt_lang if text_target is not None else self.src_lang
                ]
                return {"input_ids": [50, self.eos_token_id, language_id]}

        with self.assertRaisesRegex(RuntimeError, "language-prefix/EOS-suffix"):
            audit_nllb_language_sequences(
                SuffixTokenizer(),
                source_lang="eng_Latn",
                target_lang="wbv_Latn",
            )


class ExposureLedgerUnitTest(unittest.TestCase):
    def test_adapter_snapshot_step_parser_and_compact_callback(self) -> None:
        from training.translation.train_nllb_lora import (
            ADAPTER_SNAPSHOT_MANIFEST,
            AdapterSnapshotCallback,
            parse_adapter_snapshot_steps,
            verify_directory_artifact_manifest,
        )

        self.assertEqual(parse_adapter_snapshot_steps("20,40,120"), [20, 40, 120])
        with self.assertRaisesRegex(ValueError, "sorted"):
            parse_adapter_snapshot_steps("40,20")
        with self.assertRaisesRegex(ValueError, "distinct"):
            parse_adapter_snapshot_steps("20,20")

        class FakeModel:
            def save_pretrained(self, path: str, **kwargs: object) -> None:
                self.kwargs = kwargs
                (Path(path) / "adapter_model.safetensors").write_bytes(b"weights")
                (Path(path) / "adapter_config.json").write_text(
                    "{}\n", encoding="utf-8"
                )

        class FakeTokenizer:
            def save_pretrained(self, path: str) -> None:
                (Path(path) / "tokenizer_config.json").write_text(
                    "{}\n", encoding="utf-8"
                )

        with tempfile.TemporaryDirectory() as tmp:
            counts = Counter({"row-a": 4})
            callback = AdapterSnapshotCallback(
                [2], FakeTokenizer(), counts, {"schedule_sha256": "a" * 64}
            )
            callback.on_step_end(
                SimpleNamespace(output_dir=tmp, should_save=True),
                SimpleNamespace(global_step=1),
                SimpleNamespace(),
                model=FakeModel(),
            )
            self.assertEqual(callback.written_steps, [])
            callback.on_step_end(
                SimpleNamespace(output_dir=tmp, should_save=True),
                SimpleNamespace(global_step=2),
                SimpleNamespace(),
                model=FakeModel(),
            )
            snapshot = Path(tmp) / "adapter-snapshots/step-2"
            manifest = json.loads(
                (snapshot / ADAPTER_SNAPSHOT_MANIFEST).read_text(encoding="utf-8")
            )
            self.assertEqual(callback.written_steps, [2])
            self.assertFalse(manifest["resumable"])
            self.assertEqual(manifest["ledger"]["presentations"], 4)
            verify_directory_artifact_manifest(snapshot, manifest["artifacts"])

    def test_writes_sorted_row_level_counts_and_manifest(self) -> None:
        from training.translation.train_nllb_lora import (
            directory_artifact_manifest,
            write_exposure_ledger,
        )

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "exposure.jsonl"
            manifest = write_exposure_ledger(path, Counter({"row-b": 2, "row-a": 3}))
            rows = [
                json.loads(line)
                for line in path.read_text(encoding="utf-8").splitlines()
            ]

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

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "nested").mkdir()
            (root / "a.txt").write_text("a\n", encoding="utf-8")
            (root / "nested" / "b.txt").write_text("b\n", encoding="utf-8")
            artifact = directory_artifact_manifest(root)
        self.assertEqual(
            [row["path"] for row in artifact["files"]], ["a.txt", "nested/b.txt"]
        )
        self.assertEqual(artifact["file_count"], 2)
        self.assertRegex(artifact["aggregate_sha256"], r"^[0-9a-f]{64}$")

    def test_checkpoint_ledger_is_cumulative_and_identity_bound(self) -> None:
        from training.translation.train_nllb_lora import (
            ExposureLedgerCheckpointCallback,
            exposure_profile_sha256,
            exposure_row_profiles,
            load_exposure_ledger,
            verify_directory_artifact_manifest,
        )

        tokenized_rows = [
            {
                "_row_id": "row-a",
                "_task_label": "lexeme",
                "_pair_kind_label": "attested_dictionary_lexeme",
                "input_ids": [1, 2, 3],
                "labels": [4, 5],
            },
            {
                "_row_id": "row-b",
                "_task_label": "translate",
                "_pair_kind_label": "synthetic_candidate",
                "input_ids": [1, 2],
                "labels": [4, 5, 6],
            },
        ]
        profiles = exposure_row_profiles(tokenized_rows)
        self.assertEqual(profiles["row-a"]["non_padding_tokens"], 5)
        profile_hash = exposure_profile_sha256(profiles)
        self.assertRegex(profile_hash, r"^[0-9a-f]{64}$")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            checkpoint = root / "checkpoint-10"
            checkpoint.mkdir()
            (checkpoint / "trainer_state.json").write_text(
                '{"global_step": 10}\n',
                encoding="utf-8",
            )
            counts = Counter({"row-a": 3, "row-b": 1})
            callback = ExposureLedgerCheckpointCallback(
                counts,
                {"train_file_sha256": "a" * 64, "row_profile_sha256": profile_hash},
            )
            callback.on_save(
                SimpleNamespace(output_dir=str(root), should_save=True),
                SimpleNamespace(global_step=10),
                SimpleNamespace(),
            )
            loaded, manifest = load_exposure_ledger(
                checkpoint / "exposure-row-presentations.jsonl",
                known_row_ids=set(profiles),
            )
            declared = json.loads(
                (checkpoint / "exposure-checkpoint.json").read_text(encoding="utf-8")
            )

            self.assertEqual(loaded, counts)
            self.assertEqual(manifest["presentations"], 4)
            self.assertEqual(declared["global_step"], 10)
            self.assertEqual(declared["binding"]["row_profile_sha256"], profile_hash)
            self.assertEqual(declared["ledger"]["sha256"], manifest["sha256"])
            self.assertEqual(
                [row["path"] for row in declared["checkpoint_artifacts"]["files"]],
                ["trainer_state.json"],
            )
            verified = verify_directory_artifact_manifest(
                checkpoint,
                declared["checkpoint_artifacts"],
            )
            self.assertEqual(
                verified["aggregate_sha256"],
                declared["checkpoint_artifacts"]["aggregate_sha256"],
            )

            with self.assertRaisesRegex(ValueError, "outside the current capped"):
                load_exposure_ledger(
                    checkpoint / "exposure-row-presentations.jsonl",
                    known_row_ids={"row-a"},
                )

            (checkpoint / "trainer_state.json").write_text(
                '{"global_step": 11}\n',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                verify_directory_artifact_manifest(
                    checkpoint,
                    declared["checkpoint_artifacts"],
                )

    def test_repeated_accounting_parent_requires_identical_profile(self) -> None:
        from training.translation.train_nllb_lora import exposure_row_profiles

        rows = [
            {
                "_row_id": "parent-a",
                "_task_label": "lexeme",
                "_pair_kind_label": "dictionary_lexeme",
                "input_ids": [1, 2],
                "labels": [3, 4, 5],
            },
            {
                "_row_id": "parent-a",
                "_task_label": "lexeme",
                "_pair_kind_label": "dictionary_lexeme",
                "input_ids": [1, 2],
                "labels": [3, 4, 5],
            },
        ]
        profiles = exposure_row_profiles(rows)
        self.assertEqual(set(profiles), {"parent-a"})
        self.assertEqual(profiles["parent-a"]["non_padding_tokens"], 5)

        rows[1]["labels"] = [3]
        with self.assertRaisesRegex(ValueError, "inconsistent token/task profile"):
            exposure_row_profiles(rows)

    def test_accounting_identity_can_use_frozen_parent_field(self) -> None:
        from training.translation.train_nllb_lora import row_identity

        row = {"id": "presentation-17", "accounting_parent_id": "lexeme-3"}
        self.assertEqual(
            row_identity(row, "train", 0, "accounting_parent_id"),
            "lexeme-3",
        )
        with self.assertRaisesRegex(ValueError, "no accounting identity"):
            row_identity(row, "train", 0, "missing")

    def test_task_and_pair_kind_are_accounted_independently(self) -> None:
        from training.translation.train_nllb_lora import pair_kind_label, task_label

        row = {"task": "translate", "pair_kind": "synthetic_candidate"}
        self.assertEqual(task_label(row), "translate")
        self.assertEqual(pair_kind_label(row), "synthetic_candidate")

    def test_sequential_training_order_uses_sequential_sampler(self) -> None:
        from torch.utils.data import SequentialSampler

        from training.translation.train_nllb_lora import ExposureAccountingTrainer

        trainer = object.__new__(ExposureAccountingTrainer)
        trainer.training_order = "sequential"
        trainer.train_dataset = ["a", "b", "c"]

        sampler = trainer._get_train_sampler()

        self.assertIsInstance(sampler, SequentialSampler)
        self.assertEqual(list(sampler), [0, 1, 2])

    def test_resume_contract_hash_changes_for_nested_trajectory_identity(self) -> None:
        from training.translation.train_nllb_lora import (
            seal_json_contract,
            validate_resume_step_contract,
        )

        contract = {
            "dataset": {
                "file_sha256": {
                    "train": "a" * 64,
                    "validation": "b" * 64,
                    "test": "c" * 64,
                },
                "row_profile_sha256": {
                    "train": "d" * 64,
                    "validation": "e" * 64,
                    "test": "f" * 64,
                },
            },
            "base": {"contract_sha256": "1" * 64},
            "adaptation": {
                "trainable_token_scope": "tied",
                "lora_r": 16,
            },
            "optimization": {
                "max_steps": 100,
                "learning_rate": 0.0002,
            },
        }
        sealed = seal_json_contract(contract)
        for path, replacement in (
            (("dataset", "file_sha256", "validation"), "9" * 64),
            (("base", "contract_sha256"), "8" * 64),
            (("adaptation", "trainable_token_scope"), "source"),
            (("optimization", "max_steps"), 101),
        ):
            changed = copy.deepcopy(contract)
            cursor = changed
            for key in path[:-1]:
                cursor = cursor[key]
            cursor[path[-1]] = replacement
            self.assertNotEqual(
                seal_json_contract(changed)["contract_sha256"],
                sealed["contract_sha256"],
                path,
            )

        validate_resume_step_contract(40, max_steps=100, stop_after_steps=60)
        validate_resume_step_contract(100, max_steps=100, stop_after_steps=0)
        with self.assertRaisesRegex(ValueError, "later than the resume checkpoint"):
            validate_resume_step_contract(40, max_steps=100, stop_after_steps=40)
        with self.assertRaisesRegex(ValueError, "beyond the frozen optimizer horizon"):
            validate_resume_step_contract(101, max_steps=100, stop_after_steps=0)

    def test_eval_forwards_do_not_increment_training_exposure(self) -> None:
        import torch

        from training.translation.train_nllb_lora import ExposureAccountingTrainer

        class FakeModel:
            def __init__(self, training: bool) -> None:
                self.training = training

            def __call__(self, **inputs: object) -> SimpleNamespace:
                return SimpleNamespace(logits=torch.zeros((1, 1, 1)))

        trainer = object.__new__(ExposureAccountingTrainer)
        trainer.exposure_pad_token_id = 0
        trainer.exposure_totals = Counter()
        trainer.exposure_by_task = defaultdict(Counter)
        trainer.exposure_by_pair_kind = defaultdict(Counter)
        trainer.exposure_row_presentations = Counter()
        trainer.label_smoother = lambda outputs, labels: torch.tensor(0.0)

        def inputs() -> dict[str, object]:
            return {
                "input_ids": torch.tensor([[4, 5, 0]]),
                "labels": torch.tensor([[7, 8, -100]]),
                "_task_labels": ["lexeme"],
                "_pair_kind_labels": ["dictionary_lexeme"],
                "_row_ids": ["row-a"],
            }

        trainer.compute_loss(FakeModel(training=False), inputs())
        self.assertEqual(trainer.exposure_row_presentations, Counter())
        trainer.compute_loss(FakeModel(training=True), inputs())
        self.assertEqual(trainer.exposure_row_presentations, Counter({"row-a": 1}))
        self.assertEqual(trainer.exposure_totals["non_padding_tokens"], 4)
        self.assertEqual(trainer.exposure_by_task["lexeme"]["examples"], 1)
        self.assertEqual(
            trainer.exposure_by_pair_kind["dictionary_lexeme"]["examples"], 1
        )

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
        trainer.exposure_by_pair_kind = defaultdict(Counter)
        trainer.exposure_row_presentations = Counter()
        trainer.label_smoother = LabelSmoother(epsilon=0.1)
        inputs = {
            "input_ids": torch.tensor([[4, 5, 1]]),
            "attention_mask": torch.tensor([[1, 1, 0]]),
            "labels": torch.tensor([[6, 7, 2]]),
            "_task_labels": ["translate"],
            "_pair_kind_labels": ["sentence"],
            "_row_ids": ["row-1"],
        }

        loss, outputs = trainer.compute_loss(model, inputs, return_outputs=True)

        self.assertTrue(torch.isfinite(loss))
        self.assertEqual(tuple(outputs.logits.shape), (1, 3, 16))
        self.assertEqual(trainer.exposure_totals["examples"], 1)
        self.assertEqual(trainer.exposure_row_presentations["row-1"], 1)

    def test_optimizer_learning_rate_audit_records_applied_and_post_scheduler_rates(
        self,
    ) -> None:
        from training.translation.train_nllb_lora import OptimizerLearningRateAudit

        audit = OptimizerLearningRateAudit()
        optimizer = SimpleNamespace(param_groups=[{"lr": 0.0}, {"lr": 0.0}])
        control = object()

        audit.on_pre_optimizer_step(
            None, SimpleNamespace(global_step=0), control, optimizer=optimizer
        )
        optimizer.param_groups[0]["lr"] = 0.000005
        optimizer.param_groups[1]["lr"] = 0.000005
        audit.on_step_end(
            None, SimpleNamespace(global_step=1), control, optimizer=optimizer
        )
        audit.on_pre_optimizer_step(
            None, SimpleNamespace(global_step=1), control, optimizer=optimizer
        )
        optimizer.param_groups[0]["lr"] = 0.00001
        optimizer.param_groups[1]["lr"] = 0.00001
        audit.on_step_end(
            None, SimpleNamespace(global_step=2), control, optimizer=optimizer
        )

        summary = audit.summary()
        self.assertEqual(summary["applied_updates"][0]["learning_rates"], [0.0, 0.0])
        self.assertEqual(
            summary["applied_updates"][1]["learning_rates"], [0.000005, 0.000005]
        )
        self.assertEqual(summary["positive_learning_rate_optimizer_steps"], [2])
        self.assertEqual(
            summary["post_scheduler_updates"][-1]["learning_rates"], [0.00001, 0.00001]
        )

    def test_exact_linear_warmup_trajectory_has_zero_then_positive_applied_rate(
        self,
    ) -> None:
        import torch
        from transformers.optimization import get_linear_schedule_with_warmup

        parameter = torch.nn.Parameter(torch.tensor([1.0]))
        optimizer = torch.optim.AdamW([parameter], lr=0.0002)
        scheduler = get_linear_schedule_with_warmup(
            optimizer,
            num_warmup_steps=40,
            num_training_steps=800,
        )

        applied_learning_rates = []
        for _ in range(2):
            applied_learning_rates.append(float(optimizer.param_groups[0]["lr"]))
            parameter.grad = torch.ones_like(parameter)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()

        self.assertEqual(applied_learning_rates, [0.0, 0.000005])
        self.assertEqual(float(optimizer.param_groups[0]["lr"]), 0.00001)

    def test_lora_b_delta_audit_distinguishes_zero_initialization_from_update(
        self,
    ) -> None:
        import torch

        from training.translation.train_nllb_lora import (
            lora_b_parameter_delta_audit,
            snapshot_lora_b_parameters,
            validate_lora_b_training_audit,
        )

        class FakeModel:
            def __init__(self) -> None:
                self.parameter = torch.nn.Parameter(torch.zeros((2, 3)))

            def named_parameters(self):
                return iter((("base.layer.lora_B.default.weight", self.parameter),))

        model = FakeModel()
        before = snapshot_lora_b_parameters(model)
        with torch.no_grad():
            model.parameter[0, 1] = 0.25
        after = snapshot_lora_b_parameters(model)
        audit = lora_b_parameter_delta_audit(before, after)

        self.assertEqual(audit["parameter_count"], 1)
        self.assertEqual(audit["element_count"], 6)
        self.assertEqual(audit["initial_nonzero_elements"], 0)
        self.assertEqual(audit["changed_parameter_count"], 1)
        self.assertEqual(audit["changed_elements"], 1)
        self.assertAlmostEqual(audit["delta_l2"], 0.25)
        self.assertTrue(audit["all_finite"])
        validate_lora_b_training_audit(
            audit,
            initial_adapter_bound=False,
            positive_learning_rate_update_count=1,
        )

    def test_lora_b_delta_audit_supports_pretrained_initial_values(self) -> None:
        import torch

        from training.translation.train_nllb_lora import (
            lora_b_parameter_delta_audit,
            validate_lora_b_training_audit,
        )

        before = {
            "base.layer.lora_B.default.weight": torch.tensor([[0.0, 0.25], [-0.5, 0.0]])
        }
        after = {
            "base.layer.lora_B.default.weight": torch.tensor(
                [[0.0, 0.375], [-0.5, 0.0]]
            )
        }

        audit = lora_b_parameter_delta_audit(before, after)

        self.assertEqual(audit["initial_nonzero_elements"], 2)
        self.assertEqual(audit["final_nonzero_elements"], 2)
        self.assertEqual(audit["changed_elements"], 1)
        self.assertAlmostEqual(audit["delta_l2"], 0.125)
        self.assertTrue(audit["all_finite"])
        validate_lora_b_training_audit(
            audit,
            initial_adapter_bound=True,
            positive_learning_rate_update_count=1,
        )

        with self.assertRaisesRegex(RuntimeError, "not zero-initialized"):
            validate_lora_b_training_audit(
                audit,
                initial_adapter_bound=False,
                positive_learning_rate_update_count=1,
            )


@unittest.skipUnless(
    os.environ.get("NLLB_TEST_TOKENIZER"),
    "set NLLB_TEST_TOKENIZER to an audited NLLB tokenizer directory",
)
class SelectiveTokenTrainingIntegrationTest(unittest.TestCase):
    def test_tied_rows_train_save_merge_and_reload(self) -> None:
        import torch
        from peft import LoraConfig, PeftModel, TaskType, get_peft_model
        from transformers import (
            AutoTokenizer,
            M2M100Config,
            M2M100ForConditionalGeneration,
        )

        from training.translation.train_nllb_lora import (
            add_special_tokens_with_decomposition_mean,
            audit_control_strings,
            audit_serialized_tokenizer,
            build_trainable_token_targets,
            canonicalize_merged_embeddings,
            embedding_row_delta_audit,
            resolve_trainable_tokens,
            snapshot_nllb_embedding_surface_rows,
            tokenizer_serialization_expectations,
        )

        torch.manual_seed(7)
        target_lang = os.environ.get("NLLB_TEST_TARGET_LANG", "gvn_Latn")
        tokenizer = AutoTokenizer.from_pretrained(
            os.environ["NLLB_TEST_TOKENIZER"],
            use_fast=os.environ.get("NLLB_TEST_USE_FAST", "true").casefold()
            not in {"0", "false", "no"},
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

        task_controls = ["<lexeme>", "<translate>", "<glossary>"]
        control_audit = audit_control_strings(tokenizer, task_controls)
        self.assertEqual(
            [record["control"] for record in control_audit],
            task_controls,
        )
        self.assertTrue(all(record["token_ids"] for record in control_audit))
        self.assertTrue(
            all(record["registered_as_special"] for record in control_audit)
        )

        controls = add_special_tokens_with_decomposition_mean(
            tokenizer,
            model,
            task_controls,
        )
        self.assertEqual({row["token"] for row in controls}, set(task_controls))
        self.assertTrue(all(row["single_encoded_id"] for row in controls))

        selected_ids, selected = resolve_trainable_tokens(
            tokenizer,
            [target_lang, *task_controls],
        )
        _, audit_rows = resolve_trainable_tokens(
            tokenizer,
            [target_lang, *task_controls, "eng_Latn", tokenizer.pad_token],
        )
        tokenizer_expectations = tokenizer_serialization_expectations(
            tokenizer,
            audit_rows,
            control_audit,
            source_lang="eng_Latn",
            target_lang=target_lang,
        )
        before = snapshot_nllb_embedding_surface_rows(model, audit_rows)
        pristine_state = {
            key: value.detach().clone() for key, value in model.state_dict().items()
        }
        trainable_targets = build_trainable_token_targets(model, selected_ids, "tied")
        self.assertEqual(trainable_targets, selected_ids)

        peft_model = get_peft_model(
            model,
            LoraConfig(
                task_type=TaskType.SEQ_2_SEQ_LM,
                r=2,
                lora_alpha=4,
                lora_dropout=0.0,
                target_modules=["q_proj", "v_proj"],
                trainable_token_indices=trainable_targets,
                ensure_weight_tying=True,
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
            self.assertTrue(
                any(name.endswith(suffix) for name in wrapper_names), suffix
            )

        batch = tokenizer(
            [
                "<lexeme> woman",
                "<translate> I see water.",
                "<translate> The water is here. <glossary> water = bana",
            ],
            text_target=["jalbu", "Ngayu bana nyajil.", "Bana ngayku."],
            padding=True,
            return_tensors="pt",
        )
        peft_model.train()
        optimizer = torch.optim.SGD(
            [
                parameter
                for parameter in peft_model.parameters()
                if parameter.requires_grad
            ],
            lr=0.05,
        )
        loss = peft_model(**batch).loss
        self.assertTrue(torch.isfinite(loss))
        loss.backward()
        optimizer.step()
        peft_model.eval()

        after = snapshot_nllb_embedding_surface_rows(peft_model, audit_rows)
        audit = embedding_row_delta_audit(
            before,
            after,
            {row["token"] for row in selected},
        )
        by_token = {row["token"]: row for row in audit}
        tied_surfaces = (
            "encoder_input",
            "decoder_input",
            "shared_input",
            "output_head",
        )
        for token in (target_lang, *task_controls):
            for surface in tied_surfaces:
                self.assertTrue(by_token[token][f"{surface}_changed"], (token, surface))
        for token in ("eng_Latn", tokenizer.pad_token):
            for surface in tied_surfaces:
                self.assertFalse(
                    by_token[token][f"{surface}_changed"], (token, surface)
                )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            adapter_dir = root / "adapter"
            peft_model.save_pretrained(adapter_dir)
            tokenizer.save_pretrained(adapter_dir)
            adapter_tokenizer_audit = audit_serialized_tokenizer(
                adapter_dir,
                source_lang="eng_Latn",
                target_lang=target_lang,
                use_fast=os.environ.get("NLLB_TEST_USE_FAST", "true").casefold()
                not in {"0", "false", "no"},
                expected=tokenizer_expectations,
            )
            self.assertEqual(adapter_tokenizer_audit["status"], "PASS")

            restored_base = M2M100ForConditionalGeneration(config)
            restored_base.load_state_dict(pristine_state)
            restored = PeftModel.from_pretrained(restored_base, adapter_dir)
            restored.eval()
            restored_rows = snapshot_nllb_embedding_surface_rows(restored, audit_rows)
            for token in after:
                for kind in after[token]:
                    self.assertTrue(
                        torch.equal(after[token][kind], restored_rows[token][kind]),
                        (token, kind),
                    )

            merged = restored.merge_and_unload()
            self.assertEqual(
                merged.get_input_embeddings().weight.data_ptr(),
                merged.get_output_embeddings().weight.data_ptr(),
            )
            merged_dir = root / "merged"
            merged.save_pretrained(merged_dir, safe_serialization=True)
            tokenizer.save_pretrained(merged_dir)
            reloaded = M2M100ForConditionalGeneration.from_pretrained(merged_dir)
            reloaded_rows = snapshot_nllb_embedding_surface_rows(reloaded, audit_rows)
            for token in after:
                for kind in after[token]:
                    self.assertTrue(
                        torch.equal(after[token][kind], reloaded_rows[token][kind]),
                        (token, kind),
                    )

    def test_untied_output_source_rows_train_save_merge_and_reload(self) -> None:
        import torch
        from peft import LoraConfig, PeftModel, TaskType, get_peft_model
        from transformers import (
            AutoTokenizer,
            M2M100Config,
            M2M100ForConditionalGeneration,
        )

        from training.translation.train_nllb_lora import (
            add_special_tokens_with_decomposition_mean,
            build_trainable_token_targets,
            canonicalize_merged_embeddings,
            embedding_row_delta_audit,
            resolve_source_embedding_module_name,
            resolve_trainable_tokens,
            SelectiveTokenGradientAudit,
            snapshot_nllb_embedding_surface_rows,
            standalone_serialization_state_dict,
        )
        from training.translation.nllb_peft_artifact import (
            canonicalize_nllb_input_embeddings,
        )

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
        trainable_targets = build_trainable_token_targets(model, selected_ids, "source")
        self.assertEqual(trainable_targets, {source_module_name: selected_ids})
        before = snapshot_nllb_embedding_surface_rows(model, audit_rows)
        pristine_state = {
            key: value.detach().clone() for key, value in model.state_dict().items()
        }

        peft_model = get_peft_model(
            model,
            LoraConfig(
                task_type=TaskType.SEQ_2_SEQ_LM,
                r=2,
                lora_alpha=4,
                lora_dropout=0.0,
                target_modules=["q_proj", "v_proj"],
                modules_to_save=["lm_head"],
                trainable_token_indices=trainable_targets,
                ensure_weight_tying=False,
            ),
        )
        wrapper_names = [
            name
            for name, module in peft_model.named_modules(remove_duplicate=False)
            if module.__class__.__name__ == "TrainableTokensWrapper"
        ]
        self.assertTrue(
            any(name.endswith(source_module_name) for name in wrapper_names)
        )
        self.assertFalse(any(name.endswith("model.shared") for name in wrapper_names))
        self.assertFalse(
            any(name.endswith("model.decoder.embed_tokens") for name in wrapper_names)
        )
        gradient_audit = SelectiveTokenGradientAudit(peft_model, selected)

        batch = tokenizer(
            ["<translate> I see water.", "<lexeme> woman <pos> noun"],
            text_target=["Gesalul.", "epit"],
            padding=True,
            return_tensors="pt",
        )
        peft_model.train()
        optimizer = torch.optim.SGD(
            [
                parameter
                for parameter in peft_model.parameters()
                if parameter.requires_grad
            ],
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
                self.assertFalse(
                    by_token[token][f"{surface}_changed"], (token, surface)
                )

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
                        torch.equal(
                            after[token][surface], restored_rows[token][surface]
                        ),
                        (token, surface),
                    )

            merged = restored.merge_and_unload()
            canonicalize_merged_embeddings(merged)
            merged_rows = snapshot_nllb_embedding_surface_rows(merged, audit_rows)
            for token in after:
                for surface in ("encoder_input", "shared_input", "decoder_input"):
                    self.assertTrue(
                        torch.equal(
                            after[token]["encoder_input"], merged_rows[token][surface]
                        ),
                        (token, surface),
                    )
            with torch.no_grad():
                merged_tokens = merged.generate(
                    **tokenizer("<lexeme> woman <pos> noun", return_tensors="pt"),
                    max_new_tokens=8,
                )
            self.assertTrue(torch.equal(before_merge_tokens, merged_tokens))

            merged_dir = root / "merged"
            serialization_state, materialized_keys = (
                standalone_serialization_state_dict(merged)
            )
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
                        torch.equal(
                            merged_rows[token][surface], reloaded_rows[token][surface]
                        ),
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

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).with_name("run_frozen_nllb_lexical_census.py")
SPEC = importlib.util.spec_from_file_location("run_frozen_nllb_lexical_census", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FrozenCensusContractTest(unittest.TestCase):
    def build_contract_fixture(self, root: Path) -> dict:
        rights = root / "rights.json"
        rights.write_text("{}\n", encoding="utf-8")
        model = root / "model"
        model.mkdir()
        (model / "model.safetensors").write_bytes(b"weights")
        (model / "tokenizer_config.json").write_text("{}\n", encoding="utf-8")
        (model / "tokenizer.json").write_text("{}\n", encoding="utf-8")
        evaluator = root / "evaluator.py"
        evaluator.write_text("# evaluator\n", encoding="utf-8")
        runner = root / "runner.py"
        shutil.copyfile(MODULE_PATH, runner)
        suite = root / "suite.jsonl"
        suite.write_text(json.dumps({"id": "row-1"}) + "\n", encoding="utf-8")
        model_manifest = model / "CONTROL-MODEL-MANIFEST.json"
        model_manifest.write_text(
            json.dumps(
                {
                    "artifact_id": "control",
                    "artifact_files": {
                        "model.safetensors": {
                            "sha256": MODULE.sha256(model / "model.safetensors")
                        }
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        decoder_policy = root / "decoder-policy.json"
        decoder_policy.write_text(
            json.dumps(
                {
                    "policy_id": "greedy",
                    "source_language_token": "eng_Latn",
                    "target_language_token": "wbv_Latn",
                    "forced_bos_token_id": 256204,
                    "tokenizer_implementation": "slow",
                    "generation": {
                        "do_sample": False,
                        "num_beams": 1,
                        "max_source_length": 192,
                        "max_new_tokens": 32,
                        "length_penalty": 1.0,
                        "repetition_penalty": 1.0,
                        "no_repeat_ngram_size": 0,
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        return {
            "execution_policy": {
                "rights_decision_artifact": rights.name,
                "rights_decision_sha256": MODULE.sha256(rights),
            },
            "model": {
                "artifact_id": "control",
                "path": model.name,
                "manifest_path": str(model_manifest.relative_to(root)),
                "manifest_sha256": MODULE.sha256(model_manifest),
                "weights_sha256": MODULE.sha256(model / "model.safetensors"),
                "tokenizer_bundle_sha256": MODULE.tokenizer_bundle_identity(model)["sha256"],
                "source_token_id": 256047,
                "target_token_id": 256204,
            },
            "evaluator": {
                "path": evaluator.name,
                "sha256": MODULE.sha256(evaluator),
            },
            "runner": {
                "path": runner.name,
                "sha256": MODULE.sha256(runner),
            },
            "task": {
                "source_token": "eng_Latn",
                "target_token": "wbv_Latn",
            },
            "decoder": {
                "policy_id": "greedy",
                "policy_path": decoder_policy.name,
                "policy_sha256": MODULE.sha256(decoder_policy),
                "use_fast_tokenizer": False,
                "do_sample": False,
                "num_beams": 1,
                "max_source_length": 192,
                "max_new_tokens": 32,
                "length_penalty": 1.0,
                "repetition_penalty": 1.0,
                "no_repeat_ngram_size": 0,
            },
            "suites": [
                {
                    "suite_key": "suite",
                    "path": suite.name,
                    "sha256": MODULE.sha256(suite),
                    "rows": 1,
                    "input_field": "inputText",
                }
            ],
        }

    def test_hosted_execution_fails_closed(self) -> None:
        contract = {
            "execution_policy": {
                "local_evaluation_authorized": True,
                "hosted_transfer_authorized": False,
                "rights_decision_artifact": "analysis/rights-review.json",
            }
        }
        MODULE.authorize_execution(contract, "local")
        with self.assertRaisesRegex(MODULE.ContractError, "hosted_transfer_authorized"):
            MODULE.authorize_execution(contract, "hosted")

    def test_tokenizer_bundle_hash_binds_names_and_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "tokenizer_config.json").write_text("{}\n", encoding="utf-8")
            (root / "tokenizer.json").write_text("payload\n", encoding="utf-8")
            observed = MODULE.tokenizer_bundle_identity(root)
            expected = hashlib.sha256()
            for name in ("tokenizer.json", "tokenizer_config.json"):
                file_hash = hashlib.sha256((root / name).read_bytes()).hexdigest()
                expected.update(name.encode("utf-8"))
                expected.update(b"\0")
                expected.update(bytes.fromhex(file_hash))
            self.assertEqual(observed["sha256"], expected.hexdigest())

    def test_verify_suite_completion_rejects_missing_seal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(RuntimeError, "incomplete"):
                MODULE.verify_suite_completion(Path(temporary), 1)

    def test_tree_checksums_are_sorted_and_exclude_completion_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "b.txt").write_text("b", encoding="utf-8")
            (root / "a.txt").write_text("a", encoding="utf-8")
            (root / "RUN_COMPLETE").write_text("no", encoding="utf-8")
            rows = MODULE.tree_checksums(root, {"RUN_COMPLETE"})
            self.assertEqual([relative for _, relative in rows], ["a.txt", "b.txt"])

    def test_completed_run_resume_verifies_without_mutating_seal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            summary = {"schema_version": 1, "completed_at": "frozen"}
            (root / "SUMMARY.json").write_text(
                json.dumps(summary) + "\n", encoding="utf-8"
            )
            (root / "artifact.txt").write_text("payload\n", encoding="utf-8")
            checksums = MODULE.tree_checksums(
                root, {"OUTPUT-SHA256SUMS", "RUN_COMPLETE"}
            )
            checksum_path = root / "OUTPUT-SHA256SUMS"
            checksum_path.write_text(
                "".join(f"{digest}  {relative}\n" for digest, relative in checksums),
                encoding="utf-8",
            )
            marker_path = root / "RUN_COMPLETE"
            marker_path.write_text(
                json.dumps(
                    {"output_checksums_sha256": MODULE.sha256(checksum_path)}
                )
                + "\n",
                encoding="utf-8",
            )
            before = {
                path.name: path.read_bytes()
                for path in root.iterdir()
                if path.is_file()
            }

            self.assertEqual(MODULE.verify_completed_run(root), summary)
            self.assertEqual(
                before,
                {
                    path.name: path.read_bytes()
                    for path in root.iterdir()
                    if path.is_file()
                },
            )

    def test_completed_run_resume_rejects_checksum_manifest_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "SUMMARY.json").write_text("{}\n", encoding="utf-8")
            checksum_path = root / "OUTPUT-SHA256SUMS"
            checksum_path.write_text(
                f"{MODULE.sha256(root / 'SUMMARY.json')}  SUMMARY.json\n",
                encoding="utf-8",
            )
            (root / "RUN_COMPLETE").write_text(
                json.dumps({"output_checksums_sha256": "0" * 64}) + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(RuntimeError, "manifest hash mismatch"):
                MODULE.verify_completed_run(root)

    def test_contract_verifies_declared_and_invoked_runner_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = self.build_contract_fixture(root)

            preflight = MODULE.verify_contract_inputs(contract, root)

            self.assertEqual(preflight["runner"]["sha256"], MODULE.sha256(MODULE_PATH))
            self.assertEqual(preflight["runner"]["invoked_path"], str(MODULE_PATH.resolve()))

    def test_contract_rejects_changed_declared_runner(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = self.build_contract_fixture(root)
            (root / "runner.py").write_text("# changed\n", encoding="utf-8")

            with self.assertRaisesRegex(MODULE.ContractError, "runner hash mismatch"):
                MODULE.verify_contract_inputs(contract, root)

    def test_contract_rejects_different_invoked_runner(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = self.build_contract_fixture(root)
            other = root / "other-runner.py"
            other.write_text("# not the contracted runner\n", encoding="utf-8")

            with mock.patch.object(MODULE, "__file__", str(other)):
                with self.assertRaisesRegex(MODULE.ContractError, "invoked runner hash mismatch"):
                    MODULE.verify_contract_inputs(contract, root)

    def test_contract_rejects_changed_model_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = self.build_contract_fixture(root)
            manifest = root / contract["model"]["manifest_path"]
            manifest.write_text('{"artifact_id":"changed"}\n', encoding="utf-8")

            with self.assertRaisesRegex(MODULE.ContractError, "model manifest hash mismatch"):
                MODULE.verify_contract_inputs(contract, root)

    def test_contract_rejects_decoder_policy_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = self.build_contract_fixture(root)
            contract["decoder"]["num_beams"] = 5

            with self.assertRaisesRegex(MODULE.ContractError, "num_beams"):
                MODULE.verify_contract_inputs(contract, root)

    def test_suite_completion_requires_an_exact_checksum_inventory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            files = {
                "input-manifest.json": "{}\n",
                "environment-manifest.json": "{}\n",
                "predictions.jsonl": "{}\n",
                "metric-report.json": "{}\n",
                "failure-slice-report.json": "{}\n",
                "resource-samples.json": "{}\n",
                "resource-samples.jsonl": "{}\n",
            }
            for name, content in files.items():
                (root / name).write_text(content, encoding="utf-8")
            (root / "OUTPUT-SHA256SUMS").write_text(
                "".join(
                    f"{MODULE.sha256(root / name)}  {name}\n"
                    for name in files
                    if name != "resource-samples.jsonl"
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(RuntimeError, "checksum inventory is not exact"):
                MODULE.verify_suite_completion(root, 1)


if __name__ == "__main__":
    unittest.main()

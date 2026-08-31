import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from training.translation.build_wajarri_v3_task_separated_runpod_kit import (
    build_status,
    copy_bound,
    copy_initial_adapter,
    count_jsonl,
    deep_merge,
    sha256_file,
)


class TaskSeparatedKitTest(unittest.TestCase):
    def test_authorization_status(self) -> None:
        self.assertIn("EXECUTION_ALLOWED", build_status(True))
        self.assertIn("NOT_AUTHORIZED", build_status(False))

    def test_deep_merge_replaces_scalars_and_retains_nested_contract(self) -> None:
        self.assertEqual(
            deep_merge(
                {"run_id": "a4", "training": {"steps": 100, "seed": 17}},
                {"run_id": "a5", "training": {"seed": 42}},
            ),
            {"run_id": "a5", "training": {"steps": 100, "seed": 42}},
        )

    def test_copy_is_hash_bound(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            destination = root / "nested/destination"
            source.write_text("evidence\n", encoding="utf-8")
            copy_bound(source, destination, sha256_file(source))
            self.assertEqual(sha256_file(source), sha256_file(destination))
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                copy_bound(source, root / "bad", "0" * 64)

    def test_jsonl_counter_ignores_blanks(self) -> None:
        with TemporaryDirectory() as temporary:
            path = Path(temporary) / "rows.jsonl"
            path.write_text("{}\n\n{}\n", encoding="utf-8")
            self.assertEqual(count_jsonl(path), 2)

    def test_initial_adapter_override_is_copied_and_rebound(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "adapter"
            output = root / "output"
            source.mkdir()
            output.mkdir()
            (source / "adapter_config.json").write_text("{}\n", encoding="utf-8")
            (source / "adapter_model.safetensors").write_bytes(b"weights")
            files = {
                name: sha256_file(source / name)
                for name in ("adapter_config.json", "adapter_model.safetensors")
            }
            build = {
                "initial_adapter_override": {
                    "path": "adapter",
                    "adapter_weight_sha256": files["adapter_model.safetensors"],
                    "files": files,
                    "identity": {"model_id": "union-v1"},
                    "topology": {"lora_r": 16},
                }
            }

            identity = copy_initial_adapter(
                build, {}, root / "unused", root, output
            )

            self.assertEqual(identity["model_id"], "union-v1")
            self.assertEqual(
                identity["files"]["payload/initial-adapter/adapter_model.safetensors"],
                files["adapter_model.safetensors"],
            )
            self.assertTrue(
                (output / "payload/initial-adapter/adapter_model.safetensors").is_file()
            )


if __name__ == "__main__":
    unittest.main()

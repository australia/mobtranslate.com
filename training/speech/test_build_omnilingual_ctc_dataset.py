from __future__ import annotations

import json
import tempfile
import unittest
import wave
from pathlib import Path

from asr_benchmark import BenchmarkError
from build_omnilingual_ctc_dataset import build_dataset, validate_training_inventory


def make_wav(path: Path, *, frames: int = 8_000) -> None:
    with wave.open(str(path), "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(16_000)
        recording.writeframes(b"\x00\x00" * frames)


def inventory_row(root: Path, speaker: str, index: int) -> dict[str, object]:
    audio_path = f"audio/{speaker}-{index}.wav"
    source = root / audio_path
    source.parent.mkdir(parents=True, exist_ok=True)
    make_wav(source)
    return {
        "schema_version": 1,
        "language_code": "gvn",
        "id": f"clip-{speaker}-{index}",
        "audio_path": audio_path,
        "prompt_id": f"prompt-{speaker}-{index}",
        "reference": f"bama {speaker} {index}",
        "speaker_id": speaker,
        "session_id": f"session-{speaker}",
        "transcript_status": "adjudicated",
        "transcriber_ids": ["reviewer-a", "reviewer-b"],
        "rights": {
            "consent_record_id": f"consent-{speaker}",
            "evaluation_allowed": True,
            "training_allowed": True,
            "provider_transfer_allowed": True,
            "public_audio_allowed": False,
            "public_transcript_allowed": False,
            "derived_weights_allowed": True,
            "weight_distribution_allowed": False,
            "commercial_use_allowed": False,
        },
    }


class OmnilingualCtcDatasetTests(unittest.TestCase):
    def test_requires_speaker_prompt_session_and_transcript_disjoint_splits(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = [
                inventory_row(root, f"{split}-speaker-{index}", index)
                for split in ("train", "development", "test")
                for index in range(5)
            ]
            split_map = {
                str(row["speaker_id"]): str(row["speaker_id"]).split("-speaker-")[0]
                for row in rows
            }
            prepared = validate_training_inventory(
                rows,
                split_map,
                storage_root=root,
                execution="hosted",
                minimum_train_speakers=5,
                minimum_development_speakers=5,
                minimum_test_speakers=5,
            )
            self.assertEqual(len(prepared), 15)

            rows[-1]["reference"] = rows[0]["reference"]
            with self.assertRaisesRegex(BenchmarkError, "normalized transcript leakage"):
                validate_training_inventory(
                    rows,
                    split_map,
                    storage_root=root,
                    execution="hosted",
                    minimum_train_speakers=5,
                    minimum_development_speakers=5,
                    minimum_test_speakers=5,
                )

    def test_hosted_build_requires_provider_transfer_permission(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            row = inventory_row(root, "speaker-a", 1)
            row["rights"]["provider_transfer_allowed"] = False
            with self.assertRaisesRegex(BenchmarkError, "provider_transfer_allowed=true"):
                validate_training_inventory(
                    [row],
                    {"speaker-a": "train"},
                    storage_root=root,
                    execution="hosted",
                    minimum_train_speakers=1,
                    minimum_development_speakers=0,
                    minimum_test_speakers=0,
                )

    def test_builds_the_official_partitioned_parquet_shape(self) -> None:
        try:
            import pyarrow.dataset as pa_dataset
        except ImportError:
            self.skipTest("pyarrow is not installed")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = []
            split_map = {}
            for split in ("train", "development", "test"):
                speaker = f"{split}-speaker"
                rows.append(inventory_row(root, speaker, 1))
                split_map[speaker] = split
            prepared = validate_training_inventory(
                rows,
                split_map,
                storage_root=root,
                execution="hosted",
                minimum_train_speakers=1,
                minimum_development_speakers=1,
                minimum_test_speakers=1,
            )
            inventory_path = root / "inventory.jsonl"
            inventory_path.write_text(
                "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
            )
            split_path = root / "splits.json"
            split_path.write_text(json.dumps({"schema_version": 1, "speakers": split_map}))
            output = root / "dataset"
            manifest = build_dataset(
                prepared,
                inventory_path=inventory_path,
                split_map_path=split_path,
                output=output,
            )

            table = pa_dataset.dataset(
                output / "version=0", partitioning="hive"
            ).to_table()
            self.assertEqual(table.num_rows, 3)
            self.assertEqual(
                set(table.column_names),
                {"text", "audio_bytes", "audio_size", "corpus", "split", "language"},
            )
            self.assertEqual(manifest["rows_by_split"], {"dev": 1, "test": 1, "train": 1})
            self.assertTrue((output / "language_distribution_0.tsv").is_file())


if __name__ == "__main__":
    unittest.main()

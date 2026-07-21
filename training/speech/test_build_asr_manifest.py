from __future__ import annotations

import unittest

from asr_benchmark import BenchmarkError
from build_asr_manifest import build_manifest


def inventory_row(speaker: str, index: int) -> dict[str, object]:
    return {
        "schema_version": 1,
        "language_code": "gvn",
        "id": f"{speaker}-{index:02d}",
        "audio_path": f"audio/{speaker}-{index:02d}.wav",
        "prompt_id": f"prompt-{speaker}-{index:02d}",
        "corpus_sentence_id": index,
        "reference": f"bama ngayu nyulu {speaker} sentence {index}",
        "speaker_id": speaker,
        "session_id": f"session-{speaker}",
        "variety": "Kuku Yalanji",
        "condition": "quiet_room",
        "prompt_type": "read",
        "orthography_version": "project-nfc-v1",
        "transcript_status": "adjudicated",
        "transcriber_ids": ["reviewer-a", "reviewer-b"],
        "rights": {
            "consent_record_id": f"consent-{speaker}",
            "withdrawal_process": "contact the governed corpus custodian",
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


class BuildAsrManifestTests(unittest.TestCase):
    def test_builds_deterministic_context_and_target_rows(self) -> None:
        inventory = [
            inventory_row(speaker, index)
            for speaker in ("speaker-a", "speaker-b", "speaker-c")
            for index in range(1, 13)
        ]
        split_map = {
            "speaker-a": "train",
            "speaker-b": "development",
            "speaker-c": "test",
        }
        first, summary = build_manifest(
            inventory,
            split_map,
            purpose="training",
            execution="hosted",
            promotion=True,
        )
        second, _ = build_manifest(
            inventory,
            split_map,
            purpose="training",
            execution="hosted",
            promotion=True,
        )

        self.assertEqual(first, second)
        self.assertEqual(sum(row["role"] == "context" for row in first), 30)
        self.assertEqual(sum(row["role"] == "target" for row in first), 6)
        for row in first:
            if row["role"] == "target":
                self.assertEqual(len(row["context_ids"]), 10)
                self.assertTrue(
                    all(context.startswith(str(row["speaker_id"])) for context in row["context_ids"])
                )
        self.assertRegex(summary["manifest_sha256"], r"^[0-9a-f]{64}$")

    def test_rejects_an_unmapped_speaker(self) -> None:
        inventory = [inventory_row("speaker-a", index) for index in range(1, 12)]
        with self.assertRaisesRegex(BenchmarkError, "unmapped inventory speakers"):
            build_manifest(inventory, {})

    def test_release_requires_weight_distribution_permission(self) -> None:
        inventory = [inventory_row("speaker-a", index) for index in range(1, 12)]
        with self.assertRaisesRegex(BenchmarkError, "weight_distribution_allowed=true"):
            build_manifest(
                inventory,
                {"speaker-a": "test"},
                purpose="release_weights",
            )


if __name__ == "__main__":
    unittest.main()

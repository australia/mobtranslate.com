from __future__ import annotations

import unittest

from asr_benchmark import BenchmarkError, normalize_transcript, score_predictions, validate_manifest


def rights(**overrides: bool) -> dict[str, object]:
    value: dict[str, object] = {
        "consent_record_id": "consent-2026-001",
        "withdrawal_process": "contact the governed corpus custodian",
        "evaluation_allowed": True,
        "training_allowed": False,
        "provider_transfer_allowed": True,
        "public_audio_allowed": False,
        "public_transcript_allowed": False,
        "derived_weights_allowed": False,
        "weight_distribution_allowed": False,
        "commercial_use_allowed": False,
    }
    value.update(overrides)
    return value


def row(
    row_id: str,
    *,
    speaker: str,
    split: str,
    role: str,
    reference: str,
    context_ids: list[str] | None = None,
    rights_value: dict[str, object] | None = None,
) -> dict[str, object]:
    value: dict[str, object] = {
        "schema_version": 1,
        "language_code": "gvn",
        "id": row_id,
        "role": role,
        "audio_path": f"audio/{row_id}.wav",
        "prompt_id": f"prompt-{row_id}",
        "reference": reference,
        "speaker_id": speaker,
        "session_id": f"session-{speaker}-{split}",
        "variety": "Kuku Yalanji",
        "condition": "quiet-room",
        "split": split,
        "prompt_type": "read" if role == "context" else "spontaneous",
        "orthography_version": "project-nfc-v1",
        "transcript_status": "adjudicated",
        "transcriber_ids": ["reviewer-a", "reviewer-b"],
        "rights": rights_value or rights(),
    }
    if context_ids is not None:
        value["context_ids"] = context_ids
    return value


def speaker_rows(speaker: str, split: str, target_reference: str) -> list[dict[str, object]]:
    context_ids = [f"{speaker}-context-{index:02d}" for index in range(1, 11)]
    contexts = [
        row(
            context_id,
            speaker=speaker,
            split=split,
            role="context",
            reference=f"voice example {index}",
        )
        for index, context_id in enumerate(context_ids, start=1)
    ]
    return contexts + [
        row(
            f"{speaker}-target",
            speaker=speaker,
            split=split,
            role="target",
            reference=target_reference,
            context_ids=context_ids,
        )
    ]


class AsrBenchmarkTests(unittest.TestCase):
    def test_accepts_governed_same_speaker_context_protocol(self) -> None:
        rows = speaker_rows("speaker-a", "test", "Ngayu binal bama.")
        summary = validate_manifest(
            rows,
            purpose="evaluation",
            execution="hosted",
            promotion=True,
        )
        self.assertEqual(summary["targets"], 1)
        self.assertEqual(summary["contexts"], 10)
        self.assertEqual(summary["speakers_by_split"], {"test": 1})
        self.assertTrue(summary["warnings"])

    def test_rejects_hosted_transfer_without_explicit_permission(self) -> None:
        rows = speaker_rows("speaker-a", "test", "ngayu binal bama")
        rows[0]["rights"] = rights(provider_transfer_allowed=False)
        with self.assertRaisesRegex(BenchmarkError, "provider_transfer_allowed=true"):
            validate_manifest(rows, execution="hosted")

    def test_rejects_speaker_leakage(self) -> None:
        rows = speaker_rows("speaker-a", "development", "ngayu binal bama")
        rows.extend(speaker_rows("speaker-a", "test", "bama bana baya"))
        with self.assertRaisesRegex(BenchmarkError, "speaker leakage"):
            validate_manifest(rows)

    def test_rejects_context_from_another_speaker(self) -> None:
        rows = speaker_rows("speaker-a", "test", "ngayu binal bama")
        rows[-1]["context_ids"] = [
            *rows[-1]["context_ids"][:-1],
            "speaker-b-context-10",
        ]
        rows.append(
            row(
                "speaker-b-context-10",
                speaker="speaker-b",
                split="test",
                role="context",
                reference="bama bana baya",
            )
        )
        with self.assertRaisesRegex(BenchmarkError, "different speaker"):
            validate_manifest(rows)

    def test_scores_exact_wer_and_grapheme_cer(self) -> None:
        rows = speaker_rows("speaker-a", "test", "Ngayu binal bama.")
        rows.extend(speaker_rows("speaker-b", "test", "Bama bana baya"))
        validate_manifest(rows)
        predictions = [
            {
                "id": "speaker-a-target",
                "prediction": "ngayu binal bama",
                "model_id": "omniASR_LLM_7B_ZS",
                "model_hash": "sha256:test",
                "decoder_policy": "beam=5,length_norm=false",
            },
            {
                "id": "speaker-b-target",
                "prediction": "bama bana",
                "model_id": "omniASR_LLM_7B_ZS",
                "model_hash": "sha256:test",
                "decoder_policy": "beam=5,length_norm=false",
            },
        ]
        result = score_predictions(rows, predictions, bootstrap_replicates=100)
        self.assertEqual(result["overall"]["exact_count"], 1)
        self.assertEqual(result["overall"]["exact_rate"], 0.5)
        self.assertEqual(result["overall"]["wer"]["deletions"], 1)
        self.assertAlmostEqual(result["overall"]["wer"]["rate"], 1 / 6)
        self.assertEqual(result["speaker_cluster_bootstrap"]["speaker_clusters"], 2)

    def test_normalization_preserves_internal_morpheme_boundaries(self) -> None:
        self.assertEqual(
            normalize_transcript("  Nyulu, KARRKAY-ngka; ngayu’s.  "),
            "nyulu karrkay-ngka ngayu's",
        )


if __name__ == "__main__":
    unittest.main()

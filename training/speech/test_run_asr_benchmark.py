from __future__ import annotations

import json
import tempfile
import unittest
import wave
from pathlib import Path

import httpx

from asr_benchmark import BenchmarkError
from run_asr_benchmark import run


def write_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(16_000)
        recording.writeframes(b"\x00\x00" * 8_000)


def benchmark_rows(*, provider_transfer_allowed: bool = True) -> list[dict[str, object]]:
    common: dict[str, object] = {
        "schema_version": 1,
        "language_code": "gvn",
        "speaker_id": "speaker-a",
        "session_id": "session-a",
        "variety": "Kuku Yalanji",
        "condition": "quiet-room",
        "split": "test",
        "orthography_version": "project-nfc-v1",
        "transcript_status": "adjudicated",
        "transcriber_ids": ["reviewer-a", "reviewer-b"],
        "rights": {
            "consent_record_id": "consent-a",
            "withdrawal_process": "contact the corpus custodian",
            "evaluation_allowed": True,
            "training_allowed": False,
            "provider_transfer_allowed": provider_transfer_allowed,
            "public_audio_allowed": False,
            "public_transcript_allowed": False,
            "derived_weights_allowed": False,
            "weight_distribution_allowed": False,
            "commercial_use_allowed": False,
        },
    }
    rows: list[dict[str, object]] = []
    context_ids: list[str] = []
    for index in range(1, 11):
        row_id = f"context-{index:02d}"
        context_ids.append(row_id)
        rows.append(
            {
                **common,
                "id": row_id,
                "role": "context",
                "audio_path": f"audio/{row_id}.wav",
                "reference": f"voice example {index}",
                "prompt_type": "read",
            }
        )
    rows.append(
        {
            **common,
            "id": "target-01",
            "role": "target",
            "audio_path": "audio/target-01.wav",
            "reference": "ngayu binal bama",
            "prompt_type": "spontaneous",
            "context_ids": context_ids,
        }
    )
    return rows


class RunAsrBenchmarkTests(unittest.TestCase):
    def test_runs_rights_gated_runpod_request_and_writes_resumable_prediction(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rows = benchmark_rows()
            for item in rows:
                write_wav(root / str(item["audio_path"]))

            request_count = 0

            def handler(request: httpx.Request) -> httpx.Response:
                nonlocal request_count
                request_count += 1
                body = json.loads(request.content)
                self.assertEqual(len(body["input"]["contexts"]), 10)
                return httpx.Response(
                    200,
                    request=request,
                    json={
                        "status": "COMPLETED",
                        "output": {
                            "success": True,
                            "transcript": "ngayu binal bama",
                            "model": "omniASR_LLM_7B_ZS",
                            "decoder": {"beamSize": 5},
                            "timing": {"inferenceMs": 100},
                        },
                    },
                )

            output = root / "predictions.jsonl"
            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                result = run(
                    manifest_rows=rows,
                    dataset_root=root,
                    output_path=output,
                    provider="runpod",
                    endpoint="https://example.test/runsync",
                    token="secret",
                    model_hash="sha256:checkpoint",
                    expected_model="omniASR_LLM_7B_ZS",
                    expected_beam_size=5,
                    timeout_seconds=30,
                    attempts=1,
                    dry_run=False,
                    client=client,
                )
            self.assertEqual(request_count, 1)
            self.assertEqual(result["completed_now"], 1)
            prediction = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(prediction["prediction"], "ngayu binal bama")
            self.assertEqual(prediction["decoder_policy"], "beam=5,length_norm=false")

            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                resumed = run(
                    manifest_rows=rows,
                    dataset_root=root,
                    output_path=output,
                    provider="runpod",
                    endpoint="https://example.test/runsync",
                    token="secret",
                    model_hash="sha256:checkpoint",
                    expected_model="omniASR_LLM_7B_ZS",
                    expected_beam_size=5,
                    timeout_seconds=30,
                    attempts=1,
                    dry_run=False,
                    client=client,
                )
            self.assertEqual(request_count, 1)
            self.assertEqual(resumed["completed_now"], 0)

    def test_fails_before_network_when_provider_transfer_is_not_authorized(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rows = benchmark_rows(provider_transfer_allowed=False)
            for item in rows:
                write_wav(root / str(item["audio_path"]))
            with self.assertRaisesRegex(BenchmarkError, "provider_transfer_allowed=true"):
                run(
                    manifest_rows=rows,
                    dataset_root=root,
                    output_path=root / "predictions.jsonl",
                    provider="runpod",
                    endpoint="https://example.test/runsync",
                    token="secret",
                    model_hash="sha256:checkpoint",
                    expected_model="omniASR_LLM_7B_ZS",
                    expected_beam_size=5,
                    timeout_seconds=30,
                    attempts=1,
                    dry_run=False,
                )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import io
import unittest
import wave

from speech_contract import (
    SpeechContractError,
    inspect_pcm_wav,
    normalize_context_text,
    normalize_transcript,
    validate_total_context_seconds,
)


def wav_bytes(duration_seconds: float, sample_rate: int = 16_000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(sample_rate)
        recording.writeframes(b"\x00\x00" * round(duration_seconds * sample_rate))
    return buffer.getvalue()


class SpeechContractTests(unittest.TestCase):
    def test_inspects_pcm_wav(self) -> None:
        info = inspect_pcm_wav(wav_bytes(1.5), max_seconds=2)
        self.assertAlmostEqual(info.duration_seconds, 1.5, places=2)
        self.assertEqual(info.sample_rate, 16_000)
        self.assertEqual(info.channels, 1)

    def test_rejects_short_audio(self) -> None:
        with self.assertRaisesRegex(SpeechContractError, "speak for a little longer"):
            inspect_pcm_wav(wav_bytes(0.1), max_seconds=2)

    def test_rejects_audio_over_endpoint_limit(self) -> None:
        with self.assertRaisesRegex(SpeechContractError, "under 1 seconds"):
            inspect_pcm_wav(wav_bytes(1.1), max_seconds=1)

    def test_normalizes_text_without_changing_orthography(self) -> None:
        self.assertEqual(normalize_context_text("  nyulu\n kada  "), "nyulu kada")
        self.assertEqual(normalize_transcript("  jalbu\t bama "), "jalbu bama")

    def test_rejects_control_characters(self) -> None:
        with self.assertRaisesRegex(SpeechContractError, "unsupported characters"):
            normalize_context_text("bama\x00")

    def test_rejects_excessive_total_context_audio(self) -> None:
        validate_total_context_seconds(60.0)
        with self.assertRaisesRegex(SpeechContractError, "under 60 seconds in total"):
            validate_total_context_seconds(60.01)


if __name__ == "__main__":
    unittest.main()

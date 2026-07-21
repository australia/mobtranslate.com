from __future__ import annotations

import io
import math
import unicodedata
import wave
from dataclasses import dataclass


MIN_AUDIO_SECONDS = 0.25
MAX_TARGET_SECONDS = 30.0
MAX_CONTEXT_SECONDS = 12.0
MAX_TOTAL_CONTEXT_SECONDS = 60.0
MAX_AUDIO_BYTES = 4 * 1024 * 1024
MAX_CONTEXT_EXAMPLES = 10
MAX_CONTEXT_TEXT_CHARS = 160


class SpeechContractError(ValueError):
    pass


@dataclass(frozen=True)
class WavInfo:
    duration_seconds: float
    sample_rate: int
    channels: int
    sample_width_bytes: int


def inspect_pcm_wav(data: bytes, *, max_seconds: float) -> WavInfo:
    if not data:
        raise SpeechContractError("The recording is empty.")
    if len(data) > MAX_AUDIO_BYTES:
        raise SpeechContractError("The recording is too large.")

    try:
        with wave.open(io.BytesIO(data), "rb") as recording:
            channels = recording.getnchannels()
            sample_rate = recording.getframerate()
            sample_width = recording.getsampwidth()
            frame_count = recording.getnframes()
            compression = recording.getcomptype()
    except (EOFError, wave.Error) as error:
        raise SpeechContractError("The recording must be an uncompressed WAV file.") from error

    if compression != "NONE":
        raise SpeechContractError("The WAV recording must use uncompressed audio.")
    if channels not in (1, 2):
        raise SpeechContractError("The recording must contain one or two audio channels.")
    if sample_rate < 8_000 or sample_rate > 96_000:
        raise SpeechContractError("The recording has an unsupported sample rate.")
    if sample_width not in (1, 2, 3, 4):
        raise SpeechContractError("The recording has an unsupported bit depth.")
    if frame_count <= 0:
        raise SpeechContractError("The recording contains no audio frames.")

    duration = frame_count / sample_rate
    if not math.isfinite(duration) or duration < MIN_AUDIO_SECONDS:
        raise SpeechContractError("Please speak for a little longer.")
    if duration > max_seconds:
        raise SpeechContractError(
            f"Please keep this recording under {int(max_seconds)} seconds."
        )

    return WavInfo(
        duration_seconds=duration,
        sample_rate=sample_rate,
        channels=channels,
        sample_width_bytes=sample_width,
    )


def validate_total_context_seconds(duration_seconds: float) -> None:
    if not math.isfinite(duration_seconds) or duration_seconds < 0:
        raise SpeechContractError("The voice example duration is invalid.")
    if duration_seconds > MAX_TOTAL_CONTEXT_SECONDS:
        raise SpeechContractError(
            f"Please keep the voice examples under {int(MAX_TOTAL_CONTEXT_SECONDS)} seconds in total."
        )


def normalize_context_text(value: str) -> str:
    normalized = " ".join(unicodedata.normalize("NFC", value).split())
    if not normalized:
        raise SpeechContractError("Each voice example needs its written words.")
    if len(normalized) > MAX_CONTEXT_TEXT_CHARS:
        raise SpeechContractError("A voice example is too long.")
    if any(unicodedata.category(char) == "Cc" for char in normalized):
        raise SpeechContractError("A voice example contains unsupported characters.")
    return normalized


def normalize_transcript(value: str) -> str:
    normalized = " ".join(unicodedata.normalize("NFC", value).split())
    if not normalized:
        raise SpeechContractError("No speech could be heard in this recording.")
    return normalized

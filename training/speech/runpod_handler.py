from __future__ import annotations

import base64
import binascii
import os
import threading
import time
from dataclasses import asdict


os.environ.setdefault("HOME", os.getenv("MOBTRANSLATE_ASR_HOME", "/runpod-volume/omnilingual-asr/home"))

import runpod
import torch
from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline, ContextExample
from omnilingual_asr.models.wav2vec2_llama.config import Wav2Vec2LlamaBeamSearchConfig

from speech_contract import (
    MAX_AUDIO_BYTES,
    MAX_CONTEXT_EXAMPLES,
    MAX_CONTEXT_SECONDS,
    MAX_TARGET_SECONDS,
    SpeechContractError,
    inspect_pcm_wav,
    normalize_context_text,
    normalize_transcript,
    validate_total_context_seconds,
)


MODEL_CARD = os.getenv("MOBTRANSLATE_ASR_MODEL_CARD", "omniASR_LLM_7B_ZS")
BEAM_SIZE = min(10, max(1, int(os.getenv("MOBTRANSLATE_ASR_BEAM_SIZE", "5"))))
MODEL_LOAD_STARTED = time.perf_counter()
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.bfloat16 if DEVICE == "cuda" else torch.float32
PIPELINE = ASRInferencePipeline(
    model_card=MODEL_CARD,
    device=DEVICE,
    dtype=DTYPE,
    beam_search_config=Wav2Vec2LlamaBeamSearchConfig(
        nbest=BEAM_SIZE,
        length_norm=False,
    ),
)
MODEL_LOAD_MS = round((time.perf_counter() - MODEL_LOAD_STARTED) * 1000)
INFERENCE_LOCK = threading.Lock()


def decode_wav(value: object, label: str) -> bytes:
    if not isinstance(value, str) or not value:
        raise SpeechContractError(f"{label} is missing.")
    if len(value) > ((MAX_AUDIO_BYTES + 2) // 3) * 4 + 8:
        raise SpeechContractError(f"{label} is too large.")
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise SpeechContractError(f"{label} is not valid audio data.") from error


def handler(job: dict[str, object]) -> dict[str, object]:
    try:
        payload = job.get("input")
        if not isinstance(payload, dict):
            raise SpeechContractError("The request input is missing.")

        target_bytes = decode_wav(payload.get("targetWavBase64"), "The sentence recording")
        target_info = inspect_pcm_wav(target_bytes, max_seconds=MAX_TARGET_SECONDS)
        raw_contexts = payload.get("contexts")
        if not isinstance(raw_contexts, list) or not 1 <= len(raw_contexts) <= MAX_CONTEXT_EXAMPLES:
            raise SpeechContractError("Please provide between one and ten voice examples.")

        examples: list[ContextExample] = []
        context_seconds = 0.0
        for index, raw_context in enumerate(raw_contexts):
            if not isinstance(raw_context, dict):
                raise SpeechContractError(f"Voice example {index + 1} is incomplete.")
            audio_bytes = decode_wav(
                raw_context.get("wavBase64"),
                f"Voice example {index + 1}",
            )
            info = inspect_pcm_wav(audio_bytes, max_seconds=MAX_CONTEXT_SECONDS)
            context_seconds += info.duration_seconds
            examples.append(
                ContextExample(
                    audio=audio_bytes,
                    text=normalize_context_text(str(raw_context.get("text", ""))),
                )
            )
        validate_total_context_seconds(context_seconds)

        queued_at = time.perf_counter()
        with INFERENCE_LOCK:
            queue_ms = round((time.perf_counter() - queued_at) * 1000)
            inference_started = time.perf_counter()
            output = PIPELINE.transcribe_with_context(
                [target_bytes],
                context_examples=[examples],
                batch_size=1,
            )
            inference_ms = round((time.perf_counter() - inference_started) * 1000)

        return {
            "success": True,
            "transcript": normalize_transcript(output[0] if output else ""),
            "language": "kuku_yalanji",
            "model": MODEL_CARD,
            "validation": "experimental_same_speaker_voice_examples",
            "decoder": {"beamSize": BEAM_SIZE},
            "timing": {
                "queueMs": queue_ms,
                "inferenceMs": inference_ms,
                "workerModelLoadMs": MODEL_LOAD_MS,
            },
            "audio": {
                "target": asdict(target_info),
                "contextCount": len(examples),
                "contextSeconds": round(context_seconds, 3),
                "retained": False,
            },
        }
    except SpeechContractError as error:
        return {"success": False, "error": str(error), "kind": "invalid_audio"}
    except Exception:
        return {
            "success": False,
            "error": "The listening model could not process this recording.",
            "kind": "inference_failure",
        }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})

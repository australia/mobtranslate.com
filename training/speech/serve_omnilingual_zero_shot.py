from __future__ import annotations

import asyncio
import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import Annotated

import torch
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline, ContextExample
from omnilingual_asr.models.wav2vec2_llama.config import Wav2Vec2LlamaBeamSearchConfig

from speech_contract import (
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
API_TOKEN = os.getenv("MOBTRANSLATE_ASR_TOKEN", "").strip()
MAX_CONCURRENT = max(1, int(os.getenv("MOBTRANSLATE_ASR_CONCURRENCY", "1")))
BEAM_SIZE = min(10, max(1, int(os.getenv("MOBTRANSLATE_ASR_BEAM_SIZE", "5"))))

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("mobtranslate-asr")

pipeline: ASRInferencePipeline | None = None
loaded_at: float | None = None
inference_slots = asyncio.Semaphore(MAX_CONCURRENT)


def require_bearer(authorization: Annotated[str | None, Header()] = None) -> None:
    if not API_TOKEN:
        raise HTTPException(status_code=503, detail="The transcription service is not configured.")
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Authentication required.")
    if not hmac.compare_digest(authorization[len(prefix) :], API_TOKEN):
        raise HTTPException(status_code=401, detail="Authentication required.")


@asynccontextmanager
async def lifespan(_: FastAPI):
    global pipeline, loaded_at
    logger.info("Loading model card %s", MODEL_CARD)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device == "cuda" else torch.float32
    # fairseq2 initializes thread-local gang state on the importing thread, so
    # construction must remain on the service's main thread. Startup is allowed
    # to block; inference below is moved off the event loop after initialization.
    pipeline = ASRInferencePipeline(
        model_card=MODEL_CARD,
        device=device,
        dtype=dtype,
        beam_search_config=Wav2Vec2LlamaBeamSearchConfig(
            nbest=BEAM_SIZE,
            length_norm=False,
        ),
    )
    loaded_at = time.time()
    logger.info("Model ready on %s", device)
    try:
        yield
    finally:
        pipeline = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


app = FastAPI(
    title="MobTranslate Kuku Yalanji listening service",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


@app.exception_handler(SpeechContractError)
async def speech_contract_error(_, error: SpeechContractError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": str(error)},
        headers={"Cache-Control": "no-store"},
    )


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok" if pipeline is not None else "loading",
        "model": MODEL_CARD,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "loadedAt": loaded_at,
        "audioRetention": "none",
        "beamSize": BEAM_SIZE,
    }


@app.post("/v1/transcribe", dependencies=[Depends(require_bearer)])
async def transcribe(
    target: Annotated[UploadFile, File()],
    context_audio: Annotated[list[UploadFile], File()],
    context_text: Annotated[list[str], Form()],
) -> JSONResponse:
    if pipeline is None:
        raise HTTPException(status_code=503, detail="The listening model is still loading.")
    if len(context_audio) != len(context_text):
        raise SpeechContractError("Voice examples and written words do not match.")
    if not 1 <= len(context_audio) <= MAX_CONTEXT_EXAMPLES:
        raise SpeechContractError("Please provide between one and ten voice examples.")

    target_bytes = await target.read()
    target_info = inspect_pcm_wav(target_bytes, max_seconds=MAX_TARGET_SECONDS)

    examples: list[ContextExample] = []
    context_durations: list[float] = []
    for audio_file, raw_text in zip(context_audio, context_text, strict=True):
        audio_bytes = await audio_file.read()
        audio_info = inspect_pcm_wav(audio_bytes, max_seconds=MAX_CONTEXT_SECONDS)
        context_durations.append(audio_info.duration_seconds)
        examples.append(
            ContextExample(
                audio=audio_bytes,
                text=normalize_context_text(raw_text),
            )
        )
    validate_total_context_seconds(sum(context_durations))

    queued_at = time.perf_counter()
    async with inference_slots:
        queue_ms = round((time.perf_counter() - queued_at) * 1000)
        inference_started = time.perf_counter()
        outputs = await asyncio.to_thread(
            pipeline.transcribe_with_context,
            [target_bytes],
            context_examples=[examples],
            batch_size=1,
        )
        inference_ms = round((time.perf_counter() - inference_started) * 1000)

    transcript = normalize_transcript(outputs[0] if outputs else "")
    logger.info(
        "Transcribed target_seconds=%.2f contexts=%d context_seconds=%.2f queue_ms=%d inference_ms=%d",
        target_info.duration_seconds,
        len(examples),
        sum(context_durations),
        queue_ms,
        inference_ms,
    )
    return JSONResponse(
        {
            "success": True,
            "transcript": transcript,
            "language": "kuku_yalanji",
            "model": MODEL_CARD,
            "validation": "experimental_same_speaker_voice_examples",
            "decoder": {"beamSize": BEAM_SIZE},
            "timing": {
                "queueMs": queue_ms,
                "inferenceMs": inference_ms,
            },
            "audio": {
                "target": asdict(target_info),
                "contextCount": len(examples),
                "contextSeconds": round(sum(context_durations), 3),
                "retained": False,
            },
        },
        headers={"Cache-Control": "no-store"},
    )

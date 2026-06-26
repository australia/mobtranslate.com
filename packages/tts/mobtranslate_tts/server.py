"""
FastAPI service for MobTranslate neural TTS.  POST /tts -> audio bytes.

Run:  uvicorn mobtranslate_tts.server:app --host 127.0.0.1 --port 7820
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import registry
from .synth import TTSEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="MobTranslate TTS", version="1.0")
engine = TTSEngine()


class TTSRequest(BaseModel):
    text: str
    lang: str | None = None
    model: str | None = None
    bridge: str | None = None
    format: str = "mp3"
    seed: int | None = None


@app.on_event("startup")
def _startup() -> None:
    # Preload the default model so the first request isn't slow.
    engine.warmup(registry.DEFAULT_MODEL)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "languages": registry.supported(), "default_model": registry.DEFAULT_MODEL}


@app.post("/tts")
def tts(req: TTSRequest) -> Response:
    text = (req.text or "").strip()
    if not text:
        return JSONResponse({"error": "text required"}, status_code=400)
    if len(text) > 600:
        text = text[:600]
    audio, meta = engine.synthesize(
        text,
        lang=req.lang,
        model=req.model,
        bridge=req.bridge,
        fmt=req.format,
        seed=req.seed if req.seed is not None else 1234,
    )
    media = "audio/mpeg" if meta["format"] == "mp3" else "audio/wav"
    return Response(
        content=audio,
        media_type=media,
        headers={
            "X-TTS-Model": str(meta["model"]),
            "X-TTS-Mapped": meta["mapped"][:200],
            "X-TTS-Duration-Ms": str(meta.get("duration_ms", "")),
            "X-TTS-Cached": str(meta.get("cached", False)),
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )

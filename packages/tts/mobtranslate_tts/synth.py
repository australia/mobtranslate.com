"""
Neural synthesis engine over Meta MMS-TTS (VITS via transformers).

- Deterministic: a fixed seed makes the same text produce byte-identical audio,
  so caching/storing is safe and reproducible.
- Two-layer cache: in-memory LRU + optional on-disk (TTS_CACHE_DIR).
- Lazy, per-model loading so the registry can serve several languages.
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import shutil
import subprocess
from collections import OrderedDict

import numpy as np
import torch
from scipy.io import wavfile
from transformers import AutoTokenizer, VitsModel

from . import registry
from .orthography import normalize_for_pjt

log = logging.getLogger("mobtranslate_tts")

DEFAULT_SEED = 1234
_MEM_CACHE_MAX = 512
_HAS_FFMPEG = shutil.which("ffmpeg") is not None


def _apply_bridge(text: str, bridge: str | None) -> str:
    if bridge == "yalanji":
        return normalize_for_pjt(text)
    return text


class TTSEngine:
    def __init__(self, cache_dir: str | None = None):
        self._models: dict[str, tuple[VitsModel, AutoTokenizer]] = {}
        self._mem: "OrderedDict[str, tuple[bytes, int]]" = OrderedDict()
        self._cache_dir = cache_dir or os.environ.get("TTS_CACHE_DIR")
        if self._cache_dir:
            os.makedirs(self._cache_dir, exist_ok=True)

    # ---- model loading -------------------------------------------------
    def _load(self, model_id: str) -> tuple[VitsModel, AutoTokenizer]:
        if model_id not in self._models:
            log.info("loading MMS-TTS model %s", model_id)
            model = VitsModel.from_pretrained(model_id)
            model.eval()
            tok = AutoTokenizer.from_pretrained(model_id)
            self._models[model_id] = (model, tok)
        return self._models[model_id]

    def warmup(self, model_id: str = registry.DEFAULT_MODEL) -> None:
        self._load(model_id)

    # ---- core synth ----------------------------------------------------
    def _waveform(self, text: str, model_id: str, seed: int) -> tuple[np.ndarray, int]:
        model, tok = self._load(model_id)
        inputs = tok(text, return_tensors="pt")
        torch.manual_seed(seed)
        with torch.no_grad():
            out = model(**inputs).waveform  # (1, n)
        wav = out.squeeze().cpu().numpy().astype(np.float32)
        # normalize to avoid clipping, then 16-bit PCM
        peak = float(np.max(np.abs(wav))) or 1.0
        wav = (wav / peak) * 0.97
        rate = int(model.config.sampling_rate)
        return wav, rate

    @staticmethod
    def _to_wav_bytes(wav: np.ndarray, rate: int) -> bytes:
        buf = io.BytesIO()
        wavfile.write(buf, rate, (wav * 32767.0).astype(np.int16))
        return buf.getvalue()

    @staticmethod
    def _wav_to_mp3(wav_bytes: bytes) -> bytes:
        if not _HAS_FFMPEG:
            return wav_bytes  # caller should treat as wav
        p = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-codec:a", "libmp3lame", "-q:a", "4", "-f", "mp3", "pipe:1"],
            input=wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        return p.stdout if p.returncode == 0 and p.stdout else wav_bytes

    # ---- public API ----------------------------------------------------
    def synthesize(
        self,
        text: str,
        *,
        lang: str | None = None,
        model: str | None = None,
        bridge: str | None = None,
        fmt: str = "mp3",
        seed: int = DEFAULT_SEED,
    ) -> tuple[bytes, dict]:
        """
        Returns (audio_bytes, meta). Resolves the model+bridge from `lang` when
        not given explicitly. `meta` records exactly what the model was handed.
        """
        entry = registry.resolve(lang) or {}
        model_id = model or entry.get("model") or registry.DEFAULT_MODEL
        bridge_name = bridge if bridge is not None else entry.get("bridge")
        mapped = _apply_bridge(text.strip(), bridge_name)

        out_fmt = "mp3" if (fmt == "mp3" and _HAS_FFMPEG) else "wav"
        key = hashlib.sha256(f"{model_id}|{seed}|{mapped}|{out_fmt}".encode()).hexdigest()
        meta = {
            "model": model_id, "bridge": bridge_name, "lang": lang,
            "input": text, "mapped": mapped, "seed": seed, "format": out_fmt, "key": key,
        }

        cached = self._cache_get(key)
        if cached is not None:
            meta["cached"] = True
            return cached, meta

        wav, rate = self._waveform(mapped, model_id, seed)
        wav_bytes = self._to_wav_bytes(wav, rate)
        audio = self._wav_to_mp3(wav_bytes) if out_fmt == "mp3" else wav_bytes
        meta.update({"rate": rate, "duration_ms": int(1000 * len(wav) / rate), "cached": False})
        log.info("tts model=%s seed=%s fmt=%s in=%r mapped=%r", model_id, seed, out_fmt, text, mapped)
        self._cache_put(key, audio)
        return audio, meta

    # ---- cache ---------------------------------------------------------
    def _cache_get(self, key: str) -> bytes | None:
        if key in self._mem:
            self._mem.move_to_end(key)
            return self._mem[key][0]
        if self._cache_dir:
            path = os.path.join(self._cache_dir, key)
            if os.path.exists(path):
                with open(path, "rb") as f:
                    data = f.read()
                self._mem[key] = (data, len(data))
                return data
        return None

    def _cache_put(self, key: str, data: bytes) -> None:
        self._mem[key] = (data, len(data))
        self._mem.move_to_end(key)
        while len(self._mem) > _MEM_CACHE_MAX:
            self._mem.popitem(last=False)
        if self._cache_dir:
            try:
                with open(os.path.join(self._cache_dir, key), "wb") as f:
                    f.write(data)
            except OSError:
                pass

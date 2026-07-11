#!/usr/bin/env python3
"""Serve the Kuku Yalanji v21.2 research-preview translator over a tiny JSON HTTP API.

This is a deliberately small, dependency-light service (stdlib ``http.server`` only,
same pattern as ``serve_nllb_lora.py``). It loads the merged NLLB-600M+LoRA model
ONCE at start-up on CPU (fp32) and answers:

    GET  /health           -> {"ok": true, "model": "...", "ready": true, ...}
    POST /translate {text} -> {"kuku": "...", "ms": <int>, "model": "..."}

Design constraints (research preview, user-facing, single shared box):
  * Inference is SERIALIZED behind a lock (one generate at a time on CPU).
  * A bounded admission gate (semaphore) caps how many requests may queue: one
    running + ``--max-waiting`` waiting. Beyond that the service replies 429 with a
    friendly "busy" message instead of piling up unbounded work.
  * Input is capped at ``--max-chars`` characters -> 413 beyond, whitespace is
    stripped/collapsed, and generation has a wall-clock ``max_time`` guard so a
    pathological input can never run away.
  * Binds 127.0.0.1 only; holds no secrets.

Inference recipe (frozen for v21.2-claude-balanced-replay, matches the training smoke
test): tokenizer src_lang=eng_Latn / tgt_lang=gvn_Latn, input text is prefixed with
``<translate> ``, greedy decode (num_beams=1), forced_bos_token_id = gvn_Latn.
"""

from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import gc
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def _make_malloc_trim():
    """Return a callable that hands glibc's freed arenas back to the OS.

    CPU torch + glibc happily hold onto freed heap in per-thread arenas, so RSS
    ratchets up across requests (the "citer leak" pattern) even though nothing
    leaks logically. Calling ``malloc_trim(0)`` after each generation keeps steady
    RSS bounded so the 5G MemorySwapMax=0 cgroup cap never OOM-kills us. No-op on
    non-glibc platforms.
    """
    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6", use_errno=True)
        libc.malloc_trim.argtypes = [ctypes.c_size_t]
        libc.malloc_trim.restype = ctypes.c_int
        return lambda: libc.malloc_trim(0)
    except Exception:  # pragma: no cover - platform without glibc malloc_trim
        return lambda: None


_malloc_trim = _make_malloc_trim()

DEFAULT_MODEL_DIR = (
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30/runpod/"
    "v21.2-claude-balanced-replay-20260711T050900Z/models/"
    "v21.2-claude-balanced-replay-gvn-3epoch-lr2e-5/merged"
)
DEFAULT_MODEL_ID = "v21.2-claude-balanced-replay"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", default=DEFAULT_MODEL_DIR)
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7955)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--prefix", default="<translate> ")
    # The merged model is ~1.37B params (stored fp16 on disk, 2.7GB). fp32 is the
    # right dtype on this box: this CPU is AVX2-only (no avx512_bf16), so bf16
    # matmul JIT-rebuilds oneDNN primitives per input shape at ~70-95s each — an
    # unusable user-facing cold path. fp32 uses precompiled AVX2 kernels and is
    # uniformly ~3-5s from the first call. fp32 needs ~5.3GB resident (see the
    # 8G memory cap in the systemd unit — the model is larger than a 600M base).
    parser.add_argument(
        "--dtype", choices=["float32", "bfloat16", "float16"], default="float32"
    )
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--max-chars", type=int, default=400)
    parser.add_argument("--max-source-length", type=int, default=200)
    parser.add_argument("--max-new-tokens", type=int, default=208)
    parser.add_argument("--num-beams", type=int, default=1)
    # one request runs; this many may wait behind it before we shed load with 429.
    parser.add_argument("--max-waiting", type=int, default=8)
    # wall-clock guard for a single generate() call.
    parser.add_argument("--max-time", type=float, default=45.0)
    return parser.parse_args()


def normalize_text(text: str) -> str:
    """Strip and collapse internal whitespace runs into single spaces."""
    return " ".join(text.split())


class InputTooLargeError(ValueError):
    """Raised when the request text exceeds the character cap (-> HTTP 413)."""


class ServiceBusyError(RuntimeError):
    """Raised when the admission gate is full (-> HTTP 429)."""


class TranslationService:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        torch.set_num_threads(max(1, args.threads))
        torch.set_grad_enabled(False)
        dtype = {
            "bfloat16": torch.bfloat16,
            "float32": torch.float32,
            "float16": torch.float16,
        }[args.dtype]
        self.tokenizer = AutoTokenizer.from_pretrained(
            args.model_dir, src_lang=args.source_lang, tgt_lang=args.target_lang
        )
        self.model = AutoModelForSeq2SeqLM.from_pretrained(
            args.model_dir, torch_dtype=dtype
        )
        self.model.eval()
        gc.collect()
        _malloc_trim()
        self.target_id = self.tokenizer.convert_tokens_to_ids(args.target_lang)
        self.model.config.forced_bos_token_id = self.target_id

        # Only one generate() runs at a time (CPU-bound, single model instance).
        self._inference_lock = threading.Lock()
        # Admission gate: 1 running + max_waiting queued. Beyond -> 429.
        self._gate = threading.BoundedSemaphore(max(1, 1 + args.max_waiting))
        self.ready = False
        # Prime the kernels with one real generation BEFORE we bind the port, so
        # /health only goes green once the first user request will be fast.
        self._warmup()
        self.ready = True

    def _warmup(self) -> None:
        started = time.time()
        try:
            self._run("The woman went down to the river.")
            print(
                json.dumps(
                    {"event": "warmup_done", "ms": round((time.time() - started) * 1000)}
                ),
                flush=True,
            )
        except Exception as exc:  # pragma: no cover - warmup must not block startup
            print(
                json.dumps({"event": "warmup_failed", "error": str(exc)}), flush=True
            )

    # ---- request handling -------------------------------------------------
    def translate(self, body: dict[str, Any]) -> dict[str, Any]:
        raw = body.get("text")
        if not isinstance(raw, str):
            raise ValueError("Request body must include a 'text' string.")
        if len(raw) > self.args.max_chars:
            raise InputTooLargeError(
                f"Please shorten your sentence to {self.args.max_chars} characters or less."
            )
        text = normalize_text(raw)
        if not text:
            raise ValueError("Please enter an English sentence to translate.")

        # Shed load early if the queue is already full.
        if not self._gate.acquire(blocking=False):
            raise ServiceBusyError(
                "The translator is busy right now. Please wait a moment and try again."
            )
        try:
            with self._inference_lock:
                return self._run(text)
        finally:
            self._gate.release()

    def _run(self, text: str) -> dict[str, Any]:
        started = time.time()
        source = self.args.prefix + text
        inputs = self.tokenizer(
            [source],
            max_length=self.args.max_source_length,
            truncation=True,
            return_tensors="pt",
        )
        try:
            with torch.inference_mode():
                generated = self.model.generate(
                    **inputs,
                    forced_bos_token_id=self.target_id,
                    num_beams=self.args.num_beams,
                    max_new_tokens=self.args.max_new_tokens,
                    max_time=self.args.max_time,
                )
            kuku = normalize_text(
                self.tokenizer.batch_decode(generated, skip_special_tokens=True)[0]
            )
        finally:
            # Drop working tensors and hand freed heap back to the OS so RSS stays
            # bounded under sustained load (MemorySwapMax=0 leaves no headroom).
            del inputs
            gc.collect()
            _malloc_trim()
        return {
            "kuku": kuku,
            "ms": round((time.time() - started) * 1000),
            "model": self.args.model_id,
        }

    def health(self) -> dict[str, Any]:
        return {
            "ok": True,
            "ready": self.ready,
            "model": self.args.model_id,
            "sourceLang": self.args.source_lang,
            "targetLang": self.args.target_lang,
            "device": "cpu",
        }


def make_handler(service: TranslationService):
    class Handler(BaseHTTPRequestHandler):
        server_version = "kuku-v2-infer/1.0"

        def do_GET(self) -> None:
            if self.path.rstrip("/") == "/health":
                self.send_json(service.health())
                return
            self.send_json({"ok": False, "error": "Not found"}, status=404)

        def do_POST(self) -> None:
            if self.path.rstrip("/") not in ("/translate", ""):
                self.send_json({"ok": False, "error": "Not found"}, status=404)
                return
            try:
                length = int(self.headers.get("content-length", "0") or "0")
                if length > 64 * 1024:  # tiny JSON only; guard against oversized bodies
                    raise InputTooLargeError("Request body too large.")
                raw = self.rfile.read(length).decode("utf-8") if length else "{}"
                body = json.loads(raw or "{}")
                if not isinstance(body, dict):
                    raise ValueError("Request body must be a JSON object.")
                self.send_json(service.translate(body))
            except InputTooLargeError as exc:
                self.send_json({"ok": False, "error": str(exc)}, status=413)
            except ServiceBusyError as exc:
                self.send_json({"ok": False, "error": str(exc)}, status=429)
            except ValueError as exc:
                self.send_json({"ok": False, "error": str(exc)}, status=400)
            except Exception as exc:  # pragma: no cover - defensive
                self.send_json(
                    {"ok": False, "error": f"Translation failed: {exc}"}, status=500
                )

        def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A002
            print(f"{self.address_string()} - {fmt % args}", flush=True)

        def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except BrokenPipeError:  # client gave up while we were generating
                pass

    return Handler


def main() -> None:
    args = parse_args()
    service = TranslationService(args)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(service))
    print(
        json.dumps(
            {
                "event": "ready",
                "host": args.host,
                "port": args.port,
                "model": args.model_id,
                "modelDir": args.model_dir,
                "threads": args.threads,
                "maxWaiting": args.max_waiting,
            }
        ),
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

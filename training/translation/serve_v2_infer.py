#!/usr/bin/env python3
"""Serve a merged or base-plus-PEFT Kuku Yalanji model over a tiny JSON HTTP API.

This is a deliberately small service (stdlib ``http.server`` plus the model stack,
same pattern as ``serve_nllb_lora.py``). It loads one NLLB model ONCE at start-up
on CPU and answers:

    GET  /health           -> {"ok": true, "model": "...", "ready": true, ...}
    POST /translate {text, task?} -> {"kuku": "...", "ms": <int>, "model": "..."}

Design constraints (research preview, user-facing, single shared box):
  * Inference is SERIALIZED behind a lock (one generate at a time on CPU).
  * A bounded admission gate (semaphore) caps how many requests may queue: one
    running + ``--max-waiting`` waiting. Beyond that the service replies 429 with a
    friendly "busy" message instead of piling up unbounded work.
  * Input is capped at ``--max-chars`` characters -> 413 beyond, whitespace is
    stripped/collapsed, and generation has a wall-clock ``max_time`` guard so a
    pathological input can never run away.
  * Binds 127.0.0.1 only; holds no secrets.

Inference recipe (validated for v21.2-claude-balanced-replay by the frozen v22
decoder-transfer experiment): tokenizer src_lang=eng_Latn / tgt_lang=gvn_Latn,
input text is prefixed with ``<translate> ``, beams=1, no-repeat n-gram=4,
repetition penalty=1.10, length penalty=1.0, and forced_bos_token_id=gvn_Latn.
"""

from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import gc
import hashlib
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
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
DEFAULT_MODEL_ID = "v21.2-claude-balanced-replay-guarded-20260714"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model-dir",
        default=DEFAULT_MODEL_DIR,
        help="Standalone merged model, or the exact base model when --adapter-dir is set.",
    )
    parser.add_argument(
        "--adapter-dir",
        default="",
        help="Optional PEFT adapter and tokenizer directory loaded over --model-dir.",
    )
    parser.add_argument(
        "--adapter-sha256",
        default="",
        help="Optional expected SHA-256 for adapter_model.safetensors; mismatch fails closed.",
    )
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7955)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--prefix", default="<translate> ")
    parser.add_argument("--warmup-text", default="The woman went down to the river.")
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
    parser.add_argument("--lexeme-max-new-tokens", type=int, default=32)
    parser.add_argument("--num-beams", type=int, default=1)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=4)
    parser.add_argument("--repetition-penalty", type=float, default=1.1)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    # one request runs; this many may wait behind it before we shed load with 429.
    parser.add_argument("--max-waiting", type=int, default=8)
    # wall-clock guard for a single generate() call.
    parser.add_argument("--max-time", type=float, default=45.0)
    return parser.parse_args()


def normalize_text(text: str) -> str:
    """Strip and collapse internal whitespace runs into single spaces."""
    return " ".join(text.split())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as reader:
        for chunk in iter(lambda: reader.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
        tokenizer_dir = args.adapter_dir or args.model_dir
        self.tokenizer = AutoTokenizer.from_pretrained(
            tokenizer_dir, src_lang=args.source_lang, tgt_lang=args.target_lang
        )
        base_model = AutoModelForSeq2SeqLM.from_pretrained(
            args.model_dir, torch_dtype=dtype
        )
        self.adapter_sha256 = ""
        if args.adapter_dir:
            adapter_file = Path(args.adapter_dir) / "adapter_model.safetensors"
            if not adapter_file.is_file():
                raise FileNotFoundError(f"Missing PEFT weights: {adapter_file}")
            self.adapter_sha256 = sha256_file(adapter_file)
            if args.adapter_sha256 and self.adapter_sha256 != args.adapter_sha256.lower():
                raise RuntimeError(
                    "Adapter SHA-256 mismatch: "
                    f"expected {args.adapter_sha256.lower()}, observed {self.adapter_sha256}"
                )

            # The adapter tokenizer may add task tokens. The base must have the
            # same vocabulary shape before PEFT restores selective token rows.
            if base_model.get_input_embeddings().num_embeddings != len(self.tokenizer):
                base_model.resize_token_embeddings(len(self.tokenizer))
            try:
                from peft import PeftModel
            except ImportError as exc:  # pragma: no cover - deployment preflight
                raise RuntimeError("PEFT is required when --adapter-dir is set") from exc
            self.model = PeftModel.from_pretrained(
                base_model,
                args.adapter_dir,
                is_trainable=False,
                low_cpu_mem_usage=True,
            )
            # Saved selective-token rows may retain their training dtype even
            # when the base was loaded as fp32. Normalize the complete runtime
            # after PEFT restoration or generation can fail in lm_head matmul.
            self.model.to(dtype=dtype)
        else:
            self.model = base_model
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
            self._run(self.args.warmup_text, task="translate")
            print(
                json.dumps(
                    {"event": "warmup_done", "ms": round((time.time() - started) * 1000)}
                ),
                flush=True,
            )
        except Exception as exc:  # pragma: no cover - integration failure path
            print(
                json.dumps({"event": "warmup_failed", "error": str(exc)}), flush=True
            )
            raise RuntimeError("Model warmup failed; refusing to become ready") from exc

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
        task = body.get("task", "translate")
        if task not in ("translate", "lexeme"):
            raise ValueError("'task' must be either 'translate' or 'lexeme'.")

        # Shed load early if the queue is already full.
        if not self._gate.acquire(blocking=False):
            raise ServiceBusyError(
                "The translator is busy right now. Please wait a moment and try again."
            )
        try:
            with self._inference_lock:
                return self._run(text, task=task)
        finally:
            self._gate.release()

    def _run(self, text: str, *, task: str) -> dict[str, Any]:
        started = time.time()
        source = ("<lexeme> " if task == "lexeme" else self.args.prefix) + text
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
                    max_new_tokens=(
                        self.args.lexeme_max_new_tokens
                        if task == "lexeme"
                        else self.args.max_new_tokens
                    ),
                    no_repeat_ngram_size=(
                        0 if task == "lexeme" else self.args.no_repeat_ngram_size
                    ),
                    repetition_penalty=(
                        1.0 if task == "lexeme" else self.args.repetition_penalty
                    ),
                    length_penalty=(
                        1.0 if task == "lexeme" else self.args.length_penalty
                    ),
                    max_time=self.args.max_time,
                )
            translation = normalize_text(
                self.tokenizer.batch_decode(generated, skip_special_tokens=True)[0]
            )
        finally:
            # Drop working tensors and hand freed heap back to the OS so RSS stays
            # bounded under sustained load (MemorySwapMax=0 leaves no headroom).
            del inputs
            gc.collect()
            _malloc_trim()
        return {
            "translation": translation,
            "kuku": translation,
            "ms": round((time.time() - started) * 1000),
            "model": self.args.model_id,
            "task": task,
            "sourceLang": self.args.source_lang,
            "targetLang": self.args.target_lang,
        }

    def health(self) -> dict[str, Any]:
        return {
            "ok": True,
            "ready": self.ready,
            "model": self.args.model_id,
            "sourceLang": self.args.source_lang,
            "targetLang": self.args.target_lang,
            "device": "cpu",
            "runtime": "base_plus_adapter" if self.args.adapter_dir else "merged",
            "adapterSha256": self.adapter_sha256 or None,
            "tasks": {
                "lexeme": {
                    "inputPrefix": "<lexeme> ",
                    "maxNewTokens": self.args.lexeme_max_new_tokens,
                    "numBeams": self.args.num_beams,
                    "noRepeatNgramSize": 0,
                    "repetitionPenalty": 1.0,
                    "lengthPenalty": 1.0,
                },
                "translate": {
                    "inputPrefix": self.args.prefix,
                    "maxNewTokens": self.args.max_new_tokens,
                    "numBeams": self.args.num_beams,
                    "noRepeatNgramSize": self.args.no_repeat_ngram_size,
                    "repetitionPenalty": self.args.repetition_penalty,
                    "lengthPenalty": self.args.length_penalty,
                },
            },
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

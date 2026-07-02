#!/usr/bin/env python3
"""Serve a merged MobTranslate NLLB model over a small JSON HTTP API."""

from __future__ import annotations

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="gvn_Latn")
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--dtype", choices=["auto", "float32", "float16", "bfloat16"], default="auto")
    parser.add_argument("--max-source-length", type=int, default=192)
    return parser.parse_args()


def normalize_text(text: str) -> str:
    return " ".join(text.split())


def dtype_from_arg(value: str) -> torch.dtype | None:
    if value == "float32":
        return torch.float32
    if value == "float16":
        return torch.float16
    if value == "bfloat16":
        return torch.bfloat16
    return torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else None


def add_lang_code(tokenizer: Any, model: Any, lang_code: str) -> int:
    token_id = tokenizer.convert_tokens_to_ids(lang_code)
    if token_id == tokenizer.unk_token_id:
        tokenizer.add_special_tokens({"additional_special_tokens": [lang_code]})
        model.resize_token_embeddings(len(tokenizer))
        token_id = tokenizer.convert_tokens_to_ids(lang_code)

    for attr in ("lang_code_to_id", "fairseq_tokens_to_ids"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[lang_code] = token_id
    for attr in ("id_to_lang_code", "fairseq_ids_to_tokens"):
        mapping = getattr(tokenizer, attr, None)
        if isinstance(mapping, dict):
            mapping[token_id] = lang_code
    return token_id


def tokenizer_knows_lang_code(tokenizer: Any, lang_code: str) -> bool:
    return tokenizer.convert_tokens_to_ids(lang_code) != tokenizer.unk_token_id


class TranslationService:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        dtype = dtype_from_arg(args.dtype)
        self.tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(args.model_dir, torch_dtype=dtype)
        self.source_lang = args.source_lang
        self.target_lang = args.target_lang
        add_lang_code(self.tokenizer, self.model, self.source_lang)
        self.target_id = add_lang_code(self.tokenizer, self.model, self.target_lang)
        self.tokenizer.src_lang = self.source_lang
        self.tokenizer.tgt_lang = self.target_lang
        self.model.config.forced_bos_token_id = self.target_id
        self.model.to(torch.device(args.device))
        self.model.eval()

    @property
    def device(self) -> torch.device:
        return next(self.model.parameters()).device

    def translate(self, body: dict[str, Any]) -> dict[str, Any]:
        started = time.time()
        text = normalize_text(str(body.get("text", "")))
        if not text:
            raise ValueError("Request text must be non-empty.")

        source_lang = str(body.get("sourceLang") or self.source_lang)
        requested_target_lang = str(body.get("targetLang") or self.target_lang)
        target_lang = requested_target_lang
        if not tokenizer_knows_lang_code(self.tokenizer, target_lang):
            target_lang = self.target_lang
        target_id = add_lang_code(self.tokenizer, self.model, target_lang)
        add_lang_code(self.tokenizer, self.model, source_lang)
        self.tokenizer.src_lang = source_lang
        self.tokenizer.tgt_lang = target_lang
        self.model.config.forced_bos_token_id = target_id

        max_new_tokens = int(body.get("maxNewTokens") or 192)
        num_beams = int(body.get("numBeams") or 4)
        no_repeat_ngram_size = int(body.get("noRepeatNgramSize") or 0)
        repetition_penalty = float(body.get("repetitionPenalty") or 1.0)
        length_penalty = float(body.get("lengthPenalty") or 1.0)

        inputs = self.tokenizer(
            [text],
            max_length=self.args.max_source_length,
            truncation=True,
            padding=True,
            return_tensors="pt",
        ).to(self.device)

        with torch.no_grad():
            generated = self.model.generate(
                **inputs,
                forced_bos_token_id=target_id,
                max_new_tokens=max_new_tokens,
                num_beams=num_beams,
                no_repeat_ngram_size=no_repeat_ngram_size,
                repetition_penalty=repetition_penalty,
                length_penalty=length_penalty,
            )

        translation = normalize_text(self.tokenizer.batch_decode(generated, skip_special_tokens=True)[0])
        return {
            "success": True,
            "translation": translation,
            "gloss": None,
            "latencyMs": round((time.time() - started) * 1000),
            "device": str(self.device),
            "modelDir": self.args.model_dir,
            "sourceLang": source_lang,
            "targetLang": target_lang,
            "requestedTargetLang": requested_target_lang,
        }


def make_handler(service: TranslationService):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path != "/health":
                self.send_json({"success": False, "error": "Not found"}, status=404)
                return
            self.send_json({
                "success": True,
                "device": str(service.device),
                "modelDir": service.args.model_dir,
                "sourceLang": service.source_lang,
                "targetLang": service.target_lang,
            })

        def do_POST(self) -> None:
            if self.path not in ("/translate", "/"):
                self.send_json({"success": False, "error": "Not found"}, status=404)
                return
            try:
                length = int(self.headers.get("content-length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
                self.send_json(service.translate(body))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)}, status=400)

        def log_message(self, format: str, *args: Any) -> None:
            print(f"{self.address_string()} - {format % args}")

        def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return Handler


def main() -> None:
    args = parse_args()
    service = TranslationService(args)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(service))
    print(json.dumps({
        "event": "ready",
        "host": args.host,
        "port": args.port,
        "device": str(service.device),
        "modelDir": args.model_dir,
    }))
    server.serve_forever()


if __name__ == "__main__":
    main()

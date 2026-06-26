#!/usr/bin/env python3
"""
Pre-render the Kuku Yalanji dictionary: synthesize + store every headword and
usage-example via the running TTS service, so the whole dictionary is audible
instantly with zero per-request latency. Re-runnable; skips already-stored.

Storage mirrors the Next /api/tts neural path: file at
  $MOBTRANSLATE_TTS_DIR/<lang>/<sha256(model|text)>.mp3
plus a row in public.tts_generations (idempotent).

Usage:
  . .venv/bin/activate
  python prerender.py --lang kuku_yalanji [--examples] [--limit N]
"""
from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
import time
import urllib.request

MODEL = "facebook/mms-tts-pjt"
TTS_URL = os.environ.get("TTS_SERVICE_URL", "http://127.0.0.1:7820")
TTS_DIR = os.environ.get("MOBTRANSLATE_TTS_DIR", "/mnt/donto-data/mobtranslate-storage/tts")


def psql(q: str) -> list[str]:
    out = subprocess.run(
        ["docker", "exec", "mobtranslate-pg", "psql", "-U", "mobtranslate", "-d", "mobtranslate", "-tA", "-F", "\t", "-c", q],
        capture_output=True, text=True,
    )
    return [l for l in out.stdout.splitlines() if l.strip()]


def psql_exec(q: str) -> None:
    subprocess.run(
        ["docker", "exec", "mobtranslate-pg", "psql", "-U", "mobtranslate", "-d", "mobtranslate", "-c", q],
        capture_output=True, text=True,
    )


def already(lang: str, text: str) -> bool:
    safe = text.replace("'", "''")
    rows = psql(f"select 1 from public.tts_generations where language_code='{lang}' and model='{MODEL}' and text='{safe}' limit 1")
    return bool(rows)


def synth(text: str) -> bytes | None:
    body = ('{"text": %s, "lang": "kuku_yalanji", "format": "mp3"}' % _json(text)).encode()
    req = urllib.request.Request(f"{TTS_URL}/tts", data=body, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read(), r.headers
    except Exception as e:
        print("  ! synth failed:", e, file=sys.stderr)
        return None, None


def _json(s: str) -> str:
    import json
    return json.dumps(s)


def store(lang: str, text: str, buf: bytes, headers) -> None:
    sha = hashlib.sha256(f"{MODEL}|{text}".encode()).hexdigest()
    rel = f"{lang}/{sha}.mp3"
    abs_path = os.path.join(TTS_DIR, rel)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "wb") as f:
        f.write(buf)
    mapped = (headers.get("x-tts-mapped") or "").replace("'", "''")
    dur = headers.get("x-tts-duration-ms") or "null"
    try:
        dur = str(int(dur))
    except Exception:
        dur = "null"
    safe = text.replace("'", "''")
    psql_exec(
        "insert into public.tts_generations "
        "(language_code, text, normalized_input, model, engine, storage_path, format, duration_ms, sample_rate, seed, byte_size) "
        f"values ('{lang}','{safe}','{mapped}','{MODEL}','mms-tts','{rel}','mp3',{dur},16000,1234,{len(buf)}) "
        "on conflict (language_code, text, model) do nothing"
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="kuku_yalanji")
    ap.add_argument("--examples", action="store_true", help="also render usage examples")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    lid = psql(f"select id from languages where code='{args.lang}'")[0]
    items: list[str] = [r for r in psql(f"select word from words where language_id='{lid}' order by word")]
    if args.examples:
        items += [r for r in psql(f"select e.example_text from usage_examples e join words w on w.id=e.word_id where w.language_id='{lid}'")]
    if args.limit:
        items = items[: args.limit]

    print(f"pre-rendering {len(items)} items for {args.lang} -> {TTS_DIR}")
    done = skipped = failed = 0
    t0 = time.time()
    for i, text in enumerate(items):
        text = text.strip()
        if not text:
            continue
        if already(args.lang, text):
            skipped += 1
            continue
        buf, headers = synth(text)
        if not buf:
            failed += 1
            continue
        store(args.lang, text, buf, headers)
        done += 1
        if done % 25 == 0:
            print(f"  {i+1}/{len(items)}  done={done} skipped={skipped} failed={failed}  ({done/(time.time()-t0):.1f}/s)")
    print(f"DONE: {done} generated, {skipped} already stored, {failed} failed in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()

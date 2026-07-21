from __future__ import annotations

import argparse
import base64
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import urlparse

import httpx

from asr_benchmark import BenchmarkError, read_jsonl, validate_manifest


TRANSIENT_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}


def _read_audio(dataset_root: Path, relative_path: str) -> bytes:
    root = dataset_root.resolve()
    path = (root / relative_path).resolve()
    if not path.is_relative_to(root):
        raise BenchmarkError(f"audio path escapes dataset root: {relative_path}")
    return path.read_bytes()


def _parse_output(payload: object, provider: str) -> dict[str, Any]:
    if provider == "runpod":
        if not isinstance(payload, dict) or payload.get("status") != "COMPLETED":
            raise BenchmarkError("RunPod job did not complete")
        payload = payload.get("output")
    if not isinstance(payload, dict):
        raise BenchmarkError("ASR provider returned a non-object result")
    if payload.get("success") is not True:
        message = payload.get("error")
        raise BenchmarkError(message if isinstance(message, str) else "ASR provider failed")
    transcript = payload.get("transcript")
    model = payload.get("model")
    decoder = payload.get("decoder")
    if not isinstance(transcript, str) or not isinstance(model, str):
        raise BenchmarkError("ASR provider omitted transcript or model identity")
    if not isinstance(decoder, dict) or not isinstance(decoder.get("beamSize"), int):
        raise BenchmarkError("ASR provider omitted decoder identity")
    return payload


def _request_once(
    client: httpx.Client,
    *,
    provider: str,
    endpoint: str,
    token: str,
    target_audio: bytes,
    contexts: Sequence[tuple[bytes, str]],
    timeout_seconds: float,
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {token}"}
    if provider == "direct":
        files: list[tuple[str, tuple[str, bytes, str]]] = [
            ("target", ("target.wav", target_audio, "audio/wav"))
        ]
        files.extend(
            (
                "context_audio",
                (f"voice-example-{index}.wav", audio, "audio/wav"),
            )
            for index, (audio, _) in enumerate(contexts, start=1)
        )
        data = [("context_text", text) for _, text in contexts]
        response = client.post(endpoint, headers=headers, files=files, data=data)
    else:
        response = client.post(
            endpoint,
            headers=headers,
            json={
                "input": {
                    "targetWavBase64": base64.b64encode(target_audio).decode("ascii"),
                    "contexts": [
                        {
                            "wavBase64": base64.b64encode(audio).decode("ascii"),
                            "text": text,
                        }
                        for audio, text in contexts
                    ],
                },
                "policy": {
                    "executionTimeout": round(timeout_seconds * 1_000),
                    "ttl": round((timeout_seconds + 120) * 1_000),
                },
            },
        )
    if response.status_code in TRANSIENT_STATUS_CODES:
        raise httpx.HTTPStatusError(
            "transient provider response",
            request=response.request,
            response=response,
        )
    response.raise_for_status()
    try:
        payload = response.json()
    except json.JSONDecodeError as error:
        raise BenchmarkError("ASR provider returned invalid JSON") from error
    return _parse_output(payload, provider)


def transcribe_with_retries(
    client: httpx.Client,
    *,
    provider: str,
    endpoint: str,
    token: str,
    target_audio: bytes,
    contexts: Sequence[tuple[bytes, str]],
    timeout_seconds: float,
    attempts: int,
) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return _request_once(
                client,
                provider=provider,
                endpoint=endpoint,
                token=token,
                target_audio=target_audio,
                contexts=contexts,
                timeout_seconds=timeout_seconds,
            )
        except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as error:
            last_error = error
            if attempt == attempts:
                break
            time.sleep(min(30, 2 ** (attempt - 1)))
    raise BenchmarkError(f"ASR provider failed after {attempts} attempts: {last_error}")


def _existing_prediction_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {
        row["id"]
        for row in read_jsonl(path)
        if isinstance(row.get("id"), str)
    }


def _validate_endpoint(endpoint: str) -> None:
    parsed = urlparse(endpoint)
    if parsed.scheme == "https":
        return
    if parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}:
        return
    raise BenchmarkError("benchmark endpoints must use HTTPS unless they are local")


def run(
    *,
    manifest_rows: Sequence[dict[str, Any]],
    dataset_root: Path,
    output_path: Path,
    provider: str,
    endpoint: str,
    token: str,
    model_hash: str,
    expected_model: str,
    expected_beam_size: int,
    timeout_seconds: float,
    attempts: int,
    dry_run: bool,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    validation = validate_manifest(
        manifest_rows,
        purpose="evaluation",
        execution="hosted",
        dataset_root=dataset_root,
        contexts_per_target=10,
    )
    targets = [row for row in manifest_rows if row.get("role") == "target"]
    by_id = {row["id"]: row for row in manifest_rows}
    completed = _existing_prediction_ids(output_path)
    pending = [row for row in targets if row["id"] not in completed]
    if dry_run:
        return {
            "validation": validation,
            "targets": len(targets),
            "already_completed": len(completed & {row["id"] for row in targets}),
            "pending": len(pending),
            "network_requests": 0,
        }

    _validate_endpoint(endpoint)
    if not token:
        raise BenchmarkError("provider token is missing")
    if not model_hash.startswith("sha256:"):
        raise BenchmarkError("model_hash must be an immutable sha256 identity")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    owns_client = client is None
    if client is None:
        client = httpx.Client(
            timeout=httpx.Timeout(timeout_seconds + 30),
            headers={"User-Agent": "MobTranslate-ASR-Benchmark/1"},
        )
    try:
        with output_path.open("a", encoding="utf-8", buffering=1) as output:
            for target in pending:
                contexts = [
                    (
                        _read_audio(dataset_root, by_id[context_id]["audio_path"]),
                        by_id[context_id]["reference"],
                    )
                    for context_id in target["context_ids"]
                ]
                started = time.perf_counter()
                result = transcribe_with_retries(
                    client,
                    provider=provider,
                    endpoint=endpoint,
                    token=token,
                    target_audio=_read_audio(dataset_root, target["audio_path"]),
                    contexts=contexts,
                    timeout_seconds=timeout_seconds,
                    attempts=attempts,
                )
                beam_size = result["decoder"]["beamSize"]
                if result["model"] != expected_model or beam_size != expected_beam_size:
                    raise BenchmarkError(
                        "provider model/decoder identity does not match the frozen benchmark contract"
                    )
                prediction = {
                    "id": target["id"],
                    "prediction": result["transcript"],
                    "model_id": result["model"],
                    "model_hash": model_hash,
                    "decoder_policy": f"beam={beam_size},length_norm=false",
                    "generated_at": datetime.now(UTC).isoformat(),
                    "request_seconds": round(time.perf_counter() - started, 3),
                    "provider_timing": result.get("timing"),
                }
                output.write(json.dumps(prediction, ensure_ascii=False, sort_keys=True) + "\n")
                output.flush()
                os.fsync(output.fileno())
    finally:
        if owns_client:
            client.close()

    return {
        "validation": validation,
        "targets": len(targets),
        "already_completed": len(completed & {row["id"] for row in targets}),
        "completed_now": len(pending),
        "output": str(output_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run a rights-gated, resumable same-speaker ASR benchmark."
    )
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provider", choices=["direct", "runpod"], default="runpod")
    parser.add_argument("--endpoint")
    parser.add_argument("--token-env", default="RUNPOD_API_KEY")
    parser.add_argument("--model-hash", default="")
    parser.add_argument("--expected-model", default="omniASR_LLM_7B_ZS")
    parser.add_argument("--expected-beam-size", type=int, default=5)
    parser.add_argument("--timeout-seconds", type=float, default=300)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    endpoint = args.endpoint
    if not endpoint and args.provider == "runpod":
        endpoint_id = os.getenv("MOBTRANSLATE_KUKU_ASR_RUNPOD_ENDPOINT_ID", "").strip()
        if endpoint_id:
            endpoint = (
                f"https://api.runpod.ai/v2/{endpoint_id}/runsync"
                f"?wait={round(args.timeout_seconds * 1_000)}"
            )
    if not endpoint and not args.dry_run:
        parser.error("--endpoint or MOBTRANSLATE_KUKU_ASR_RUNPOD_ENDPOINT_ID is required")

    try:
        result = run(
            manifest_rows=read_jsonl(args.manifest),
            dataset_root=args.dataset_root,
            output_path=args.output,
            provider=args.provider,
            endpoint=endpoint or "https://dry-run.invalid",
            token=os.getenv(args.token_env, ""),
            model_hash=args.model_hash,
            expected_model=args.expected_model,
            expected_beam_size=args.expected_beam_size,
            timeout_seconds=args.timeout_seconds,
            attempts=args.attempts,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except BenchmarkError as error:
        parser.exit(2, f"error: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import resource
import sys
import time
import unicodedata
import wave
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Sequence


def normalize_transcript(value: str) -> str:
    value = unicodedata.normalize("NFC", value).casefold()
    return " ".join(value.split())


def edit_distance(reference: Sequence[str], prediction: Sequence[str]) -> int:
    previous = list(range(len(prediction) + 1))
    for row, reference_item in enumerate(reference, start=1):
        current = [row]
        for column, prediction_item in enumerate(prediction, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[column] + 1,
                    previous[column - 1] + (reference_item != prediction_item),
                )
            )
        previous = current
    return previous[-1]


def error_rate(reference: Sequence[str], prediction: Sequence[str]) -> float:
    if not reference:
        return 0.0 if not prediction else 1.0
    return edit_distance(reference, prediction) / len(reference)


def read_cases(path: Path) -> list[dict[str, str]]:
    cases: list[dict[str, str]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: expected an object")
            case_id = row.get("id")
            audio_path = row.get("audio_path")
            reference = row.get("reference")
            if not all(
                isinstance(value, str) and value.strip()
                for value in (case_id, audio_path, reference)
            ):
                raise ValueError(
                    f"{path}:{line_number}: id, audio_path, and reference must be non-empty strings"
                )
            cases.append(
                {
                    "id": case_id.strip(),
                    "audio_path": audio_path.strip(),
                    "reference": reference.strip(),
                }
            )
    if not cases:
        raise ValueError(f"{path}: no cases")
    if len({case["id"] for case in cases}) != len(cases):
        raise ValueError(f"{path}: duplicate case id")
    return cases


def wav_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as recording:
        return recording.getnframes() / recording.getframerate()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def max_rss_mib() -> float:
    # Linux reports ru_maxrss in KiB.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def run(
    *,
    model_card: str,
    cases_path: Path,
    audio_root: Path,
    output_path: Path,
    threads: int,
) -> dict[str, Any]:
    import psutil
    import torch
    import torchaudio
    from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline

    if threads < 1:
        raise ValueError("threads must be positive")
    torch.set_num_threads(threads)
    torch.set_num_interop_threads(1)

    cases = read_cases(cases_path)
    root = audio_root.resolve()
    prepared: list[tuple[dict[str, str], Path]] = []
    for case in cases:
        path = (root / case["audio_path"]).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError(
                f"{case['id']}: audio path is missing or escapes the audio root"
            )
        prepared.append((case, path))

    process = psutil.Process()
    started_at = datetime.now(UTC)
    load_started = time.perf_counter()
    pipeline = ASRInferencePipeline(
        model_card=model_card,
        device="cpu",
        dtype=torch.float32,
    )
    load_seconds = time.perf_counter() - load_started

    predictions: list[dict[str, Any]] = []
    for case, path in prepared:
        inference_started = time.perf_counter()
        output = pipeline.transcribe([path], batch_size=1)
        inference_seconds = time.perf_counter() - inference_started
        prediction = normalize_transcript(output[0] if output else "")
        reference = normalize_transcript(case["reference"])
        predictions.append(
            {
                "id": case["id"],
                "audio_path": case["audio_path"],
                "audio_seconds": round(wav_seconds(path), 6),
                "audio_sha256": sha256_file(path),
                "reference": reference,
                "prediction": prediction,
                "exact": prediction == reference,
                "character_error_rate": round(
                    error_rate(list(reference), list(prediction)), 6
                ),
                "word_error_rate": round(
                    error_rate(reference.split(), prediction.split()),
                    6,
                ),
                "inference_seconds": round(inference_seconds, 6),
                "real_time_factor": round(inference_seconds / wav_seconds(path), 6),
                "rss_mib_after": round(process.memory_info().rss / 2**20, 3),
                "max_rss_mib_after": round(max_rss_mib(), 3),
            }
        )
        print(
            json.dumps(
                {
                    "id": case["id"],
                    "prediction": prediction,
                    "inference_seconds": round(inference_seconds, 6),
                    "max_rss_mib": round(max_rss_mib(), 3),
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            file=sys.stderr,
            flush=True,
        )

    result = {
        "schema_version": 1,
        "scientific_scope": "synthetic transport probe; not natural Kuku Yalanji evidence",
        "model_card": model_card,
        "device": "cpu",
        "dtype": "float32",
        "threads": threads,
        "started_at": started_at.isoformat(),
        "completed_at": datetime.now(UTC).isoformat(),
        "load_seconds": round(load_seconds, 6),
        "max_rss_mib": round(max_rss_mib(), 3),
        "versions": {
            "python": platform.python_version(),
            "omnilingual_asr": importlib.metadata.version("omnilingual-asr"),
            "fairseq2": importlib.metadata.version("fairseq2"),
            "fairseq2n": importlib.metadata.version("fairseq2n"),
            "torch": torch.__version__,
            "torchaudio": torchaudio.__version__,
        },
        "host": {
            "machine": platform.machine(),
            "processor": platform.processor(),
            "logical_cpu_count": psutil.cpu_count(logical=True),
        },
        "summary": {
            "cases": len(predictions),
            "exact": sum(row["exact"] for row in predictions),
            "macro_character_error_rate": round(
                sum(row["character_error_rate"] for row in predictions)
                / len(predictions),
                6,
            ),
            "macro_word_error_rate": round(
                sum(row["word_error_rate"] for row in predictions) / len(predictions),
                6,
            ),
            "total_audio_seconds": round(
                sum(row["audio_seconds"] for row in predictions), 6
            ),
            "total_inference_seconds": round(
                sum(row["inference_seconds"] for row in predictions),
                6,
            ),
        },
        "predictions": predictions,
    }
    atomic_json(output_path, result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run a bounded local Omnilingual ASR transport probe."
    )
    parser.add_argument("--model-card", default="omniASR_CTC_300M")
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=min(4, os.cpu_count() or 1))
    args = parser.parse_args()
    try:
        result = run(
            model_card=args.model_card,
            cases_path=args.cases,
            audio_root=args.audio_root,
            output_path=args.output,
            threads=args.threads,
        )
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))
    print(json.dumps(result["summary"], sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from asr_benchmark import BenchmarkError, normalize_transcript, read_jsonl


UPSTREAM_COMMIT = "81f51e224ce9e74b02cc2a3eaf21b2d91d743455"
UPSTREAM_RECOMMENDED_CONFIG_SHA256 = (
    "974f146259e1223a1359fcca09259bbf6a764b1874e80cc9a655d545614c0602"
)
LANGUAGE_INPUT = "gvn"
LANGUAGE_OUTPUT = "gvn_Latn"
CORPUS = "mobtranslate_kuku_yalanji_v1"
SPLIT_NAMES = {"train": "train", "development": "dev", "test": "test"}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_split_map(path: Path) -> dict[str, str]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BenchmarkError(f"could not read split map {path}: {error}") from error
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise BenchmarkError("split map must be an object with schema_version=1")
    speakers = value.get("speakers")
    if not isinstance(speakers, dict) or not speakers:
        raise BenchmarkError("split map speakers must be a non-empty object")
    result: dict[str, str] = {}
    for speaker, split in speakers.items():
        if not isinstance(speaker, str) or not speaker:
            raise BenchmarkError("split map speaker ids must be non-empty strings")
        if split not in SPLIT_NAMES:
            raise BenchmarkError(f"{speaker}: unsupported split {split!r}")
        result[speaker] = str(split)
    return result


def _resolve_audio(storage_root: Path, raw_path: object, row_id: str) -> Path:
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise BenchmarkError(f"{row_id}: audio_path is required")
    relative = Path(raw_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise BenchmarkError(f"{row_id}: audio_path must stay under the storage root")
    root = storage_root.resolve()
    resolved = (root / relative).resolve()
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise BenchmarkError(f"{row_id}: audio file is missing or outside the storage root")
    return resolved


def validate_training_inventory(
    rows: Sequence[dict[str, Any]],
    split_by_speaker: dict[str, str],
    *,
    storage_root: Path,
    execution: str,
    minimum_train_speakers: int,
    minimum_development_speakers: int,
    minimum_test_speakers: int,
) -> list[dict[str, Any]]:
    if execution not in {"local", "hosted"}:
        raise BenchmarkError("execution must be local or hosted")

    errors: list[str] = []
    prepared: list[dict[str, Any]] = []
    ids: set[str] = set()
    speakers: set[str] = set()
    speakers_by_split: dict[str, set[str]] = defaultdict(set)
    sessions_by_split: dict[str, set[str]] = defaultdict(set)
    prompts_by_split: dict[str, set[str]] = defaultdict(set)
    references_by_split: dict[str, set[str]] = defaultdict(set)

    for index, row in enumerate(rows, start=1):
        row_id = row.get("id")
        if not isinstance(row_id, str) or not row_id:
            errors.append(f"row {index}: id is required")
            continue
        if row_id in ids:
            errors.append(f"{row_id}: duplicate id")
        ids.add(row_id)

        speaker = row.get("speaker_id")
        session = row.get("session_id")
        prompt = row.get("prompt_id")
        reference = row.get("reference")
        if not isinstance(speaker, str) or not speaker:
            errors.append(f"{row_id}: speaker_id is required")
            continue
        speakers.add(speaker)
        split = split_by_speaker.get(speaker)
        if split is None:
            errors.append(f"{row_id}: speaker is absent from the frozen split map")
            continue
        if not isinstance(session, str) or not session:
            errors.append(f"{row_id}: session_id is required")
        if not isinstance(prompt, str) or not prompt:
            errors.append(f"{row_id}: prompt_id is required")
        if not isinstance(reference, str) or not normalize_transcript(reference):
            errors.append(f"{row_id}: reference transcript is required")
        if row.get("language_code") != LANGUAGE_INPUT:
            errors.append(f"{row_id}: language_code must be {LANGUAGE_INPUT}")
        if row.get("transcript_status") != "adjudicated":
            errors.append(f"{row_id}: an independently adjudicated transcript is required")
        reviewers = row.get("transcriber_ids")
        if (
            not isinstance(reviewers, list)
            or not all(isinstance(reviewer, str) and reviewer.strip() for reviewer in reviewers)
            or len(set(reviewers)) < 2
        ):
            errors.append(f"{row_id}: two distinct transcript reviewers are required")

        rights = row.get("rights")
        if not isinstance(rights, dict):
            errors.append(f"{row_id}: explicit speech rights are required")
        else:
            if not isinstance(rights.get("consent_record_id"), str) or not rights[
                "consent_record_id"
            ].strip():
                errors.append(f"{row_id}.rights: consent_record_id is required")
            required_rights = ["evaluation_allowed", "training_allowed"]
            if execution == "hosted":
                required_rights.append("provider_transfer_allowed")
            for field in required_rights:
                if rights.get(field) is not True:
                    errors.append(f"{row_id}.rights: {field}=true is required")
            for field in (
                "public_audio_allowed",
                "public_transcript_allowed",
                "derived_weights_allowed",
                "weight_distribution_allowed",
                "commercial_use_allowed",
            ):
                if not isinstance(rights.get(field), bool):
                    errors.append(f"{row_id}.rights: {field} must be explicit")

        try:
            audio_source = _resolve_audio(storage_root, row.get("audio_path"), row_id)
        except BenchmarkError as error:
            errors.append(str(error))
            continue

        speakers_by_split[split].add(speaker)
        if isinstance(session, str) and session:
            sessions_by_split[split].add(session)
        if isinstance(prompt, str) and prompt:
            prompts_by_split[split].add(prompt)
        if isinstance(reference, str) and normalize_transcript(reference):
            references_by_split[split].add(normalize_transcript(reference))
        prepared.append({**row, "split": split, "audio_source": audio_source})

    extra_speakers = set(split_by_speaker) - speakers
    if extra_speakers:
        errors.append(f"split map speakers without authorized clips: {sorted(extra_speakers)}")

    minimums = {
        "train": minimum_train_speakers,
        "development": minimum_development_speakers,
        "test": minimum_test_speakers,
    }
    for split, minimum in minimums.items():
        count = len(speakers_by_split.get(split, set()))
        if count < minimum:
            errors.append(f"{split}: requires at least {minimum} speakers; found {count}")

    split_names = sorted(SPLIT_NAMES)
    for left_index, left in enumerate(split_names):
        for right in split_names[left_index + 1 :]:
            for label, groups in (
                ("speaker", speakers_by_split),
                ("session", sessions_by_split),
                ("prompt", prompts_by_split),
                ("normalized transcript", references_by_split),
            ):
                overlap = groups.get(left, set()) & groups.get(right, set())
                if overlap:
                    errors.append(
                        f"{label} leakage between {left} and {right}: {sorted(overlap)[:10]}"
                    )

    if errors:
        raise BenchmarkError("CTC training inventory failed:\n- " + "\n- ".join(errors))
    return sorted(prepared, key=lambda row: (str(row["split"]), str(row["id"])))


def _encode_flac(source: Path, temporary: Path) -> tuple[bytes, int]:
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-i",
            str(source),
            "-map_metadata",
            "-1",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "flac",
            str(temporary),
        ],
        check=True,
    )
    decoded = subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-i",
            str(temporary),
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "-",
        ],
        check=True,
        stdout=subprocess.PIPE,
    ).stdout
    if not decoded or len(decoded) % 2:
        raise BenchmarkError(f"ffmpeg produced invalid PCM for {source}")
    audio_size = len(decoded) // 2
    if not 4_000 <= audio_size <= 960_000:
        raise BenchmarkError(f"{source}: decoded audio must be between 0.25 and 60 seconds")
    return temporary.read_bytes(), audio_size


def _signed_bytes(value: bytes) -> list[int]:
    return [byte if byte < 128 else byte - 256 for byte in value]


def build_dataset(
    rows: Sequence[dict[str, Any]],
    *,
    inventory_path: Path,
    split_map_path: Path,
    output: Path,
) -> dict[str, Any]:
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as error:
        raise BenchmarkError(
            "pyarrow is required; install requirements-dataset.lock in a dedicated environment"
        ) from error

    if output.exists():
        raise BenchmarkError(f"output already exists: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent))
    os.chmod(staging, 0o700)

    schema = pa.schema(
        [
            ("text", pa.string()),
            ("audio_bytes", pa.list_(pa.int8())),
            ("audio_size", pa.int64()),
        ]
    )
    parquet_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    provenance_rows: list[dict[str, Any]] = []
    total_samples = 0

    try:
        with tempfile.TemporaryDirectory(prefix="mobtranslate-flac-", dir=staging) as temp_dir:
            temp_root = Path(temp_dir)
            for index, row in enumerate(rows):
                flac_bytes, audio_size = _encode_flac(
                    Path(row["audio_source"]), temp_root / f"{index:08d}.flac"
                )
                official_split = SPLIT_NAMES[str(row["split"])]
                reference = unicodedata.normalize("NFC", str(row["reference"]).strip())
                parquet_rows[official_split].append(
                    {
                        "text": reference,
                        "audio_bytes": _signed_bytes(flac_bytes),
                        "audio_size": audio_size,
                    }
                )
                total_samples += audio_size
                provenance_rows.append(
                    {
                        "id": row["id"],
                        "split": official_split,
                        "speaker_id": row["speaker_id"],
                        "session_id": row["session_id"],
                        "prompt_id": row["prompt_id"],
                        "consent_record_id": row["rights"]["consent_record_id"],
                        "audio_sha256": hashlib.sha256(flac_bytes).hexdigest(),
                        "reference_sha256": hashlib.sha256(reference.encode("utf-8")).hexdigest(),
                        "audio_size": audio_size,
                    }
                )

        dataset_root = staging / "version=0"
        for split, split_rows in sorted(parquet_rows.items()):
            partition = dataset_root / f"corpus={CORPUS}" / f"split={split}" / f"language={LANGUAGE_OUTPUT}"
            partition.mkdir(parents=True, exist_ok=True)
            table = pa.Table.from_pylist(split_rows, schema=schema)
            pq.write_table(
                table,
                partition / "part-00000.parquet",
                row_group_size=100,
                compression="zstd",
            )

        hours = total_samples / 16_000 / 3600
        stats_path = staging / "language_distribution_0.tsv"
        stats_path.write_text(
            f"corpus\tlanguage\thours\n{CORPUS}\t{LANGUAGE_OUTPUT}\t{hours:.12f}\n",
            encoding="utf-8",
        )
        file_hashes = {
            str(path.relative_to(staging)): _sha256(path)
            for path in sorted(staging.rglob("*"))
            if path.is_file()
        }
        manifest = {
            "schema_version": 1,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "language": LANGUAGE_OUTPUT,
            "corpus": CORPUS,
            "rows": len(rows),
            "rows_by_split": {
                split: len(values) for split, values in sorted(parquet_rows.items())
            },
            "hours": hours,
            "audio_contract": "FLAC, 16000 Hz, mono; audio_size is decoded sample count",
            "upstream": {
                "repository": "https://github.com/facebookresearch/omnilingual-asr",
                "commit": UPSTREAM_COMMIT,
                "recommended_config_sha256": UPSTREAM_RECOMMENDED_CONFIG_SHA256,
            },
            "inventory_sha256": _sha256(inventory_path),
            "split_map_sha256": _sha256(split_map_path),
            "files": file_hashes,
            "source_rows": provenance_rows,
        }
        (staging / "dataset-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        for path in staging.rglob("*"):
            if path.is_file():
                path.chmod(0o600)
            elif path.is_dir():
                path.chmod(0o700)
        staging.rename(output)
        return manifest
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def main() -> int:
    os.umask(0o077)
    parser = argparse.ArgumentParser(
        description="Build the governed, leakage-checked Omnilingual CTC parquet dataset."
    )
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--split-map", type=Path, required=True)
    parser.add_argument("--storage-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--execution", choices=["local", "hosted"], default="hosted")
    parser.add_argument("--minimum-train-speakers", type=int, default=5)
    parser.add_argument("--minimum-development-speakers", type=int, default=5)
    parser.add_argument("--minimum-test-speakers", type=int, default=5)
    args = parser.parse_args()

    try:
        rows = read_jsonl(args.inventory)
        prepared = validate_training_inventory(
            rows,
            _read_split_map(args.split_map),
            storage_root=args.storage_root,
            execution=args.execution,
            minimum_train_speakers=args.minimum_train_speakers,
            minimum_development_speakers=args.minimum_development_speakers,
            minimum_test_speakers=args.minimum_test_speakers,
        )
        manifest = build_dataset(
            prepared,
            inventory_path=args.inventory,
            split_map_path=args.split_map,
            output=args.output,
        )
    except (BenchmarkError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(2, f"error: {error}\n")
    print(json.dumps({key: manifest[key] for key in ("rows", "rows_by_split", "hours")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

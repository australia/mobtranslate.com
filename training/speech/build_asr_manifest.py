from __future__ import annotations

import argparse
import hashlib
import json
import math
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Sequence

from asr_benchmark import BenchmarkError, read_jsonl, validate_manifest


VALID_SPLITS = {"train", "development", "test"}


def _normalized_features(value: str) -> frozenset[str]:
    normalized = " ".join(unicodedata.normalize("NFC", value).casefold().split())
    compact = normalized.replace(" ", "_")
    features = set(compact)
    features.update(compact[index : index + 2] for index in range(len(compact) - 1))
    return frozenset(feature for feature in features if feature.strip())


def _select_contexts(rows: Sequence[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    feature_frequency = Counter(
        feature for row in rows for feature in _normalized_features(str(row["reference"]))
    )
    selected: list[dict[str, Any]] = []
    covered: set[str] = set()
    remaining = sorted(rows, key=lambda row: str(row["id"]))

    while len(selected) < count:
        if not remaining:
            raise BenchmarkError(f"could only select {len(selected)} of {count} context rows")

        def score(row: dict[str, Any]) -> tuple[float, int, str]:
            features = _normalized_features(str(row["reference"]))
            gain = sum(
                1 / math.sqrt(max(1, feature_frequency[feature]))
                for feature in features - covered
            )
            word_count = max(1, len(str(row["reference"]).split()))
            return gain / math.sqrt(word_count), -word_count, str(row["id"])

        chosen = max(remaining, key=score)
        selected.append(chosen)
        covered.update(_normalized_features(str(chosen["reference"])))
        remaining.remove(chosen)
    return selected


def _read_split_map(path: Path) -> dict[str, str]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BenchmarkError(f"could not read split map {path}: {error}") from error
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise BenchmarkError("split map must be an object with schema_version=1")
    raw = payload.get("speakers")
    if not isinstance(raw, dict) or not raw:
        raise BenchmarkError("split map speakers must be a non-empty object")
    result: dict[str, str] = {}
    for speaker, split in raw.items():
        if not isinstance(speaker, str) or not speaker:
            raise BenchmarkError("split map speaker ids must be non-empty strings")
        if split not in VALID_SPLITS:
            raise BenchmarkError(f"{speaker}: split must be one of {sorted(VALID_SPLITS)}")
        result[speaker] = split
    return result


def build_manifest(
    inventory_rows: Sequence[dict[str, Any]],
    split_by_speaker: dict[str, str],
    *,
    contexts_per_speaker: int = 10,
    purpose: str = "evaluation",
    execution: str = "local",
    promotion: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if contexts_per_speaker < 1:
        raise BenchmarkError("contexts_per_speaker must be positive")

    by_speaker: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen_ids: set[str] = set()
    language_codes: set[str] = set()
    errors: list[str] = []
    for index, row in enumerate(inventory_rows, start=1):
        row_id = row.get("id")
        speaker_id = row.get("speaker_id")
        language_code = row.get("language_code")
        if not isinstance(row_id, str) or not row_id:
            errors.append(f"inventory row {index}: id is required")
            continue
        if row_id in seen_ids:
            errors.append(f"duplicate inventory id: {row_id}")
        seen_ids.add(row_id)
        if not isinstance(speaker_id, str) or not speaker_id:
            errors.append(f"{row_id}: speaker_id is required")
            continue
        if not isinstance(language_code, str) or not language_code:
            errors.append(f"{row_id}: language_code is required")
        else:
            language_codes.add(language_code)
        for field in (
            "audio_path",
            "prompt_id",
            "reference",
            "session_id",
            "variety",
            "condition",
            "prompt_type",
            "orthography_version",
            "transcript_status",
        ):
            if not isinstance(row.get(field), str) or not str(row[field]).strip():
                errors.append(f"{row_id}: {field} is required")
        if not isinstance(row.get("transcriber_ids"), list) or not row["transcriber_ids"]:
            errors.append(f"{row_id}: transcriber_ids must be a non-empty list")
        if not isinstance(row.get("rights"), dict):
            errors.append(f"{row_id}: rights must be an object")
        by_speaker[speaker_id].append(dict(row))

    if len(language_codes) != 1:
        errors.append("inventory must contain exactly one language code")
    inventory_speakers = set(by_speaker)
    mapped_speakers = set(split_by_speaker)
    if inventory_speakers - mapped_speakers:
        errors.append(
            f"unmapped inventory speakers: {sorted(inventory_speakers - mapped_speakers)}"
        )
    if mapped_speakers - inventory_speakers:
        errors.append(f"split map has no inventory rows: {sorted(mapped_speakers - inventory_speakers)}")
    if errors:
        raise BenchmarkError("ASR inventory validation failed:\n- " + "\n- ".join(errors))

    output: list[dict[str, Any]] = []
    context_selection: dict[str, list[str]] = {}
    for speaker_id in sorted(by_speaker):
        rows = by_speaker[speaker_id]
        if len(rows) <= contexts_per_speaker:
            raise BenchmarkError(
                f"{speaker_id}: needs at least {contexts_per_speaker + 1} clips; has {len(rows)}"
            )
        contexts = _select_contexts(rows, contexts_per_speaker)
        context_ids = [str(row["id"]) for row in contexts]
        context_id_set = set(context_ids)
        context_selection[speaker_id] = context_ids
        split = split_by_speaker[speaker_id]

        for row in rows:
            manifest_row = {
                key: row[key]
                for key in (
                    "schema_version",
                    "language_code",
                    "id",
                    "audio_path",
                    "prompt_id",
                    "corpus_sentence_id",
                    "reference",
                    "speaker_id",
                    "session_id",
                    "variety",
                    "condition",
                    "prompt_type",
                    "orthography_version",
                    "transcript_status",
                    "transcriber_ids",
                    "rights",
                )
            }
            manifest_row["split"] = split
            manifest_row["role"] = "context" if row["id"] in context_id_set else "target"
            if manifest_row["role"] == "target":
                manifest_row["context_ids"] = context_ids
            output.append(manifest_row)

    output.sort(key=lambda row: (str(row["split"]), str(row["speaker_id"]), str(row["id"])))
    validation = validate_manifest(
        output,
        purpose=purpose,
        execution=execution,
        contexts_per_target=contexts_per_speaker,
        promotion=promotion,
    )
    digest = hashlib.sha256(
        "".join(
            json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
            for row in output
        ).encode("utf-8")
    ).hexdigest()
    summary = {
        **validation,
        "manifest_sha256": digest,
        "selection_method": "deterministic greedy Unicode character/bigram coverage",
        "contexts_per_speaker": contexts_per_speaker,
        "context_ids_by_speaker": context_selection,
    }
    return output, summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build a governed, speaker/session-disjoint ASR manifest from an authorized inventory."
    )
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--split-map", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--contexts-per-speaker", type=int, default=10)
    parser.add_argument(
        "--purpose",
        choices=["evaluation", "training", "publish_dataset", "release_weights"],
        default="evaluation",
    )
    parser.add_argument("--execution", choices=["local", "hosted"], default="local")
    parser.add_argument("--promotion", action="store_true")
    args = parser.parse_args()

    try:
        rows, summary = build_manifest(
            read_jsonl(args.inventory),
            _read_split_map(args.split_map),
            contexts_per_speaker=args.contexts_per_speaker,
            purpose=args.purpose,
            execution=args.execution,
            promotion=args.promotion,
        )
    except BenchmarkError as error:
        parser.exit(2, f"error: {error}\n")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

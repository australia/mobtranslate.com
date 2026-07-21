from __future__ import annotations

import argparse
import json
import random
import unicodedata
import wave
from collections import defaultdict
from pathlib import Path
from typing import Any, Sequence

import jiwer
import regex


SCHEMA_VERSION = 1
VALID_ROLES = {"context", "target"}
VALID_SPLITS = {"train", "development", "test"}
VALID_TRANSCRIPT_STATUSES = {"draft", "single_review", "adjudicated"}
RIGHTS_FIELDS = {
    "evaluation_allowed",
    "training_allowed",
    "provider_transfer_allowed",
    "public_audio_allowed",
    "public_transcript_allowed",
    "derived_weights_allowed",
    "commercial_use_allowed",
}


class BenchmarkError(ValueError):
    pass


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise BenchmarkError(f"{path}:{line_number}: invalid JSON: {error}") from error
            if not isinstance(value, dict):
                raise BenchmarkError(f"{path}:{line_number}: each row must be an object")
            rows.append(value)
    if not rows:
        raise BenchmarkError(f"{path}: no rows")
    return rows


def normalize_transcript(value: str) -> str:
    value = unicodedata.normalize("NFC", value).casefold()
    cleaned: list[str] = []
    for index, character in enumerate(value):
        category = unicodedata.category(character)
        if character.isspace():
            cleaned.append(" ")
        elif category.startswith("P"):
            previous_is_letter = index > 0 and value[index - 1].isalpha()
            next_is_letter = index + 1 < len(value) and value[index + 1].isalpha()
            if character in {"-", "'", "’"} and previous_is_letter and next_is_letter:
                cleaned.append("'" if character == "’" else character)
            else:
                cleaned.append(" ")
        elif category.startswith("C"):
            cleaned.append(" ")
        else:
            cleaned.append(character)
    return " ".join("".join(cleaned).split())


def _require_string(row: dict[str, Any], field: str, row_id: str, errors: list[str]) -> str:
    value = row.get(field)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{row_id}: {field} must be a non-empty string")
        return ""
    return value.strip()


def _validate_audio_path(
    row: dict[str, Any],
    row_id: str,
    dataset_root: Path | None,
    errors: list[str],
) -> None:
    raw_path = _require_string(row, "audio_path", row_id, errors)
    if not raw_path:
        return
    relative = Path(raw_path)
    if relative.is_absolute() or ".." in relative.parts:
        errors.append(f"{row_id}: audio_path must stay inside the dataset root")
        return
    if dataset_root is None:
        return
    resolved_root = dataset_root.resolve()
    resolved = (resolved_root / relative).resolve()
    if not resolved.is_relative_to(resolved_root):
        errors.append(f"{row_id}: audio_path escapes the dataset root")
        return
    if not resolved.is_file():
        errors.append(f"{row_id}: audio file does not exist: {raw_path}")
        return
    try:
        with wave.open(str(resolved), "rb") as recording:
            duration = recording.getnframes() / recording.getframerate()
            if recording.getnchannels() not in {1, 2}:
                errors.append(f"{row_id}: WAV must have one or two channels")
            if recording.getsampwidth() not in {1, 2, 3, 4}:
                errors.append(f"{row_id}: WAV sample width is unsupported")
            if not 0.25 <= duration <= 30.0:
                errors.append(f"{row_id}: WAV duration must be between 0.25 and 30 seconds")
    except (wave.Error, EOFError, ZeroDivisionError) as error:
        errors.append(f"{row_id}: invalid PCM WAV: {error}")


def _rights_required(purpose: str, execution: str) -> set[str]:
    required = {"evaluation_allowed"}
    if purpose in {"training", "release_weights"}:
        required.add("training_allowed")
    if purpose == "publish_dataset":
        required.update({"public_audio_allowed", "public_transcript_allowed"})
    if purpose == "release_weights":
        required.update({"derived_weights_allowed", "weight_distribution_allowed"})
    if execution == "hosted":
        required.add("provider_transfer_allowed")
    return required


def validate_manifest(
    rows: Sequence[dict[str, Any]],
    *,
    purpose: str = "evaluation",
    execution: str = "local",
    dataset_root: Path | None = None,
    contexts_per_target: int = 10,
    promotion: bool = False,
) -> dict[str, Any]:
    if purpose not in {"evaluation", "training", "publish_dataset", "release_weights"}:
        raise BenchmarkError(f"unsupported purpose: {purpose}")
    if execution not in {"local", "hosted"}:
        raise BenchmarkError(f"unsupported execution: {execution}")
    if contexts_per_target < 1:
        raise BenchmarkError("contexts_per_target must be positive")

    errors: list[str] = []
    warnings: list[str] = []
    ids: set[str] = set()
    by_id: dict[str, dict[str, Any]] = {}
    language_codes: set[str] = set()
    speakers_by_split: dict[str, set[str]] = defaultdict(set)
    sessions_by_split: dict[str, set[str]] = defaultdict(set)
    prompts_by_split: dict[str, set[str]] = defaultdict(set)
    references_by_split: dict[str, set[str]] = defaultdict(set)
    required_rights = _rights_required(purpose, execution)

    for index, row in enumerate(rows, start=1):
        row_id = _require_string(row, "id", f"row {index}", errors) or f"row {index}"
        if row_id in ids:
            errors.append(f"{row_id}: duplicate id")
        ids.add(row_id)
        by_id[row_id] = row

        if row.get("schema_version") != SCHEMA_VERSION:
            errors.append(f"{row_id}: schema_version must be {SCHEMA_VERSION}")
        role = row.get("role")
        split = row.get("split")
        if role not in VALID_ROLES:
            errors.append(f"{row_id}: role must be one of {sorted(VALID_ROLES)}")
        if split not in VALID_SPLITS:
            errors.append(f"{row_id}: split must be one of {sorted(VALID_SPLITS)}")

        speaker_id = _require_string(row, "speaker_id", row_id, errors)
        session_id = _require_string(row, "session_id", row_id, errors)
        prompt_id = row.get("prompt_id")
        if promotion:
            prompt_id = _require_string(row, "prompt_id", row_id, errors)
        elif prompt_id is not None and (not isinstance(prompt_id, str) or not prompt_id.strip()):
            errors.append(f"{row_id}: prompt_id must be a non-empty string when supplied")
        language_code = _require_string(row, "language_code", row_id, errors)
        if language_code:
            language_codes.add(language_code)
        _require_string(row, "variety", row_id, errors)
        _require_string(row, "condition", row_id, errors)
        _require_string(row, "prompt_type", row_id, errors)
        _require_string(row, "orthography_version", row_id, errors)
        reference = _require_string(row, "reference", row_id, errors)
        if reference and not normalize_transcript(reference):
            errors.append(f"{row_id}: reference is empty after normalization")
        if isinstance(split, str):
            if speaker_id:
                speakers_by_split[split].add(speaker_id)
            if session_id:
                sessions_by_split[split].add(session_id)
            if isinstance(prompt_id, str) and prompt_id.strip():
                prompts_by_split[split].add(prompt_id.strip())
            if reference:
                references_by_split[split].add(normalize_transcript(reference))

        transcript_status = row.get("transcript_status")
        reviewers = row.get("transcriber_ids")
        if transcript_status not in VALID_TRANSCRIPT_STATUSES:
            errors.append(
                f"{row_id}: transcript_status must be one of {sorted(VALID_TRANSCRIPT_STATUSES)}"
            )
        if not isinstance(reviewers, list) or not all(
            isinstance(reviewer, str) and reviewer.strip() for reviewer in reviewers
        ):
            errors.append(f"{row_id}: transcriber_ids must contain pseudonymous reviewer ids")
        if promotion and role == "target" and split in {"development", "test"}:
            if transcript_status != "adjudicated":
                errors.append(f"{row_id}: promotion targets must have adjudicated transcripts")
            if not isinstance(reviewers, list) or len(set(reviewers)) < 2:
                errors.append(f"{row_id}: promotion targets require two independent reviewers")

        rights = row.get("rights")
        if not isinstance(rights, dict):
            errors.append(f"{row_id}: rights must be an object")
        else:
            _require_string(rights, "consent_record_id", f"{row_id}.rights", errors)
            _require_string(rights, "withdrawal_process", f"{row_id}.rights", errors)
            for field in RIGHTS_FIELDS:
                if not isinstance(rights.get(field), bool):
                    errors.append(f"{row_id}.rights: {field} must be explicit true or false")
            for field in required_rights:
                if rights.get(field) is not True:
                    errors.append(
                        f"{row_id}.rights: {field}=true is required for {purpose}/{execution}"
                    )

        _validate_audio_path(row, row_id, dataset_root, errors)

    if len(language_codes) != 1:
        errors.append(
            "each benchmark manifest must contain exactly one language code; "
            f"found {sorted(language_codes)}"
        )

    split_names = sorted(speakers_by_split)
    for left_index, left in enumerate(split_names):
        for right in split_names[left_index + 1 :]:
            shared_speakers = speakers_by_split[left] & speakers_by_split[right]
            shared_sessions = sessions_by_split[left] & sessions_by_split[right]
            shared_prompts = prompts_by_split[left] & prompts_by_split[right]
            shared_references = references_by_split[left] & references_by_split[right]
            if shared_speakers:
                errors.append(
                    f"speaker leakage between {left} and {right}: {sorted(shared_speakers)}"
                )
            if shared_sessions:
                errors.append(
                    f"session leakage between {left} and {right}: {sorted(shared_sessions)}"
                )
            if promotion and shared_prompts:
                errors.append(
                    f"prompt leakage between {left} and {right}: {sorted(shared_prompts)}"
                )
            if promotion and shared_references:
                errors.append(
                    f"transcript leakage between {left} and {right}: "
                    f"{sorted(shared_references)[:10]}"
                )

    target_rows = [row for row in rows if row.get("role") == "target"]
    for target in target_rows:
        target_id = str(target.get("id", "unknown"))
        context_ids = target.get("context_ids")
        if not isinstance(context_ids, list) or len(context_ids) != contexts_per_target:
            errors.append(
                f"{target_id}: context_ids must contain exactly {contexts_per_target} ids"
            )
            continue
        if len(set(context_ids)) != len(context_ids):
            errors.append(f"{target_id}: context_ids must not contain duplicates")
        for context_id in context_ids:
            context = by_id.get(context_id) if isinstance(context_id, str) else None
            if context is None:
                errors.append(f"{target_id}: unknown context id {context_id!r}")
                continue
            if context.get("role") != "context":
                errors.append(f"{target_id}: {context_id} is not a context row")
            if context.get("speaker_id") != target.get("speaker_id"):
                errors.append(f"{target_id}: {context_id} belongs to a different speaker")
            if context.get("split") != target.get("split"):
                errors.append(f"{target_id}: {context_id} belongs to a different split")
            if normalize_transcript(str(context.get("reference", ""))) == normalize_transcript(
                str(target.get("reference", ""))
            ):
                errors.append(f"{target_id}: target transcript duplicates context {context_id}")

    test_speakers = speakers_by_split.get("test", set())
    development_speakers = speakers_by_split.get("development", set())
    if len(test_speakers) < 3:
        warnings.append("fewer than three independent test speakers; no population claim is supportable")
    if len(development_speakers) < 3:
        warnings.append(
            "fewer than three independent development speakers; recipe selection is weakly identified"
        )

    if errors:
        raise BenchmarkError("manifest validation failed:\n- " + "\n- ".join(errors))

    return {
        "schema_version": SCHEMA_VERSION,
        "rows": len(rows),
        "contexts": sum(row.get("role") == "context" for row in rows),
        "targets": len(target_rows),
        "purpose": purpose,
        "execution": execution,
        "language_code": next(iter(language_codes)),
        "speakers_by_split": {
            split: len(speakers) for split, speakers in sorted(speakers_by_split.items())
        },
        "sessions_by_split": {
            split: len(sessions) for split, sessions in sorted(sessions_by_split.items())
        },
        "prompts_by_split": {
            split: len(prompts) for split, prompts in sorted(prompts_by_split.items())
        },
        "warnings": warnings,
    }


def _symbol_metrics(references: Sequence[Sequence[str]], hypotheses: Sequence[Sequence[str]]) -> dict[str, Any]:
    reference_text = [" ".join(symbols) for symbols in references]
    hypothesis_text = [" ".join(symbols) for symbols in hypotheses]
    result = jiwer.process_words(reference_text, hypothesis_text)
    denominator = result.hits + result.substitutions + result.deletions
    return {
        "rate": (result.substitutions + result.deletions + result.insertions) / denominator,
        "hits": result.hits,
        "substitutions": result.substitutions,
        "deletions": result.deletions,
        "insertions": result.insertions,
        "reference_units": denominator,
    }


def _score_items(items: Sequence[dict[str, Any]]) -> dict[str, Any]:
    references = [item["normalized_reference"] for item in items]
    hypotheses = [item["normalized_prediction"] for item in items]
    word_metrics = _symbol_metrics(
        [value.split() for value in references],
        [value.split() for value in hypotheses],
    )
    codepoint_metrics = _symbol_metrics(
        [list(value.replace(" ", "")) for value in references],
        [list(value.replace(" ", "")) for value in hypotheses],
    )
    grapheme_metrics = _symbol_metrics(
        [regex.findall(r"\X", value.replace(" ", "")) for value in references],
        [regex.findall(r"\X", value.replace(" ", "")) for value in hypotheses],
    )
    exact_count = sum(reference == hypothesis for reference, hypothesis in zip(references, hypotheses))
    return {
        "items": len(items),
        "exact_count": exact_count,
        "exact_rate": exact_count / len(items),
        "blank_count": sum(not hypothesis for hypothesis in hypotheses),
        "wer": word_metrics,
        "codepoint_cer": codepoint_metrics,
        "grapheme_cer": grapheme_metrics,
    }


def _percentile(values: Sequence[float], probability: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def _speaker_bootstrap(
    items: Sequence[dict[str, Any]],
    *,
    replicates: int,
    seed: int,
) -> dict[str, Any]:
    by_speaker: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        by_speaker[item["speaker_id"]].append(item)
    speakers = sorted(by_speaker)
    if len(speakers) < 2:
        return {
            "status": "insufficient_clusters",
            "speaker_clusters": len(speakers),
            "replicates": 0,
        }

    rng = random.Random(seed)
    exact_rates: list[float] = []
    word_error_rates: list[float] = []
    grapheme_error_rates: list[float] = []
    for _ in range(replicates):
        sample: list[dict[str, Any]] = []
        for speaker in rng.choices(speakers, k=len(speakers)):
            sample.extend(by_speaker[speaker])
        metrics = _score_items(sample)
        exact_rates.append(metrics["exact_rate"])
        word_error_rates.append(metrics["wer"]["rate"])
        grapheme_error_rates.append(metrics["grapheme_cer"]["rate"])

    def interval(values: Sequence[float]) -> dict[str, float]:
        return {
            "lower_95": _percentile(values, 0.025),
            "upper_95": _percentile(values, 0.975),
        }

    return {
        "status": "ok",
        "speaker_clusters": len(speakers),
        "replicates": replicates,
        "seed": seed,
        "exact_rate": interval(exact_rates),
        "wer": interval(word_error_rates),
        "grapheme_cer": interval(grapheme_error_rates),
    }


def score_predictions(
    manifest_rows: Sequence[dict[str, Any]],
    prediction_rows: Sequence[dict[str, Any]],
    *,
    split: str = "test",
    bootstrap_replicates: int = 2_000,
    bootstrap_seed: int = 17,
) -> dict[str, Any]:
    validate_manifest(
        manifest_rows,
        purpose="evaluation",
        execution="local",
        contexts_per_target=10,
    )
    if bootstrap_replicates < 1:
        raise BenchmarkError("bootstrap_replicates must be positive")
    targets = {
        row["id"]: row
        for row in manifest_rows
        if row.get("role") == "target" and row.get("split") == split
    }
    if not targets:
        raise BenchmarkError(f"manifest has no target rows in split {split!r}")

    predictions: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    identities: set[tuple[str, str, str]] = set()
    for row in prediction_rows:
        row_id = row.get("id")
        prediction = row.get("prediction")
        if not isinstance(row_id, str) or not row_id:
            errors.append("prediction row has no id")
            continue
        if row_id in predictions:
            errors.append(f"duplicate prediction id: {row_id}")
            continue
        if not isinstance(prediction, str):
            errors.append(f"{row_id}: prediction must be a string")
            continue
        model_id = row.get("model_id")
        model_hash = row.get("model_hash")
        decoder_policy = row.get("decoder_policy")
        if not all(isinstance(value, str) and value for value in (model_id, model_hash, decoder_policy)):
            errors.append(
                f"{row_id}: model_id, model_hash, and decoder_policy are required"
            )
        else:
            identities.add((model_id, model_hash, decoder_policy))
        predictions[row_id] = row

    missing = sorted(set(targets) - set(predictions))
    extra = sorted(set(predictions) - set(targets))
    if missing:
        errors.append(f"missing predictions: {missing[:10]}" + (" ..." if len(missing) > 10 else ""))
    if extra:
        errors.append(f"predictions for non-target rows: {extra[:10]}" + (" ..." if len(extra) > 10 else ""))
    if len(identities) != 1:
        errors.append("all predictions must share one immutable model/decoder identity")
    if errors:
        raise BenchmarkError("prediction validation failed:\n- " + "\n- ".join(errors))

    scored_items: list[dict[str, Any]] = []
    for row_id, target in targets.items():
        prediction = predictions[row_id]
        normalized_reference = normalize_transcript(target["reference"])
        normalized_prediction = normalize_transcript(prediction["prediction"])
        item_metrics = _score_items(
            [
                {
                    "normalized_reference": normalized_reference,
                    "normalized_prediction": normalized_prediction,
                }
            ]
        )
        scored_items.append(
            {
                "id": row_id,
                "speaker_id": target["speaker_id"],
                "session_id": target["session_id"],
                "variety": target["variety"],
                "condition": target["condition"],
                "prompt_type": target["prompt_type"],
                "reference": target["reference"],
                "prediction": prediction["prediction"],
                "normalized_reference": normalized_reference,
                "normalized_prediction": normalized_prediction,
                "exact": normalized_reference == normalized_prediction,
                "wer": item_metrics["wer"],
                "codepoint_cer": item_metrics["codepoint_cer"],
                "grapheme_cer": item_metrics["grapheme_cer"],
            }
        )

    grouped: dict[str, dict[str, Any]] = {}
    for field in ("speaker_id", "variety", "condition", "prompt_type"):
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in scored_items:
            groups[item[field]].append(item)
        grouped[field] = {
            name: _score_items(group_items) for name, group_items in sorted(groups.items())
        }

    identity = next(iter(identities))
    return {
        "schema_version": SCHEMA_VERSION,
        "split": split,
        "model": {
            "model_id": identity[0],
            "model_hash": identity[1],
            "decoder_policy": identity[2],
        },
        "normalization": {
            "unicode": "NFC",
            "case": "casefold",
            "punctuation": "strip except word-internal hyphen/apostrophe",
            "whitespace": "collapse",
        },
        "overall": _score_items(scored_items),
        "speaker_cluster_bootstrap": _speaker_bootstrap(
            scored_items,
            replicates=bootstrap_replicates,
            seed=bootstrap_seed,
        ),
        "grouped": grouped,
        "items": scored_items,
    }


def _write_json(path: Path | None, value: dict[str, Any]) -> None:
    payload = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if path is None:
        print(payload, end="")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate and score a governed, speaker-disjoint Kuku Yalanji ASR benchmark."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate")
    validate.add_argument("--manifest", type=Path, required=True)
    validate.add_argument("--dataset-root", type=Path)
    validate.add_argument(
        "--purpose",
        choices=["evaluation", "training", "publish_dataset", "release_weights"],
        default="evaluation",
    )
    validate.add_argument("--execution", choices=["local", "hosted"], default="local")
    validate.add_argument("--contexts-per-target", type=int, default=10)
    validate.add_argument("--promotion", action="store_true")
    validate.add_argument("--output", type=Path)

    score = subparsers.add_parser("score")
    score.add_argument("--manifest", type=Path, required=True)
    score.add_argument("--predictions", type=Path, required=True)
    score.add_argument("--split", choices=sorted(VALID_SPLITS), default="test")
    score.add_argument("--bootstrap-replicates", type=int, default=2_000)
    score.add_argument("--bootstrap-seed", type=int, default=17)
    score.add_argument("--output", type=Path)

    args = parser.parse_args()
    try:
        manifest_rows = read_jsonl(args.manifest)
        if args.command == "validate":
            result = validate_manifest(
                manifest_rows,
                purpose=args.purpose,
                execution=args.execution,
                dataset_root=args.dataset_root,
                contexts_per_target=args.contexts_per_target,
                promotion=args.promotion,
            )
        else:
            result = score_predictions(
                manifest_rows,
                read_jsonl(args.predictions),
                split=args.split,
                bootstrap_replicates=args.bootstrap_replicates,
                bootstrap_seed=args.bootstrap_seed,
            )
        _write_json(args.output, result)
        return 0
    except BenchmarkError as error:
        parser.exit(2, f"error: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())

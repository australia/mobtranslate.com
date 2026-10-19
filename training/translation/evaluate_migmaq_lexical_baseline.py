#!/usr/bin/env python3
"""Run a frozen lexical reconstruction census on a merged model or compact adapter."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import statistics
import tempfile
import time
import unicodedata
from typing import Any, Iterable, Sequence


QUOTE_FOLD = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u02bc": "'",
        "`": "'",
        "\u00b4": "'",
        "\u201c": '"',
        "\u201d": '"',
    }
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--base-model", type=Path)
    parser.add_argument("--adapter-dir", type=Path)
    parser.add_argument("--task-token", action="append", default=[])
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-model-sha256", required=True)
    parser.add_argument(
        "--expected-tokenizer-sha256",
        default="",
        help="Legacy tokenizer.json SHA-256. Prefer --expected-tokenizer-bundle-sha256.",
    )
    parser.add_argument(
        "--expected-tokenizer-bundle-sha256",
        default="",
        help="Hash of all behavior-bearing tokenizer files, including their relative names.",
    )
    parser.add_argument("--expected-base-model-sha256")
    parser.add_argument("--expected-base-tokenizer-sha256")
    parser.add_argument("--expected-benchmark-sha256", required=True)
    parser.add_argument("--expected-rows", type=int, default=14_438)
    parser.add_argument("--expected-source-token-id", type=int, default=256_047)
    parser.add_argument("--expected-target-token-id", type=int, default=256_204)
    parser.add_argument(
        "--expect-output-head-alias",
        choices=("tied", "untied"),
        default="untied",
        help="Expected output-head relationship for the frozen artifact.",
    )
    parser.add_argument("--input-field", default="unconditioned_input_text")
    parser.add_argument("--direction", default="eng-mic")
    parser.add_argument("--source-lang", default="eng_Latn")
    parser.add_argument("--target-lang", default="mic_Latn")
    parser.add_argument(
        "--use-fast-tokenizer",
        action=argparse.BooleanOptionalAction,
        default=True,
    )
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--max-source-length", type=int, default=192)
    parser.add_argument("--max-new-tokens", type=int, default=192)
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=3)
    parser.add_argument("--repetition-penalty", type=float, default=1.1)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    parser.add_argument("--dtype", choices=("float32", "float16", "bfloat16"), default="float32")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--progress-every-batches", type=int, default=10)
    parser.add_argument("--resource-sample-every-batches", type=int, default=10)
    parser.add_argument("--gate-lower-bound", type=float, default=0.80)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--max-rows", type=int)
    parser.add_argument("--require-cuda", action="store_true")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


TOKENIZER_BUNDLE_NAMES = (
    "added_tokens.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
)


def tokenizer_bundle_identity(root: Path) -> dict[str, Any]:
    files = [root / name for name in TOKENIZER_BUNDLE_NAMES if (root / name).is_file()]
    names = {path.name for path in files}
    if "tokenizer_config.json" not in names:
        raise FileNotFoundError(root / "tokenizer_config.json")
    if not ({"tokenizer.json", "sentencepiece.bpe.model"} & names):
        raise FileNotFoundError(
            f"no tokenizer.json or sentencepiece.bpe.model under {root}"
        )
    digest = hashlib.sha256()
    file_hashes: dict[str, str] = {}
    for path in files:
        content_sha256 = sha256(path)
        file_hashes[path.name] = content_sha256
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(content_sha256))
    return {
        "algorithm": "sha256(relative_name_nul_file_sha256_bytes)",
        "sha256": digest.hexdigest(),
        "files": file_hashes,
    }


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).translate(QUOTE_FOLD).casefold()
    return " ".join(text.split())


def source_preserving(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def graphemes(value: str) -> list[str]:
    import regex

    return regex.findall(r"\X", value)


def edit_distance(left: Sequence[Any], right: Sequence[Any]) -> int:
    if len(left) > len(right):
        left, right = right, left
    previous = list(range(len(left) + 1))
    for right_index, right_item in enumerate(right, start=1):
        current = [right_index]
        for left_index, left_item in enumerate(left, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[left_index] + 1,
                    previous[left_index - 1] + (left_item != right_item),
                )
            )
        previous = current
    return previous[-1]


def error_rate(prediction: Sequence[Any], reference: Sequence[Any]) -> float:
    return edit_distance(prediction, reference) / max(1, len(reference))


def normalized_references(row: dict[str, Any]) -> list[str]:
    values = [
        normalize(value)
        for value in (row.get("accepted_references") or row.get("acceptedReferences") or [])
    ]
    if not any(values):
        values = [normalize(row.get("output_text") or row.get("reference"))]
    values = list(dict.fromkeys(value for value in values if value))
    if not values:
        raise ValueError(f"benchmark row {row.get('id')!r} has no accepted reference")
    return values


def classify_edit(prediction: str, references: list[str], source: str) -> str:
    if not prediction:
        return "empty"
    if prediction == source:
        return "source_copy"
    if prediction in references:
        return "exact"
    best = min(references, key=lambda value: error_rate(graphemes(prediction), graphemes(value)))
    ratio = len(graphemes(prediction)) / max(1, len(graphemes(best)))
    distance = error_rate(graphemes(prediction), graphemes(best))
    if prediction in best or ratio < 0.60:
        return "under_generation_surface"
    if best in prediction or ratio > 1.50:
        return "over_generation_surface"
    if distance <= 0.25:
        return "near_surface_form"
    return "different_surface_form"


def wilson(successes: int, total: int, z: float = 1.959963984540054) -> dict[str, float]:
    if total <= 0:
        return {"low": 0.0, "high": 0.0}
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    distance = z * math.sqrt(
        proportion * (1 - proportion) / total + z * z / (4 * total * total)
    ) / denominator
    return {"low": center - distance, "high": center + distance}


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def benchmark_row_id(row: dict[str, Any]) -> str:
    return str(row.get("id") or row.get("rowId") or "").strip()


def read_benchmark(
    path: Path,
    expected_rows: int,
    max_rows: int | None,
    expected_direction: str = "eng-mic",
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            direction = row.get("direction")
            if direction is not None and direction != expected_direction:
                raise ValueError(f"unexpected direction at {path}:{line_number}: {direction!r}")
            if not benchmark_row_id(row):
                raise ValueError(f"missing row ID at {path}:{line_number}")
            normalized_references(row)
            rows.append(row)
    ids = [benchmark_row_id(row) for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("benchmark row IDs are not unique")
    if len(rows) != expected_rows:
        raise ValueError(f"expected {expected_rows} benchmark rows, found {len(rows)}")
    return rows[:max_rows] if max_rows is not None else rows


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(f"refusing to overwrite {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def stable_manifest_identity(value: Any) -> Any:
    """Remove process-local fields before comparing a resumed environment."""
    if isinstance(value, dict):
        return {
            key: stable_manifest_identity(child)
            for key, child in sorted(value.items())
            if key not in {"created_at", "pointers"}
        }
    if isinstance(value, list):
        return [stable_manifest_identity(child) for child in value]
    return value


def append_jsonl_fsync(handle: Any, value: dict[str, Any]) -> None:
    handle.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")
    handle.flush()
    os.fsync(handle.fileno())


def load_resource_samples(
    path: Path,
    *,
    resume: bool,
    completed_rows: int,
) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    if not resume:
        raise FileExistsError(
            f"resource samples already exist; pass --resume to continue: {path}"
        )
    samples: list[dict[str, Any]] = []
    prior_completed = -1
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                sample = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"invalid existing resource sample at {path}:{line_number}: {error}"
                ) from error
            if not isinstance(sample, dict):
                raise ValueError(
                    f"resource sample at {path}:{line_number} is not an object"
                )
            sample_completed = sample.get("completed_rows")
            if not isinstance(sample_completed, int) or sample_completed < prior_completed:
                raise ValueError(
                    f"resource samples are not a monotonic row-count sequence at {path}:{line_number}"
                )
            if sample_completed > completed_rows:
                raise ValueError(
                    "resource samples are ahead of the durable prediction prefix: "
                    f"sample={sample_completed}, predictions={completed_rows}"
                )
            prior_completed = sample_completed
            samples.append(sample)
    return samples


def generated_token_rows(
    generated: Any,
    *,
    decoder_start_token_id: int,
    target_token_id: int,
    pad_token_id: int,
) -> list[list[int]]:
    rows: list[list[int]] = []
    for row_number, sequence in enumerate(generated, start=1):
        values = [int(value) for value in sequence.tolist()]
        if values[:2] != [decoder_start_token_id, target_token_id]:
            raise ValueError(
                "generated sequence does not begin with the frozen NLLB decoder/target prefix: "
                f"row={row_number}, expected={[decoder_start_token_id, target_token_id]}, "
                f"observed={values[:2]}"
            )
        while len(values) > 2 and values[-1] == pad_token_id:
            values.pop()
        rows.append(values)
    return rows


def validate_source_language_prefix(
    input_ids: Any,
    attention_mask: Any,
    expected_source_token_id: int,
) -> list[int]:
    active_lengths: list[int] = []
    for row_number, (ids, mask) in enumerate(
        zip(input_ids.tolist(), attention_mask.tolist(), strict=True),
        start=1,
    ):
        active = [int(token) for token, keep in zip(ids, mask, strict=True) if int(keep)]
        if not active or active[0] != expected_source_token_id:
            raise ValueError(
                "tokenized source does not begin with the frozen NLLB source token: "
                f"row={row_number}, expected={expected_source_token_id}, "
                f"observed={active[:1]}"
            )
        active_lengths.append(len(active))
    return active_lengths


def load_completed_predictions(path: Path, rows: list[dict[str, Any]], resume: bool) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    if not resume:
        raise FileExistsError(f"predictions already exist; pass --resume to continue: {path}")
    completed: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                completed.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid existing prediction at {path}:{line_number}: {error}") from error
    if len(completed) > len(rows):
        raise ValueError("existing predictions exceed benchmark rows")
    expected_ids = [benchmark_row_id(row) for row in rows[: len(completed)]]
    actual_ids = [str(row.get("id")) for row in completed]
    if actual_ids != expected_ids:
        raise ValueError("existing predictions are not an exact benchmark-order prefix")
    return completed


def chunks(rows: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for index in range(0, len(rows), size):
        yield rows[index : index + size]


def target_length_bucket(length: int) -> str:
    if length <= 5:
        return "1-5"
    if length <= 10:
        return "6-10"
    if length <= 15:
        return "11-15"
    return "16+"


def source_token_bucket(length: int) -> str:
    if length == 1:
        return "1"
    if length == 2:
        return "2"
    if length <= 5:
        return "3-5"
    return "6+"


def subword_bucket(length: int) -> str:
    return str(length) if length <= 8 else "9+"


def frequency_bucket(count: int) -> str:
    if count == 1:
        return "1"
    if count <= 4:
        return "2-4"
    if count <= 19:
        return "5-19"
    return "20+"


def summarize_group(rows: list[dict[str, Any]]) -> dict[str, Any]:
    exact = sum(bool(row["accepted_exact"]) for row in rows)
    return {
        "rows": len(rows),
        "accepted_exact_count": exact,
        "accepted_exact_percent": 100 * exact / len(rows),
        "mean_codepoint_cer": statistics.fmean(float(row["codepoint_cer"]) for row in rows),
        "mean_grapheme_cer": statistics.fmean(float(row["grapheme_cer"]) for row in rows),
    }


def failure_slices(rows: list[dict[str, Any]]) -> dict[str, Any]:
    prediction_counts = Counter(str(row["prediction_normalized"]) for row in rows)
    groups: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        references = [str(value) for value in row["accepted_references_normalized"]]
        target = references[0]
        categories = {
            "part_of_speech": [str(row.get("part_of_speech") or "(missing)")],
            "source_gloss_token_count": [source_token_bucket(len(str(row["input_normalized"]).split()))],
            "target_character_count": [target_length_bucket(len(graphemes(target)))],
            "target_subword_count": [subword_bucket(int(row["target_subword_count"]))],
            "apostrophe_presence": [str("'" in target).lower()],
            "hyphen_presence": [str("-" in target).lower()],
            "legacy_v1_split": [str(value) for value in row.get("legacy_v1_splits") or ["(not_crosswalked)"]],
            "candidate_source_field": [str(row.get("candidate_source_field") or "(not_provided)")],
            "lineage_exposure": [
                f"v1_{value}_entry" for value in row.get("legacy_v1_splits") or ["not_crosswalked"]
            ],
            "prediction_frequency": [frequency_bucket(prediction_counts[str(row["prediction_normalized"])])],
            "edit_error_type": [str(row["edit_error_type"])],
        }
        for dimension, values in categories.items():
            for value in values:
                groups[dimension][value].append(row)
    return {
        "slices": {
            dimension: {
                value: summarize_group(items)
                for value, items in sorted(values.items())
            }
            for dimension, values in sorted(groups.items())
        },
        "most_common_predictions": [
            {"prediction": prediction, "rows": count}
            for prediction, count in prediction_counts.most_common(100)
        ],
        "interpretation": (
            "These are deterministic surface and provenance slices. They do not adjudicate lexical senses, "
            "morphology, grammaticality, variety, or cultural acceptability."
        ),
    }


def metric_report(rows: list[dict[str, Any]], gate_lower_bound: float) -> dict[str, Any]:
    exact = sum(bool(row["accepted_exact"]) for row in rows)
    selected_exact = sum(bool(row["selected_exact"]) for row in rows)
    interval = wilson(exact, len(rows))
    codepoint = [float(row["codepoint_cer"]) for row in rows]
    grapheme = [float(row["grapheme_cer"]) for row in rows]
    counts = Counter(str(row["prediction_normalized"]) for row in rows)
    return {
        "analysis_kind": "closed_set_lexical_reconstruction_development_census",
        "claim_limit": (
            "This is a closed-set development-census reconstruction measurement. It cannot authorize sentence "
            "translation or estimate reliability for future user queries."
        ),
        "rows": len(rows),
        "accepted_exact_count": exact,
        "accepted_exact_percent": 100 * exact / len(rows),
        "selected_exact_count": selected_exact,
        "wilson_95": interval,
        "gate_lower_bound": gate_lower_bound,
        "passes_confidence_adjusted_development_gate": interval["low"] >= gate_lower_bound,
        "empty_outputs": sum(bool(row["empty"]) for row in rows),
        "source_copy_outputs": sum(bool(row["source_copy"]) for row in rows),
        "unique_normalized_outputs": len(counts),
        "maximum_normalized_output_frequency": max(counts.values()),
        "codepoint_cer": {
            "mean": statistics.fmean(codepoint),
            "median": percentile(codepoint, 0.5),
            "p90": percentile(codepoint, 0.9),
            "p99": percentile(codepoint, 0.99),
        },
        "grapheme_cer": {
            "mean": statistics.fmean(grapheme),
            "median": percentile(grapheme, 0.5),
            "p90": percentile(grapheme, 0.9),
            "p99": percentile(grapheme, 0.99),
        },
    }


def embedding_alias_audit(model: Any) -> dict[str, Any]:
    inner = model.model
    tensors = {
        "shared_input": model.get_input_embeddings().weight,
        "encoder_input": inner.encoder.embed_tokens.weight,
        "decoder_input": inner.decoder.embed_tokens.weight,
        "output_head": model.get_output_embeddings().weight,
    }
    pointers = {name: int(tensor.data_ptr()) for name, tensor in tensors.items()}
    shapes = {name: list(tensor.shape) for name, tensor in tensors.items()}
    input_pointers = [pointers[name] for name in ("shared_input", "encoder_input", "decoder_input")]
    return {
        "pointers": pointers,
        "shapes": shapes,
        "shared_encoder_decoder_tied": len(set(input_pointers)) == 1,
        "output_head_tied_to_shared": pointers["output_head"] == pointers["shared_input"],
        "config_tie_word_embeddings": bool(model.config.tie_word_embeddings),
    }


def restore_serialized_nllb_input_aliases(model: Any) -> dict[str, Any]:
    """Restore NLLB's shared input embedding after safe-tensor reload.

    A standalone checkpoint must materialize all three input-embedding keys.
    Transformers can consequently reload them as distinct modules even when
    their values are identical. Prove exact equality before restoring the
    runtime alias; divergent matrices remain a hard artifact failure.
    """
    import torch

    before = embedding_alias_audit(model)
    inner = model.model
    shared = model.get_input_embeddings().weight
    encoder = inner.encoder.embed_tokens.weight
    decoder = inner.decoder.embed_tokens.weight
    equality = {
        "shared_encoder": bool(torch.equal(shared.detach(), encoder.detach())),
        "shared_decoder": bool(torch.equal(shared.detach(), decoder.detach())),
        "encoder_decoder": bool(torch.equal(encoder.detach(), decoder.detach())),
    }
    if not all(equality.values()):
        raise ValueError(
            "Serialized NLLB input embedding matrices have divergent values: "
            f"equality={equality}, topology={before}"
        )

    action = "already_tied"
    if not before["shared_encoder_decoder_tied"]:
        model.set_input_embeddings(model.get_input_embeddings())
        action = "restored_equal_serialized_aliases"
    after = embedding_alias_audit(model)
    if not after["shared_encoder_decoder_tied"]:
        raise RuntimeError(f"Could not restore NLLB input embedding aliases: {after}")
    return {
        "action": action,
        "serialized_values_exactly_equal": equality,
        "before": before,
        "after": after,
    }


def resource_sample(
    torch: Any,
    batch_number: int,
    completed_rows: int,
    started: float,
    *,
    segment_number: int,
    segment_start_rows: int,
    phase: str,
) -> dict[str, Any]:
    import resource

    sample = {
        "at": utc_now(),
        "batch": batch_number,
        "completed_rows": completed_rows,
        "phase": phase,
        "segment_number": segment_number,
        "segment_start_rows": segment_start_rows,
        "elapsed_seconds": time.monotonic() - started,
        "process_max_rss_bytes": int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024,
        "cuda_available": bool(torch.cuda.is_available()),
    }
    if torch.cuda.is_available():
        free_bytes, total_bytes = torch.cuda.mem_get_info()
        sample.update(
            {
                "cuda_memory_allocated_bytes": int(torch.cuda.memory_allocated()),
                "cuda_memory_reserved_bytes": int(torch.cuda.memory_reserved()),
                "cuda_max_memory_allocated_bytes": int(torch.cuda.max_memory_allocated()),
                "cuda_max_memory_reserved_bytes": int(torch.cuda.max_memory_reserved()),
                "gpu_free_bytes": int(free_bytes),
                "gpu_total_bytes": int(total_bytes),
            }
        )
    return sample


def main() -> None:
    args = parse_args()
    if args.expected_rows < 1 or args.batch_size < 1 or args.num_beams < 1:
        raise SystemExit("row, batch, and beam counts must be positive")
    if args.max_source_length < 1 or args.max_new_tokens < 1:
        raise SystemExit("source and generation lengths must be positive")
    if args.progress_every_batches < 1 or args.resource_sample_every_batches < 1:
        raise SystemExit("progress and resource-sample intervals must be positive")
    if not 0 < args.gate_lower_bound < 1:
        raise SystemExit("--gate-lower-bound must be between zero and one")
    if bool(args.base_model) != bool(args.adapter_dir):
        raise SystemExit("--base-model and --adapter-dir must be supplied together")
    if not args.expected_tokenizer_sha256 and not args.expected_tokenizer_bundle_sha256:
        raise SystemExit(
            "one of --expected-tokenizer-sha256 or "
            "--expected-tokenizer-bundle-sha256 is required"
        )

    adapter_mode = args.adapter_dir is not None
    model_dir = args.model_dir.expanduser().resolve()
    base_model = args.base_model.expanduser().resolve() if args.base_model else None
    adapter_dir = args.adapter_dir.expanduser().resolve() if args.adapter_dir else None
    if adapter_mode and model_dir != adapter_dir:
        raise ValueError("--model-dir must equal --adapter-dir in compact-adapter mode")
    benchmark_path = args.benchmark.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    weights_path = model_dir / ("adapter_model.safetensors" if adapter_mode else "model.safetensors")
    tokenizer_path = model_dir / "tokenizer.json"
    required_paths = [weights_path, benchmark_path]
    if args.expected_tokenizer_sha256:
        required_paths.append(tokenizer_path)
    if adapter_mode:
        required_paths.extend([base_model / "model.safetensors", base_model / "tokenizer.json"])
        if not args.expected_base_model_sha256 or not args.expected_base_tokenizer_sha256:
            raise ValueError("Compact-adapter mode requires both expected base hashes")
    for path in required_paths:
        if not path.is_file():
            raise FileNotFoundError(path)
    observed_hashes: dict[str, Any] = {
        "artifact_safetensors": sha256(weights_path),
        "benchmark": sha256(benchmark_path),
    }
    expected_hashes: dict[str, Any] = {
        "artifact_safetensors": args.expected_model_sha256,
        "benchmark": args.expected_benchmark_sha256,
    }
    tokenizer_bundle = tokenizer_bundle_identity(model_dir)
    if args.expected_tokenizer_sha256:
        observed_hashes["artifact_tokenizer_json"] = sha256(tokenizer_path)
        expected_hashes["artifact_tokenizer_json"] = args.expected_tokenizer_sha256
    if args.expected_tokenizer_bundle_sha256:
        observed_hashes["artifact_tokenizer_bundle"] = tokenizer_bundle["sha256"]
        expected_hashes["artifact_tokenizer_bundle"] = args.expected_tokenizer_bundle_sha256
    if adapter_mode:
        observed_hashes.update(
            {
                "base_model_safetensors": sha256(base_model / "model.safetensors"),
                "base_tokenizer_json": sha256(base_model / "tokenizer.json"),
            }
        )
        expected_hashes.update(
            {
                "base_model_safetensors": args.expected_base_model_sha256,
                "base_tokenizer_json": args.expected_base_tokenizer_sha256,
            }
        )
    if observed_hashes != expected_hashes:
        raise ValueError(f"input hash mismatch: observed={observed_hashes}, expected={expected_hashes}")

    rows = read_benchmark(
        benchmark_path,
        args.expected_rows,
        args.max_rows,
        expected_direction=args.direction,
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    predictions_path = output_dir / "predictions.jsonl"
    completed = load_completed_predictions(predictions_path, rows, args.resume)
    initial_completed_rows = len(completed)
    input_manifest = {
        "schema_version": 1,
        "created_at": utc_now(),
        "artifact_kind": "compact_peft_adapter" if adapter_mode else "merged_model",
        "model_dir": str(model_dir),
        "base_model": str(base_model) if base_model else None,
        "adapter_dir": str(adapter_dir) if adapter_dir else None,
        "task_tokens": args.task_token,
        "benchmark": str(benchmark_path),
        "hashes": observed_hashes,
        "tokenizer_bundle": tokenizer_bundle,
        "full_benchmark_rows": args.expected_rows,
        "scheduled_rows": len(rows),
        "input_field": args.input_field,
        "direction": args.direction,
        "source_lang": args.source_lang,
        "target_lang": args.target_lang,
        "use_fast_tokenizer": args.use_fast_tokenizer,
        "expected_target_token_id": args.expected_target_token_id,
        "expected_source_token_id": args.expected_source_token_id,
        "expect_output_head_alias": args.expect_output_head_alias,
        "evaluator": {
            "path": str(Path(__file__).resolve()),
            "sha256": sha256(Path(__file__).resolve()),
        },
    }
    input_manifest_path = output_dir / "input-manifest.json"
    if input_manifest_path.exists():
        prior = json.loads(input_manifest_path.read_text(encoding="utf-8"))
        if stable_manifest_identity(prior) != stable_manifest_identity(input_manifest):
            raise ValueError("existing input manifest does not match this run")
    else:
        write_json_atomic(input_manifest_path, input_manifest)

    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")

    import torch
    import transformers
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    if args.require_cuda and not torch.cuda.is_available():
        raise SystemExit("CUDA is required but unavailable")
    if args.dtype == "bfloat16" and torch.cuda.is_available() and not torch.cuda.is_bf16_supported():
        raise SystemExit("bfloat16 was requested but is unsupported on this GPU")
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
    torch.use_deterministic_algorithms(True)
    dtype = {
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }[args.dtype]

    task_token_records: list[dict[str, Any]] = []
    if adapter_mode:
        from nllb_peft_artifact import compact_adapter_topology_audit, load_compact_nllb_adapter

        tokenizer, model, task_token_records = load_compact_nllb_adapter(
            base_model,
            adapter_dir,
            source_lang=args.source_lang,
            target_lang=args.target_lang,
            task_tokens=args.task_token,
            torch_dtype=dtype,
            local_files_only=True,
        )
    else:
        tokenizer = AutoTokenizer.from_pretrained(
            model_dir,
            use_fast=args.use_fast_tokenizer,
            src_lang=args.source_lang,
            tgt_lang=args.target_lang,
            local_files_only=True,
        )
        model = AutoModelForSeq2SeqLM.from_pretrained(
            model_dir,
            torch_dtype=dtype,
            local_files_only=True,
        )
    target_token_id = int(tokenizer.convert_tokens_to_ids(args.target_lang))
    target_round_trip = tokenizer.convert_ids_to_tokens(target_token_id)
    target_single_id = tokenizer.encode(args.target_lang, add_special_tokens=False)
    if target_token_id != args.expected_target_token_id:
        raise ValueError(f"target token ID {target_token_id} != expected {args.expected_target_token_id}")
    if target_round_trip != args.target_lang or target_single_id != [target_token_id]:
        raise ValueError(
            f"target token does not round-trip as one ID: token={target_round_trip!r}, ids={target_single_id}"
        )
    source_token_id = int(tokenizer.convert_tokens_to_ids(args.source_lang))
    source_round_trip = tokenizer.convert_ids_to_tokens(source_token_id)
    source_single_id = tokenizer.encode(args.source_lang, add_special_tokens=False)
    if source_token_id != args.expected_source_token_id:
        raise ValueError(
            f"source token ID {source_token_id} != expected {args.expected_source_token_id}"
        )
    if source_round_trip != args.source_lang or source_single_id != [source_token_id]:
        raise ValueError(
            f"source token does not round-trip as one ID: token={source_round_trip!r}, "
            f"ids={source_single_id}"
        )
    expected_output_tied = args.expect_output_head_alias == "tied"
    if adapter_mode:
        aliases = compact_adapter_topology_audit(model)
        if not aliases["decoder_shared_base_weight_tied"]:
            raise ValueError(f"Adapter decoder/shared input embeddings are not tied: {aliases}")
        if not aliases["decoder_shared_values_equal"]:
            raise ValueError(f"Adapter decoder/shared input embeddings have divergent values: {aliases}")
        if task_token_records:
            expected_wrapper = "base_model.model.model.encoder.embed_tokens"
            if expected_wrapper not in aliases["trainable_token_wrapper_modules"]:
                raise ValueError(f"Adapter source control wrapper is absent: {aliases}")
            task_token_ids = sorted(int(row["token_id"]) for row in task_token_records)
            base_vocabulary_size = aliases["vocabulary_size"] - len(task_token_ids)
            if task_token_ids != list(range(base_vocabulary_size, aliases["vocabulary_size"])):
                raise ValueError(
                    f"Registered task rows are not one contiguous appended suffix: {task_token_records}"
                )
            base = model.get_base_model()
            encoder_weight = base.model.encoder.embed_tokens.weight
            shared_weight = base.get_input_embeddings().weight
            if not torch.equal(
                encoder_weight[:base_vocabulary_size],
                shared_weight[:base_vocabulary_size],
            ):
                raise ValueError(
                    "Registered adapter changed pre-existing encoder embedding rows outside the "
                    f"declared task-token suffix: {aliases}"
                )
        elif not (
            aliases["encoder_shared_base_weight_tied"]
            and aliases["encoder_shared_values_equal"]
        ):
            raise ValueError(f"Ordinary adapter encoder/shared embeddings diverged: {aliases}")
        if aliases["output_head_tied_to_shared"] != expected_output_tied:
            raise ValueError(
                f"Adapter output-head alias does not match {args.expect_output_head_alias!r}: {aliases}"
            )
        if aliases["config_tie_word_embeddings"] != expected_output_tied:
            raise ValueError(f"Adapter config output-head relationship is inconsistent: {aliases}")
    else:
        reload_alias_restoration = restore_serialized_nllb_input_aliases(model)
        aliases = embedding_alias_audit(model)
        aliases["reload_alias_restoration"] = reload_alias_restoration
        if not aliases["shared_encoder_decoder_tied"]:
            raise ValueError(f"NLLB shared/encoder/decoder input aliases are not tied: {aliases}")
        if aliases["output_head_tied_to_shared"] != expected_output_tied:
            raise ValueError(
                f"NLLB output-head alias does not match expected {args.expect_output_head_alias!r}: {aliases}"
            )
        if aliases["config_tie_word_embeddings"] != expected_output_tied:
            raise ValueError(
                "NLLB config.tie_word_embeddings disagrees with the expected output-head relationship: "
                f"{aliases}"
            )
    decoder_start_token_id = int(model.config.decoder_start_token_id)
    eos_token_id = int(tokenizer.eos_token_id)
    pad_token_id = int(tokenizer.pad_token_id)
    if decoder_start_token_id != eos_token_id:
        raise ValueError("decoder start token is not tokenizer EOS")

    tokenizer.src_lang = args.source_lang
    tokenizer.tgt_lang = args.target_lang
    model.config.forced_bos_token_id = target_token_id
    model.generation_config.forced_bos_token_id = target_token_id
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    environment = {
        "schema_version": 1,
        "created_at": utc_now(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cublas_workspace_config": os.environ["CUBLAS_WORKSPACE_CONFIG"],
        "torch": torch.__version__,
        "transformers": transformers.__version__,
        "peft": package_version("peft"),
        "tokenizers": package_version("tokenizers"),
        "sentencepiece": package_version("sentencepiece"),
        "regex": package_version("regex"),
        "device": str(device),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "cuda": torch.version.cuda,
        "dtype": str(next(model.parameters()).dtype),
        "artifact_kind": "compact_peft_adapter" if adapter_mode else "merged_model",
        "task_token_initialization": task_token_records,
        "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
        "cuda_matmul_allow_tf32": torch.backends.cuda.matmul.allow_tf32,
        "cudnn_allow_tf32": torch.backends.cudnn.allow_tf32,
        "target_token": {
            "token": args.target_lang,
            "id": target_token_id,
            "round_trip": target_round_trip,
            "single_encoded_id": target_single_id,
        },
        "source_token": {
            "token": args.source_lang,
            "id": source_token_id,
            "round_trip": source_round_trip,
            "single_encoded_id": source_single_id,
        },
        "decoder_start_token_id": decoder_start_token_id,
        "eos_token_id": eos_token_id,
        "pad_token_id": pad_token_id,
        "embedding_alias_audit": aliases,
        "generation": {
            "batch_size": args.batch_size,
            "max_source_length": args.max_source_length,
            "max_new_tokens": args.max_new_tokens,
            "num_beams": args.num_beams,
            "no_repeat_ngram_size": args.no_repeat_ngram_size,
            "repetition_penalty": args.repetition_penalty,
            "length_penalty": args.length_penalty,
            "do_sample": False,
            "seed": args.seed,
            "explicit_decoder_start_token_id": decoder_start_token_id,
            "explicit_forced_bos_token_id": target_token_id,
            "explicit_eos_token_id": eos_token_id,
            "explicit_pad_token_id": pad_token_id,
        },
    }
    environment_path = output_dir / "environment-manifest.json"
    if environment_path.exists():
        prior_environment = json.loads(environment_path.read_text(encoding="utf-8"))
        if stable_manifest_identity(prior_environment) != stable_manifest_identity(environment):
            raise ValueError("existing environment manifest does not match this resume")
    else:
        write_json_atomic(environment_path, environment)

    started = time.monotonic()
    resource_samples_path = output_dir / "resource-samples.jsonl"
    resources = load_resource_samples(
        resource_samples_path,
        resume=args.resume,
        completed_rows=len(completed),
    )
    segment_number = 1 + max(
        (int(sample.get("segment_number") or 0) for sample in resources),
        default=0,
    )
    remaining = rows[len(completed) :]
    mode = "a" if completed else "w"
    resource_mode = "a" if resource_samples_path.exists() else "w"
    with predictions_path.open(mode, encoding="utf-8", buffering=1) as prediction_handle, resource_samples_path.open(
        resource_mode, encoding="utf-8", buffering=1
    ) as resource_handle:
        start_sample = resource_sample(
            torch,
            math.ceil(len(completed) / args.batch_size),
            len(completed),
            started,
            segment_number=segment_number,
            segment_start_rows=initial_completed_rows,
            phase="segment_start",
        )
        append_jsonl_fsync(resource_handle, start_sample)
        resources.append(start_sample)
        for batch_number, batch in enumerate(chunks(remaining, args.batch_size), start=1):
            source_texts = [source_preserving(row.get(args.input_field)) for row in batch]
            if any(not text for text in source_texts):
                raise ValueError("batch contains a blank model input")
            tokenizer.src_lang = args.source_lang
            untruncated = tokenizer(
                source_texts,
                add_special_tokens=True,
                truncation=False,
                padding=False,
                return_token_type_ids=False,
            )["input_ids"]
            encoded = tokenizer(
                source_texts,
                max_length=args.max_source_length,
                truncation=True,
                padding=True,
                return_tensors="pt",
                return_token_type_ids=False,
            )
            active_source_lengths = validate_source_language_prefix(
                encoded["input_ids"],
                encoded["attention_mask"],
                source_token_id,
            )
            encoded = encoded.to(device)
            batch_started = time.monotonic()
            with torch.inference_mode():
                generated = model.generate(
                    **encoded,
                    decoder_start_token_id=decoder_start_token_id,
                    forced_bos_token_id=target_token_id,
                    eos_token_id=eos_token_id,
                    pad_token_id=pad_token_id,
                    max_new_tokens=args.max_new_tokens,
                    num_beams=args.num_beams,
                    no_repeat_ngram_size=args.no_repeat_ngram_size,
                    repetition_penalty=args.repetition_penalty,
                    length_penalty=args.length_penalty,
                    do_sample=False,
                )
            if device.type == "cuda":
                torch.cuda.synchronize()
            batch_elapsed_ms = (time.monotonic() - batch_started) * 1000
            token_rows = generated_token_rows(
                generated,
                decoder_start_token_id=decoder_start_token_id,
                target_token_id=target_token_id,
                pad_token_id=pad_token_id,
            )
            decoded = [source_preserving(value) for value in tokenizer.batch_decode(generated, skip_special_tokens=True)]
            if len(decoded) != len(batch):
                raise RuntimeError(f"batch produced {len(decoded)} outputs for {len(batch)} inputs")
            per_row_latency = batch_elapsed_ms / len(batch)
            for benchmark_row, source, prediction, generated_ids, source_ids, active_source_length in zip(
                batch,
                source_texts,
                decoded,
                token_rows,
                untruncated,
                active_source_lengths,
                strict=True,
            ):
                refs = normalized_references(benchmark_row)
                prediction_normalized = normalize(prediction)
                source_normalized = normalize(source)
                accepted_references = (
                    benchmark_row.get("accepted_references")
                    or benchmark_row.get("acceptedReferences")
                    or []
                )
                selected = normalize(
                    benchmark_row.get("output_text")
                    or benchmark_row.get("reference")
                    or (accepted_references[0] if accepted_references else "")
                )
                codepoint_cer = min(error_rate(list(prediction_normalized), list(ref)) for ref in refs)
                grapheme_cer = min(error_rate(graphemes(prediction_normalized), graphemes(ref)) for ref in refs)
                target_subword_count = min(
                    len(tokenizer.encode(ref, add_special_tokens=False)) for ref in refs
                )
                result = {
                    "id": benchmark_row_id(benchmark_row),
                    "source_entry_ids": (
                        benchmark_row.get("source_entry_ids")
                        or benchmark_row.get("sourceRecordIds")
                        or []
                    ),
                    "source_gloss_candidate_ids": benchmark_row.get("source_gloss_candidate_ids") or [],
                    "unconditioned_input_text": source,
                    "input_normalized": source_normalized,
                    "part_of_speech": benchmark_row.get("part_of_speech"),
                    "legacy_v1_splits": benchmark_row.get("legacy_v1_splits") or [],
                    "candidate_source_field": benchmark_row.get("candidate_source_field"),
                    "accepted_references": accepted_references,
                    "accepted_references_normalized": refs,
                    "selected_reference_normalized": selected,
                    "prediction": prediction,
                    "prediction_normalized": prediction_normalized,
                    "generated_token_ids": generated_ids,
                    "generated_token_count_including_decoder_prefix": len(generated_ids),
                    "generated_decoder_target_prefix": generated_ids[:2],
                    "source_token_count_with_special_tokens_before_truncation": len(source_ids),
                    "source_token_count_with_special_tokens_after_truncation": active_source_length,
                    "source_was_truncated": len(source_ids) > active_source_length,
                    "latency_milliseconds": per_row_latency,
                    "accepted_exact": prediction_normalized in refs,
                    "selected_exact": prediction_normalized == selected,
                    "codepoint_cer": codepoint_cer,
                    "grapheme_cer": grapheme_cer,
                    "target_subword_count": target_subword_count,
                    "empty": not prediction_normalized,
                    "source_copy": prediction_normalized == source_normalized,
                    "edit_error_type": classify_edit(prediction_normalized, refs, source_normalized),
                    "suite_key": benchmark_row.get("suiteKey") or benchmark_row.get("suite_key"),
                    "ambiguity_status": benchmark_row.get("ambiguityStatus"),
                    "analysis_join": benchmark_row.get("analysisJoin"),
                    "surface_features": benchmark_row.get("surfaceFeatures"),
                }
                prediction_handle.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
                completed.append(result)
            prediction_handle.flush()
            os.fsync(prediction_handle.fileno())
            absolute_batch = math.ceil(len(completed) / args.batch_size)
            if (
                batch_number == 1
                or batch_number % args.resource_sample_every_batches == 0
                or len(completed) == len(rows)
            ):
                sample = resource_sample(
                    torch,
                    absolute_batch,
                    len(completed),
                    started,
                    segment_number=segment_number,
                    segment_start_rows=initial_completed_rows,
                    phase="batch_complete",
                )
                append_jsonl_fsync(resource_handle, sample)
                resources.append(sample)
            if batch_number % args.progress_every_batches == 0 or len(completed) == len(rows):
                print(
                    json.dumps(
                        {
                            "at": utc_now(),
                            "completed_rows": len(completed),
                            "total_rows": len(rows),
                            "percent": 100 * len(completed) / len(rows),
                            "elapsed_seconds": time.monotonic() - started,
                        }
                    ),
                    flush=True,
                )

    if len(completed) != len(rows):
        raise RuntimeError(f"completed {len(completed)} rows but scheduled {len(rows)}")
    expected_ids = [benchmark_row_id(row) for row in rows]
    completed_ids = [str(row["id"]) for row in completed]
    if completed_ids != expected_ids:
        raise RuntimeError("completed predictions do not preserve the benchmark ID sequence")

    report = metric_report(completed, args.gate_lower_bound)
    report["created_at"] = utc_now()
    segment_wall_seconds = time.monotonic() - started
    segment_rows = len(completed) - initial_completed_rows
    cumulative_generation_seconds = sum(
        float(row["latency_milliseconds"]) for row in completed
    ) / 1000
    report["timing"] = {
        "segment_number": segment_number,
        "initial_completed_rows": initial_completed_rows,
        "segment_rows": segment_rows,
        "segment_wall_seconds_after_model_load": segment_wall_seconds,
        "segment_rows_per_second_after_model_load": (
            segment_rows / segment_wall_seconds if segment_rows else 0.0
        ),
        "cumulative_generation_rows": len(completed),
        "cumulative_model_generate_seconds": cumulative_generation_seconds,
        "cumulative_model_generate_rows_per_second": (
            len(completed) / cumulative_generation_seconds
            if cumulative_generation_seconds
            else 0.0
        ),
    }
    write_json_atomic(output_dir / "metric-report.json", report)
    failure_report = failure_slices(completed)
    failure_report["created_at"] = utc_now()
    write_json_atomic(output_dir / "failure-slice-report.json", failure_report)
    write_json_atomic(
        output_dir / "resource-samples.json",
        {
            "schema_version": 2,
            "created_at": utc_now(),
            "append_only_source": resource_samples_path.name,
            "samples": resources,
        },
    )
    checksummed = [
        input_manifest_path,
        environment_path,
        predictions_path,
        output_dir / "metric-report.json",
        output_dir / "failure-slice-report.json",
        resource_samples_path,
        output_dir / "resource-samples.json",
    ]
    checksum_path = output_dir / "OUTPUT-SHA256SUMS"
    checksum_path.write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in checksummed),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

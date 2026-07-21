#!/usr/bin/env python3
"""Build a fixed Mi'kmaq lexical prompt ablation from the v3.1 screen sample."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any, Iterable


VARIANTS = ("original", "no_pos", "plain", "pos_only", "same_pos_shuffled")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--screen-schedule", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-benchmark-rows", type=int, default=14_438)
    parser.add_argument("--expected-sample-rows", type=int, default=960)
    parser.add_argument("--seed", type=int, default=20260721)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"invalid JSON at {path}:{line_number}: {error}"
                ) from error
            if not isinstance(row, dict):
                raise ValueError(f"non-object JSON at {path}:{line_number}")
            rows.append(row)
    return rows


def keyed(rows: Iterable[dict[str, Any]], label: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        row_id = str(row.get("id") or "")
        if not row_id or row_id in result:
            raise ValueError(f"blank or duplicate ID in {label}: {row_id!r}")
        result[row_id] = row
    return result


def direct_ids(schedule_rows: Iterable[dict[str, Any]]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for row in schedule_rows:
        if row.get("task") != "lexeme":
            continue
        source_id = str(row.get("schedule_source_id") or "")
        if not source_id or source_id in seen:
            raise ValueError(f"blank or repeated screen lexeme: {source_id!r}")
        seen.add(source_id)
        result.append(source_id)
    return result


def same_pos_derangement(rows: Iterable[dict[str, Any]], seed: int) -> dict[str, str]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get("part_of_speech") or "null")].append(row)
    result: dict[str, str] = {}
    for part_of_speech, group in sorted(groups.items()):
        if len(group) < 2:
            raise ValueError(
                f"cannot derange singleton part-of-speech group: {part_of_speech}"
            )
        ordered = sorted(
            group,
            key=lambda row: (
                hashlib.sha256(
                    f"{seed}:{part_of_speech}:{row['id']}".encode()
                ).hexdigest(),
                str(row["id"]),
            ),
        )
        donors = ordered[1:] + ordered[:1]
        for anchor, donor in zip(ordered, donors, strict=True):
            if anchor["id"] == donor["id"]:
                raise AssertionError("derangement retained an anchor")
            result[str(anchor["id"])] = str(donor["id"])
    return result


def variant_row(
    anchor: dict[str, Any],
    variant: str,
    donor: dict[str, Any] | None = None,
) -> dict[str, Any]:
    anchor_id = str(anchor["id"])
    anchor_gloss = str(anchor["unconditioned_input_text"])
    part_of_speech = str(anchor.get("part_of_speech") or "null")
    semantic_row = donor if variant == "same_pos_shuffled" else anchor
    semantic_id = str(semantic_row["id"])
    semantic_gloss = str(semantic_row["unconditioned_input_text"])
    if variant == "original":
        prompt = str(anchor["input_text"])
    elif variant == "no_pos":
        prompt = f"<lexeme> {anchor_gloss}"
    elif variant == "plain":
        prompt = anchor_gloss
    elif variant == "pos_only":
        prompt = f"<lexeme> <pos> {part_of_speech}"
    elif variant == "same_pos_shuffled":
        if donor is None:
            raise ValueError("same_pos_shuffled requires a donor")
        prompt = f"<lexeme> {semantic_gloss} <pos> {part_of_speech}"
    else:
        raise ValueError(f"unknown variant: {variant}")
    references = list(
        semantic_row.get("accepted_references") or [semantic_row.get("output_text")]
    )
    references = list(dict.fromkeys(str(value) for value in references if value))
    if not references:
        raise ValueError(f"no references for {semantic_id}")
    return {
        **semantic_row,
        "id": f"{anchor_id}:prompt-ablation:{variant}",
        "input_text": prompt,
        "unconditioned_input_text": prompt,
        "output_text": references[0],
        "accepted_references": references,
        "part_of_speech": part_of_speech,
        "ablation_variant": variant,
        "anchor_id": anchor_id,
        "anchor_gloss": anchor_gloss,
        "semantic_source_id": semantic_id,
        "semantic_gloss": semantic_gloss,
        "donor_id": str(donor["id"]) if donor is not None else None,
        "donor_is_same_part_of_speech": (
            str(donor.get("part_of_speech") or "null") == part_of_speech
            if donor is not None
            else None
        ),
        "reference_interpretation": (
            "diagnostic_anchor_only_no_well_defined_translation"
            if variant == "pos_only"
            else "valid_for_visible_english_gloss"
        ),
        "score_as_translation": variant != "pos_only",
    }


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            count += 1
    return count


def main() -> None:
    args = parse_args()
    benchmark_path = args.benchmark.expanduser().resolve()
    schedule_path = args.screen_schedule.expanduser().resolve()
    for path in (benchmark_path, schedule_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)

    benchmark_rows = read_jsonl(benchmark_path)
    if len(benchmark_rows) != args.expected_benchmark_rows:
        raise ValueError(
            f"benchmark row count changed: {len(benchmark_rows)} != {args.expected_benchmark_rows}"
        )
    benchmark = keyed(benchmark_rows, "benchmark")
    sample_ids = direct_ids(read_jsonl(schedule_path))
    if len(sample_ids) != args.expected_sample_rows:
        raise ValueError(
            f"screen sample changed: {len(sample_ids)} != {args.expected_sample_rows}"
        )
    missing = set(sample_ids) - set(benchmark)
    if missing:
        raise ValueError(f"screen sample is absent from benchmark: {len(missing)} rows")
    sample = [benchmark[row_id] for row_id in sample_ids]
    donor_ids = same_pos_derangement(sample, args.seed)
    rows: list[dict[str, Any]] = []
    for anchor in sorted(sample, key=lambda row: str(row["id"])):
        donor = benchmark[donor_ids[str(anchor["id"])]]
        for variant in VARIANTS:
            rows.append(
                variant_row(
                    anchor,
                    variant,
                    donor if variant == "same_pos_shuffled" else None,
                )
            )
    if len(rows) != args.expected_sample_rows * len(VARIANTS):
        raise AssertionError("ablation row count changed")
    if len({str(row["id"]) for row in rows}) != len(rows):
        raise AssertionError("ablation IDs are not unique")

    with tempfile.TemporaryDirectory(
        prefix=f".{output_dir.name}.", dir=output_dir.parent
    ) as temporary_name:
        staging = Path(temporary_name)
        benchmark_output = staging / "evaluation/lexical-prompt-ablation.eng-mic.jsonl"
        write_jsonl(benchmark_output, rows)
        manifest = {
            "schema_version": 1,
            "operation": "build_migmaq_lexical_prompt_ablation",
            "dataset_id": output_dir.name,
            "created_at": utc_now(),
            "seed": args.seed,
            "source": {
                "benchmark": {
                    "path": str(benchmark_path),
                    "rows": len(benchmark_rows),
                    "sha256": sha256(benchmark_path),
                },
                "screen_schedule": {
                    "path": str(schedule_path),
                    "rows": sum(1 for _ in schedule_path.open(encoding="utf-8")),
                    "sha256": sha256(schedule_path),
                },
            },
            "contract": {
                "sample_rows": len(sample),
                "variants": list(VARIANTS),
                "same_pos_shuffled": "deterministic cyclic derangement within each recorded part-of-speech class",
                "pos_only": "diagnostic only; its anchor reference is not a valid translation target",
                "claim_limit": "This diagnostic tests prompt sensitivity on the preregistered v3.1 lexical sample. Every trained candidate still requires the full 14,438-row census.",
            },
            "counts": {
                "rows": len(rows),
                "anchors": len(sample),
                "variants": dict(
                    sorted(Counter(row["ablation_variant"] for row in rows).items())
                ),
                "part_of_speech_anchors": dict(
                    sorted(
                        Counter(
                            str(row.get("part_of_speech") or "null") for row in sample
                        ).items()
                    )
                ),
            },
            "builder": {
                "path": str(Path(__file__).resolve()),
                "sha256": sha256(Path(__file__).resolve()),
            },
            "outputs": {
                "evaluation/lexical-prompt-ablation.eng-mic.jsonl": {
                    "rows": len(rows),
                    "sha256": sha256(benchmark_output),
                }
            },
        }
        manifest_path = staging / "manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        with (staging / "SHA256SUMS").open("w", encoding="utf-8") as handle:
            for path in (benchmark_output, manifest_path):
                handle.write(f"{sha256(path)}  {path.relative_to(staging)}\n")
        staging.rename(output_dir)
    print(json.dumps(manifest["counts"], indent=2, sort_keys=True))
    print(f"output={output_dir}")


if __name__ == "__main__":
    main()

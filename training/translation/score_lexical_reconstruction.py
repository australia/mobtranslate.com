#!/usr/bin/env python3
"""Score closed-set lexical predictions with accepted-reference exact match."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import tempfile
import unicodedata
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", action="append", required=True, metavar="LABEL=PATH")
    parser.add_argument("--gate-lower-bound", type=float, default=0.80)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def normalize(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).casefold().split())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def labeled_paths(values: list[str]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for value in values:
        label, separator, raw_path = value.partition("=")
        path = Path(raw_path).expanduser().resolve()
        if not separator or not label.strip() or not raw_path.strip():
            raise ValueError(f"invalid candidate {value!r}; expected LABEL=PATH")
        if label in result:
            raise ValueError(f"duplicate candidate label: {label}")
        if not path.is_file():
            raise FileNotFoundError(path)
        result[label] = path
    return result


def load_predictions(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("predictions")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"prediction payload has no rows: {path}")
    return rows


def references(row: dict[str, Any]) -> list[str]:
    values = [normalize(value) for value in row.get("accepted_references") or []]
    values = [value for value in values if value]
    if not values:
        selected = normalize(row.get("reference") or row.get("output_text"))
        values = [selected] if selected else []
    if not values:
        raise ValueError(f"row lacks a reference: {row.get('id')}")
    return list(dict.fromkeys(values))


def row_result(row: dict[str, Any]) -> dict[str, Any]:
    prediction = normalize(row.get("prediction"))
    accepted = references(row)
    selected = normalize(row.get("reference") or row.get("output_text"))
    source = normalize(row.get("unconditioned_input_text") or row.get("input_text"))
    return {
        "accepted_exact": prediction in accepted,
        "selected_exact": prediction == selected,
        "empty": not prediction,
        "source_copy": prediction == source,
        "prediction": prediction,
    }


def source_word_bucket(row: dict[str, Any]) -> str:
    count = len(normalize(row.get("unconditioned_input_text") or row.get("input_text")).split())
    if count == 1:
        return "1"
    if count == 2:
        return "2"
    if count <= 5:
        return "3-5"
    return "6+"


def parts_of_speech(row: dict[str, Any]) -> list[str]:
    explicit = row.get("parts_of_speech") or []
    if explicit:
        return [normalize(value).removeprefix("lexinfo:") or "unknown" for value in explicit]
    records = (row.get("curated_dictionary") or {}).get("entry_records") or []
    values = [normalize(record.get("type")) for record in records if normalize(record.get("type"))]
    return list(dict.fromkeys(values)) or ["unknown"]


def summarize(rows: list[dict[str, Any]], gate: float) -> dict[str, Any]:
    results = [row_result(row) for row in rows]
    exact = sum(result["accepted_exact"] for result in results)
    interval = wilson(exact, len(rows))
    strata: dict[str, dict[str, list[bool]]] = defaultdict(lambda: defaultdict(list))
    for row, result in zip(rows, results, strict=True):
        strata["source_word_count"][source_word_bucket(row)].append(result["accepted_exact"])
        ambiguity = len(references(row)) > 1
        strata["multiple_accepted_references"][str(ambiguity).lower()].append(result["accepted_exact"])
        identity = normalize(row.get("unconditioned_input_text")) in references(row)
        strata["identity_mapping"][str(identity).lower()].append(result["accepted_exact"])
        for part_of_speech in parts_of_speech(row):
            strata["part_of_speech"][part_of_speech].append(result["accepted_exact"])
    return {
        "rows": len(rows),
        "accepted_exact_count": exact,
        "accepted_exact_percent": 100 * exact / len(rows),
        "selected_exact_count": sum(result["selected_exact"] for result in results),
        "wilson_95": interval,
        "passes_confidence_adjusted_gate": interval["low"] >= gate,
        "empty_outputs": sum(result["empty"] for result in results),
        "source_copy_outputs": sum(result["source_copy"] for result in results),
        "most_common_predictions": Counter(result["prediction"] for result in results).most_common(20),
        "strata": {
            name: {
                value: {
                    "rows": len(values),
                    "accepted_exact_count": sum(values),
                    "accepted_exact_percent": 100 * sum(values) / len(values),
                }
                for value, values in sorted(groups.items())
            }
            for name, groups in sorted(strata.items())
        },
    }


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"refusing existing output: {path}")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    if not 0 < args.gate_lower_bound < 1:
        raise SystemExit("--gate-lower-bound must be between zero and one")
    paths = labeled_paths(args.candidate)
    models = {
        label: {
            **summarize(load_predictions(path), args.gate_lower_bound),
            "prediction_file": str(path),
            "prediction_sha256": sha256(path),
        }
        for label, path in paths.items()
    }
    ranked = sorted(
        models,
        key=lambda label: (
            -models[label]["accepted_exact_count"],
            -models[label]["wilson_95"]["low"],
            models[label]["empty_outputs"],
            label,
        ),
    )
    output = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis_kind": "closed_set_lexical_reconstruction_calibration",
        "gate_lower_bound": args.gate_lower_bound,
        "models": models,
        "ranking": ranked,
        "selected_label": ranked[0],
        "interpretation": (
            "Every candidate must be interpreted according to its dataset contract. Training-set reconstruction "
            "measures memorization/capacity and does not estimate unseen lexical or sentence translation quality."
        ),
    }
    write_json_atomic(args.output, output)
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

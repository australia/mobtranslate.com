#!/usr/bin/env python3
"""Build the model-bound Kuku Yalanji lexical-reconstruction gate."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
from typing import Any


Z_95 = 1.959963984540054


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexicon-audit", type=Path, required=True)
    parser.add_argument("--model-label", default="candidate")
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--model-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--minimum-rows", type=int, default=297)
    parser.add_argument("--minimum-exact-rate", type=float, default=0.80)
    parser.add_argument("--minimum-wilson-lower", type=float, default=0.80)
    return parser.parse_args()


def wilson_interval(successes: int, rows: int, z: float = Z_95) -> tuple[float, float]:
    if rows <= 0:
        raise ValueError("rows must be positive")
    if not 0 <= successes <= rows:
        raise ValueError("successes must be between zero and rows")
    rate = successes / rows
    denominator = 1 + z * z / rows
    center = rate + z * z / (2 * rows)
    margin = z * math.sqrt(rate * (1 - rate) / rows + z * z / (4 * rows * rows))
    return (center - margin) / denominator, (center + margin) / denominator


def required_successes(rows: int, point_floor: float, lower_floor: float) -> int:
    for successes in range(rows + 1):
        rate = successes / rows
        lower, _ = wilson_interval(successes, rows)
        if rate >= point_floor and lower >= lower_floor:
            return successes
    raise ValueError("configured thresholds cannot be reached")


def load_object(path: Path) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return document


def main() -> int:
    args = parse_args()
    if args.minimum_rows <= 0:
        raise ValueError("--minimum-rows must be positive")
    for name, value in (
        ("--minimum-exact-rate", args.minimum_exact_rate),
        ("--minimum-wilson-lower", args.minimum_wilson_lower),
    ):
        if not 0 <= value <= 1:
            raise ValueError(f"{name} must be between zero and one")
    model_sha256 = args.model_sha256.casefold()
    if not re.fullmatch(r"[0-9a-f]{64}", model_sha256):
        raise ValueError("--model-sha256 must be 64 hexadecimal characters")

    audit = load_object(args.lexicon_audit)
    model = (audit.get("models") or {}).get(args.model_label)
    if not isinstance(model, dict):
        raise ValueError(f"model label is absent from lexicon audit: {args.model_label!r}")
    overall = ((model.get("lexicon") or {}).get("overall") or {})
    rows = int(overall.get("rows") or 0)
    exact = int(overall.get("normalized_exact_count") or 0)
    empty = int(overall.get("empty_outputs") or 0)
    if rows <= 0:
        raise ValueError("lexicon audit has no evaluated rows")
    lower, upper = wilson_interval(exact, rows)
    rate = exact / rows
    checks = {
        "benchmark_rows_at_least_minimum": rows >= args.minimum_rows,
        "normalized_accepted_reference_exact_rate_ge_0_80": rate >= args.minimum_exact_rate,
        "wilson_95_lower_bound_ge_0_80": lower >= args.minimum_wilson_lower,
        "empty_outputs_zero": empty == 0,
    }
    status = "PASS" if all(checks.values()) else "FAIL"
    output = {
        "schema_version": 2,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "gate_type": "model_lexical_reconstruction",
        "status": status,
        "decision": (
            "MODEL_LEXICAL_RECONSTRUCTION_ALLOWED"
            if status == "PASS"
            else "MODEL_LEXICAL_RECONSTRUCTION_PROHIBITED"
        ),
        "model_label": args.model_label,
        "model": {
            "id": args.model_id,
            "merged_model_sha256": model_sha256,
        },
        "checks": checks,
        "benchmark": {
            "direction": "eng-gvn",
            "unit": "one unique English dictionary gloss with every canonical Kuku Yalanji headword accepted",
            "rows": rows,
            "normalized_exact_count": exact,
            "normalized_exact_rate": rate,
            "normalized_exact_percent": rate * 100,
            "empty_outputs": empty,
            "wilson_95_interval": [lower, upper],
            "minimum_rows": args.minimum_rows,
            "minimum_exact_rate": args.minimum_exact_rate,
            "minimum_wilson_lower": args.minimum_wilson_lower,
            "required_successes_at_observed_rows": required_successes(
                rows,
                args.minimum_exact_rate,
                args.minimum_wilson_lower,
            ),
        },
        "policy": {
            "scope": (
                "Closed-set model lexical reconstruction on the frozen 297-prompt benchmark; "
                "this gate does not authorize free-form sentence generation or certify dictionary data."
            ),
            "authorizes_on_pass": ["model_lexical_reconstruction"],
            "does_not_authorize": ["dictionary_router", "sentence_generation", "community_certification"],
            "research_promotion_is_not_deployment_permission": True,
            "failed_gate_action": (
                "Keep all Kuku Yalanji custom-model CPU services stopped and disabled. "
                "Preserve compact benchmark evidence; do not mount model weights."
            ),
            "reverse_direction": (
                "This audit covers the current English-to-Kuku-Yalanji service. Any future "
                "Kuku-Yalanji-to-English service requires its own reverse headword benchmark "
                "and the same thresholds before deployment."
            ),
            "interpretation": (
                "Normalized exact match accepts any canonical dictionary headword registered "
                "for the English gloss. chrF, token containment, and approximate spelling do "
                "not count toward the threshold. The Wilson rule is a conservative acceptance "
                "rule for this frozen constructed benchmark, not an estimate of reliability for "
                "future user requests."
            ),
            "population_reliability_claim_allowed": False,
        },
        "source_audit": str(args.lexicon_audit),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

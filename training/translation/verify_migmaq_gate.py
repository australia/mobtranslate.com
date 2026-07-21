#!/usr/bin/env python3
"""Issue a machine-readable verdict for the Mi'gmaq custom-token plumbing gate."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--min-overfit-chrf", type=float, default=65.0)
    parser.add_argument("--min-overfit-exact", type=float, default=0.15)
    parser.add_argument("--max-train-loss", type=float, default=2.0)
    return parser.parse_args()


def read_json(file: Path) -> dict[str, Any]:
    return json.loads(file.read_text(encoding="utf-8"))


def main() -> None:
    args = parse_args()
    run_dir = Path(args.run_dir)
    manifest_file = run_dir / "model" / "model_manifest.json"
    overfit_file = run_dir / "overfit-evaluation.json"
    sanity_file = run_dir / "sanity-evaluation.json"
    required_files = [
        manifest_file,
        overfit_file,
        sanity_file,
        run_dir / "model" / "adapter" / "adapter_config.json",
        run_dir / "model" / "merged" / "config.json",
        run_dir / "model" / "merged" / "tokenizer_config.json",
    ]

    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, observed: Any, required: Any) -> None:
        checks.append({"name": name, "passed": bool(passed), "observed": observed, "required": required})

    missing = [str(file) for file in required_files if not file.is_file()]
    check("required_artifacts", not missing, missing, "no missing files")
    if missing:
        verdict = {"status": "fail", "checks": checks}
        Path(args.output).write_text(json.dumps(verdict, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(verdict, indent=2))
        raise SystemExit(1)

    manifest = read_json(manifest_file)
    overfit = read_json(overfit_file)
    sanity = read_json(sanity_file)
    train_metrics = manifest.get("metrics", {}).get("train", {})
    logged_losses = [
        float(item["loss"])
        for item in manifest.get("trainer_state", {}).get("log_history", [])
        if item.get("loss") is not None
    ]
    final_logged_loss = logged_losses[-1] if logged_losses else float("inf")
    overfit_metrics = overfit.get("metrics", {})
    sanity_metrics = sanity.get("metrics", {})
    target_id = manifest.get("target_lang_token_id")
    source_id = manifest.get("source_lang_token_id")
    sanity_predictions = [str(row.get("prediction", "")) for row in sanity.get("predictions", [])]

    check("model_identity", manifest.get("model_id") == "mobtranslate/migmaq-nllb-lora", manifest.get("model_id"), "mobtranslate/migmaq-nllb-lora")
    check("direction", manifest.get("direction") == "eng-mic", manifest.get("direction"), "eng-mic")
    check("custom_target_token", isinstance(target_id, int) and target_id != source_id, {"target": target_id, "source": source_id}, "distinct integer token IDs")
    check("gate_row_count", manifest.get("dataset", {}).get("split_rows") == {"train": 128, "validation": 128}, manifest.get("dataset", {}).get("split_rows"), {"train": 128, "validation": 128})
    check("final_logged_train_loss", final_logged_loss <= args.max_train_loss, final_logged_loss, f"<= {args.max_train_loss}")
    check("loss_reduction", len(logged_losses) >= 2 and logged_losses[-1] < logged_losses[0] * 0.5, {"first": logged_losses[0] if logged_losses else None, "last": logged_losses[-1] if logged_losses else None}, "last < 50% of first")
    check("overfit_chrf", float(overfit_metrics.get("chrf", 0.0)) >= args.min_overfit_chrf, overfit_metrics.get("chrf"), f">= {args.min_overfit_chrf}")
    check("overfit_exact", float(overfit_metrics.get("exact_match", 0.0)) >= args.min_overfit_exact, overfit_metrics.get("exact_match"), f">= {args.min_overfit_exact}")
    check("overfit_nonempty", int(overfit_metrics.get("empty_outputs", 1)) == 0, overfit_metrics.get("empty_outputs"), 0)
    check("sanity_nonempty", int(sanity_metrics.get("empty_outputs", 1)) == 0, sanity_metrics.get("empty_outputs"), 0)
    check("sanity_output_diversity", len(set(sanity_predictions)) >= 8, len(set(sanity_predictions)), ">= 8 unique outputs")

    passed = all(item["passed"] for item in checks)
    verdict = {
        "status": "pass" if passed else "fail",
        "purpose": "custom-token/save/merge/generation plumbing; not a held-out quality result",
        "thresholds": {
            "min_overfit_chrf": args.min_overfit_chrf,
            "min_overfit_exact": args.min_overfit_exact,
            "max_train_loss": args.max_train_loss,
        },
        "checks": checks,
    }
    Path(args.output).write_text(json.dumps(verdict, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(verdict, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

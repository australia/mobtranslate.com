#!/usr/bin/env python3
"""Build controlled Mi'kmaq sentence-LoRA schedules from the frozen v0.3 pools.

The treatment substitutes glossary-conditioned attested sentence rows for a
fixed share of ordinary attested sentence presentations. Both arms retain the
same 5% structurally filtered raw-lexeme lane. Selection and replay schedules
are deterministic and every source artifact is checksum-bound.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import tempfile
from typing import Any, Iterable

try:
    from .build_migmaq_v2_multitask import scheduled_replay, stable_order, word_tokens
    from .compare_migmaq_v2_screen import sha256
except ImportError:
    from build_migmaq_v2_multitask import scheduled_replay, stable_order, word_tokens
    from compare_migmaq_v2_screen import sha256


SCREEN_PRESENTATIONS = 19_200
FULL_PRESENTATIONS = 76_800
LEXICAL_SHARE = 0.05
GLOSSARY_SHARE = 0.25


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-release", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260720)
    parser.add_argument("--lexical-pool-size", type=int, default=3_840)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"non-object row at {path}:{line_number}")
            rows.append(row)
    return rows


def unique_ids(rows: Iterable[dict[str, Any]], label: str) -> None:
    ids = [str(row.get("id") or "") for row in rows]
    if any(not row_id for row_id in ids):
        raise ValueError(f"{label} contains a blank ID")
    if len(ids) != len(set(ids)):
        raise ValueError(f"{label} contains duplicate IDs")


def lexical_structure(row: dict[str, Any]) -> dict[str, Any]:
    source_words = len(word_tokens(row.get("unconditioned_input_text")))
    target_words = len(word_tokens(row.get("output_text")))
    reasons: list[str] = []
    if not 1 <= source_words <= 2:
        reasons.append("source_gloss_not_one_or_two_words")
    if target_words != 1:
        reasons.append("target_not_one_word")
    return {
        "source_gloss_words": source_words,
        "target_words": target_words,
        "structurally_eligible": not reasons,
        "exclusion_reasons": reasons,
    }


def allocate_stratified_quotas(
    group_sizes: dict[str, int],
    target_rows: int,
    *,
    seed: int,
) -> dict[str, int]:
    if target_rows < len(group_sizes):
        raise ValueError("target is too small to preserve every observed stratum")
    if target_rows > sum(group_sizes.values()):
        raise ValueError("target exceeds the eligible pool")

    quotas = {label: 1 for label in group_sizes}
    remaining = target_rows - len(quotas)
    residual_sizes = {label: size - 1 for label, size in group_sizes.items()}
    residual_total = sum(residual_sizes.values())
    ideals = {
        label: (remaining * residual_sizes[label] / residual_total if residual_total else 0.0)
        for label in group_sizes
    }
    for label, ideal in ideals.items():
        quotas[label] += math.floor(ideal)

    unallocated = target_rows - sum(quotas.values())
    ranking = sorted(
        group_sizes,
        key=lambda label: (
            -(ideals[label] - math.floor(ideals[label])),
            hashlib.sha256(f"{seed}:quota-tie:{label}".encode()).hexdigest(),
            label,
        ),
    )
    for label in ranking:
        if unallocated == 0:
            break
        if quotas[label] < group_sizes[label]:
            quotas[label] += 1
            unallocated -= 1
    if unallocated or sum(quotas.values()) != target_rows:
        raise RuntimeError("could not allocate the exact stratified lexical quota")
    return quotas


def select_lexical_pool(
    rows: list[dict[str, Any]], target_rows: int, *, seed: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    unique_ids(rows, "lexical source pool")
    structure = {str(row["id"]): lexical_structure(row) for row in rows}
    eligible = [row for row in rows if structure[str(row["id"])]["structurally_eligible"]]
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in eligible:
        groups[str(row.get("part_of_speech") or "(missing)")].append(row)
    quotas = allocate_stratified_quotas(
        {label: len(members) for label, members in groups.items()}, target_rows, seed=seed
    )

    selected: list[dict[str, Any]] = []
    for label, members in sorted(groups.items()):
        ordered = stable_order(members, seed, f"lexical-selection/{label}")
        selected.extend(ordered[: quotas[label]])
    selected = stable_order(selected, seed, "lexical-selection/final")
    selected_ids = {str(row["id"]) for row in selected}

    ledger = [
        {
            "id": str(row["id"]),
            "part_of_speech": row.get("part_of_speech"),
            **structure[str(row["id"])],
            "selected": str(row["id"]) in selected_ids,
        }
        for row in sorted(rows, key=lambda item: str(item["id"]))
    ]
    audit = {
        "source_rows": len(rows),
        "structurally_eligible_rows": len(eligible),
        "selected_rows": len(selected),
        "selection_criteria": {
            "source_gloss_words_minimum": 1,
            "source_gloss_words_maximum": 2,
            "target_words": 1,
            "stratification": "proportional by observed part_of_speech with at least one row per stratum",
            "within_stratum_order": "sha256(seed:label:id)",
        },
        "eligible_part_of_speech_counts": dict(
            sorted(Counter(str(row.get("part_of_speech") or "(missing)") for row in eligible).items())
        ),
        "selected_part_of_speech_counts": dict(
            sorted(Counter(str(row.get("part_of_speech") or "(missing)") for row in selected).items())
        ),
        "selected_source_gloss_word_counts": dict(
            sorted(Counter(len(word_tokens(row["unconditioned_input_text"])) for row in selected).items())
        ),
    }
    return selected, ledger, audit


def quotas(total: int, *, glossary: bool) -> dict[str, int]:
    lexical = round(total * LEXICAL_SHARE)
    glossary_rows = round(total * GLOSSARY_SHARE) if glossary else 0
    sentence = total - lexical - glossary_rows
    if sentence + glossary_rows + lexical != total:
        raise RuntimeError("schedule quotas do not sum to the requested horizon")
    return {"translate": sentence, "glossary_translation": glossary_rows, "lexeme": lexical}


def _control_from_glossary_row(row: dict[str, Any]) -> dict[str, Any]:
    source = str(row.get("unconditioned_input_text") or "").strip()
    if not source:
        raise ValueError(f"glossary row has no unconditioned source: {row.get('id')}")
    return {
        **row,
        "input_text": f"<translate> {source}",
        "pair_kind": "attested_dictionary_example_translation",
        "task": "translate",
        "task_prefix": "<translate>",
        "glossary_condition": "withheld_for_paired_control",
    }


def _schedule_audit(schedule: list[dict[str, Any]]) -> dict[str, Any]:
    source_counts = Counter(str(row["schedule_source_id"]) for row in schedule)
    task_counts = Counter(str(row["task"]) for row in schedule)
    return {
        "rows": len(schedule),
        "task_quotas": {
            "translate": task_counts["translate"],
            "glossary_translation": task_counts["glossary_translation"],
            "lexeme": task_counts["lexeme"],
        },
        "task_proportions": {
            label: task_counts[label] / len(schedule)
            for label in ("translate", "glossary_translation", "lexeme")
        },
        "unique_source_rows": len(source_counts),
        "source_presentations_minimum": min(source_counts.values()),
        "source_presentations_maximum": max(source_counts.values()),
        "source_presentations_mean": sum(source_counts.values()) / len(source_counts),
        "lexical_source_rows": len(
            {str(row["schedule_source_id"]) for row in schedule if row["task"] == "lexeme"}
        ),
    }


def build_paired_schedules(
    *,
    sentence_rows: list[dict[str, Any]],
    glossary_rows: list[dict[str, Any]],
    lexical_rows: list[dict[str, Any]],
    total: int,
    seed: int,
    horizon_label: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    treatment_quotas = quotas(total, glossary=True)
    lexical_pool = stable_order(lexical_rows, seed, f"{horizon_label}/lexical-pool")[
        : treatment_quotas["lexeme"]
    ]
    common = scheduled_replay(
        sentence_rows,
        treatment_quotas["translate"],
        seed=seed,
        label=f"{horizon_label}-common-sentence",
    )
    treatment_contrast = scheduled_replay(
        glossary_rows,
        treatment_quotas["glossary_translation"],
        seed=seed,
        label=f"{horizon_label}-glossary-contrast",
    )
    control_contrast = [_control_from_glossary_row(row) for row in treatment_contrast]
    lexical = scheduled_replay(
        lexical_pool,
        treatment_quotas["lexeme"],
        seed=seed,
        label=f"{horizon_label}-lexical",
    )
    control = stable_order(common + control_contrast + lexical, seed, f"{horizon_label}/schedule-order")
    treatment = stable_order(
        common + treatment_contrast + lexical, seed, f"{horizon_label}/schedule-order"
    )
    unique_ids(control, f"control-{horizon_label}")
    unique_ids(treatment, f"glossary-{horizon_label}")
    if len(control) != total or len(treatment) != total:
        raise RuntimeError(
            f"paired {horizon_label} schedules have control={len(control)}, "
            f"treatment={len(treatment)}, expected={total}"
        )

    paired_input_changes = 0
    for control_row, treatment_row in zip(control, treatment, strict=True):
        if control_row["id"] != treatment_row["id"]:
            raise RuntimeError(f"paired schedule IDs diverged at {horizon_label}")
        if control_row["output_text"] != treatment_row["output_text"]:
            raise RuntimeError(f"paired schedule targets diverged at {control_row['id']}")
        if control_row["input_text"] != treatment_row["input_text"]:
            paired_input_changes += 1
            if treatment_row["task"] != "glossary_translation" or control_row["task"] != "translate":
                raise RuntimeError(f"non-glossary paired input changed at {control_row['id']}")
    if paired_input_changes != treatment_quotas["glossary_translation"]:
        raise RuntimeError(
            f"paired input changes={paired_input_changes}, "
            f"expected={treatment_quotas['glossary_translation']}"
        )

    return control, treatment, {
        "control": _schedule_audit(control),
        "glossary": _schedule_audit(treatment),
        "pairing": {
            "paired_positions": total,
            "identical_ids": True,
            "identical_targets": True,
            "input_only_changed_positions": paired_input_changes,
            "unchanged_positions": total - paired_input_changes,
            "changed_position_share": paired_input_changes / total,
            "lexical_source_ids_identical": True,
            "trainer_sampler_seed_must_match": True,
        },
    }


def write_jsonl_atomic(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def output_record(path: Path, rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "path": str(path.resolve()),
        "sha256": sha256(path),
        "rows": len(rows),
        "unique_ids": len({str(row["id"]) for row in rows}),
        "task_counts": dict(sorted(Counter(str(row.get("task")) for row in rows).items())),
    }


def main() -> None:
    args = parse_args()
    source_release = args.source_release.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)
    (output_dir / "pools").mkdir()
    (output_dir / "schedules").mkdir()

    source_paths = {
        "manifest": source_release / "manifest.json",
        "sentence_train": source_release / "pools/sentence-train.eng-mic.jsonl",
        "glossary_train": source_release / "pools/glossary-train.eng-mic.jsonl",
        "lexical_clean": source_release / "pools/lexical-clean.eng-mic.jsonl",
    }
    for path in source_paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)
    sentence_rows = read_jsonl(source_paths["sentence_train"])
    glossary_rows = read_jsonl(source_paths["glossary_train"])
    lexical_rows = read_jsonl(source_paths["lexical_clean"])
    selected_lexical, selection_ledger, selection_audit = select_lexical_pool(
        lexical_rows, args.lexical_pool_size, seed=args.seed
    )

    selected_path = output_dir / "pools/lexical-structural-3840.eng-mic.jsonl"
    ledger_path = output_dir / "pools/lexical-selection-ledger.jsonl"
    write_jsonl_atomic(selected_path, selected_lexical)
    write_jsonl_atomic(ledger_path, selection_ledger)

    outputs: dict[str, Any] = {
        "pools/lexical-structural-3840": output_record(selected_path, selected_lexical),
        "pools/lexical-selection-ledger": output_record(ledger_path, selection_ledger),
    }
    schedule_audits: dict[str, Any] = {}
    for total, horizon in ((SCREEN_PRESENTATIONS, "screen-600"), (FULL_PRESENTATIONS, "full-2400")):
        control, treatment, paired_audit = build_paired_schedules(
            sentence_rows=sentence_rows,
            glossary_rows=glossary_rows,
            lexical_rows=selected_lexical,
            total=total,
            seed=args.seed,
            horizon_label=horizon,
        )
        for arm, schedule in (("control", control), ("glossary", treatment)):
            label = f"{arm}-{horizon}"
            path = output_dir / "schedules" / f"{label}.eng-mic.jsonl"
            write_jsonl_atomic(path, schedule)
            outputs[f"schedules/{label}"] = output_record(path, schedule)
            schedule_audits[label] = paired_audit[arm]
        schedule_audits[f"paired-{horizon}"] = paired_audit["pairing"]

    manifest = {
        "schema_version": 1,
        "dataset_id": "migmaq-v3-sentence-lora-schedules-v0.1.1-20260720",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operation": "controlled_sentence_lora_schedule_builder",
        "seed": args.seed,
        "source_release": {
            key: {"path": str(path), "sha256": sha256(path)} for key, path in source_paths.items()
        },
        "claims": {
            "sentence_rows": "Source-attested Mi'kmaq Online dictionary example translations.",
            "glossary_rows": (
                "Source-attested sentence targets whose supplied dictionary headword occurs as a "
                "normalized whole-word sequence in that target."
            ),
            "lexical_rows": (
                "Structurally filtered source-dictionary reconstruction pairs; not a human-adjudicated "
                "frequency list and not evidence of productive lexical generalization."
            ),
        },
        "experimental_contrast": {
            "control": (
                "70% common ordinary sentence presentations, 25% paired ordinary versions of the "
                "treatment's glossary rows, and 5% raw lexeme pairs."
            ),
            "treatment": (
                "70% ordinary attested sentence translation, 25% glossary-conditioned versions of "
                "attested sentence pairs, and the same 5% raw-lexeme lane."
            ),
            "causal_question": (
                "At fixed optimizer updates, does replacing ordinary sentence replay with "
                "glossary-conditioned attested sentence replay improve lexicon uptake without "
                "degrading unconditioned sentence translation?"
            ),
            "token_accounting": (
                "Examples and updates are matched. Source and total non-padding tokens are measured "
                "outcomes because glossary prompts are longer."
            ),
            "paired_randomization": (
                "The two files have identical row IDs, order, target sequence, common sentence rows, "
                "and lexical rows. Exactly 25% of inputs differ by presence of an attested glossary hint."
            ),
        },
        "method_provenance": {
            "gatitos_paper": "https://aclanthology.org/2023.emnlp-main.26/",
            "adopted": [
                "5% raw token-pair task weight",
                "separate task controls",
                "lexical prompting attached to sentence targets",
                "preference for a smaller structurally cleaner lexicon over indiscriminate volume",
            ],
            "departure": (
                "The treatment uses source-attested Mi'kmaq dictionary examples rather than web-mined "
                "monolingual or massively multilingual data."
            ),
        },
        "lexical_selection": selection_audit,
        "schedule_audits": schedule_audits,
        "outputs": outputs,
    }
    write_json_atomic(output_dir / "manifest.json", manifest)
    files = sorted(path for path in output_dir.rglob("*") if path.is_file())
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.relative_to(output_dir)}\n" for path in files),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output_dir": str(output_dir),
                "lexical_selection": selection_audit,
                "schedules": schedule_audits,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

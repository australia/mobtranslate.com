#!/usr/bin/env python3
"""Build task-separated Mi'kmaq v2 treatment pools and fixed comparison mixtures."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unicodedata
from typing import Any, Iterable


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
WORD_RE = re.compile(r"[^\W_]+(?:['\u2019\u02bc-][^\W_]+)*", re.UNICODE)
HELDOUT_LINEAGES = {"validation", "test"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexical-benchmark", type=Path, required=True)
    parser.add_argument("--entries", type=Path, required=True)
    parser.add_argument("--forms", type=Path, required=True)
    parser.add_argument("--sentence-train", type=Path, required=True)
    parser.add_argument("--sentence-validation", type=Path, required=True)
    parser.add_argument("--sentence-test", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260720)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_text(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFC", str(value or "")).translate(QUOTE_FOLD).split())


def migmaq_model_text(value: Any) -> str:
    """Convert source-site headword layout into ordinary model-facing Mi'kmaq text."""
    return model_text(str(value or "").replace("_", " "))


def comparison_text(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).translate(QUOTE_FOLD).casefold().split())


def word_tokens(value: Any) -> list[str]:
    return [comparison_text(token) for token in WORD_RE.findall(model_text(value))]


def contains_word_sequence(text: Any, phrase: Any) -> bool:
    text_tokens = word_tokens(migmaq_model_text(text))
    phrase_tokens = word_tokens(migmaq_model_text(phrase))
    if not phrase_tokens or len(phrase_tokens) > len(text_tokens):
        return False
    width = len(phrase_tokens)
    return any(text_tokens[index : index + width] == phrase_tokens for index in range(len(text_tokens) - width + 1))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"non-object JSON at {path}:{line_number}")
            rows.append(row)
    return rows


def stable_order(rows: list[dict[str, Any]], seed: int, label: str) -> list[dict[str, Any]]:
    def key(row: dict[str, Any]) -> tuple[str, str]:
        row_id = str(row["id"])
        digest = hashlib.sha256(f"{seed}:{label}:{row_id}".encode()).hexdigest()
        return digest, row_id

    return sorted(rows, key=key)


def has_heldout_lineage(row: dict[str, Any]) -> bool:
    return bool(HELDOUT_LINEAGES & {str(value) for value in row.get("legacy_v1_splits") or []})


def sentence_task_row(row: dict[str, Any], split: str) -> dict[str, Any]:
    if row.get("direction") != "eng-mic":
        raise ValueError(f"unexpected sentence direction for {row.get('id')}: {row.get('direction')}")
    source = model_text(row.get("input_text"))
    source_layout_target = model_text(row.get("output_text"))
    target = migmaq_model_text(source_layout_target)
    if not source or not target:
        raise ValueError(f"blank sentence pair: {row.get('id')}")
    result = {
        **row,
        "id": f"{row['id']}:task-translate",
        "split": split,
        "input_text": f"<translate> {source}",
        "unconditioned_input_text": source,
        "output_text": target,
        "pair_kind": "attested_dictionary_example_translation",
        "task": "translate",
        "task_prefix": "<translate>",
        "source_text_transform": "NFC_quote_fold_whitespace_collapse",
        "target_text_transform": "NFC_quote_fold_source_layout_underscore_to_space_whitespace_collapse",
    }
    if source_layout_target != target:
        result["source_layout_output_text"] = source_layout_target
    return result


def lexical_task_row(row: dict[str, Any], split: str) -> dict[str, Any]:
    source_references = [model_text(value) for value in row.get("accepted_references") or []]
    source_references = list(dict.fromkeys(value for value in source_references if value))
    references = [migmaq_model_text(value) for value in source_references]
    references = list(dict.fromkeys(value for value in references if value))
    if len(references) != 1:
        raise ValueError(f"exact-ready lexical row does not have one target: {row.get('id')}")
    source = model_text(row.get("unconditioned_input_text"))
    part_of_speech = model_text(row.get("part_of_speech") or "unknown")
    return {
        **row,
        "id": f"{row['id']}:task-lexeme",
        "split": split,
        "input_text": f"<lexeme> {source} <pos> {part_of_speech}",
        "unconditioned_input_text": source,
        "output_text": references[0],
        "accepted_references": references,
        "source_accepted_references": source_references,
        "pair_kind": "source_dictionary_lexical_reconstruction",
        "task": "lexeme",
        "task_prefix": "<lexeme>",
        "direct_pair_exposure": True,
        "promotion_eligible": False,
        "target_text_transform": "NFC_quote_fold_source_layout_underscore_to_space_whitespace_collapse",
    }


def entry_index(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        external_id = str(row.get("external_entry_id") or "")
        if not external_id or external_id in result:
            raise ValueError(f"duplicate or blank external entry ID: {external_id!r}")
        result[external_id] = row
    return result


def glossary_task_row(
    sentence: dict[str, Any], entries: dict[str, dict[str, Any]], split: str,
) -> dict[str, Any] | None:
    pairs: list[tuple[str, str, str, str]] = []
    for record in sentence.get("source_records") or []:
        external_id = str(record.get("entry_id") or "")
        entry = entries.get(external_id)
        if not entry:
            continue
        source_headword = model_text(entry.get("headword"))
        headword = migmaq_model_text(source_headword)
        gloss = model_text(entry.get("primary_translation"))
        if headword and gloss and contains_word_sequence(sentence.get("output_text"), headword):
            pairs.append((gloss, headword, source_headword, str(entry["id"])))
    pairs = list(dict.fromkeys(pairs))
    if not pairs:
        return None
    source = model_text(sentence.get("input_text"))
    source_layout_target = model_text(sentence.get("output_text"))
    target = migmaq_model_text(source_layout_target)
    glossary = "; ".join(f"{gloss} = {headword}" for gloss, headword, _, _ in pairs)
    result = {
        **sentence,
        "id": f"{sentence['id']}:task-glossary",
        "split": split,
        "input_text": f"<translate> {source} <glossary> {glossary}",
        "unconditioned_input_text": source,
        "output_text": target,
        "pair_kind": "attested_glossary_conditioned_translation",
        "task": "glossary_translation",
        "task_prefix": "<translate>",
        "glossary_pairs": [
            {
                "english_gloss": gloss,
                "migmaq_headword": headword,
                "source_layout_headword": source_headword,
                "entry_id": entry_id,
            }
            for gloss, headword, source_headword, entry_id in pairs
        ],
        "glossary_target_headword_surface_attested": True,
        "target_text_transform": "NFC_quote_fold_source_layout_underscore_to_space_whitespace_collapse",
    }
    if source_layout_target != target:
        result["source_layout_output_text"] = source_layout_target
    return result


def morphology_task_row(row: dict[str, Any], entry: dict[str, Any], split: str) -> dict[str, Any] | None:
    if row.get("structure_parse_status") != "source_layout_recovered_unadjudicated":
        return None
    source_headword = model_text(row.get("headword"))
    headword = migmaq_model_text(source_headword)
    gloss = model_text(row.get("english_gloss_candidate"))
    part_of_speech = model_text(row.get("part_of_speech") or "unknown")
    features = model_text(row.get("grammatical_label"))
    source_surface = model_text(row.get("surface_form_candidate"))
    surface = migmaq_model_text(source_surface)
    if not all((headword, gloss, features, surface)):
        return None
    return {
        "schema_version": 1,
        "id": f"{row['id']}:task-inflect",
        "split": split,
        "direction": "eng-mic",
        "source_lang": "eng_Latn",
        "target_lang": "mic_Latn",
        "input_text": (
            f"<inflect> {headword} <gloss> {gloss} <pos> {part_of_speech} <features> {features}"
        ),
        "unconditioned_input_text": gloss,
        "output_text": surface,
        "accepted_references": [surface],
        "pair_kind": "source_dictionary_morphology_reconstruction",
        "task": "inflect",
        "task_prefix": "<inflect>",
        "entry_id": row.get("entry_id"),
        "external_entry_id": row.get("external_entry_id"),
        "headword": headword,
        "source_layout_headword": source_headword,
        "source_layout_surface_form": source_surface,
        "part_of_speech": part_of_speech,
        "grammatical_label": features,
        "source_form_id": row.get("id"),
        "source_analysis_status": row.get("analysis_status"),
        "legacy_v1_splits": [entry["legacy_v1_split"]] if entry.get("legacy_v1_split") else [],
        "direct_form_exposure": True,
        "promotion_eligible": False,
        "interpretation": "Source-layout reconstruction; the grammatical analysis has not been independently adjudicated.",
        "target_text_transform": "NFC_quote_fold_source_layout_underscore_to_space_whitespace_collapse",
    }


def unique_ids(rows: list[dict[str, Any]], label: str) -> None:
    ids = [str(row.get("id") or "") for row in rows]
    if any(not value for value in ids):
        raise ValueError(f"{label} contains a blank ID")
    if len(ids) != len(set(ids)):
        duplicates = [value for value, count in Counter(ids).items() if count > 1][:10]
        raise ValueError(f"{label} has duplicate IDs: {duplicates}")


def control_replay(rows: list[dict[str, Any]], target_rows: int) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for index in range(target_rows):
        source = rows[index % len(rows)]
        cycle = index // len(rows)
        result.append({**source, "id": f"{source['id']}:retention-copy-{cycle}", "replay_copy": cycle})
    return result


def scheduled_replay(
    rows: list[dict[str, Any]], target_rows: int, *, seed: int, label: str,
) -> list[dict[str, Any]]:
    """Produce an exact deterministic task quota with unique presentation IDs."""
    if target_rows < 0:
        raise ValueError("target_rows cannot be negative")
    if target_rows and not rows:
        raise ValueError(f"cannot fill nonzero schedule quota from an empty pool: {label}")
    ordered = stable_order(rows, seed, f"schedule-source/{label}")
    result: list[dict[str, Any]] = []
    retained_fields = (
        "schema_version",
        "direction",
        "source_lang",
        "target_lang",
        "input_text",
        "unconditioned_input_text",
        "output_text",
        "accepted_references",
        "pair_kind",
        "task",
        "task_prefix",
        "split",
        "leakage_group",
        "legacy_v1_splits",
        "part_of_speech",
        "glossary_pairs",
    )
    for index in range(target_rows):
        source = ordered[index % len(ordered)]
        compact = {key: source[key] for key in retained_fields if key in source}
        result.append(
            {
                **compact,
                "id": f"{source['id']}:schedule-{label}-{index}",
                "schedule_source_id": source["id"],
                "schedule_label": label,
                "schedule_presentation_index": index,
                "schedule_cycle": index // len(ordered),
            }
        )
    return result


def phrase_occurrence_counts(texts: Iterable[Any], phrases: Iterable[Any]) -> Counter[tuple[str, ...]]:
    """Count normalized whole-word phrase occurrences without substring matching."""
    phrase_keys = {tuple(word_tokens(phrase)) for phrase in phrases}
    phrase_keys.discard(())
    lengths = sorted({len(key) for key in phrase_keys})
    counts: Counter[tuple[str, ...]] = Counter()
    for text in texts:
        tokens = word_tokens(migmaq_model_text(text))
        for width in lengths:
            if width > len(tokens):
                continue
            for index in range(len(tokens) - width + 1):
                candidate = tuple(tokens[index : index + width])
                if candidate in phrase_keys:
                    counts[candidate] += 1
    return counts


def annotate_glossary_lineage_exposure(
    rows: list[dict[str, Any]],
    *,
    training_target_texts: Iterable[Any],
    direct_lexical_entry_ids: set[str],
    glossary_training_entry_ids: set[str],
) -> list[dict[str, Any]]:
    """Label what can and cannot be claimed as project-lineage lexicon uptake."""
    headwords = [
        pair["migmaq_headword"]
        for row in rows
        for pair in row.get("glossary_pairs") or []
    ]
    surface_counts = phrase_occurrence_counts(training_target_texts, headwords)
    annotated: list[dict[str, Any]] = []
    for row in rows:
        pairs = []
        for pair in row.get("glossary_pairs") or []:
            entry_id = str(pair["entry_id"])
            key = tuple(word_tokens(pair["migmaq_headword"]))
            exposure = {
                "direct_lexical_pair": entry_id in direct_lexical_entry_ids,
                "training_glossary_pair": entry_id in glossary_training_entry_ids,
                "training_target_surface_occurrences": int(surface_counts[key]),
                "upstream_pretraining_exposure": "unknown",
            }
            pairs.append(
                {
                    **pair,
                    "project_lineage_exposure": exposure,
                    "project_lineage_unexposed": (
                        not exposure["direct_lexical_pair"]
                        and not exposure["training_glossary_pair"]
                        and exposure["training_target_surface_occurrences"] == 0
                    ),
                }
            )
        project_unexposed = bool(pairs) and all(
            pair["project_lineage_unexposed"] for pair in pairs
        )
        annotated.append(
            {
                **row,
                "glossary_pairs": pairs,
                "project_lineage_unexposed": project_unexposed,
                "exposure_interpretation": (
                    "Project lineage is auditable; upstream NLLB pretraining exposure remains unknown."
                ),
            }
        )
    return annotated


def glossary_unconditioned_pair(row: dict[str, Any]) -> dict[str, Any]:
    return {
        **row,
        "id": f"{row['id']}:paired-unconditioned",
        "input_text": row["unconditioned_input_text"],
        "pair_kind": "attested_translation_paired_with_glossary_evaluation",
        "task": "translate",
        "task_prefix": None,
        "glossary_provided": False,
        "conditioned_pair_id": row["id"],
    }


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    if path.exists():
        raise FileExistsError(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            count += 1
    return count


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def task_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    return dict(sorted(Counter(str(row.get("task") or row.get("pair_kind")) for row in rows).items()))


def output_record(path: Path, rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "path": str(path),
        "rows": len(rows),
        "unique_ids": len({str(row["id"]) for row in rows}),
        "sha256": sha256(path),
        "task_counts": task_counts(rows),
    }


def main() -> None:
    args = parse_args()
    sources = {
        "lexical_benchmark": args.lexical_benchmark.expanduser().resolve(),
        "entries": args.entries.expanduser().resolve(),
        "forms": args.forms.expanduser().resolve(),
        "sentence_train": args.sentence_train.expanduser().resolve(),
        "sentence_validation": args.sentence_validation.expanduser().resolve(),
        "sentence_test": args.sentence_test.expanduser().resolve(),
    }
    for path in sources.values():
        if not path.is_file():
            raise FileNotFoundError(path)
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.mkdir(parents=True)

    entry_rows = read_jsonl(sources["entries"])
    entries_by_external = entry_index(entry_rows)
    entries_by_id = {str(row["id"]): row for row in entry_rows}

    raw_sentence_train = read_jsonl(sources["sentence_train"])
    raw_sentence_validation = read_jsonl(sources["sentence_validation"])
    raw_sentence_test = read_jsonl(sources["sentence_test"])
    sentence_train = [sentence_task_row(row, "train") for row in raw_sentence_train]
    sentence_validation = [sentence_task_row(row, "validation") for row in raw_sentence_validation]
    sentence_test = [sentence_task_row(row, "test_opened_regression") for row in raw_sentence_test]

    raw_lexical = read_jsonl(sources["lexical_benchmark"])
    lexical_all = [lexical_task_row(row, "direct_reconstruction") for row in raw_lexical]
    lexical_clean = [row for row in lexical_all if not has_heldout_lineage(row)]
    lexical_heldout = [row for row in lexical_all if has_heldout_lineage(row)]

    glossary_train = [
        result
        for row in raw_sentence_train
        if (result := glossary_task_row(row, entries_by_external, "train")) is not None
    ]
    glossary_validation = [
        result
        for row in raw_sentence_validation
        if (result := glossary_task_row(row, entries_by_external, "validation")) is not None
    ]
    glossary_test = [
        result
        for row in raw_sentence_test
        if (result := glossary_task_row(row, entries_by_external, "test_opened_regression"))
        is not None
    ]

    morphology_all: list[dict[str, Any]] = []
    for row in read_jsonl(sources["forms"]):
        entry = entries_by_id.get(str(row.get("entry_id") or ""))
        if not entry:
            raise ValueError(f"form references an unknown entry: {row.get('id')}")
        result = morphology_task_row(row, entry, "direct_form_reconstruction")
        if result is not None:
            morphology_all.append(result)
    morphology_clean = [row for row in morphology_all if not has_heldout_lineage(row)]
    morphology_heldout = [row for row in morphology_all if has_heldout_lineage(row)]

    direct_lexical_entry_ids = {
        str(entry_id)
        for row in lexical_clean
        for entry_id in row.get("source_entry_ids") or []
    }
    glossary_training_entry_ids = {
        str(pair["entry_id"])
        for row in glossary_train
        for pair in row.get("glossary_pairs") or []
    }
    training_target_texts = [
        row["output_text"]
        for rows in (sentence_train, lexical_clean, morphology_clean)
        for row in rows
    ]
    glossary_validation = annotate_glossary_lineage_exposure(
        glossary_validation,
        training_target_texts=training_target_texts,
        direct_lexical_entry_ids=direct_lexical_entry_ids,
        glossary_training_entry_ids=glossary_training_entry_ids,
    )
    glossary_test = annotate_glossary_lineage_exposure(
        glossary_test,
        training_target_texts=training_target_texts,
        direct_lexical_entry_ids=direct_lexical_entry_ids,
        glossary_training_entry_ids=glossary_training_entry_ids,
    )
    glossary_validation_unexposed = [
        row for row in glossary_validation if row["project_lineage_unexposed"]
    ]
    glossary_test_unexposed = [row for row in glossary_test if row["project_lineage_unexposed"]]

    pools = {
        "sentence-train": sentence_train,
        "lexical-clean": lexical_clean,
        "lexical-heldout": lexical_heldout,
        "lexical-all": lexical_all,
        "glossary-train": glossary_train,
        "morphology-clean": morphology_clean,
        "morphology-heldout": morphology_heldout,
        "morphology-all": morphology_all,
    }
    balanced_sentence_rows = 46005
    balanced_glossary_rows = 19200
    balanced_lexical_rows = 11595
    balanced_total_rows = balanced_sentence_rows + balanced_glossary_rows + balanced_lexical_rows
    if balanced_total_rows != 76800 or balanced_lexical_rows != len(lexical_clean):
        raise RuntimeError(
            "balanced schedule constants no longer match the clean lexical pool or 2,400 x 32 horizon"
        )
    mixtures = {
        "retention-control": control_replay(sentence_train, len(sentence_train) + len(lexical_clean)),
        "lexical-clean": sentence_train + lexical_clean,
        "lexical-all-product": sentence_train + lexical_all,
        "lexical-glossary-clean": sentence_train + lexical_clean + glossary_train,
        "lexical-glossary-morphology-clean": (
            sentence_train + lexical_clean + glossary_train + morphology_clean
        ),
        "lexical-glossary-morphology-all-product": (
            sentence_train + lexical_all + glossary_train + morphology_all
        ),
        "balanced-glossary-lexical-clean-76800": (
            scheduled_replay(
                sentence_train,
                balanced_sentence_rows,
                seed=args.seed,
                label="balanced-sentence",
            )
            + scheduled_replay(
                glossary_train,
                balanced_glossary_rows,
                seed=args.seed,
                label="balanced-glossary",
            )
            + scheduled_replay(
                lexical_clean,
                balanced_lexical_rows,
                seed=args.seed,
                label="balanced-lexical",
            )
        ),
        "balanced-no-glossary-control-76800": (
            scheduled_replay(
                sentence_train,
                balanced_sentence_rows + balanced_glossary_rows,
                seed=args.seed,
                label="balanced-control-sentence",
            )
            + scheduled_replay(
                lexical_clean,
                balanced_lexical_rows,
                seed=args.seed,
                label="balanced-control-lexical",
            )
        ),
    }
    evaluations = {
        "sentence-validation": sentence_validation,
        "sentence-opened-regression": sentence_test,
        "lexical-all": lexical_all,
        "lexical-heldout-lineage": lexical_heldout,
        "morphology-heldout-lineage": morphology_heldout,
        "glossary-validation-conditioned": glossary_validation,
        "glossary-validation-unconditioned-paired": [
            glossary_unconditioned_pair(row) for row in glossary_validation
        ],
        "glossary-validation-project-unexposed-conditioned": glossary_validation_unexposed,
        "glossary-validation-project-unexposed-unconditioned-paired": [
            glossary_unconditioned_pair(row) for row in glossary_validation_unexposed
        ],
        "glossary-opened-conditioned": glossary_test,
        "glossary-opened-unconditioned-paired": [
            glossary_unconditioned_pair(row) for row in glossary_test
        ],
        "glossary-opened-project-unexposed-conditioned": glossary_test_unexposed,
        "glossary-opened-project-unexposed-unconditioned-paired": [
            glossary_unconditioned_pair(row) for row in glossary_test_unexposed
        ],
    }

    outputs: dict[str, dict[str, Any]] = {}
    for group, collections in (("pools", pools), ("mixtures", mixtures), ("evaluation", evaluations)):
        for label, rows in collections.items():
            unique_ids(rows, f"{group}/{label}")
            ordered = stable_order(rows, args.seed, f"{group}/{label}")
            path = output_dir / group / f"{label}.eng-mic.jsonl"
            write_jsonl(path, ordered)
            outputs[f"{group}/{label}"] = output_record(path, ordered)

    source_manifest = {
        label: {"path": str(path), "sha256": sha256(path), "rows": len(read_jsonl(path))}
        for label, path in sources.items()
    }
    manifest = {
        "schema_version": 3,
        "created_at": utc_now(),
        "operation": "migmaq_v2_task_separated_treatment_builder",
        "seed": args.seed,
        "direction": "eng-mic",
        "source_lang": "eng_Latn",
        "target_lang": "mic_Latn",
        "task_tokens": [
            "<translate>",
            "<lexeme>",
            "<pos>",
            "<glossary>",
            "<inflect>",
            "<gloss>",
            "<features>",
        ],
        "normalization": {
            "model_text": "NFC, quote folding, whitespace collapse; case and punctuation preserved",
            "migmaq_model_text": (
                "NFC, quote folding, source-site layout underscores converted to spaces, whitespace "
                "collapse; case and punctuation preserved. Raw source-layout forms remain in provenance fields."
            ),
            "comparison_only": "NFKC, quote folding, casefold, whitespace collapse",
        },
        "research_split_contract": {
            "lineage_clean_excludes": sorted(HELDOUT_LINEAGES),
            "reason": (
                "Lexical and morphology rows linked to v1 validation/test entries are excluded from clean "
                "treatments so opened sentence regression does not silently become direct-pair training data."
            ),
            "all_product_warning": (
                "All-product mixtures directly expose validation/test entry lexemes and forms. Their sentence "
                "scores are contaminated product-fit diagnostics, not generalization evidence."
            ),
        },
        "glossary_contract": (
            "A glossary-conditioned sentence row is emitted only when the source entry's dictionary headword "
            "occurs as a comparison-normalized contiguous whole-word sequence in the attested target sentence."
        ),
        "glossary_evaluation_contract": {
            "paired_inputs": (
                "Conditioned and unconditioned files contain the same sentence/reference rows."
            ),
            "project_lineage_unexposed": (
                "Every supplied headword is absent from clean direct lexical entries, training glossary "
                "entries, and all declared project-training target surfaces. Upstream NLLB exposure is unknown."
            ),
        },
        "balanced_schedule_contract": {
            "optimizer_updates": 2400,
            "examples_per_update": 32,
            "total_presentations": balanced_total_rows,
            "task_quotas": {
                "translate": balanced_sentence_rows,
                "glossary_translation": balanced_glossary_rows,
                "lexeme": balanced_lexical_rows,
            },
            "task_proportions": {
                "translate": balanced_sentence_rows / balanced_total_rows,
                "glossary_translation": balanced_glossary_rows / balanced_total_rows,
                "lexeme": balanced_lexical_rows / balanced_total_rows,
            },
            "lexical_interpretation": (
                "The 15.1% lexical share is higher than the 5% GATITOS raw-pair recipe so every clean "
                "lexeme can appear once in a one-pass 2,400-update experiment; it is far below the failed "
                "66.7% lexical treatment and remains subordinate to sentence tasks."
            ),
            "morphology_excluded": (
                "Source-layout morphology labels remain separately evaluated and are not mixed into this "
                "sentence model before independent adjudication."
            ),
        },
        "morphology_contract": (
            "Rows reconstruct source-layout forms from source labels. They are development evidence and are not "
            "treated as independently adjudicated morphological analyses."
        ),
        "sources": source_manifest,
        "outputs": outputs,
    }
    write_json_atomic(output_dir / "manifest.json", manifest)
    checksums = sorted(path for path in output_dir.rglob("*") if path.is_file())
    (output_dir / "SHA256SUMS").write_text(
        "".join(f"{sha256(path)}  {path.relative_to(output_dir)}\n" for path in checksums),
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

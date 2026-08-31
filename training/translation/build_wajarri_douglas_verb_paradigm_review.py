#!/usr/bin/env python3
"""Compile the image-led review of Douglas Tables 3.3 and 3.4.

The method preserves historical table cells and Douglas's recorded-versus-
hypothesized distinction. It does not accept current morphology or emit a
controlled bilingual English-Wajarri sentence pair.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from collections import Counter, defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any


RECORDED = "source_recorded"
HYPOTHESIZED = "source_hypothesized_unrecorded"
ALLOWED_FORM_STATUSES = {RECORDED, HYPOTHESIZED}
REQUIRED_DECISION_VALUES = {
    "transcription_decision": "accepted_exact_source_image_cell_transcription",
    "current_correspondence_status": "not_assessed",
    "productive_rule_status": "not_authorized",
    "synthetic_eligibility": "not_authorized",
    "training_eligibility": "not_allowed",
    "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
}
REQUIRED_NOTE_VALUES = {
    "productive_rule_authorized": False,
    "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
    "training_eligibility": "not_allowed",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")


def jsonl_bytes(rows: Iterable[dict[str, Any]]) -> bytes:
    return b"".join(
        (
            json.dumps(
                row,
                ensure_ascii=True,
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n"
        ).encode("utf-8")
        for row in rows
    )


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"expected JSON object: {path}")
    return value


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise TypeError(f"expected object at {path}:{line_number}")
        rows.append(value)
    return rows


def resolve_within(root: Path, raw_path: str, label: str) -> Path:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        raise ValueError(f"{label} must be relative to program root")
    path = (root / candidate).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes program root: {raw_path}") from error
    return path


def require_hash(root: Path, spec: dict[str, Any], label: str) -> Path:
    raw_path = spec.get("path")
    expected = spec.get("sha256")
    if not isinstance(raw_path, str) or not raw_path:
        raise ValueError(f"{label}.path must be a nonempty string")
    if not isinstance(expected, str) or len(expected) != 64:
        raise ValueError(f"{label}.sha256 must be a SHA-256 digest")
    path = resolve_within(root, raw_path, label)
    if not path.is_file():
        raise FileNotFoundError(path)
    actual = sha256_file(path)
    if actual != expected:
        raise ValueError(f"{label} hash mismatch: expected {expected}, found {actual}")
    return path


def require_nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a nonempty string")
    return value


def require_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not all(
        isinstance(item, str) and item.strip() for item in value
    ):
        raise ValueError(f"{label} must be a list of nonempty strings")
    return value


def expected_cell_keys(matrix: dict[str, Any]) -> set[tuple[str, str]]:
    categories = require_string_list(matrix.get("categories"), "matrix.categories")
    regular = require_string_list(matrix.get("regular_rows"), "matrix.regular_rows")
    irregular = require_string_list(
        matrix.get("irregular_rows"), "matrix.irregular_rows"
    )
    rows = regular + irregular
    if len(rows) != len(set(rows)) or len(categories) != len(set(categories)):
        raise ValueError("matrix rows and categories must be unique")
    return {(row, category) for row in rows for category in categories}


def validate_form(form: dict[str, Any], *, expected_index: int) -> None:
    require_nonempty_string(form.get("surface"), "form.surface")
    if form.get("evidence_status") not in ALLOWED_FORM_STATUSES:
        raise ValueError("unsupported form evidence_status")
    if form.get("alternative_index") != expected_index:
        raise ValueError("form alternative_index must be contiguous and one-based")
    for key in (
        "source_trailing_tilde",
        "parenthesized",
        "leading_question_mark",
        "asterisked",
        "zero_form",
    ):
        if not isinstance(form.get(key), bool):
            raise ValueError(f"form.{key} must be boolean")
    if form["evidence_status"] == HYPOTHESIZED and not form["parenthesized"]:
        raise ValueError("source-hypothesized forms must preserve parentheses")
    if form["evidence_status"] == RECORDED and form["parenthesized"]:
        raise ValueError("parenthesized forms cannot be classified as recorded")


def validate_decisions(
    decisions: list[dict[str, Any]],
    *,
    matrix: dict[str, Any],
    page_witnesses: dict[str, dict[str, Any]],
    note_ids: set[str],
) -> None:
    expected = expected_cell_keys(matrix)
    regular_rows = set(matrix["regular_rows"])
    hypothetical = {
        tuple(value.split(":", maxsplit=1))
        for value in require_string_list(
            matrix.get("source_hypothesized_cell_keys"),
            "matrix.source_hypothesized_cell_keys",
        )
    }
    if not hypothetical <= expected:
        raise ValueError("hypothesized cell key is outside the frozen matrix")

    seen_ids: set[str] = set()
    seen_keys: set[tuple[str, str]] = set()
    for decision in decisions:
        if decision.get("schema_version") != 1:
            raise ValueError("decision schema_version must be 1")
        decision_id = require_nonempty_string(
            decision.get("decision_id"), "decision_id"
        )
        if decision_id in seen_ids:
            raise ValueError(f"duplicate decision ID: {decision_id}")
        seen_ids.add(decision_id)
        row_key = require_nonempty_string(decision.get("row_key"), "row_key")
        category = require_nonempty_string(decision.get("category"), "category")
        cell_key = (row_key, category)
        if cell_key not in expected:
            raise ValueError(f"unexpected cell: {cell_key}")
        if cell_key in seen_keys:
            raise ValueError(f"duplicate cell: {cell_key}")
        seen_keys.add(cell_key)

        is_regular = row_key in regular_rows
        expected_table = (
            "table-3.3-regular-verb-inflections"
            if is_regular
            else "table-3.4-irregular-verb-inflections"
        )
        expected_type = "regular_class_suffix" if is_regular else "irregular_verb_form"
        expected_page = (
            "wbv-douglas-ocr-page-035" if is_regular else "wbv-douglas-ocr-page-036"
        )
        if decision.get("table_key") != expected_table:
            raise ValueError(f"wrong table for {cell_key}")
        if decision.get("paradigm_type") != expected_type:
            raise ValueError(f"wrong paradigm type for {cell_key}")
        if decision.get("page_witness_id") != expected_page:
            raise ValueError(f"wrong source page for {cell_key}")
        witness = page_witnesses.get(expected_page)
        if witness is None:
            raise ValueError(f"missing frozen page witness: {expected_page}")
        if decision.get("page_png_sha256") != witness.get("png_sha256"):
            raise ValueError(f"page image hash mismatch for {cell_key}")
        require_nonempty_string(decision.get("row_label"), "row_label")
        require_nonempty_string(
            decision.get("source_cell_rendering"), "source_cell_rendering"
        )
        if is_regular and decision.get("lexical_gloss") is not None:
            raise ValueError("regular class rows must not invent a lexical gloss")
        if not is_regular:
            require_nonempty_string(decision.get("lexical_gloss"), "lexical_gloss")
        footnotes = require_string_list(
            decision.get("source_footnote_keys"), "source_footnote_keys"
        ) if decision.get("source_footnote_keys") else []
        if not set(footnotes) <= note_ids:
            raise ValueError(f"unknown source footnote on {cell_key}")
        forms = decision.get("forms")
        if not isinstance(forms, list) or not forms:
            raise ValueError(f"forms must be a nonempty list for {cell_key}")
        for index, form in enumerate(forms, start=1):
            if not isinstance(form, dict):
                raise TypeError("form must be an object")
            validate_form(form, expected_index=index)
        statuses = {form["evidence_status"] for form in forms}
        expected_status = HYPOTHESIZED if cell_key in hypothetical else RECORDED
        if statuses != {expected_status}:
            raise ValueError(
                f"recorded/hypothesized status mismatch for {cell_key}: {statuses}"
            )
        require_nonempty_string(decision.get("reviewed_at_utc"), "reviewed_at_utc")
        for key, value in REQUIRED_DECISION_VALUES.items():
            if decision.get(key) != value:
                raise ValueError(f"decision {key} must equal {value!r}")

    if seen_keys != expected:
        missing = sorted(expected - seen_keys)
        unexpected = sorted(seen_keys - expected)
        raise ValueError(
            f"decisions must cover the exact matrix: missing={missing} "
            f"unexpected={unexpected}"
        )


def validate_source_notes(
    notes: list[dict[str, Any]],
    *,
    page_witnesses: dict[str, dict[str, Any]],
    statement_keys: set[str],
) -> set[str]:
    page_by_ordinal = {
        row["chapter_page_ordinal"]: row for row in page_witnesses.values()
    }
    note_ids: set[str] = set()
    for note in notes:
        if note.get("schema_version") != 1:
            raise ValueError("source note schema_version must be 1")
        note_id = require_nonempty_string(note.get("note_id"), "note_id")
        if note_id in note_ids:
            raise ValueError(f"duplicate source note: {note_id}")
        note_ids.add(note_id)
        page = page_by_ordinal.get(note.get("chapter_page_ordinal"))
        if page is None or note.get("page_png_sha256") != page.get("png_sha256"):
            raise ValueError(f"source note page witness mismatch: {note_id}")
        source_key = note.get("source_statement_key")
        if source_key is not None and source_key not in statement_keys:
            raise ValueError(f"unknown source statement key: {source_key}")
        span_hash = note.get("source_span_sha256")
        if not isinstance(span_hash, str) or len(span_hash) != 64:
            raise ValueError("source note span hash must be a SHA-256 digest")
        require_nonempty_string(note.get("source_note"), "source_note")
        require_nonempty_string(
            note.get("operator_interpretation"), "operator_interpretation"
        )
        require_string_list(note.get("limitations"), "limitations")
        for key, value in REQUIRED_NOTE_VALUES.items():
            if note.get(key) != value:
                raise ValueError(f"source note {key} must equal {value!r}")
    return note_ids


def compile_rows(
    decisions: list[dict[str, Any]],
    *,
    reviewer_scope: dict[str, Any],
    source_pages: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cells: list[dict[str, Any]] = []
    forms: list[dict[str, Any]] = []
    for decision in sorted(
        decisions,
        key=lambda row: (
            row["table_key"],
            row["row_key"],
            row["category"],
        ),
    ):
        page_key = "table_3_3" if decision["paradigm_type"] == "regular_class_suffix" else "table_3_4"
        source_page = source_pages[page_key]
        statuses = sorted({form["evidence_status"] for form in decision["forms"]})
        cell = {
            "schema_version": 1,
            "cell_id": decision["decision_id"],
            "table_key": decision["table_key"],
            "paradigm_type": decision["paradigm_type"],
            "row_key": decision["row_key"],
            "row_label": decision["row_label"],
            "lexical_gloss": decision["lexical_gloss"],
            "category": decision["category"],
            "source_cell_rendering": decision["source_cell_rendering"],
            "form_count": len(decision["forms"]),
            "form_evidence_statuses": statuses,
            "has_source_alternatives": len(decision["forms"]) > 1,
            "source_footnote_keys": decision["source_footnote_keys"],
            "source": {
                "chapter_page_ordinal": source_page["chapter_page_ordinal"],
                "printed_page": source_page["printed_page"],
                "source_pdf_page": source_page["source_pdf_page"],
                "page_witness_id": decision["page_witness_id"],
                "page_png_path": source_page["page_png_path"],
                "page_png_sha256": decision["page_png_sha256"],
                "table_source_span_sha256": source_page["table_source_span_sha256"],
            },
            "reviewed_at_utc": decision["reviewed_at_utc"],
            "reviewer_scope": reviewer_scope,
            "transcription_decision": decision["transcription_decision"],
            "historical_evidence_scope": "source_table_cell_only",
            "current_correspondence_status": "not_assessed",
            "productive_rule_status": "not_authorized",
            "synthetic_eligibility": "not_authorized",
            "training_eligibility": "not_allowed",
            "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
        }
        cells.append(cell)
        for form in decision["forms"]:
            forms.append(
                {
                    "schema_version": 1,
                    "form_id": (
                        f"{decision['decision_id']}:form:"
                        f"{form['alternative_index']:02d}"
                    ),
                    "cell_id": decision["decision_id"],
                    "table_key": decision["table_key"],
                    "row_key": decision["row_key"],
                    "lexical_gloss": decision["lexical_gloss"],
                    "category": decision["category"],
                    **form,
                    "historical_evidence_scope": "source_table_form_only",
                    "current_correspondence_status": "not_assessed",
                    "productive_rule_status": "not_authorized",
                    "synthetic_eligibility": "not_authorized",
                    "training_eligibility": "not_allowed",
                    "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
                }
            )
    return cells, forms


def build_pair_preconditions(
    cells: list[dict[str, Any]], categories: list[str]
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for cell in cells:
        grouped[cell["category"]].append(cell)
    output: list[dict[str, Any]] = []
    for category in categories:
        members = grouped[category]
        hypothetical = sum(
            HYPOTHESIZED in row["form_evidence_statuses"] for row in members
        )
        requirements = [
            "frozen model failure census for the intended morphology task",
            "accepted current-Wajarri category and construction analysis",
            "accepted current lexical stems and complete surface realizations",
            "source- and variety-scoped correspondence from historical forms",
            "explicit coverage-cell commission and pair-count allocation",
            "independent split assignment and separate issuance review",
        ]
        if hypothetical:
            requirements.append(
                "exclude source-hypothesized forms unless independently attested"
            )
        if category == "purposive":
            requirements.append(
                "resolve speaker- and variety-conditioned -ku/-wu variation without an automatic rewrite"
            )
        if category == "concurrent_action":
            requirements.append(
                "resolve the historical concurrent-action versus current switch-reference analysis"
            )
        output.append(
            {
                "schema_version": 1,
                "precondition_id": f"wbv-morphology-pair-precondition-{category}",
                "category": category,
                "historical_source_cells": len(members),
                "historical_source_forms": sum(row["form_count"] for row in members),
                "source_hypothesized_cells": hypothetical,
                "required_before_pair_issuance": requirements,
                "future_pair_contract": {
                    "required_unit": (
                        "controlled bilingual English-Wajarri sentence, clause, "
                        "or whole-utterance pair"
                    ),
                    "method_precedent": "Kuku Yalanji coverage-ledger workflow",
                    "isolated_dictionary_mapping_counts_as_pair": False,
                    "table_cell_counts_as_pair": False,
                    "target_only_form_counts_as_pair": False,
                    "historical_source_example_counts_as_new_synthetic_pair": False,
                    "candidate_preview_counts_as_pair": False,
                },
                "current_status": "closed_pending_current_evidence_and_model_census",
                "coverage_cells_issued": 0,
                "controlled_bilingual_english_wajarri_sentence_pairs_added": 0,
                "training_eligible_rows": 0,
            }
        )
    return output


def validate_zero_invariants(
    cells: list[dict[str, Any]],
    forms: list[dict[str, Any]],
    notes: list[dict[str, Any]],
    preconditions: list[dict[str, Any]],
) -> None:
    rows = cells + forms + notes + preconditions
    if any(
        row["controlled_bilingual_english_wajarri_sentence_pairs_added"] != 0
        for row in rows
    ):
        raise ValueError("source review must not issue controlled sentence pairs")
    if any(
        row.get("training_eligibility") not in {None, "not_allowed"}
        for row in rows
    ):
        raise ValueError("source review must not authorize training")


def write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)


def build_inventory(
    *, program_root: Path, contract_path: Path, build_root: Path
) -> dict[str, Any]:
    contract = load_json(contract_path)
    if contract.get("schema_version") != 1:
        raise ValueError("contract schema_version must be 1")
    inputs = contract.get("inputs")
    if not isinstance(inputs, dict):
        raise TypeError("contract inputs must be an object")
    required_paths = {
        key: require_hash(program_root, spec, key) for key, spec in inputs.items()
    }
    grammar_manifest = load_json(required_paths["grammar_inventory_manifest"])
    table_blocks = load_jsonl(required_paths["table_blocks"])
    statements = load_jsonl(required_paths["morphotactic_statements"])
    page_witness_rows = load_jsonl(required_paths["page_witnesses"])
    decisions = load_jsonl(required_paths["manual_cell_decisions"])
    notes = load_jsonl(required_paths["manual_source_notes"])

    if grammar_manifest.get("inventory_id") != "wajarri-douglas-1981-grammar-inventory-v0.1.0":
        raise ValueError("grammar inventory identity changed")
    table_by_key = {row.get("tableBlockKey"): row for row in table_blocks}
    if len(table_by_key) != len(table_blocks):
        raise ValueError("table block keys must be unique")
    for key in (
        "table-3.3-regular-verb-inflections",
        "table-3.4-irregular-verb-inflections",
    ):
        if key not in table_by_key:
            raise ValueError(f"required table block is missing: {key}")
    statement_keys = {row.get("statementKey") for row in statements}
    if None in statement_keys or len(statement_keys) != len(statements):
        raise ValueError("morphotactic statement keys must be unique")
    page_witnesses = {row.get("page_witness_id"): row for row in page_witness_rows}
    if None in page_witnesses or len(page_witnesses) != len(page_witness_rows):
        raise ValueError("page witness IDs must be unique")

    source_pages = contract["source_pages"]
    for label, spec in source_pages.items():
        image = resolve_within(program_root, spec["page_png_path"], label)
        if sha256_file(image) != spec["page_png_sha256"]:
            raise ValueError(f"source page image hash mismatch: {label}")
        witness = page_witnesses.get(spec["page_witness_id"])
        if witness is None or witness.get("png_sha256") != spec["page_png_sha256"]:
            raise ValueError(f"source page witness mismatch: {label}")
    if (
        table_by_key["table-3.3-regular-verb-inflections"]["evidenceSpan"]["sourceSpanSha256"]
        != source_pages["table_3_3"]["table_source_span_sha256"]
        or table_by_key["table-3.4-irregular-verb-inflections"]["evidenceSpan"]["sourceSpanSha256"]
        != source_pages["table_3_4"]["table_source_span_sha256"]
    ):
        raise ValueError("table source span hash changed")

    note_ids = validate_source_notes(
        notes,
        page_witnesses=page_witnesses,
        statement_keys=statement_keys,
    )
    validate_decisions(
        decisions,
        matrix=contract["matrix"],
        page_witnesses=page_witnesses,
        note_ids=note_ids,
    )
    reviewer_scope = contract["reviewer_scope"]
    if reviewer_scope.get("fluent_speaker") is not False:
        raise ValueError("reviewer scope must state non-speaker status")
    cells, forms = compile_rows(
        decisions,
        reviewer_scope=reviewer_scope,
        source_pages=source_pages,
    )
    preconditions = build_pair_preconditions(
        cells, contract["matrix"]["categories"]
    )
    validate_zero_invariants(cells, forms, notes, preconditions)

    expected = contract["expected_counts"]
    status_counts = Counter(row["evidence_status"] for row in forms)
    checks = {
        "regular_cells": sum(
            row["paradigm_type"] == "regular_class_suffix" for row in cells
        ),
        "irregular_cells": sum(
            row["paradigm_type"] == "irregular_verb_form" for row in cells
        ),
        "all_cells": len(cells),
        "source_recorded_forms": status_counts[RECORDED],
        "source_hypothesized_forms": status_counts[HYPOTHESIZED],
        "all_forms": len(forms),
        "multi_form_cells": sum(row["has_source_alternatives"] for row in cells),
        "source_notes": len(notes),
        "morphology_sentence_pair_preconditions": len(preconditions),
    }
    for key, actual in checks.items():
        if actual != expected[key]:
            raise ValueError(f"{key} changed: expected {expected[key]}, found {actual}")

    payloads = {
        "paradigm-cells.jsonl": jsonl_bytes(cells),
        "paradigm-forms.jsonl": jsonl_bytes(forms),
        "source-notes.jsonl": jsonl_bytes(sorted(notes, key=lambda row: row["note_id"])),
        "morphology-sentence-pair-preconditions.jsonl": jsonl_bytes(preconditions),
    }
    report = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "status": "historical_verb_paradigm_source_image_review",
        "counts": {
            **checks,
            "current_correspondences_accepted": 0,
            "productive_grammar_rules_accepted": 0,
            "coverage_cells_issued": 0,
            "controlled_bilingual_english_wajarri_sentence_pairs": 0,
            "benchmark_rows": 0,
            "training_eligible_rows": 0,
        },
        "recorded_hypothesized_boundary": (
            "Five parenthesized Table 3.4 forms remain source-hypothesized "
            "and unrecorded; the other 73 forms are source-recorded only."
        ),
        "next_use": (
            "Crosswalk recorded historical forms to current complete forms as "
            "review candidates, then issue bounded bilingual sentence-pair coverage "
            "only after the frozen model census and living-book acceptance gates."
        ),
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    payloads["REPORT.json"] = json_bytes(report)
    for name, payload in payloads.items():
        write_bytes(build_root / name, payload)

    components: dict[str, dict[str, Any]] = {}
    for name in sorted(payloads):
        component_name = name.replace("-", "_").replace(".", "_")
        record: dict[str, Any] = {
            "path": name,
            "sha256": sha256_file(build_root / name),
        }
        if name.endswith(".jsonl"):
            record["rows"] = len(load_jsonl(build_root / name))
        components[component_name] = record
    manifest = {
        "schema_version": 1,
        "inventory_id": contract["inventory_id"],
        "created_at_utc": contract["created_at_utc"],
        "status": report["status"],
        "immutable": True,
        "contract": {
            "path": contract_path.relative_to(program_root).as_posix(),
            "sha256": sha256_file(contract_path),
        },
        "inputs": inputs,
        "source_pages": source_pages,
        "components": components,
        "validation": {
            **checks,
            "current_correspondences_accepted": 0,
            "productive_grammar_rules_accepted": 0,
            "coverage_cells_issued": 0,
            "controlled_bilingual_english_wajarri_sentence_pairs": 0,
            "isolated_dictionary_rows_counted_as_sentence_pairs": 0,
            "benchmark_rows": 0,
            "training_eligible_rows": 0,
        },
        "generation_authorized": False,
        "training_authorized": False,
        "claim_limit": contract["claim_limit"],
    }
    write_bytes(build_root / "MANIFEST.json", json_bytes(manifest))
    return manifest


def compare_trees(left: Path, right: Path) -> None:
    left_files = sorted(
        path.relative_to(left).as_posix() for path in left.rglob("*") if path.is_file()
    )
    right_files = sorted(
        path.relative_to(right).as_posix()
        for path in right.rglob("*")
        if path.is_file()
    )
    if left_files != right_files:
        raise ValueError("existing output file inventory differs")
    for relative in left_files:
        if sha256_file(left / relative) != sha256_file(right / relative):
            raise ValueError(f"refusing to rewrite non-identical output: {relative}")


def write_inventory(
    *, program_root: Path, contract_path: Path, output_dir: Path
) -> dict[str, Any]:
    output_dir = output_dir.resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=output_dir.parent)
    )
    try:
        manifest = build_inventory(
            program_root=program_root,
            contract_path=contract_path,
            build_root=temporary,
        )
        if output_dir.exists():
            compare_trees(temporary, output_dir)
            shutil.rmtree(temporary)
        else:
            temporary.replace(output_dir)
        return manifest
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def main() -> None:
    args = parse_args()
    program_root = args.program_root.resolve()
    contract_path = resolve_within(program_root, str(args.contract), "contract")
    output_dir = resolve_within(program_root, str(args.output_dir), "output_dir")
    manifest = write_inventory(
        program_root=program_root,
        contract_path=contract_path,
        output_dir=output_dir,
    )
    print(
        json.dumps(
            {
                "inventory_id": manifest["inventory_id"],
                "manifest_path": str(output_dir / "MANIFEST.json"),
                "manifest_sha256": sha256_file(output_dir / "MANIFEST.json"),
                **manifest["validation"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build the frozen v23 speaker-disjoint attested-adaptation corpus.

The raw 795-row XIGT extraction is audited but deliberately excluded from
training because its target strings still contain unresolved OCR corruption.
The only new Patz supervision is the manually reconciled appendix corpus.
"""

from __future__ import annotations

import argparse
import collections
import functools
import hashlib
import json
import re
import shutil
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


PROGRAM = Path(
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30"
)
REPO = Path("/mnt/donto-data/workspace/mobtranslate.com")
APPENDIX_REPORT = PROGRAM / "reports/kuku-yalanji-appendix-texts-extraction-2026-07-02.md"
XIGT = REPO / "experiments/pdftomd/extract/output/examples.xigt.json"
V21_DATA = PROGRAM / "prepared/v21.2-claude-balanced-replay"
DB_USAGE_TRAIN = (
    PROGRAM
    / "prepared/v18.0-v10-plus-elder-sentence-pair/db_usage/train_usage.eng-gvn.jsonl"
)
LEXICON_ELDER_PROBE = (
    PROGRAM
    / "analysis/v22-lexicon-elder-version-probe-2026-07-14/"
      "combined_lexicon_elder_probe.eng-gvn.jsonl"
)
DEFAULT_OUTPUT = PROGRAM / "prepared/v23.0-attested-narrative-adaptation"

TASK_PREFIX = "<translate>"
NARRATIVE_REPLICAS = 4
SYNTHETIC_RETENTION_ROWS = 1_024
SELECTION_SALT = "v23.0-attested-narrative-adaptation-2026-07-14"
PROTECTED_EXTERNALS = {
    "elder_sentence_pair_43": V21_DATA / "external/elder_sentence_pair_43.eng-gvn.jsonl",
    "db_usage_heldout_84": V21_DATA / "external/db_usage_heldout_84.eng-gvn.jsonl",
    "synthetic_dev_1609": V21_DATA / "validation.eng-gvn.jsonl",
    "synthetic_test_tagged_1606": V21_DATA / "test.eng-gvn.jsonl",
    "synthetic_test_untagged_1606": V21_DATA / "synthetic/test_untagged_1606.eng-gvn.jsonl",
    "bible_direct_heldout_325": V21_DATA / "external/bible_direct_heldout_325.eng-gvn.jsonl",
}


@dataclass
class Clause:
    identifier: str
    text_id: str
    dialect: str
    speaker: str
    title: str
    kuku: str = ""
    gloss: str = ""
    english: str = ""
    notes: list[str] = field(default_factory=list)

    @property
    def uncertain(self) -> bool:
        return any("warning" in note.casefold() for note in self.notes)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_space(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).split())


@functools.lru_cache(maxsize=None)
def text_key(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).casefold()
    text = text.translate(str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"'}))
    return " ".join(text.split())


@functools.lru_cache(maxsize=None)
def surface_key(text: str) -> str:
    return "".join(character for character in text_key(text) if character.isalpha())


@functools.lru_cache(maxsize=None)
def word_tokens(text: str) -> tuple[str, ...]:
    return tuple(re.findall(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", text_key(text), flags=re.UNICODE))


def token_jaccard(left: str, right: str) -> float:
    left_tokens = set(word_tokens(left))
    right_tokens = set(word_tokens(right))
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


def strip_printed_quotes(text: str) -> str:
    text = normalize_space(text)
    if len(text) >= 2 and text[0] == text[-1] == "'":
        return text[1:-1]
    return text


def parse_appendix(path: Path) -> list[Clause]:
    heading = re.compile(r"^## Text (\d+):\s*([^\u2014]+?)\s*[\u2014-]\s*(.+)$")
    clause_heading = re.compile(r"^\*\*(\d+\.\d+)\*\*$")
    context: tuple[str, str, str, str] | None = None
    current: Clause | None = None
    clauses: list[Clause] = []

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        if not current.kuku or not current.gloss or not current.english:
            raise ValueError(f"incomplete appendix clause {current.identifier}")
        current.kuku = normalize_space(current.kuku)
        current.gloss = normalize_space(current.gloss)
        current.english = strip_printed_quotes(current.english)
        clauses.append(current)
        current = None

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        match = heading.match(raw_line)
        if match:
            flush()
            text_id, dialect, speaker = match.groups()
            context = (text_id, dialect.strip(), speaker.strip(), "")
            continue
        if raw_line.startswith("### ") and context is not None:
            context = (*context[:3], raw_line.removeprefix("### ").strip())
            continue
        match = clause_heading.match(raw_line)
        if match:
            flush()
            if context is None:
                raise ValueError(f"clause outside a text heading: {match.group(1)}")
            current = Clause(match.group(1), *context)
            continue
        if current is None:
            continue
        if raw_line.startswith("- KY: "):
            current.kuku = raw_line.removeprefix("- KY: ")
        elif raw_line.startswith("- GL: "):
            current.gloss = raw_line.removeprefix("- GL: ")
        elif raw_line.startswith("- EN: "):
            current.english = raw_line.removeprefix("- EN: ")
        elif raw_line.startswith("- NOTE: "):
            note = raw_line.removeprefix("- NOTE: ")
            current.notes.append(note.replace("\u26a0", "warning"))
    flush()
    return clauses


def parallel_row(clause: Clause, split: str, replica: int | None = None) -> dict[str, Any]:
    identifier = f"patz-appendix:{clause.identifier}"
    if replica is not None:
        identifier += f":rep{replica}"
    return {
        "id": identifier,
        "split": split,
        "direction": "eng-gvn",
        "input_text": f"{TASK_PREFIX} {clause.english}",
        "unconditioned_input_text": clause.english,
        "output_text": clause.kuku,
        "source_lang": "eng_Latn",
        "target_lang": "gvn_Latn",
        "pair_kind": "patz_appendix_narrative_clause",
        "rights_status": "source_attested_research_reference",
        "approved_for_training": split == "train",
        "attestation": {
            "source": "Patz reference grammar appendix",
            "text_id": clause.text_id,
            "clause_id": clause.identifier,
            "dialect": clause.dialect,
            "speaker": clause.speaker,
            "title": clause.title,
            "printed_gloss": clause.gloss,
            "notes": clause.notes,
            "transcription_uncertainty_flag": clause.uncertain,
            "replica": replica,
        },
    }


def source_text(row: dict[str, Any]) -> str:
    return normalize_space(
        str(
            row.get("unconditioned_input_text")
            or (row.get("translation") or {}).get("eng_Latn")
            or row.get("input_text")
            or ""
        )
    )


def target_text(row: dict[str, Any]) -> str:
    return normalize_space(
        str(row.get("output_text") or (row.get("translation") or {}).get("gvn_Latn") or "")
    )


def overlap_reasons(candidate: dict[str, Any], protected: list[dict[str, Any]]) -> list[str]:
    source = source_text(candidate)
    target = target_text(candidate)
    reasons: set[str] = set()
    for row in protected:
        protected_source = source_text(row)
        protected_target = target_text(row)
        if source and text_key(source) == text_key(protected_source):
            reasons.add("protected_source_exact")
        if target and surface_key(target) == surface_key(protected_target):
            reasons.add("protected_target_surface_exact")
        if min(len(word_tokens(source)), len(word_tokens(protected_source))) >= 4:
            if token_jaccard(source, protected_source) >= 0.85:
                reasons.add("protected_source_token_jaccard_ge_0.85")
        if min(len(word_tokens(target)), len(word_tokens(protected_target))) >= 3:
            if token_jaccard(target, protected_target) >= 0.80:
                reasons.add("protected_target_token_jaccard_ge_0.80")
    return sorted(reasons)


def audit_xigt(path: Path, narrative_clauses: list[Clause]) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    items = document.get("items")
    if not isinstance(items, list):
        raise ValueError("XIGT document has no items list")
    narrative_surfaces = {surface_key(clause.kuku) for clause in narrative_clauses}
    rows: list[dict[str, Any]] = []
    reason_counts: collections.Counter[str] = collections.Counter()
    for index, item in enumerate(items):
        transcript = normalize_space(str(item.get("transcript") or ""))
        translation = normalize_space(str(item.get("translation") or ""))
        source = normalize_space(str(item.get("source") or ""))
        reasons: list[str] = []
        if len(word_tokens(transcript)) < 2 or len(word_tokens(translation)) < 2:
            reasons.append("not_multiword_parallel")
        if source.casefold() in {"", "unlabeled", "unspecified"}:
            reasons.append("weak_or_missing_provenance_label")
        if re.search(r"\d|\(\*|\*\)|--|/|=|:", transcript):
            reasons.append("editorial_or_gloss_markup_in_target")
        if re.search(r"(?:^|[^A-Za-z])[A-Z]{2,}(?:[-.][A-Za-z]+)*", transcript):
            reasons.append("uppercase_gloss_material_in_target")
        if surface_key(transcript) in narrative_surfaces:
            reasons.append("duplicates_reconciled_appendix_clause")
        for reason in set(reasons):
            reason_counts[reason] += 1
        rows.append(
            {
                "index": index,
                "source": source,
                "transcript": transcript,
                "translation": translation,
                "screen_reasons": sorted(set(reasons)),
                "passes_mechanical_screen": not reasons,
                "approved_for_v23_training": False,
            }
        )
    return {
        "policy": (
            "Audit only. No XIGT row is approved for v23 training because passing the mechanical screen does not "
            "resolve the known systematic l/J/1 OCR substitutions or establish clause-level manual verification."
        ),
        "total_rows": len(rows),
        "mechanically_screened_clean_rows": sum(row["passes_mechanical_screen"] for row in rows),
        "approved_for_v23_training_rows": 0,
        "reason_counts": dict(sorted(reason_counts.items())),
        "rows": rows,
    }


def stable_sample(rows: list[dict[str, Any]], count: int, label: str) -> list[dict[str, Any]]:
    ordered = sorted(
        rows,
        key=lambda row: hashlib.sha256(
            f"{SELECTION_SALT}\0{label}\0{row.get('id', '')}".encode("utf-8")
        ).hexdigest(),
    )
    if len(ordered) < count:
        raise ValueError(f"{label}: requested {count} rows from only {len(ordered)}")
    return ordered[:count]


def normalize_training_row(row: dict[str, Any], kind: str, identifier: str | None = None) -> dict[str, Any]:
    english = source_text(row)
    kuku = target_text(row)
    result = {key: value for key, value in row.items() if key != "split"}
    result.update(
        {
            "id": identifier or str(row.get("id") or ""),
            "split": "train",
            "direction": "eng-gvn",
            "input_text": f"{TASK_PREFIX} {english}",
            "unconditioned_input_text": english,
            "output_text": kuku,
            "source_lang": "eng_Latn",
            "target_lang": "gvn_Latn",
            "v23_mixture": {"kind": kind},
        }
    )
    return result


def file_record(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(root)),
        "rows": sum(1 for line in path.open(encoding="utf-8") if line.strip()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def main() -> int:
    args = parse_args()
    output = args.output_dir.resolve()
    if output.exists():
        raise SystemExit(f"refusing existing output directory: {output}")
    output.mkdir(parents=True)

    clauses = parse_appendix(APPENDIX_REPORT)
    counts = collections.Counter(clause.text_id for clause in clauses)
    if counts != {"51": 106, "12": 60, "36": 53, "3": 56}:
        raise ValueError(f"appendix clause counts changed: {dict(counts)}")

    train_clauses = [
        clause for clause in clauses if clause.text_id in {"51", "12"} and not clause.uncertain
    ]
    dev_clauses = [clause for clause in clauses if clause.text_id == "36"]
    test_clauses = [clause for clause in clauses if clause.text_id == "3"]
    if len(train_clauses) != 157 or len(dev_clauses) != 53 or len(test_clauses) != 56:
        raise ValueError(
            f"unexpected split sizes: train={len(train_clauses)} dev={len(dev_clauses)} test={len(test_clauses)}"
        )

    dev_rows = [parallel_row(clause, "validation") for clause in dev_clauses]
    test_rows = [parallel_row(clause, "test") for clause in test_clauses]
    protected_natural = [*dev_rows, *test_rows]
    protected_external_rows = {
        label: read_jsonl(path) for label, path in PROTECTED_EXTERNALS.items()
    }
    protected_all = [
        *protected_natural,
        *(row for rows in protected_external_rows.values() for row in rows),
    ]

    narrative_candidates = [parallel_row(clause, "train") for clause in train_clauses]
    narrative_overlap = {
        row["id"]: reasons
        for row in narrative_candidates
        if (reasons := overlap_reasons(row, protected_natural))
    }
    narrative_train_unique = [
        row for row in narrative_candidates if row["id"] not in narrative_overlap
    ]
    approved_clause_ids = {
        str((row.get("attestation") or {}).get("clause_id")) for row in narrative_train_unique
    }
    narrative_train = [
        parallel_row(clause, "train", replica)
        for clause in train_clauses
        if clause.identifier in approved_clause_ids
        for replica in range(1, NARRATIVE_REPLICAS + 1)
    ]

    db_heldout = protected_external_rows["db_usage_heldout_84"]
    heldout_word_ids = {
        str((row.get("db_usage_example") or {}).get("word_id") or "") for row in db_heldout
    }
    db_candidates = read_jsonl(DB_USAGE_TRAIN)
    db_unique: list[dict[str, Any]] = []
    db_quarantine: list[dict[str, Any]] = []
    seen_db_ids: set[str] = set()
    for row in db_candidates:
        identifier = str(row.get("id") or "")
        base_identifier = identifier.split(":rep", 1)[0]
        word_id = str((row.get("db_usage_example") or {}).get("word_id") or "")
        reasons = overlap_reasons(row, protected_all)
        if word_id and word_id in heldout_word_ids:
            reasons.append("db_word_id_in_heldout")
        if base_identifier in seen_db_ids:
            reasons.append("duplicate_db_identifier")
        if reasons:
            db_quarantine.append({"id": identifier, "reasons": sorted(set(reasons))})
            continue
        seen_db_ids.add(base_identifier)
        db_unique.append(row)
    if len(db_unique) != 356:
        raise ValueError(f"expected 356 leakage-screened DB rows, observed {len(db_unique)}")

    db_direct = [normalize_training_row(row, "db_usage_direct") for row in db_unique]
    db_glossary: list[dict[str, Any]] = []
    for row in db_unique:
        original = {key: value for key, value in row.items() if key != "split"}
        original["id"] = f"{row['id']}:v23-glossary-retention"
        original["split"] = "train"
        original["v23_mixture"] = {"kind": "db_usage_glossary_retention"}
        db_glossary.append(original)

    synthetic_candidates = [
        row
        for row in read_jsonl(V21_DATA / "train.eng-gvn.jsonl")
        if str(row.get("pair_kind") or "") == "synthetic_academic_parallel"
    ]
    synthetic_clean: list[dict[str, Any]] = []
    synthetic_quarantine: list[dict[str, Any]] = []
    for row in synthetic_candidates:
        # v21.2 already passed the legacy external-set quarantine; v23 adds only
        # the newly frozen natural validation and test texts here.
        reasons = overlap_reasons(row, protected_natural)
        if reasons:
            synthetic_quarantine.append({"id": row.get("id"), "reasons": reasons})
        else:
            synthetic_clean.append(row)
    synthetic_retention = [
        normalize_training_row(row, "synthetic_retention")
        for row in stable_sample(synthetic_clean, SYNTHETIC_RETENTION_ROWS, "synthetic-retention")
    ]

    train_rows = [*narrative_train, *db_direct, *db_glossary, *synthetic_retention]
    ids = [str(row["id"]) for row in train_rows]
    if len(ids) != len(set(ids)):
        duplicates = [key for key, count in collections.Counter(ids).items() if count > 1]
        raise ValueError(f"duplicate training ids: {duplicates[:10]}")
    if any(overlap_reasons(row, protected_natural) for row in train_rows):
        raise ValueError("final training mixture overlaps natural dev/test")

    paths = {
        "train": output / "train.eng-gvn.jsonl",
        "validation": output / "validation.eng-gvn.jsonl",
        "test": output / "test.eng-gvn.jsonl",
        "narrative_unique": output / "natural/train_text51_12_unique.eng-gvn.jsonl",
        "dev": output / "natural/dev_text36_bobby_roberts.eng-gvn.jsonl",
        "test_natural": output / "natural/test_text3_ivy_walker.eng-gvn.jsonl",
        "probe": output / "external/combined_lexicon_elder_probe.eng-gvn.jsonl",
    }
    write_jsonl(paths["train"], train_rows)
    write_jsonl(paths["validation"], dev_rows)
    write_jsonl(paths["test"], test_rows)
    write_jsonl(paths["narrative_unique"], narrative_train_unique)
    write_jsonl(paths["dev"], dev_rows)
    write_jsonl(paths["test_natural"], test_rows)
    for label, source in PROTECTED_EXTERNALS.items():
        destination = output / f"external/{label}.eng-gvn.jsonl"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        paths[label] = destination
    paths["probe"].parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LEXICON_ELDER_PROBE, paths["probe"])

    xigt_audit = audit_xigt(XIGT, clauses)
    (output / "audit").mkdir()
    (output / "audit/xigt_exclusion_audit.json").write_text(
        json.dumps(xigt_audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (output / "audit/quarantine.json").write_text(
        json.dumps(
            {
                "db_usage": db_quarantine,
                "synthetic_natural_overlap": synthetic_quarantine,
                "narrative_natural_overlap": narrative_overlap,
                "uncertain_appendix_training_clauses": [
                    clause.identifier
                    for clause in clauses
                    if clause.text_id in {"51", "12"} and clause.uncertain
                ],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    mixture_counts = collections.Counter(
        str((row.get("v23_mixture") or {}).get("kind") or "patz_narrative") for row in train_rows
    )
    manifest = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_id": "v23.0-attested-narrative-adaptation",
        "status": "frozen_before_training",
        "direction": "eng-gvn",
        "hypothesis": (
            "A low-learning-rate second-stage LoRA over v21.2, adding manually reconciled native-speaker "
            "narrative clauses with restrained retention replay, improves speaker-disjoint natural translation."
        ),
        "split_contract": {
            "train_speakers": ["Charlie Tayley"],
            "validation_speakers": ["Bobby Roberts"],
            "test_speakers": ["Ivy Walker"],
            "validation_use": "checkpoint and seed selection",
            "test_use": "opened only after seed selection is sealed",
            "elder_43": "observed nonblind diagnostic only",
            "bible": "catastrophic-forgetting guard only; zero rows in training and zero selection weight",
        },
        "counts": {
            "appendix_all": len(clauses),
            "appendix_train_unique": len(narrative_train_unique),
            "appendix_train_replicated": len(narrative_train),
            "appendix_validation": len(dev_rows),
            "appendix_test": len(test_rows),
            "train_total": len(train_rows),
            "mixture": dict(sorted(mixture_counts.items())),
            "xigt_audited": xigt_audit["total_rows"],
            "xigt_approved_for_training": 0,
            "bible_training_rows": 0,
        },
        "mixture_policy": {
            "narrative_replicas": NARRATIVE_REPLICAS,
            "synthetic_retention_rows": SYNTHETIC_RETENTION_ROWS,
            "db_usage": "356 disjoint rows, once as direct translation and once in original glossary mode",
            "xigt": xigt_audit["policy"],
        },
        "leakage_policy": {
            "source_exact": True,
            "target_letters_only_surface_exact": True,
            "source_token_jaccard": {"minimum_tokens": 4, "threshold": 0.85},
            "target_token_jaccard": {"minimum_tokens": 3, "threshold": 0.80},
            "db_word_id_disjoint": True,
        },
        "inputs": {
            "appendix_report": {"path": str(APPENDIX_REPORT), "sha256": sha256(APPENDIX_REPORT)},
            "xigt_audit_only": {"path": str(XIGT), "sha256": sha256(XIGT)},
            "v21_data_manifest": {
                "path": str(V21_DATA / "v21_2_claude_balanced_replay_manifest.json"),
                "sha256": sha256(V21_DATA / "v21_2_claude_balanced_replay_manifest.json"),
            },
            "db_usage_train": {"path": str(DB_USAGE_TRAIN), "sha256": sha256(DB_USAGE_TRAIN)},
            "lexicon_elder_probe": {
                "path": str(LEXICON_ELDER_PROBE),
                "sha256": sha256(LEXICON_ELDER_PROBE),
            },
            "builder": {"path": str(Path(__file__).resolve()), "sha256": sha256(Path(__file__))},
        },
    }
    data_files = sorted(path for path in output.rglob("*.jsonl"))
    manifest["files"] = [file_record(path, output) for path in data_files]
    manifest_path = output / "MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    checksummed = sorted(
        path
        for path in output.rglob("*")
        if path.is_file() and path.name != "SHA256SUMS.v23"
    )
    with (output / "SHA256SUMS.v23").open("w", encoding="utf-8") as handle:
        for path in checksummed:
            handle.write(f"{sha256(path)}  {path.relative_to(output)}\n")

    print(json.dumps(manifest["counts"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

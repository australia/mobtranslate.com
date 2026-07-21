#!/usr/bin/env python3
"""Build a leakage-audited English--Mi'kmaq corpus from the Listuguj lessons XML."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata
from typing import Any, Iterable, Sequence
import xml.etree.ElementTree as ET


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
EXPLICIT_PARALLEL_RE = re.compile(r"\u00a0{2,}")
EDITORIAL_BRACKET_RE = re.compile(r"\[([^\[\]]*)\]")
SPLIT_THRESHOLDS = (("train", 80), ("validation", 90), ("test", 100))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-repo", type=Path, required=True)
    parser.add_argument("--expected-commit", required=True)
    parser.add_argument("--existing-train", type=Path, required=True)
    parser.add_argument("--existing-validation", type=Path, required=True)
    parser.add_argument("--existing-test", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
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


def display_text(value: Any) -> str:
    return " ".join(
        unicodedata.normalize("NFC", str(value or "")).translate(QUOTE_FOLD).split()
    )


def strict_key(value: Any) -> str:
    return " ".join(
        unicodedata.normalize("NFKC", str(value or ""))
        .translate(QUOTE_FOLD)
        .casefold()
        .split()
    )


def content_key(value: Any) -> str:
    return " ".join(strict_key(token) for token in WORD_RE.findall(display_text(value)))


def word_count(value: Any) -> int:
    return len(WORD_RE.findall(display_text(value)))


def strip_editorial_brackets(value: Any) -> tuple[str, list[str], bool]:
    """Remove balanced square-bracket lesson annotations from model-facing English."""
    source = display_text(value)
    annotations = [
        display_text(match) for match in EDITORIAL_BRACKET_RE.findall(source)
    ]
    if not annotations:
        return source, [], False
    cleaned = EDITORIAL_BRACKET_RE.sub("", source)
    if "[" in cleaned or "]" in cleaned:
        return source, annotations, False
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"([.!?])(?:\s*\1)+", r"\1", cleaned)
    return display_text(cleaned), annotations, True


def raw_element_text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return unicodedata.normalize("NFC", "".join(element.itertext())).strip()


def split_explicit_parallel(
    english_raw: str, migmaq_raw: str
) -> tuple[list[tuple[str, str]], str | None]:
    """Split only source-authored runs of two or more nonbreaking spaces."""
    english_parts = [part.strip() for part in EXPLICIT_PARALLEL_RE.split(english_raw)]
    migmaq_parts = [part.strip() for part in EXPLICIT_PARALLEL_RE.split(migmaq_raw)]
    is_parallel = len(english_parts) > 1 or len(migmaq_parts) > 1
    if not is_parallel:
        return [(english_raw, migmaq_raw)], None
    if (
        len(english_parts) != len(migmaq_parts)
        or not all(english_parts)
        or not all(migmaq_parts)
    ):
        return [(english_raw, migmaq_raw)], "unaligned_explicit_parallel_sequence"
    return list(zip(english_parts, migmaq_parts, strict=True)), None


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


def existing_pair_text(row: dict[str, Any]) -> tuple[str, str]:
    translation = row.get("translation") or {}
    english = (
        row.get("unconditioned_input_text")
        or translation.get("eng_Latn")
        or row.get("input_text")
    )
    migmaq = translation.get("mic_Latn") or row.get("output_text")
    return display_text(english), display_text(migmaq)


def build_existing_index(
    split_rows: dict[str, Sequence[dict[str, Any]]],
) -> dict[str, dict[Any, set[str]]]:
    index: dict[str, dict[Any, set[str]]] = {
        "strict_pair": defaultdict(set),
        "source_content": defaultdict(set),
        "target_content": defaultdict(set),
    }
    for split, rows in split_rows.items():
        for row in rows:
            english, migmaq = existing_pair_text(row)
            source = content_key(english)
            target = content_key(migmaq)
            if not source or not target:
                raise ValueError(f"blank existing pair in {split}: {row.get('id')}")
            index["strict_pair"][(strict_key(english), strict_key(migmaq))].add(split)
            index["source_content"][source].add(split)
            index["target_content"][target].add(split)
    return index


def title_text(element: ET.Element) -> str:
    return display_text(raw_element_text(element.find("./title")))


def nearest_container(
    line: ET.Element,
    parents: dict[ET.Element, ET.Element],
) -> ET.Element | None:
    current = parents.get(line)
    while current is not None:
        if current.tag in {"dialog", "vocab"}:
            return current
        current = parents.get(current)
    return None


def task_fields(container_kind: str, english: str, migmaq: str) -> dict[str, Any]:
    lexical = (
        container_kind == "vocab" and word_count(english) == word_count(migmaq) == 1
    )
    task = "lexeme" if lexical else "translate"
    prefix = "<lexeme>" if lexical else "<translate>"
    return {
        "task": task,
        "task_prefix": prefix,
        "input_text": f"{prefix} {english}",
        "unconditioned_input_text": english,
        "pair_kind": (
            "attested_lesson_vocabulary_lexeme"
            if lexical
            else "attested_lesson_parallel_translation"
        ),
    }


def extract_source(
    xml_path: Path, commit: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    root = ET.parse(xml_path).getroot()
    if root.tag != "lessonset":
        raise ValueError(f"unexpected XML root: {root.tag}")
    parents = {child: parent for parent in root.iter() for child in parent}
    line_ledger: list[dict[str, Any]] = []
    pair_ledger: list[dict[str, Any]] = []
    source_url = (
        f"https://github.com/FieldDB/migmaq-lessons/blob/{commit}/data/master.xml"
    )

    for section_index, section in enumerate(root.findall("./section"), start=1):
        for unit_index, unit in enumerate(section.findall("./unit"), start=1):
            for lesson_index, lesson in enumerate(unit.findall("./lesson"), start=1):
                lesson_id = (
                    f"section-{section_index:02d}/unit-{unit_index:02d}/"
                    f"lesson-{lesson_index:03d}"
                )
                containers = [
                    element
                    for element in lesson.iter()
                    if element.tag in {"dialog", "vocab"}
                ]
                container_positions = {
                    element: position
                    for position, element in enumerate(containers, start=1)
                }
                line_positions: Counter[ET.Element] = Counter()
                for line in lesson.findall(".//line"):
                    container = nearest_container(line, parents)
                    container_kind = (
                        container.tag if container is not None else "unknown"
                    )
                    if container is not None:
                        line_positions[container] += 1
                    container_position = container_positions.get(container, 0)
                    line_position = line_positions.get(container, 0)
                    line_id = (
                        f"migmaq-lessons:{commit[:12]}:{lesson_id}:"
                        f"{container_kind}-{container_position:03d}:line-{line_position:03d}"
                    )
                    english_element = line.find("./english")
                    migmaq_element = line.find("./migmaq")
                    english_raw = raw_element_text(english_element)
                    migmaq_raw = raw_element_text(migmaq_element)
                    soundfile = display_text(raw_element_text(line.find("./soundfile")))
                    aligned, alignment_error = split_explicit_parallel(
                        english_raw, migmaq_raw
                    )
                    line_record = {
                        "id": line_id,
                        "source_commit": commit,
                        "source_url": source_url,
                        "source_locator": {
                            "section_index": section_index,
                            "section_title": title_text(section),
                            "unit_index": unit_index,
                            "unit_title": title_text(unit),
                            "lesson_index": lesson_index,
                            "lesson_title": title_text(lesson),
                            "lesson_id": lesson_id,
                            "container_kind": container_kind,
                            "container_index": container_position,
                            "line_index": line_position,
                        },
                        "raw_english": english_raw,
                        "raw_migmaq": migmaq_raw,
                        "soundfile": soundfile or None,
                        "explicit_parallel_parts": len(aligned),
                        "alignment_error": alignment_error,
                        "derived_pair_ids": [],
                    }
                    for part_index, (english_part, migmaq_part) in enumerate(
                        aligned, start=1
                    ):
                        pair_id = f"{line_id}:part-{part_index:02d}"
                        source_english = display_text(english_part)
                        english, editorial_annotations, annotations_removed = (
                            strip_editorial_brackets(source_english)
                        )
                        migmaq = display_text(migmaq_part)
                        flags: list[str] = []
                        exclusions: list[str] = []
                        if alignment_error:
                            exclusions.append(alignment_error)
                        if container_kind == "unknown":
                            exclusions.append("line_outside_dialog_or_vocab")
                        if not english:
                            exclusions.append("blank_english")
                        if not migmaq:
                            exclusions.append("blank_migmaq")
                        if len(aligned) > 1:
                            flags.append("split_from_explicit_parallel_sequence")
                        if editorial_annotations:
                            flags.append(
                                "english_editorial_brackets_removed"
                                if annotations_removed
                                else "english_editorial_brackets_unbalanced"
                            )
                        if (
                            english
                            and migmaq
                            and content_key(english) == content_key(migmaq)
                        ):
                            flags.append("source_target_content_identical")
                        pair = {
                            "id": pair_id,
                            "source_line_id": line_id,
                            "source_commit": commit,
                            "source_url": source_url,
                            "source_locator": line_record["source_locator"],
                            "source_part_index": part_index,
                            "source_part_count": len(aligned),
                            "source_raw_english": english_part,
                            "source_raw_migmaq": migmaq_part,
                            "source_english_with_editorial_annotations": source_english,
                            "english_editorial_annotations": editorial_annotations,
                            "english_editorial_annotations_removed": annotations_removed,
                            "source_lang": "eng_Latn",
                            "target_lang": "mic_Latn",
                            "direction": "eng-mic",
                            "orthography_scope": "Listuguj lesson source orthography",
                            "english": english,
                            "migmaq": migmaq,
                            "output_text": migmaq,
                            "translation": {"eng_Latn": english, "mic_Latn": migmaq},
                            "english_word_count": word_count(english),
                            "migmaq_word_count": word_count(migmaq),
                            "container_kind": container_kind,
                            "lesson_id": lesson_id,
                            "soundfile": soundfile or None,
                            "audio_in_sparse_checkout": False,
                            "rights_status": "CC-BY-4.0",
                            "attribution": "Copyright 2015 Listuguj Education Directorate",
                            "quality_flags": sorted(set(flags)),
                            "exclusion_reasons": sorted(set(exclusions)),
                            "strict_pair_key": hashlib.sha256(
                                f"{strict_key(english)}\0{strict_key(migmaq)}".encode()
                            ).hexdigest(),
                            "source_content_key": hashlib.sha256(
                                content_key(english).encode()
                            ).hexdigest(),
                            "target_content_key": hashlib.sha256(
                                content_key(migmaq).encode()
                            ).hexdigest(),
                            **task_fields(container_kind, english, migmaq),
                        }
                        line_record["derived_pair_ids"].append(pair_id)
                        pair_ledger.append(pair)
                    line_ledger.append(line_record)
    return line_ledger, pair_ledger


def annotate_eligibility(
    rows: list[dict[str, Any]], existing: dict[str, dict[Any, set[str]]]
) -> None:
    canonical_new_pairs: dict[tuple[str, str], str] = {}
    for row in sorted(rows, key=lambda item: str(item["id"])):
        english = row["english"]
        migmaq = row["migmaq"]
        pair = (strict_key(english), strict_key(migmaq))
        source = content_key(english)
        target = content_key(migmaq)
        flags = set(row["quality_flags"])
        exclusions = set(row["exclusion_reasons"])

        if pair in canonical_new_pairs:
            exclusions.add("duplicate_new_strict_pair")
            row["canonical_pair_id"] = canonical_new_pairs[pair]
        elif pair[0] and pair[1]:
            canonical_new_pairs[pair] = row["id"]

        exact_splits = existing["strict_pair"].get(pair, set())
        source_splits = existing["source_content"].get(source, set())
        target_splits = existing["target_content"].get(target, set())
        heldout_exact = exact_splits & {"validation", "test"}
        heldout_source = source_splits & {"validation", "test"}
        if heldout_exact:
            exclusions.add("existing_heldout_exact_pair")
        elif heldout_source:
            exclusions.add("existing_heldout_source_overlap")
        elif "train" in exact_splits:
            exclusions.add("existing_train_exact_pair")

        if "train" in source_splits and "train" not in exact_splits:
            flags.add("existing_train_source_overlap")
        if "train" in target_splits and "train" not in exact_splits:
            flags.add("existing_train_target_overlap")
        if target_splits & {"validation", "test"} and not heldout_exact:
            flags.add("existing_heldout_target_overlap")

        row["existing_split_overlap"] = {
            "exact_pair": sorted(exact_splits),
            "source_content": sorted(source_splits),
            "target_content": sorted(target_splits),
        }
        row["quality_flags"] = sorted(flags)
        row["exclusion_reasons"] = sorted(exclusions)
        row["approved_for_training"] = not exclusions


class UnionFind:
    def __init__(self, values: Iterable[str]) -> None:
        self.parent = {value: value for value in values}

    def find(self, value: str) -> str:
        parent = self.parent[value]
        if parent != value:
            self.parent[value] = self.find(parent)
        return self.parent[value]

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return
        low, high = sorted((left_root, right_root))
        self.parent[high] = low


def assign_cluster_splits(rows: list[dict[str, Any]], seed: int) -> dict[str, Any]:
    eligible = [row for row in rows if row["approved_for_training"]]
    lesson_ids = sorted({str(row["lesson_id"]) for row in eligible})
    union_find = UnionFind(lesson_ids)
    key_owner: dict[tuple[str, str], str] = {}
    for row in eligible:
        lesson_id = str(row["lesson_id"])
        keys = (
            ("source", content_key(row["english"])),
            ("target", content_key(row["migmaq"])),
        )
        for key in keys:
            owner = key_owner.setdefault(key, lesson_id)
            union_find.union(owner, lesson_id)

    component_lessons: dict[str, list[str]] = defaultdict(list)
    for lesson_id in lesson_ids:
        component_lessons[union_find.find(lesson_id)].append(lesson_id)
    lesson_assignment: dict[str, tuple[str, str]] = {}
    component_records: list[dict[str, Any]] = []
    for lessons in component_lessons.values():
        ordered = sorted(lessons)
        component_id = hashlib.sha256("\0".join(ordered).encode()).hexdigest()
        split_value = (
            int(hashlib.sha256(f"{seed}:{component_id}".encode()).hexdigest(), 16) % 100
        )
        split = next(
            label
            for label, upper_bound in SPLIT_THRESHOLDS
            if split_value < upper_bound
        )
        for lesson_id in ordered:
            lesson_assignment[lesson_id] = (split, component_id)
        component_records.append(
            {
                "component_id": component_id,
                "split_hash_bucket": split_value,
                "split": split,
                "lesson_ids": ordered,
            }
        )

    for row in rows:
        if row["approved_for_training"]:
            split, component_id = lesson_assignment[str(row["lesson_id"])]
            row["split"] = split
            row["split_component_id"] = component_id
        else:
            row["split"] = "excluded"
            row["split_component_id"] = None

    split_rows = {
        split: [row for row in eligible if row["split"] == split]
        for split in ("train", "validation", "test")
    }
    for split, materialized in split_rows.items():
        if not materialized:
            raise ValueError(f"deterministic cluster split produced no {split} rows")
    overlap = cross_split_overlap(split_rows)
    if any(overlap.values()):
        raise AssertionError(f"cross-split leakage after clustering: {overlap}")
    return {
        "components": sorted(component_records, key=lambda row: row["component_id"]),
        "cross_split_overlap": overlap,
    }


def cross_split_overlap(
    split_rows: dict[str, Sequence[dict[str, Any]]],
) -> dict[str, int]:
    indices: dict[str, dict[str, set[Any]]] = {}
    for split, rows in split_rows.items():
        indices[split] = {
            "strict_pair": {
                (strict_key(row["english"]), strict_key(row["migmaq"])) for row in rows
            },
            "source_content": {content_key(row["english"]) for row in rows},
            "target_content": {content_key(row["migmaq"]) for row in rows},
        }
    result: dict[str, int] = {}
    split_names = sorted(indices)
    for left_index, left in enumerate(split_names):
        for right in split_names[left_index + 1 :]:
            for key in ("strict_pair", "source_content", "target_content"):
                result[f"{left}_{right}_{key}"] = len(
                    indices[left][key] & indices[right][key]
                )
    return result


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            count += 1
    return count


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def output_record(path: Path, root: Path) -> dict[str, Any]:
    rows = None
    if path.suffix == ".jsonl":
        with path.open(encoding="utf-8") as handle:
            rows = sum(1 for _ in handle)
    return {
        "path": str(path.relative_to(root)),
        "rows": rows,
        "sha256": sha256(path),
    }


def counter_by(rows: Iterable[dict[str, Any]], key: str) -> dict[str, int]:
    return dict(sorted(Counter(str(row.get(key)) for row in rows).items()))


def git_value(repo: Path, *arguments: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *arguments],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def main() -> None:
    args = parse_args()
    source_repo = args.source_repo.expanduser().resolve()
    source_paths = {
        "xml": source_repo / "data/master.xml",
        "license": source_repo / "LICENSE.md",
        "copyright": source_repo / "COPYRIGHT.md",
        "existing_train": args.existing_train.expanduser().resolve(),
        "existing_validation": args.existing_validation.expanduser().resolve(),
        "existing_test": args.existing_test.expanduser().resolve(),
    }
    for path in source_paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)
    actual_commit = git_value(source_repo, "rev-parse", "HEAD")
    if actual_commit != args.expected_commit:
        raise ValueError(
            f"source commit changed: {actual_commit} != {args.expected_commit}"
        )
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)

    existing_rows = {
        "train": read_jsonl(source_paths["existing_train"]),
        "validation": read_jsonl(source_paths["existing_validation"]),
        "test": read_jsonl(source_paths["existing_test"]),
    }
    existing_index = build_existing_index(existing_rows)
    line_rows, pair_rows = extract_source(source_paths["xml"], actual_commit)
    annotate_eligibility(pair_rows, existing_index)
    split_audit = assign_cluster_splits(pair_rows, args.seed)
    pair_by_id = {str(row["id"]): row for row in pair_rows}
    for line in line_rows:
        derived = [pair_by_id[row_id] for row_id in line["derived_pair_ids"]]
        line["derived_dispositions"] = counter_by(derived, "split")

    ordered_pairs = sorted(pair_rows, key=lambda row: str(row["id"]))
    ordered_lines = sorted(line_rows, key=lambda row: str(row["id"]))
    review_rows = [
        row for row in ordered_pairs if row["quality_flags"] or row["exclusion_reasons"]
    ]

    with tempfile.TemporaryDirectory(
        prefix=f".{output_dir.name}.", dir=output_dir.parent
    ) as temporary_name:
        staging = Path(temporary_name)
        generated: list[Path] = []
        files_and_rows = (
            ("ledger/source-lines.jsonl", ordered_lines),
            ("ledger/pair-ledger.jsonl", ordered_pairs),
            ("review/review-queue.jsonl", review_rows),
            (
                "training/train.eng-mic.jsonl",
                [row for row in ordered_pairs if row["split"] == "train"],
            ),
            (
                "evaluation/validation.eng-mic.jsonl",
                [row for row in ordered_pairs if row["split"] == "validation"],
            ),
            (
                "evaluation/sealed-test.eng-mic.jsonl",
                [row for row in ordered_pairs if row["split"] == "test"],
            ),
        )
        for relative, rows in files_and_rows:
            path = staging / relative
            write_jsonl(path, rows)
            generated.append(path)

        eligible = [row for row in ordered_pairs if row["approved_for_training"]]
        excluded = [row for row in ordered_pairs if not row["approved_for_training"]]
        manifest = {
            "schema_version": 1,
            "operation": "build_migmaq_lessons_parallel",
            "dataset_id": output_dir.name,
            "created_at": utc_now(),
            "direction": "eng-mic",
            "seed": args.seed,
            "source": {
                "repository": "https://github.com/FieldDB/migmaq-lessons",
                "commit": actual_commit,
                "commit_time": git_value(
                    source_repo, "show", "-s", "--format=%cI", "HEAD"
                ),
                "xml": {
                    "path": str(source_paths["xml"]),
                    "sha256": sha256(source_paths["xml"]),
                },
                "license": {
                    "path": str(source_paths["license"]),
                    "sha256": sha256(source_paths["license"]),
                    "spdx": "CC-BY-4.0",
                },
                "copyright": {
                    "path": str(source_paths["copyright"]),
                    "sha256": sha256(source_paths["copyright"]),
                    "notice": "Copyright 2015 Listuguj Education Directorate",
                },
            },
            "existing_corpus": {
                split: {
                    "path": str(source_paths[f"existing_{split}"]),
                    "rows": len(rows),
                    "sha256": sha256(source_paths[f"existing_{split}"]),
                }
                for split, rows in existing_rows.items()
            },
            "normalization": {
                "model_text": "NFC, quote folding, balanced square-bracket lesson annotations removed from English, Unicode whitespace collapse; case and punctuation preserved",
                "strict_comparison": "NFKC, quote folding, casefold, Unicode whitespace collapse; punctuation preserved",
                "content_comparison": "strict comparison over Unicode word tokens; punctuation omitted",
            },
            "eligibility_contract": {
                "excluded": [
                    "blank side",
                    "line outside dialog/vocab",
                    "unmatched explicit nonbreaking-space sequence",
                    "duplicate new strict pair",
                    "exact pair already in existing train/validation/test",
                    "English content overlap with existing validation/test",
                ],
                "heldout_target_only_overlap": "flagged but not excluded",
                "task_mapping": "one-word/one-word vocab rows use <lexeme>; all other rows use <translate>",
            },
            "split_contract": {
                "ratios": {"train": 0.8, "validation": 0.1, "test": 0.1},
                "unit": "connected components of whole lessons linked by repeated English or Mi'kmaq content",
                "assignment": "SHA-256(seed:component_id) modulo 100",
                "sealed_test_policy": "do not inspect or use for screening; open once after recipe lock",
            },
            "counts": {
                "source_lines": len(ordered_lines),
                "derived_pairs": len(ordered_pairs),
                "eligible_unique_pairs": len(eligible),
                "excluded_pairs": len(excluded),
                "split": counter_by(ordered_pairs, "split"),
                "task_eligible": counter_by(eligible, "task"),
                "container_eligible": counter_by(eligible, "container_kind"),
                "exclusion_reasons": dict(
                    sorted(
                        Counter(
                            reason
                            for row in excluded
                            for reason in row["exclusion_reasons"]
                        ).items()
                    )
                ),
                "quality_flags": dict(
                    sorted(
                        Counter(
                            flag
                            for row in ordered_pairs
                            for flag in row["quality_flags"]
                        ).items()
                    )
                ),
                "connected_lesson_components": len(split_audit["components"]),
            },
            "leakage_audit": {
                "cross_new_split_overlap": split_audit["cross_split_overlap"],
                "existing_heldout_exclusions": sum(
                    any(
                        reason.startswith("existing_heldout_")
                        for reason in row["exclusion_reasons"]
                    )
                    for row in excluded
                ),
            },
            "component_assignments": split_audit["components"],
            "builder": {
                "path": str(Path(__file__).resolve()),
                "sha256": sha256(Path(__file__).resolve()),
            },
            "outputs": {
                str(path.relative_to(staging)): output_record(path, staging)
                for path in generated
            },
        }
        manifest_path = staging / "manifest.json"
        write_json(manifest_path, manifest)
        generated.append(manifest_path)
        checksums_path = staging / "SHA256SUMS"
        with checksums_path.open("w", encoding="utf-8") as handle:
            for path in sorted(generated):
                handle.write(f"{sha256(path)}  {path.relative_to(staging)}\n")
        staging.rename(output_dir)

    print(json.dumps(manifest["counts"], indent=2, sort_keys=True))
    print(f"output={output_dir}")


if __name__ == "__main__":
    main()

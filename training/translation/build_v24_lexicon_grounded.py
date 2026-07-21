#!/usr/bin/env python3
"""Build deterministic v24 lexical-replay arms from a governed JSON-LD lexicon."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


TOKEN_RE = re.compile(r"[^\W\d_]+(?:[-'][^\W\d_]+)*", re.UNICODE)
MORPHOLOGY_POS_MARKERS = ("affix", "suffix", "morpheme", "casemarker")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexicon", type=Path, required=True)
    parser.add_argument("--retention-train", type=Path, required=True)
    parser.add_argument("--validation-file", type=Path, required=True)
    parser.add_argument("--test-file", type=Path, required=True)
    parser.add_argument("--lexicon-probe", type=Path, required=True)
    parser.add_argument(
        "--lineage",
        action="append",
        default=[],
        metavar="LABEL=PATH",
        help="Documented ancestor training file. Repeat for each ancestor.",
    )
    parser.add_argument("--selection-lineage-label", default="v21.2")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", default="v24-lexicon-grounded-2026-07-15")
    parser.add_argument("--task-prefix", default="<lexeme>")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_rank(seed: str, namespace: str, value: str) -> str:
    return hashlib.sha256(f"{seed}\0{namespace}\0{value}".encode()).hexdigest()


def clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(unicodedata.normalize("NFC", value).split())


def normalize(value: Any) -> str:
    return clean_text(value).casefold()


def tokens(value: Any) -> tuple[str, ...]:
    return tuple(normalize(token) for token in TOKEN_RE.findall(clean_text(value)))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSON at {path}:{line_number}: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"expected an object at {path}:{line_number}")
            rows.append(row)
    return rows


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            count += 1
    return count


def parse_lineage(values: list[str], retention_train: Path) -> dict[str, Path]:
    lineage: dict[str, Path] = {}
    for value in values:
        label, separator, raw_path = value.partition("=")
        label = label.strip()
        if not separator or not label or not raw_path.strip():
            raise ValueError(f"invalid --lineage value {value!r}; expected LABEL=PATH")
        if label in lineage:
            raise ValueError(f"duplicate lineage label: {label}")
        lineage[label] = Path(raw_path).expanduser().resolve()
    retention_path = retention_train.resolve()
    if "v21.2" in lineage and lineage["v21.2"] != retention_path:
        raise ValueError("lineage label v21.2 must identify --retention-train")
    lineage.setdefault("v21.2", retention_path)
    for label, path in lineage.items():
        if not path.is_file():
            raise FileNotFoundError(f"lineage file does not exist ({label}): {path}")
    return lineage


def local_pos(value: Any) -> str:
    text = clean_text(value)
    return text.rsplit(":", 1)[-1] if text else "unknown"


def classify_entry(headword: str, definition: str, part_of_speech: str) -> tuple[str, str]:
    if not headword or not definition:
        return "deferred", "missing_headword_or_definition"
    if any(unicodedata.category(character).startswith("C") for character in headword + definition):
        return "deferred", "control_character"
    if headword.upper() == headword and headword.lower() != headword:
        return "notation", "uppercase_grammatical_or_source_notation"
    normalized_pos = part_of_speech.casefold()
    if normalized_pos == "propernoun":
        return "proper_name", "structured_part_of_speech"
    if any(marker in normalized_pos for marker in MORPHOLOGY_POS_MARKERS):
        return "morphology", "structured_part_of_speech"
    if headword.startswith("-") or headword.endswith("-"):
        return "morphology", "bound_form_orthography"
    if not tokens(headword) or not tokens(definition):
        return "deferred", "no_lexical_tokens"
    return "lexical", "structurally_eligible"


def lexicon_entries(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    graph = payload.get("@graph")
    if not isinstance(graph, list) or not graph:
        raise ValueError("lexicon must contain a non-empty @graph array")
    entries: list[dict[str, Any]] = []
    for index, source in enumerate(graph):
        if not isinstance(source, dict):
            source = {}
        canonical = source.get("ontolex:canonicalForm") or {}
        sense = source.get("ontolex:sense") or {}
        definition_record = sense.get("ontolex:definition") or {}
        headword = clean_text(canonical.get("ontolex:writtenRep")) if isinstance(canonical, dict) else ""
        definition = clean_text(definition_record.get("@value")) if isinstance(definition_record, dict) else ""
        part_of_speech = local_pos(source.get("lexinfo:partOfSpeech"))
        classification, reason = classify_entry(headword, definition, part_of_speech)
        entries.append(
            {
                "source_index": index,
                "entry_id": clean_text(source.get("@id")) or f"lexicon-entry-{index + 1}",
                "headword": headword,
                "definition": definition,
                "normalized_headword": normalize(headword),
                "normalized_definition": normalize(definition),
                "part_of_speech": part_of_speech,
                "classification": classification,
                "classification_reason": reason,
                "source_record": source,
            }
        )
    return entries


def probe_index(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        prompt = normalize(row.get("unconditioned_input_text") or row.get("input_text"))
        accepted = [clean_text(value) for value in row.get("accepted_references", []) if clean_text(value)]
        if not prompt or not accepted:
            raise ValueError(f"probe row lacks prompt or accepted references: {row.get('id')}")
        if prompt in indexed:
            raise ValueError(f"duplicate normalized probe prompt: {prompt}")
        indexed[prompt] = {"row": row, "accepted": accepted}
    return indexed


def lineage_inventory(
    lineage: dict[str, Path],
    maximum_ngram: int,
) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    inventories: dict[str, dict[str, Any]] = {}
    rows_by_label: dict[str, list[dict[str, Any]]] = {}
    for label, path in lineage.items():
        rows = read_jsonl(path)
        rows_by_label[label] = rows
        target_ngrams: Counter[tuple[str, ...]] = Counter()
        isolated_sources: Counter[str] = Counter()
        for row in rows:
            target_tokens = tokens(row.get("output_text"))
            for size in range(1, min(maximum_ngram, len(target_tokens)) + 1):
                target_ngrams.update(
                    target_tokens[offset : offset + size]
                    for offset in range(len(target_tokens) - size + 1)
                )
            source = normalize(row.get("unconditioned_input_text") or row.get("input_text"))
            if source:
                isolated_sources[source] += 1
        inventories[label] = {
            "path": str(path),
            "sha256": sha256(path),
            "rows": len(rows),
            "target_ngrams": target_ngrams,
            "isolated_sources": isolated_sources,
        }
    return inventories, rows_by_label


def occurrence_record(
    headword: str,
    definition: str,
    inventories: dict[str, dict[str, Any]],
) -> dict[str, dict[str, int]]:
    target = tokens(headword)
    source = normalize(definition)
    return {
        label: {
            "target_surface_occurrences": int(inventory["target_ngrams"][target]) if target else 0,
            "isolated_source_occurrences": int(inventory["isolated_sources"][source]) if source else 0,
        }
        for label, inventory in inventories.items()
    }


def preferred_target(
    entries: list[dict[str, Any]],
    selection_label: str,
) -> dict[str, Any]:
    def score(entry: dict[str, Any]) -> tuple[int, int, int]:
        exposure = entry["documented_lineage_exposure"]
        preferred = exposure[selection_label]["target_surface_occurrences"]
        total = sum(item["target_surface_occurrences"] for item in exposure.values())
        return preferred, total, -int(entry["source_index"])

    return max(entries, key=score)


def build_lexical_rows(
    entries: list[dict[str, Any]],
    probes: dict[str, dict[str, Any]],
    inventories: dict[str, dict[str, Any]],
    selection_label: str,
    task_prefix: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    accepted_by_probe = {
        prompt: {normalize(reference) for reference in record["accepted"]}
        for prompt, record in probes.items()
    }
    for entry in entries:
        entry["probe_required"] = (
            entry["normalized_definition"] in accepted_by_probe
            and entry["normalized_headword"] in accepted_by_probe[entry["normalized_definition"]]
        )
        entry["training_eligible"] = entry["classification"] == "lexical" or entry["probe_required"]
        entry["documented_lineage_exposure"] = occurrence_record(
            entry["headword"], entry["definition"], inventories
        )
        entry["upstream_nllb_exposure"] = "unknown"

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        if entry["training_eligible"] and entry["normalized_definition"]:
            grouped[entry["normalized_definition"]].append(entry)

    lexical_rows: list[dict[str, Any]] = []
    for prompt in sorted(grouped):
        source_entries = grouped[prompt]
        selected = preferred_target(source_entries, selection_label)
        accepted_references = list(dict.fromkeys(entry["headword"] for entry in source_entries))
        digest = hashlib.sha256(prompt.encode()).hexdigest()[:20]
        lexical_rows.append(
            {
                "id": f"v24-lexeme:{digest}",
                "direction": "eng-gvn",
                "input_text": f"{task_prefix} {selected['definition']}",
                "unconditioned_input_text": selected["definition"],
                "output_text": selected["headword"],
                "accepted_references": accepted_references,
                "pair_kind": "dictionary_lexeme",
                "source_lang": "eng_Latn",
                "target_lang": "gvn_Latn",
                "approved_for_training": True,
                "promotion_eligible": False,
                "rights_status": "source_lexicon_research_scope_only",
                "lexicon": {
                    "normalized_prompt": prompt,
                    "entry_ids": [entry["entry_id"] for entry in source_entries],
                    "parts_of_speech": sorted({entry["part_of_speech"] for entry in source_entries}),
                    "selected_entry_id": selected["entry_id"],
                    "selection_method": "max_v21.2_then_all_documented_target_occurrences_then_source_order",
                    "documented_lineage_exposure": selected["documented_lineage_exposure"],
                    "upstream_nllb_exposure": "unknown",
                    "probe_required": prompt in probes,
                    "identity_mapping": normalize(selected["definition"]) == normalize(selected["headword"]),
                },
                "task_tagging": {
                    "enabled": True,
                    "task": "lexeme",
                    "template": f"{task_prefix} {{input_text}}",
                },
            }
        )

    lexical_by_prompt = {
        row["lexicon"]["normalized_prompt"]: row
        for row in lexical_rows
    }
    missing_prompts = sorted(set(probes) - set(lexical_by_prompt))
    if missing_prompts:
        raise ValueError(f"training lexicon does not cover {len(missing_prompts)} probe prompts")
    for prompt, probe in probes.items():
        training_references = {normalize(value) for value in lexical_by_prompt[prompt]["accepted_references"]}
        if not training_references.intersection(normalize(value) for value in probe["accepted"]):
            raise ValueError(f"training references do not cover probe references for {prompt!r}")

    transformed_probe: list[dict[str, Any]] = []
    for prompt in sorted(probes):
        original = dict(probes[prompt]["row"])
        lexical = lexical_by_prompt[prompt]
        source = clean_text(original.get("unconditioned_input_text"))
        original["input_text"] = f"{task_prefix} {source}"
        original["output_text"] = lexical["output_text"]
        original["task_tagging"] = {
            "enabled": True,
            "task": "lexeme",
            "template": f"{task_prefix} {{input_text}}",
        }
        original["v24_probe"] = {
            "closed_set_reconstruction": True,
            "training_pair_id": lexical["id"],
            "documented_lineage_exposure": lexical["lexicon"]["documented_lineage_exposure"],
            "upstream_nllb_exposure": "unknown",
        }
        transformed_probe.append(original)
    return lexical_rows, transformed_probe


def row_id(row: dict[str, Any], index: int) -> str:
    value = clean_text(row.get("id"))
    return value or f"retention-row-{index + 1}"


def scheduled_arm(
    retention_rows: list[dict[str, Any]],
    lexical_rows: list[dict[str, Any]],
    replication: int,
    arm: str,
    seed: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    slots = []
    for index, row in enumerate(retention_rows):
        identity = row_id(row, index)
        slots.append(
            {
                "index": index,
                "identity": identity,
                "replacement_rank": stable_rank(seed, "replacement", f"{index}:{identity}"),
                "order_rank": stable_rank(seed, "order", f"{index}:{identity}"),
            }
        )

    lexical_schedule: list[dict[str, Any]] = []
    for replica in range(1, replication + 1):
        for row in lexical_rows:
            scheduled = dict(row)
            scheduled["id"] = f"{row['id']}:rep{replica}"
            scheduled["lexical_replay"] = {"replica": replica, "arm": arm}
            lexical_schedule.append(scheduled)
    lexical_schedule.sort(key=lambda row: stable_rank(seed, arm, row["id"]))
    if len(lexical_schedule) > len(slots):
        raise ValueError(f"{arm} lexical schedule is larger than the retention schedule")

    selected_slots = sorted(slots, key=lambda slot: slot["replacement_rank"])[: len(lexical_schedule)]
    lexical_by_index = {
        slot["index"]: lexical
        for slot, lexical in zip(selected_slots, lexical_schedule, strict=True)
    }
    output_rows: list[tuple[str, dict[str, Any]]] = []
    removed_pair_kinds: Counter[str] = Counter()
    retained_pair_kinds: Counter[str] = Counter()
    for slot in slots:
        source_row = retention_rows[slot["index"]]
        if slot["index"] in lexical_by_index:
            replacement = dict(lexical_by_index[slot["index"]])
            replacement["v24_schedule"] = {
                "arm": arm,
                "slot": slot["index"],
                "replaced_retention_id": slot["identity"],
                "replaced_pair_kind": source_row.get("pair_kind", "unclassified"),
            }
            removed_pair_kinds[str(source_row.get("pair_kind", "unclassified"))] += 1
            output_rows.append((slot["order_rank"], replacement))
        else:
            retained = dict(source_row)
            retained["v24_schedule"] = {"arm": arm, "slot": slot["index"], "retained": True}
            retained_pair_kinds[str(source_row.get("pair_kind", "unclassified"))] += 1
            output_rows.append((slot["order_rank"], retained))
    output_rows.sort(key=lambda item: item[0])
    rows = [row for _, row in output_rows]
    identities = [row_id(row, index) for index, row in enumerate(rows)]
    if len(identities) != len(set(identities)):
        raise ValueError(f"{arm} contains duplicate row ids")
    return rows, {
        "arm": arm,
        "total_rows": len(rows),
        "lexical_rows": len(lexical_schedule),
        "lexical_unique_pairs": len(lexical_rows) if replication else 0,
        "lexical_replication": replication,
        "retention_rows": len(rows) - len(lexical_schedule),
        "lexical_row_fraction": len(lexical_schedule) / len(rows),
        "removed_retention_pair_kinds": dict(sorted(removed_pair_kinds.items())),
        "retained_pair_kinds": dict(sorted(retained_pair_kinds.items())),
        "schedule": "nested deterministic replacement mask plus common deterministic slot order",
    }


def public_inventory(inventories: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        label: {key: value for key, value in inventory.items() if key not in {"target_ngrams", "isolated_sources"}}
        for label, inventory in inventories.items()
    }


def build(args: argparse.Namespace) -> dict[str, Any]:
    required = [
        args.lexicon,
        args.retention_train,
        args.validation_file,
        args.test_file,
        args.lexicon_probe,
    ]
    for path in required:
        if not path.is_file():
            raise FileNotFoundError(path)
    if args.output_dir.exists():
        raise FileExistsError(f"refusing existing output directory: {args.output_dir}")

    lineage = parse_lineage(args.lineage, args.retention_train)
    if args.selection_lineage_label not in lineage:
        raise ValueError(f"selection lineage label is absent: {args.selection_lineage_label}")
    entries = lexicon_entries(args.lexicon)
    probe_rows = read_jsonl(args.lexicon_probe)
    probes = probe_index(probe_rows)
    maximum_ngram = max((len(tokens(entry["headword"])) for entry in entries), default=1)
    inventories, rows_by_label = lineage_inventory(lineage, maximum_ngram)
    retention_rows = rows_by_label["v21.2"]
    validation_rows = read_jsonl(args.validation_file)
    test_rows = read_jsonl(args.test_file)
    lexical_rows, transformed_probe = build_lexical_rows(
        entries,
        probes,
        inventories,
        args.selection_lineage_label,
        args.task_prefix,
    )

    args.output_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir = Path(
        tempfile.mkdtemp(
            prefix=f".{args.output_dir.name}.building-",
            dir=args.output_dir.parent,
        )
    )

    write_jsonl(staging_dir / "lexicon" / "source-entry-ledger.jsonl", entries)
    write_jsonl(staging_dir / "lexicon" / "trainable-pairs.eng-gvn.jsonl", lexical_rows)
    write_jsonl(staging_dir / "evaluation" / "lexeme-probe.eng-gvn.jsonl", transformed_probe)

    arm_specs = {"C0": 0, "L1": 1, "L2": 2, "L4": 4}
    arm_manifests: dict[str, Any] = {}
    for arm, replication in arm_specs.items():
        rows, arm_manifest = scheduled_arm(retention_rows, lexical_rows, replication, arm, args.seed)
        arm_root = staging_dir / "arms" / arm
        write_jsonl(arm_root / "train.eng-gvn.jsonl", rows)
        shutil.copyfile(args.validation_file, arm_root / "validation.eng-gvn.jsonl")
        shutil.copyfile(args.test_file, arm_root / "test.eng-gvn.jsonl")
        write_json(arm_root / "arm_manifest.json", arm_manifest)
        arm_manifests[arm] = arm_manifest

    classification_counts = Counter(entry["classification"] for entry in entries)
    manifest = {
        "schema_version": 1,
        "dataset_id": "v24.0-lexicon-grounded-screen",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "built_not_trained",
        "seed": args.seed,
        "purpose": "Closed-set lexical reconstruction treatment with matched sentence-retention controls.",
        "interpretation": {
            "lexical_endpoint": "closed-set reconstruction of governed mappings",
            "not_claimed": [
                "unseen arbitrary lexical generalization",
                "free-form sentence reliability",
                "speaker or community certification",
            ],
            "upstream_nllb_exposure": "unknown",
        },
        "sources": {
            "lexicon": {"path": str(args.lexicon.resolve()), "sha256": sha256(args.lexicon), "entries": len(entries)},
            "retention_train": {
                "path": str(args.retention_train.resolve()),
                "sha256": sha256(args.retention_train),
                "rows": len(retention_rows),
            },
            "validation": {
                "path": str(args.validation_file.resolve()),
                "sha256": sha256(args.validation_file),
                "rows": len(validation_rows),
            },
            "test": {
                "path": str(args.test_file.resolve()),
                "sha256": sha256(args.test_file),
                "rows": len(test_rows),
            },
            "lexicon_probe": {
                "path": str(args.lexicon_probe.resolve()),
                "sha256": sha256(args.lexicon_probe),
                "rows": len(probe_rows),
            },
            "builder": {"path": str(Path(__file__).resolve()), "sha256": sha256(Path(__file__))},
            "documented_lineage": public_inventory(inventories),
        },
        "lexicon": {
            "source_entries": len(entries),
            "classification_counts": dict(sorted(classification_counts.items())),
            "training_eligible_entries": sum(bool(entry["training_eligible"]) for entry in entries),
            "trainable_unique_prompts": len(lexical_rows),
            "probe_prompts": len(probe_rows),
            "probe_prompts_covered": len(transformed_probe),
            "selection_lineage_label": args.selection_lineage_label,
            "selection_rule": "max selected-lineage target frequency, then all-lineage frequency, then source order",
        },
        "arms": arm_manifests,
        "training_contract": {
            "base_model": "exact v21.2 merged weights and tokenizer",
            "decoder": "frozen during weight comparisons",
            "optimizer_horizon": "must be supplied as exact max_steps by the RunPod contract",
            "token_accounting": "must be measured from actual training forwards by task",
            "arm_row_count_equal": len({item["total_rows"] for item in arm_manifests.values()}) == 1,
        },
    }
    write_json(staging_dir / "MANIFEST.json", manifest)

    checksum_paths = sorted(
        path
        for path in staging_dir.rglob("*")
        if path.is_file() and path.name not in {"SHA256SUMS", "BUILD_COMPLETE"}
    )
    checksum_text = "".join(
        f"{sha256(path)}  {path.relative_to(staging_dir)}\n"
        for path in checksum_paths
    )
    (staging_dir / "SHA256SUMS").write_text(checksum_text, encoding="utf-8")
    (staging_dir / "BUILD_COMPLETE").touch()
    try:
        staging_dir.rename(args.output_dir)
    except BaseException:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise
    return manifest


def main() -> None:
    args = parse_args()
    manifest = build(args)
    print(
        json.dumps(
            {
                "dataset_id": manifest["dataset_id"],
                "lexicon": manifest["lexicon"],
                "arms": manifest["arms"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

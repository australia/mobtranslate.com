#!/usr/bin/env python3
"""Build the source-disjoint v21.1 Codex synthetic-direct RunPod dataset."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path
import shutil
import unicodedata
from typing import Any, Iterable


PROGRAM = Path(
    "/mnt/donto-data/donto-resources/research/translation-training/"
    "kuku-yalanji-runpod-2026-06-30"
)
SYNTH_EXPORT = PROGRAM / "synthetic/claude-synthetic-v1-2026-07-02/export"
EXTERNAL_ROOT = PROGRAM / "prepared/v18.0-v10-plus-elder-sentence-pair"
AUDIT_RESULT = PROGRAM / "completion_audits/audit-goal-20000-result.json"
BASE_MODEL = (
    PROGRAM
    / "runpod/v12-gvn-token-ml48zbwtwhjnis/models/kuku-yalanji-nllb-lora/"
      "v12.0-tagged-direct-plus-reference-bible-gvn-token-4096row-25epoch-batch16/merged"
)
DEFAULT_OUTPUT = PROGRAM / "prepared/v21.1-codex-synthetic-direct"

EXPORT_HASHES = {
    "MANIFEST.json": "66f37fc8099406c98ddd7a35a055c49586d60db2cacbafae87ad6d8e47f3f5a4",
    "train.jsonl": "1945595c24b11b4d1ba4da14df38eb09e8f03891307befad8e0723c2efa4fe20",
    "dev.jsonl": "25ace6e437bb945454c35e50768f6a03d5e61a0d11bd136fa84a8b3d06101481",
    "synthtest.jsonl": "af697ff339dd89115cf79f50f99dec868481f7520bd3149355aaa6435e11fe2d",
}
EXTERNAL_FILES = {
    "elder_sentence_pair_43.eng-gvn.jsonl": (
        "elder_sentence_pair/all_elder_sentence_pair.eng-gvn.jsonl",
        "29a9bfbfecbe535b56eda3bf0ecf255a17190b438186b60b999c78e1ee4854d2",
    ),
    "db_usage_heldout_84.eng-gvn.jsonl": (
        "db_usage/heldout_usage.eng-gvn.jsonl",
        "0155ba7e21de41da94dbe5b2270994a1152a31a14bcbde73140f4b0efebb6fc6",
    ),
    "bible_direct_heldout_325.eng-gvn.jsonl": (
        "bible/heldout_direct_325.eng-gvn.jsonl",
        "c89058079d769c63342b02b19a93b70eef6ecb3d7e00a14b366468e3ccb5593b",
    ),
    "bible_ref_heldout_325.eng-gvn.jsonl": (
        "bible/heldout_ref_325.eng-gvn.jsonl",
        "2448043c0168b6950940c2ab34f5a19002fffbc0267ff6453d41470552148664",
    ),
}
BASE_HASHES = {
    "model.safetensors": "26bb5fc5ca75eca215081699e5d8a1dc64f69153431a4e78d6e87ebaee131a0f",
    "tokenizer.json": "357daed13ffd789678235cb2e8e25a1e57800f569fa59b99339e165e8860db0e",
    "config.json": "846f3f6eeed33aeb5c6260fb0a1316cc19b9888ae6c3a8da5ec61c9239ff1534",
}
CANONICAL_COUNTS = {"train": 16_820, "dev": 1_609, "synthtest": 1_618}
EFFECTIVE_COUNTS = {"train": 16_642, "validation": 1_609, "test": 1_606}
SEED = "v21.1-codex-synthetic-direct-2026-07-10"


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


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            row["_source_line"] = line_number
            rows.append(row)
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


def text_key(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    normalized = normalized.translate(str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"'}))
    return " ".join(normalized.split())


def target_surface_key(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    return "".join(character for character in normalized if character.isalpha())


def external_english(row: dict[str, Any]) -> str:
    return str(
        row.get("unconditioned_input_text")
        or (row.get("translation") or {}).get("eng_Latn")
        or row.get("input_text")
        or ""
    )


def stable_id(row: dict[str, Any]) -> str:
    payload = "\0".join((row["en"], row["ku"], row["analysis"]))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def stable_sort(rows: list[dict[str, Any]], salt: str) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda row: hashlib.sha256(f"{SEED}\0{salt}\0{row['id']}".encode()).hexdigest(),
    )


def convert(row: dict[str, Any], split: str) -> dict[str, Any]:
    source_line = int(row["_source_line"])
    metadata = row["meta"]
    identifier = f"synthetic:{stable_id(row)}"
    english = " ".join(row["en"].split())
    kuku = " ".join(row["ku"].split())
    return {
        "id": identifier,
        "split": split,
        "direction": "eng-gvn",
        "tier": f"synthetic_{metadata.get('quality_tier', 'B')}",
        "input_text": f"<translate> {english}",
        "output_text": kuku,
        "unconditioned_input_text": english,
        "source_lang": "eng_Latn",
        "target_lang": "gvn_Latn",
        "translation": {"eng_Latn": english, "gvn_Latn": kuku},
        "pair_kind": "synthetic_academic_parallel",
        "rights_status": "project_approved_synthetic_pending_elder_verification",
        "approved_for_training": True,
        "promotion_eligible": False,
        "task_tagging": {
            "enabled": True,
            "task": "translate",
            "template": "<translate> {input_text}",
        },
        "synthetic_corpus": {
            "source_export_split": (
                "train" if split == "train" else "dev" if split == "validation" else "synthtest"
            ),
            "source_line": source_line,
            "analysis": row["analysis"],
            "frame": metadata.get("frame"),
            "domain": metadata.get("domain"),
            "grammar": metadata.get("grammar", []),
            "lexical_targets": metadata.get("lexical_targets", []),
            "quality_tier": metadata.get("quality_tier"),
            "template_family": metadata.get("template_family"),
            "n_kuku_words": metadata.get("n_kuku_words"),
            "sentence_status": metadata.get("status"),
            "register": metadata.get("register"),
            "original_src_tagged": row.get("src_tagged"),
        },
    }


def file_record(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(root)),
        "rows": sum(1 for line in path.open(encoding="utf-8") if line.strip()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def assert_unique_ids(rows: list[dict[str, Any]], label: str) -> None:
    ids = [str(row["id"]) for row in rows]
    if len(ids) != len(set(ids)):
        duplicates = [item for item, count in collections.Counter(ids).items() if count > 1]
        raise ValueError(f"{label}: duplicate ids {duplicates[:10]}")


def key_intersections(
    first: list[dict[str, Any]], second: list[dict[str, Any]]
) -> dict[str, int]:
    return {
        "source": len({text_key(row["unconditioned_input_text"]) for row in first} & {
            text_key(row["unconditioned_input_text"]) for row in second
        }),
        "target_surface": len({target_surface_key(row["output_text"]) for row in first} & {
            target_surface_key(row["output_text"]) for row in second
        }),
        "pair": len({
            (text_key(row["unconditioned_input_text"]), target_surface_key(row["output_text"]))
            for row in first
        } & {
            (text_key(row["unconditioned_input_text"]), target_surface_key(row["output_text"]))
            for row in second
        }),
    }


def main() -> int:
    args = parse_args()
    output = args.output_dir.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"refusing nonempty output directory: {output}")
    output.mkdir(parents=True, exist_ok=True)

    audit = json.loads(AUDIT_RESULT.read_text(encoding="utf-8"))
    if audit.get("status") != "PASS" or audit.get("mode") != "final" or audit.get("checks_failed") != 0:
        raise SystemExit("final 20,000-sentence audit is not PASS")

    actual_export_hashes = {name: sha256(SYNTH_EXPORT / name) for name in EXPORT_HASHES}
    if actual_export_hashes != EXPORT_HASHES:
        raise SystemExit(f"synthetic export hash drift: {actual_export_hashes}")
    actual_base_hashes = {name: sha256(BASE_MODEL / name) for name in BASE_HASHES}
    if actual_base_hashes != BASE_HASHES:
        raise SystemExit(f"v12 base hash drift: {actual_base_hashes}")

    external_rows: list[dict[str, Any]] = []
    external_hashes: dict[str, str] = {}
    external_outputs: list[Path] = []
    for output_name, (relative, expected_hash) in EXTERNAL_FILES.items():
        source = EXTERNAL_ROOT / relative
        actual_hash = sha256(source)
        if actual_hash != expected_hash:
            raise SystemExit(f"external hash drift: {relative}: {actual_hash}")
        external_hashes[relative] = actual_hash
        rows = read_jsonl(source)
        external_rows.extend(rows)
        target = output / "external" / output_name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        external_outputs.append(target)

    canonical = {
        "train": read_jsonl(SYNTH_EXPORT / "train.jsonl"),
        "dev": read_jsonl(SYNTH_EXPORT / "dev.jsonl"),
        "synthtest": read_jsonl(SYNTH_EXPORT / "synthtest.jsonl"),
    }
    canonical_counts = {name: len(rows) for name, rows in canonical.items()}
    if canonical_counts != CANONICAL_COUNTS:
        raise SystemExit(f"canonical counts: {canonical_counts}")

    external_source_keys = {text_key(external_english(row)) for row in external_rows}
    external_target_keys = {target_surface_key(row["output_text"]) for row in external_rows}
    dev_source_keys = {text_key(row["en"]) for row in canonical["dev"]}
    dev_target_keys = {target_surface_key(row["ku"]) for row in canonical["dev"]}
    dev_external = {
        "source": len(dev_source_keys & external_source_keys),
        "target_surface": len(dev_target_keys & external_target_keys),
    }
    if any(dev_external.values()):
        raise SystemExit(f"synthetic dev overlaps locked external evaluation: {dev_external}")

    retained_test_raw: list[dict[str, Any]] = []
    quarantine: list[dict[str, Any]] = []
    for row in canonical["synthtest"]:
        reasons: list[str] = []
        if text_key(row["en"]) in dev_source_keys:
            reasons.append("dev_source_overlap")
        if target_surface_key(row["ku"]) in dev_target_keys:
            reasons.append("dev_target_surface_overlap")
        if text_key(row["en"]) in external_source_keys:
            reasons.append("external_source_overlap")
        if target_surface_key(row["ku"]) in external_target_keys:
            reasons.append("external_target_surface_overlap")
        if reasons:
            quarantine.append({
                "source_split": "synthtest",
                "source_line": row["_source_line"],
                "reasons": reasons,
                "en": row["en"],
                "ku": row["ku"],
                "analysis": row["analysis"],
                "meta": row["meta"],
            })
        else:
            retained_test_raw.append(row)

    test_source_keys = {text_key(row["en"]) for row in retained_test_raw}
    test_target_keys = {target_surface_key(row["ku"]) for row in retained_test_raw}
    retained_train_raw: list[dict[str, Any]] = []
    for row in canonical["train"]:
        reasons = []
        if text_key(row["en"]) in dev_source_keys | test_source_keys:
            reasons.append("retained_synthetic_eval_source_overlap")
        if target_surface_key(row["ku"]) in dev_target_keys | test_target_keys:
            reasons.append("retained_synthetic_eval_target_surface_overlap")
        if text_key(row["en"]) in external_source_keys:
            reasons.append("external_source_overlap")
        if target_surface_key(row["ku"]) in external_target_keys:
            reasons.append("external_target_surface_overlap")
        if reasons:
            quarantine.append({
                "source_split": "train",
                "source_line": row["_source_line"],
                "reasons": reasons,
                "en": row["en"],
                "ku": row["ku"],
                "analysis": row["analysis"],
                "meta": row["meta"],
            })
        else:
            retained_train_raw.append(row)

    train = [convert(row, "train") for row in retained_train_raw]
    validation = [convert(row, "validation") for row in canonical["dev"]]
    test = [convert(row, "test") for row in retained_test_raw]
    effective_counts = {"train": len(train), "validation": len(validation), "test": len(test)}
    if effective_counts != EFFECTIVE_COUNTS:
        raise SystemExit(f"effective counts: {effective_counts}")
    for label, rows in (("train", train), ("validation", validation), ("test", test)):
        assert_unique_ids(rows, label)

    intersections = {
        "train_validation": key_intersections(train, validation),
        "train_test": key_intersections(train, test),
        "validation_test": key_intersections(validation, test),
    }
    if any(value for group in intersections.values() for value in group.values()):
        raise SystemExit(f"post-quarantine synthetic leakage: {intersections}")

    train_external = {
        "source": len({text_key(row["unconditioned_input_text"]) for row in train} & external_source_keys),
        "target_surface": len({target_surface_key(row["output_text"]) for row in train} & external_target_keys),
    }
    if any(train_external.values()):
        raise SystemExit(f"post-quarantine external leakage: {train_external}")
    test_external = {
        "source": len({text_key(row["unconditioned_input_text"]) for row in test} & external_source_keys),
        "target_surface": len({target_surface_key(row["output_text"]) for row in test} & external_target_keys),
    }
    if any(test_external.values()):
        raise SystemExit(f"post-quarantine test/external leakage: {test_external}")

    test_untagged = []
    for row in test:
        cloned = json.loads(json.dumps(row))
        cloned["id"] = f"{row['id']}:untagged"
        cloned["input_text"] = row["unconditioned_input_text"]
        cloned["task_tagging"] = {
            "enabled": False,
            "task": "translate_untagged_robustness",
            "template": "{input_text}",
        }
        test_untagged.append(cloned)

    train_sample = stable_sort(train, "train-sample")[:1_024]
    gate = stable_sort(train, "overfit-gate")[:128]
    for rows, label in ((train_sample, "train_sample"), (test_untagged, "test_untagged"), (gate, "gate")):
        assert_unique_ids(rows, label)

    outputs: list[Path] = []
    for relative, rows in (
        ("train.eng-gvn.jsonl", train),
        ("validation.eng-gvn.jsonl", validation),
        ("test.eng-gvn.jsonl", test),
        ("synthetic/train_sample_1024.eng-gvn.jsonl", train_sample),
        ("synthetic/test_untagged_1606.eng-gvn.jsonl", test_untagged),
        ("gate/train_128.eng-gvn.jsonl", gate),
        ("gate/validation_128.eng-gvn.jsonl", gate),
        ("gate/test_128.eng-gvn.jsonl", gate),
        ("quarantine/source_or_surface_overlap.jsonl", quarantine),
    ):
        target = output / relative
        write_jsonl(target, rows)
        outputs.append(target)
    outputs.extend(external_outputs)

    reason_counts = collections.Counter(reason for row in quarantine for reason in row["reasons"])
    split_quarantine_counts = collections.Counter(row["source_split"] for row in quarantine)
    manifest = {
        "dataset_id": "v21.1-codex-synthetic-direct",
        "created_at": "2026-07-10",
        "owner": "codex",
        "purpose": (
            "Source-disjoint synthetic-direct treatment for the paired v21 RunPod experiment. "
            "Canonical rows remain untouched; overlapping source/surface rows are quarantined additively."
        ),
        "seed": SEED,
        "corpus_audit": {
            "path": str(AUDIT_RESULT.relative_to(PROGRAM)),
            "sha256": sha256(AUDIT_RESULT),
            "status": audit["status"],
            "mode": audit["mode"],
            "checks_passed": audit["checks_passed"],
            "checks_failed": audit["checks_failed"],
            "corpus_content_sha256": audit["hashes"]["corpus-content-20047"],
        },
        "canonical_export": {
            "root": str(SYNTH_EXPORT.relative_to(PROGRAM)),
            "counts": canonical_counts,
            "hashes": actual_export_hashes,
        },
        "base_model": {
            "root": str(BASE_MODEL.relative_to(PROGRAM)),
            "hashes": actual_base_hashes,
        },
        "locked_external_evaluation": {
            "root": str(EXTERNAL_ROOT.relative_to(PROGRAM)),
            "hashes": external_hashes,
            "training_rows": 0,
        },
        "split_policy": {
            "priority": ["locked external evaluation", "synthetic dev", "synthetic test", "synthetic train"],
            "source_key": "NFKC + casefold + quote normalization + whitespace collapse",
            "target_surface_key": "NFKC + casefold + Unicode letters only",
            "rule": (
                "Quarantine test rows colliding with dev, then train rows colliding with retained dev/test or "
                "locked external evaluations. Preserve canonical source rows unchanged in quarantine."
            ),
        },
        "effective_counts": {
            **effective_counts,
            "train_sample": len(train_sample),
            "test_untagged": len(test_untagged),
            "gate": len(gate),
            "quarantine": len(quarantine),
        },
        "quarantine": {
            "by_source_split": dict(sorted(split_quarantine_counts.items())),
            "reason_occurrences": dict(sorted(reason_counts.items())),
            "rows_with_multiple_reasons": sum(len(row["reasons"]) > 1 for row in quarantine),
        },
        "post_quarantine_intersections": intersections,
        "synthetic_dev_external_intersections": dev_external,
        "post_quarantine_train_external_intersections": train_external,
        "post_quarantine_test_external_intersections": test_external,
        "training_mixture": {
            "synthetic_train": len(train),
            "bible_replay": 0,
            "db_usage_replay": 0,
            "elder_rows": 0,
            "total_per_epoch": len(train),
        },
        "rights": {
            "training": "project_approved_synthetic_pending_elder_verification",
            "promotion_eligible": False,
            "note": "Research training approval is not elder certification or production authorization.",
        },
    }

    manifest_path = output / "v21_1_codex_synthetic_direct_manifest.json"
    manifest["outputs"] = [file_record(path, output) for path in sorted(outputs)]
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    outputs.append(manifest_path)

    checksum_path = output / "SHA256SUMS.v21.1"
    with checksum_path.open("w", encoding="utf-8") as handle:
        for path in sorted(outputs):
            handle.write(f"{sha256(path)}  {path.relative_to(output)}\n")

    print(json.dumps({
        "dataset_id": manifest["dataset_id"],
        "canonical_counts": canonical_counts,
        "effective_counts": manifest["effective_counts"],
        "quarantine": manifest["quarantine"],
        "post_quarantine_intersections": intersections,
        "checksum_file": str(checksum_path),
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

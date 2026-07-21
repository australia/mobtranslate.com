#!/usr/bin/env python3
"""Build the v21.2 Claude balanced-replay RunPod dataset.

Treatment (frozen in the v21 parallel handoff, section 6.3): the same
16,642 leakage-free synthetic train rows as v21.1, plus fixed replay of
2,048 Bible direct rows + the same 2,048 verses reference-conditioned +
365 DB-usage train rows replicated x4 (= 1,460). Exactly 22,198 rows per
epoch. No elder-heldout rows anywhere near training.

The synthetic quarantine logic is copied verbatim from
build_v21_1_codex_synthetic_direct.py so both lanes share one deterministic
leakage treatment. Additional fail-closed gates implement handoff sections
7.11 (replay vs synthetic dev/test + locked externals), 7.12 (Bible replay
canonical_ref disjoint from both locked Bible 325 sets), and 7.13 (DB train
word-ids disjoint from the 84-row heldout word-ids).
"""

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
BIBLE_REPLAY_ROOT = PROGRAM / "prepared/v9.7-tagged-direct-plus-reference-bible/v8_2048row"
DB_USAGE_TRAIN = EXTERNAL_ROOT / "db_usage/train_usage.eng-gvn.jsonl"
DEFAULT_OUTPUT = PROGRAM / "prepared/v21.2-claude-balanced-replay"

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
REPLAY_HASHES = {
    "train_direct.eng-gvn.jsonl": "1e9f35a3aedaf3655e8d18c0d160ea5645a99d80e6cf8c18eeb4b823ed9e0e37",
    "train_ref.eng-gvn.jsonl": "30f449d362d94a37c92de4203cde8487eb8d310dd13b1dc357fd82862d9d69a8",
}
DB_USAGE_TRAIN_HASH = "dc3a9322381dafb1a786b22f707259d2b2d52cc1deb18fee55ed01ee4514b7bf"
CANONICAL_COUNTS = {"train": 16_820, "dev": 1_609, "synthtest": 1_618}
EFFECTIVE_COUNTS = {"train": 16_642, "validation": 1_609, "test": 1_606}
QUARANTINE_REASON_COUNTS = {
    "dev_source_overlap": 12,
    "retained_synthetic_eval_source_overlap": 163,
    "retained_synthetic_eval_target_surface_overlap": 11,
    "external_source_overlap": 1,
    "external_target_surface_overlap": 6,
}
MIXTURE_COUNTS = {
    "synthetic_train": 16_642,
    "bible_direct_replay": 2_048,
    "bible_ref_replay": 2_048,
    "db_usage_replay": 1_460,
    "total_per_epoch": 22_198,
}
DB_REPLICATION = 4
SEED = "v21.2-claude-balanced-replay-2026-07-11"


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
            clean = {key: value for key, value in row.items() if key != "_source_line"}
            handle.write(json.dumps(clean, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


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


def normalize_replay(row: dict[str, Any], replay_kind: str, replica: int | None = None) -> dict[str, Any]:
    out = {key: value for key, value in row.items() if key != "_source_line"}
    out["split"] = "train"
    out.setdefault("source_lang", "eng_Latn")
    out.setdefault("target_lang", "gvn_Latn")
    out["replay"] = {
        "lane": "v21.2-claude-balanced-replay",
        "kind": replay_kind,
        "replica": replica,
    }
    if replica is not None and replica > 1:
        out["id"] = f"{row['id']}:rep{replica}"
    if "unconditioned_input_text" not in out:
        out["unconditioned_input_text"] = external_english(row)
    return out


def db_word_id(identifier: str) -> str:
    parts = str(identifier).split(":")
    return parts[1] if len(parts) >= 2 else str(identifier)


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
    actual_replay_hashes = {name: sha256(BIBLE_REPLAY_ROOT / name) for name in REPLAY_HASHES}
    if actual_replay_hashes != REPLAY_HASHES:
        raise SystemExit(f"bible replay hash drift: {actual_replay_hashes}")
    actual_db_hash = sha256(DB_USAGE_TRAIN)
    if actual_db_hash != DB_USAGE_TRAIN_HASH:
        raise SystemExit(f"db usage train hash drift: {actual_db_hash}")

    external_rows: list[dict[str, Any]] = []
    external_by_name: dict[str, list[dict[str, Any]]] = {}
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
        external_by_name[output_name] = rows
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

    synthetic_train = [convert(row, "train") for row in retained_train_raw]
    validation = [convert(row, "validation") for row in canonical["dev"]]
    test = [convert(row, "test") for row in retained_test_raw]
    effective_counts = {"train": len(synthetic_train), "validation": len(validation), "test": len(test)}
    if effective_counts != EFFECTIVE_COUNTS:
        raise SystemExit(f"effective counts: {effective_counts}")

    reason_counts = collections.Counter(reason for row in quarantine for reason in row["reasons"])
    if dict(reason_counts) != QUARANTINE_REASON_COUNTS:
        raise SystemExit(
            f"quarantine reason drift vs the shared deterministic treatment: {dict(reason_counts)}"
        )

    bible_direct_all = [
        normalize_replay(row, "bible_direct")
        for row in read_jsonl(BIBLE_REPLAY_ROOT / "train_direct.eng-gvn.jsonl")
    ]
    bible_ref_all = [
        normalize_replay(row, "bible_ref")
        for row in read_jsonl(BIBLE_REPLAY_ROOT / "train_ref.eng-gvn.jsonl")
    ]
    if len(bible_direct_all) != MIXTURE_COUNTS["bible_direct_replay"]:
        raise SystemExit(f"bible direct replay count: {len(bible_direct_all)}")
    if len(bible_ref_all) != MIXTURE_COUNTS["bible_ref_replay"]:
        raise SystemExit(f"bible ref replay count: {len(bible_ref_all)}")
    direct_refs = {row.get("canonical_ref") for row in bible_direct_all}
    ref_refs = {row.get("canonical_ref") for row in bible_ref_all}
    if direct_refs != ref_refs:
        raise SystemExit("bible direct/ref replay verse sets differ — not the paired control subset")

    db_base_all = read_jsonl(DB_USAGE_TRAIN)
    if len(db_base_all) != 365:
        raise SystemExit(f"db usage train count: {len(db_base_all)}")

    # Deterministic replay quarantine (documented treatment for the section-7.11
    # collisions found on 2026-07-11): five DB-usage dictionary examples were
    # absorbed near-verbatim into the synthetic corpus during authoring, so they
    # now collide with synthetic dev by normalized source and/or target surface.
    # They are preserved additively in quarantine/replay_overlap.jsonl and all
    # their replicas are excluded, mirroring the canonical->effective pattern the
    # shared synthetic treatment already uses (16,820 -> 16,642).
    validation_source_keys = {text_key(row["unconditioned_input_text"]) for row in validation}
    validation_target_keys = {target_surface_key(row["output_text"]) for row in validation}
    test_source_keys_conv = {text_key(row["unconditioned_input_text"]) for row in test}
    test_target_keys_conv = {target_surface_key(row["output_text"]) for row in test}

    def replay_reasons(row: dict[str, Any]) -> list[str]:
        english = external_english(row)
        reasons = []
        if text_key(english) in validation_source_keys:
            reasons.append("synthetic_validation_source_overlap")
        if target_surface_key(row["output_text"]) in validation_target_keys:
            reasons.append("synthetic_validation_target_surface_overlap")
        if text_key(english) in test_source_keys_conv:
            reasons.append("synthetic_test_source_overlap")
        if target_surface_key(row["output_text"]) in test_target_keys_conv:
            reasons.append("synthetic_test_target_surface_overlap")
        if text_key(english) in external_source_keys:
            reasons.append("external_source_overlap")
        if target_surface_key(row["output_text"]) in external_target_keys:
            reasons.append("external_target_surface_overlap")
        return reasons

    replay_quarantine: list[dict[str, Any]] = []

    # Bible: a verse colliding with any eval set (e.g. the LUK.5.35 / MRK.2.20
    # synoptic parallel, identical English across different canonical refs) is
    # quarantined in BOTH task forms so the direct/ref pairing stays exact.
    quarantined_verse_refs: set[str] = set()
    for row in bible_direct_all + bible_ref_all:
        reasons = replay_reasons(row)
        if reasons:
            quarantined_verse_refs.add(str(row.get("canonical_ref")))
            replay_quarantine.append({
                "replay_kind": (row.get("replay") or {}).get("kind"),
                "id": row["id"],
                "canonical_ref": row.get("canonical_ref"),
                "reasons": reasons,
                "english": external_english(row),
                "output_text": row["output_text"],
            })
    bible_direct = [r for r in bible_direct_all if str(r.get("canonical_ref")) not in quarantined_verse_refs]
    bible_ref = [r for r in bible_ref_all if str(r.get("canonical_ref")) not in quarantined_verse_refs]
    if {r.get("canonical_ref") for r in bible_direct} != {r.get("canonical_ref") for r in bible_ref}:
        raise SystemExit("post-quarantine bible direct/ref verse sets diverged")

    db_base: list[dict[str, Any]] = []
    for row in db_base_all:
        reasons = replay_reasons(row)
        if reasons:
            replay_quarantine.append({
                "replay_kind": "db_usage",
                "id": row["id"],
                "reasons": reasons,
                "english": external_english(row),
                "output_text": row["output_text"],
            })
        else:
            db_base.append(row)

    db_replay: list[dict[str, Any]] = []
    for replica in range(1, DB_REPLICATION + 1):
        for row in db_base:
            db_replay.append(normalize_replay(row, "db_usage", replica))
    effective_db_replay = len(db_replay)

    # Section 7.12: Bible replay must be canonical_ref-disjoint from BOTH locked 325 sets.
    heldout_refs = {
        row.get("canonical_ref")
        for name in ("bible_direct_heldout_325.eng-gvn.jsonl", "bible_ref_heldout_325.eng-gvn.jsonl")
        for row in external_by_name[name]
    }
    ref_overlap = (direct_refs | ref_refs) & heldout_refs
    if ref_overlap:
        raise SystemExit(f"bible replay canonical_ref overlaps locked heldout: {sorted(ref_overlap)[:10]}")

    # Section 7.13: DB train word-ids disjoint from the 84 heldout word-ids.
    heldout_word_ids = {
        db_word_id(row["id"]) for row in external_by_name["db_usage_heldout_84.eng-gvn.jsonl"]
    }
    train_word_ids = {db_word_id(row["id"]) for row in db_base}
    word_id_overlap = train_word_ids & heldout_word_ids
    if word_id_overlap:
        raise SystemExit(f"db usage word-id overlap with heldout-84: {sorted(word_id_overlap)[:10]}")

    # Section 7.11: the complete replay mixture has zero source/target-surface/pair
    # overlap with synthetic validation/test and every locked external set. The
    # explicitly allowed exception is the paired task-conditioned Bible replay
    # within training itself (direct and ref share verses with each other).
    replay_all = bible_direct + bible_ref + db_replay
    for label, eval_rows in (
        ("validation", validation),
        ("test", test),
        ("external", external_rows),
    ):
        overlap = key_intersections(replay_all, eval_rows)
        if any(overlap.values()):
            raise SystemExit(f"replay leakage into {label}: {overlap}")

    expected_effective_total = (
        MIXTURE_COUNTS["synthetic_train"]
        + len(bible_direct)
        + len(bible_ref)
        + effective_db_replay
    )
    train = stable_sort(synthetic_train + replay_all, "train-mix")
    if len(train) != expected_effective_total:
        raise SystemExit(f"mixed train count: {len(train)} != {expected_effective_total}")
    for label, rows in (("train", train), ("validation", validation), ("test", test)):
        assert_unique_ids(rows, label)

    intersections = {
        "train_validation": key_intersections(synthetic_train, validation),
        "train_test": key_intersections(synthetic_train, test),
        "validation_test": key_intersections(validation, test),
    }
    if any(value for group in intersections.values() for value in group.values()):
        raise SystemExit(f"post-quarantine synthetic leakage: {intersections}")

    synthetic_train_external = {
        "source": len({text_key(row["unconditioned_input_text"]) for row in synthetic_train} & external_source_keys),
        "target_surface": len({target_surface_key(row["output_text"]) for row in synthetic_train} & external_target_keys),
    }
    if any(synthetic_train_external.values()):
        raise SystemExit(f"post-quarantine external leakage: {synthetic_train_external}")
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
    gate_kinds = collections.Counter(
        (row.get("replay") or {}).get("kind", "synthetic") for row in gate
    )

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
        ("quarantine/replay_overlap.jsonl", replay_quarantine),
    ):
        target = output / relative
        write_jsonl(target, rows)
        outputs.append(target)
    outputs.extend(external_outputs)

    split_quarantine_counts = collections.Counter(row["source_split"] for row in quarantine)
    manifest = {
        "dataset_id": "v21.2-claude-balanced-replay",
        "created_at": "2026-07-11",
        "owner": "claude",
        "purpose": (
            "Balanced-replay treatment for the paired v21 RunPod experiment: the shared "
            "source-disjoint synthetic treatment plus fixed Bible direct + reference-conditioned "
            "replay and x4 DB-usage replay, per the frozen handoff section 6.3."
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
        "replay_sources": {
            "bible_root": str(BIBLE_REPLAY_ROOT.relative_to(PROGRAM)),
            "bible_hashes": actual_replay_hashes,
            "db_usage_train": str(DB_USAGE_TRAIN.relative_to(PROGRAM)),
            "db_usage_train_sha256": actual_db_hash,
            "db_replication": DB_REPLICATION,
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
                "Identical deterministic quarantine to v21.1 (shared treatment), then the fixed "
                "replay mixture is appended and stable-sorted; replay rows are gated against "
                "synthetic validation/test and all locked external sets (handoff 7.11-7.13)."
            ),
        },
        "effective_counts": {
            **effective_counts,
            "train_mixed": len(train),
            "train_sample": len(train_sample),
            "test_untagged": len(test_untagged),
            "gate": len(gate),
            "quarantine": len(quarantine),
        },
        "gate_composition": dict(sorted(gate_kinds.items())),
        "quarantine": {
            "by_source_split": dict(sorted(split_quarantine_counts.items())),
            "reason_occurrences": dict(sorted(reason_counts.items())),
            "rows_with_multiple_reasons": sum(len(row["reasons"]) > 1 for row in quarantine),
        },
        "post_quarantine_intersections": intersections,
        "synthetic_dev_external_intersections": dev_external,
        "post_quarantine_train_external_intersections": synthetic_train_external,
        "post_quarantine_test_external_intersections": test_external,
        "replay_gates": {
            "bible_canonical_ref_overlap_with_heldout": 0,
            "db_word_id_overlap_with_heldout_84": 0,
            "replay_vs_validation": key_intersections(replay_all, validation),
            "replay_vs_test": key_intersections(replay_all, test),
            "replay_vs_external": key_intersections(replay_all, external_rows),
        },
        "training_mixture": {
            "canonical": dict(MIXTURE_COUNTS),
            "effective": {
                "synthetic_train": len(synthetic_train),
                "bible_direct_replay": len(bible_direct),
                "bible_ref_replay": len(bible_ref),
                "db_usage_replay": len(db_replay),
                "elder_rows": 0,
                "total_per_epoch": len(train),
            },
            "replay_quarantine": {
                "rows": len(replay_quarantine),
                "bible_verses_quarantined": sorted(quarantined_verse_refs),
                "db_base_rows_quarantined": len(db_base_all) - len(db_base),
                "db_replicas_excluded": (len(db_base_all) - len(db_base)) * DB_REPLICATION,
                "reasons": sorted({reason for row in replay_quarantine for reason in row["reasons"]}),
                "note": (
                    "Deterministic replay quarantine (quarantine/replay_overlap.jsonl): "
                    "(a) five DB-usage dictionary examples were absorbed near-verbatim into the "
                    "synthetic corpus during authoring and collide with synthetic dev; "
                    "(b) two DB-usage example sentences recur verbatim under different word-ids "
                    "inside the locked heldout-84 set; (c) one synoptic-parallel verse "
                    "(LUK.5.35, English identical to heldout MRK.2.20) is excluded in both its "
                    "direct and reference-conditioned forms. Mirrors the shared "
                    "canonical->effective quarantine pattern."
                ),
            },
        },
        "rights": {
            "training": "project_approved_synthetic_pending_elder_verification",
            "promotion_eligible": False,
            "note": "Research training approval is not elder certification or production authorization.",
        },
    }

    manifest_path = output / "v21_2_claude_balanced_replay_manifest.json"
    manifest["outputs"] = [file_record(path, output) for path in sorted(outputs)]
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    outputs.append(manifest_path)

    checksum_path = output / "SHA256SUMS.v21.2"
    with checksum_path.open("w", encoding="utf-8") as handle:
        for path in sorted(outputs):
            handle.write(f"{sha256(path)}  {path.relative_to(output)}\n")

    print(json.dumps({
        "dataset_id": manifest["dataset_id"],
        "canonical_counts": canonical_counts,
        "effective_counts": manifest["effective_counts"],
        "training_mixture": manifest["training_mixture"],
        "gate_composition": manifest["gate_composition"],
        "quarantine": manifest["quarantine"],
        "post_quarantine_intersections": intersections,
        "checksum_file": str(checksum_path),
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

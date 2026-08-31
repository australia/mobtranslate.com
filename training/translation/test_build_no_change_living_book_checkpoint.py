from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from build_no_change_living_book_checkpoint import build, read_json


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def make_fixture(root: Path) -> tuple[Path, dict[str, object]]:
    component = root / "dictionary/components/entries.jsonl"
    component.parent.mkdir(parents=True, exist_ok=True)
    component.write_text('{"id":"entry-1"}\n', encoding="utf-8")
    checkpoint = root / "analysis/checkpoint/MANIFEST.json"
    write_json(checkpoint, {"id": "checkpoint-v1", "rows": 1})
    source_ledger = root / "sources/SOURCE-LEDGER.jsonl"
    source_ledger.parent.mkdir(parents=True, exist_ok=True)
    source_ledger.write_text('{"source_id":"source-1"}\n', encoding="utf-8")
    change_ledger = root / "dictionary/CHANGE-LEDGER.jsonl"
    change_ledger.write_text(
        json.dumps(
            {
                "change_id": "change-2",
                "new_edition_id": "dictionary-v2",
                "parent_edition_id": "dictionary-v1",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    parent_path = root / "dictionary/editions/dictionary-v1/EDITION.json"
    write_json(
        parent_path,
        {
            "schema_version": 1,
            "edition_id": "dictionary-v1",
            "components": {
                "entries": {
                    "path": "dictionary/components/entries.jsonl",
                    "sha256": sha256(component),
                    "rows": 1,
                }
            },
            "counts": {"totalEntries": 1, "newAcceptedRows": 0},
            "review_routing": {"prior_reviews": 1},
        },
    )
    pointer_path = root / "dictionary/CURRENT.json"
    write_json(
        pointer_path,
        {
            "schema_version": 1,
            "artifact": "dictionary",
            "current_edition_id": "dictionary-v1",
            "manifest_path": "dictionary/editions/dictionary-v1/EDITION.json",
            "manifest_sha256": sha256(parent_path),
            "updated_at_utc": "2026-01-01T00:00:00Z",
            "supersedes_pointer_sha256": "0" * 64,
            "release_status": "not_released",
        },
    )
    contract: dict[str, object] = {
        "schema_version": 1,
        "edition_id": "dictionary-v2",
        "parent_edition_id": "dictionary-v1",
        "created_at_utc": "2026-01-02T00:00:00Z",
        "status": "reviewed_no_change",
        "scope": {"language": "Test"},
        "parent_manifest": {
            "path": "dictionary/editions/dictionary-v1/EDITION.json",
            "sha256": sha256(parent_path),
        },
        "source_checkpoint": {
            "manifest_path": "analysis/checkpoint/MANIFEST.json",
            "manifest_sha256": sha256(checkpoint),
            "review_routing": {
                "new_reviews": 1,
                "controlled_english_target_sentence_pairs_authorized": 0,
            },
        },
        "source_ledger": {
            "path": "sources/SOURCE-LEDGER.jsonl",
            "sha256": sha256(source_ledger),
        },
        "change_ledger": {
            "path": "dictionary/CHANGE-LEDGER.jsonl",
            "sha256": sha256(change_ledger),
            "issuing_change_id": "change-2",
            "accepted_change_ids": [],
        },
        "component_inheritance": {
            "mode": "exact_parent_component_aliases",
            "parent_component_count": 1,
            "changed_component_count": 0,
            "require_matching_path_sha256_and_rows": True,
        },
        "expected_component_rows": {"entries": 1},
        "expected_counts": {
            "totalEntries": 1,
            "newAcceptedRows": 0,
            "sourceReviewCheckpoints": 1,
        },
        "current_pointer_path": "dictionary/CURRENT.json",
        "supersedes_pointer_sha256": sha256(pointer_path),
        "evidence_policy": {
            "synthetic_data": "isolated mappings count as zero sentence pairs"
        },
        "release_status": "not_released",
        "claim_limit": "No new linguistic claim.",
    }
    contract_path = root / "dictionary/edition-contracts/dictionary-v2.json"
    write_json(contract_path, contract)
    return contract_path, contract


class NoChangeLivingBookCheckpointTest(unittest.TestCase):
    def test_writes_exact_component_alias_and_updates_pointer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract_path, contract = make_fixture(root)
            result = build(
                root,
                contract_path,
                contract,
                write=True,
                update_pointer=True,
            )
            self.assertEqual(result["mode"], "written")
            edition_path = root / result["manifest_path"]
            edition = read_json(edition_path)
            parent = read_json(
                root / "dictionary/editions/dictionary-v1/EDITION.json"
            )
            self.assertEqual(edition["components"], parent["components"])
            self.assertEqual(edition["counts"]["sourceReviewCheckpoints"], 1)
            self.assertEqual(edition["review_routing"]["prior_reviews"], 1)
            self.assertEqual(edition["review_routing"]["new_reviews"], 1)
            pointer = read_json(root / "dictionary/CURRENT.json")
            self.assertEqual(pointer["current_edition_id"], "dictionary-v2")
            self.assertEqual(pointer["manifest_sha256"], sha256(edition_path))
            self.assertEqual(
                build(
                    root,
                    contract_path,
                    contract,
                    write=True,
                    update_pointer=True,
                )["mode"],
                "verified_existing",
            )

    def test_dry_run_does_not_write(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract_path, contract = make_fixture(root)
            result = build(
                root,
                contract_path,
                contract,
                write=False,
                update_pointer=False,
            )
            self.assertEqual(result["mode"], "dry_run")
            self.assertFalse((root / result["manifest_path"]).exists())

    def test_fails_closed_on_checkpoint_hash_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract_path, contract = make_fixture(root)
            (root / "analysis/checkpoint/MANIFEST.json").write_text(
                "{}\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                build(
                    root,
                    contract_path,
                    contract,
                    write=False,
                    update_pointer=False,
                )

    def test_fails_closed_if_parent_component_count_changes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract_path, contract = make_fixture(root)
            contract["component_inheritance"]["parent_component_count"] = 2
            with self.assertRaisesRegex(ValueError, "component count"):
                build(
                    root,
                    contract_path,
                    contract,
                    write=False,
                    update_pointer=False,
                )


if __name__ == "__main__":
    unittest.main()

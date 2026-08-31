from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from build_wajarri_apk_variety_evidence import (
    DICTIONARY_MEMBER,
    INDEX_MEMBER,
    build,
    write_result,
)


def dictionary_rows() -> list[dict[str, str]]:
    return [
        {
            "Wajarri": "alpha",
            "English": "first",
            "description": "first item (North)",
            "sound": "Track1.mp3",
            "image": "logo.png",
        },
        {
            "Wajarri": "beta",
            "English": "second",
            "description": "second item (South, East)",
            "sound": "Track2.mp3",
            "image": "logo.png",
        },
        {
            "Wajarri": "gamma",
            "English": "third",
            "description": "third item (rare usage)",
            "sound": "Track3.mp3",
            "image": "logo.png",
        },
    ]


def write_fixture(
    root: Path,
    *,
    rows: list[dict[str, str]] | None = None,
    paragraph: str = (
        "Some dialect information is available; you will see are North, South "
        "and East, each referring to a different place."
    ),
) -> tuple[Path, Path]:
    rows = rows or dictionary_rows()
    apk = root / "fixture.apk"
    with zipfile.ZipFile(apk, "w") as archive:
        archive.writestr(INDEX_MEMBER, f"<html><body><p>{paragraph}</p></body></html>")
        archive.writestr(DICTIONARY_MEMBER, json.dumps(rows))
    snapshot = root / "dictionary.json"
    snapshot.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    return apk, snapshot


class WajarriApkVarietyEvidenceTests(unittest.TestCase):
    def test_builds_exact_source_label_inventory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            apk, snapshot = write_fixture(root)
            result = build(
                apk_path=apk,
                dictionary_snapshot_path=snapshot,
                source_id="fixture-source",
                inventory_id="fixture-inventory-v1",
            )

            self.assertEqual(
                result.report["declared_varieties_discovered"],
                ["East", "North", "South"],
            )
            self.assertEqual(len(result.rows), 2)
            self.assertEqual(result.rows[0]["explicit_variety_labels"], ["North"])
            self.assertEqual(
                result.rows[1]["explicit_variety_labels"], ["South", "East"]
            )
            self.assertEqual(result.rows[1]["evidence_spans"], ["(South, East)"])
            self.assertEqual(
                result.rows[0]["source_record_id"], "wbv-src-local-000001"
            )
            self.assertFalse(result.manifest["training_authorized"])
            self.assertEqual(result.manifest["synthetic_sentence_pairs_added"], 0)

    def test_requires_semantically_identical_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            apk, snapshot = write_fixture(root)
            changed = dictionary_rows()
            changed[0]["description"] = "changed"
            snapshot.write_text(json.dumps(changed), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "not semantically identical"):
                build(
                    apk_path=apk,
                    dictionary_snapshot_path=snapshot,
                    source_id="fixture-source",
                    inventory_id="fixture-inventory-v1",
                )

    def test_requires_one_dialect_paragraph(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            apk, snapshot = write_fixture(root, paragraph="No labels are declared here.")
            with self.assertRaisesRegex(ValueError, "exactly one source paragraph"):
                build(
                    apk_path=apk,
                    dictionary_snapshot_path=snapshot,
                    source_id="fixture-source",
                    inventory_id="fixture-inventory-v1",
                )

    def test_write_is_deterministic_and_immutable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            apk, snapshot = write_fixture(root)
            result = build(
                apk_path=apk,
                dictionary_snapshot_path=snapshot,
                source_id="fixture-source",
                inventory_id="fixture-inventory-v1",
            )
            output = root / "output"
            write_result(output, result)
            first_manifest = (output / "MANIFEST.json").read_bytes()
            write_result(output, result)
            self.assertEqual(first_manifest, (output / "MANIFEST.json").read_bytes())

            (output / "REPORT.json").write_text("{}\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "refusing to rewrite"):
                write_result(output, result)


if __name__ == "__main__":
    unittest.main()

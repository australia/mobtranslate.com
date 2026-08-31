from __future__ import annotations

import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from build_lexibank_cldf_inventory import (
    build,
    control_characters,
    read_csv_rows,
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def make_fixture(root: Path) -> dict[str, object]:
    source = root / "source"
    write_json(
        source / "cldf-metadata.json",
        {
            "tables": [
                {"url": name}
                for name in ("forms.csv", "languages.csv", "parameters.csv")
            ]
        },
    )
    write_csv(
        source / "languages.csv",
        ["ID", "Name", "Glottocode", "ISO639P3code"],
        [
            {
                "ID": "Wajarri",
                "Name": "Wajarri",
                "Glottocode": "waja1257",
                "ISO639P3code": "wbv",
            }
        ],
    )
    parameter_rows = [
        ("1_water", "water", "948", "WATER"),
        ("2_dog", "dog", "2009", "DOG"),
        ("3_light", "light", "221", "LIGHT"),
        ("4_bite", "bite", "1401", "BITE"),
        ("5_come", "come", "1446", "COME"),
        ("6_cry", "cry", "1839", "CRY"),
    ]
    write_csv(
        source / "parameters.csv",
        ["ID", "Name", "Concepticon_ID", "Concepticon_Gloss"],
        [
            {
                "ID": identifier,
                "Name": name,
                "Concepticon_ID": concepticon_id,
                "Concepticon_Gloss": gloss,
            }
            for identifier, name, concepticon_id, gloss in parameter_rows
        ],
    )
    form_fields = [
        "ID",
        "Local_ID",
        "Language_ID",
        "Parameter_ID",
        "Value",
        "Form",
        "Segments",
        "Comment",
        "Source",
        "Cognacy",
        "Loan",
        "Graphemes",
        "Profile",
    ]
    values = [
        ("Wajarri-1", "1_water", "badha", "badha", "b a d a"),
        ("Wajarri-2", "2_dog", "duthu", "duthu", "d u t u"),
        ("Wajarri-3", "3_light", "garla", "garla", "g a l a"),
        ("Wajarri-4", "4_bite", "baja-", "baja-", "b a c a"),
        ("Wajarri-5", "5_come", "Yanajigu!", "Yanajigu!", "j a n a c i g u"),
        ("Wajarri-6", "6_cry", "ngula\x1e", "ngula", "n g u l a"),
    ]
    write_csv(
        source / "forms.csv",
        form_fields,
        [
            {
                "ID": identifier,
                "Local_ID": "",
                "Language_ID": "Wajarri",
                "Parameter_ID": parameter_id,
                "Value": value,
                "Form": form,
                "Segments": segments,
                "Comment": "",
                "Source": "Bowern2012",
                "Cognacy": "",
                "Loan": "",
                "Graphemes": "",
                "Profile": "default",
            }
            for identifier, parameter_id, value, form, segments in values
        ],
    )
    (source / "sources.bib").write_text(
        "@article{Bowern2012, author={Bowern}, title={Test}, year={2012}}\n",
        encoding="utf-8",
    )
    (source / "release.zip").write_bytes(b"release fixture")
    write_json(
        source / "zenodo.json",
        {
            "id": 13143103,
            "metadata": {
                "version": "v4.1",
                "title": "Fixture",
                "license": {"id": "cc-by-4.0"},
            },
        },
    )
    write_json(
        source / "github-tag.json",
        {
            "ref": "refs/tags/v4.1",
            "object": {"sha": "0" * 40, "type": "commit"},
        },
    )
    (source / "LICENSE").write_text("CC BY 4.0\n", encoding="utf-8")
    (source / "README.md").write_text("Fixture release\n", encoding="utf-8")
    (source / "raw.tsv").write_text("Language\tWord\nWajarri\tbadha\n", encoding="utf-8")

    entries = [
        {
            "sourceRecordId": "water-record",
            "sourceRecordIds": ["water-record", "spring-record"],
            "entryCandidateId": "entry-water",
            "sourceId": "dictionary-current",
            "headwordSource": "badha",
            "status": "candidate",
        },
        {
            "sourceRecordId": "dog-record",
            "entryCandidateId": "entry-dog",
            "sourceId": "dictionary-current",
            "headwordSource": "dudu",
            "status": "candidate",
        },
        {
            "sourceRecordId": "fire-record",
            "entryCandidateId": "entry-fire",
            "sourceId": "dictionary-current",
            "headwordSource": "garla",
            "status": "candidate",
        },
    ]
    senses = [
        {
            "sourceRecordId": "water-record",
            "entryCandidateId": "entry-water",
            "senseCandidateId": "sense-water",
            "translationSource": "water",
            "definitionSource": "fresh water",
            "substitutableTranslationStatus": "unadjudicated",
        },
        {
            "sourceRecordId": "spring-record",
            "entryCandidateId": "entry-water",
            "senseCandidateId": "sense-spring",
            "translationSource": "spring",
            "definitionSource": "a water spring",
            "substitutableTranslationStatus": "unadjudicated",
        },
        {
            "sourceRecordId": "dog-record",
            "entryCandidateId": "entry-dog",
            "senseCandidateId": "sense-dog",
            "translationSource": "dog",
            "definitionSource": "a domestic dog",
            "substitutableTranslationStatus": "unadjudicated",
        },
        {
            "sourceRecordId": "fire-record",
            "entryCandidateId": "entry-fire",
            "senseCandidateId": "sense-firewood",
            "translationSource": "firewood",
            "definitionSource": "wood for a fire",
            "substitutableTranslationStatus": "unadjudicated",
        },
    ]
    forms = [
        {
            "sourceRecordId": "water-record",
            "entryCandidateId": "entry-water",
            "formCandidateId": "form-water",
            "surfaceSource": "badha",
        },
        {
            "sourceRecordId": "dog-record",
            "entryCandidateId": "entry-dog",
            "formCandidateId": "form-dog",
            "surfaceSource": "dudu",
        },
        {
            "sourceRecordId": "fire-record",
            "entryCandidateId": "entry-fire",
            "formCandidateId": "form-fire",
            "surfaceSource": "garla",
        },
    ]
    dictionary = root / "dictionary"
    write_jsonl(dictionary / "entries.jsonl", entries)
    write_jsonl(dictionary / "senses.jsonl", senses)
    write_jsonl(dictionary / "forms.jsonl", forms)
    manifest = {
        "edition_id": "dictionary-v1",
        "components": {
            "entries": {
                "path": "dictionary/entries.jsonl",
                "sha256": sha256(dictionary / "entries.jsonl"),
                "rows": len(entries),
            },
            "senses": {
                "path": "dictionary/senses.jsonl",
                "sha256": sha256(dictionary / "senses.jsonl"),
                "rows": len(senses),
            },
            "forms": {
                "path": "dictionary/forms.jsonl",
                "sha256": sha256(dictionary / "forms.jsonl"),
                "rows": len(forms),
            },
        },
    }
    write_json(dictionary / "edition.json", manifest)
    write_json(dictionary / "CURRENT.json", {"manifest_path": "dictionary/edition.json"})

    input_names = {
        "cldf_metadata": "cldf-metadata.json",
        "forms_csv": "forms.csv",
        "languages_csv": "languages.csv",
        "parameters_csv": "parameters.csv",
        "sources_bib": "sources.bib",
        "release_zip": "release.zip",
        "zenodo_record_json": "zenodo.json",
        "github_tag_json": "github-tag.json",
        "license_text": "LICENSE",
        "readme": "README.md",
        "raw_wordlist_tsv": "raw.tsv",
    }
    return {
        "schema_version": 1,
        "inventory_id": "test-lexibank-v1",
        "created_at_utc": "2026-07-24T10:00:00Z",
        "source_id": "source-lexibank-test",
        "language": {
            "cldf_id": "Wajarri",
            "iso_639_3": "wbv",
            "glottocode": "waja1257",
        },
        "release": {
            "version": "v4.1",
            "zenodo_record_id": 13143103,
            "license_id": "cc-by-4.0",
            "github_commit": "0" * 40,
        },
        "source_bibliography_keys": ["Bowern2012"],
        "inputs": {
            key: {"path": f"source/{name}", "sha256": sha256(source / name)}
            for key, name in input_names.items()
        },
        "dictionary": {
            "current_pointer_path": "dictionary/CURRENT.json",
            "current_pointer_sha256": sha256(dictionary / "CURRENT.json"),
            "current_manifest_sha256": sha256(dictionary / "edition.json"),
            "current_edition_id": "dictionary-v1",
        },
        "matching": {"near_surface_similarity_minimum": 1.0},
        "expected_counts": {"concepts": 6, "forms": 6, "unique_forms": 6},
        "output_directory": "analysis/lexibank-test-v1",
    }


class LexibankCldfInventoryTest(unittest.TestCase):
    def test_csv_parser_preserves_quoted_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "quoted.csv"
            write_csv(path, ["id", "value"], [{"id": "1", "value": "water, fresh"}])
            self.assertEqual(
                read_csv_rows(path), [{"id": "1", "value": "water, fresh"}]
            )

    def test_build_preserves_source_rows_and_never_authorizes_pairs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = make_fixture(root)
            result = build(root, contract, write=True)
            self.assertEqual(result["mode"], "written")
            self.assertEqual(result["counts"]["forms"], 6)
            self.assertEqual(result["counts"]["concepts"], 6)
            self.assertEqual(result["counts"]["crosswalk_candidates"], 4)
            self.assertEqual(
                result["counts"]["controlled_english_wajarri_sentence_pairs_authorized"],
                0,
            )
            self.assertEqual(result["dictionary_checkpoint"]["entries"], 3)
            self.assertEqual(result["dictionary_checkpoint"]["senses"], 4)

            forms = [
                json.loads(line)
                for line in (root / "analysis/lexibank-test-v1/forms.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            by_id = {row["source_form_id"]: row for row in forms}
            self.assertEqual(by_id["Wajarri-6"]["value_source"], "ngula\x1e")
            self.assertEqual(
                by_id["Wajarri-6"]["control_characters"]["Value"][0]["codepoint"],
                "U+001E",
            )
            self.assertIn(
                "morphological_boundary_marker", by_id["Wajarri-4"]["risk_flags"]
            )
            self.assertIn("utterance_punctuation", by_id["Wajarri-5"]["risk_flags"])
            self.assertTrue(
                all(row["synthetic_sentence_pair_eligible"] is False for row in forms)
            )

            crosswalk = [
                json.loads(line)
                for line in (
                    root
                    / "analysis/lexibank-test-v1/dictionary-crosswalk-candidates.jsonl"
                )
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            classes = {row["machine_candidate_class"] for row in crosswalk}
            self.assertIn(
                "exact_surface_and_strong_gloss_corroboration_candidate", classes
            )
            self.assertIn("strong_gloss_alternate_surface_candidate", classes)
            self.assertIn("exact_surface_sense_conflict_review", classes)
            water_senses = {
                row["dictionary_sense_candidate_id"]
                for row in crosswalk
                if row["source_form_id"] == "Wajarri-1"
            }
            self.assertEqual(water_senses, {"sense-water", "sense-spring"})
            self.assertEqual(build(root, contract, write=True)["mode"], "verified_existing")

    def test_build_fails_closed_on_language_identity_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = make_fixture(root)
            contract["language"]["iso_639_3"] = "bad"
            with self.assertRaisesRegex(ValueError, "ISO code"):
                build(root, contract, write=False)

    def test_build_fails_closed_on_input_hash_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = make_fixture(root)
            with (root / "source/forms.csv").open("a", encoding="utf-8") as handle:
                handle.write("drift\n")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                build(root, contract, write=False)

    def test_control_character_inventory_is_exact(self) -> None:
        self.assertEqual(control_characters("safe"), [])
        self.assertEqual(control_characters("x\x1ey")[0]["index"], 1)
        self.assertEqual(control_characters("x\x1ey")[0]["unicode_category"], "Cc")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from build_asjp_cldf_inventory import (
    build,
    crosswalk_sort_key,
    normalize_english,
    read_csv_rows,
    relation_for_dictionary_row,
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
        {"tables": [{"url": name} for name in ("forms.csv", "languages.csv", "parameters.csv")]},
    )
    write_csv(
        source / "languages.csv",
        ["ID", "Name", "Glottocode", "ISO639P3code", "transcribers"],
        [
            {
                "ID": "TEST",
                "Name": "Test Language",
                "Glottocode": "test1234",
                "ISO639P3code": "tst",
                "transcribers": "Test Contributor",
            }
        ],
    )
    write_csv(
        source / "parameters.csv",
        ["ID", "Name", "Concepticon_ID", "Concepticon_Gloss"],
        [
            {"ID": "1", "Name": "*water", "Concepticon_ID": "948", "Concepticon_Gloss": "WATER"},
            {"ID": "2", "Name": "dog", "Concepticon_ID": "2009", "Concepticon_Gloss": "DOG"},
        ],
    )
    form_fields = [
        "ID",
        "Language_ID",
        "Parameter_ID",
        "Value",
        "Form",
        "Segments",
        "Comment",
        "Source",
        "Loan",
        "Graphemes",
        "gloss_in_source",
    ]
    write_csv(
        source / "forms.csv",
        form_fields,
        [
            {
                "ID": "TEST-1-1",
                "Language_ID": "TEST",
                "Parameter_ID": "1",
                "Value": "paTa",
                "Form": "paTa",
                "Segments": "p a c a",
                "Comment": "",
                "Source": "42",
                "Loan": "false",
                "Graphemes": "^ p a T a $",
                "gloss_in_source": "water",
            },
            {
                "ID": "TEST-1-2",
                "Language_ID": "TEST",
                "Parameter_ID": "1",
                "Value": "kapi",
                "Form": "kapi",
                "Segments": "k a p i",
                "Comment": "alternative",
                "Source": "42",
                "Loan": "false",
                "Graphemes": "^ k a p i $",
                "gloss_in_source": "water",
            },
            {
                "ID": "TEST-2-1",
                "Language_ID": "TEST",
                "Parameter_ID": "2",
                "Value": "TuTu",
                "Form": "TuTu",
                "Segments": "c u c u",
                "Comment": "",
                "Source": "42",
                "Loan": "false",
                "Graphemes": "^ T u T u $",
                "gloss_in_source": "dog",
            },
        ],
    )
    write_json(source / "source.json", {"id": "42", "author": "A", "year": "1981", "title": "T"})
    write_json(source / "contributor.json", {"name": "Test Contributor"})
    write_json(
        source / "wordlist.json",
        {"id": "TEST", "code_iso": "tst", "code_glottolog": "test1234"},
    )
    write_json(source / "zenodo.json", {"id": 1})
    (source / "release.zip").write_bytes(b"verified release fixture")
    (source / "LICENSE").write_text("CC BY 4.0\n", encoding="utf-8")
    (source / "TRANSCRIPTION.md").write_text("ASJP transcription\n", encoding="utf-8")

    entries = [
        {
            "sourceRecordId": "current-1",
            "entryCandidateId": "entry-1",
            "sourceId": "dictionary-current",
            "headwordSource": "badha",
            "status": "candidate",
        },
        {
            "sourceRecordId": "historical-1",
            "entryCandidateId": "entry-2",
            "sourceId": "dictionary-historical",
            "headwordSource": "dudu",
            "status": "candidate",
        },
    ]
    senses = [
        {
            "sourceRecordId": "current-1",
            "senseCandidateId": "sense-1",
            "translationSource": "water",
            "definitionSource": "fresh water",
            "substitutableTranslationStatus": "unadjudicated",
        },
        {
            "sourceRecordId": "historical-1",
            "senseCandidateId": "sense-2",
            "translationSource": "dog",
            "definitionSource": "a domestic dog",
            "substitutableTranslationStatus": "unadjudicated",
        },
    ]
    forms = [
        {"sourceRecordId": "current-1", "formCandidateId": "form-1", "surfaceSource": "badha"},
        {"sourceRecordId": "historical-1", "formCandidateId": "form-2", "surfaceSource": "dudu"},
    ]
    dictionary = root / "dictionary"
    write_jsonl(dictionary / "entries.jsonl", entries)
    write_jsonl(dictionary / "senses.jsonl", senses)
    write_jsonl(dictionary / "forms.jsonl", forms)
    manifest = {
        "edition_id": "dictionary-v1",
        "components": {
            name: {
                "path": f"dictionary/{name}.jsonl",
                "sha256": sha256(dictionary / f"{name}.jsonl"),
                "rows": 2,
            }
            for name in ("entries", "senses", "forms")
        },
    }
    write_json(dictionary / "edition.json", manifest)
    write_json(
        dictionary / "CURRENT.json",
        {"manifest_path": "dictionary/edition.json"},
    )

    input_names = {
        "cldf_metadata": "cldf-metadata.json",
        "forms_csv": "forms.csv",
        "languages_csv": "languages.csv",
        "parameters_csv": "parameters.csv",
        "release_zip": "release.zip",
        "source_json": "source.json",
        "contributor_json": "contributor.json",
        "wordlist_json": "wordlist.json",
        "zenodo_record_json": "zenodo.json",
        "license_text": "LICENSE",
        "transcription_guide": "TRANSCRIPTION.md",
    }
    return {
        "schema_version": 1,
        "inventory_id": "test-asjp-v1",
        "created_at_utc": "2026-07-23T09:00:00Z",
        "source_id": "source-asjp-test",
        "asjp_source_key": "42",
        "contributor_name": "Test Contributor",
        "language": {"cldf_id": "TEST", "iso_639_3": "tst", "glottocode": "test1234"},
        "release": {"version": "fixture", "license": "CC BY 4.0"},
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
        "expected_counts": {"concepts": 2, "forms": 3},
        "output_directory": "analysis/asjp-test-v1",
    }


class AsjpCldfInventoryTest(unittest.TestCase):
    def test_csv_parser_preserves_quoted_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "quoted.csv"
            write_csv(
                path,
                ["id", "value"],
                [{"id": "1", "value": "water, fresh"}],
            )
            self.assertEqual(
                read_csv_rows(path),
                [{"id": "1", "value": "water, fresh"}],
            )

    def test_build_preserves_source_representation_and_closes_training(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = make_fixture(root)
            result = build(root, contract, write=True)
            self.assertEqual(result["mode"], "written")
            self.assertEqual(
                result["counts"],
                {
                    "concepts": 2,
                    "forms": 3,
                    "crosswalk_candidates": 3,
                    "dictionary_rows_compared": 2,
                    "accepted_dictionary_rows": 0,
                    "accepted_grammar_rows": 0,
                    "benchmark_reference_rows": 0,
                    "controlled_synthetic_sentence_pairs_authorized": 0,
                    "training_eligible_rows": 0,
                },
            )
            forms = [
                json.loads(line)
                for line in (root / "analysis/asjp-test-v1/forms.jsonl")
                .read_text()
                .splitlines()
            ]
            self.assertEqual(
                [row["form_source"] for row in forms],
                ["paTa", "kapi", "TuTu"],
            )
            self.assertTrue(
                all(row["orthographic_conversion_applied"] is False for row in forms)
            )
            self.assertTrue(all(row["training_eligible"] is False for row in forms))
            crosswalk = [
                json.loads(line)
                for line in (
                    root
                    / "analysis/asjp-test-v1/dictionary-crosswalk-candidates.jsonl"
                )
                .read_text()
                .splitlines()
            ]
            self.assertTrue(
                all(
                    row["lexical_identity_status"]
                    == "review_candidate_not_accepted"
                    for row in crosswalk
                )
            )
            self.assertTrue(
                all(row["synthetic_sentence_pair_eligible"] is False for row in crosswalk)
            )
            self.assertEqual(
                build(root, contract, write=True)["mode"],
                "verified_existing",
            )

    def test_build_fails_closed_on_language_identity_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract = make_fixture(root)
            contract["language"]["iso_639_3"] = "bad"
            with self.assertRaisesRegex(ValueError, "ISO code"):
                build(root, contract, write=False)

    def test_definition_head_outranks_incidental_context(self) -> None:
        head = relation_for_dictionary_row(
            {"see"},
            {
                "translation_source": None,
                "definition_source": "to see (it), to watch (it) (irregular verb)",
            },
        )
        context = relation_for_dictionary_row(
            {"see"},
            {
                "translation_source": None,
                "definition_source": "upper leg, kangaroo meat; see also another entry",
            },
        )
        self.assertIsNotNone(head)
        self.assertIsNotNone(context)
        self.assertEqual(head["relation"], "concept_tokens_in_definition_head")
        self.assertEqual(context["relation"], "concept_tokens_in_definition_context")
        self.assertGreater(head["priority"], context["priority"])

    def test_structured_pos_breaks_an_english_evidence_tie(self) -> None:
        common = {
            "english_relation_priority": 4,
            "english_match_first_token_index": 1,
            "raw_surface_similarity_case_sensitive": 0.2,
            "raw_surface_similarity_casefolded": 0.2,
        }
        lexical_entry = {
            **common,
            "dictionary_pos_evidence_present": True,
            "dictionary_source_record_id": "lexical",
        }
        cross_reference = {
            **common,
            "dictionary_pos_evidence_present": False,
            "dictionary_source_record_id": "cross-reference",
        }
        self.assertLess(
            crosswalk_sort_key(lexical_entry),
            crosswalk_sort_key(cross_reference),
        )

    def test_soft_hyphen_does_not_create_a_token_boundary(self) -> None:
        self.assertEqual(normalize_english("to be\u00ad come angry"), "to become angry")
        self.assertIsNone(
            relation_for_dictionary_row(
                {"come"},
                {
                    "translation_source": None,
                    "definition_source": "to be\u00ad come angry",
                },
            )
        )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name(
    "generate_controlled_synthetic_sentence_pairs.py"
)
SPEC = importlib.util.spec_from_file_location(
    "generate_controlled_synthetic_sentence_pairs", MODULE_PATH
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

PAIR_FIELDS = [
    "pair_id",
    "synthetic_version",
    "split",
    "parent_split",
    "direction",
    "source_lang",
    "target_lang",
    "task",
    "source_unit_type",
    "target_unit_type",
    "english_source",
    "wajarri_target",
    "input_text",
    "output_text",
    "target_analysis",
    "pair_kind",
    "generation_tier",
    "synthetic_method",
    "template_id",
    "confidence",
    "coverage_cell_ids",
    "parent_evidence_ids",
    "dictionary_record_ids",
    "grammar_claim_ids",
    "dictionary_edition_id",
    "grammar_edition_id",
    "base_lexeme_ids",
    "construction_family",
    "grammatical_features",
    "variety",
    "orthography",
    "source_cluster_ids",
    "generator_model_and_version",
    "generator_seed",
    "prompt_sha256",
    "raw_output_sha256",
    "generated_at_utc",
    "selection_reason",
    "review_status",
    "review_evidence_ids",
    "rights_status",
    "allowed_use",
    "approved_for_training",
    "lexical_audit",
    "grammar_audit",
    "tokenization_audit",
    "degeneration_audit",
    "leakage_audit",
    "benchmark_reuse_status",
    "notes",
]

COVERAGE_FIELDS = [
    "coverage_cell_id",
    "failed_benchmark_strata",
    "task_id",
    "construction_family",
    "grammatical_features",
    "lexeme_and_sense_family",
    "predicate_and_valency_frame",
    "participant_configuration",
    "polarity_tam_and_mood",
    "sentence_length_and_clause_depth",
    "variety_and_register",
    "parent_evidence_ids",
    "dictionary_record_ids",
    "grammar_claim_ids",
    "required_evidence_class",
    "target_independent_instances",
    "source_text_and_speaker_diversity",
    "acceptance_test",
    "why_existing_rows_are_insufficient",
    "parent_split",
    "derivative_split",
    "benchmark_reuse_status",
]


class ControlledSentencePairRendererTest(unittest.TestCase):
    def temporary_root(self) -> Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        return Path(temporary.name)

    def write_json(self, path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def write_jsonl(self, path: Path, rows: list[dict]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "".join(
                json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
                for row in rows
            ),
            encoding="utf-8",
        )

    def digest(self, path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def binding(self, root: Path, path: Path) -> dict[str, str]:
        return {
            "path": path.relative_to(root).as_posix(),
            "sha256": self.digest(path),
        }

    def component(self, root: Path, relative: str, rows: list[dict]) -> dict:
        path = root / relative
        self.write_jsonl(path, rows)
        return {
            "path": path.relative_to(root).as_posix(),
            "sha256": self.digest(path),
            "rows": len(rows),
        }

    def edition(
        self,
        root: Path,
        artifact: str,
        edition_id: str,
        components: dict[str, dict],
    ) -> tuple[Path, Path]:
        manifest = root / artifact / "editions" / edition_id / "EDITION.json"
        self.write_json(
            manifest,
            {"edition_id": edition_id, "components": components},
        )
        pointer = root / artifact / "CURRENT.json"
        self.write_json(
            pointer,
            {
                "artifact": artifact,
                "current_edition_id": edition_id,
                "manifest_path": manifest.relative_to(root).as_posix(),
                "manifest_sha256": self.digest(manifest),
            },
        )
        return pointer, manifest

    def base_bundle(self) -> dict:
        lexeme = {
            "synthetic_lexeme_id": "lexeme:water",
            "entry_candidate_id": "entry:water",
            "sense_candidate_id": "sense:water-1",
            "form_candidate_id": "form:gabi",
            "english_lemma": "water",
            "target_lemma": "gabi",
            "part_of_speech": "noun",
            "morphology_class_id": "noun-class:fixture",
            "variety": "fixture-wbv",
            "orthography": "fixture-practical",
            "parent_split": "training",
            "derivative_split": "training",
            "rights_status": "fixture-only",
            "source_record_ids": ["source-record:water"],
            "slot_classes": ["theme-np"],
            "parent_evidence_ids": ["evidence:water"],
            "source_cluster_ids": ["cluster:dictionary"],
            "allowed_use": [
                "controlled_synthetic_sentence_generation",
                "model_training",
            ],
            "acceptance_status": "accepted_for_controlled_sentence_generation",
            "synthetic_eligibility": "eligible",
            "model_output_is_linguistic_evidence": False,
            "synthetic_output_is_linguistic_evidence": False,
            "surface_realizations": [
                {
                    "realization_id": "realization:water",
                    "slot_class": "theme-np",
                    "grammatical_features": {"case": "absolutive"},
                    "english_surface": "water",
                    "target_surface": "gabi",
                    "target_analysis": {"lemma": "gabi", "case": "absolutive"},
                    "surface_origin": "accepted_dictionary_form",
                    "inferred_morphology": False,
                    "parent_evidence_ids": ["evidence:water"],
                    "acceptance_status": "accepted_explicit_surface_realization",
                    "model_output_is_linguistic_evidence": False,
                    "synthetic_output_is_linguistic_evidence": False,
                },
                {
                    "realization_id": "realization:the-water",
                    "slot_class": "theme-np",
                    "grammatical_features": {"case": "absolutive"},
                    "english_surface": "the water",
                    "target_surface": "gabi",
                    "target_analysis": {"lemma": "gabi", "case": "absolutive"},
                    "surface_origin": "grammar_licensed_explicit_form",
                    "inferred_morphology": False,
                    "parent_evidence_ids": ["evidence:water", "evidence:np-use"],
                    "acceptance_status": "accepted_explicit_surface_realization",
                    "model_output_is_linguistic_evidence": False,
                    "synthetic_output_is_linguistic_evidence": False,
                },
            ],
        }
        template = {
            "template_id": "template:location-clause",
            "task_id": "S1",
            "construction_family": "simple_location_clause",
            "predicate_and_valency_frame": "one-place locative predicate",
            "participant_configuration": "theme only",
            "polarity_tam_and_mood": "positive present declarative",
            "sentence_length_and_clause_depth": "one independent clause",
            "required_evidence_class": "accepted explicit construction evidence",
            "acceptance_test": "licensed theme form in reviewed clause frame",
            "rights_status": "fixture-only",
            "source_unit_type": "sentence",
            "target_unit_type": "sentence",
            "generation_tier": "A",
            "confidence": "high",
            "compatible_lexeme_slot_classes": ["theme-np"],
            "grammar_claim_ids": ["grammar-claim:location-clause"],
            "parent_evidence_ids": ["evidence:location-clause"],
            "source_cluster_ids": ["cluster:grammar"],
            "allowed_use": [
                "controlled_synthetic_sentence_generation",
                "model_training",
            ],
            "fixed_target_evidence_ids": ["evidence:location-clause"],
            "grammatical_features": {
                "clause_type": "declarative",
                "polarity": "positive",
            },
            "variety_and_register": {
                "variety": "fixture-wbv",
                "register": "neutral",
            },
            "source_text_and_speaker_diversity": {"minimum_independent_bindings": 2},
            "target_independent_instances_per_lexeme": 2,
            "acceptance_status": "accepted_for_controlled_sentence_generation",
            "synthetic_eligibility": "eligible",
            "model_output_is_linguistic_evidence": False,
            "synthetic_output_is_linguistic_evidence": False,
            "source_pattern": "{theme} is here.",
            "target_pattern": "{theme} nhanarra.",
            "slot_contracts": [
                {
                    "slot_name": "theme",
                    "allowed_slot_classes": ["theme-np"],
                    "required_grammatical_features": {"case": "absolutive"},
                    "distinct_from": [],
                }
            ],
            "binding_sets": [
                {
                    "binding_id": "binding:water",
                    "bindings": {"theme": "realization:water"},
                    "semantic_compatibility_status": "accepted_for_this_template",
                    "parent_evidence_ids": ["evidence:binding-water"],
                    "source_cluster_ids": ["cluster:review-water"],
                    "model_output_is_linguistic_evidence": False,
                    "synthetic_output_is_linguistic_evidence": False,
                },
                {
                    "binding_id": "binding:the-water",
                    "bindings": {"theme": "realization:the-water"},
                    "semantic_compatibility_status": "accepted_for_this_template",
                    "parent_evidence_ids": ["evidence:binding-the-water"],
                    "source_cluster_ids": ["cluster:review-the-water"],
                    "model_output_is_linguistic_evidence": False,
                    "synthetic_output_is_linguistic_evidence": False,
                },
            ],
        }
        cell = {
            "coverage_cell_id": "coverage-cell:water-location",
            "failure_requirement_id": "failure:water",
            "synthetic_lexeme_id": "lexeme:water",
            "template_id": "template:location-clause",
            "failed_benchmark_strata": ["L1:exact_reconstruction_failure"],
            "task_id": template["task_id"],
            "construction_family": template["construction_family"],
            "grammatical_features": template["grammatical_features"],
            "lexeme_and_sense_family": {
                "synthetic_lexeme_id": lexeme["synthetic_lexeme_id"],
                "english_lemma": lexeme["english_lemma"],
                "target_lemma": lexeme["target_lemma"],
                "part_of_speech": lexeme["part_of_speech"],
                "morphology_class_id": lexeme["morphology_class_id"],
                "slot_classes": lexeme["slot_classes"],
            },
            "predicate_and_valency_frame": template["predicate_and_valency_frame"],
            "participant_configuration": template["participant_configuration"],
            "polarity_tam_and_mood": template["polarity_tam_and_mood"],
            "sentence_length_and_clause_depth": template[
                "sentence_length_and_clause_depth"
            ],
            "variety_and_register": template["variety_and_register"],
            "parent_evidence_ids": ["evidence:water", "evidence:location-clause"],
            "dictionary_record_ids": ["entry:water", "sense:water-1", "form:gabi"],
            "grammar_claim_ids": ["grammar-claim:location-clause"],
            "required_evidence_class": template["required_evidence_class"],
            "target_independent_instances": 2,
            "source_text_and_speaker_diversity": template[
                "source_text_and_speaker_diversity"
            ],
            "acceptance_test": template["acceptance_test"],
            "why_existing_rows_are_insufficient": {"failure_count": 1},
            "parent_split": "training",
            "derivative_split": "training",
            "benchmark_reuse_status": "training_parent_only",
        }
        return {
            "lexemes": [lexeme],
            "templates": [template],
            "cells": [cell],
            "generation": {
                "immutable": True,
                "status": "authorized_for_candidate_generation",
                "generation_id": "fixture-generation-v1",
                "synthetic_version": "wbv-synthetic-fixture-v1",
                "direction": "eng-wbv",
                "authorization": {
                    "census_complete": True,
                    "qualitative_analysis_complete": True,
                    "coverage_cells_frozen": True,
                    "living_books_reviewed": True,
                    "generation_authorized": True,
                },
                "seed": 73,
                "max_template_share": 1.0,
                "max_candidate_pairs": 10,
                "authorization_evidence_ids": ["authorization:fixture"],
            },
        }

    def synthetic_contract(self) -> dict:
        return {
            "immutable": True,
            "goal_binding": {
                "required_by_active_goal": True,
                "method_id": "kuku_yalanji_coverage_ledger",
            },
            "coverage_cell_contract": {"required_fields": COVERAGE_FIELDS},
            "pair_record_contract": {
                "additional_fields_allowed": False,
                "required_fields": PAIR_FIELDS,
                "constant_values": {
                    "direction": "eng-wbv",
                    "source_lang": "eng_Latn",
                    "target_lang": "wbv_Latn",
                    "task": "translate",
                    "pair_kind": "synthetic_candidate",
                },
                "enumerated_values": {
                    "source_unit_type": ["sentence", "clause", "utterance"],
                    "target_unit_type": ["sentence", "clause", "utterance"],
                    "generation_tier": ["A", "B", "C", "D"],
                    "confidence": ["high", "medium_high", "medium", "low"],
                    "review_status": [
                        "generated_unreviewed",
                        "automatic_checks_passed",
                        "held_for_review",
                        "fluent_review_accepted",
                        "fluent_review_revised",
                        "rejected",
                    ],
                    "benchmark_reuse_status": [
                        "training_parent_only",
                        "development_consumed",
                        "final_test_analysis_only",
                        "new_independent_final_required",
                    ],
                },
            },
        }

    def build_fixture(self, root: Path, mutate=None) -> dict:
        root.mkdir(parents=True, exist_ok=True)
        bundle = self.base_bundle()
        if mutate is not None:
            mutate(bundle)

        renderer = root / "methods" / "renderer.py"
        renderer.parent.mkdir(parents=True)
        renderer.write_bytes(MODULE_PATH.read_bytes())

        synthetic_contract = root / "contracts" / "synthetic.json"
        self.write_json(synthetic_contract, self.synthetic_contract())

        dictionary_component = self.component(
            root,
            "dictionary/components/synthetic-lexemes.jsonl",
            bundle["lexemes"],
        )
        dictionary_pointer, dictionary_manifest = self.edition(
            root,
            "dictionary",
            "fixture-dictionary-v1",
            {"syntheticLexemes": dictionary_component},
        )
        grammar_component = self.component(
            root,
            "grammar/components/synthetic-templates.jsonl",
            bundle["templates"],
        )
        grammar_pointer, grammar_manifest = self.edition(
            root,
            "grammar",
            "fixture-grammar-v1",
            {"syntheticTemplates": grammar_component},
        )

        commission = root / "commission"
        self.write_jsonl(commission / "COVERAGE-CELLS.jsonl", bundle["cells"])
        self.write_jsonl(commission / "FAILURE-REQUIREMENTS.jsonl", [])
        self.write_jsonl(commission / "BLOCKED-REQUIREMENTS.jsonl", [])
        self.write_json(
            commission / "SUMMARY.json",
            {
                "status": "reviewable_commission_not_generation_authorization",
                "generation_authorized": False,
                "counts": {
                    "coverage_cells": len(bundle["cells"]),
                    "commissioned_sentence_pair_instances": sum(
                        row["target_independent_instances"] for row in bundle["cells"]
                    ),
                    "candidate_sentence_pairs": 0,
                },
                "bindings": {
                    "dictionary_edition_id": "fixture-dictionary-v1",
                    "grammar_edition_id": "fixture-grammar-v1",
                },
            },
        )
        commission_files = sorted(
            path for path in commission.iterdir() if path.is_file()
        )
        (commission / "OUTPUT-SHA256SUMS").write_text(
            "".join(f"{self.digest(path)}  {path.name}\n" for path in commission_files),
            encoding="utf-8",
        )

        generation = copy.deepcopy(bundle["generation"])
        generation["coverage_cell_ids"] = [
            row["coverage_cell_id"] for row in bundle["cells"]
        ]
        generation["bindings"] = {
            "commission_summary": self.binding(root, commission / "SUMMARY.json"),
            "commission_output_checksums": self.binding(
                root, commission / "OUTPUT-SHA256SUMS"
            ),
            "dictionary_pointer": self.binding(root, dictionary_pointer),
            "dictionary_manifest": self.binding(root, dictionary_manifest),
            "grammar_pointer": self.binding(root, grammar_pointer),
            "grammar_manifest": self.binding(root, grammar_manifest),
            "synthetic_sentence_pair_contract": self.binding(root, synthetic_contract),
            "renderer": self.binding(root, renderer),
        }
        generation_contract = root / "contracts" / "generation.json"
        self.write_json(generation_contract, generation)
        return {
            "program_root": root,
            "commission_dir": commission,
            "dictionary_current_path": dictionary_pointer,
            "grammar_current_path": grammar_pointer,
            "synthetic_contract_path": synthetic_contract,
            "generation_contract_path": generation_contract,
            "renderer_path": renderer,
            "created_at_utc": "2026-07-23T22:00:00Z",
        }

    def generate(self, fixture: dict) -> dict:
        return MODULE.generate_pairs(**fixture)

    def test_generates_deterministic_bilingual_sentence_pairs(self) -> None:
        result = self.generate(self.build_fixture(self.temporary_root()))
        self.assertEqual(len(result["pairs"]), 2)
        self.assertEqual(
            {row["english_source"] for row in result["pairs"]},
            {"water is here.", "the water is here."},
        )
        self.assertEqual(
            {row["wajarri_target"] for row in result["pairs"]},
            {"gabi nhanarra."},
        )
        for row in result["pairs"]:
            self.assertEqual(set(row), set(PAIR_FIELDS))
            self.assertEqual(row["input_text"], f"<translate> {row['english_source']}")
            self.assertEqual(row["output_text"], row["wajarri_target"])
            self.assertFalse(row["approved_for_training"])
            self.assertEqual(row["review_status"], "generated_unreviewed")
            self.assertIn("entry:water", row["dictionary_record_ids"])
            self.assertIn("grammar-claim:location-clause", row["grammar_claim_ids"])
        self.assertEqual(
            result["summary"]["status"],
            "generated_candidates_pending_review_and_post_generation_audits",
        )
        self.assertFalse(result["summary"]["training_authorized"])

    def test_result_is_stable_under_input_order_changes(self) -> None:
        first = self.generate(self.build_fixture(self.temporary_root()))

        def reverse_inputs(bundle: dict) -> None:
            bundle["lexemes"][0]["surface_realizations"].reverse()
            bundle["templates"][0]["binding_sets"].reverse()

        second = self.generate(
            self.build_fixture(self.temporary_root(), reverse_inputs)
        )
        self.assertEqual(first["pairs"], second["pairs"])
        self.assertEqual(first["traces"], second["traces"])

    def test_closed_generation_gate_is_rejected(self) -> None:
        def close_gate(bundle: dict) -> None:
            bundle["generation"]["authorization"]["generation_authorized"] = False

        with self.assertRaisesRegex(ValueError, "generation gate closed"):
            self.generate(self.build_fixture(self.temporary_root(), close_gate))

    def test_commission_checksum_drift_is_rejected(self) -> None:
        fixture = self.build_fixture(self.temporary_root())
        path = fixture["commission_dir"] / "BLOCKED-REQUIREMENTS.jsonl"
        path.write_text("{}\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            self.generate(fixture)

    def test_unlisted_commission_file_is_rejected(self) -> None:
        fixture = self.build_fixture(self.temporary_root())
        (fixture["commission_dir"] / "UNBOUND.json").write_text("{}\n")
        with self.assertRaisesRegex(ValueError, "checksum population"):
            self.generate(fixture)

    def test_model_output_cannot_be_linguistic_evidence(self) -> None:
        def model_evidence(bundle: dict) -> None:
            bundle["lexemes"][0]["model_output_is_linguistic_evidence"] = True

        with self.assertRaisesRegex(ValueError, "model evidence"):
            self.generate(self.build_fixture(self.temporary_root(), model_evidence))

    def test_inferred_target_morphology_is_rejected(self) -> None:
        def inferred(bundle: dict) -> None:
            surface = bundle["lexemes"][0]["surface_realizations"][0]
            surface["inferred_morphology"] = True

        with self.assertRaisesRegex(ValueError, "inferred morphology"):
            self.generate(self.build_fixture(self.temporary_root(), inferred))

    def test_unresolved_target_form_is_rejected(self) -> None:
        def unresolved(bundle: dict) -> None:
            bundle["lexemes"][0]["surface_realizations"][0]["target_surface"] = "{gabi}"

        with self.assertRaisesRegex(ValueError, "target is not explicit"):
            self.generate(self.build_fixture(self.temporary_root(), unresolved))

    def test_final_test_derivative_is_rejected(self) -> None:
        def final_test(bundle: dict) -> None:
            lexeme = bundle["lexemes"][0]
            lexeme["parent_split"] = "final-test"
            lexeme["derivative_split"] = "final-test"
            cell = bundle["cells"][0]
            cell["parent_split"] = "final-test"
            cell["derivative_split"] = "final-test"
            cell["benchmark_reuse_status"] = "final_test_analysis_only"

        with self.assertRaisesRegex(ValueError, "final-test"):
            self.generate(self.build_fixture(self.temporary_root(), final_test))

    def test_lexeme_split_drift_is_rejected(self) -> None:
        def split_drift(bundle: dict) -> None:
            bundle["lexemes"][0]["derivative_split"] = "development"

        with self.assertRaisesRegex(ValueError, "split drift"):
            self.generate(self.build_fixture(self.temporary_root(), split_drift))

    def test_cell_semantic_drift_is_rejected(self) -> None:
        def drift(bundle: dict) -> None:
            bundle["cells"][0]["predicate_and_valency_frame"] = "changed frame"

        with self.assertRaisesRegex(ValueError, "predicate_and_valency_frame drift"):
            self.generate(self.build_fixture(self.temporary_root(), drift))

    def test_insufficient_independent_bindings_are_rejected(self) -> None:
        def insufficient(bundle: dict) -> None:
            bundle["cells"][0]["target_independent_instances"] = 3

        with self.assertRaisesRegex(ValueError, "insufficient reviewed bindings"):
            self.generate(self.build_fixture(self.temporary_root(), insufficient))

    def test_duplicate_bilingual_pairs_are_rejected(self) -> None:
        def duplicate(bundle: dict) -> None:
            surfaces = bundle["lexemes"][0]["surface_realizations"]
            surfaces[1]["english_surface"] = surfaces[0]["english_surface"]
            surfaces[1]["target_surface"] = surfaces[0]["target_surface"]

        with self.assertRaisesRegex(ValueError, "duplicate bilingual pair"):
            self.generate(self.build_fixture(self.temporary_root(), duplicate))

    def test_template_concentration_ceiling_is_enforced(self) -> None:
        def concentrated(bundle: dict) -> None:
            bundle["generation"]["max_template_share"] = 0.5

        with self.assertRaisesRegex(ValueError, "template concentration"):
            self.generate(self.build_fixture(self.temporary_root(), concentrated))

    def test_template_enumerations_are_frozen(self) -> None:
        def invalid_unit(bundle: dict) -> None:
            bundle["templates"][0]["source_unit_type"] = "isolated_lexeme"

        with self.assertRaisesRegex(ValueError, "outside the frozen pair contract"):
            self.generate(self.build_fixture(self.temporary_root(), invalid_unit))

    def test_timestamp_must_be_canonical_utc(self) -> None:
        fixture = self.build_fixture(self.temporary_root())
        fixture["created_at_utc"] = "2026-07-23T22:00:00+00:00"
        with self.assertRaisesRegex(ValueError, "canonical UTC Z"):
            self.generate(fixture)

    def test_output_population_is_hashable_and_write_once(self) -> None:
        root = self.temporary_root()
        result = self.generate(self.build_fixture(root))
        output = root / "generated" / "fixture-v1"
        MODULE.write_generation(output, result)
        checksums = MODULE.parse_checksum_manifest(output / "OUTPUT-SHA256SUMS")
        self.assertEqual(
            set(checksums),
            {
                "AUTOMATIC-AUDIT.json",
                "CANDIDATE-PAIRS.eng-wbv.jsonl",
                "RENDER-TRACE.jsonl",
                "SUMMARY.json",
            },
        )
        for relative, expected in checksums.items():
            self.assertEqual(MODULE.sha256(output / relative), expected)
        with self.assertRaises(FileExistsError):
            MODULE.write_generation(output, result)


if __name__ == "__main__":
    unittest.main()

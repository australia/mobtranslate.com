from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("compile_synthetic_sentence_commission.py")
SPEC = importlib.util.spec_from_file_location(
    "compile_synthetic_sentence_commission", MODULE_PATH
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SentenceCommissionCompilerTest(unittest.TestCase):
    def write_json(self, path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def write_jsonl(self, path: Path, rows: list[dict]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
            encoding="utf-8",
        )

    def component(self, root: Path, name: str, rows: list[dict]) -> dict:
        path = root / "components" / f"{name}.jsonl"
        self.write_jsonl(path, rows)
        return {
            "path": str(path.relative_to(root)),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "rows": len(rows),
        }

    def edition_manifest(
        self,
        root: Path,
        artifact: str,
        edition_id: str,
        components: dict[str, dict],
        *,
        parent: Path | None = None,
        review_checkpoint: dict | None = None,
        supplemental_review_checkpoint: dict | None = None,
    ) -> Path:
        manifest = root / artifact / "editions" / edition_id / "EDITION.json"
        value: dict[str, object] = {
            "edition_id": edition_id,
            "components": components,
        }
        if parent is not None:
            parent_hash = hashlib.sha256(parent.read_bytes()).hexdigest()
            value["parent_manifest"] = {
                "path": str(parent.relative_to(root)),
                "sha256": parent_hash,
            }
            value["component_inheritance"] = {
                "mode": "exact_parent_component_aliases",
                "parent_manifest_sha256": parent_hash,
                "changed_component_count": 0,
            }
        if review_checkpoint is not None:
            value["qualitative_failure_review_checkpoint"] = review_checkpoint
        if supplemental_review_checkpoint is not None:
            value["supplemental_50words_failure_review_checkpoint"] = (
                supplemental_review_checkpoint
            )
        self.write_json(manifest, value)
        return manifest

    def supplemental_row(
        self,
        row_id: str,
        source_id: str,
        task_family: str,
        *,
        exact: bool = False,
    ) -> dict:
        fixed = task_family == "fixed_utterance"
        reference = "barndi yanayi" if fixed else "baba"
        prediction = reference if exact else "wrong"
        return {
            "id": row_id,
            "task_family": task_family,
            "suite_key": ("supplemental-sentence" if fixed else "supplemental-lexical"),
            "source_record_id": source_id,
            "source_prompt": "welcome" if fixed else "water",
            "accepted_references_normalized": [reference],
            "selected_closest_reference": reference,
            "prediction_normalized": prediction,
            "accepted_exact": exact,
            "grapheme_cer": 0.0 if exact else 1.0,
            "target_subword_count": 2,
            "edit_error_type": "accepted_exact" if exact else "different_surface_form",
            "current_dictionary_relation": (
                None if fixed else "unique_exact_current_headword"
            ),
            "failure_labels": [] if exact else ["different_surface_form"],
            "review_actions": (
                []
                if exact
                else [
                    (
                        "attested_fixed_utterance_reconstruction_review"
                        if fixed
                        else "direct_lexical_reconstruction_supervision_review"
                    )
                ]
            ),
            "model_output_is_linguistic_evidence": False,
            "synthetic_coverage_cell_authorized": False,
            "training_eligible": False,
        }

    def supplemental_analysis(
        self,
        root: Path,
        rows: list[dict],
        *,
        dictionary_baseline: Path,
        grammar_baseline: Path,
    ) -> tuple[Path, Path]:
        lexical_rows = sum(row["task_family"] == "lexeme" for row in rows)
        sentence_rows = sum(row["task_family"] == "fixed_utterance" for row in rows)
        dictionary_binding = {
            "path": str(dictionary_baseline.relative_to(root)),
            "sha256": hashlib.sha256(dictionary_baseline.read_bytes()).hexdigest(),
        }
        grammar_binding = {
            "path": str(grammar_baseline.relative_to(root)),
            "sha256": hashlib.sha256(grammar_baseline.read_bytes()).hexdigest(),
        }
        lexical_manifest = root / "supplemental" / "lexical-manifest.json"
        sentence_manifest = root / "supplemental" / "sentence-manifest.json"
        self.write_json(
            lexical_manifest,
            {
                "suite_key": "supplemental-lexical",
                "inputs": {"dictionary_edition": dictionary_binding},
            },
        )
        self.write_json(
            sentence_manifest,
            {
                "suite": {"suite_key": "supplemental-sentence"},
                "inputs": {
                    "dictionary_edition": dictionary_binding,
                    "grammar_edition": grammar_binding,
                },
            },
        )
        contract = root / "supplemental" / "analysis-contract.json"
        self.write_json(
            contract,
            {
                "method_id": "fixture-50words-analysis-v1",
                "frozen_benchmark_inputs": {
                    "lexical": {
                        "suite_key": "supplemental-lexical",
                        "manifest_path": str(lexical_manifest.relative_to(root)),
                        "manifest_sha256": hashlib.sha256(
                            lexical_manifest.read_bytes()
                        ).hexdigest(),
                        "sha256": "a" * 64,
                        "rows": lexical_rows,
                    },
                    "fixed_utterance": {
                        "suite_key": "supplemental-sentence",
                        "manifest_path": str(sentence_manifest.relative_to(root)),
                        "manifest_sha256": hashlib.sha256(
                            sentence_manifest.read_bytes()
                        ).hexdigest(),
                        "sha256": "b" * 64,
                        "rows": sentence_rows,
                    },
                },
                "outputs": {"expected_joined_rows": len(rows)},
            },
        )
        analysis = root / "supplemental-analysis"
        analysis.mkdir()
        self.write_jsonl(analysis / "ROWS.jsonl", rows)
        failed = [row for row in rows if not row["accepted_exact"]]
        self.write_jsonl(
            analysis / "COVERAGE-REVIEW-QUEUE.jsonl",
            [
                {
                    "benchmark_row_id": row["id"],
                    "synthetic_coverage_cell_status": "blocked_review_question_only",
                    "model_output_is_linguistic_evidence": False,
                }
                for row in failed
            ],
        )
        self.write_json(
            analysis / "REPORT.json",
            {
                "analysis_id": "fixture-50words-analysis-v1",
                "population": {
                    "rows": len(rows),
                    "lexical_rows": lexical_rows,
                    "fixed_utterance_rows": sentence_rows,
                },
                "authorization": {
                    "synthetic_coverage_cells": 0,
                    "controlled_synthetic_sentence_pairs": 0,
                    "training_eligible_rows": 0,
                    "model_output_is_linguistic_evidence": False,
                },
            },
        )
        self.write_json(
            analysis / "INPUT-MANIFEST.json",
            {
                "inputs": {
                    "lexical_benchmark": {
                        "sha256": "a" * 64,
                        "rows": lexical_rows,
                    },
                    "lexical_predictions": {
                        "sha256": "c" * 64,
                        "rows": lexical_rows,
                    },
                    "sentence_benchmark": {
                        "sha256": "b" * 64,
                        "rows": sentence_rows,
                    },
                    "sentence_predictions": {
                        "sha256": "d" * 64,
                        "rows": sentence_rows,
                    },
                }
            },
        )
        paths = sorted(path for path in analysis.iterdir() if path.is_file())
        (analysis / "SHA256SUMS.analysis").write_text(
            "".join(
                f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
                for path in paths
            ),
            encoding="utf-8",
        )
        return analysis, contract

    def current_pointer(self, root: Path, artifact: str, manifest: Path) -> Path:
        manifest_value = MODULE.read_json(manifest)
        pointer = root / artifact / "CURRENT.json"
        self.write_json(
            pointer,
            {
                "artifact": artifact,
                "current_edition_id": manifest_value["edition_id"],
                "manifest_path": str(manifest.relative_to(root)),
                "manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
            },
        )
        return pointer

    def analysis(
        self,
        root: Path,
        rows: list[dict],
        *,
        census_contract: Path | None = None,
        dictionary_baseline: Path | None = None,
        grammar_baseline: Path | None = None,
    ) -> Path:
        analysis = root / "analysis"
        analysis.mkdir()
        summary: dict[str, object] = {
            "analysis_id": "fixture-qualitative-analysis-v10",
            "rows": len(rows),
            "overall": {"rows": len(rows)},
        }
        feedback: dict[str, object] = {
            "trigger": "complete_zero_step_lexical_census",
            "model_output_is_linguistic_evidence": False,
            "dictionary_changed": False,
            "grammar_changed": False,
        }
        if census_contract and dictionary_baseline and grammar_baseline:
            dictionary_value = MODULE.read_json(dictionary_baseline)
            grammar_value = MODULE.read_json(grammar_baseline)
            dictionary_hash = hashlib.sha256(
                dictionary_baseline.read_bytes()
            ).hexdigest()
            grammar_hash = hashlib.sha256(grammar_baseline.read_bytes()).hexdigest()
            summary["contract_sha256"] = hashlib.sha256(
                census_contract.read_bytes()
            ).hexdigest()
            summary["review_knowledge_baseline"] = {
                "dictionary": {
                    "edition_id": dictionary_value["edition_id"],
                    "manifest_sha256": dictionary_hash,
                },
                "grammar": {
                    "edition_id": grammar_value["edition_id"],
                    "manifest_sha256": grammar_hash,
                },
            }
            feedback.update(
                {
                    "review_dictionary_edition": dictionary_value["edition_id"],
                    "review_dictionary_manifest_sha256": dictionary_hash,
                    "review_grammar_edition": grammar_value["edition_id"],
                    "review_grammar_manifest_sha256": grammar_hash,
                    "required_living_book_checkpoint": {
                        "dictionary_parent_edition": dictionary_value["edition_id"],
                        "grammar_parent_edition": grammar_value["edition_id"],
                    },
                }
            )
        self.write_json(
            analysis / "SUMMARY.json",
            summary,
        )
        self.write_json(
            analysis / "KNOWLEDGE-FEEDBACK.json",
            feedback,
        )
        self.write_jsonl(analysis / "FAILURE-JOIN.jsonl", rows)
        for name in (
            "FAILURE-DIAGNOSTICS.jsonl",
            "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl",
            "PREDICTION-COLLAPSE.jsonl",
            "QUALITATIVE-SAMPLE.jsonl",
            "SOURCE-RECORD-CONTRASTS.jsonl",
            "SOURCE-RECORD-PROFILES.jsonl",
        ):
            self.write_jsonl(analysis / name, [])
        paths = sorted(
            path for path in analysis.iterdir() if path.name != "OUTPUT-SHA256SUMS"
        )
        (analysis / "OUTPUT-SHA256SUMS").write_text(
            "".join(
                f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
                for path in paths
            ),
            encoding="utf-8",
        )
        return analysis

    def benchmark_row(
        self,
        row_id: str,
        source_id: str,
        *,
        exact: bool = False,
        suite_key: str = "suite-a",
        confounded: bool = False,
    ) -> dict:
        return {
            "row_id": row_id,
            "suite_key": suite_key,
            "task": "L1",
            "source_record_ids": [source_id],
            "source_prompt": "water",
            "accepted_references": ["baba"],
            "accepted_exact": exact,
            "grapheme_cer": 0.0 if exact else 1.0,
            "target_subword_count": 3,
            "edit_error_type": "exact" if exact else "different_surface_form",
            "ambiguity_status": "single",
            "reference_orthographic_suffix_cluster_ids": [],
            "reference_orthographic_suffix_cluster_labels": ["(unclustered)"],
            "source_structural_strata": ["simple_lexeme"],
            "source_blocker_codes": [],
            "evaluation_input_contains_reference_surface": confounded,
            "nearest_accepted_reference": "baba",
            "prediction_population_count": 1,
            "prediction_unique_source_record_count": 1,
            "prediction_target_inventory_owner_source_record_ids": [],
            "failure_diagnostic_classes": (
                ["accepted_exact"]
                if exact
                else ["surface_error:different_surface_form"]
            ),
            "failure_review_priority_class": (
                "analysis_only_confounded" if confounded else "other_surface_failure"
            ),
            "analysis_confounder_codes": (
                ["accepted_reference_surface_present_in_evaluation_input"]
                if confounded
                else []
            ),
            "synthetic_commission_input_status": (
                "analysis_only_confounded"
                if confounded
                else (
                    "no_commission_exact_success"
                    if exact
                    else "eligible_for_evidence_gated_priority_review"
                )
            ),
            "claim_limit": "diagnostic only",
        }

    def contracts(
        self, root: Path, rows: int, *, sealed: bool = False
    ) -> tuple[Path, Path]:
        suite_manifest = root / "suite" / "MANIFEST.json"
        self.write_json(
            suite_manifest,
            {
                "policy": {
                    "sealed": sealed,
                    "model_output_is_linguistic_evidence": False,
                }
            },
        )
        census = root / "census-contract.json"
        self.write_json(
            census,
            {
                "experiment_id": "fixture-census",
                "suites": [
                    {
                        "suite_key": "suite-a",
                        "rows": rows,
                        "manifest_path": str(suite_manifest.relative_to(root)),
                        "manifest_sha256": hashlib.sha256(
                            suite_manifest.read_bytes()
                        ).hexdigest(),
                    }
                ],
            },
        )
        synthetic = root / "synthetic-contract.json"
        self.write_json(
            synthetic,
            {
                "contract_id": "fixture-synthetic-sentence-pairs",
                "immutable": True,
                "goal_binding": {
                    "required_by_active_goal": True,
                    "method_id": "kuku_yalanji_coverage_ledger",
                },
                "opening_gate": {"generation_authorized": False},
                "population": {"candidate_pairs": 0},
                "coverage_cell_contract": {
                    "required_fields": [
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
                },
            },
        )
        return census, synthetic

    def dictionary_components(self, root: Path, *, eligible: bool) -> dict[str, dict]:
        entry_id = "entry-1"
        sense_id = "sense-1"
        form_id = "form-1"
        components = {
            "entries": self.component(
                root, "entries", [{"entryCandidateId": entry_id, "status": "accepted"}]
            ),
            "senses": self.component(
                root, "senses", [{"senseCandidateId": sense_id, "status": "accepted"}]
            ),
            "forms": self.component(
                root, "forms", [{"formCandidateId": form_id, "status": "accepted"}]
            ),
        }
        if eligible:
            components["syntheticLexemes"] = self.component(
                root,
                "synthetic-lexemes",
                [
                    {
                        "synthetic_lexeme_id": "lexeme-1",
                        "sense_candidate_id": sense_id,
                        "entry_candidate_id": entry_id,
                        "form_candidate_id": form_id,
                        "source_record_ids": ["source-1"],
                        "english_lemma": "water",
                        "target_lemma": "baba",
                        "part_of_speech": "noun",
                        "morphology_class_id": "noun-class-1",
                        "slot_classes": ["intransitive_subject"],
                        "variety": "fixture",
                        "orthography": "fixture",
                        "parent_evidence_ids": ["evidence-lexeme-1"],
                        "source_cluster_ids": ["speaker-cluster-1"],
                        "parent_split": "train",
                        "derivative_split": "train",
                        "rights_status": "allowed_noncommercial",
                        "allowed_use": [
                            "controlled_synthetic_sentence_generation",
                            "model_training",
                        ],
                        "acceptance_status": (
                            "accepted_for_controlled_sentence_generation"
                        ),
                        "synthetic_eligibility": "eligible",
                        "model_output_is_linguistic_evidence": False,
                        "synthetic_output_is_linguistic_evidence": False,
                    }
                ],
            )
        return components

    def grammar_components(self, root: Path, *, eligible: bool) -> dict[str, dict]:
        claim = {
            "assertionId": "claim-1",
            "syntheticEligibility": "allowed",
            "trainingEligibility": "allowed",
            "modelOutputIsLinguisticEvidence": False,
        }
        components = {"assertions": self.component(root, "assertions", [claim])}
        if eligible:
            components["syntheticTemplates"] = self.component(
                root,
                "synthetic-templates",
                [
                    {
                        "template_id": "template-1",
                        "task_id": "S1",
                        "construction_family": "simple_intransitive",
                        "compatible_lexeme_slot_classes": ["intransitive_subject"],
                        "grammatical_features": {"tam": "present"},
                        "predicate_and_valency_frame": "intransitive",
                        "participant_configuration": "one_subject",
                        "polarity_tam_and_mood": "positive_present_declarative",
                        "sentence_length_and_clause_depth": "one_clause_short",
                        "variety_and_register": {
                            "variety": "fixture",
                            "register": "neutral",
                        },
                        "grammar_claim_ids": ["claim-1"],
                        "parent_evidence_ids": ["evidence-grammar-1"],
                        "required_evidence_class": "source_anchored_productive_rule",
                        "target_independent_instances_per_lexeme": 4,
                        "source_text_and_speaker_diversity": {
                            "minimum_source_clusters": 1
                        },
                        "acceptance_test": "all structured audits pass",
                        "source_cluster_ids": ["grammar-source-cluster-1"],
                        "rights_status": "allowed_noncommercial",
                        "allowed_use": [
                            "controlled_synthetic_sentence_generation",
                            "model_training",
                        ],
                        "acceptance_status": (
                            "accepted_for_controlled_sentence_generation"
                        ),
                        "synthetic_eligibility": "eligible",
                        "model_output_is_linguistic_evidence": False,
                        "synthetic_output_is_linguistic_evidence": False,
                    }
                ],
            )
        return components

    def compile_fixture(
        self,
        root: Path,
        *,
        eligible: bool,
        sealed: bool = False,
        rows: list[dict] | None = None,
        with_review_checkpoint: bool = True,
        with_supplemental: bool = False,
        with_supplemental_review_checkpoint: bool = True,
    ) -> dict:
        rows = rows or [self.benchmark_row("row-1", "source-1")]
        census, synthetic = self.contracts(root, len(rows), sealed=sealed)
        dictionary_components = self.dictionary_components(root, eligible=eligible)
        grammar_components = self.grammar_components(root, eligible=eligible)
        dictionary_baseline = self.edition_manifest(
            root,
            "dictionary",
            "fixture-dictionary-baseline-v1",
            dictionary_components,
        )
        grammar_baseline = self.edition_manifest(
            root,
            "grammar",
            "fixture-grammar-baseline-v1",
            grammar_components,
        )
        analysis = self.analysis(
            root,
            rows,
            census_contract=census,
            dictionary_baseline=dictionary_baseline,
            grammar_baseline=grammar_baseline,
        )
        supplemental_analysis = None
        supplemental_contract = None
        supplemental_checkpoint = None
        if with_supplemental:
            supplemental_analysis, supplemental_contract = self.supplemental_analysis(
                root,
                [
                    self.supplemental_row("supp-lexical", "source-2", "lexeme"),
                    self.supplemental_row(
                        "supp-sentence", "source-3", "fixed_utterance"
                    ),
                ],
                dictionary_baseline=dictionary_baseline,
                grammar_baseline=grammar_baseline,
            )
            supplemental_checkpoint = {
                "analysis_id": "fixture-50words-analysis-v1",
                "analysis_report_sha256": hashlib.sha256(
                    (supplemental_analysis / "REPORT.json").read_bytes()
                ).hexdigest(),
                "analysis_output_checksums_sha256": hashlib.sha256(
                    (supplemental_analysis / "SHA256SUMS.analysis").read_bytes()
                ).hexdigest(),
                "lexical_rows": 1,
                "fixed_utterance_rows": 1,
                "review_outcome": "reviewed_no_change_child_edition",
                "model_output_is_linguistic_evidence": False,
                "synthetic_output_is_linguistic_evidence": False,
            }
        review_checkpoint = {
            "analysis_id": "fixture-qualitative-analysis-v10",
            "analysis_summary_sha256": hashlib.sha256(
                (analysis / "SUMMARY.json").read_bytes()
            ).hexdigest(),
            "analysis_output_checksums_sha256": hashlib.sha256(
                (analysis / "OUTPUT-SHA256SUMS").read_bytes()
            ).hexdigest(),
            "review_outcome": "reviewed_no_change_child_edition",
            "model_output_is_linguistic_evidence": False,
            "synthetic_output_is_linguistic_evidence": False,
        }
        dictionary_child = self.edition_manifest(
            root,
            "dictionary",
            "fixture-dictionary-reviewed-child-v2",
            dictionary_components,
            parent=dictionary_baseline,
            review_checkpoint=(review_checkpoint if with_review_checkpoint else None),
            supplemental_review_checkpoint=(
                supplemental_checkpoint if with_supplemental_review_checkpoint else None
            ),
        )
        grammar_child = self.edition_manifest(
            root,
            "grammar",
            "fixture-grammar-reviewed-child-v2",
            grammar_components,
            parent=grammar_baseline,
            review_checkpoint=(review_checkpoint if with_review_checkpoint else None),
            supplemental_review_checkpoint=(
                supplemental_checkpoint if with_supplemental_review_checkpoint else None
            ),
        )
        dictionary = self.current_pointer(root, "dictionary", dictionary_child)
        grammar = self.current_pointer(root, "grammar", grammar_child)
        return MODULE.compile_sentence_commission(
            program_root=root,
            analysis_dir=analysis,
            census_contract_path=census,
            synthetic_contract_path=synthetic,
            dictionary_current_path=dictionary,
            grammar_current_path=grammar,
            created_at_utc="2026-07-23T21:00:00Z",
            supplemental_analysis_dir=supplemental_analysis,
            supplemental_analysis_contract_path=supplemental_contract,
        )

    def test_missing_productive_components_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.compile_fixture(Path(directory).resolve(), eligible=False)
        self.assertEqual(result["summary"]["counts"]["coverage_cells"], 0)
        self.assertEqual(result["summary"]["counts"]["candidate_sentence_pairs"], 0)
        self.assertFalse(result["summary"]["generation_authorized"])
        self.assertIn(
            "dictionary_missing_synthetic_lexeme_component",
            result["summary"]["global_blockers"],
        )
        self.assertIn(
            "grammar_missing_productive_synthetic_template_component",
            result["blocked_requirements"][0]["blocker_codes"],
        )

    def test_eligible_failure_compiles_sentence_coverage_cell(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.compile_fixture(Path(directory).resolve(), eligible=True)
        self.assertEqual(result["summary"]["counts"]["coverage_cells"], 1)
        self.assertEqual(
            result["summary"]["counts"]["commissioned_sentence_pair_instances"],
            4,
        )
        self.assertEqual(result["summary"]["counts"]["candidate_sentence_pairs"], 0)
        self.assertEqual(result["blocked_requirements"], [])
        cell = result["coverage_cells"][0]
        self.assertEqual(cell["target_independent_instances"], 4)
        self.assertEqual(cell["parent_split"], "train")
        self.assertEqual(cell["derivative_split"], "train")
        self.assertEqual(cell["lexeme_and_sense_family"]["target_lemma"], "baba")
        self.assertEqual(
            cell["failure_requirement_id"],
            result["failure_requirements"][0]["failure_requirement_id"],
        )
        self.assertEqual(cell["synthetic_lexeme_id"], "lexeme-1")
        self.assertEqual(cell["template_id"], "template-1")

    def test_exact_rows_do_not_create_sentence_commissions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            rows = [self.benchmark_row("row-1", "source-1", exact=True)]
            result = self.compile_fixture(root, eligible=True, rows=rows)
        self.assertEqual(result["failure_requirements"], [])
        self.assertEqual(result["coverage_cells"], [])

    def test_final_test_failure_never_authorizes_training_derivative(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.compile_fixture(
                Path(directory).resolve(), eligible=True, sealed=True
            )
        self.assertEqual(result["coverage_cells"], [])
        self.assertIn(
            "final_test_failure_cannot_authorize_training_derivative",
            result["blocked_requirements"][0]["blocker_codes"],
        )

    def test_analysis_confounder_is_partitioned_and_cannot_create_a_cell(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            row = self.benchmark_row("row-1", "source-1", confounded=True)
            result = self.compile_fixture(
                Path(directory).resolve(), eligible=True, rows=[row]
            )
        self.assertEqual(result["coverage_cells"], [])
        self.assertEqual(
            result["summary"]["counts"][
                "analysis_only_confounded_failure_requirements"
            ],
            1,
        )
        self.assertIn(
            "analysis_confounder_cannot_authorize_training_derivative",
            result["blocked_requirements"][0]["blocker_codes"],
        )

    def test_unreviewed_living_book_child_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(
                ValueError, "lacks an analysis-bound review checkpoint"
            ):
                self.compile_fixture(
                    Path(directory).resolve(),
                    eligible=True,
                    with_review_checkpoint=False,
                )

    def test_supplemental_inputs_must_be_supplied_as_a_pair(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            common = {
                "program_root": root,
                "analysis_dir": root / "analysis",
                "census_contract_path": root / "census.json",
                "synthetic_contract_path": root / "synthetic.json",
                "dictionary_current_path": root / "dictionary.json",
                "grammar_current_path": root / "grammar.json",
                "created_at_utc": "2026-07-23T21:00:00Z",
            }
            incomplete_pairs = (
                {"supplemental_analysis_dir": root / "supplemental"},
                {
                    "supplemental_analysis_contract_path": root
                    / "supplemental-contract.json"
                },
            )
            for incomplete in incomplete_pairs:
                with self.subTest(incomplete=incomplete):
                    with self.assertRaisesRegex(
                        ValueError,
                        "supplemental analysis directory and contract must be supplied together",
                    ):
                        MODULE.compile_sentence_commission(**common, **incomplete)

    def test_supplemental_populations_remain_separate_and_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.compile_fixture(
                Path(directory).resolve(),
                eligible=True,
                with_supplemental=True,
            )
        counts = result["summary"]["counts"]
        self.assertEqual(counts["census_rows"], 1)
        self.assertEqual(counts["supplemental_50words_rows"], 2)
        self.assertEqual(counts["total_measured_rows"], 3)
        self.assertEqual(counts["supplemental_50words_failed_benchmark_rows"], 2)
        self.assertEqual(counts["coverage_cells"], 1)
        populations = {
            row["analysis_population"] for row in result["failure_requirements"]
        }
        self.assertEqual(
            populations,
            {"full_lexical_census", "50words_pretraining_supplement"},
        )
        supplemental = [
            row
            for row in result["failure_requirements"]
            if row["analysis_population"] == "50words_pretraining_supplement"
        ]
        self.assertEqual(
            {row["task_family"] for row in supplemental},
            {"lexeme", "fixed_utterance"},
        )
        fixed_requirement = next(
            row for row in supplemental if row["task_family"] == "fixed_utterance"
        )
        fixed_blocked = next(
            row
            for row in result["blocked_requirements"]
            if row["failure_requirement_id"]
            == fixed_requirement["failure_requirement_id"]
        )
        self.assertIn(
            "analysis_status_cannot_authorize_training_derivative",
            fixed_blocked["blocker_codes"],
        )
        self.assertIn(
            "analysis_confounder:attested_fixed_utterance_requires_productive_analysis",
            fixed_blocked["blocker_codes"],
        )
        self.assertIn("supplemental_50words_analysis_id", result["summary"]["bindings"])
        self.assertFalse(result["summary"]["generation_authorized"])

    def test_supplemental_analysis_requires_its_living_book_checkpoint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(
                ValueError, "lacks a supplemental 50 Words failure-review checkpoint"
            ):
                self.compile_fixture(
                    Path(directory).resolve(),
                    eligible=True,
                    with_supplemental=True,
                    with_supplemental_review_checkpoint=False,
                )

    def test_supplemental_review_queue_must_exactly_cover_failures(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            dictionary = self.edition_manifest(
                root, "dictionary", "dictionary-baseline", {}
            )
            grammar = self.edition_manifest(root, "grammar", "grammar-baseline", {})
            analysis, contract_path = self.supplemental_analysis(
                root,
                [self.supplemental_row("supp-lexical", "source-2", "lexeme")],
                dictionary_baseline=dictionary,
                grammar_baseline=grammar,
            )
            self.write_jsonl(analysis / "COVERAGE-REVIEW-QUEUE.jsonl", [])
            paths = sorted(
                path
                for path in analysis.iterdir()
                if path.name != "SHA256SUMS.analysis"
            )
            (analysis / "SHA256SUMS.analysis").write_text(
                "".join(
                    f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
                    for path in paths
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "exactly cover failures"):
                MODULE.verify_supplemental_analysis(
                    analysis, MODULE.read_json(contract_path)
                )

    def test_analysis_hash_drift_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            analysis = self.analysis(root, [self.benchmark_row("row-1", "source-1")])
            (analysis / "FAILURE-JOIN.jsonl").write_text("", encoding="utf-8")
            census, _ = self.contracts(root, 1)
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                MODULE.verify_analysis(analysis, MODULE.read_json(census))

    def test_model_derived_lexeme_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            components = self.dictionary_components(root, eligible=True)
            path = root / components["syntheticLexemes"]["path"]
            row = MODULE.read_jsonl(path)[0]
            row["model_output_is_linguistic_evidence"] = True
            self.write_jsonl(path, [row])
            components["syntheticLexemes"]["sha256"] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
            manifest = self.edition_manifest(
                root, "dictionary", "fixture-dictionary-v1", components
            )
            dictionary = self.current_pointer(root, "dictionary", manifest)
            verified = MODULE.verify_current_edition(root, dictionary, "dictionary")
            with self.assertRaisesRegex(ValueError, "model-derived"):
                MODULE.accepted_synthetic_lexemes(verified)

    def test_requirement_ids_are_input_order_independent(self) -> None:
        rows = [
            self.benchmark_row("row-2", "source-1"),
            self.benchmark_row("row-1", "source-1"),
        ]
        reuse = {"suite-a": "development_consumed"}
        forward = MODULE.build_failure_requirements(rows, reuse)
        reverse = MODULE.build_failure_requirements(list(reversed(rows)), reuse)
        self.assertEqual(forward, reverse)

    def test_development_and_final_failures_are_separate_requirements(self) -> None:
        rows = [
            self.benchmark_row("row-dev", "source-1", suite_key="suite-dev"),
            self.benchmark_row("row-final", "source-1", suite_key="suite-final"),
        ]
        requirements = MODULE.build_failure_requirements(
            rows,
            {
                "suite-dev": "development_consumed",
                "suite-final": "final_test_analysis_only",
            },
        )
        self.assertEqual(len(requirements), 2)
        self.assertEqual(
            {row["benchmark_reuse_status"] for row in requirements},
            {"development_consumed", "final_test_analysis_only"},
        )


if __name__ == "__main__":
    unittest.main()

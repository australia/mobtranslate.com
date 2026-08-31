from __future__ import annotations

import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("analyze_nllb_lexical_census.py")
SPEC = importlib.util.spec_from_file_location(
    "analyze_nllb_lexical_census", MODULE_PATH
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LexicalCensusAnalysisTest(unittest.TestCase):
    def benchmark(self, row_id: str, suite: str, reference: str) -> dict:
        return {
            "rowId": row_id,
            "suiteKey": suite,
            "task": "L1",
            "sourceRecordIds": ["source-1"],
            "sourcePrompt": "woman",
            "inputText": "<lexeme> woman",
            "acceptedReferences": [reference],
            "ambiguityStatus": "single",
            "surfaceFeatures": {"promptTokenCount": 1},
        }

    def prediction(self, row_id: str, value: str, exact: bool) -> dict:
        return {
            "id": row_id,
            "prediction": value,
            "accepted_exact": exact,
            "grapheme_cer": 0.0 if exact else 1.0,
            "target_subword_count": 3,
            "edit_error_type": "exact" if exact else "different_surface_form",
            "source_copy": False,
        }

    def test_dynamic_target_profile_and_inventory_collision(self) -> None:
        benchmarks = [
            self.benchmark("row-1", "context", "jalbu"),
            self.benchmark("row-2", "context", "marnda"),
        ]
        predictions = [
            self.prediction("row-1", "marnda", False),
            self.prediction("row-2", "marnda", True),
        ]
        reference_sets = [MODULE.references(row) for row in benchmarks]
        profile = MODULE.target_profile(reference_sets)
        inventory = {value for values in reference_sets for value in values}
        rows = MODULE.enrich_rows(benchmarks, predictions, profile, inventory)
        self.assertTrue(rows[0]["exact_target_inventory_collision"])
        self.assertFalse(rows[1]["exact_target_inventory_collision"])
        self.assertGreater(rows[0]["target_trigram_coverage"], 0.0)

    def test_source_record_comparison_classifies_context_effect(self) -> None:
        rows = [
            {
                "row_id": "context-row",
                "source_record_ids": ["source-1"],
                "suite_key": "a-context",
                "prediction_normalized": "jalbu",
                "accepted_exact": True,
            },
            {
                "row_id": "prompt-row",
                "source_record_ids": ["source-1"],
                "suite_key": "b-prompt",
                "prediction_normalized": "meri",
                "accepted_exact": False,
            },
        ]
        comparison = MODULE.compare_by_source_record(rows)[0]
        self.assertEqual(comparison["context_effect_class"], "a-context_only_exact")

    def test_enrichment_rejects_incomplete_predictions(self) -> None:
        benchmark = [self.benchmark("row-1", "context", "jalbu")]
        with self.assertRaisesRegex(ValueError, "ID mismatch"):
            MODULE.enrich_rows(benchmark, [], set(), {"jalbu"})

    def test_enrichment_attaches_distinct_lineage_and_input_overlap(self) -> None:
        benchmark = [self.benchmark("row-1", "context", "jalbu")]
        predictions = [self.prediction("row-1", "jalbu", True)]
        lineage = {
            "row-1": {
                "row_id": "row-1",
                "documented_project_training_exposure": (
                    "zero_project_training_exposure_upstream_unknown"
                ),
                "upstream_nllb_pretraining_exposure": "unknown",
                "evaluation_input_contains_reference_surface": False,
                "reference_surfaces_present_in_evaluation_input": [],
                "target_reference_used_to_fit_tokenizer": False,
            }
        }
        rows = MODULE.enrich_rows(benchmark, predictions, set(), {"jalbu"}, lineage)
        self.assertEqual(rows[0]["upstream_nllb_pretraining_exposure"], "unknown")
        self.assertFalse(rows[0]["evaluation_input_contains_reference_surface"])
        self.assertFalse(rows[0]["target_reference_used_to_fit_tokenizer"])

    def test_enrichment_rejects_missing_lineage_row(self) -> None:
        benchmark = [self.benchmark("row-1", "context", "jalbu")]
        predictions = [self.prediction("row-1", "jalbu", True)]
        with self.assertRaisesRegex(ValueError, "lineage audit is missing"):
            MODULE.enrich_rows(benchmark, predictions, set(), {"jalbu"}, {})

    def test_similarity_bucket_preserves_missing_value(self) -> None:
        self.assertEqual(MODULE.similarity_bucket(None), "none")
        self.assertEqual(MODULE.similarity_bucket(0.24), "0.00_to_0.24")
        self.assertEqual(MODULE.similarity_bucket(0.75), "0.75_to_1.00")

    def test_comparative_inventory_is_review_only_and_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            inventory = root / "inventory"
            inventory.mkdir()

            def write_jsonl(name: str, rows: list[dict]) -> dict:
                path = inventory / name
                path.write_text(
                    "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
                    encoding="utf-8",
                )
                return {
                    "path": name,
                    "rows": len(rows),
                    "bytes": path.stat().st_size,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }

            concepts = write_jsonl("concepts.jsonl", [{"id": "concept-1"}])
            forms = write_jsonl("forms.jsonl", [{"id": "form-1"}])
            candidate = {
                "crosswalk_candidate_id": "candidate-1",
                "dictionary_source_record_id": "source-1",
                "dictionary_acceptance": False,
                "benchmark_reference_eligible": False,
                "synthetic_sentence_pair_eligible": False,
                "training_eligible": False,
                "lexical_identity_status": "review_candidate_not_accepted",
                "sense_relation_status": "review_candidate_not_accepted",
                "substitutability_status": "unresolved",
            }
            candidates = write_jsonl("candidates.jsonl", [candidate])
            manifest = {
                "inventory_id": "fixture",
                "components": {
                    "concepts": concepts,
                    "forms": forms,
                    "dictionary_crosswalk_candidates": candidates,
                },
                "counts": {
                    "concepts": 1,
                    "forms": 1,
                    "crosswalk_candidates": 1,
                    "accepted_dictionary_rows": 0,
                    "accepted_grammar_rows": 0,
                    "benchmark_reference_rows": 0,
                    "controlled_synthetic_sentence_pairs_authorized": 0,
                    "training_eligible_rows": 0,
                },
            }
            manifest_path = inventory / "MANIFEST.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            _, _, by_source = MODULE.verify_comparative_lexical_inventory(
                root, manifest_path
            )
            self.assertEqual(list(by_source), ["source-1"])

            candidate["training_eligible"] = True
            manifest["components"]["dictionary_crosswalk_candidates"] = write_jsonl(
                "candidates.jsonl", [candidate]
            )
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "opens forbidden use"):
                MODULE.verify_comparative_lexical_inventory(root, manifest_path)

    def test_orthographic_suffix_clusters_are_dynamic_stable_and_nonlinguistic(
        self,
    ) -> None:
        references = [
            ["bagamanha"],
            ["barrimanha"],
            ["gurlumanha"],
            ["wardamanha"],
            ["ngarrimanha"],
            ["mardumanha"],
            ["jarramanha"],
            ["wirlumanha"],
            ["two words"],
        ]
        forward = MODULE.discover_orthographic_suffix_clusters(references)
        reverse = MODULE.discover_orthographic_suffix_clusters(reversed(references))
        self.assertEqual(forward, reverse)
        self.assertEqual(forward["excluded_multi_token_reference_surfaces"], 1)
        manha = next(
            cluster
            for cluster in forward["clusters"]
            if cluster["terminal_string"] == "manha"
        )
        self.assertEqual(manha["unique_reference_surface_count"], 8)
        self.assertGreaterEqual(manha["unique_preceding_character_count"], 3)
        self.assertIn("not morphemes", manha["claim_limit"])

    def test_enrichment_and_report_attach_orthographic_suffix_strata(self) -> None:
        family_references = [
            ["bagamanha"],
            ["barrimanha"],
            ["gurlumanha"],
            ["wardamanha"],
            ["ngarrimanha"],
            ["mardumanha"],
            ["jarramanha"],
            ["wirlumanha"],
        ]
        families = MODULE.discover_orthographic_suffix_clusters(family_references)
        benchmark = [self.benchmark("row-1", "context", "bagamanha")]
        predictions = [self.prediction("row-1", "baga", False)]
        rows = MODULE.enrich_rows(
            benchmark,
            predictions,
            MODULE.target_profile(family_references),
            {values[0] for values in family_references},
            surface_families=families,
        )
        self.assertIn(
            "suffix:manha", rows[0]["reference_orthographic_suffix_cluster_labels"]
        )
        report = MODULE.build_surface_family_report(rows, families)
        manha = next(row for row in report if row["terminal_string"] == "manha")
        self.assertEqual(manha["benchmark_rows"], 1)
        self.assertEqual(manha["overall"]["accepted_exact_count"], 0)
        self.assertEqual(manha["failure_row_id_sample"], ["row-1"])

    def test_unclustered_reference_is_explicit(self) -> None:
        benchmark = [self.benchmark("row-1", "context", "jalbu")]
        predictions = [self.prediction("row-1", "jalbu", True)]
        rows = MODULE.enrich_rows(
            benchmark,
            predictions,
            MODULE.target_profile([["jalbu"]]),
            {"jalbu"},
            surface_families=MODULE.discover_orthographic_suffix_clusters([["jalbu"]]),
        )
        self.assertEqual(
            rows[0]["reference_primary_orthographic_suffix_cluster_label"],
            "(unclustered)",
        )
        self.assertEqual(
            rows[0]["reference_orthographic_suffix_cluster_labels"],
            ["(unclustered)"],
        )


if __name__ == "__main__":
    unittest.main()

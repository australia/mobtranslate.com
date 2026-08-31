from __future__ import annotations

import hashlib
from pathlib import Path
import tempfile
import unittest


class AnalyzeWajarriStageIFullCensusTest(unittest.TestCase):
    def test_grapheme_alignment_reports_surface_operations(self) -> None:
        from training.translation.analyze_wajarri_stage_i_full_census import (
            closest_reference_alignment,
            deterministic_edit_alignment,
            edit_profile,
            graphemes,
        )

        substitution = deterministic_edit_alignment(
            graphemes("gaba"), graphemes("gaga")
        )
        self.assertEqual(substitution["distance"], 1)
        self.assertEqual(substitution["grapheme_substitutions"], 1)
        self.assertEqual(edit_profile(substitution, blank=False), "substituted")

        missing = deterministic_edit_alignment(graphemes("gal"), graphemes("gala"))
        self.assertEqual(missing["reference_graphemes_missing_from_prediction"], 1)
        self.assertEqual(edit_profile(missing, blank=False), "missing")

        closest = closest_reference_alignment("gaba", ["waga", "gaga"])
        self.assertEqual(closest["closest_normalized_reference"], "gaga")
        self.assertEqual(closest["common_prefix_graphemes"], 2)

    def test_count_and_length_buckets_are_explicit(self) -> None:
        from training.translation.analyze_wajarri_stage_i_full_census import (
            count_bucket,
            length_bucket,
        )

        self.assertEqual(count_bucket(0), "0")
        self.assertEqual(count_bucket(1), "1")
        self.assertEqual(count_bucket(3), "2_to_3")
        self.assertEqual(count_bucket(11), "11_plus")
        self.assertEqual(length_bucket(5), "1_to_5")
        self.assertEqual(length_bucket(17), "17_plus")

    def test_c0_replay_diagnostics_are_mechanical(self) -> None:
        from training.translation.analyze_wajarri_stage_i_full_census import (
            enrich_prediction,
        )

        benchmark = {
            "rowId": "row-1",
            "inputText": "<lexeme> unknown",
            "sourceRecordIds": ["source-1"],
            "acceptedReferences": ["target"],
            "ambiguityStatus": "single",
            "surfaceFeatures": {
                "acceptedReferenceGraphemeCounts": [6],
                "acceptedReferenceTokenCounts": [1],
                "promptTokenCount": 1,
                "promptPunctuation": {"hyphen": False},
                "referencePunctuation": [{"hyphen": False}],
            },
        }
        prediction = {
            "evaluation_id": "suite:row-1",
            "prediction": "seen form",
            "generated_content_token_ids": [1, 2],
            "normalized_exact": False,
            "strict_source_preserved_exact": False,
            "grapheme_cluster_error_rate": 1.0,
            "code_point_character_error_rate": 1.0,
            "surface_class": "different_surface_form",
            "blank_output": False,
            "normalized_source_copy": False,
            "repeated_output_token_4gram": False,
            "source_token_count": 2,
            "prediction_token_count": 2,
            "minimum_reference_token_count": 2,
            "outside_reference_graphemes": ["s", "n"],
        }
        row = enrich_prediction(
            "I0",
            "prompt_group",
            benchmark,
            prediction,
            {
                "primary_exposure_class": "none",
                "direct_matching_training_rows": [],
                "same_prompt_conflicting_training_rows": [],
                "complete_target_output_elsewhere_by_reference": {},
            },
            {"seen form"},
            {"seen", "form"},
            {
                "source-1": {
                    "sourceRecordId": "source-1",
                    "sourceLayer": "current",
                    "partOfSpeech": {"status": "not_provided_by_source"},
                    "structuralFeatures": {},
                    "grouping": {},
                    "evidenceCoverage": {},
                }
            },
            {"clusters_by_surface": {}, "cluster_labels": {}},
        )
        self.assertTrue(row["whole_prediction_is_c0_target"])
        self.assertTrue(row["all_prediction_units_are_c0_units"])
        self.assertIn(
            "whole_prediction_replays_c0_target",
            row["failure_diagnostic_labels"],
        )
        self.assertIn(
            "outside_accepted_reference_grapheme_inventory",
            row["failure_diagnostic_labels"],
        )
        self.assertEqual(
            row["minimum_grapheme_edit_distance"],
            row["reference_graphemes_missing_from_prediction"]
            + row["prediction_graphemes_excess_over_reference"]
            + row["grapheme_substitutions"],
        )
        self.assertEqual(row["source_pos_statuses"], ["not_provided_by_source"])
        self.assertEqual(
            row["reference_orthographic_suffix_cluster_labels"], ["(unclustered)"]
        )

    def test_context_contrast_reports_direction_without_causal_claim(self) -> None:
        from training.translation.analyze_wajarri_stage_i_full_census import (
            build_context_contrasts,
        )

        common = {
            "arm": "I1",
            "source_record_ids": ["source-1"],
            "normalized_exact": False,
            "claim_limit": "fixture",
        }
        contrasts = build_context_contrasts(
            [
                {
                    **common,
                    "suite": "prompt_group",
                    "row_id": "prompt",
                    "normalized_prediction": "xxxx",
                    "grapheme_cluster_error_rate": 1.0,
                },
                {
                    **common,
                    "suite": "source_context",
                    "row_id": "context",
                    "normalized_prediction": "gaxa",
                    "grapheme_cluster_error_rate": 0.25,
                },
            ],
            {
                "source-1": {
                    "sourceRecordId": "source-1",
                    "sourceTargetCandidate": {"source": "gaba"},
                }
            },
        )
        self.assertEqual(contrasts[0]["effect_class"], "context_lower_gcer_nonexact")
        self.assertEqual(contrasts[0]["context_minus_prompt_source_record_gcer"], -0.75)
        self.assertIn("does not prove", contrasts[0]["claim_limit"])

    def test_checksum_inventory_rejects_unlisted_files(self) -> None:
        from training.translation.analyze_wajarri_stage_i_full_census import (
            verify_checksum_inventory,
        )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = root / "payload"
            payload.write_text("value\n", encoding="utf-8")
            digest = hashlib.sha256(payload.read_bytes()).hexdigest()
            (root / "OUTPUT-SHA256SUMS").write_text(
                f"{digest}  payload\n", encoding="utf-8"
            )
            self.assertEqual(verify_checksum_inventory(root)["files"], 1)
            (root / "extra").write_text("drift\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "membership drift"):
                verify_checksum_inventory(root)

    def test_source_profile_summary_uses_only_recorded_categories(self) -> None:
        from training.translation.analyze_wajarri_stage_i_full_census import (
            source_profile_summary,
        )

        summary = source_profile_summary(
            ["source-1"],
            {
                "source-1": {
                    "sourceLayer": "current",
                    "partOfSpeech": {
                        "status": "not_provided_by_source",
                        "comparison": None,
                    },
                    "structuralStratum": "multi_target_prompt_requires_relation_review",
                    "structuralFeatures": {
                        "reduplicationSurfaceCandidate": True,
                        "definitionSegmentCount": 2,
                        "targetLengthBucket": "6-10",
                        "targetTokenBucket": "1",
                        "promptTokenBucket": "2",
                    },
                    "grouping": {
                        "promptDistinctTargetCount": 2,
                        "promptSourceRecordCount": 2,
                        "headwordSourceRecordCount": 1,
                    },
                    "blockerCodes": ["part_of_speech_missing"],
                    "reviewDependencies": {"reviewKinds": ["english_prompt_mapping"]},
                    "evidenceCoverage": {
                        "verifiedAudioLinks": 1,
                        "historicalCrosswalkCandidates": 3,
                    },
                    "trainingEligibility": "not_allowed",
                    "benchmarkDisposition": "diagnostic_candidate_not_frozen",
                }
            },
        )
        self.assertEqual(summary["source_pos_statuses"], ["not_provided_by_source"])
        self.assertEqual(summary["source_pos_labels"], ["(missing)"])
        self.assertTrue(summary["source_reduplication_surface_candidate_any"])
        self.assertEqual(summary["source_prompt_distinct_target_count_max"], 2)
        self.assertEqual(summary["source_historical_crosswalk_candidates_total"], 3)

    def test_orthographic_suffix_clusters_are_surface_only(self) -> None:
        from training.translation.analyze_wajarri_stage_i_full_census import (
            discover_orthographic_suffix_clusters,
        )

        references = [
            [f"{stem}nha"]
            for stem in (
                "bara",
                "biri",
                "buru",
                "gama",
                "giri",
                "guru",
                "jara",
                "juru",
            )
        ]
        result = discover_orthographic_suffix_clusters(references)
        labels = {row["label"] for row in result["clusters"]}
        self.assertIn("suffix:nha", labels)
        self.assertIn("not morphemes", result["contract"]["interpretation"])

    def test_candidate_census_loader_is_hash_and_layer_bound(self) -> None:
        import json

        from training.translation.analyze_wajarri_stage_i_full_census import (
            load_current_source_profiles,
        )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            records = root / "records.jsonl"
            records.write_text(
                "\n".join(
                    json.dumps(row)
                    for row in (
                        {"sourceRecordId": "current-1", "sourceLayer": "current"},
                        {"sourceRecordId": "historical-1", "sourceLayer": "historical"},
                    )
                )
                + "\n",
                encoding="utf-8",
            )
            records_sha = hashlib.sha256(records.read_bytes()).hexdigest()
            manifest = root / "MANIFEST.json"
            manifest.write_text(
                json.dumps(
                    {
                        "census_id": "fixture",
                        "outputs": {
                            "records": {
                                "path": "records.jsonl",
                                "sha256": records_sha,
                                "rows": 2,
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )
            manifest_sha = hashlib.sha256(manifest.read_bytes()).hexdigest()
            profiles, identity = load_current_source_profiles(
                root, manifest, manifest_sha
            )
            self.assertEqual(set(profiles), {"current-1"})
            self.assertEqual(identity["all_records"], 2)
            with self.assertRaisesRegex(ValueError, "manifest hash mismatch"):
                load_current_source_profiles(root, manifest, "0" * 64)

    def test_source_record_outcomes_cover_every_bound_record(self) -> None:
        from training.translation.analyze_wajarri_stage_i_full_census import (
            build_source_record_outcomes,
        )

        profiles = {
            source_id: {
                "sourceRecordId": source_id,
                "sourceRecordSha256": f"hash-{source_id}",
                "sourcePromptCandidate": {"source": source_id},
                "sourceTargetCandidate": {"source": "gaba"},
                "partOfSpeech": {"status": "not_provided_by_source"},
                "structuralFeatures": {},
                "grouping": {},
                "evidenceCoverage": {},
            }
            for source_id in ("source-1", "source-2")
        }

        def row(
            source_id: str,
            prediction: str,
            benchmark_group_exact: bool,
            benchmark_group_gcer: float,
        ) -> dict[str, object]:
            return {
                "source_record_ids": [source_id],
                "normalized_exact": benchmark_group_exact,
                "grapheme_cluster_error_rate": benchmark_group_gcer,
                "minimum_reference_subword_count": 2,
                "prediction_population_count_within_arm": 1,
                "whole_prediction_is_c0_target": False,
                "all_prediction_units_are_c0_units": False,
                "arm": "I0",
                "suite": "prompt_group",
                "row_id": f"row-{source_id}",
                "normalized_prediction": prediction,
                "accepted_references": ["gaba", "gaxa"],
                "failure_diagnostic_labels": (
                    [] if benchmark_group_exact else ["surface_failure"]
                ),
            }

        outcomes = build_source_record_outcomes(
            profiles,
            [
                row("source-1", "gaba", True, 0.0),
                row("source-2", "gaxa", True, 0.0),
            ],
            [],
            [],
        )
        self.assertEqual({item["source_record_id"] for item in outcomes}, set(profiles))
        by_source = {item["source_record_id"]: item for item in outcomes}
        self.assertEqual(
            by_source["source-1"]["review_priority_band"], "06_stable_exact"
        )
        self.assertEqual(
            by_source["source-2"]["review_priority_band"],
            "02_near_surface_failure",
        )
        self.assertIn("near_surface_failure", by_source["source-2"]["review_reasons"])
        self.assertTrue(by_source["source-2"]["benchmark_group_any_exact"])
        self.assertFalse(by_source["source-2"]["source_record_any_exact"])
        self.assertIn(
            "benchmark_group_match_without_source_record_match",
            by_source["source-2"]["review_reasons"],
        )

    def test_main_emits_complete_source_bound_analysis(self) -> None:
        import json
        from unittest.mock import patch

        from training.translation.analyze_wajarri_stage_i_full_census import main

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            program = root / "program"
            run = root / "run"
            output = root / "analysis"
            program.mkdir()
            run.mkdir()

            def write_json(path: Path, value: object) -> str:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(
                    json.dumps(value, sort_keys=True) + "\n", encoding="utf-8"
                )
                return hashlib.sha256(path.read_bytes()).hexdigest()

            def write_jsonl(path: Path, rows: list[dict[str, object]]) -> str:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(
                    "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
                    encoding="utf-8",
                )
                return hashlib.sha256(path.read_bytes()).hexdigest()

            benchmark_common = {
                "acceptedReferences": ["gaba"],
                "ambiguityStatus": "single",
                "sourceRecordIds": ["source-1"],
                "surfaceFeatures": {
                    "acceptedReferenceGraphemeCounts": [4],
                    "acceptedReferenceTokenCounts": [1],
                    "promptTokenCount": 1,
                    "promptPunctuation": {"hyphen": False},
                    "referencePunctuation": [{"hyphen": False}],
                },
            }
            prompt_row = {
                **benchmark_common,
                "rowId": "prompt-row",
                "inputText": "<lexeme> good",
                "sourcePromptValues": ["good"],
                "analysisJoin": {"structuralStrata": ["one_to_one"]},
            }
            context_row = {
                **benchmark_common,
                "rowId": "context-row",
                "inputText": "<lexeme> good\nDefinition: good",
                "sourcePrompt": "good",
                "sourceDefinition": "good",
                "analysisJoin": {"structuralStrata": ["one_to_one"]},
            }
            prompt_path = program / "prompt.jsonl"
            context_path = program / "context.jsonl"
            prompt_sha = write_jsonl(prompt_path, [prompt_row])
            context_sha = write_jsonl(context_path, [context_row])

            exposure_path = program / "exposure.jsonl"
            exposure_rows = [
                {
                    "benchmark_row_id": row_id,
                    "population": "C0",
                    "primary_exposure_class": "direct",
                    "direct_matching_training_rows": ["c0-1"],
                    "same_prompt_conflicting_training_rows": [],
                    "complete_target_output_elsewhere_by_reference": {},
                }
                for row_id in ("prompt-row", "context-row")
            ]
            exposure_sha = write_jsonl(exposure_path, exposure_rows)
            schedule_path = program / "schedule.jsonl"
            schedule_sha = write_jsonl(
                schedule_path, [{"input_text": "<lexeme> good", "output_text": "gaba"}]
            )
            matrix_path = program / "matrix.json"
            matrix_sha = write_json(
                matrix_path,
                {
                    "arms": {
                        "I0": {
                            "schedule_file": "schedule.jsonl",
                            "schedule_sha256": schedule_sha,
                        }
                    }
                },
            )
            contract = {
                "evaluation": {"required_rows": 2},
                "suites": [
                    {
                        "name": "source_context",
                        "path": "context.jsonl",
                        "sha256": context_sha,
                        "rows": 1,
                    },
                    {
                        "name": "prompt_group",
                        "path": "prompt.jsonl",
                        "sha256": prompt_sha,
                        "rows": 1,
                    },
                ],
                "exposure_ledger": {
                    "path": "exposure.jsonl",
                    "sha256": exposure_sha,
                    "population": "C0",
                },
                "parent_matrix": {"path": "matrix.json", "sha256": matrix_sha},
            }
            contract_path = program / "contract.json"
            write_json(contract_path, contract)
            (run / "CONTRACT.json").write_bytes(contract_path.read_bytes())
            write_json(run / "RUN-COMPLETE.json", {"status": "PASS"})
            write_json(
                run / "RESULT.json",
                {
                    "status": "PASS_COMPLETE_LOCAL_STAGE_I_CENSUS",
                    "selection": {"selected_arm": "I0"},
                },
            )

            candidate_records = program / "candidate-records.jsonl"
            candidate_sha = write_jsonl(
                candidate_records,
                [
                    {
                        "sourceRecordId": "source-1",
                        "sourceRecordSha256": "source-hash",
                        "sourceLayer": "current",
                        "sourcePromptCandidate": {"source": "good"},
                        "sourceTargetCandidate": {"source": "gaba"},
                        "partOfSpeech": {"status": "not_provided_by_source"},
                        "structuralStratum": "one_to_one",
                        "structuralFeatures": {
                            "targetLengthBucket": "1-5",
                            "targetTokenBucket": "1",
                            "promptTokenBucket": "1",
                        },
                        "grouping": {
                            "headwordSourceRecordCount": 1,
                            "promptSourceRecordCount": 1,
                            "promptDistinctTargetCount": 1,
                        },
                        "evidenceCoverage": {},
                    }
                ],
            )
            candidate_manifest = program / "candidate-manifest.json"
            candidate_manifest_sha = write_json(
                candidate_manifest,
                {
                    "census_id": "fixture-census",
                    "outputs": {
                        "records": {
                            "path": "candidate-records.jsonl",
                            "sha256": candidate_sha,
                            "rows": 1,
                        }
                    },
                },
            )

            prediction_template = {
                "prediction": "gaba",
                "generated_content_token_ids": [1],
                "normalized_exact": True,
                "strict_source_preserved_exact": True,
                "grapheme_cluster_error_rate": 0.0,
                "code_point_character_error_rate": 0.0,
                "surface_class": "accepted_exact",
                "blank_output": False,
                "normalized_source_copy": False,
                "repeated_output_token_4gram": False,
                "source_token_count": 2,
                "prediction_token_count": 1,
                "minimum_reference_token_count": 1,
                "outside_reference_graphemes": [],
            }
            for arm in ("I0", "I1", "I2"):
                predictions = [
                    {
                        **prediction_template,
                        "row_id": row_id,
                        "evaluation_id": f"{arm}:{row_id}",
                    }
                    for row_id in ("prompt-row", "context-row")
                ]
                write_jsonl(
                    run / "arms" / arm / "step-400" / "PREDICTIONS.jsonl",
                    predictions,
                )

            listed = []
            for path in sorted(path for path in run.rglob("*") if path.is_file()):
                listed.append(
                    f"{hashlib.sha256(path.read_bytes()).hexdigest()}  "
                    f"{path.relative_to(run)}\n"
                )
            (run / "OUTPUT-SHA256SUMS").write_text("".join(listed), encoding="utf-8")

            argv = [
                "analyze",
                "--contract",
                str(contract_path),
                "--program-root",
                str(program),
                "--run-root",
                str(run),
                "--output-dir",
                str(output),
                "--lexical-census-manifest",
                str(candidate_manifest),
                "--lexical-census-manifest-sha256",
                candidate_manifest_sha,
            ]
            with patch("sys.argv", argv):
                main()

            expected = {
                "SUMMARY.json",
                "SOURCE-RECORD-OUTCOMES.jsonl",
                "QUALITATIVE-REVIEW-QUEUE.jsonl",
                "HYPOTHESIS-MATRIX.json",
                "ORTHOGRAPHIC-SURFACE-FAMILIES.jsonl",
                "OUTPUT-SHA256SUMS",
            }
            self.assertTrue(expected <= {path.name for path in output.iterdir()})
            outcomes = [
                json.loads(line)
                for line in (output / "SOURCE-RECORD-OUTCOMES.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            self.assertEqual(len(outcomes), 1)
            self.assertEqual(outcomes[0]["source_record_id"], "source-1")
            hypotheses = json.loads(
                (output / "HYPOTHESIS-MATRIX.json").read_text(encoding="utf-8")
            )
            pos_hypothesis = next(
                row
                for row in hypotheses["hypotheses"]
                if row["hypothesis_id"] == "H7_source_part_of_speech"
            )
            self.assertFalse(pos_hypothesis["testable"])


if __name__ == "__main__":
    unittest.main()

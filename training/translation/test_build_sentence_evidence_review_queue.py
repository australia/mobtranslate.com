import json
from pathlib import Path
import subprocess
import sys


SCRIPT = Path(__file__).with_name("build_sentence_evidence_review_queue.py")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def test_builds_fail_closed_review_queue(tmp_path: Path) -> None:
    census = tmp_path / "census.jsonl"
    contexts = tmp_path / "contexts.jsonl"
    analysis = tmp_path / "analysis.jsonl"
    overlaps = tmp_path / "overlaps.jsonl"
    output = tmp_path / "queue.jsonl"
    summary = tmp_path / "summary.json"

    write_jsonl(
        census,
        [
            {
                "id": "row-a",
                "unconditioned_input_text": "ear",
                "accepted_references": ["milka"],
                "curated_dictionary": {
                    "ambiguous_surface_prompt": False,
                    "identity_translation": False,
                    "entry_records": [
                        {"word": "milka", "type": "noun", "semantic_domain": "body"}
                    ],
                },
            },
            {
                "id": "row-b",
                "unconditioned_input_text": "Ivy (name)",
                "accepted_references": ["aybi"],
                "curated_dictionary": {
                    "ambiguous_surface_prompt": False,
                    "identity_translation": False,
                    "entry_records": [
                        {
                            "word": "aybi",
                            "type": "noun",
                            "semantic_domain": "personal-name",
                        }
                    ],
                },
            },
        ],
    )
    write_jsonl(
        contexts,
        [
            {
                "normalized_headword": "milka",
                "semantic_domains": ["body"],
                "context_evidence": {
                    "synthetic_explicit_rows": 1,
                    "synthetic_surface_rows": 1,
                    "usage_rows": 1,
                    "usage_verified_rows": 0,
                    "usage_unverified_rows": 1,
                    "xigt_source_backed_rows": 1,
                    "xigt_source_backed_clause_rows": 1,
                },
                "coverage_flags": {"has_any_identified_context": True},
            },
            {
                "normalized_headword": "aybi",
                "semantic_domains": ["personal-name"],
                "context_evidence": {},
                "coverage_flags": {"has_any_identified_context": False},
            },
        ],
    )
    diagnostic_rows = []
    for row_id, accepted in (("row-a", "milka"), ("row-b", "aybi")):
        for candidate, prediction in (
            ("B0", "wrong"),
            ("C0", accepted if row_id == "row-a" else "wrong"),
        ):
            exact = prediction == accepted
            diagnostic_rows.append(
                {
                    "id": row_id,
                    "candidate": candidate,
                    "prediction": prediction,
                    "analysis": {"exact_accepted": exact},
                    "error_category": "accepted_exact" if exact else "other",
                    "minimum_grapheme_error_rate": 0 if exact else 1,
                    "token_counts": {"target_subwords": 2},
                    "documented_v21_2_target_occurrences": 0,
                }
            )
    write_jsonl(analysis, diagnostic_rows)
    write_jsonl(
        overlaps,
        [
            {
                "prompt": "ear",
                "relation": "skeleton_prefix_relation",
                "grammar_extraction": {"accepted_references": ["milka-ji"]},
                "matching_pairs": [["milka-ji", "milka"]],
            }
        ],
    )

    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--curated-census",
            str(census),
            "--context-inventory",
            str(contexts),
            "--curated-row-analysis",
            str(analysis),
            "--overlap-rows",
            str(overlaps),
            "--expected-candidate",
            "B0",
            "--expected-candidate",
            "C0",
            "--output",
            str(output),
            "--summary-output",
            str(summary),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0
    rows = [
        json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()
    ]
    assert rows[0]["exact_reconstruction_labels"] == ["C0"]
    assert rows[0]["review_flags"]["cross_resource_review_required"] is True
    assert "validate_existing_source_backed_xigt_context" in rows[0]["workflow_actions"]
    assert (
        "consider_new_fluent_speaker_sentence_after_adjudication"
        not in rows[0]["workflow_actions"]
    )
    assert rows[1]["new_sentence_requirement"] == "undetermined_pending_human_review"
    assert (
        "consider_new_fluent_speaker_sentence_after_adjudication"
        in rows[1]["workflow_actions"]
    )
    payload = json.loads(summary.read_text(encoding="utf-8"))
    assert payload["headword_context_counts"] == {
        "zero_context_other_domains_pre_review": 0,
        "zero_context_name_domains": 1,
        "zero_identified_context": 1,
    }
    assert payload["accepted_exact_by_candidate"] == {"B0": 0, "C0": 1}
    assert payload["reconstruction_by_context_evidence"]["C0"] == {
        "some_identified_context": {"accepted_exact": 1, "rows": 1},
        "zero_identified_context": {"accepted_exact": 0, "rows": 1},
    }


def test_rejects_incomplete_candidate_matrix(tmp_path: Path) -> None:
    census = tmp_path / "census.jsonl"
    contexts = tmp_path / "contexts.jsonl"
    analysis = tmp_path / "analysis.jsonl"
    overlaps = tmp_path / "overlaps.jsonl"
    write_jsonl(
        census,
        [
            {
                "id": "row-a",
                "unconditioned_input_text": "ear",
                "accepted_references": ["milka"],
                "curated_dictionary": {"entry_records": []},
            }
        ],
    )
    write_jsonl(
        contexts,
        [
            {
                "normalized_headword": "milka",
                "context_evidence": {},
                "coverage_flags": {"has_any_identified_context": False},
            }
        ],
    )
    write_jsonl(
        analysis,
        [
            {
                "id": "row-a",
                "candidate": "B0",
                "prediction": "milka",
                "analysis": {"exact_accepted": True},
            }
        ],
    )
    write_jsonl(overlaps, [])
    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--curated-census",
            str(census),
            "--context-inventory",
            str(contexts),
            "--curated-row-analysis",
            str(analysis),
            "--overlap-rows",
            str(overlaps),
            "--expected-candidate",
            "B0",
            "--expected-candidate",
            "C0",
            "--output",
            str(tmp_path / "queue.jsonl"),
            "--summary-output",
            str(tmp_path / "summary.json"),
        ],
        capture_output=True,
        text=True,
    )
    assert completed.returncode != 0
    assert "candidate set mismatch" in completed.stderr

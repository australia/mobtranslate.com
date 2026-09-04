import sqlite3

from prepare_kuku_yalanji_reviewed_finetune import (
    PRIMARY_REVIEW_LENSES,
    intersections,
    review_exclusion_reasons,
)


def sentence() -> dict[str, object]:
    return {
        "id": 1,
        "status": "accepted",
        "rights_status": "project_approved_synthetic_pending_elder_verification",
    }


def review(review_id: int, lens: str, verdict: str, round_number: int = 1) -> dict:
    return {
        "id": review_id,
        "sentence_id": 1,
        "round": round_number,
        "lens": lens,
        "verdict": verdict,
        "reviewer": "automated-test-reviewer",
        "created_at": "2026-09-04T00:00:00Z",
    }


def passing_reviews() -> dict[str, dict]:
    return {
        lens: review(index, lens, "pass")
        for index, lens in enumerate(PRIMARY_REVIEW_LENSES, 1)
    }


def test_requires_all_primary_latest_reviews_to_pass() -> None:
    reviews = passing_reviews()
    assert review_exclusion_reasons(sentence(), reviews) == []

    reviews["morphology"] = review(20, "morphology", "revised", 2)
    assert review_exclusion_reasons(sentence(), reviews) == [
        "primary_review_revised:morphology"
    ]

    reviews = passing_reviews()
    del reviews["syntax"]
    assert review_exclusion_reasons(sentence(), reviews) == [
        "primary_review_missing:syntax"
    ]


def test_adverse_auxiliary_review_fails_closed() -> None:
    reviews = passing_reviews()
    reviews["morphology(inf)"] = review(30, "morphology(inf)", "issue")
    assert review_exclusion_reasons(sentence(), reviews) == [
        "auxiliary_review_issue:morphology(inf)"
    ]

    reviews["morphology(inf)"] = review(31, "morphology(inf)", "pass", 2)
    assert review_exclusion_reasons(sentence(), reviews) == []


def test_rejects_non_training_rights_state() -> None:
    candidate = sentence()
    candidate["rights_status"] = "unknown"
    assert review_exclusion_reasons(candidate, passing_reviews()) == [
        "rights_status:unknown"
    ]


def test_intersections_report_source_target_and_pair_collisions() -> None:
    first = [
        {
            "unconditioned_input_text": "The woman saw water.",
            "output_text": "target one",
        },
        {"unconditioned_input_text": "A second row", "output_text": "target two"},
    ]
    second = [
        {
            "unconditioned_input_text": "the  woman saw water.",
            "output_text": "TARGET ONE",
        },
        {"unconditioned_input_text": "Different", "output_text": "target two"},
    ]
    assert intersections(first, second) == {"source": 1, "target_surface": 2, "pair": 1}


def test_sqlite_available_for_fixture_based_followups() -> None:
    connection = sqlite3.connect(":memory:")
    assert connection.execute("SELECT 1").fetchone() == (1,)
    connection.close()

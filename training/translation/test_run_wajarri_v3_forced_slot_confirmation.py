from __future__ import annotations

from training.translation.run_wajarri_v3_forced_slot_confirmation import (
    checkpoint_rank,
    choose_checkpoint,
    full_guard_gates,
    route_gates,
    route_metrics,
    seed_diversity_gates,
    trainer_seed_gates,
)


def endpoint(rows: int, exact: int, faults: int = 0) -> dict:
    return {
        "rows": rows,
        "raw_exact": exact,
        "slot_rendered_exact": exact,
        "slot_count_valid": exact,
        "slot_position_valid": exact,
        "predicate_present": exact,
        "mean_chrf2": 100.0 if exact == rows else 50.0,
        "faults": {
            "blank": faults,
            "source_copy": 0,
            "repeated_token_4gram": 0,
            "unresolved_bracket": 0,
            "unresolved_slot": 0,
        },
    }


def summary(comp: int, held: int, faults: int = 0) -> dict:
    return {
        "evaluated_rows": 35,
        "metrics": {
            "by_endpoint": {
                "slot_composition_masked": endpoint(11, comp, faults),
                "slot_held_masked": endpoint(24, held),
            }
        },
    }


def test_route_gate_requires_every_rendered_row_and_zero_faults() -> None:
    passing = summary(11, 24)
    assert route_metrics(passing)["rendered_exact"] == 35
    assert all(route_gates(passing, 35).values())
    assert not all(route_gates(summary(11, 24, faults=1), 35).values())
    assert not all(route_gates(summary(10, 24), 35).values())


def test_checkpoint_selector_prefers_earliest_complete_checkpoint() -> None:
    candidates = [
        {"step": 20, "development": summary(10, 24)},
        {"step": 40, "development": summary(11, 24)},
        {"step": 80, "development": summary(11, 24)},
    ]
    assert choose_checkpoint(candidates, 35)["step"] == 40
    assert checkpoint_rank(summary(11, 24), 35, 40) > checkpoint_rank(
        summary(10, 24), 35, 20
    )


def test_full_guards_are_noninferiority_not_equality() -> None:
    baseline = {
        "suites": {
            "retention": {"exact": 54},
            "synthetic_holdout": {"exact": 23, "mean_chrf2": 75.0},
        }
    }
    candidate = {
        "faults": {"unresolved_task_token": 0},
        "suites": {
            "retention": {"exact": 55},
            "synthetic_holdout": {"exact": 21, "mean_chrf2": 74.0},
        },
    }
    gates = {
        "maximum_synthetic_exact_count_loss": 2,
        "maximum_synthetic_chrf2_loss": 2.0,
    }
    assert all(full_guard_gates(candidate, baseline, gates).values())


def test_seed_contract_and_distinct_weights_are_confirmation_gates() -> None:
    snapshot = {
        "binding": {
            "optimization": {
                "trainer_seed": 17,
                "trainer_data_seed": 17,
            }
        }
    }
    assert all(trainer_seed_gates(snapshot, 17).values())
    assert not all(trainer_seed_gates(snapshot, 42).values())

    distinct = {
        "17": {"adapter_weight_sha256": "a"},
        "42": {"adapter_weight_sha256": "b"},
        "73": {"adapter_weight_sha256": "c"},
    }
    repeated = {
        **distinct,
        "73": {"adapter_weight_sha256": "a"},
    }
    assert all(seed_diversity_gates(distinct).values())
    assert not all(seed_diversity_gates(repeated).values())

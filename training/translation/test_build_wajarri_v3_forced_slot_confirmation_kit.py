from training.translation.build_wajarri_v3_forced_slot_confirmation_kit import (
    endpoint_census,
)


def test_endpoint_census_keeps_route_conditions_separate() -> None:
    rows = [
        {"evaluation_endpoint": "slot_composition_masked"},
        {"evaluation_endpoint": "slot_held_masked"},
        {"evaluation_endpoint": "slot_held_masked"},
        {"evaluation_endpoint": "slot_held_declared"},
    ]
    assert endpoint_census(rows) == {
        "slot_composition_masked": 1,
        "slot_held_declared": 1,
        "slot_held_masked": 2,
    }

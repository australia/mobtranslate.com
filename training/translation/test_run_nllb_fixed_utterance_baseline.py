from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from run_nllb_fixed_utterance_baseline import ContractError, verify_host_gate


POLICY = {
    "minimum_mem_available_bytes": 12_884_901_888,
    "maximum_load_1m": 4.0,
    "maximum_load_5m": 4.0,
    "minimum_sample_interval_seconds": 300,
}


def sample(at: datetime, **overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "sampled_at_utc": at.isoformat().replace("+00:00", "Z"),
        "mem_available_bytes": 13_000_000_000,
        "load_1m": 3.0,
        "load_5m": 3.5,
        "heavy_competing_job": False,
    }
    value.update(overrides)
    return value


def passing_report() -> dict[str, object]:
    first = datetime(2026, 7, 24, 5, 0, tzinfo=timezone.utc)
    return {"samples": [sample(first), sample(first + timedelta(seconds=300))]}


def test_accepts_two_passing_samples() -> None:
    selected = verify_host_gate(passing_report(), POLICY)
    assert len(selected) == 2


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"mem_available_bytes": 12_000_000_000}, "memory"),
        ({"load_1m": 4.1}, "load"),
        ({"load_5m": 4.1}, "load"),
        ({"heavy_competing_job": True}, "heavy_competing_job=false"),
    ],
)
def test_rejects_a_failing_sample(override: dict[str, object], message: str) -> None:
    report = passing_report()
    report["samples"][1].update(override)
    with pytest.raises(ContractError, match=message):
        verify_host_gate(report, POLICY)


def test_rejects_samples_less_than_five_minutes_apart() -> None:
    first = datetime(2026, 7, 24, 5, 0, tzinfo=timezone.utc)
    report = {"samples": [sample(first), sample(first + timedelta(seconds=299))]}
    with pytest.raises(ContractError, match="interval"):
        verify_host_gate(report, POLICY)


def test_requires_two_samples() -> None:
    first = datetime(2026, 7, 24, 5, 0, tzinfo=timezone.utc)
    with pytest.raises(ContractError, match="at least two"):
        verify_host_gate({"samples": [sample(first)]}, POLICY)

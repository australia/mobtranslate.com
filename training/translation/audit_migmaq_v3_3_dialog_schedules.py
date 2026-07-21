#!/usr/bin/env python3
"""Audit the paired Mi'kmaq v3.3 dialog-only training schedules."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any, Iterable


ARMS = ("retention", "dialog20", "dialog40")
EXPECTED_PRESENTATIONS = 19_200
EXPECTED_CHANGED = {"dialog20": 3_840, "dialog40": 7_680}
EXPECTED_DIALOG_ROWS = 449


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--expected-manifest-sha256", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"non-object at {path}:{line_number}")
            rows.append(value)
    return rows


def verify_release_checksums(dataset_dir: Path) -> dict[str, Any]:
    checksum_path = dataset_dir / "SHA256SUMS"
    files = 0
    for line_number, line in enumerate(
        checksum_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            expected, relative = line.split("  ", 1)
        except ValueError as error:
            raise ValueError(
                f"invalid checksum line {checksum_path}:{line_number}"
            ) from error
        path = dataset_dir / relative.removeprefix("./")
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"release checksum failed: {path}")
        files += 1
    return {
        "sha256sums_sha256": sha256(checksum_path),
        "verified_files": files,
    }


def index_schedule(
    rows: Iterable[dict[str, Any]], arm: str
) -> dict[int, dict[str, Any]]:
    indexed: dict[int, dict[str, Any]] = {}
    ids: set[str] = set()
    for row in rows:
        position = int(row["schedule_position"])
        row_id = str(row["id"])
        if position in indexed or row_id in ids:
            raise ValueError(f"duplicate schedule position or ID in {arm}")
        if row.get("schedule_arm") != arm:
            raise ValueError(f"schedule-arm mismatch at {arm}:{position}")
        indexed[position] = row
        ids.add(row_id)
    if set(indexed) != set(range(EXPECTED_PRESENTATIONS)):
        raise ValueError(f"{arm} does not contain exactly the expected positions")
    return indexed


def audit_schedules(schedules: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    if set(schedules) != set(ARMS):
        raise ValueError(f"expected schedules {ARMS}, observed {sorted(schedules)}")
    indexed = {arm: index_schedule(schedules[arm], arm) for arm in ARMS}
    retention = indexed["retention"]
    if any(bool(row.get("natural_dialog_intervention")) for row in retention.values()):
        raise ValueError("retention schedule contains intervention rows")
    if any(
        row.get("source_origin") != "migmaq_online_dictionary_example"
        for row in retention.values()
    ):
        raise ValueError("retention schedule contains a non-retention origin")

    treatment_positions: dict[str, set[int]] = {}
    arm_audits: dict[str, Any] = {}
    for arm in ("dialog20", "dialog40"):
        rows = indexed[arm]
        if any(
            rows[position]["id"] != retention[position]["id"] for position in retention
        ):
            raise ValueError(f"position IDs differ between retention and {arm}")
        changed = {
            position
            for position, row in rows.items()
            if bool(row.get("natural_dialog_intervention"))
        }
        if len(changed) != EXPECTED_CHANGED[arm]:
            raise ValueError(f"{arm} intervention count changed: {len(changed)}")
        treatment_positions[arm] = changed
        frequencies: Counter[str] = Counter()
        lesson_counts: Counter[str] = Counter()
        for position, row in rows.items():
            control = retention[position]
            is_treatment = position in changed
            if row.get("control_source_id") != control.get("schedule_source_id"):
                raise ValueError(f"control source mismatch at {arm}:{position}")
            if is_treatment:
                if row.get("source_origin") != "listuguj_lessons_dialog":
                    raise ValueError(f"non-dialog intervention at {arm}:{position}")
                if row.get("intervention_scope") != "listuguj_dialog_only":
                    raise ValueError(f"intervention scope mismatch at {arm}:{position}")
                source_id = str(row["schedule_source_id"])
                frequencies[source_id] += 1
                lesson_counts[str(row["lesson_id"])] += 1
            else:
                for field in ("schedule_source_id", "input_text", "output_text"):
                    if row.get(field) != control.get(field):
                        raise ValueError(
                            f"unreplaced field differs at {arm}:{position}:{field}"
                        )
        if len(frequencies) != EXPECTED_DIALOG_ROWS:
            raise ValueError(f"{arm} exposes {len(frequencies)} dialog rows")
        arm_audits[arm] = {
            "intervention_presentations": len(changed),
            "retention_presentations": EXPECTED_PRESENTATIONS - len(changed),
            "unique_dialog_rows": len(frequencies),
            "presentations_per_dialog_row": {
                "minimum": min(frequencies.values()),
                "maximum": max(frequencies.values()),
                "distribution": dict(sorted(Counter(frequencies.values()).items())),
            },
            "unique_lessons": len(lesson_counts),
        }

    if not treatment_positions["dialog20"].issubset(treatment_positions["dialog40"]):
        raise ValueError("dialog20 intervention positions are not nested in dialog40")
    for position in treatment_positions["dialog20"]:
        low = indexed["dialog20"][position]
        high = indexed["dialog40"][position]
        for field in ("schedule_source_id", "input_text", "output_text"):
            if low.get(field) != high.get(field):
                raise ValueError(
                    f"nested treatment differs at position {position}:{field}"
                )

    return {
        "positions": EXPECTED_PRESENTATIONS,
        "identical_position_ids": True,
        "dialog20_is_nested_within_dialog40": True,
        "shared_nested_treatments_identical": True,
        "retention_origin_only": True,
        "arms": arm_audits,
    }


def write_json_atomic(path: Path, value: Any) -> None:
    if path.exists():
        raise FileExistsError(path)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    dataset_dir = args.dataset_dir.expanduser().resolve()
    manifest_path = dataset_dir / "manifest.json"
    if sha256(manifest_path) != args.expected_manifest_sha256:
        raise ValueError("dataset manifest hash mismatch")
    release_audit = verify_release_checksums(dataset_dir)
    manifest = read_json(manifest_path)
    schedules = {
        arm: read_jsonl(dataset_dir / "schedules" / f"{arm}-screen-600.eng-mic.jsonl")
        for arm in ARMS
    }
    schedule_audit = audit_schedules(schedules)
    expected = manifest["token_accounting"]["schedule_audit"]["pairing"]
    if (
        expected["retention_to_dialog20_changed_positions"]
        != EXPECTED_CHANGED["dialog20"]
    ):
        raise ValueError("manifest dialog20 replacement count changed")
    if (
        expected["retention_to_dialog40_changed_positions"]
        != EXPECTED_CHANGED["dialog40"]
    ):
        raise ValueError("manifest dialog40 replacement count changed")
    if not expected["dialog20_is_nested_within_dialog40"]:
        raise ValueError("manifest does not assert nested treatment positions")

    report = {
        "schema_version": 1,
        "analysis_kind": "migmaq_v3_3_dialog_schedule_preflight",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "id": manifest["dataset_id"],
            "manifest_sha256": args.expected_manifest_sha256,
            **release_audit,
        },
        "schedule_audit": schedule_audit,
        "sealed_test_read": False,
        "result": "pass",
    }
    output = args.output_dir.expanduser().resolve()
    if output.exists():
        raise FileExistsError(output)
    output.mkdir(parents=True)
    write_json_atomic(output / "schedule-preflight.json", report)
    report_path = output / "schedule-preflight.json"
    (output / "SHA256SUMS").write_text(
        f"{sha256(report_path)}  {report_path.name}\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

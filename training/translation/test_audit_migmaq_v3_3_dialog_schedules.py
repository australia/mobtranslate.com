from __future__ import annotations

import unittest
from unittest import mock

import audit_migmaq_v3_3_dialog_schedules as audit


def make_schedules() -> dict[str, list[dict[str, object]]]:
    retention: list[dict[str, object]] = []
    dialog20: list[dict[str, object]] = []
    dialog40: list[dict[str, object]] = []
    for position in range(20):
        base = {
            "id": f"position-{position}",
            "schedule_position": position,
            "schedule_source_id": f"retention-{position}",
            "control_source_id": f"retention-{position}",
            "input_text": f"source {position}",
            "output_text": f"target {position}",
            "source_origin": "migmaq_online_dictionary_example",
            "natural_dialog_intervention": False,
            "intervention_scope": "listuguj_dialog_only",
        }
        retention.append({**base, "schedule_arm": "retention"})
        for arm, changed in (("dialog20", position < 4), ("dialog40", position < 8)):
            row = {**base, "schedule_arm": arm}
            if changed:
                row.update(
                    {
                        "schedule_source_id": f"dialog-{position % 2}",
                        "input_text": f"dialog source {position % 2}",
                        "output_text": f"dialog target {position % 2}",
                        "source_origin": "listuguj_lessons_dialog",
                        "natural_dialog_intervention": True,
                        "lesson_id": f"lesson-{position % 2}",
                    }
                )
            (dialog20 if arm == "dialog20" else dialog40).append(row)
    return {"retention": retention, "dialog20": dialog20, "dialog40": dialog40}


class DialogScheduleAuditTests(unittest.TestCase):
    def test_audit_accepts_nested_paired_schedules(self) -> None:
        with (
            mock.patch.object(audit, "EXPECTED_PRESENTATIONS", 20),
            mock.patch.object(
                audit, "EXPECTED_CHANGED", {"dialog20": 4, "dialog40": 8}
            ),
            mock.patch.object(audit, "EXPECTED_DIALOG_ROWS", 2),
        ):
            observed = audit.audit_schedules(make_schedules())
        self.assertTrue(observed["dialog20_is_nested_within_dialog40"])
        self.assertEqual(observed["arms"]["dialog20"]["unique_dialog_rows"], 2)
        self.assertEqual(
            observed["arms"]["dialog40"]["presentations_per_dialog_row"]["minimum"], 4
        )

    def test_audit_rejects_non_dialog_treatment(self) -> None:
        schedules = make_schedules()
        schedules["dialog20"][0]["source_origin"] = "listuguj_lessons_vocab"
        with (
            mock.patch.object(audit, "EXPECTED_PRESENTATIONS", 20),
            mock.patch.object(
                audit, "EXPECTED_CHANGED", {"dialog20": 4, "dialog40": 8}
            ),
            mock.patch.object(audit, "EXPECTED_DIALOG_ROWS", 2),
            self.assertRaisesRegex(ValueError, "non-dialog intervention"),
        ):
            audit.audit_schedules(schedules)


if __name__ == "__main__":
    unittest.main()

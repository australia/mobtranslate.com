import unittest
from unittest.mock import patch

from training.translation.build_wajarri_v3_task_separated_schedules import (
    build_schedule,
    derive_glossary_schedule,
    parse_two_slot_source,
    stable_cycle,
    target_slots,
    validate_accounting_profiles,
    validate_target_exposure_pairing,
    verify_software_contract,
)


def row(row_id: str, task: str = "translate", population: str = "test") -> dict:
    return {
        "id": row_id,
        "source_row_id": row_id,
        "input_text": f"<translate> {row_id}",
        "output_text": "a b.",
        "task": task,
        "direction": "eng-wbv",
        "pair_kind": "test",
        "source_population": population,
        "token_accounting": {
            "source_tokens_with_specials": 4,
            "target_tokens_with_specials": 4,
            "non_padding_tokens_with_specials": 8,
        },
    }


class TaskSeparatedScheduleTest(unittest.TestCase):
    def test_software_contract_fails_closed(self) -> None:
        with patch(
            "training.translation.build_wajarri_v3_task_separated_schedules.importlib.metadata.version",
            return_value="4.48.3",
        ):
            self.assertEqual(
                verify_software_contract({"software": {"transformers": "4.48.3"}}),
                {"transformers": "4.48.3"},
            )
            with self.assertRaises(ValueError):
                verify_software_contract({"software": {"transformers": "4.49.0"}})

    def test_parses_frozen_two_slot_source_shapes(self) -> None:
        self.assertEqual(
            parse_two_slot_source("<translate> The bilby is sitting down."),
            ("bilby", "sitting down"),
        )
        self.assertEqual(
            parse_two_slot_source("<translate> I am hungry."), ("I", "hungry")
        )
        with self.assertRaises(ValueError):
            parse_two_slot_source("<translate> Where is the bilby?")

    def test_target_slots_fail_closed(self) -> None:
        self.assertEqual(target_slots("Marruwa nyinamanha."), ("marruwa", "nyinamanha"))
        with self.assertRaises(ValueError):
            target_slots("one two three")

    def test_stable_cycle_balances_parent_exposure(self) -> None:
        cycled = stable_cycle([row("a"), row("b"), row("c")], 8, seed=17, label="x")
        counts = {key: sum(item["id"] == key for item in cycled) for key in "abc"}
        self.assertEqual(sum(counts.values()), 8)
        self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)

    def test_schedule_freezes_per_update_quota(self) -> None:
        schedule = build_schedule(
            "G3",
            {"plain": [row("p1"), row("p2")], "glossary": [row("g1", "glossary_translation")]},
            {"plain": 2, "glossary": 2},
            optimizer_updates=3,
            seed=17,
        )
        self.assertEqual(len(schedule), 12)
        for update in range(1, 4):
            block = [item for item in schedule if item["optimizer_update"] == update]
            self.assertEqual(len(block), 4)
            self.assertEqual(sum(item["schedule_population"] == "plain" for item in block), 2)
            self.assertEqual(sum(item["schedule_population"] == "glossary" for item in block), 2)

    def test_glossary_schedule_preserves_exact_target_exposure(self) -> None:
        populations = {
            "retention_plain": [row("r1", population="retention"), row("r2", population="retention")],
            "contrast_plain": [row("c1", population="contrast"), row("c2", population="contrast")],
        }
        plain = build_schedule(
            "P3",
            populations,
            {"retention_plain": 2, "contrast_plain": 2},
            optimizer_updates=2,
            seed=17,
        )
        glossary = {
            item["source_row_id"]: {
                **item,
                "id": f"{item['source_row_id']}:glossary",
                "input_text": f"{item['input_text']} <glossary> x = y",
                "task": "glossary_translation",
            }
            for group in populations.values()
            for item in group
        }
        mixed = derive_glossary_schedule(
            plain,
            glossary,
            arm="G3",
            glossary_per_population_per_update=1,
            seed=17,
        )
        self.assertEqual(
            [item["output_text"] for item in plain],
            [item["output_text"] for item in mixed],
        )
        validate_accounting_profiles(mixed)
        validate_target_exposure_pairing(plain, mixed)
        self.assertEqual(
            [item["target_pair_parent_id"] for item in plain],
            [item["target_pair_parent_id"] for item in mixed],
        )
        converted = [item for item in mixed if item["task"] == "glossary_translation"]
        for item in converted:
            plain_match = plain[item["presentation_index"] - 1]
            self.assertEqual(
                item["target_pair_parent_id"], plain_match["target_pair_parent_id"]
            )
            self.assertNotEqual(
                item["accounting_parent_id"], plain_match["accounting_parent_id"]
            )
        for update in range(1, 3):
            block = [item for item in mixed if item["optimizer_update"] == update]
            self.assertEqual(sum(item["task"] == "glossary_translation" for item in block), 2)

    def test_inconsistent_repeated_accounting_profile_fails_closed(self) -> None:
        first = row("r1")
        first["accounting_parent_id"] = "shared"
        second = {**row("r2", task="glossary_translation")}
        second["accounting_parent_id"] = "shared"
        second["token_accounting"] = {
            "source_tokens_with_specials": 9,
            "target_tokens_with_specials": 4,
            "non_padding_tokens_with_specials": 13,
        }
        with self.assertRaises(ValueError):
            validate_accounting_profiles([first, second])

        second["accounting_parent_id"] = "shared::glossary"
        validate_accounting_profiles([first, second])


if __name__ == "__main__":
    unittest.main()

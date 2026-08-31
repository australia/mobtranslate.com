from __future__ import annotations

import unittest

from training.translation.build_wajarri_v3_mixed_replay_schedules import (
    build_presentation_pairs,
    materialize_schedules,
    select_balanced_controls,
)


class BuildWajarriV3MixedReplaySchedulesTest(unittest.TestCase):
    def row(self, identifier: str, cycle: int, arm: str) -> dict:
        return {
            "id": identifier,
            "accounting_parent_id": identifier,
            "schedule_cycle": cycle,
            "input_text": f"input {identifier}",
            "output_text": f"output {identifier}",
            "task": "translate",
            "pair_kind": "synthetic",
            "token_accounting": {
                "source_tokens_with_specials": 4,
                "target_tokens_with_specials": 3,
                "non_padding_tokens_with_specials": 7,
            },
            "arm": arm,
        }

    def test_mixed_updates_have_equal_task_counts(self) -> None:
        controls = [self.row(f"c{i}", 1, "C0") for i in range(4)]
        treatments = [self.row(f"t{i}", 1, "T1") for i in range(4)]
        lexical = []
        for index in range(4):
            lexical.append(
                {
                    "pair_id": f"l{index}",
                    "control": {**self.row(f"lc{index}", 1, "C0"), "task": "lexeme"},
                    "anchor": {**self.row(f"la{index}", 1, "T1"), "task": "lexeme"},
                }
            )
        pairs = build_presentation_pairs(
            controls,
            treatments,
            lexical,
            composition_cycles=1,
            lexical_cycles=1,
            optimizer_updates=1,
            seed=17,
        )
        c2, t2 = materialize_schedules(pairs)
        self.assertEqual(len(c2), 8)
        self.assertEqual(len(t2), 8)
        self.assertEqual(sum(row["mixed_pair_kind"] == "lexical" for row in t2), 4)
        self.assertEqual({row["optimizer_update"] for row in t2}, {1})

    def test_balanced_controls_match_source_and_total_tokens(self) -> None:
        def lexical(identifier: str, source: int, target: int) -> dict:
            return {
                "id": identifier,
                "token_accounting": {
                    "source_tokens_with_specials": source,
                    "target_tokens_with_specials": target,
                    "non_padding_tokens_with_specials": source + target,
                },
            }

        anchors = [lexical("a1", 3, 3), lexical("a2", 5, 3)]
        eligible = anchors + [
            lexical("c1", 4, 2),
            lexical("c2", 4, 4),
            lexical("c3", 2, 4),
            lexical("c4", 6, 2),
        ]
        controls = select_balanced_controls(anchors, eligible, seed=17)
        self.assertEqual(
            sum(row["token_accounting"]["source_tokens_with_specials"] for row in controls),
            8,
        )
        self.assertEqual(
            [row["token_accounting"]["non_padding_tokens_with_specials"] for row in controls],
            [6, 8],
        )


if __name__ == "__main__":
    unittest.main()

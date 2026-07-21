#!/usr/bin/env python3

from __future__ import annotations

import unittest

from training.translation.audit_lexicon_overlap import audit, classify


class LexiconOverlapAuditTest(unittest.TestCase):
    def test_surface_relations_do_not_claim_linguistic_equivalence(self) -> None:
        self.assertEqual(classify(["bayka"], ["bayka"])["relation"], "shared_accepted_form")
        self.assertEqual(classify(["walbulwalbul"], ["walbul-walbul"])["relation"], "notation_skeleton_match")
        self.assertEqual(classify(["bayka"], ["baykal"])["relation"], "skeleton_prefix_relation")
        self.assertEqual(classify(["buyun"], ["kabu"])["relation"], "surface_disjoint")

    def test_audit_groups_duplicate_prompt_rows(self) -> None:
        left = {
            "bite": [
                {"accepted_references": ["bayka"], "id": "a"},
                {"accepted_references": ["jinda"], "id": "b"},
            ],
            "ear": [{"accepted_references": ["milka"], "id": "c"}],
        }
        right = {
            "bite": [{"accepted_references": ["baykal", "jinda"], "id": "d"}],
            "eye": [{"accepted_references": ["miyil"], "id": "e"}],
        }

        summary, rows = audit("grammar", left, "curated", right)

        self.assertEqual(summary["overlapping_prompts"], 1)
        self.assertEqual(summary["union_prompts"], 3)
        self.assertEqual(summary["relation_counts"], {"shared_accepted_form": 1})
        self.assertEqual(rows[0]["grammar"]["accepted_references"], ["bayka", "jinda"])


if __name__ == "__main__":
    unittest.main()

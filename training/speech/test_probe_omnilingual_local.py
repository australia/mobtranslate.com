from __future__ import annotations

import unittest

from probe_omnilingual_local import edit_distance, error_rate, normalize_transcript


class ProbeMetricsTest(unittest.TestCase):
    def test_edit_distance(self) -> None:
        self.assertEqual(edit_distance("bama", "bawa"), 1)
        self.assertEqual(edit_distance([], ["bama"]), 1)

    def test_error_rate(self) -> None:
        self.assertEqual(error_rate([], []), 0.0)
        self.assertEqual(error_rate([], ["bama"]), 1.0)
        self.assertEqual(
            error_rate(["ngayu", "binal", "bama"], ["ngayu", "binal", "bawa"]), 1 / 3
        )

    def test_normalize_transcript(self) -> None:
        self.assertEqual(normalize_transcript("  NGAYU\nBinal  "), "ngayu binal")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from training.translation.build_wajarri_v3_mixed_replay_runpod_kit import (
    build_status,
    copy_bound,
    count_jsonl,
    sha256_file,
)


class BuildWajarriV3MixedReplayRunpodKitTest(unittest.TestCase):
    def test_build_status_tracks_authorization(self) -> None:
        self.assertIn("NOT_AUTHORIZED", build_status(False))
        self.assertIn("EXECUTION_ALLOWED", build_status(True))

    def test_bound_copy_preserves_identity(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            destination = root / "nested/destination"
            source.write_text("evidence\n", encoding="utf-8")
            expected = sha256_file(source)
            copy_bound(source, destination, expected)
            self.assertEqual(sha256_file(destination), expected)

    def test_bound_copy_rejects_drift(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.write_text("drift\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                copy_bound(source, root / "destination", "0" * 64)

    def test_jsonl_counter_ignores_blank_lines(self) -> None:
        with TemporaryDirectory() as temporary:
            path = Path(temporary) / "rows.jsonl"
            path.write_text('{}\n\n{"row":2}\n', encoding="utf-8")
            self.assertEqual(count_jsonl(path), 2)


if __name__ == "__main__":
    unittest.main()

import json
import tempfile
import unittest
from pathlib import Path

from benchmark_hybrid_postedit import (
    output_schema,
    paired_bootstrap,
    parse_structured_output,
    repeated_ngram,
)


class HybridPosteditBenchmarkTests(unittest.TestCase):
    def test_schema_requires_every_id_and_forbids_extras(self) -> None:
        schema = output_schema(["row:a", "row:b"])
        translations = schema["properties"]["translations"]
        self.assertEqual(translations["required"], ["row:a", "row:b"])
        self.assertFalse(translations["additionalProperties"])
        self.assertEqual(set(translations["properties"]), {"row:a", "row:b"})

    def test_parse_codex_keyed_output(self) -> None:
        payload = {
            "translations": {
                "row:a": {
                    "translation": "Bama kadan.",
                    "decision": "draft_1",
                    "confidence": 0.5,
                    "audit_note": "unchanged",
                }
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "codex.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            self.assertEqual(parse_structured_output(path)[0]["id"], "row:a")

    def test_parse_claude_wrapper(self) -> None:
        payload = {
            "structured_output": {
                "translations": {
                    "row:b": {
                        "translation": "Jana dungan.",
                        "decision": "postedit",
                        "confidence": 0.4,
                        "audit_note": "evidence-supported",
                    }
                }
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "claude.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            rows = parse_structured_output(path)
            self.assertEqual(rows, [{"id": "row:b", **payload["structured_output"]["translations"]["row:b"]}])

    def test_repetition_gate(self) -> None:
        self.assertTrue(repeated_ngram("a b c a b c"))
        self.assertFalse(repeated_ngram("a b c d e f"))

    def test_paired_bootstrap_direction(self) -> None:
        result = paired_bootstrap([1.0, 2.0, 3.0], [2.0, 3.0, 4.0], 5000, 42)
        self.assertEqual(result["delta_mean_sentence_chrf"], 1.0)
        self.assertGreater(result["ci95_low"], 0.0)


if __name__ == "__main__":
    unittest.main()

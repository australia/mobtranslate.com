import tempfile
import unittest
from pathlib import Path

from kuku_possum_lexical_model import fit_idf, load_model, lookup, save_model, vectorize


class KukuPossumLexicalModelTest(unittest.TestCase):
    def model(self):
        texts = ["person", "water"]
        idf = fit_idf(texts)
        return {
            "schema_version": 1,
            "model_id": "test",
            "model_version": "v0",
            "model_family": "feature_hashed_tfidf_candidate_retriever",
            "dictionary_edition": "dict",
            "dictionary_manifest_sha256": "d" * 64,
            "grammar_edition": "grammar",
            "grammar_manifest_sha256": "g" * 64,
            "feature_contract": {"dimension": 32768},
            "threshold": 0.42,
            "idf": idf,
            "records": [
                {"record_id": "person", "variety": "olgol-y73", "target_form_source": "aban", "vector": vectorize("person", idf)},
                {"record_id": "water", "variety": "alungul-y199", "target_form_source": "uku", "vector": vectorize("water", idf)},
            ],
            "limitations": ["test"],
        }

    def test_roundtrip_and_exact_lookup(self):
        model = self.model()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.json.gz"
            save_model(path, model)
            loaded = load_model(path)
            response = lookup(loaded, "person", variety="olgol-y73")
        self.assertTrue(response["success"])
        self.assertEqual(response["matches"][0]["record_id"], "person")

    def test_gugu_yawa_fail_closed(self):
        response = lookup(self.model(), "person", variety="gugu-yawa-y74")
        self.assertFalse(response["success"])
        self.assertEqual(response["abstention_reason"], "no_candidate_rows_for_variety")

    def test_empty_query_abstains(self):
        response = lookup(self.model(), "---")
        self.assertFalse(response["success"])
        self.assertEqual(response["abstention_reason"], "empty_query")


if __name__ == "__main__":
    unittest.main()

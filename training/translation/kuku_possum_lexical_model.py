"""Pure-Python Kuku Possum candidate lexical retrieval model.

The model is a trained, feature-hashed TF-IDF index over source-backed English
candidate glosses. It deliberately does not generate sentences or normalize
between language varieties. The implementation uses only the Python standard
library so the published artifact can run in a small CPU Space.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


MODEL_SCHEMA_VERSION = 1
FEATURE_DIMENSION = 32768
CHAR_NGRAM_MIN = 2
CHAR_NGRAM_MAX = 5
DEFAULT_THRESHOLD = 0.42
MAX_QUERY_CHARS = 400
SUPPORTED_VARIETIES = ("all", "alungul-y199", "olgol-y73", "gugu-yawa-y74")


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    value = re.sub(r"[^\w]+", " ", value, flags=re.UNICODE)
    return " ".join(value.split())


def _feature_bucket(feature: str, dimension: int) -> int:
    digest = hashlib.sha256(feature.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") % dimension


def feature_counts(text: str, dimension: int = FEATURE_DIMENSION) -> Counter[int]:
    normalized = normalize_text(text)
    if not normalized:
        return Counter()
    features: list[str] = [f"w:{token}" for token in normalized.split()]
    padded = f"^{normalized}$"
    for size in range(CHAR_NGRAM_MIN, CHAR_NGRAM_MAX + 1):
        features.extend(
            f"c{size}:{padded[index:index + size]}"
            for index in range(max(0, len(padded) - size + 1))
        )
    return Counter(_feature_bucket(feature, dimension) for feature in features)


def fit_idf(texts: Iterable[str], dimension: int = FEATURE_DIMENSION) -> dict[int, float]:
    texts = list(texts)
    document_frequency: Counter[int] = Counter()
    for text in texts:
        document_frequency.update(feature_counts(text, dimension).keys())
    total = len(texts)
    return {
        bucket: math.log((total + 1) / (frequency + 1)) + 1.0
        for bucket, frequency in document_frequency.items()
    }


def vectorize(
    text: str,
    idf: dict[int, float],
    dimension: int = FEATURE_DIMENSION,
) -> list[list[float]]:
    counts = feature_counts(text, dimension)
    weighted = {
        bucket: (1.0 + math.log(count)) * idf.get(bucket, 0.0)
        for bucket, count in counts.items()
        if bucket in idf
    }
    norm = math.sqrt(sum(value * value for value in weighted.values()))
    if norm == 0.0:
        return []
    return [[bucket, value / norm] for bucket, value in sorted(weighted.items())]


def sparse_dot(left: list[list[float]], right: list[list[float]]) -> float:
    left_index = 0
    right_index = 0
    score = 0.0
    while left_index < len(left) and right_index < len(right):
        left_bucket, left_value = left[left_index]
        right_bucket, right_value = right[right_index]
        if left_bucket == right_bucket:
            score += left_value * right_value
            left_index += 1
            right_index += 1
        elif left_bucket < right_bucket:
            left_index += 1
        else:
            right_index += 1
    return score


def save_model(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as raw_handle:
        with gzip.GzipFile(
            filename="",
            mode="wb",
            compresslevel=9,
            fileobj=raw_handle,
            mtime=0,
        ) as gzip_handle:
            with io.TextIOWrapper(gzip_handle, encoding="utf-8") as handle:
                json.dump(
                    payload,
                    handle,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                handle.write("\n")


def load_model(path: str | Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        model = json.load(handle)
    if model.get("schema_version") != MODEL_SCHEMA_VERSION:
        raise ValueError("unsupported model schema")
    if model.get("model_family") != "feature_hashed_tfidf_candidate_retriever":
        raise ValueError("unexpected model family")
    model["idf"] = {int(bucket): value for bucket, value in model["idf"].items()}
    return model


def lookup(
    model: dict[str, Any],
    query: str,
    variety: str = "all",
    top_k: int = 8,
) -> dict[str, Any]:
    if variety not in SUPPORTED_VARIETIES:
        raise ValueError(f"unsupported variety: {variety}")
    if not isinstance(query, str):
        raise TypeError("query must be a string")
    if len(query) > MAX_QUERY_CHARS:
        raise ValueError(f"query exceeds {MAX_QUERY_CHARS} characters")
    top_k = max(1, min(int(top_k), 20))
    normalized = normalize_text(query)
    if not normalized:
        return _response(model, query, normalized, variety, [], "empty_query")
    if variety == "gugu-yawa-y74":
        return _response(model, query, normalized, variety, [], "no_candidate_rows_for_variety")

    query_vector = vectorize(
        normalized,
        model["idf"],
        model["feature_contract"]["dimension"],
    )
    if not query_vector:
        return _response(model, query, normalized, variety, [], "no_known_features")

    scored: list[tuple[float, dict[str, Any]]] = []
    for record in model["records"]:
        if variety != "all" and record["variety"] != variety:
            continue
        score = sparse_dot(query_vector, record["vector"])
        if score >= model["threshold"]:
            scored.append((score, record))
    scored.sort(key=lambda item: (-item[0], item[1]["variety"], item[1]["target_form_source"], item[1]["record_id"]))
    matches = [
        {
            key: value
            for key, value in record.items()
            if key != "vector"
        }
        | {"score": round(score, 6)}
        for score, record in scored[:top_k]
    ]
    return _response(
        model,
        query,
        normalized,
        variety,
        matches,
        None if matches else "below_similarity_threshold",
    )


def _response(
    model: dict[str, Any],
    query: str,
    normalized: str,
    variety: str,
    matches: list[dict[str, Any]],
    abstention_reason: str | None,
) -> dict[str, Any]:
    return {
        "success": bool(matches),
        "query": query,
        "query_normalized": normalized,
        "variety": variety,
        "route": "candidate_lexical_retrieval_model" if matches else "abstention",
        "model_id": model["model_id"],
        "model_version": model["model_version"],
        "model_sha256": model.get("artifact_sha256"),
        "dictionary_edition": model["dictionary_edition"],
        "dictionary_manifest_sha256": model["dictionary_manifest_sha256"],
        "grammar_edition": model["grammar_edition"],
        "grammar_manifest_sha256": model["grammar_manifest_sha256"],
        "threshold": model["threshold"],
        "matches": matches,
        "abstention_reason": abstention_reason,
        "capability": "closed_set_candidate_lexical_retrieval_research_only",
        "limitations": model["limitations"],
    }

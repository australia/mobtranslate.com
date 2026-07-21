from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import yaml


WORD_RE = re.compile(r"[a-z]+(?:-[a-z]+)*")


@dataclass(frozen=True)
class Candidate:
    kuku: str
    english: str
    source_ref: str
    words: tuple[str, ...]
    features: frozenset[str]


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value).casefold()
    return " ".join(WORD_RE.findall(value))


def text_features(value: str) -> frozenset[str]:
    compact = normalize_text(value).replace(" ", "_")
    features = set(compact)
    features.update(compact[index : index + 2] for index in range(len(compact) - 1))
    return frozenset(features)


def native_headwords(words: list[dict[str, object]]) -> list[str]:
    headwords: list[str] = []
    for entry in words:
        word = entry.get("word")
        if not isinstance(word, str) or entry.get("loanword") or entry.get("proper_name"):
            continue
        normalized = normalize_text(word)
        if normalized and " " not in normalized:
            headwords.append(normalized)
    return headwords


def inferred_native_letters(headwords: list[str]) -> set[str]:
    counts = Counter(character for word in headwords for character in word if character.isalpha())
    total = sum(counts.values())
    return {
        character
        for character, count in counts.items()
        if total and count / total >= 0.001
    }


def build_candidates(
    dictionary_path: Path,
    *,
    min_words: int,
    max_words: int,
) -> tuple[list[Candidate], Counter[str]]:
    document = yaml.safe_load(dictionary_path.read_text(encoding="utf-8"))
    words = document.get("words") if isinstance(document, dict) else None
    if not isinstance(words, list):
        raise ValueError("dictionary.yaml must contain a words list")

    headwords = native_headwords(words)
    native_letters = inferred_native_letters(headwords)
    feature_frequency = Counter(
        feature
        for headword in headwords
        for feature in text_features(headword)
        if "_" not in feature
    )

    candidates: list[Candidate] = []
    seen: set[str] = set()
    for entry_index, entry in enumerate(words):
        if not isinstance(entry, dict):
            continue
        examples = entry.get("examples")
        if not isinstance(examples, list):
            continue
        for example_index, example in enumerate(examples):
            if not isinstance(example, dict):
                continue
            kuku_raw = example.get("kuku_yalanji")
            english_raw = example.get("english")
            if not isinstance(kuku_raw, str) or not isinstance(english_raw, str):
                continue
            kuku = normalize_text(kuku_raw)
            english = " ".join(english_raw.split())
            tokens = tuple(kuku.split())
            letters = {character for character in kuku if character.isalpha()}
            if not min_words <= len(tokens) <= max_words:
                continue
            if not letters or not letters.issubset(native_letters):
                continue
            if kuku in seen:
                continue
            seen.add(kuku)
            candidates.append(
                Candidate(
                    kuku=kuku,
                    english=english,
                    source_ref=(
                        f"{dictionary_path.as_posix()}#words[{entry_index}].examples[{example_index}]"
                    ),
                    words=tokens,
                    features=text_features(kuku),
                )
            )
    return candidates, feature_frequency


def select_candidates(
    candidates: list[Candidate],
    feature_frequency: Counter[str],
    *,
    count: int,
    max_total_words: int,
) -> list[Candidate]:
    selected: list[Candidate] = []
    covered: set[str] = set()
    used_words: set[str] = set()
    total_words = 0

    while len(selected) < count:
        viable = [
            candidate
            for candidate in candidates
            if candidate not in selected
            and total_words + len(candidate.words) <= max_total_words
        ]
        if not viable:
            break

        def score(candidate: Candidate) -> tuple[float, int, str]:
            new_features = candidate.features - covered
            feature_gain = sum(
                1 / math.sqrt(max(1, feature_frequency.get(feature, 1)))
                for feature in new_features
            )
            lexical_gain = len(set(candidate.words) - used_words)
            overlap_penalty = len(set(candidate.words) & used_words)
            value = feature_gain + 0.35 * lexical_gain - 0.4 * overlap_penalty
            return value / math.sqrt(len(candidate.words)), -len(candidate.words), candidate.kuku

        chosen = max(viable, key=score)
        selected.append(chosen)
        covered.update(chosen.features)
        used_words.update(chosen.words)
        total_words += len(chosen.words)
    return selected


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Select short, source-attested ASR context prompts with broad orthographic coverage."
    )
    parser.add_argument("dictionary", type=Path)
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--min-words", type=int, default=2)
    parser.add_argument("--max-words", type=int, default=7)
    parser.add_argument("--max-total-words", type=int, default=50)
    args = parser.parse_args()

    candidates, frequency = build_candidates(
        args.dictionary,
        min_words=args.min_words,
        max_words=args.max_words,
    )
    selected = select_candidates(
        candidates,
        frequency,
        count=args.count,
        max_total_words=args.max_total_words,
    )
    if len(selected) != args.count:
        raise SystemExit(
            f"could only select {len(selected)} of {args.count} requested prompts"
        )

    payload = {
        "method": "greedy orthographic unigram/bigram coverage with lexical-overlap penalty",
        "candidate_count": len(candidates),
        "prompt_count": len(selected),
        "total_words": sum(len(candidate.words) for candidate in selected),
        "unique_words": len({word for candidate in selected for word in candidate.words}),
        "prompts": [
            {
                "kuku": candidate.kuku,
                "english": candidate.english,
                "source_ref": candidate.source_ref,
            }
            for candidate in selected
        ],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

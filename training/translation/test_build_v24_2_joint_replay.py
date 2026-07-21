from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from training.translation.build_v24_2_joint_replay import build


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def row(row_id: str, source: str, target: str, pair_kind: str, split: str = "train") -> dict[str, object]:
    return {
        "id": row_id,
        "input_text": source,
        "output_text": target,
        "direction": "eng-gvn",
        "source_lang": "eng_Latn",
        "target_lang": "gvn_Latn",
        "pair_kind": pair_kind,
        "split": split,
    }


def args(tmp_path: Path, *, output: str = "out") -> argparse.Namespace:
    return argparse.Namespace(
        lexeme_file=tmp_path / "lex.jsonl",
        sentence_file=tmp_path / "sent.jsonl",
        sentence_validation_file=tmp_path / "val.jsonl",
        output_dir=tmp_path / output,
        lexeme_repetitions=2,
        sentence_repetitions=1,
        monitor_rows_per_task=1,
        exclude_pair_kind=None,
        direction="eng-gvn",
        source_lang="eng_Latn",
        target_lang="gvn_Latn",
        seed="fixture-seed",
        dataset_id="fixture-joint-replay",
        row_id_prefix="fixture",
        checksum_filename="SHA256SUMS.fixture",
        purpose="Fixture purpose.",
    )


def fixture_files(tmp_path: Path) -> None:
    write_jsonl(
        tmp_path / "lex.jsonl",
        [row("l1", "<lexeme> woman", "jalbu", "dictionary_lexeme"), row("l2", "<lexeme> man", "bama", "dictionary_lexeme")],
    )
    write_jsonl(
        tmp_path / "sent.jsonl",
        [
            row("s1", "<translate> The woman returned.", "Jalbu kuliji.", "synthetic_academic_parallel"),
            row("s2", "<translate> The man returned.", "Bama kuliji.", "synthetic_academic_parallel"),
            row("b1", "<translate> A verse.", "Verse target.", "verse"),
        ],
    )
    write_jsonl(
        tmp_path / "val.jsonl",
        [row("v1", "<translate> A child waited.", "Baja bayan.", "synthetic_academic_parallel", "validation")],
    )


def test_builds_balanced_schema_and_excludes_bible(tmp_path: Path) -> None:
    fixture_files(tmp_path)
    manifest = build(args(tmp_path))
    train = [json.loads(line) for line in (tmp_path / "out/train.eng-gvn.jsonl").read_text().splitlines()]
    validation = [json.loads(line) for line in (tmp_path / "out/validation.eng-gvn.jsonl").read_text().splitlines()]

    assert len(train) == 6
    assert len(validation) == 2
    assert len({item["id"] for item in train}) == 6
    assert all(item["id"].startswith("fixture:") for item in train)
    assert {item["joint_replay"]["task_family"] for item in train} == {"lexeme", "sentence"}
    assert all(item["pair_kind"] != "verse" for item in train)
    assert set(train[0]) == set(validation[0])
    assert set(train[0]["joint_replay"]) == set(validation[0]["joint_replay"])
    assert manifest["mixture"]["lexeme_presentations"] == 4
    assert manifest["mixture"]["sentence_presentations"] == 2
    assert manifest["mixture"]["bible_rows"] == 0
    assert manifest["dataset_id"] == "fixture-joint-replay"
    assert manifest["purpose"] == "Fixture purpose."
    assert (tmp_path / "out/SHA256SUMS.fixture").is_file()


def test_output_rows_are_deterministic(tmp_path: Path) -> None:
    fixture_files(tmp_path)
    build(args(tmp_path, output="first"))
    build(args(tmp_path, output="second"))
    for filename in ("train.eng-gvn.jsonl", "validation.eng-gvn.jsonl"):
        assert (tmp_path / "first" / filename).read_bytes() == (tmp_path / "second" / filename).read_bytes()


def test_rejects_sentence_validation_leakage(tmp_path: Path) -> None:
    fixture_files(tmp_path)
    write_jsonl(
        tmp_path / "val.jsonl",
        [row("v1", "<translate> The woman returned.", "Different target.", "synthetic_academic_parallel", "validation")],
    )
    with pytest.raises(ValueError, match="sentence train/validation leakage"):
        build(args(tmp_path))

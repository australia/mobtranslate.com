import json
from pathlib import Path

import pytest

from build_migmaq_v3_3_hf_release import (
    link_or_copy,
    tokenizer_bundle_sha256,
    unique_training_pool,
    validate_adapter_release_verification,
    validate_merged_model,
)


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def test_unique_training_pool_deduplicates_schedule_sources(tmp_path: Path) -> None:
    schedule = tmp_path / "schedule.jsonl"
    row = {
        "id": "position-0",
        "schedule_position": 0,
        "schedule_arm": "dialog40",
        "schedule_source_id": "source-1",
        "input_text": "Who is this?",
        "output_text": "Wen na ula?",
    }
    repeated = dict(row, id="position-1", schedule_position=1)
    write_jsonl(schedule, [row, repeated])

    assert unique_training_pool(schedule) == [
        {
            "schedule_source_id": "source-1",
            "input_text": "Who is this?",
            "output_text": "Wen na ula?",
        }
    ]


def test_unique_training_pool_rejects_conflicting_presentations(tmp_path: Path) -> None:
    schedule = tmp_path / "schedule.jsonl"
    write_jsonl(
        schedule,
        [
            {"schedule_source_id": "source-1", "input_text": "a", "output_text": "x"},
            {"schedule_source_id": "source-1", "input_text": "a", "output_text": "y"},
        ],
    )
    with pytest.raises(ValueError, match="Conflicting"):
        unique_training_pool(schedule)


def test_link_or_copy_preserves_content(tmp_path: Path) -> None:
    source = tmp_path / "source"
    destination = tmp_path / "nested" / "destination"
    source.write_bytes(b"artifact")
    link_or_copy(source, destination)
    assert destination.read_bytes() == b"artifact"


def test_tokenizer_bundle_hash_is_name_and_content_bound(tmp_path: Path) -> None:
    for name in (
        "added_tokens.json",
        "sentencepiece.bpe.model",
        "special_tokens_map.json",
        "tokenizer.json",
        "tokenizer_config.json",
    ):
        (tmp_path / name).write_text(name, encoding="utf-8")
    first = tokenizer_bundle_sha256(tmp_path)
    (tmp_path / "tokenizer.json").write_text("changed", encoding="utf-8")
    assert tokenizer_bundle_sha256(tmp_path) != first


def test_validate_merged_model_checks_decoder_and_tokenizer(tmp_path: Path) -> None:
    for name in (
        "model.safetensors",
        "added_tokens.json",
        "sentencepiece.bpe.model",
        "special_tokens_map.json",
        "tokenizer.json",
        "tokenizer_config.json",
    ):
        (tmp_path / name).write_text(name, encoding="utf-8")
    (tmp_path / "config.json").write_text(
        json.dumps({"vocab_size": 11}), encoding="utf-8"
    )
    (tmp_path / "generation_config.json").write_text(
        json.dumps(
            {
                "forced_bos_token_id": 10,
                "num_beams": 4,
                "no_repeat_ngram_size": 3,
                "repetition_penalty": 1.1,
                "length_penalty": 1.0,
            }
        ),
        encoding="utf-8",
    )
    contract = {
        "target_lang_token_id": 10,
        "decoder_policy": {
            "num_beams": 4,
            "no_repeat_ngram_size": 3,
            "repetition_penalty": 1.1,
            "length_penalty": 1.0,
        },
        "source_artifacts": {
            "base_tokenizer_bundle": tokenizer_bundle_sha256(tmp_path)
        },
    }
    validate_merged_model(tmp_path, contract)
    generation = json.loads((tmp_path / "generation_config.json").read_text())
    generation["num_beams"] = 5
    (tmp_path / "generation_config.json").write_text(json.dumps(generation))
    with pytest.raises(ValueError, match="decoder contract"):
        validate_merged_model(tmp_path, contract)


def test_validate_adapter_release_verification_binds_smoke_probes(
    tmp_path: Path,
) -> None:
    expected = {
        "base_model_safetensors": "base",
        "adapter_model_safetensors": "adapter",
        "base_tokenizer_json": "tokenizer",
    }
    report = {
        "passed": True,
        "release_id": "release-1",
        "reference_report": {"sha256": "reference"},
        "checks": {
            "load_smoke": {
                "passed": True,
                "passed_rows": 6,
                "total_rows": 6,
            },
            "static": {
                key: {"observed": value, "passed": True}
                for key, value in {
                    "base_model_sha256": "base",
                    "adapter_model_sha256": "adapter",
                    "base_tokenizer_json_sha256": "tokenizer",
                    "adapter_tokenizer_json_sha256": "tokenizer",
                }.items()
            },
        },
    }
    path = tmp_path / "verification.json"
    path.write_text(json.dumps(report), encoding="utf-8")
    contract = {"release_id": "release-1", "source_artifacts": expected}
    amendment = {"trigger": {"sha256": "reference"}}
    validate_adapter_release_verification(path, contract, amendment)

    report["checks"]["load_smoke"]["passed_rows"] = 5
    path.write_text(json.dumps(report), encoding="utf-8")
    with pytest.raises(ValueError, match="six passing smoke probes"):
        validate_adapter_release_verification(path, contract, amendment)

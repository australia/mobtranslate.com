from __future__ import annotations

import hashlib
import json

import pytest

from training.translation.nllb_initial_adapter import validate_initial_adapter

TARGETS = ["q_proj", "k_proj", "v_proj", "out_proj", "fc1", "fc2"]


def write_adapter(tmp_path, *, rank: int = 16, token_indices=None):
    adapter = tmp_path / "adapter"
    adapter.mkdir()
    weights = b"immutable adapter fixture"
    (adapter / "adapter_model.safetensors").write_bytes(weights)
    (adapter / "adapter_config.json").write_text(
        json.dumps(
            {
                "r": rank,
                "lora_alpha": 32,
                "lora_dropout": 0.05,
                "target_modules": list(reversed(TARGETS)),
                "trainable_token_indices": token_indices or [10, 11, 12],
            }
        ),
        encoding="utf-8",
    )
    return adapter, hashlib.sha256(weights).hexdigest()


def test_initial_adapter_is_hash_and_topology_bound(tmp_path):
    adapter, digest = write_adapter(tmp_path)

    identity = validate_initial_adapter(
        str(adapter),
        digest,
        lora_r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=TARGETS,
        expected_trainable_token_indices=[10, 11, 12],
    )

    assert identity is not None
    assert identity["weight_sha256"] == digest
    assert identity["topology"]["target_modules"] == sorted(TARGETS)
    assert identity["trainable_token_indices"] == [10, 11, 12]


def test_initial_adapter_rejects_hash_or_topology_drift(tmp_path):
    adapter, digest = write_adapter(tmp_path)

    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        validate_initial_adapter(
            str(adapter),
            "0" * 64,
            lora_r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            target_modules=TARGETS,
            expected_trainable_token_indices=[10, 11, 12],
        )

    with pytest.raises(ValueError, match="topology"):
        validate_initial_adapter(
            str(adapter),
            digest,
            lora_r=32,
            lora_alpha=64,
            lora_dropout=0.0,
            target_modules=TARGETS,
            expected_trainable_token_indices=[10, 11, 12],
        )


def test_initial_adapter_rejects_trainable_token_index_drift(tmp_path):
    adapter, digest = write_adapter(tmp_path, token_indices=[10, 11, 12])

    with pytest.raises(ValueError, match="trainable-token indices"):
        validate_initial_adapter(
            str(adapter),
            digest,
            lora_r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            target_modules=TARGETS,
            expected_trainable_token_indices=[10, 12, 13],
        )

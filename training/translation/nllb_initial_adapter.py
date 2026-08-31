"""Fail-closed identity checks for continual PEFT adapter training."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_initial_adapter(
    adapter_dir: str,
    expected_weight_sha256: str,
    *,
    lora_r: int,
    lora_alpha: int,
    lora_dropout: float,
    target_modules: list[str],
    expected_trainable_token_indices: Any = None,
) -> dict[str, Any] | None:
    """Bind continuation training to one immutable, topology-compatible adapter."""
    if not adapter_dir:
        if expected_weight_sha256:
            raise ValueError(
                "--expected-initial-adapter-sha256 requires --initial-adapter"
            )
        return None
    if not expected_weight_sha256:
        raise ValueError("--initial-adapter requires --expected-initial-adapter-sha256")
    if len(expected_weight_sha256) != 64:
        raise ValueError("initial adapter SHA-256 must contain 64 hexadecimal digits")

    root = Path(adapter_dir).resolve()
    config_path = root / "adapter_config.json"
    weight_path = root / "adapter_model.safetensors"
    if not config_path.is_file() or not weight_path.is_file():
        raise ValueError(
            "initial adapter must contain adapter_config.json and adapter_model.safetensors"
        )
    observed_weight_sha256 = sha256_file(weight_path)
    if observed_weight_sha256 != expected_weight_sha256.casefold():
        raise ValueError(
            "initial adapter weight SHA-256 mismatch: "
            f"expected={expected_weight_sha256.casefold()} observed={observed_weight_sha256}"
        )

    config = json.loads(config_path.read_text(encoding="utf-8"))
    observed_targets = sorted(config.get("target_modules") or [])
    expected_targets = sorted(target_modules)
    topology = {
        "r": int(config.get("r", -1)),
        "lora_alpha": int(config.get("lora_alpha", -1)),
        "lora_dropout": float(config.get("lora_dropout", -1.0)),
        "target_modules": observed_targets,
    }
    expected_topology = {
        "r": lora_r,
        "lora_alpha": lora_alpha,
        "lora_dropout": lora_dropout,
        "target_modules": expected_targets,
    }
    if topology != expected_topology:
        raise ValueError(
            "initial adapter topology does not match the requested LoRA contract: "
            f"expected={expected_topology} observed={topology}"
        )
    observed_trainable_token_indices = config.get("trainable_token_indices")
    if expected_trainable_token_indices is not None:
        if observed_trainable_token_indices != expected_trainable_token_indices:
            raise ValueError(
                "initial adapter trainable-token indices do not match the requested "
                "selective-token contract: "
                f"expected={expected_trainable_token_indices} "
                f"observed={observed_trainable_token_indices}"
            )
    return {
        "path": str(root),
        "weight_sha256": observed_weight_sha256,
        "config_sha256": sha256_file(config_path),
        "topology": topology,
        "trainable_token_indices": observed_trainable_token_indices,
    }

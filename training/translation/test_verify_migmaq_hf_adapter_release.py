import json
from pathlib import Path

from verify_migmaq_hf_adapter_release import (
    TOKENIZER_FILES,
    compare_predictions,
    sha256,
    tokenizer_bundle_sha256,
    trim_trailing_pad,
    verify_static_release,
)


def test_compare_predictions_requires_exact_token_ids() -> None:
    reference = [
        {
            "id": "row-1",
            "input_text": " Who   is this? ",
            "adapter_token_ids": [2, 7, 2],
            "text": "Wen na ula?",
        },
        {
            "id": "row-2",
            "input_text": "Fine.",
            "adapter_token_ids": [2, 8, 2],
            "text": "Weljeweim.",
        },
    ]
    compared = compare_predictions(
        reference,
        [[2, 7, 2], [2, 9, 2]],
        ["Wen na ula?", "Weljeweim."],
        ["Wen na ula?", "Weljeweim."],
    )
    assert compared[0]["token_ids_equal"] is True
    assert compared[1]["token_ids_equal"] is False
    assert compared[1]["text_equal"] is True


def test_trim_trailing_pad_preserves_internal_tokens() -> None:
    assert trim_trailing_pad([2, 7, 1, 8, 1, 1], 1) == [2, 7, 1, 8]


def test_verify_static_release_binds_base_adapter_tokenizer_and_repo(
    tmp_path: Path,
) -> None:
    release = tmp_path / "release"
    base = release / "base-repo"
    model = release / "model-repo"
    base.mkdir(parents=True)
    model.mkdir()
    (base / "model.safetensors").write_bytes(b"base")
    (model / "adapter_model.safetensors").write_bytes(b"adapter")
    for root in (base, model):
        for name in TOKENIZER_FILES:
            (root / name).write_text(name, encoding="utf-8")
    (model / "adapter_config.json").write_text(
        json.dumps(
            {
                "base_model_name_or_path": "owner/base",
                "revision": "v1.0.0-rc1",
            }
        ),
        encoding="utf-8",
    )
    manifest = {
        "base_model_sha256": sha256(base / "model.safetensors"),
        "adapter_model_sha256": sha256(model / "adapter_model.safetensors"),
        "tokenizer_bundle_sha256": tokenizer_bundle_sha256(base),
        "repositories": {"base_repo": "owner/base"},
        "repository_tags": {"base_repo": "v1.0.0-rc1"},
    }
    (release / "release-manifest.json").write_text(
        json.dumps(manifest), encoding="utf-8"
    )
    reference = {
        "inputs": {
            "base_tokenizer_json_sha256": sha256(base / "tokenizer.json"),
            "adapter_tokenizer_json_sha256": sha256(model / "tokenizer.json"),
        }
    }

    _manifest, checks = verify_static_release(release, reference)
    assert all(check["passed"] for check in checks.values())

    config = json.loads((model / "adapter_config.json").read_text())
    config["base_model_name_or_path"] = "owner/wrong-base"
    (model / "adapter_config.json").write_text(json.dumps(config))
    _manifest, checks = verify_static_release(release, reference)
    assert checks["adapter_base_model_name_or_path"]["passed"] is False

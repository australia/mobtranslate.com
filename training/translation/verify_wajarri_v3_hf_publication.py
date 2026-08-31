#!/usr/bin/env python3
"""Verify the public Wajarri v3 controlled Hugging Face release byte-for-byte."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-dir", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--expected-user", default="ajaxdavis")
    parser.add_argument("--create-tag", action="store_true")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def local_files(root: Path) -> dict[str, Path]:
    return {
        path.relative_to(root).as_posix(): path
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def lfs_sha256(sibling: Any) -> str | None:
    lfs = getattr(sibling, "lfs", None)
    if lfs is None:
        return None
    value = lfs.get("sha256") if isinstance(lfs, dict) else getattr(lfs, "sha256", None)
    return str(value) if value else None


def main() -> None:
    args = parse_args()
    release_dir = args.release_dir.expanduser().resolve()
    output_path = args.output_json.expanduser().resolve()
    release = json.loads((release_dir / "release.json").read_text(encoding="utf-8"))

    from huggingface_hub import HfApi, hf_hub_download

    api = HfApi()
    identity = api.whoami()
    account = str(identity.get("name") or identity.get("fullname") or "")
    if account != args.expected_user:
        raise RuntimeError(
            f"authenticated Hugging Face account changed: {account!r} != {args.expected_user!r}"
        )

    repo_id = str(release["modelRepo"])
    tag = str(release["version"])
    expected = local_files(release_dir)
    info = api.model_info(repo_id, files_metadata=True)
    revision = str(info.sha)
    if args.create_tag:
        api.create_tag(
            repo_id,
            tag=tag,
            tag_message=f"MobTranslate Wajarri controlled release {tag}",
            revision=revision,
            exist_ok=True,
        )
    tag_revision = str(api.model_info(repo_id, revision=tag).sha)
    tag_passed = tag_revision == revision

    siblings = {item.rfilename: item for item in info.siblings}
    missing = sorted(set(expected) - set(siblings))
    unexpected = sorted(set(siblings) - set(expected) - {".gitattributes"})
    files: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="wajarri-v3-hf-verify-") as temp_dir:
        for relative, local_path in expected.items():
            local_hash = sha256_file(local_path)
            sibling = siblings.get(relative)
            if sibling is None:
                files.append(
                    {
                        "path": relative,
                        "local_sha256": local_hash,
                        "method": "missing_remote_file",
                        "passed": False,
                    }
                )
                continue
            remote_hash = lfs_sha256(sibling)
            method = "hub_lfs_sha256"
            if remote_hash is None:
                downloaded = Path(
                    hf_hub_download(
                        repo_id,
                        relative,
                        revision=revision,
                        local_dir=Path(temp_dir),
                        force_download=True,
                    )
                )
                remote_hash = sha256_file(downloaded)
                method = "downloaded_sha256"
            files.append(
                {
                    "path": relative,
                    "bytes": local_path.stat().st_size,
                    "local_sha256": local_hash,
                    "remote_sha256": remote_hash,
                    "method": method,
                    "passed": remote_hash == local_hash,
                }
            )

    base_revision = str(
        api.model_info(
            str(release["baseRepo"]), revision=str(release["baseRevision"])
        ).sha
    )
    dataset_revision = str(
        api.dataset_info(
            str(release["datasetRepo"]), revision=str(release["datasetRevision"])
        ).sha
    )
    public_info = HfApi(token=False).model_info(repo_id, revision=revision)
    identity_gates = {
        "repository_public": public_info.private is False,
        "tag_resolves_to_release_commit": tag_passed,
        "base_revision_resolves_exactly": base_revision == release["baseRevision"],
        "dataset_revision_resolves_exactly": dataset_revision
        == release["datasetRevision"],
        "adapter_hash_matches_release": sha256_file(
            release_dir / "adapter/adapter_model.safetensors"
        )
        == release["adapterModelSha256"],
    }
    passed = (
        not missing
        and not unexpected
        and all(item["passed"] for item in files)
        and all(identity_gates.values())
    )
    report = {
        "schema_version": 1,
        "kind": "wajarri_v3_controlled_hugging_face_publication_verification",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "authenticated_account": account,
        "repository": repo_id,
        "url": f"https://huggingface.co/{repo_id}",
        "revision": revision,
        "tag": tag,
        "tag_revision": tag_revision,
        "missing_files": missing,
        "unexpected_files": unexpected,
        "identity_gates": identity_gates,
        "files": files,
        "passed": passed,
        "claim_limit": (
            "This proves public artifact identity only. It authorizes the frozen "
            "six-predicate subject-slot route, not free-form Wajarri translation."
        ),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "passed": passed,
                "repository": repo_id,
                "revision": revision,
                "tag": tag,
            },
            indent=2,
            sort_keys=True,
        )
    )
    if not passed:
        raise SystemExit("Wajarri Hugging Face publication verification failed")


if __name__ == "__main__":
    main()

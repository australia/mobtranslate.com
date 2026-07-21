#!/usr/bin/env python3
"""Verify the public Mi'kmaq v3.3 Hugging Face repositories byte-for-byte."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from typing import Any


REPOSITORY_LAYOUT = {
    "base_repo": ("base-repo", "model"),
    "model_repo": ("model-repo", "model"),
    "dataset_repo": ("dataset-repo", "dataset"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-dir", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--expected-user", default="ajaxdavis")
    parser.add_argument("--create-tags", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
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
    if isinstance(lfs, dict):
        value = lfs.get("sha256")
    else:
        value = getattr(lfs, "sha256", None)
    return str(value) if value else None


def resolve_tag_revision(
    api: Any, repo_id: str, repo_type: str, tag: str
) -> str:
    """Resolve annotated and lightweight tags to their underlying commit."""
    info = api.repo_info(repo_id, repo_type=repo_type, revision=tag)
    return str(info.sha)


def main() -> None:
    args = parse_args()
    release_dir = args.release_dir.expanduser().resolve()
    output_path = args.output_json.expanduser().resolve()
    manifest = json.loads(
        (release_dir / "release-manifest.json").read_text(encoding="utf-8")
    )

    from huggingface_hub import HfApi, hf_hub_download

    api = HfApi()
    identity = api.whoami()
    account = str(identity.get("name") or identity.get("fullname") or "")
    if account != args.expected_user:
        raise RuntimeError(
            f"Authenticated Hugging Face account changed: {account!r} != {args.expected_user!r}"
        )

    repositories: dict[str, Any] = {}
    all_passed = True
    with tempfile.TemporaryDirectory(prefix="migmaq-hf-verify-") as temp_dir:
        for role, (local_name, repo_type) in REPOSITORY_LAYOUT.items():
            repo_id = manifest["repositories"][role]
            tag = manifest["repository_tags"][role]
            root = release_dir / local_name
            expected = local_files(root)
            info = api.repo_info(repo_id, repo_type=repo_type, files_metadata=True)
            revision = str(info.sha)
            if args.create_tags:
                api.create_tag(
                    repo_id,
                    tag=tag,
                    tag_message=f"MobTranslate Mi'kmaq release {tag}",
                    revision=revision,
                    repo_type=repo_type,
                    exist_ok=True,
                )

            refs = api.list_repo_refs(repo_id, repo_type=repo_type)
            remote_tag = next((ref for ref in refs.tags if ref.name == tag), None)
            tag_revision = (
                resolve_tag_revision(api, repo_id, repo_type, tag)
                if remote_tag is not None
                else None
            )
            tag_passed = tag_revision == revision
            siblings = {item.rfilename: item for item in info.siblings}
            unexpected = sorted(set(siblings) - set(expected) - {".gitattributes"})
            missing = sorted(set(expected) - set(siblings))
            file_records: list[dict[str, Any]] = []

            for relative, local_path in expected.items():
                local_hash = sha256(local_path)
                sibling = siblings.get(relative)
                if sibling is None:
                    file_records.append(
                        {
                            "path": relative,
                            "local_sha256": local_hash,
                            "method": "missing_remote_file",
                            "passed": False,
                        }
                    )
                    continue
                remote_lfs_hash = lfs_sha256(sibling)
                if remote_lfs_hash:
                    remote_hash = remote_lfs_hash
                    method = "hub_lfs_sha256"
                else:
                    downloaded = Path(
                        hf_hub_download(
                            repo_id,
                            relative,
                            repo_type=repo_type,
                            revision=revision,
                            local_dir=Path(temp_dir) / role,
                            force_download=True,
                        )
                    )
                    remote_hash = sha256(downloaded)
                    method = "downloaded_sha256"
                file_records.append(
                    {
                        "path": relative,
                        "bytes": local_path.stat().st_size,
                        "local_sha256": local_hash,
                        "remote_sha256": remote_hash,
                        "method": method,
                        "passed": remote_hash == local_hash,
                    }
                )

            repo_passed = (
                not missing
                and not unexpected
                and tag_passed
                and all(record["passed"] for record in file_records)
            )
            all_passed = all_passed and repo_passed
            repositories[role] = {
                "repo_id": repo_id,
                "repo_type": repo_type,
                "url": f"https://huggingface.co/{'datasets/' if repo_type == 'dataset' else ''}{repo_id}",
                "revision": revision,
                "tag": tag,
                "tag_revision": tag_revision,
                "tag_ref_target": remote_tag.target_commit if remote_tag else None,
                "tag_passed": tag_passed,
                "missing_files": missing,
                "unexpected_files": unexpected,
                "files": file_records,
                "passed": repo_passed,
            }

    report = {
        "schema_version": 1,
        "kind": "migmaq_v3_3_hugging_face_publication_verification",
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "release_id": manifest["release_id"],
        "authenticated_account": account,
        "repositories": repositories,
        "passed": all_passed,
        "deployment": manifest["deployment"],
        "claim_limit": (
            "This verifies remote artifact identity. Research publication does not "
            "authorize homepage routing, a production API, or reliable translation claims."
        ),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "passed": all_passed,
                "revisions": {
                    role: record["revision"]
                    for role, record in repositories.items()
                },
            },
            indent=2,
            sort_keys=True,
        )
    )
    if not all_passed:
        raise SystemExit("Hugging Face publication verification failed")


if __name__ == "__main__":
    main()

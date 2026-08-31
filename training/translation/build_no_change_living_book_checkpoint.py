#!/usr/bin/env python3
"""Issue an immutable no-change living-book checkpoint from a strict contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from collections.abc import Iterable
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program-root", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--update-pointer", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"expected JSON object: {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise TypeError(f"expected object at {path}:{line_number}")
            rows.append(value)
    return rows


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def resolve_within(root: Path, raw_path: str, label: str) -> Path:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        raise ValueError(f"{label} must be relative to program root")
    path = (root / candidate).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes program root: {raw_path}") from error
    return path


def require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a nonempty string")
    return value


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError(f"{label} must be an object")
    return value


def iter_hash_records(
    value: Any, path: tuple[str, ...] = ()
) -> Iterable[tuple[tuple[str, ...], str, str]]:
    if isinstance(value, dict):
        for key, raw_path in value.items():
            if not key.endswith("_path") or not isinstance(raw_path, str):
                continue
            hash_key = f"{key[:-5]}_sha256"
            raw_hash = value.get(hash_key)
            if isinstance(raw_hash, str):
                yield path + (key,), raw_path, raw_hash
        for key, child in value.items():
            yield from iter_hash_records(child, path + (key,))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from iter_hash_records(child, path + (str(index),))


def verify_hash_records(root: Path, contract: dict[str, Any]) -> None:
    seen: set[tuple[str, str]] = set()
    for key_path, raw_path, expected_hash in iter_hash_records(contract):
        identity = (raw_path, expected_hash)
        if identity in seen:
            continue
        seen.add(identity)
        path = resolve_within(root, raw_path, ".".join(key_path))
        if not path.is_file():
            raise FileNotFoundError(path)
        actual_hash = sha256(path)
        if actual_hash != expected_hash:
            raise ValueError(
                f"hash mismatch for {'.'.join(key_path)}: "
                f"expected {expected_hash}, found {actual_hash}"
            )


def checkpoint_objects(contract: dict[str, Any]) -> list[dict[str, Any]]:
    excluded = {
        "scope",
        "parent_manifest",
        "source_ledger",
        "change_ledger",
        "component_inheritance",
        "expected_component_rows",
        "expected_counts",
        "evidence_policy",
    }
    checkpoints = [
        value
        for key, value in contract.items()
        if key not in excluded
        and key.endswith("_checkpoint")
        and isinstance(value, dict)
    ]
    if len(checkpoints) != 1:
        raise ValueError("contract must contain exactly one *_checkpoint object")
    return checkpoints


def expected_edition(
    root: Path, contract_path: Path, contract: dict[str, Any]
) -> tuple[str, str, Path, dict[str, Any]]:
    if contract.get("schema_version") != 1:
        raise ValueError("contract schema_version must be 1")
    edition_id = require_string(contract.get("edition_id"), "edition_id")
    parent_edition_id = require_string(
        contract.get("parent_edition_id"), "parent_edition_id"
    )
    created_at = require_string(contract.get("created_at_utc"), "created_at_utc")
    current_pointer_relative = require_string(
        contract.get("current_pointer_path"), "current_pointer_path"
    )
    pointer_parts = Path(current_pointer_relative).parts
    if len(pointer_parts) != 2 or pointer_parts[1] != "CURRENT.json":
        raise ValueError("current_pointer_path must be <artifact>/CURRENT.json")
    artifact = pointer_parts[0]

    verify_hash_records(root, contract)
    parent_spec = require_object(contract.get("parent_manifest"), "parent_manifest")
    parent_path = resolve_within(
        root, require_string(parent_spec.get("path"), "parent_manifest.path"), "parent"
    )
    parent = read_json(parent_path)
    if parent.get("edition_id") != parent_edition_id:
        raise ValueError("parent edition identity does not match contract")

    inheritance = require_object(
        contract.get("component_inheritance"), "component_inheritance"
    )
    if inheritance.get("mode") != "exact_parent_component_aliases":
        raise ValueError("unsupported component inheritance mode")
    if inheritance.get("changed_component_count") != 0:
        raise ValueError("no-change checkpoint cannot change components")
    parent_components = require_object(parent.get("components"), "parent components")
    if len(parent_components) != inheritance.get("parent_component_count"):
        raise ValueError("parent component count differs from contract")
    for component_name, expected_rows in require_object(
        contract.get("expected_component_rows"), "expected_component_rows"
    ).items():
        component = require_object(
            parent_components.get(component_name), f"component {component_name}"
        )
        if component.get("rows") != expected_rows:
            raise ValueError(f"component row count mismatch: {component_name}")
        component_path = resolve_within(
            root,
            require_string(component.get("path"), f"component {component_name}.path"),
            f"component {component_name}",
        )
        if sha256(component_path) != component.get("sha256"):
            raise ValueError(f"component payload hash mismatch: {component_name}")

    change_spec = require_object(contract.get("change_ledger"), "change_ledger")
    change_path = resolve_within(
        root, require_string(change_spec.get("path"), "change_ledger.path"), "change ledger"
    )
    issuing_change_id = require_string(
        change_spec.get("issuing_change_id"), "change_ledger.issuing_change_id"
    )
    changes = read_jsonl(change_path)
    if sum(row.get("change_id") == issuing_change_id for row in changes) != 1:
        raise ValueError("issuing change ID is not unique in change ledger")
    issuing_change = next(
        row for row in changes if row.get("change_id") == issuing_change_id
    )
    if issuing_change.get("new_edition_id") != edition_id:
        raise ValueError("issuing change does not name the contracted edition")
    if issuing_change.get("parent_edition_id") != parent_edition_id:
        raise ValueError("issuing change does not name the contracted parent")

    counts = dict(require_object(parent.get("counts"), "parent counts"))
    for key, expected_value in require_object(
        contract.get("expected_counts"), "expected_counts"
    ).items():
        if key in counts and counts[key] != expected_value:
            raise ValueError(f"parent count conflicts with contract: {key}")
        counts[key] = expected_value

    review_routing = dict(
        require_object(parent.get("review_routing"), "parent review_routing")
    )
    checkpoints = checkpoint_objects(contract)
    for checkpoint in checkpoints:
        review_routing.update(
            require_object(checkpoint.get("review_routing"), "checkpoint review_routing")
        )

    contract_relative = str(contract_path.relative_to(root))
    omitted = {
        "expected_component_rows",
        "expected_counts",
        "current_pointer_path",
        "supersedes_pointer_sha256",
    }
    edition: dict[str, Any] = {
        key: value for key, value in contract.items() if key not in omitted
    }
    edition["method_contract"] = {
        "path": contract_relative,
        "sha256": sha256(contract_path),
    }
    edition["supersedes"] = [parent_edition_id]
    accepted_change_ids = change_spec.get("accepted_change_ids")
    if not isinstance(accepted_change_ids, list):
        raise TypeError("change_ledger.accepted_change_ids must be a list")
    edition["accepted_change_ids"] = accepted_change_ids
    edition["components"] = parent_components
    edition["review_routing"] = review_routing
    edition["counts"] = counts

    output_path = root / artifact / "editions" / edition_id / "EDITION.json"
    pointer = {
        "schema_version": 1,
        "artifact": artifact,
        "current_edition_id": edition_id,
        "manifest_path": str(output_path.relative_to(root)),
        "manifest_sha256": "",
        "updated_at_utc": created_at,
        "supersedes_pointer_sha256": require_string(
            contract.get("supersedes_pointer_sha256"), "supersedes_pointer_sha256"
        ),
        "release_status": contract.get("release_status"),
    }
    return artifact, current_pointer_relative, output_path, {"edition": edition, "pointer": pointer}


def encode_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def build(
    root: Path,
    contract_path: Path,
    contract: dict[str, Any],
    *,
    write: bool,
    update_pointer: bool,
) -> dict[str, Any]:
    artifact, pointer_relative, output_path, payload = expected_edition(
        root, contract_path, contract
    )
    edition = payload["edition"]
    expected_bytes = encode_json(edition)
    expected_manifest_hash = hashlib.sha256(expected_bytes).hexdigest()
    pointer = payload["pointer"]
    pointer["manifest_sha256"] = expected_manifest_hash
    pointer_path = resolve_within(root, pointer_relative, "current pointer")
    current_pointer = read_json(pointer_path)

    if output_path.exists():
        if output_path.read_bytes() != expected_bytes:
            raise FileExistsError(f"immutable edition differs: {output_path}")
        if update_pointer:
            if current_pointer.get("current_edition_id") != edition["edition_id"]:
                raise ValueError("edition exists but current pointer targets another edition")
            if current_pointer.get("manifest_sha256") != expected_manifest_hash:
                raise ValueError("current pointer manifest hash differs")
        return {
            "mode": "verified_existing",
            "artifact": artifact,
            "edition_id": edition["edition_id"],
            "manifest_path": str(output_path.relative_to(root)),
            "manifest_sha256": expected_manifest_hash,
            "pointer_updated": bool(update_pointer),
        }

    current_pointer_hash = sha256(pointer_path)
    if current_pointer_hash != contract.get("supersedes_pointer_sha256"):
        raise ValueError("current pointer hash differs from supersedes contract")
    if current_pointer.get("current_edition_id") != edition["parent_edition_id"]:
        raise ValueError("current pointer does not target the contracted parent")
    if not write:
        return {
            "mode": "dry_run",
            "artifact": artifact,
            "edition_id": edition["edition_id"],
            "manifest_path": str(output_path.relative_to(root)),
            "manifest_sha256": expected_manifest_hash,
            "pointer_updated": False,
        }

    write_json_atomic(output_path, edition)
    if sha256(output_path) != expected_manifest_hash:
        raise RuntimeError("written edition hash differs from expected hash")
    if update_pointer:
        write_json_atomic(pointer_path, pointer)
    return {
        "mode": "written",
        "artifact": artifact,
        "edition_id": edition["edition_id"],
        "manifest_path": str(output_path.relative_to(root)),
        "manifest_sha256": expected_manifest_hash,
        "pointer_updated": bool(update_pointer),
    }


def main() -> None:
    args = parse_args()
    root = args.program_root.resolve()
    contract_path = args.contract
    if not contract_path.is_absolute():
        contract_path = resolve_within(root, str(contract_path), "contract")
    contract = read_json(contract_path)
    result = build(
        root,
        contract_path,
        contract,
        write=args.write,
        update_pointer=args.update_pointer,
    )
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
export LC_ALL=C

ALLOW_LEGACY_CACHE_DRIFT=0
RELEASE=""

usage() {
  cat <<'EOF'
Usage: verify-web-release.sh [--allow-legacy-cache-drift] RELEASE_PATH

Version 2 releases must match their file and symlink manifests exactly.
Legacy releases may contain additional Next.js runtime-cache files, but their
original files must still match exactly. The explicit drift option is reserved
for archival: it also permits changed legacy Next.js cache payloads, while all
code, configuration, and other runtime files remain exact.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-legacy-cache-drift)
      ALLOW_LEGACY_CACHE_DRIFT=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      [[ -z "$RELEASE" ]] || {
        echo "Only one release path may be verified." >&2
        exit 2
      }
      RELEASE="$1"
      shift
      ;;
  esac
done

[[ -n "$RELEASE" ]] || { usage >&2; exit 2; }

for command in awk cmp find grep mktemp readlink sha256sum sort tr wc; do
  command -v "$command" >/dev/null || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

RELEASE="$(readlink -f "$RELEASE")"
[[ -d "$RELEASE/runtime" ]] || { echo "Missing release runtime: $RELEASE" >&2; exit 1; }
[[ -f "$RELEASE/metadata/release.txt" \
  && -f "$RELEASE/metadata/runtime.sha256" ]] || {
  echo "Release integrity metadata is incomplete: $RELEASE" >&2
  exit 1
}

metadata_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' \
    "$RELEASE/metadata/release.txt"
}

RELEASE_ID="$(metadata_value release_id)"
BUILD_DIST="$(metadata_value build_dist)"
INTEGRITY_VERSION="$(metadata_value runtime_integrity_version)"
[[ "$RELEASE_ID" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$ ]] || {
  echo "Invalid release identity in metadata: $RELEASE_ID" >&2
  exit 1
}
[[ "$BUILD_DIST" == ".next-release-$RELEASE_ID" ]] || {
  echo "Release build directory does not match its identity: $BUILD_DIST" >&2
  exit 1
}

case "$INTEGRITY_VERSION" in
  "") INTEGRITY_VERSION="1" ;;
  1|2) ;;
  *)
    echo "Unsupported runtime integrity version: $INTEGRITY_VERSION" >&2
    exit 1
    ;;
esac

if [[ "$INTEGRITY_VERSION" == "2" && "$ALLOW_LEGACY_CACHE_DRIFT" -eq 1 ]]; then
  # The option is intentionally inert for v2: exact means exact.
  ALLOW_LEGACY_CACHE_DRIFT=0
fi

is_mutable_next_cache_path() {
  local path="$1"
  local prefix="runtime/apps/web/$BUILD_DIST/"
  [[ "$path" == "$prefix"* ]] || return 1
  local suffix="${path#"$prefix"}"

  case "$suffix" in
    server/app/*.html|server/app/*.rsc|server/app/*.meta|server/app/*.body)
      return 0
      ;;
    server/pages/*.html|server/pages/*.json)
      return 0
      ;;
    cache/fetch-cache/*|cache/images/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
STRICT_MANIFEST="$TEMP_DIR/strict.sha256"
MUTABLE_MANIFEST="$TEMP_DIR/mutable.sha256"
: > "$STRICT_MANIFEST"
: > "$MUTABLE_MANIFEST"

declare -A MANIFEST_PATHS=()
manifest_count=0
mutable_manifest_count=0
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^([0-9a-f]{64})\ \ (runtime/.+)$ ]] || {
    echo "Malformed runtime checksum manifest line: $line" >&2
    exit 1
  }
  expected="${BASH_REMATCH[1]}"
  path="${BASH_REMATCH[2]}"
  [[ "$path" != *$'\n'* && "$path" != *$'\r'* \
    && "$path" != /* && "$path" != *'/../'* && "$path" != '../'* ]] || {
    echo "Unsafe path in runtime checksum manifest: $path" >&2
    exit 1
  }
  [[ -z "${MANIFEST_PATHS[$path]:-}" ]] || {
    echo "Duplicate path in runtime checksum manifest: $path" >&2
    exit 1
  }
  MANIFEST_PATHS["$path"]="$expected"
  manifest_count=$((manifest_count + 1))

  [[ -f "$RELEASE/$path" && ! -L "$RELEASE/$path" ]] || {
    echo "Manifest runtime file is missing or no longer regular: $path" >&2
    exit 1
  }

  if [[ "$INTEGRITY_VERSION" == "1" \
    && "$ALLOW_LEGACY_CACHE_DRIFT" -eq 1 ]] \
    && is_mutable_next_cache_path "$path"; then
    printf '%s  %s\n' "$expected" "$path" >> "$MUTABLE_MANIFEST"
    mutable_manifest_count=$((mutable_manifest_count + 1))
  else
    printf '%s  %s\n' "$expected" "$path" >> "$STRICT_MANIFEST"
  fi
done < "$RELEASE/metadata/runtime.sha256"

[[ "$manifest_count" -gt 0 ]] || {
  echo "Runtime checksum manifest is empty: $RELEASE" >&2
  exit 1
}

if ! (
  cd "$RELEASE"
  sha256sum --quiet -c "$STRICT_MANIFEST"
); then
  echo "Immutable runtime checksum failed: $RELEASE" >&2
  exit 1
fi

mutable_changed=0
if [[ -s "$MUTABLE_MANIFEST" ]]; then
  set +e
  mutable_output="$(cd "$RELEASE" && sha256sum --quiet -c "$MUTABLE_MANIFEST" 2>&1)"
  mutable_status=$?
  set -e
  if [[ "$mutable_status" -ne 0 ]]; then
    mutable_changed="$(grep -c 'FAILED$' <<< "$mutable_output" || true)"
    [[ "$mutable_changed" -gt 0 ]] || {
      printf '%s\n' "$mutable_output" >&2
      echo "Could not classify legacy cache checksum failure." >&2
      exit 1
    }
  fi
fi

extra_cache_count=0
while IFS= read -r -d '' file; do
  path="${file#"$RELEASE/"}"
  if [[ -z "${MANIFEST_PATHS[$path]:-}" ]]; then
    if [[ "$INTEGRITY_VERSION" == "1" ]] && is_mutable_next_cache_path "$path"; then
      extra_cache_count=$((extra_cache_count + 1))
      continue
    fi
    echo "Unexpected runtime file: $path" >&2
    exit 1
  fi
done < <(find "$RELEASE/runtime" -type f -print0)

symlink_count=0
if [[ "$INTEGRITY_VERSION" == "2" ]]; then
  [[ -f "$RELEASE/metadata/runtime.symlinks" ]] || {
    echo "Version 2 release is missing its symlink manifest." >&2
    exit 1
  }
  while IFS= read -r -d '' link; do
    path="${link#"$RELEASE/"}"
    target="$(readlink "$link")"
    [[ "$path" != *$'\t'* && "$path" != *$'\n'* \
      && "$target" != *$'\t'* && "$target" != *$'\n'* ]] || {
      echo "Unsupported tab/newline in runtime symlink: $path" >&2
      exit 1
    }
    printf '%s\t%s\n' "$path" "$target"
  done < <(find "$RELEASE/runtime" -type l -print0) \
    | sort > "$TEMP_DIR/runtime.symlinks"
  if ! cmp -s "$RELEASE/metadata/runtime.symlinks" "$TEMP_DIR/runtime.symlinks"; then
    echo "Runtime symlink manifest failed: $RELEASE" >&2
    exit 1
  fi
  symlink_count="$(wc -l < "$TEMP_DIR/runtime.symlinks" | tr -d ' ')"
else
  runtime_real="$(readlink -f "$RELEASE/runtime")"
  while IFS= read -r -d '' link; do
    target_real="$(readlink -f "$link" || true)"
    [[ -n "$target_real" && -e "$target_real" \
      && ( "$target_real" == "$runtime_real" || "$target_real" == "$runtime_real/"* ) ]] || {
      echo "Legacy runtime symlink is broken or escapes the runtime: ${link#"$RELEASE/"}" >&2
      exit 1
    }
    symlink_count=$((symlink_count + 1))
  done < <(find "$RELEASE/runtime" -type l -print0)
fi

printf 'release_integrity=PASS\n'
printf 'release_id=%s\n' "$RELEASE_ID"
printf 'runtime_integrity_version=%s\n' "$INTEGRITY_VERSION"
printf 'manifest_files=%d\n' "$manifest_count"
printf 'runtime_symlinks=%d\n' "$symlink_count"
printf 'legacy_cache_manifest_files=%d\n' "$mutable_manifest_count"
printf 'legacy_cache_changed_files=%d\n' "$mutable_changed"
printf 'legacy_cache_extra_files=%d\n' "$extra_cache_count"

#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

RELEASE_ROOT="${MOBTRANSLATE_RELEASE_ROOT:-/mnt/donto-data/mobtranslate}"
KEEP_RELEASES="${MOBTRANSLATE_RELEASE_KEEP:-5}"
APPLY=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_RELEASE="$SCRIPT_DIR/verify-web-release.sh"
VERIFY_JOBS="${MOBTRANSLATE_RELEASE_VERIFY_JOBS:-1}"

usage() {
  cat <<'EOF'
Usage: prune-web-releases.sh [--apply] [--keep N] [--release-root PATH]

Dry-run is the default. Applied pruning always preserves the newest N releases,
the current target, and the previous rollback target. Before an old runtime is
retired, its release metadata and exact source snapshot are archived and hashed.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --dry-run)
      APPLY=0
      shift
      ;;
    --keep)
      [[ $# -ge 2 ]] || { echo "--keep requires a value." >&2; exit 2; }
      KEEP_RELEASES="$2"
      shift 2
      ;;
    --release-root)
      [[ $# -ge 2 ]] || { echo "--release-root requires a value." >&2; exit 2; }
      RELEASE_ROOT="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done
[[ -x "$VERIFY_RELEASE" ]] || {
  echo "Release verifier is missing or not executable: $VERIFY_RELEASE" >&2
  exit 1
}

[[ "$KEEP_RELEASES" =~ ^[0-9]+$ && "$KEEP_RELEASES" -ge 2 ]] || {
  echo "--keep must be an integer of at least 2." >&2
  exit 2
}
[[ "$VERIFY_JOBS" =~ ^[0-9]+$ && "$VERIFY_JOBS" -ge 1 && "$VERIFY_JOBS" -le 8 ]] || {
  echo "MOBTRANSLATE_RELEASE_VERIFY_JOBS must be an integer from 1 to 8." >&2
  exit 2
}

for command in cat cp find flock grep mkdir mktemp mv readlink rm sha256sum sort tar; do
  command -v "$command" >/dev/null || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

RELEASES="$RELEASE_ROOT/releases"
CURRENT="$RELEASE_ROOT/current"
PREVIOUS="$RELEASE_ROOT/previous"
ARCHIVE_ROOT="$RELEASE_ROOT/release-archive"
LOCK_FILE="$RELEASE_ROOT/.release-operation.lock"

[[ -d "$RELEASES" ]] || {
  echo "Release directory does not exist: $RELEASES" >&2
  exit 1
}

mkdir -p "$RELEASE_ROOT"
exec 9>"$LOCK_FILE"
flock -w 30 9 || {
  echo "Another release operation holds $LOCK_FILE." >&2
  exit 1
}
VERIFY_TMP="$(mktemp -d "$RELEASE_ROOT/.prune-verify.XXXXXX")"
trap 'rm -rf "$VERIFY_TMP"' EXIT

release_root_real="$(readlink -f "$RELEASES")"
current_real=""
previous_real=""
[[ -L "$CURRENT" ]] && current_real="$(readlink -f "$CURRENT" || true)"
[[ -L "$PREVIOUS" ]] && previous_real="$(readlink -f "$PREVIOUS" || true)"

mapfile -t release_ids < <(
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
    | while IFS= read -r release_id; do
        [[ "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$ ]] \
          && printf '%s\n' "$release_id"
      done \
    | LC_ALL=C sort -r
)

declare -A protected=()
for ((index = 0; index < ${#release_ids[@]} && index < KEEP_RELEASES; index++)); do
  protected["${release_ids[$index]}"]=1
done

for release_id in "${release_ids[@]}"; do
  release="$RELEASES/$release_id"
  release_real="$(readlink -f "$release")"
  if [[ "$release_real" == "$current_real" || "$release_real" == "$previous_real" ]]; then
    protected["$release_id"]=1
  fi
done

candidates=()
for release_id in "${release_ids[@]}"; do
  [[ -n "${protected[$release_id]:-}" ]] || candidates+=("$release_id")
done

# Preflight every candidate before changing any release. Verification is the
# expensive phase for legacy releases with duplicated assets, so run a bounded
# set concurrently. One malformed or corrupted runtime still stops all changes.
verification_pids=()
verification_waited=()
verification_failed=0

wait_for_verification() {
  local index="$1"
  local release_id="${candidates[$index]}"
  if ! wait "${verification_pids[$index]}"; then
    cat "$VERIFY_TMP/$release_id.err" >&2 || true
    echo "Release integrity verification failed: $RELEASES/$release_id" >&2
    verification_failed=1
  fi
  verification_waited[$index]=1
}

for index in "${!candidates[@]}"; do
  release_id="${candidates[$index]}"
  (
    release="$RELEASES/$release_id"
    release_real="$(readlink -f "$release")"
    [[ "$(dirname "$release_real")" == "$release_root_real" ]] || {
      echo "Release escapes the expected directory: $release" >&2
      exit 1
    }
    [[ -f "$release/release-runtime.env" \
      && -f "$release/metadata/release.txt" \
      && -f "$release/metadata/runtime.sha256" \
      && -f "$release/runtime/apps/web/server.js" ]] || {
        echo "Release metadata/runtime is incomplete: $release" >&2
        exit 1
      }
    grep -Fxq "release_id=$release_id" "$release/metadata/release.txt" || {
      echo "Release identity mismatch: $release" >&2
      exit 1
    }
    "$VERIFY_RELEASE" --allow-legacy-cache-drift "$release"
  ) > "$VERIFY_TMP/$release_id.txt" 2> "$VERIFY_TMP/$release_id.err" &
  verification_pids[$index]="$!"

  if (( index >= VERIFY_JOBS - 1 )); then
    wait_for_verification "$((index - VERIFY_JOBS + 1))"
  fi
done

for index in "${!candidates[@]}"; do
  [[ -n "${verification_waited[$index]:-}" ]] || wait_for_verification "$index"
done
[[ "$verification_failed" -eq 0 ]] || exit 1

if [[ "$APPLY" -eq 0 ]]; then
  for release_id in "${candidates[@]}"; do
    printf 'would_archive_and_remove\t%s\n' "$release_id"
  done
  printf 'summary\tmode=dry-run\ttotal=%d\tprotected=%d\tcandidates=%d\n' \
    "${#release_ids[@]}" "$(( ${#release_ids[@]} - ${#candidates[@]} ))" "${#candidates[@]}"
  exit 0
fi

mkdir -p "$ARCHIVE_ROOT"
archived=0
removed=0
for release_id in "${candidates[@]}"; do
  release="$RELEASES/$release_id"
  archive="$ARCHIVE_ROOT/$release_id.metadata.tar.gz"
  checksum="$archive.sha256"
  archive_tmp="$ARCHIVE_ROOT/.$release_id.metadata.tar.gz.$$"
  checksum_tmp="$ARCHIVE_ROOT/.$release_id.metadata.tar.gz.sha256.$$"
  retiring="$RELEASES/.retiring-$release_id"

  cp "$VERIFY_TMP/$release_id.txt" "$release/metadata/prune-integrity.txt"

  rm -f "$archive_tmp" "$checksum_tmp"
  tar \
    --sort=name \
    --mtime='UTC 1970-01-01' \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -C "$release" \
    -czf "$archive_tmp" \
    metadata release-runtime.env
  tar -tzf "$archive_tmp" >/dev/null
  tar -xOzf "$archive_tmp" metadata/release.txt \
    | grep -Fxq "release_id=$release_id" || {
      echo "Archived release identity mismatch: $release_id" >&2
      exit 1
    }
  archive_hash="$(sha256sum "$archive_tmp" | cut -d' ' -f1)"

  if [[ -e "$archive" || -e "$checksum" ]]; then
    [[ -f "$archive" && -f "$checksum" ]] || {
      echo "Incomplete existing archive pair for $release_id." >&2
      exit 1
    }
    existing_hash="$(sha256sum "$archive" | cut -d' ' -f1)"
    recorded_hash="$(cut -d' ' -f1 < "$checksum")"
    [[ "$archive_hash" == "$existing_hash" && "$existing_hash" == "$recorded_hash" ]] || {
      echo "Existing archive does not match release metadata: $release_id" >&2
      exit 1
    }
    rm -f "$archive_tmp"
  else
    printf '%s  %s\n' "$archive_hash" "$(basename "$archive")" > "$checksum_tmp"
    mv "$archive_tmp" "$archive"
    mv "$checksum_tmp" "$checksum"
    (
      cd "$ARCHIVE_ROOT"
      sha256sum --quiet -c "$(basename "$checksum")"
    )
    archived=$((archived + 1))
  fi

  [[ ! -e "$retiring" ]] || {
    echo "Retiring path already exists: $retiring" >&2
    exit 1
  }
  mv "$release" "$retiring"
  rm -rf --one-file-system -- "$retiring"
  [[ ! -e "$retiring" ]] || {
    echo "Could not remove retired runtime: $retiring" >&2
    exit 1
  }
  removed=$((removed + 1))
  printf 'archived_and_removed\t%s\t%s\n' "$release_id" "$archive_hash"
done

printf 'summary\tmode=apply\ttotal=%d\tprotected=%d\tarchived=%d\tremoved=%d\n' \
  "${#release_ids[@]}" "$(( ${#release_ids[@]} - ${#candidates[@]} ))" "$archived" "$removed"

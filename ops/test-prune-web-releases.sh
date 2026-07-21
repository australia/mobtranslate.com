#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRUNER="$SCRIPT_DIR/prune-web-releases.sh"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT

make_release() {
  local root="$1"
  local release_id="$2"
  local release="$root/releases/$release_id"
  mkdir -p \
    "$release/runtime/apps/web/.next-release-$release_id/server/app" \
    "$release/metadata"
  printf 'server %s\n' "$release_id" > "$release/runtime/apps/web/server.js"
  printf 'seed %s\n' "$release_id" \
    > "$release/runtime/apps/web/.next-release-$release_id/server/app/index.html"
  {
    printf 'release_id=%s\n' "$release_id"
    printf 'build_dist=.next-release-%s\n' "$release_id"
  } > "$release/metadata/release.txt"
  printf 'MOBTRANSLATE_RELEASE_ID=%s\n' "$release_id" > "$release/release-runtime.env"
  (
    cd "$release"
    find runtime -type f -print0 | sort -z | xargs -0 sha256sum \
      > metadata/runtime.sha256
  )
}

fixture="$TEMP_ROOT/fixture"
mkdir -p "$fixture/releases"
ids=(
  20260719T000001Z-aaaaaaaaaaaa
  20260719T000002Z-bbbbbbbbbbbb
  20260719T000003Z-cccccccccccc
  20260719T000004Z-dddddddddddd
  20260719T000005Z-eeeeeeeeeeee
  20260719T000006Z-ffffffffffff
  20260719T000007Z-111111111111
)
for release_id in "${ids[@]}"; do make_release "$fixture" "$release_id"; done
ln -s "$fixture/releases/${ids[6]}" "$fixture/current"
ln -s "$fixture/releases/${ids[0]}" "$fixture/previous"

dry_run="$($PRUNER --release-root "$fixture" --keep 3)"
[[ "$(find "$fixture/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)" -eq 7 ]]
[[ ! -e "$fixture/release-archive" ]]
grep -Fq $'summary\tmode=dry-run\ttotal=7\tprotected=4\tcandidates=3' <<< "$dry_run"

apply_run="$($PRUNER --release-root "$fixture" --keep 3 --apply)"
grep -Fq $'summary\tmode=apply\ttotal=7\tprotected=4\tarchived=3\tremoved=3' <<< "$apply_run"

for kept in "${ids[0]}" "${ids[4]}" "${ids[5]}" "${ids[6]}"; do
  [[ -d "$fixture/releases/$kept" ]]
done
for removed in "${ids[1]}" "${ids[2]}" "${ids[3]}"; do
  [[ ! -e "$fixture/releases/$removed" ]]
  archive="$fixture/release-archive/$removed.metadata.tar.gz"
  [[ -f "$archive" && -f "$archive.sha256" ]]
  (
    cd "$fixture/release-archive"
    sha256sum --quiet -c "$(basename "$archive.sha256")"
  )
  tar -tzf "$archive" | grep -Fxq 'metadata/runtime.sha256'
  tar -tzf "$archive" | grep -Fxq 'metadata/prune-integrity.txt'
  tar -xOzf "$archive" metadata/release.txt | grep -Fxq "release_id=$removed"
done

idempotent="$($PRUNER --release-root "$fixture" --keep 3 --apply)"
grep -Fq $'summary\tmode=apply\ttotal=4\tprotected=4\tarchived=0\tremoved=0' <<< "$idempotent"

corrupt="$TEMP_ROOT/corrupt"
mkdir -p "$corrupt/releases"
for release_id in "${ids[@]:0:4}"; do make_release "$corrupt" "$release_id"; done
ln -s "$corrupt/releases/${ids[3]}" "$corrupt/current"
ln -s "$corrupt/releases/${ids[2]}" "$corrupt/previous"
printf 'corrupted\n' >> "$corrupt/releases/${ids[0]}/runtime/apps/web/server.js"
if "$PRUNER" --release-root "$corrupt" --keep 2 --apply >/dev/null 2>&1; then
  echo "Corrupted release unexpectedly passed pruning preflight." >&2
  exit 1
fi
[[ -d "$corrupt/releases/${ids[0]}" && -d "$corrupt/releases/${ids[1]}" ]]
[[ ! -e "$corrupt/release-archive" ]]

cache_drift="$TEMP_ROOT/cache-drift"
mkdir -p "$cache_drift/releases"
for release_id in "${ids[@]:0:4}"; do make_release "$cache_drift" "$release_id"; done
ln -s "$cache_drift/releases/${ids[3]}" "$cache_drift/current"
ln -s "$cache_drift/releases/${ids[2]}" "$cache_drift/previous"
printf 'revalidated\n' \
  > "$cache_drift/releases/${ids[0]}/runtime/apps/web/.next-release-${ids[0]}/server/app/index.html"
printf 'generated\n' \
  > "$cache_drift/releases/${ids[0]}/runtime/apps/web/.next-release-${ids[0]}/server/app/new.html"
cache_run="$($PRUNER --release-root "$cache_drift" --keep 2 --apply)"
grep -Fq $'summary\tmode=apply\ttotal=4\tprotected=2\tarchived=2\tremoved=2' <<< "$cache_run"
tar -xOzf \
  "$cache_drift/release-archive/${ids[0]}.metadata.tar.gz" \
  metadata/prune-integrity.txt \
  | grep -Fxq 'legacy_cache_changed_files=1'

printf 'release-pruner tests passed\n'

#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFIER="$SCRIPT_DIR/verify-web-release.sh"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT

make_release() {
  local root="$1"
  local release_id="$2"
  local version="$3"
  local release="$root/$release_id"
  local build_dist=".next-release-$release_id"

  mkdir -p \
    "$release/runtime/apps/web/$build_dist/server/app" \
    "$release/runtime/node_modules/example" \
    "$release/metadata"
  printf 'server %s\n' "$release_id" > "$release/runtime/apps/web/server.js"
  printf 'seed %s\n' "$release_id" \
    > "$release/runtime/apps/web/$build_dist/server/app/index.html"
  printf 'module %s\n' "$release_id" > "$release/runtime/node_modules/example/index.js"
  ln -s node_modules/example "$release/runtime/example-module"
  {
    printf 'release_id=%s\n' "$release_id"
    printf 'build_dist=%s\n' "$build_dist"
    [[ "$version" == "2" ]] && printf 'runtime_integrity_version=2\n'
  } > "$release/metadata/release.txt"
  (
    cd "$release"
    find runtime -type f -print0 | sort -z | xargs -0 sha256sum
  ) > "$release/metadata/runtime.sha256"
  if [[ "$version" == "2" ]]; then
    (
      cd "$release"
      while IFS= read -r -d '' link; do
        printf '%s\t%s\n' "$link" "$(readlink "$link")"
      done < <(find runtime -type l -print0)
    ) | sort > "$release/metadata/runtime.symlinks"
  fi
}

v2_id="20260719T000001Z-aaaaaaaaaaaa"
make_release "$TEMP_ROOT" "$v2_id" 2
v2="$TEMP_ROOT/$v2_id"
"$VERIFIER" "$v2" | grep -Fxq 'runtime_integrity_version=2'

printf 'unexpected\n' \
  > "$v2/runtime/apps/web/.next-release-$v2_id/server/app/new.html"
if "$VERIFIER" "$v2" >/dev/null 2>&1; then
  echo "Version 2 release accepted an unexpected cache file." >&2
  exit 1
fi
rm "$v2/runtime/apps/web/.next-release-$v2_id/server/app/new.html"

rm "$v2/runtime/example-module"
ln -s apps/web "$v2/runtime/example-module"
if "$VERIFIER" "$v2" >/dev/null 2>&1; then
  echo "Version 2 release accepted a changed symlink." >&2
  exit 1
fi

legacy_id="20260719T000002Z-bbbbbbbbbbbb"
make_release "$TEMP_ROOT" "$legacy_id" 1
legacy="$TEMP_ROOT/$legacy_id"
legacy_cache="$legacy/runtime/apps/web/.next-release-$legacy_id/server/app"
printf 'generated\n' > "$legacy_cache/language.html"
"$VERIFIER" "$legacy" | grep -Fxq 'legacy_cache_extra_files=1'

printf 'revalidated\n' > "$legacy_cache/index.html"
if "$VERIFIER" "$legacy" >/dev/null 2>&1; then
  echo "Strict legacy verification accepted changed build-seed cache." >&2
  exit 1
fi
"$VERIFIER" --allow-legacy-cache-drift "$legacy" \
  | grep -Fxq 'legacy_cache_changed_files=1'

printf 'injected\n' > "$legacy_cache/injected.js"
if "$VERIFIER" --allow-legacy-cache-drift "$legacy" >/dev/null 2>&1; then
  echo "Legacy archival verification accepted an unexpected script." >&2
  exit 1
fi
rm "$legacy_cache/injected.js"

printf 'corrupted\n' >> "$legacy/runtime/apps/web/server.js"
if "$VERIFIER" --allow-legacy-cache-drift "$legacy" >/dev/null 2>&1; then
  echo "Legacy archival verification accepted changed executable code." >&2
  exit 1
fi

legacy_link_id="20260719T000003Z-cccccccccccc"
make_release "$TEMP_ROOT" "$legacy_link_id" 1
legacy_link="$TEMP_ROOT/$legacy_link_id"
rm "$legacy_link/runtime/example-module"
ln -s /etc/passwd "$legacy_link/runtime/example-module"
if "$VERIFIER" "$legacy_link" >/dev/null 2>&1; then
  echo "Legacy verification accepted an escaping symlink." >&2
  exit 1
fi

printf 'release-integrity tests passed\n'

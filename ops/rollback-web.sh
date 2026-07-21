#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_ROOT="${MOBTRANSLATE_RELEASE_ROOT:-/mnt/donto-data/mobtranslate}"
CURRENT="$RELEASE_ROOT/current"
PREVIOUS="$RELEASE_ROOT/previous"
SERVICE="mobtranslate-web.service"
TARGET="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_RELEASE="$SCRIPT_DIR/verify-web-release.sh"

for command in flock readlink sha256sum; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done
[[ -x "$VERIFY_RELEASE" ]] || {
  echo "Release verifier is missing or not executable: $VERIFY_RELEASE" >&2
  exit 1
}

mkdir -p "$RELEASE_ROOT"
exec 8>"$RELEASE_ROOT/.release-operation.lock"
flock -w 30 8 || {
  echo "Another deploy, rollback, or release-prune operation is active." >&2
  exit 1
}

if [[ -z "$TARGET" ]]; then
  [[ -L "$PREVIOUS" ]] || { echo "No previous immutable release is recorded." >&2; exit 1; }
  TARGET="$(readlink -f "$PREVIOUS")"
elif [[ "$TARGET" != /* ]]; then
  TARGET="$RELEASE_ROOT/releases/$TARGET"
fi

[[ -f "$TARGET/runtime/apps/web/server.js" ]] || {
  echo "Not a valid MobTranslate release: $TARGET" >&2
  exit 1
}
[[ -f "$TARGET/metadata/runtime.sha256" && -f "$TARGET/metadata/release.txt" ]] || {
  echo "Release metadata is incomplete: $TARGET" >&2
  exit 1
}
"$VERIFY_RELEASE" "$TARGET" || {
  echo "Release integrity verification failed: $TARGET" >&2
  exit 1
}

OLD="$(readlink -f "$CURRENT")"
RELEASE_ID="$(awk -F= '$1 == "MOBTRANSLATE_RELEASE_ID" { print $2 }' "$TARGET/release-runtime.env")"
STATIC_ASSET_URL="$(awk -F= '$1 == "static_asset_url" { print $2 }' "$TARGET/metadata/release.txt")"
[[ -n "$RELEASE_ID" && "$STATIC_ASSET_URL" == /_next/static/* ]] || {
  echo "Release identity or static-asset metadata is invalid: $TARGET" >&2
  exit 1
}

atomic_link() {
  local target="$1"
  local link="$2"
  local temporary="$RELEASE_ROOT/.rollback-link-$$-$RANDOM"
  ln -s "$target" "$temporary"
  mv -Tf "$temporary" "$link"
}

atomic_link "$TARGET" "$CURRENT"
sudo systemctl restart "$SERVICE"

ready=0
for _ in $(seq 1 45); do
  if response="$(curl -fsS 'http://127.0.0.1:3300/api/health' 2>/dev/null)" \
    && grep -q '"status":"ok"' <<<"$response" \
    && grep -q "\"release\":\"$RELEASE_ID\"" <<<"$response" \
    && curl -fsS 'http://127.0.0.1:3300/' >/dev/null \
    && curl -fsS "http://127.0.0.1:3300$STATIC_ASSET_URL" >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "Rollback target failed readiness; restoring $OLD." >&2
  atomic_link "$OLD" "$CURRENT"
  sudo systemctl restart "$SERVICE"
  exit 1
fi

public_ready=0
for _ in $(seq 1 30); do
  if response="$(curl -fsS 'https://mobtranslate.com/api/health' 2>/dev/null)" \
    && grep -q '"status":"ok"' <<<"$response" \
    && grep -q "\"release\":\"$RELEASE_ID\"" <<<"$response" \
    && curl -fsS 'https://mobtranslate.com/' >/dev/null \
    && curl -fsS "https://mobtranslate.com$STATIC_ASSET_URL" >/dev/null; then
    public_ready=1
    break
  fi
  sleep 1
done

if [[ "$public_ready" -ne 1 ]]; then
  echo "Rollback target failed public readiness; restoring $OLD." >&2
  atomic_link "$OLD" "$CURRENT"
  sudo systemctl restart "$SERVICE"
  exit 1
fi

atomic_link "$OLD" "$PREVIOUS"
echo "Rolled back to $RELEASE_ID"

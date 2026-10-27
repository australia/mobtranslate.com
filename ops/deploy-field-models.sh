#!/usr/bin/env bash
# Build, test and install field-modeld (services/field-models), then restart it.
# Releases are immutable directories; `current` is switched atomically.
set -Eeuo pipefail
umask 027

REPO_ROOT="${MOBTRANSLATE_REPO_ROOT:-/mnt/donto-data/workspace/mobtranslate.com}"
CRATE="$REPO_ROOT/services/field-models"
ROOT="/mnt/donto-data/field-models"
DATA_DIR="/mnt/donto-data/donto-resources/research/field-models"
ENV_FILE="/opt/mobtranslate/field-models.env"
UNIT_SOURCE="$REPO_ROOT/ops/systemd/field-modeld.service"
UNIT_TARGET="/etc/systemd/system/field-modeld.service"
TOOLCHAIN="${FIELD_MODELS_TOOLCHAIN:-1.88.0}"
# Build output can live off the data disk when it is short of space.
TARGET_DIR="${CARGO_TARGET_DIR:-$CRATE/target}"

for command in cargo gdalwarp gdalbuildvrt curl sha256sum; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done
[[ -r "$ENV_FILE" ]] || { echo "Missing $ENV_FILE (FIELD_MODELS_TOKEN=...)" >&2; exit 1; }

COMMIT="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"
RELEASE="$ROOT/releases/$(date -u +%Y%m%dT%H%M%SZ)-$COMMIT"

cd "$CRATE"
nice -n 10 cargo "+$TOOLCHAIN" test --release --locked
nice -n 10 cargo "+$TOOLCHAIN" build --release --locked

[[ -d "$ROOT" ]] || sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0750 "$ROOT"
mkdir -p "$RELEASE/bin" "$RELEASE/registry" "$DATA_DIR"
chmod 700 "$DATA_DIR"
install -m 0755 "$TARGET_DIR/release/field-modeld" "$RELEASE/bin/field-modeld"
install -m 0644 registry/*.json "$RELEASE/registry/"
( cd "$RELEASE" && sha256sum bin/field-modeld registry/*.json > SHA256SUMS )

ln -sfn "$RELEASE" "$ROOT/current.next"
mv -Tf "$ROOT/current.next" "$ROOT/current"

sudo install -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
sudo systemctl daemon-reload
sudo systemctl enable field-modeld.service >/dev/null
sudo systemctl restart field-modeld.service

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:7877/health >/dev/null 2>&1; then
    echo "field-modeld is up: $RELEASE"
    curl -fsS http://127.0.0.1:7877/health; echo
    exit 0
  fi
  sleep 1
done
echo "field-modeld did not become healthy" >&2
sudo journalctl -u field-modeld.service -n 40 --no-pager >&2
exit 1

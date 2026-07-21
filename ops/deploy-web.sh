#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

REPO_ROOT="${MOBTRANSLATE_REPO_ROOT:-/mnt/donto-data/workspace/mobtranslate.com}"
WEB_ROOT="$REPO_ROOT/apps/web"
RELEASE_ROOT="${MOBTRANSLATE_RELEASE_ROOT:-/mnt/donto-data/mobtranslate}"
ENV_FILE="${MOBTRANSLATE_ENV_FILE:-/opt/mobtranslate/web.env}"
RELEASES="$RELEASE_ROOT/releases"
CURRENT="$RELEASE_ROOT/current"
PREVIOUS="$RELEASE_ROOT/previous"
SERVICE="mobtranslate-web.service"
UNIT_SOURCE="$REPO_ROOT/ops/systemd/mobtranslate-web.service"
UNIT_TARGET="/etc/systemd/system/mobtranslate-web.service"
PRUNE_SERVICE_SOURCE="$REPO_ROOT/ops/systemd/mobtranslate-operational-prune.service"
PRUNE_SERVICE_TARGET="/etc/systemd/system/mobtranslate-operational-prune.service"
PRUNE_TIMER_SOURCE="$REPO_ROOT/ops/systemd/mobtranslate-operational-prune.timer"
PRUNE_TIMER_TARGET="/etc/systemd/system/mobtranslate-operational-prune.timer"
RELEASE_PRUNE_SCRIPT="$REPO_ROOT/ops/prune-web-releases.sh"
RELEASE_PRUNE_TEST="$REPO_ROOT/ops/test-prune-web-releases.sh"
RELEASE_VERIFY_SCRIPT="$REPO_ROOT/ops/verify-web-release.sh"
RELEASE_VERIFY_TEST="$REPO_ROOT/ops/test-web-release-integrity.sh"
SCHEMA_VERSION="$(find "$WEB_ROOT/db/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort | tail -1)"
GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-${GIT_COMMIT:0:12}"
FINAL_RELEASE="$RELEASES/$RELEASE_ID"
STAGING="$RELEASES/.staging-$RELEASE_ID"
BUILD_DIST=".next-release-$RELEASE_ID"
CANDIDATE_PID=""
NEXT_ENV_FILE="$WEB_ROOT/next-env.d.ts"
NEXT_ENV_BACKUP=""

[[ -r "$ENV_FILE" ]] || { echo "Runtime environment file is not readable: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cleanup() {
  if [[ -n "$CANDIDATE_PID" ]] && kill -0 "$CANDIDATE_PID" 2>/dev/null; then
    kill "$CANDIDATE_PID" 2>/dev/null || true
    wait "$CANDIDATE_PID" 2>/dev/null || true
  fi
  if [[ -n "$NEXT_ENV_BACKUP" && -f "$NEXT_ENV_BACKUP" ]]; then
    cp -p "$NEXT_ENV_BACKUP" "$NEXT_ENV_FILE"
  fi
  rm -rf "$WEB_ROOT/$BUILD_DIST"
  if [[ -d "$STAGING" ]]; then rm -rf "$STAGING"; fi
}
trap cleanup EXIT

for command in git pnpm node rsync curl sha256sum tar find flock sort xargs ss; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done

[[ -d "$REPO_ROOT/.git" ]] || { echo "Repository not found: $REPO_ROOT" >&2; exit 1; }
[[ -x "$RELEASE_PRUNE_SCRIPT" && -x "$RELEASE_PRUNE_TEST" \
  && -x "$RELEASE_VERIFY_SCRIPT" && -x "$RELEASE_VERIFY_TEST" ]] || {
  echo "Release integrity/retention scripts are missing or not executable." >&2
  exit 1
}
[[ ! -e "$FINAL_RELEASE" && ! -e "$STAGING" ]] || {
  echo "Release path already exists: $RELEASE_ID" >&2
  exit 1
}

mkdir -p "$RELEASES"
available_kb="$(df --output=avail "$RELEASE_ROOT" 2>/dev/null | tail -1 | tr -d ' ')"
if [[ -z "$available_kb" || "$available_kb" -lt 10485760 ]]; then
  echo "At least 10 GiB free is required on $RELEASE_ROOT." >&2
  exit 1
fi

mkdir -p "$STAGING/metadata"

capture_source() {
  local destination="$1"
  mkdir -p "$destination"
  git -C "$REPO_ROOT" diff --binary HEAD > "$destination/tracked.patch"
  git -C "$REPO_ROOT" status --porcelain=v1 -z > "$destination/status.z"
  git -C "$REPO_ROOT" ls-files --others --exclude-standard -z -- . \
    ":(exclude)apps/web/$BUILD_DIST/**" \
    | sort -z > "$destination/untracked-files.z"
  if [[ -s "$destination/untracked-files.z" ]]; then
    (
      cd "$REPO_ROOT"
      xargs -0 -r sha256sum -- < "$destination/untracked-files.z"
    ) > "$destination/untracked.sha256"
  else
    : > "$destination/untracked.sha256"
  fi
  (
    cd "$destination"
    sha256sum tracked.patch untracked.sha256 | sha256sum | cut -d' ' -f1
  ) > "$destination/source.sha256"
}

capture_source "$STAGING/metadata/source-before"
SOURCE_SHA256="$(cat "$STAGING/metadata/source-before/source.sha256")"
[[ -f "$NEXT_ENV_FILE" ]] || { echo "Missing generated Next.js type reference: $NEXT_ENV_FILE" >&2; exit 1; }
NEXT_ENV_BACKUP="$STAGING/metadata/next-env.d.ts.before"
cp -p "$NEXT_ENV_FILE" "$NEXT_ENV_BACKUP"
if [[ -s "$STAGING/metadata/source-before/untracked-files.z" ]]; then
  (
    cd "$REPO_ROOT"
    tar --null --files-from="$STAGING/metadata/source-before/untracked-files.z" \
      -czf "$STAGING/metadata/untracked-source.tar.gz"
  )
fi
cp "$STAGING/metadata/source-before/tracked.patch" "$STAGING/metadata/source.patch"
cp "$STAGING/metadata/source-before/status.z" "$STAGING/metadata/source-status.z"
cp "$STAGING/metadata/source-before/untracked.sha256" "$STAGING/metadata/untracked.sha256"

cd "$REPO_ROOT"
"$RELEASE_PRUNE_TEST"
"$RELEASE_VERIFY_TEST"
pnpm --filter web db:migrate
pnpm --filter web db:migrate:check
NODE_ENV=test pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
NODE_ENV=production NEXT_DIST_DIR="$BUILD_DIST" NEXT_BUILD_CPUS="${NEXT_BUILD_CPUS:-2}" \
  pnpm --filter web build
cp -p "$NEXT_ENV_BACKUP" "$NEXT_ENV_FILE"

capture_source "$STAGING/metadata/source-after"
if ! cmp -s \
  "$STAGING/metadata/source-before/source.sha256" \
  "$STAGING/metadata/source-after/source.sha256"; then
  echo "Source changed during verification/build; refusing to publish a mixed release." >&2
  exit 1
fi

STANDALONE="$WEB_ROOT/$BUILD_DIST/standalone"
APP_RUNTIME="$STAGING/runtime/apps/web"
[[ -f "$STANDALONE/apps/web/server.js" ]] || {
  echo "Expected standalone entry was not produced: $STANDALONE/apps/web/server.js" >&2
  exit 1
}

mkdir -p "$STAGING/runtime"
cp -a "$STANDALONE/." "$STAGING/runtime/"
mkdir -p "$APP_RUNTIME/$BUILD_DIST" "$APP_RUNTIME/public"
cp -a "$WEB_ROOT/$BUILD_DIST/static" "$APP_RUNTIME/$BUILD_DIST/static"
rsync -a --delete --delete-excluded \
  --exclude='/downloads/' \
  --exclude='/word-img/' \
  --exclude='/wotd/' \
  "$WEB_ROOT/public/" "$APP_RUNTIME/public/"
for excluded_public_dir in downloads word-img wotd; do
  [[ ! -e "$APP_RUNTIME/public/$excluded_public_dir" ]] || {
    echo "Excluded public directory leaked into the release: $excluded_public_dir" >&2
    exit 1
  }
done

STATIC_ASSET_FILE="$(find "$APP_RUNTIME/$BUILD_DIST/static" -type f -name '*.css' -print -quit)"
[[ -n "$STATIC_ASSET_FILE" ]] || { echo "No built CSS asset was produced." >&2; exit 1; }
STATIC_ASSET_PREFIX="$APP_RUNTIME/$BUILD_DIST/static/"
STATIC_ASSET_URL="/_next/static/${STATIC_ASSET_FILE#"$STATIC_ASSET_PREFIX"}"

DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$STAGING/release-runtime.env" <<EOF
MOBTRANSLATE_RELEASE_ID=$RELEASE_ID
MOBTRANSLATE_SOURCE_SHA256=$SOURCE_SHA256
MOBTRANSLATE_SCHEMA_VERSION=$SCHEMA_VERSION
MOBTRANSLATE_DEPLOYED_AT=$DEPLOYED_AT
EOF

cat > "$STAGING/metadata/release.txt" <<EOF
release_id=$RELEASE_ID
git_commit=$GIT_COMMIT
source_sha256=$SOURCE_SHA256
schema_version=$SCHEMA_VERSION
node_version=$(node --version)
pnpm_version=$(pnpm --version)
deployed_at=$DEPLOYED_AT
build_dist=$BUILD_DIST
static_asset_url=$STATIC_ASSET_URL
runtime_integrity_version=2
runtime_cache_policy=memory_only_no_disk
EOF

(
  cd "$STAGING"
  find runtime -type f -print0 | sort -z | xargs -0 sha256sum
) > "$STAGING/metadata/runtime.sha256"
(
  cd "$STAGING"
  while IFS= read -r -d '' link; do
    printf '%s\t%s\n' "$link" "$(readlink "$link")"
  done < <(find runtime -type l -print0)
) | sort > "$STAGING/metadata/runtime.symlinks"

CANDIDATE_PORT=""
for port in $(seq 3390 3410); do
  if ! ss -H -ltn "sport = :$port" | grep -q .; then
    CANDIDATE_PORT="$port"
    break
  fi
done
[[ -n "$CANDIDATE_PORT" ]] || { echo "No candidate smoke-test port is free." >&2; exit 1; }

(
  cd "$APP_RUNTIME"
  export NODE_ENV=production
  export HOSTNAME=127.0.0.1
  export PORT="$CANDIDATE_PORT"
  export MOBTRANSLATE_RELEASE_ID="$RELEASE_ID"
  export MOBTRANSLATE_SOURCE_SHA256="$SOURCE_SHA256"
  export MOBTRANSLATE_SCHEMA_VERSION="$SCHEMA_VERSION"
  export MOBTRANSLATE_DEPLOYED_AT="$DEPLOYED_AT"
  export MOBTRANSLATE_RUNTIME_PUBLIC_DIR="$WEB_ROOT/public"
  export MOBTRANSLATE_REPO_ROOT="$REPO_ROOT"
  export MOBTRANSLATE_DICTIONARIES_ROOT="$REPO_ROOT/dictionaries"
  exec node server.js
) > "$STAGING/metadata/candidate.log" 2>&1 &
CANDIDATE_PID="$!"

candidate_ready=0
for _ in $(seq 1 60); do
  if ! kill -0 "$CANDIDATE_PID" 2>/dev/null; then break; fi
  if response="$(curl -fsS "http://127.0.0.1:$CANDIDATE_PORT/api/health" 2>/dev/null)" \
    && grep -q '"status":"ok"' <<<"$response" \
    && grep -q "\"release\":\"$RELEASE_ID\"" <<<"$response" \
    && curl -fsS "http://127.0.0.1:$CANDIDATE_PORT/" >/dev/null \
    && curl -fsS "http://127.0.0.1:$CANDIDATE_PORT$STATIC_ASSET_URL" >/dev/null; then
    candidate_ready=1
    break
  fi
  sleep 1
done
if [[ "$candidate_ready" -ne 1 ]]; then
  tail -100 "$STAGING/metadata/candidate.log" >&2 || true
  echo "Candidate release failed its private-port smoke test." >&2
  exit 1
fi
ps -o pid=,rss=,etimes=,cmd= -p "$CANDIDATE_PID" > "$STAGING/metadata/candidate-process.txt"
kill "$CANDIDATE_PID"
wait "$CANDIDATE_PID" || true
CANDIDATE_PID=""
if ! "$RELEASE_VERIFY_SCRIPT" "$STAGING" \
  > "$STAGING/metadata/runtime-integrity-after-candidate.txt"; then
  echo "Candidate smoke test mutated its immutable runtime." >&2
  exit 1
fi

exec 8>"$RELEASE_ROOT/.release-operation.lock"
flock -w 30 8 || {
  echo "Another deploy, rollback, or release-prune operation is active." >&2
  exit 1
}
[[ ! -e "$FINAL_RELEASE" ]] || {
  echo "Release path appeared while the candidate was building: $FINAL_RELEASE" >&2
  exit 1
}
mv "$STAGING" "$FINAL_RELEASE"
STAGING=""

OLD_RELEASE=""
if [[ -L "$CURRENT" ]]; then OLD_RELEASE="$(readlink -f "$CURRENT")"; fi
EXISTING_PREVIOUS=""
if [[ -L "$PREVIOUS" ]]; then EXISTING_PREVIOUS="$(readlink -f "$PREVIOUS" || true)"; fi
LEGACY_UNIT_BACKUP="$FINAL_RELEASE/metadata/previous-systemd-unit.service"
if [[ -f "$UNIT_TARGET" ]]; then sudo cat "$UNIT_TARGET" > "$LEGACY_UNIT_BACKUP"; fi

atomic_link() {
  local target="$1"
  local link="$2"
  local temporary="$RELEASE_ROOT/.link-$RELEASE_ID-$RANDOM"
  ln -s "$target" "$temporary"
  mv -Tf "$temporary" "$link"
}

atomic_link "$FINAL_RELEASE" "$CURRENT"
sudo install -o root -g root -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
sudo install -o root -g root -m 0644 "$PRUNE_SERVICE_SOURCE" "$PRUNE_SERVICE_TARGET"
sudo install -o root -g root -m 0644 "$PRUNE_TIMER_SOURCE" "$PRUNE_TIMER_TARGET"
sudo systemctl daemon-reload
sudo systemctl enable --now mobtranslate-operational-prune.timer

production_ready=0
if sudo systemctl restart "$SERVICE"; then
  for _ in $(seq 1 45); do
    if response="$(curl -fsS 'http://127.0.0.1:3300/api/health' 2>/dev/null)" \
      && grep -q '"status":"ok"' <<<"$response" \
      && grep -q "\"release\":\"$RELEASE_ID\"" <<<"$response"; then
      production_ready=1
      break
    fi
    sleep 1
  done
fi

restore_previous_runtime() {
  if [[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
    atomic_link "$OLD_RELEASE" "$CURRENT"
  elif [[ -s "$LEGACY_UNIT_BACKUP" ]]; then
    sudo install -o root -g root -m 0644 "$LEGACY_UNIT_BACKUP" "$UNIT_TARGET"
    sudo systemctl daemon-reload
  fi
  sudo systemctl restart "$SERVICE" || true
}

if [[ "$production_ready" -ne 1 ]]; then
  echo "Production readiness failed; restoring the previous runtime." >&2
  restore_previous_runtime
  exit 1
fi

public_ready=0
DOWNLOAD_PROBE_FILE="$(find "$WEB_ROOT/public/downloads" -maxdepth 1 -type f -name '*.apk' -printf '%f\n' | LC_ALL=C sort | head -1)"
for _ in $(seq 1 30); do
  download_ready=1
  if [[ -n "$DOWNLOAD_PROBE_FILE" ]] \
    && ! curl -fsSI "https://mobtranslate.com/downloads/$DOWNLOAD_PROBE_FILE" >/dev/null 2>&1; then
    download_ready=0
  fi
  if response="$(curl -fsS 'https://mobtranslate.com/api/health' 2>/dev/null)" \
    && grep -q '"status":"ok"' <<<"$response" \
    && grep -q "\"release\":\"$RELEASE_ID\"" <<<"$response" \
    && curl -fsS 'https://mobtranslate.com/' >/dev/null \
    && curl -fsS "https://mobtranslate.com$STATIC_ASSET_URL" >/dev/null \
    && [[ "$download_ready" -eq 1 ]]; then
    public_ready=1
    printf '%s\n' "$response" > "$FINAL_RELEASE/metadata/public-health.json"
    break
  fi
  sleep 1
done
if [[ "$public_ready" -ne 1 ]]; then
  echo "Public readiness failed; restoring the previous runtime." >&2
  restore_previous_runtime
  exit 1
fi

if ! "$RELEASE_VERIFY_SCRIPT" "$FINAL_RELEASE" \
  > "$FINAL_RELEASE/metadata/runtime-integrity-after-public-smoke.txt"; then
  echo "Published smoke test mutated the immutable runtime; restoring the previous release." >&2
  restore_previous_runtime
  exit 1
fi

if [[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
  if "$RELEASE_VERIFY_SCRIPT" "$OLD_RELEASE" \
    > "$FINAL_RELEASE/metadata/previous-release-integrity.txt"; then
    atomic_link "$OLD_RELEASE" "$PREVIOUS"
  else
    echo "Warning: the former current release is not rollback-safe." >&2
    if [[ -n "$EXISTING_PREVIOUS" && -d "$EXISTING_PREVIOUS" ]] \
      && "$RELEASE_VERIFY_SCRIPT" "$EXISTING_PREVIOUS" \
        > "$FINAL_RELEASE/metadata/preserved-previous-release-integrity.txt"; then
      echo "Preserved and verified the existing previous rollback target." >&2
    else
      echo "Warning: no verified automated rollback target is available." >&2
    fi
  fi
fi

sudo systemctl is-active --quiet "$SERVICE"
sudo systemctl show "$SERVICE" \
  --property=MainPID,MemoryCurrent,MemoryPeak,NRestarts,ActiveState,SubState \
  > "$FINAL_RELEASE/metadata/systemd-state.txt"

flock -u 8
if ! "$RELEASE_PRUNE_SCRIPT" \
  --apply \
  --keep "${MOBTRANSLATE_RELEASE_KEEP:-5}" \
  > "$FINAL_RELEASE/metadata/release-prune.log" 2>&1; then
  echo "Warning: release retention failed; the published release remains active." >&2
  tail -100 "$FINAL_RELEASE/metadata/release-prune.log" >&2 || true
fi

echo "Published $RELEASE_ID"
echo "Current: $FINAL_RELEASE"
echo "Rollback: $REPO_ROOT/ops/rollback-web.sh"

#!/usr/bin/env bash
set -euo pipefail

umask 077

: "${DATABASE_URL:?DATABASE_URL must be supplied by the service EnvironmentFile}"

BACKUP_DIR="${MOBTRANSLATE_BACKUP_DIR:-/mnt/donto-data/backups}"
KEEP="${MOBTRANSLATE_BACKUP_KEEP:-14}"

if [[ ! "$KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "invalid MOBTRANSLATE_BACKUP_KEEP: $KEEP" >&2
  exit 2
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  install -d -m 2775 "$BACKUP_DIR"
fi
if [[ ! -w "$BACKUP_DIR" ]]; then
  echo "backup directory is not writable: $BACKUP_DIR" >&2
  exit 1
fi
exec 9>"$BACKUP_DIR/.mobtranslate-db-backup.lock"
if ! flock -n 9; then
  echo 'mobtranslate backup already running'
  exit 0
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="mobtranslate-daily-${stamp}.dump"
temporary="$BACKUP_DIR/.${name}.part"
final="$BACKUP_DIR/$name"
checksum="$final.sha256"

cleanup() {
  rm -f -- "$temporary" "$temporary.sha256"
}
trap cleanup EXIT

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$temporary"

test -s "$temporary"
pg_restore --list "$temporary" >/dev/null
mv -- "$temporary" "$final"
sha256sum "$final" >"$temporary.sha256"
mv -- "$temporary.sha256" "$checksum"
sha256sum --check --status "$checksum"

mapfile -t backups < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'mobtranslate-daily-*.dump' -printf '%f\n' \
    | sort -r
)
for ((index = KEEP; index < ${#backups[@]}; index += 1)); do
  obsolete="$BACKUP_DIR/${backups[$index]}"
  rm -f -- "$obsolete" "$obsolete.sha256"
done

printf 'backup=%s bytes=%s sha256=%s retained=%s\n' \
  "$final" \
  "$(stat -c %s "$final")" \
  "$(sha256sum "$final" | cut -d' ' -f1)" \
  "$((${#backups[@]} < KEEP ? ${#backups[@]} : KEEP))"

#!/usr/bin/env bash
# Nightly logical backup of the Binchen Coolify Postgres container.
#
# - Runs as user `deploy` on the Hetzner box (188.245.40.74).
# - Dumps the `binchen` database via `docker exec` against the running
#   Coolify-managed Postgres container (UUID rqh57h1ohsowasr6eheqz0dr).
# - Writes a compressed custom-format dump to /home/deploy/backups/bilulu-postgres/.
# - Retains 14 days of dumps, prunes older.
# - Logs one line per run to /home/deploy/backups/bilulu-postgres/.log.
#
# BIL-1548 (Backups). Restore path documented in infra/RUNBOOK.md.
set -euo pipefail

CONTAINER="rqh57h1ohsowasr6eheqz0dr"
DB_USER="binchen"
DB_NAME="binchen"
BACKUP_DIR="/home/deploy/backups/bilulu-postgres"
RETENTION_DAYS=14
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$BACKUP_DIR/.log"

mkdir -p "$BACKUP_DIR"

# --- take dump ---
DUMP="$BACKUP_DIR/binchen-$STAMP.dump"
if docker exec -e PGPASSWORD_UNUSED=1 "$CONTAINER" \
     pg_dump -U "$DB_USER" -Fc --no-owner --no-privileges "$DB_NAME" \
     > "$DUMP.partial"; then
  mv "$DUMP.partial" "$DUMP"
  SIZE_BYTES="$(stat -c %s "$DUMP")"
  echo "$STAMP OK $DUMP size=${SIZE_BYTES}B" >> "$LOG"
else
  rc=$?
  rm -f "$DUMP.partial"
  echo "$STAMP FAIL pg_dump rc=$rc" >> "$LOG"
  exit "$rc"
fi

# --- retention ---
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'binchen-*.dump' -mtime "+$RETENTION_DAYS" -print -delete >> "$LOG" 2>&1 || true
